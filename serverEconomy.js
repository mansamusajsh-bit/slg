// ============================================================
// serverEconomy.js — 서버 권위 경제 연결부 (지갑 미러 · 거래 아웃박스 · 동기화)
// 사용법: <script src="serverEconomy.js"></script> (game.js 다음, nationShares.js / fedSystem.js 앞)
//
// 서버(supabase-economy.sql)가 골드 잔액 · 물가 · 금리 · 지분 · 대출 · 경매의 원본이다.
// 브라우저의 state.run.gold 는 "서버 잔액 + 아직 서버가 확인하지 않은 내 거래"의 미러일 뿐이다.
//
//  * 골드가 줄면(소비) game.js 의 설정자가 Wallet.onGoldChange 로 알린다 → 아웃박스에 쌓았다가 서버로 보낸다.
//  * 골드가 느는 곳(전리품·보상·이벤트·매각)은 Wallet.earn(종류, 금액, ref) 로 종류를 밝혀야 한다. 서버가 종류별 상한을 검증한다.
//    종류 없이 늘어난 골드(= 개발자 도구로 고친 값 등)는 서버가 거절하고, 다음 동기화 때 서버 잔액으로 되돌아온다.
//  * 대출·경매·지분 같은 금융 거래는 서버 함수를 직접 부른다 (call). 서버가 잔액을 바꾸고 돌려준 값으로 미러를 맞춘다.
//  * 서버가 없거나(오프라인 · 스키마 미설치) 로그인하지 않았으면 enabled=false — 기존처럼 이 탭 안에서만 돈다.
//
// 아웃박스(state.run.walletOutbox)는 세이브에 같이 저장되고, 거래 id 로 서버가 중복을 걸러서 재전송해도 안전하다.
// ============================================================

(function (global) {
  'use strict';

  const FLUSH_DELAY_MS = 700;
  const MAX_BATCH = 200;
  const SYNC_MIN_MS = 15 * 1000;
  const FORCE_MIN_MS = 2500;
  const INBOX_DONE_MAX = 100;
  const RETRY_STEPS_MS = [2000, 5000, 15000, 30000];

  const SE = { enabled: false, status: 'idle', snapshot: null, offsetMs: 0, error: null, lastSyncAt: 0 };

  const bridge = () => global.SupabaseBridge;
  const getState = () => (typeof state !== 'undefined' ? state : null);
  const run = () => { const s = getState(); return s && s.run ? s.run : null; };
  const log = (msg, type = 'gold') => { if (typeof addLog === 'function') addLog(msg, type); };
  const toast = (msg, type) => global.UI && global.UI.showToast && global.UI.showToast(msg, type);
  const uuid = () => (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  const commanderName = () => { const s = getState(); return (s && s.commander && s.commander.name) || '지휘관'; };
  const localLoop = () => { const s = getState(); return Number(s && s.player && s.player.loopCount) || 0; };

  // ---- 서버 호출 직렬화 (동기화·아웃박스·액션이 겹치면 미러가 어긋난다) ----
  let chain = Promise.resolve();
  function enqueue(fn) {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  }

  async function rpc(name, args) {
    const b = bridge();
    if (!b || !b.rpc) throw new Error('서버에 연결되어 있지 않습니다.');
    return b.rpc(name, args || {});
  }

  const isMissingFunction = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|schema cache/i.test(String(e.message || '')) || e.status === 404);

  // ============================================================
  // 지갑 미러
  // ============================================================
  const SPEND_KINDS = new Set(['spend', 'adjust', 'forfeit']);
  function outbox() {
    const r = run();
    if (!r) return [];
    if (!Array.isArray(r.walletOutbox)) r.walletOutbox = [];
    return r.walletOutbox;
  }
  const signed = (t) => (SPEND_KINDS.has(t.kind) ? -1 : 1) * (Number(t.amount) || 0);
  const pendingSum = (box) => (box || outbox()).reduce((a, t) => a + signed(t), 0);

  function updateGoldUi() {
    const s = getState();
    if (!s) return;
    ['ui-gold', 'strat-gold'].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = `${s.gold}G`; });
    if (global.FedSystem && global.FedSystem.updateBadges) global.FedSystem.updateBadges();
  }

  /** 서버 잔액 + 서버가 아직 모르는 내 거래 = 화면에 보이는 골드 */
  function reconcile(serverBalance) {
    const r = run();
    if (!r || !Number.isFinite(Number(serverBalance))) return;
    const g = Math.max(0, Number(serverBalance) + pendingSum());
    if (r.gold !== g) {
      if (typeof setGoldRaw === 'function') setGoldRaw(g); else r.gold = g;
      updateGoldUi();
    }
  }

  let flushTimer = null;
  let retryIdx = 0;
  function scheduleFlush(delay) {
    if (!SE.enabled || flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; enqueue(flushNow).catch(() => {}); }, delay == null ? FLUSH_DELAY_MS : delay);
  }

  const REASONS = {
    insufficient: '서버 잔액 부족', over_cap: '건당 상한 초과', rate_limited: '시간당 수입 상한', already_claimed: '이미 받은 보상',
    ref_required: '보상 식별자 없음', unknown_kind: '허용되지 않는 수입', bad_tx: '잘못된 거래', bad_ref: '회차 불일치'
  };

  function pushTx(kind, amount, ref) {
    const amt = Math.floor(Number(amount) || 0);
    if (!(amt > 0)) return;
    const tx = { id: uuid(), kind, amount: amt };
    if (ref != null) tx.ref = String(ref).slice(0, 64);
    outbox().push(tx);
    scheduleFlush();
  }

  // 서버 회차가 내 회차보다 뒤처졌으면(회귀 직후 네트워크 실패 등) 먼저 따라잡는다
  let serverLoop = null;
  async function catchUpLoop() {
    for (let i = 0; i < 8; i++) {
      const local = localLoop();
      if (serverLoop == null || local <= serverLoop) return;
      const r = await rpc('slg_loop_return', { p_new_loop: local });
      if (r && r.ok === false) { if (/너무 빨리/.test(r.error || '')) await new Promise((res) => setTimeout(res, 1500)); else return; }
      serverLoop = (r && Number.isFinite(r.loop)) ? r.loop : serverLoop + 1;
    }
  }

  async function flushNow() {
    if (!SE.enabled) return;
    const r = run();
    if (!r) return;
    const box = outbox();
    if (!box.length) return;
    try {
      await catchUpLoop();
      const sent = box.slice(0, MAX_BATCH);
      const res = await rpc('slg_wallet_apply', { p_txs: sent });
      const ids = new Set(sent.map((t) => t.id));
      r.walletOutbox = (r.walletOutbox || []).filter((t) => !ids.has(t.id));
      retryIdx = 0;
      if (run() === r) reconcile(res.balance);
      const bad = (res.results || []).filter((x) => x.ok === false);
      if (bad.length) {
        const why = [...new Set(bad.map((x) => REASONS[x.reason] || x.reason))].join(', ');
        log(`⚠️ [서버 검증] 거래 ${bad.length}건이 거절되었습니다 (${why}). 골드가 서버 기준으로 조정됩니다.`, 'warning');
        toast(`⚠️ 서버가 거래 ${bad.length}건을 거절했습니다 (${why})`, 'warning');
      }
      if ((r.walletOutbox || []).length) scheduleFlush(50);
      if (typeof saveGameState === 'function') saveGameState(true);
    } catch (e) {
      console.warn('[ServerEconomy] 거래 전송 실패 — 다시 시도합니다.', e);
      const wait = RETRY_STEPS_MS[Math.min(retryIdx++, RETRY_STEPS_MS.length - 1)];
      scheduleFlush(wait);
    }
  }

  const Wallet = {
    ctx: null,
    /** game.js 의 state.gold 설정자가 부른다. old → nu 로 바뀌는 중 (아직 미러에 반영되기 전 값 old). */
    onGoldChange(old, nu) {
      const delta = nu - old;
      if (!Number.isFinite(delta)) return;
      if (!SE.enabled) {
        if (delta < 0 && global.FedSystem && global.FedSystem.trackSpend) global.FedSystem.trackSpend(-delta);
        return;
      }
      if (delta < 0) {
        const c = Wallet.ctx;
        pushTx(c && SPEND_KINDS.has(c.kind) ? c.kind : 'spend', -delta, c && c.ref);
      } else if (delta > 0) {
        const c = Wallet.ctx;
        // 종류를 밝히지 않은 증가는 서버가 거절한다 (earn_unknown) — 다음 정산 때 서버 잔액으로 돌아온다
        pushTx(c && String(c.kind).startsWith('earn_') ? c.kind : 'earn_unknown', delta, c && c.ref);
      }
    },
    /** 골드를 번다. kind: earn_loot | earn_reward | earn_event | earn_sell. ref: 보상 식별자(전투 id · 노드 id) */
    earn(kind, amount, ref) {
      const s = getState();
      const amt = Math.floor(Number(amount) || 0);
      if (!s || !(amt > 0)) return 0;
      const prev = Wallet.ctx;
      Wallet.ctx = { kind, ref };
      try { s.gold += amt; } finally { Wallet.ctx = prev; }
      return amt;
    },
    /** 턴 되돌리기: 골드를 그 시점 값으로 되돌린다. 쓴 만큼만 서버가 돌려준다. */
    rewindTo(prevGold) {
      const s = getState();
      if (!s) return;
      const cur = Number(s.gold) || 0;
      const target = Math.max(0, Math.floor(Number(prevGold) || 0));
      if (SE.enabled && target !== cur) {
        if (target < cur) pushTx('adjust', cur - target, 'rewind');
        else pushTx('earn_rewind', target - cur, 'rewind');
      }
      if (typeof setGoldRaw === 'function') setGoldRaw(target); else s.run.gold = target;
    },
    /** 새 런이 만들어진 직후 (회귀): 비상금 카드의 골드는 서버가 회차당 한 번만 인정한다 */
    afterRunCreated() {
      const r = run();
      if (!SE.enabled || !r) return;
      r.walletOutbox = [];
      if (r.loopReward && r.loopReward.type === 'stash') pushTx('earn_stash', (typeof STASH_GOLD !== 'undefined' ? STASH_GOLD : 100), `loop:${localLoop()}`);
    },
    /** DEV 패널의 골드 조정. 서버 경제에서는 관리자 계정(slg_admins)만 가능하다. */
    devAdjust(delta) {
      const s = getState();
      const d = Math.trunc(Number(delta) || 0);
      if (!s || !d) return Promise.resolve(false);
      if (!SE.enabled) { if (d > 0) s.gold += d; else s.gold = Math.max(0, s.gold + d); return Promise.resolve(true); }
      if (!(SE.snapshot && SE.snapshot.player && SE.snapshot.player.admin)) {
        toast('⚠️ 서버 경제에서는 관리자 계정만 골드를 조정할 수 있습니다.', 'warning');
        return Promise.resolve(false);
      }
      return call('slg_admin_adjust', { p_delta: d }).then((r) => !!(r && r.ok));
    },
    flush() { return enqueue(flushNow); },
    pendingSum
  };

  // ============================================================
  // 동기화
  // ============================================================
  const listeners = new Set();
  let ackEvents = 0;
  let ackInbox = [];
  let lastEventId = 0;
  let syncPromise = null;

  function eventText(e) {
    const p = e.payload || {};
    switch (e.kind) {
      case 'tax': {
        const by = Object.entries(p.byRegion || {}).map(([id, g]) => `${(global.REGIONS && global.REGIONS[id] ? global.REGIONS[id].name.ko : id)} ${g}G`).join(', ');
        return [`🏛️ [세금 정산] ${p.hours}시간 주기 ${p.count}회분 +${p.total}G (${by})`, 'gold', `🏛️ 세금 정산 +${p.total}G`, 'success'];
      }
      case 'share_payout': return [`💰 [지분 매각] ${(global.REGIONS && global.REGIONS[p.regionId] ? global.REGIONS[p.regionId].title.ko : p.regionId)} 지분 일부가 다른 플레이어에게 매입됨 — 대금 +${p.gold}G`, 'gold'];
      case 'loan_interest': return [`🏦 [대출 이자] ${p.name} 담보 대출 이자 -${p.amount}G (${p.done}/${p.total}회)`, 'gold'];
      case 'loan_missed': return [`⚠️ [이자 미납] ${p.name} 담보 대출 이자 ${p.amount}G를 내지 못했습니다! (연속 ${p.missed}회 / ${p.limit}회에 몰수)`, 'warning'];
      case 'loan_repaid': return [`✅ [대출 상환] ${p.name} 담보 대출 만기 상환 -${p.amount}G — 담보에서 풀렸습니다.`, 'success'];
      case 'loan_default': return [`⛓️ [담보 몰수] ${p.name}을(를) 연준에 빼앗겼습니다. (${p.reason === 'missed' ? '이자 연체' : '만기 미상환'}) — 캐릭터 경매시장에 올라갑니다.`, 'danger', `⛓️ 담보 몰수: ${p.name}`, 'warning'];
      case 'loan_garnish': return [`⛓️ [채권 회수] ${p.name} 담보를 회수하지 못해 지갑에서 ${p.taken}G를 압류했습니다.${p.debt > 0 ? ` 모자란 ${p.debt}G는 빚으로 남아 이후 수입에서 갚아 나갑니다.` : ''}`, 'danger', `⛓️ 채권 회수: -${p.taken}G${p.debt > 0 ? ` · 빚 ${p.debt}G` : ''}`, 'warning'];
      case 'auction_outbid': return [`🔨 [경매 환급] ${p.name} 경매에서 밀려난 입찰금 +${p.refund}G 반환`, 'gold'];
      default: return null;
    }
  }

  function handleEvents(events) {
    let max = lastEventId;
    (events || []).forEach((e) => {
      if (e.id <= lastEventId) return;
      max = Math.max(max, e.id);
      const t = eventText(e);
      if (t) { log(t[0], t[1]); if (t[2]) toast(t[2], t[3]); }
      if (e.kind === 'tax') {
        const p = e.payload || {};
        // 세금 유물은 서버가 굴려서 이미 지급했다 (items 로 내려온다) — 서버 모드에서는 알려 주기만 한다
        if (Array.isArray(p.relics)) { if (global.onServerTaxRelics) global.onServerTaxRelics(p.relics); }
        else if (global.NationShares && global.NationShares.awardTaxRelics) global.NationShares.awardTaxRelics(Object.keys(p.byRegion || {}), Number(p.count) || 0);   // 아이템 서버가 없는 예전 서버
      }
    });
    lastEventId = max;
    ackEvents = Math.max(ackEvents, max);
  }

  function handleInbox(items) {
    const r = run();
    if (!r) return false;
    if (!Array.isArray(r.inboxDone)) r.inboxDone = [];
    let delivered = false;
    (items || []).forEach((it) => {
      ackInbox.push(it.id);
      if (r.inboxDone.includes(it.id)) return;          // 이미 받았다 (ack 가 아직 서버에 닿지 않았을 뿐)
      let done = false;
      if (it.kind === 'unit' && SE.onUnit) { try { done = !!SE.onUnit(it.payload || {}); } catch (e) { console.warn('[ServerEconomy] 캐릭터 전달 실패', e); } }
      if (it.kind === 'unit_gift' && SE.onGift) { try { done = !!SE.onGift(it.payload || {}, it.id); } catch (e) { console.warn('[ServerEconomy] 선물 캐릭터 전달 실패', e); } }
      if (it.kind === 'seize' && SE.onSeize) { try { done = !!SE.onSeize(it.payload || {}); } catch (e) { console.warn('[ServerEconomy] 담보 몰수 처리 실패', e); } }
      if (done) { r.inboxDone.push(it.id); delivered = true; }
      else ackInbox.pop();                              // 못 받았으면 ack 하지 않고 다음에 다시
    });
    if (r.inboxDone.length > INBOX_DONE_MAX) r.inboxDone = r.inboxDone.slice(-INBOX_DONE_MAX);
    return delivered;
  }

  function applySnapshot(snap, receivedAt) {
    SE.snapshot = snap;
    SE.offsetMs = snap.now - receivedAt;
    SE.lastSyncAt = Date.now();
    serverLoop = snap.player.loop;
    const st = getState();
    // 세이브를 지우고 같은 계정으로 다시 시작한 경우 등: 서버가 아는 회차를 따라간다 (구역 · 보상 식별자가 회차로 구분되므로)
    if (st && st.player && localLoop() < serverLoop) st.player.loopCount = serverLoop;
    const r = run();
    if (r) reconcile(snap.player.gold);
    handleEvents(snap.events);
    const delivered = handleInbox(snap.inbox);
    if (delivered && typeof saveGameState === 'function') saveGameState(true);
    updateGoldUi();
    // 리와인더 · 유물의 원본도 서버다 — 로컬 값을 서버 값으로 맞춘다 (game.js onServerItems). 서버에 아이템 함수가 없으면(snap.items 없음) 예전 방식 그대로.
    if (snap.items && typeof global.onServerItems === 'function') { try { global.onServerItems(snap.items); } catch (e) { console.warn(e); } }
    // 지휘관 이름의 원본은 서버다 — 로컬 이름을 맞추고, 아직 이름을 안 정했으면 정하게 한다 (game.js onServerPlayerName)
    if (typeof global.onServerPlayerName === 'function') { try { global.onServerPlayerName(snap.player); } catch (e) { console.warn(e); } }
    listeners.forEach((fn) => { try { fn(snap); } catch (e) { console.warn(e); } });
  }

  async function syncNow() {
    await catchUpLoop();
    await flushNow();
    const sentEvents = ackEvents, sentInbox = ackInbox.slice();
    const t0 = Date.now();
    const snap = await rpc('slg_sync', { p_name: commanderName(), p_ack_events: sentEvents, p_ack_inbox: sentInbox });
    const t1 = Date.now();
    if (!snap || snap.ok !== true) throw new Error('서버 동기화 응답이 올바르지 않습니다.');
    ackEvents = 0; ackInbox = ackInbox.filter((id) => !sentInbox.includes(id));
    applySnapshot(snap, (t0 + t1) / 2);
    return snap;
  }

  /**
   * 서버 상태를 다시 읽는다. 서버가 꺼져 있으면 null.
   *  - 인자 없음/false: SYNC_MIN_MS(15초) 안에는 다시 읽지 않는다 (주기 갱신)
   *  - true: 화면이 서버 시각을 기다리는 경우 — 2.5초 안에 읽었으면 그 결과를 쓴다
   *  - 'now': 방금 서버 상태를 바꾼 직후 — 항상 다시 읽는다
   */
  function sync(mode) {
    if (!SE.enabled) return Promise.resolve(null);
    const minMs = mode === 'now' ? 0 : mode ? FORCE_MIN_MS : SYNC_MIN_MS;
    if (minMs && Date.now() - SE.lastSyncAt < minMs) return Promise.resolve(SE.snapshot);
    if (syncPromise && mode !== 'now') return syncPromise;
    const p = enqueue(syncNow).catch((e) => { console.warn('[ServerEconomy] 동기화 실패', e); return null; }).finally(() => { if (syncPromise === p) syncPromise = null; });
    syncPromise = p;
    return p;
  }

  /** 서버 함수를 부른다. 결과에 balance 가 있으면 미러를 맞춘다. 오류는 { ok:false, error } 로 돌려준다. */
  function call(name, args) {
    return enqueue(async () => {
      try {
        await catchUpLoop();
        await flushNow();
        const res = await rpc(name, args);
        if (res && typeof res.balance === 'number') reconcile(res.balance);
        if (res && res.items && SE.snapshot) { SE.snapshot.items = res.items; if (typeof global.onServerItems === 'function') { try { global.onServerItems(res.items); } catch (e) { console.warn(e); } } }
        return res;
      } catch (e) {
        console.warn(`[ServerEconomy] ${name} 실패`, e);
        return { ok: false, error: (e && e.message) || '서버 오류', network: true };
      }
    });
  }

  /** 사망회귀: 서버가 골드·지분·대출을 초기화한다. 실패해도 다음 동기화가 회차를 따라잡는다. */
  function onReturnByDeath(newLoop) {
    if (!SE.enabled) return Promise.resolve(null);
    return enqueue(async () => {
      try {
        await flushNow();
        const r = await rpc('slg_loop_return', { p_new_loop: newLoop });
        if (r && Number.isFinite(r.loop)) serverLoop = r.loop;
        return r;
      } catch (e) {
        console.warn('[ServerEconomy] 회귀 알림 실패 — 다음 동기화 때 따라잡습니다.', e);
        return null;
      }
    });
  }

  // ============================================================
  // 시작
  // ============================================================
  const serverNow = () => Date.now() + SE.offsetMs;
  let startPromise = null;
  let startRetry = null;

  /** 로그인 + 클라우드 세이브 복원이 끝난 뒤 한 번 부른다. 성공하면 enabled = true. */
  function start() {
    if (SE.enabled) return Promise.resolve(true);
    if (startPromise) return startPromise;
    const b = bridge();
    if (!b || !b.isReady || !b.currentUser || b.currentUser.offline) { SE.status = 'offline'; return Promise.resolve(false); }
    SE.status = 'starting';
    startPromise = (async () => {
      try {
        const s = getState();
        await rpc('slg_bootstrap', { p_name: commanderName(), p_claimed_gold: Math.max(0, Math.floor(Number(s && s.gold) || 0)), p_loop: localLoop() });
        SE.enabled = true;
        await enqueue(syncNow);
        SE.status = 'ready';
        SE.error = null;
        log(`🏦 [서버 경제] 계정에 연결되었습니다. 골드·지분·대출·경매는 서버가 관리합니다. (보유 ${s.gold}G)`, 'gold');
        if (typeof saveGameState === 'function') saveGameState(true);
        return true;
      } catch (e) {
        SE.enabled = false;
        SE.error = e;
        if (isMissingFunction(e)) {
          SE.status = 'unavailable';
          console.warn('[ServerEconomy] 서버 경제 함수가 없습니다 — supabase-economy.sql 을 실행하지 않아 이 탭 안에서만 동작합니다.', e);
          toast('⚠️ 서버 경제가 설치되지 않았습니다. (README "서버 권위 경제" 참고)', 'warning');
        } else {
          SE.status = 'error';
          console.warn('[ServerEconomy] 서버 연결 실패 — 잠시 후 다시 시도합니다.', e);
          startRetry = setTimeout(() => { startRetry = null; start(); }, 10000);
        }
        return false;
      } finally {
        startPromise = null;
      }
    })();
    return startPromise;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden && SE.enabled) sync(true); });
  }

  global.ServerEconomy = {
    get enabled() { return SE.enabled; },
    get status() { return SE.status; },
    get snapshot() { return SE.snapshot; },
    /** 서버가 리와인더 · 유물의 원본인가 (서버 경제가 켜져 있고 서버가 아이템 함수를 가지고 있다) */
    get itemsActive() { return !!(SE.enabled && SE.snapshot && SE.snapshot.items); },
    get isAdmin() { return !!(SE.snapshot && SE.snapshot.player && SE.snapshot.player.admin); },
    start, sync, call, rpc, onReturnByDeath, serverNow, reconcile,
    onSnapshot(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set onUnit(fn) { SE.onUnit = fn; },
    set onSeize(fn) { SE.onSeize = fn; },
    /** 운영자 메일로 받은 캐릭터 (slg_inbox 'unit_gift'). mailbox.js 가 용병 명부에 넣는다 */
    set onGift(fn) { SE.onGift = fn; },
    _SE: SE
  };
  global.Wallet = Wallet;
})(typeof window !== 'undefined' ? window : globalThis);
