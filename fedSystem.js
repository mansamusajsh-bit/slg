// ============================================================
// fedSystem.js — 연준 · 인플레이션 · 캐릭터 담보대출 · 캐릭터 경매시장 연결부 (게임 state ↔ FedEngine ↔ Supabase) + 화면
// 사용법: <script src="fedSystem.js"></script> (fedEngine.js · game.js · nationShares.js 다음)
//
// - 규칙/계산: fedEngine.js (순수 로직)
// - 연준 기록:  Supabase fedState/main        — 전 플레이어 공유 (정책금리 · 물가 · 표결 중인 안건)
// - 경매 기록:  Supabase charAuctions/{id}    — 전 플레이어 공유 (몰수된 캐릭터를 놓고 입찰)
//   Supabase가 없으면 둘 다 이 탭 안에서만 메모리로 돈다.
// - 내 대출:    state.run.loans               — 회귀하면 파티·골드와 함께 사라진다 (담보 캐릭터도 그 파티의 일원이므로)
// - 연준 위원은 nationShares.js가 읽어 둔 국가 지분(NationShares._nations)에서 뽑는다.
// - 물가는 config.js의 ECONOMY.getInflation에 연결되어 getGamePrice / scaleGold(골드로 사고파는 모든 값)에 곱해진다.
// ============================================================

(function (global) {
  'use strict';

  const FE = global.FedEngine;
  const COL_FED = 'fedState';
  const COL_AUC = 'charAuctions';
  const COL_LEDGER = 'fedLedger';   // 플레이어별 보고 { gold, debt, spend } — 통화량·수요 집계의 재료
  const REPORT_MS = 10 * 60 * 1000; // 자기 보고를 올리는 최소 간격
  const MACRO_MS = 2 * 60 * 1000;   // 집계를 다시 읽는 최소 간격 (틱이 지났을 때는 무시하고 바로)
  const FED_ID = 'main';
  const REFRESH_MS = 20 * 1000;
  const CAS_RETRIES = 4;
  const RECENT_CLOSED_MS = 24 * 3600 * 1000;

  // ---- 저장소: Supabase가 있으면 공유, 없으면 메모리 ----
  const memory = new Map();
  // 서버 권위 모드(serverEconomy.js): 연준·대출·경매·위원회는 서버(supabase-economy.sql)가 원본이다.
  // 이 파일은 서버 스냅샷을 보여 주고 서버 함수를 부를 뿐이다. 서버가 없으면(오프라인·스키마 미설치) 예전처럼 이 탭 안에서 돈다.
  const serverMode = () => !!(global.ServerEconomy && global.ServerEconomy.enabled && global.ServerEconomy.snapshot);
  const cloud = () => !!(global.SupabaseBridge && global.SupabaseBridge.isReady && global.SupabaseBridge.casSharedRecord
    && global.SupabaseBridge.currentUser && !global.SupabaseBridge.currentUser.offline);
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const store = {
    async list(col) {
      if (cloud()) return global.SupabaseBridge.listSharedRecords(col);
      return [...memory.entries()].filter(([k]) => k.startsWith(col + '|')).map(([, v]) => copy(v));
    },
    async get(col, id) {
      if (cloud()) return global.SupabaseBridge.getSharedRecord(col, id);
      const v = memory.get(`${col}|${id}`);
      return v ? copy(v) : null;
    },
    // expectedRev === null → 없을 때만 만든다
    async cas(col, id, expectedRev, value) {
      if (cloud()) return global.SupabaseBridge.casSharedRecord(col, id, expectedRev, value);
      const cur = memory.get(`${col}|${id}`);
      if (expectedRev == null ? !!cur : (!cur || cur.rev !== expectedRev)) return false;
      memory.set(`${col}|${id}`, copy(value));
      return true;
    }
  };

  // 기록 하나를 읽고 → fn(기록)이 돌려준 { value, result }를 rev 조건부로 저장. 충돌하면 다시 읽어 재시도.
  // 기록이 아직 없으면 create()로 만든 기본값을 쓰고, fn이 아무것도 안 해도 그 기본값은 저장한다.
  // fn이 null이면 (기록이 있는 한) 저장하지 않는다. 성공하면 { value, result }.
  async function mutate(col, id, fn, create) {
    for (let i = 0; i < CAS_RETRIES; i++) {
      const stored = await store.get(col, id);
      const base = stored || (create ? create() : null);
      if (!base) return { value: null, result: null };
      let out = fn(base);
      if (!out) {
        if (stored) return { value: base, result: null };
        out = { value: base, result: null };
      }
      if (await store.cas(col, id, stored ? stored.rev : null, out.value)) return { value: out.value, result: out.result };
    }
    throw new Error('다른 플레이어와 동시에 수정되어 저장하지 못했습니다. 잠시 후 다시 시도하세요.');
  }

  // ---- 시각 · 나 ----
  const nowMs = () => (serverMode() ? global.ServerEconomy.serverNow() : (global.NationShares && global.NationShares.serverNow ? global.NationShares.serverNow() : Date.now()));
  function me() {
    if (typeof state === 'undefined' || !state) return null;
    if (serverMode()) {
      const p = global.ServerEconomy.snapshot.player;
      return { id: String(p.id), name: (state.commander && state.commander.name) || p.name, loop: Number(p.loop) || 0 };
    }
    if (!state.guest && typeof saveGameState === 'function') saveGameState(true);
    if (!state.guest || !state.guest.id) return null;
    return {
      id: String(state.guest.id),
      name: (state.commander && state.commander.name) || String(state.guest.id),
      loop: Number(state.player && state.player.loopCount) || 0
    };
  }
  const log = (msg, type = 'gold') => { if (typeof addLog === 'function') addLog(msg, type); };
  const toast = (msg, type) => global.UI && global.UI.showToast && global.UI.showToast(msg, type);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const battleLocked = () => (typeof isCharacterPoolLocked === 'function' ? isCharacterPoolLocked() : false);
  const gold = () => Number(state.gold) || 0;

  // ---- 캐시 ----
  let fed = null;              // 마지막으로 읽은 연준 기록
  let auctions = [];           // 마지막으로 읽은 경매 목록
  let lastRefreshAt = 0;
  let refreshing = null;
  let busy = false;
  let loansBusy = false;

  let liveMacro = null;        // 가장 최근 집계한 통화량·수요 지표
  let macroAt = 0;
  let lastReportAt = 0;
  let finDepth = 0;

  // ---- 소비(수요) 추적 ----
  // 골드가 줄어드는 순간(game.js의 state.gold 설정자)마다 불린다. 금융 거래(이자·상환·입찰·지분 매입)는 소비로 세지 않는다.
  function econOf() {
    const run = state && state.run;
    if (!run) return null;
    if (!run.econ || typeof run.econ !== 'object') run.econ = { spend: {} };
    if (!run.econ.spend) run.econ.spend = {};
    return run.econ;
  }
  function trackSpend(amount) {
    if (finDepth > 0 || !(amount > 0)) return;
    const econ = econOf();
    if (!econ) return;
    const idx = FE.tickIndex(nowMs());
    econ.spend[idx] = (Number(econ.spend[idx]) || 0) + amount;
    const keys = Object.keys(econ.spend).map(Number).sort((a, b) => a - b);
    while (keys.length > 8) delete econ.spend[keys.shift()];
  }
  /** fn 안에서 일어나는 골드 감소는 소비가 아닌 금융 거래로 본다 */
  function financial(fn) {
    finDepth++;
    try { return fn(); } finally { finDepth--; }
  }

  const price = () => (fed && fed.price > 0 ? fed.price : 1);
  if (global.ECONOMY) global.ECONOMY.getInflation = price; // 골드로 사고파는 모든 값에 물가가 곱해진다

  function members() {
    if (serverMode()) return (global.ServerEconomy.snapshot.members || []).map((m) => ({ id: m.id, name: m.name, seats: m.seats || [], totalBp: Number(m.totalBp) || 0 }));
    const NS = global.NationShares;
    return FE.committee(NS ? Object.values(NS._nations) : []);
  }
  const memberFor = (who) => (who ? members().find((m) => m.id === who.id) || null : null);

  // ---- 통화량 · 수요 집계 ----
  async function reportSelf(force) {
    const who = me();
    if (!who || !state.run) return;
    const now = nowMs();
    if (!force && now - lastReportAt < REPORT_MS) return;
    lastReportAt = now;
    const econ = econOf();
    const debt = loansOf().reduce((a, l) => a + (Number(l.principal) || 0) + (Number(l.arrears) || 0), 0);
    await mutate(COL_LEDGER, who.id, (b) => ({
      value: { id: who.id, rev: (Number(b.rev) || 0) + 1, name: who.name, loop: who.loop, gold: Math.floor(gold()), debt, spend: { ...(econ ? econ.spend : {}) }, at: now }
    }), () => ({ id: who.id, rev: 0 }));
  }

  async function loadMacro(force) {
    if (!force && liveMacro && Date.now() - macroAt < MACRO_MS) return liveMacro;
    const rows = await store.list(COL_LEDGER);
    const m = FE.buildMacro(rows, nowMs());
    if (m) liveMacro = m;
    macroAt = Date.now();
    return liveMacro;
  }

  // ============================================================
  // 갱신 (연준 틱 · 안건 · 경매 마감 · 환급/낙찰 수령 · 대출 정산)
  // ============================================================
  // 서버 스냅샷이 올 때마다 화면용 캐시를 갈아 끼운다 (NationShares 가 먼저 동기화해도 여기까지 반영된다)
  let serverLoans = [];
  let lastSnapSeen = 0;
  function applyServerSnapshot(snap) {
    if (!snap || !snap.fed) return false;
    setFed(snap.fed);
    liveMacro = snap.fed.macro || null;
    auctions = snap.auctions || [];
    serverLoans = snap.loans || [];
    lastRefreshAt = Date.now();
    const at = global.ServerEconomy._SE.lastSyncAt;
    const changed = at !== lastSnapSeen;
    lastSnapSeen = at;
    updateBadges();
    resolvePledges();
    return changed;
  }
  async function refreshFromServer(force) {
    const snap = await global.ServerEconomy.sync(force);
    if (!snap) return false;
    return applyServerSnapshot(snap);
  }

  function refresh(force) {
    if (serverMode()) return refreshFromServer(force);
    if (global.ServerEconomy && global.ServerEconomy.status === 'starting') return Promise.resolve(false); // 서버 연결 중에는 예전 방식으로 돌지 않는다
    if (refreshing) return refreshing;
    if (!force && Date.now() - lastRefreshAt < REFRESH_MS) return Promise.resolve(false);
    if (typeof cloudLoadPending !== 'undefined' && cloudLoadPending) return Promise.resolve(false); // 세이브 복원 전
    refreshing = (async () => {
      let changed = false;
      try {
        const NS = global.NationShares;
        if (NS && !Object.keys(NS._nations).length) await NS.refresh(true); // 위원 명단은 국가 지분에서 나온다
        const now = nowMs();
        const before = fed ? fed.rev : -1;
        // 물가가 움직일 틱이 되었으면 내 보고를 먼저 올리고 최신 통화량·수요를 집계해서 같이 적는다
        const tickDue = !fed || FE.lastTickBoundary(now) > fed.lastTickAt;
        try {
          await reportSelf(tickDue);
          await loadMacro(tickDue || ui.open);
        } catch (e) { console.warn('[FedSystem] 통화량 집계 실패 — 금리 항만으로 물가를 움직입니다.', e); }
        const r = await mutate(COL_FED, FED_ID, (b) => {
          const base = liveMacro && FE.lastTickBoundary(now) > b.lastTickAt ? FE.withMacro(b, liveMacro) : b;
          const next = FE.resolve(FE.advance(base, now), members(), now);
          return next === b ? null : { value: next };
        }, () => FE.createFed(now));
        setFed(r.value);
        if (fed.rev !== before) changed = true;

        const who = me();
        auctions = await store.list(COL_AUC);
        let credited = 0;
        for (let a of auctions.slice()) {
          if (a.status === 'open' && now >= a.endsAt) {
            const c = await mutate(COL_AUC, a.id, (b) => { const x = FE.closeIfEnded(b, nowMs()); return x ? { value: x } : null; });
            if (c.value) { a = c.value; changed = true; }
          }
          if (who && a.refunds && a.refunds[who.id]) {
            const c = await mutate(COL_AUC, a.id, (b) => { const x = FE.claimRefund(b, who.id, who.loop); return x && { value: x.auction, result: x.gold }; });
            if (c.value) a = c.value;
            if (c.result > 0) { credited += c.result; log(`🔨 [경매 환급] ${a.unit.name} 경매에서 밀려난 입찰금 +${c.result}G 반환`); }
            changed = true;
          }
          if (who && a.status === 'sold' && a.winnerId === who.id) {
            const c = await mutate(COL_AUC, a.id, (b) => { const x = FE.claimWinner(b, who.id, who.loop); return x && { value: x.auction, result: x.unit }; });
            if (c.value) a = c.value;
            if (c.result) deliverUnit(c.result, a.finalPrice);
            changed = true;
          }
        }
        if (credited) state.gold += credited;

        if (who && (settleLoans() || credited)) { changed = true; }
        if (who && await flushDefaults()) changed = true;
        auctions = await store.list(COL_AUC); // 몰수 담보가 방금 올라갔을 수 있으니 등록 뒤에 다시 읽는다
        if (changed && who) { saveGameState(true); }
        lastRefreshAt = Date.now();
        updateBadges();
        return changed;
      } catch (e) {
        console.warn('[FedSystem] 갱신 실패', e);
        lastRefreshAt = Date.now();
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // ============================================================
  // 캐릭터 · 로스터
  // ============================================================
  const runOf = () => (state && state.run) || null;
  const loansOf = () => {
    if (serverMode()) return serverLoans;
    const run = runOf();
    if (!run) return [];
    if (!Array.isArray(run.loans)) run.loans = [];
    return run.loans;
  };
  const pledgeJournal = () => { const run = runOf(); if (!run) return []; if (!Array.isArray(run.pledgeJournal)) run.pledgeJournal = []; return run.pledgeJournal; };
  const charIdOf = (u) => (typeof getCharacterId === 'function' ? getCharacterId(u) : String(u && (u.sourceCharacterId || u.characterId || u.id) || ''));

  function allOwnedUnits() { return [...(state.playerUnits || []), ...(state.reserveUnits || [])]; }
  function ownsCharacter(cid) {
    if (!cid) return false;
    if (allOwnedUnits().some((u) => u && charIdOf(u) === cid)) return true;
    return (state.characterCollection || []).some((e) => e && String(e.characterId) === cid);
  }
  // 담보로 잡힌 캐릭터도 "아직 내 캐릭터"로 본다 (같은 캐릭터를 경매로 또 사는 일이 없게)
  const ownsOrPledged = (cid) => ownsCharacter(cid) || loansOf().some((l) => l.collateral && charIdOf(l.collateral) === cid)
    || (serverMode() && pledgeJournal().some((j) => j.unit && charIdOf(j.unit) === cid));

  function unitValue(u) {
    const v = typeof getCaptiveRansom === 'function' ? getCaptiveRansom(u) : FE.CONFIG.minLoan * 6;
    return Math.max(10, Number(v) || 0);
  }

  /** 담보로 맡길 수 있는 캐릭터 (출전 명단 + 예비의 생존자. 부관·포로 제외) */
  function collateralCandidates() {
    if (!state || !state.run) return [];
    const adj = state.run.adjutant;
    const alive = allOwnedUnits().filter((u) => u && !u.isDead && !u.captive && (typeof u.hp !== 'number' || u.hp > 0));
    return alive
      .filter((u) => !(adj && charIdOf(u) === String(adj.characterId)))
      .map((u) => ({ unit: u, value: unitValue(u), max: FE.maxLoan(unitValue(u)), where: (state.playerUnits || []).includes(u) ? 'party' : 'reserve' }))
      .filter((c) => c.max >= FE.CONFIG.minLoan)
      .sort((a, b) => b.value - a.value);
  }

  function removeFromRoster(unit) {
    const p = (state.playerUnits || []).indexOf(unit);
    if (p >= 0) state.playerUnits.splice(p, 1);
    const r = (state.reserveUnits || []).indexOf(unit);
    if (r >= 0) state.reserveUnits.splice(r, 1);
    if (state.strategy && Array.isArray(state.strategy.deploySelectedIds)) {
      state.strategy.deploySelectedIds = state.strategy.deploySelectedIds.filter((id) => id !== unit.id);
    }
    if (typeof selectedUnitId !== 'undefined' && selectedUnitId === unit.id) selectedUnitId = null;
  }

  function returnToReserve(unit) {
    if (!Array.isArray(state.reserveUnits)) state.reserveUnits = [];
    state.reserveUnits.push(unit);
  }

  /** 경매로 받은 캐릭터를 예비 명단에 넣는다 (같은 캐릭터를 이미 가졌다면 용병 명부 사본으로) */
  function deliverUnit(snapshot, paid, source) {
    const unit = copy(snapshot);
    const cid = charIdOf(unit);
    const back = source === 'loan_repaid';   // 상환된 담보가 돌아오는 경우
    const what = back ? '[담보 반환]' : '[경매 낙찰]';
    const priceTxt = back ? '' : ` (-${paid}G)`;
    if (ownsCharacter(cid)) {
      if (!Array.isArray(state.characterCollection)) state.characterCollection = [];
      state.characterCollection.push({ instanceId: `auction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, characterId: cid, acquiredAt: new Date().toISOString() });
      log(`🔨 ${what} ${unit.name}${priceTxt} — 이미 같은 캐릭터가 있어 용병 명부 사본으로 들어왔습니다.`);
    } else {
      unit.id = `auc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      unit.owner = 'PLAYER';
      unit.isDead = false;
      unit.isInactivated = false;
      unit.captive = null;
      if (!(Number(unit.hp) > 0)) { unit.hp = unit.maxHp || 100; if (unit.stats) unit.stats.hp = unit.hp; }
      returnToReserve(unit);
      log(`🔨 ${what} ${unit.name}이(가) 예비 명단에 합류했습니다.${priceTxt} 용병 명부에서 출전 명단에 편입하세요.`, 'success');
    }
    toast(back ? `✅ ${unit.name} 반환` : `🔨 ${unit.name} 낙찰!`, 'success');
    return true;
  }
  // 서버 우편함(경매 낙찰 · 상환된 담보)에서 온 캐릭터를 받는다 — serverEconomy.js 가 한 번씩만 부른다
  if (global.ServerEconomy) global.ServerEconomy.onUnit = (p) => deliverUnit(p.unit, Number(p.price) || 0, p.source);

  // ============================================================
  // 대출
  // ============================================================
  const loanLabel = (l) => (l.collateral ? l.collateral.name : '담보');

  /** 이자 · 만기 정산 (전투 중에는 미룬다). 하나라도 바뀌면 true. 서버 모드에서는 서버가 한다. */
  function settleLoans() {
    if (serverMode()) return false;
    if (!state || !state.run || battleLocked()) return false;
    const list = loansOf();
    if (!list.length) return false;
    const now = nowMs();
    let changed = false;
    list.slice().forEach((loan) => {
      if (loan.status !== 'active') return;
      const res = FE.settleLoan(loan, now, gold());
      if (!res.events.length) return;
      changed = true;
      financial(() => { state.gold = res.gold; }); // 이자·원금은 소비가 아니라 금융 거래
      const idx = list.indexOf(loan);
      list[idx] = res.loan;
      const total = FE.loanPeriods(res.loan);
      res.events.forEach((e) => {
        if (e.type === 'interest') log(`🏦 [대출 이자] ${loanLabel(loan)} 담보 대출 이자 -${e.amount}G (${res.loan.periodsDone}/${total}회)`);
        else if (e.type === 'missed') log(`⚠️ [이자 미납] ${loanLabel(loan)} 담보 대출 이자 ${e.amount}G를 내지 못했습니다! (연속 ${res.loan.missed}회 / ${FE.CONFIG.missLimit}회에 몰수)`, 'warning');
        else if (e.type === 'repaid') {
          log(`✅ [대출 상환] ${loanLabel(loan)} 담보 대출 만기 상환 -${e.amount}G — 담보 캐릭터가 돌아왔습니다.`, 'success');
        } else if (e.type === 'default') {
          log(`⛓️ [담보 몰수] ${loanLabel(loan)}을(를) 연준에 빼앗겼습니다. (${e.reason === 'missed' ? '이자 연체' : '만기 미상환'}) — 캐릭터 경매시장에 올라갑니다.`, 'danger');
          toast(`⛓️ 담보 몰수: ${loanLabel(loan)}`, 'warning');
        }
      });
      if (res.loan.status === 'repaid') {
        returnToReserve(res.loan.collateral);
        list.splice(list.indexOf(res.loan), 1);
      }
    });
    if (changed && typeof renderAll === 'function' && !battleLocked()) renderAll();
    return changed;
  }

  // 몰수된 담보를 경매에 올린다. 경매 id가 대출 id에서 나오므로 중복 등록되지 않는다 (실패하면 다음 갱신에 다시 시도).
  async function flushDefaults() {
    if (serverMode()) return false;
    const who = me();
    const list = loansOf();
    const pending = list.filter((l) => l.status === 'defaulted');
    let listed = false;
    for (const loan of pending) {
      try {
        const id = `auc_${loan.id}`;
        await mutate(COL_AUC, id, () => null, () => FE.createAuction({
          id, unit: loan.collateral, value: loan.collateralValue, reason: 'default', sellerName: '연방준비기금', nowMs: nowMs()
        }));
        list.splice(list.indexOf(loan), 1);
        listed = true;
        if (who) saveGameState(true);
        log(`🔨 [경매 등록] ${loanLabel(loan)}이(가) 캐릭터 경매시장에 올라갔습니다.`, 'warning');
      } catch (e) {
        console.warn('[FedSystem] 몰수 담보 경매 등록 실패 — 다음 갱신에 다시 시도합니다.', e);
      }
    }
    return listed;
  }

  // 너무 큰 문자열(이미지 데이터 등)은 담보 기록에서 뺀다 (서버는 32KB 까지만 받는다)
  function slimUnit(u) {
    return JSON.parse(JSON.stringify(u, (k, v) => (typeof v === 'string' && v.length > 1500 ? '' : v)));
  }
  const newLoanId = () => `loan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let resolvingPledges = false;

  // 저널에 남은 대출 요청(네트워크가 끊겼거나 창을 닫은 경우)을 같은 id 로 다시 보낸다. 서버는 같은 id 면 한 번만 처리한다.
  // 서버가 거절하면 맡겼던 캐릭터를 예비 명단으로 되돌린다.
  async function resolvePledges() {
    if (resolvingPledges || !serverMode()) return;
    const journal = pledgeJournal();
    if (!journal.length) return;
    resolvingPledges = true;
    try {
      for (const j of journal.slice()) {
        const res = await global.ServerEconomy.call('slg_loan_take', { p_id: j.id, p_unit: j.unit, p_principal: j.principal, p_term_hours: j.termHours });
        if (res && res.network) break;
        const run = runOf();
        if (run) run.pledgeJournal = pledgeJournal().filter((x) => x.id !== j.id);
        if (res && res.ok) {
          log(`🏦 [담보 대출] ${j.unit.name}을(를) 맡기고 ${j.principal}G 대출`);
        } else {
          returnToReserve(j.fullUnit || j.unit);
          log(`⚠️ [담보 대출] ${j.unit.name} 대출이 거절되어 캐릭터가 돌아왔습니다: ${(res && res.error) || '알 수 없는 오류'}`, 'warning');
          toast(`⚠️ 대출 거절: ${(res && res.error) || ''}`, 'warning');
        }
        if (typeof saveGameState === 'function') saveGameState(true);
      }
      await global.ServerEconomy.sync('now');
      if (typeof renderAll === 'function' && !battleLocked()) renderAll();
    } finally {
      resolvingPledges = false;
    }
  }

  async function takeLoanServer(unitId, principal, termHours) {
    const fail = (m) => { toast(`⚠️ ${m}`, 'warning'); return false; };
    await global.ServerEconomy.sync('now');
    if (!fed) return fail('연준 기록을 아직 불러오지 못했습니다.');
    if (battleLocked()) return fail('전투 중에는 대출을 받을 수 없습니다.');
    if (runOf().returnPending) return fail('지금은 대출을 받을 수 없습니다.');
    if (loansOf().length + pledgeJournal().length >= FE.CONFIG.maxActiveLoans) return fail(`동시에 ${FE.CONFIG.maxActiveLoans}건까지만 받을 수 있습니다.`);
    const ban = Number(global.ServerEconomy.snapshot.loanBanUntil) || 0;
    if (ban > nowMs()) return fail('담보를 몰수당한 직후라 한동안 대출을 받을 수 없습니다.');
    const cand = collateralCandidates().find((c) => c.unit.id === unitId);
    if (!cand) return fail('담보로 맡길 수 없는 캐릭터입니다.');
    const amount = Math.floor(Number(principal) || 0);
    if (amount < FE.CONFIG.minLoan || amount > cand.max) return fail(`대출액은 ${FE.CONFIG.minLoan}G ~ ${cand.max}G 사이여야 합니다.`);
    if (allOwnedUnits().filter((u) => u && !u.isDead && u !== cand.unit).length < 1) return fail('마지막 남은 생존 캐릭터는 담보로 맡길 수 없습니다.');
    const slim = slimUnit(cand.unit);
    if (JSON.stringify(slim).length > 30000) return fail('캐릭터 데이터가 너무 커서 담보로 맡길 수 없습니다.');
    // 1) 먼저 명단에서 빼고 저널에 적는다 (서버가 받았는데 창이 닫혀도 캐릭터가 두 곳에 있게 되지 않는다)
    const unit = cand.unit;
    removeFromRoster(unit);
    pledgeJournal().push({ id: newLoanId(), unit: slim, fullUnit: copy(unit), principal: amount, termHours, at: Date.now() });
    if (typeof saveGameState === 'function') saveGameState(true);
    if (typeof renderAll === 'function') renderAll();
    // 2) 서버에 요청 → 결과 처리는 resolvePledges 가 한다
    await resolvePledges();
    if (pledgeJournal().length) {
      toast('⚠️ 서버에 연결하지 못했습니다. 연결되면 대출이 자동으로 이어집니다.', 'warning');
      log('⚠️ [담보 대출] 서버에 닿지 않아 요청을 보관했습니다. 연결되면 자동으로 이어서 처리합니다.', 'warning');
    }
    return !pledgeJournal().length;
  }

  async function takeLoan(unitId, principal, termHours) {
    if (loansBusy) return false;
    if (serverMode()) {
      loansBusy = true;
      try { return await takeLoanServer(unitId, principal, termHours); } finally { loansBusy = false; }
    }
    const fail = (m) => { toast(`⚠️ ${m}`, 'warning'); return false; };
    loansBusy = true;
    try {
      await refresh(true); // 가장 최근 금리 · 로스터로 확인한다
      if (!fed) return fail('연준 기록을 아직 불러오지 못했습니다.');
      if (battleLocked()) return fail('전투 중에는 대출을 받을 수 없습니다.');
      if (runOf().returnPending) return fail('지금은 대출을 받을 수 없습니다.');
      if (loansOf().length >= FE.CONFIG.maxActiveLoans) return fail(`동시에 ${FE.CONFIG.maxActiveLoans}건까지만 받을 수 있습니다.`);
      const cand = collateralCandidates().find((c) => c.unit.id === unitId);
      if (!cand) return fail('담보로 맡길 수 없는 캐릭터입니다.');
      const amount = Math.floor(Number(principal) || 0);
      if (amount < FE.CONFIG.minLoan || amount > cand.max) return fail(`대출액은 ${FE.CONFIG.minLoan}G ~ ${cand.max}G 사이여야 합니다.`);
      if (allOwnedUnits().filter((u) => u && !u.isDead && u !== cand.unit).length < 1) return fail('마지막 남은 생존 캐릭터는 담보로 맡길 수 없습니다.');
      const rateBp = FE.lendingRateBp(fed);
      const unit = cand.unit;
      removeFromRoster(unit);
      const loan = FE.createLoan({
        id: `loan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        principal: amount, termHours, rateBp,
        collateral: copy(unit), collateralValue: cand.value, nowMs: nowMs()
      });
      loansOf().push(loan);
      state.gold += amount;
      const q = FE.quoteLoan(amount, loan.termHours, rateBp);
      log(`🏦 [담보 대출] ${unit.name}을(를) 맡기고 ${amount}G 대출 — 이자율 ${(rateBp / 100).toFixed(2)}%/8h (회당 ${q.perPeriod}G) · ${loan.termHours}시간 만기`);
      toast(`🏦 대출 +${amount}G`, 'success');
      saveGameState(true);
      if (typeof renderAll === 'function') renderAll();
      return true;
    } finally {
      loansBusy = false;
    }
  }

  async function repayLoanServer(loanId) {
    if (battleLocked()) { toast('⚠️ 전투 중에는 상환할 수 없습니다.', 'warning'); return false; }
    const res = await global.ServerEconomy.call('slg_loan_repay', { p_id: loanId });
    if (!res || res.ok === false) { toast(`⚠️ ${(res && res.error) || '상환하지 못했습니다.'}`, 'warning'); await global.ServerEconomy.sync('now'); return false; }
    log(`✅ [대출 상환] 담보 대출을 조기 상환했습니다 (-${res.owed}G) — 담보 캐릭터가 곧 예비 명단으로 돌아옵니다.`, 'success');
    toast('✅ 대출 상환 완료', 'success');
    await global.ServerEconomy.sync('now');   // 우편함의 캐릭터가 이때 들어온다
    if (typeof renderAll === 'function') renderAll();
    return true;
  }

  function repayLoan(loanId) {
    if (serverMode()) return repayLoanServer(loanId);
    const list = loansOf();
    const loan = list.find((l) => l.id === loanId && l.status === 'active');
    if (!loan) return false;
    if (battleLocked()) { toast('⚠️ 전투 중에는 상환할 수 없습니다.', 'warning'); return false; }
    settleLoans(); // 지금까지의 이자를 먼저 낸다
    const live = list.find((l) => l.id === loanId && l.status === 'active');
    if (!live) return false; // 정산하다 상환/몰수됐다
    const owed = FE.payoffAmount(live);
    if (gold() < owed) { toast(`💸 골드가 부족합니다 (필요 ${owed}G)`, 'warning'); return false; }
    financial(() => { state.gold -= owed; });
    list.splice(list.indexOf(live), 1);
    returnToReserve(live.collateral);
    log(`✅ [대출 상환] ${loanLabel(live)} 담보 대출을 조기 상환했습니다 (-${owed}G) — 담보 캐릭터가 예비 명단으로 돌아왔습니다.`, 'success');
    toast('✅ 대출 상환 완료', 'success');
    saveGameState(true);
    if (typeof renderAll === 'function') renderAll();
    return true;
  }

  // ============================================================
  // 연준 위원 행동 · 경매 입찰
  // ============================================================
  async function fedActionServer(kind, arg) {
    const res = await global.ServerEconomy.call(kind === 'propose' ? 'slg_fed_propose' : 'slg_fed_vote', kind === 'propose' ? { p_dir: arg } : { p_choice: arg });
    if (!res || res.ok === false) {
      toast(`⚠️ ${(res && res.error) || '처리하지 못했습니다.'}`, 'warning');
      await global.ServerEconomy.sync('now');
      return false;
    }
    const who = me();
    if (kind === 'propose' && who) log(`🏛️ [연준] ${who.name}이(가) 금리 ${arg > 0 ? '인상' : '인하'} 안건을 발의했습니다.`);
    if (res.fed) setFed(res.fed);
    await global.ServerEconomy.sync('now');
    return true;
  }

  async function fedAction(kind, arg) {
    if (busy) return false;
    const who = me();
    if (!who) return false;
    busy = true;
    if (serverMode()) {
      try { return await fedActionServer(kind, arg); } finally { busy = false; updateBadges(); }
    }
    let err = null;
    try {
      const NS = global.NationShares;
      if (NS) await NS.refresh(true);
      const mem = memberFor(who);
      if (!mem) { toast('⚠️ 연준 위원만 할 수 있습니다.', 'warning'); return false; }
      const r = await mutate(COL_FED, FED_ID, (b) => {
        const now = nowMs();
        const adv = FE.advance(b, now);
        const x = kind === 'propose' ? FE.propose(adv, mem, arg, members(), now) : FE.vote(adv, mem, arg, members(), now);
        if (x.error) { err = x.error; return null; }
        return { value: x.fed, result: true };
      }, () => FE.createFed(nowMs()));
      if (!r.result) { toast(`⚠️ ${err || '처리하지 못했습니다.'}`, 'warning'); if (r.value) setFed(r.value); return false; }
      if (kind === 'propose') log(`🏛️ [연준] ${who.name}이(가) 금리 ${arg > 0 ? '인상' : '인하'} 안건을 발의했습니다.`);
      setFed(r.value);
      return true;
    } catch (e) {
      console.warn('[FedSystem] 연준 처리 실패', e);
      toast(`⚠️ ${e.message || '처리 실패'}`, 'warning');
      return false;
    } finally {
      busy = false;
      updateBadges();
    }
  }
  const proposeRate = (dir) => fedAction('propose', dir);
  const voteMotion = (choice) => fedAction('vote', choice);

  // 연준 기록을 갈아 끼우면서, 새로 끝난 안건이 있으면 로그로 알린다
  function setFed(next) {
    const prev = fed;
    fed = next;
    const m = next && next.lastMotion;
    if (m && (!prev || !prev.lastMotion || prev.lastMotion.at !== m.at)) announceMotion(m);
  }

  function announceMotion(m) {
    const word = m.dir > 0 ? '인상' : '인하';
    if (m.result === 'passed') log(`🏛️ [연준] 금리 ${word} 가결 (찬성 ${m.yes} / 위원 ${m.total}) — 정책금리 ${(m.rateBp / 100).toFixed(2)}%`, 'success');
    else log(`🏛️ [연준] 금리 ${word} 안건이 ${m.result === 'expired' ? '시간 만료로' : '부결로'} 끝났습니다. (찬성 ${m.yes} / 반대 ${m.no} / 위원 ${m.total})`, 'warning');
  }

  async function bid(auctionId, amount) {
    if (busy) return false;
    const who = me();
    if (!who) return false;
    const a = auctions.find((x) => x.id === auctionId);
    const fail = (m) => { toast(`⚠️ ${m}`, 'warning'); return false; };
    if (!a) return fail('경매를 찾을 수 없습니다.');
    const amt = Math.floor(Number(amount) || 0);
    if (runOf().returnPending) return fail('지금은 입찰할 수 없습니다.');
    if (ownsOrPledged(charIdOf(a.unit))) return fail('이미 가지고 있는 캐릭터입니다.');
    if (amt < FE.minBid(a)) return fail(`최소 ${FE.minBid(a)}G부터 입찰할 수 있습니다.`);
    if (gold() < amt) return fail(`골드가 부족합니다 (필요 ${amt}G)`);
    if (serverMode()) {
      busy = true;
      try {
        const res = await global.ServerEconomy.call('slg_auction_bid', { p_id: auctionId, p_amount: amt });
        if (!res || res.ok === false) {
          toast(`⚠️ ${(res && res.error) || '입찰하지 못했습니다.'}`, 'warning');
          await global.ServerEconomy.sync('now');
          return false;
        }
        log(`🔨 [경매 입찰] ${a.unit.name}에 ${amt}G 입찰 — 더 높은 입찰이 나오면 입찰금은 돌려받습니다.`);
        toast(`🔨 ${amt}G 입찰`, 'success');
        await global.ServerEconomy.sync('now');
        return true;
      } finally {
        busy = false;
      }
    }
    busy = true;
    financial(() => { state.gold -= amt; }); // 입찰금은 먼저 에스크로 (실패하면 돌려받는다)
    saveGameState(true);
    let err = null;
    try {
      const r = await mutate(COL_AUC, auctionId, (b) => {
        const x = FE.applyBid(b, who, amt, nowMs());
        if (x.error) { err = x.error; return null; }
        return { value: x.auction, result: x.bid };
      });
      if (!r.result) {
        state.gold += amt;
        saveGameState(true);
        if (r.value) auctions = auctions.map((x) => (x.id === auctionId ? r.value : x));
        toast(`⚠️ ${err || '입찰하지 못했습니다.'}`, 'warning');
        return false;
      }
      auctions = auctions.map((x) => (x.id === auctionId ? r.value : x));
      log(`🔨 [경매 입찰] ${a.unit.name}에 ${amt}G 입찰 — 더 높은 입찰이 나오면 입찰금은 돌려받습니다.`);
      toast(`🔨 ${amt}G 입찰`, 'success');
      saveGameState(true);
      return true;
    } catch (e) {
      state.gold += amt;
      saveGameState(true);
      console.warn('[FedSystem] 입찰 실패', e);
      toast(`⚠️ ${e.message || '입찰 실패'}`, 'warning');
      return false;
    } finally {
      busy = false;
    }
  }

  // ============================================================
  // 화면
  // ============================================================
  const ui = { open: false, tab: 'fed', loanUnit: null, loanAmount: 0, loanTerm: 72, bids: {} };

  const fmtPct = (bp) => `${(bp / 100).toFixed(2)}%`;
  function fmtCd(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, '0');
    const d = Math.floor(s / 86400);
    return `${d ? d + '일 ' : ''}${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }
  const cd = (at) => `<b class="fed-cd" data-fed-cd="${at}">${fmtCd(at - nowMs())}</b>`;

  function sparkline(history) {
    const pts = (history || []).filter((h) => h && h.price > 0);
    if (pts.length < 2) return '';
    const W = 220, H = 44, pad = 4;
    const lo = Math.min(...pts.map((p) => p.price)), hi = Math.max(...pts.map((p) => p.price));
    const span = Math.max(hi - lo, 0.02);
    const xy = pts.map((p, i) => `${(pad + (i / (pts.length - 1)) * (W - pad * 2)).toFixed(1)},${(H - pad - ((p.price - lo) / span) * (H - pad * 2)).toFixed(1)}`).join(' ');
    return `<svg class="fed-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function portrait(unit) {
    if (typeof renderPortrait === 'function') return renderPortrait(unit, { emojiSize: '24px' });
    return `<span class="portrait-emoji">${esc(unit.avatar || '🧑')}</span>`;
  }
  const classLabel = (u) => esc(typeof getClassLabel === 'function' ? getClassLabel(u.classType) : (u.classType || ''));

  // ---- 탭 1: 연준 ----
  function renderFedTab() {
    if (!fed) return '<p class="fed-empty">연준 기록을 불러오는 중…</p>';
    const now = nowMs();
    const who = me();
    const mem = members();
    const iAm = who && mem.find((m) => m.id === who.id);
    const hist = fed.history || [];
    const dayAgo = hist.filter((h) => h.at <= now - 24 * 3600 * 1000).pop() || hist[0];
    const dayChange = dayAgo && dayAgo.price ? ((fed.price / dayAgo.price) - 1) * 100 : 0;
    const mac = liveMacro || fed.macro || null;
    const bd = FE.breakdown(fed.rateBp, fed.price, mac);
    const drift = bd.total;
    const driftTxt = drift > 0.05 ? `틱당 약 +${drift.toFixed(2)}% 오르는 중` : drift < -0.05 ? `틱당 약 ${drift.toFixed(2)}% 내리는 중` : '물가 안정권';
    const sgn = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    const macroHtml = mac ? `
      <div class="fed-stats fed-stats-sub">
        <div class="fed-stat"><small>총 통화량 (접속 ${mac.players}명)</small><b>${mac.money.toLocaleString()}G</b><em>1인당 ${Math.round(mac.money / mac.players).toLocaleString()}G</em></div>
        <div class="fed-stat"><small>소비 회전율 (틱당)</small><b>${(mac.velocity * 100).toFixed(1)}%</b><em>적정 ${(FE.CONFIG.refVelocity * 100).toFixed(0)}% · 소비 ${mac.spend.toLocaleString()}G</em></div>
        <div class="fed-stat"><small>대출 잔액</small><b>${mac.debt.toLocaleString()}G</b><em>통화량의 ${mac.money ? Math.round(mac.debt / mac.money * 100) : 0}%</em></div>
      </div>
      <p class="fed-help fed-why">이번 틱 물가 변동 요인 — 금리 <b>${sgn(bd.rate)}</b> · 통화량 <b>${sgn(bd.money)}</b> · 수요 <b>${sgn(bd.demand)}</b> = ${sgn(bd.total)}</p>` : '<p class="fed-help">통화량·수요 집계를 기다리는 중… (플레이어가 접속해 보고하면 반영됩니다)</p>';

    let motionHtml;
    if (fed.motion) {
      const m = fed.motion;
      const t = FE.tally(m, mem);
      const myVote = who && m.votes[who.id] ? m.votes[who.id].v : null;
      const dirTxt = m.dir > 0 ? '인상' : '인하';
      const target = fed.rateBp + m.dir * FE.CONFIG.rateStepBp;
      const voters = Object.entries(m.votes).filter(([id]) => mem.some((x) => x.id === id))
        .map(([id, v]) => `<span class="fed-vote is-${v.v}">${esc(v.name)} ${v.v === 'yes' ? '찬성' : '반대'}</span>`).join('');
      motionHtml = `
        <div class="fed-motion">
          <div class="fed-motion-head"><b>${m.dir > 0 ? '📈' : '📉'} 금리 ${dirTxt} 안건</b><span>${fmtPct(fed.rateBp)} → <b>${fmtPct(target)}</b></span></div>
          <div class="fed-motion-meta">발의 ${esc(m.proposerName)} · 찬성 <b>${t.yes}</b> · 반대 <b>${t.no}</b> · 위원 ${t.total}명 (과반 ${t.need}표 필요) · 마감까지 ${cd(m.expiresAt)}</div>
          <div class="fed-votes">${voters}</div>
          ${iAm ? `<div class="fed-motion-actions">
              <button type="button" class="fed-btn ${myVote === 'yes' ? 'is-on' : ''}" data-fed-act="vote-yes">👍 찬성</button>
              <button type="button" class="fed-btn is-danger ${myVote === 'no' ? 'is-on' : ''}" data-fed-act="vote-no">👎 반대</button>
            </div>` : '<div class="fed-note">위원만 표결할 수 있습니다.</div>'}
        </div>`;
    } else {
      const up = FE.canChangeRate(fed, 1, now), down = FE.canChangeRate(fed, -1, now);
      const wait = up.waitMs || down.waitMs;
      motionHtml = iAm ? `
        <div class="fed-motion is-idle">
          <div class="fed-motion-head"><b>안건 발의</b><span>위원 ${mem.length}명 · 과반 ${FE.majority(mem.length)}표</span></div>
          <div class="fed-motion-actions">
            <button type="button" class="fed-btn" data-fed-act="propose-up" ${up.ok ? '' : 'disabled'} title="${esc(up.ok ? '' : up.reason)}">📈 금리 인상 +${FE.CONFIG.rateStepBp / 100}%p</button>
            <button type="button" class="fed-btn" data-fed-act="propose-down" ${down.ok ? '' : 'disabled'} title="${esc(down.ok ? '' : down.reason)}">📉 금리 인하 −${FE.CONFIG.rateStepBp / 100}%p</button>
          </div>
          ${wait ? `<div class="fed-note">냉각 기간: 다음 안건까지 ${cd(now + wait)}</div>` : ''}
          ${!up.ok && !wait ? `<div class="fed-note">${esc(up.reason)}</div>` : ''}
        </div>` : '<div class="fed-note">표결 중인 안건이 없습니다.</div>';
    }

    const last = fed.lastMotion;
    const lastHtml = last ? `<div class="fed-note">직전 안건: 금리 ${last.dir > 0 ? '인상' : '인하'} — <b>${last.result === 'passed' ? '가결' : last.result === 'expired' ? '만료' : '부결'}</b> (찬성 ${last.yes} · 반대 ${last.no} · 위원 ${last.total}명)</div>` : '';

    const memHtml = mem.length
      ? `<ul class="fed-members">${mem.map((m) => `<li class="${who && m.id === who.id ? 'is-me' : ''}"><b>${esc(m.name)}${who && m.id === who.id ? ' (나)' : ''}</b><span>${m.seats.map((s) => `${esc(REGIONS[s.regionId] ? REGIONS[s.regionId].name.ko : s.regionId)} ${(s.bp / 100).toFixed(s.bp % 100 ? 2 : 0)}%`).join(' · ')}</span></li>`).join('')}</ul>`
      : '<p class="fed-empty">아직 위원이 없습니다. 국가 지분 1위(1% 이상)가 되면 연준 위원이 됩니다.</p>';

    return `
      <div class="fed-stats">
        <div class="fed-stat"><small>물가 지수</small><b>×${fed.price.toFixed(3)}</b><em class="${dayChange > 0.005 ? 'is-up' : dayChange < -0.005 ? 'is-down' : ''}">24h ${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}%</em></div>
        <div class="fed-stat"><small>정책금리 (8시간)</small><b>${fmtPct(fed.rateBp)}</b><em>${driftTxt}</em></div>
        <div class="fed-stat"><small>대출금리 (8시간)</small><b>${fmtPct(FE.lendingRateBp(fed))}</b><em>정책금리 + ${fmtPct(FE.CONFIG.spreadBp)}</em></div>
      </div>
      ${macroHtml}
      <div class="fed-chart">${sparkline(hist)}<span>다음 물가 갱신 ${cd(FE.nextTickAt(now))}</span></div>
      <p class="fed-help">상점·고용·매각 등 사고파는 값과 전리품·보상·세수·유지비에 물가 지수가 곱해집니다. 물가는 ① 금리(중립 ${fmtPct(FE.CONFIG.neutralBp)}보다 높으면 억제) ② 1인당 통화량(적정 ${FE.CONFIG.refMoneyPerPlayer}G보다 많으면 상승) ③ 소비 회전율(적정보다 빠르면 상승)로 움직입니다. 대출을 받으면 쥐고 있는 골드(통화량)가 늘어납니다.</p>
      <h3 class="fed-h">🏛️ 연준 위원회 <small>국가별 지분 1위 · 1인 1표</small></h3>
      ${memHtml}
      ${iAm ? '' : '<div class="fed-note">당신은 위원이 아닙니다. 점령한 국가의 지분을 늘려 1위가 되세요.</div>'}
      ${motionHtml}
      ${lastHtml}`;
  }

  // ---- 탭 2: 대출 ----
  function renderLoanTab() {
    if (!fed) return '<p class="fed-empty">연준 기록을 불러오는 중…</p>';
    const now = nowMs();
    const loans = loansOf();
    const rate = FE.lendingRateBp(fed);
    const cards = loans.map((l) => {
      const total = FE.loanPeriods(l);
      const per = FE.interestPerPeriod(l.principal, l.rateBp);
      const defaulted = l.status === 'defaulted';
      return `
        <div class="fed-loan ${l.arrears ? 'is-arrears' : ''}">
          <div class="fed-loan-unit"><span class="fed-ava">${portrait(l.collateral)}</span><div><b>${esc(l.collateral.name)}</b><small>${classLabel(l.collateral)} · Lv.${l.collateral.level || 1} · 담보가치 ${l.collateralValue}G</small></div></div>
          <div class="fed-loan-grid">
            <span>원금</span><b>${l.principal}G</b>
            <span>이자</span><b>${fmtPct(l.rateBp)} / 8시간 (${per}G)</b>
            <span>이자 납부</span><b>${l.periodsDone} / ${total}회${l.arrears ? ` · <span class="fed-bad">밀린 이자 ${l.arrears}G (연속 ${l.missed}회)</span>` : ''}</b>
            ${defaulted ? '' : `<span>다음 이자</span><b>${l.periodsDone < total ? cd(FE.nextInterestAt(l)) : '—'}</b>`}
            <span>만기</span><b>${defaulted ? '몰수 처리 중…' : cd(l.dueAt)}</b>
          </div>
          ${defaulted ? '' : `<button type="button" class="fed-btn" data-fed-act="repay" data-loan="${esc(l.id)}" ${gold() >= FE.payoffAmount(l) ? '' : 'disabled'}>상환 ${FE.payoffAmount(l)}G</button>`}
        </div>`;
    }).join('');

    const cands = collateralCandidates();
    if (!cands.some((c) => c.unit.id === ui.loanUnit)) ui.loanUnit = cands[0] ? cands[0].unit.id : null;
    const sel = cands.find((c) => c.unit.id === ui.loanUnit) || null;
    if (sel) {
      ui.loanAmount = Math.min(sel.max, Math.max(FE.CONFIG.minLoan, ui.loanAmount || sel.max));
    }
    const full = loans.length >= FE.CONFIG.maxActiveLoans;
    const locked = battleLocked();
    const banUntil = serverMode() ? Number(global.ServerEconomy.snapshot.loanBanUntil) || 0 : 0;
    const banned = banUntil > now;
    let form;
    if (!cands.length) form = '<p class="fed-empty">담보로 맡길 수 있는 캐릭터가 없습니다. (부관·포로 제외, 담보가치 기준 최소 대출액 이상)</p>';
    else {
      const q = FE.quoteLoan(ui.loanAmount, ui.loanTerm, rate);
      form = `
        <div class="fed-collat">${cands.map((c) => `
          <label class="fed-collat-row ${c.unit.id === ui.loanUnit ? 'is-sel' : ''}">
            <input type="radio" name="fed-collat" value="${esc(c.unit.id)}" ${c.unit.id === ui.loanUnit ? 'checked' : ''}>
            <span class="fed-ava">${portrait(c.unit)}</span>
            <span class="fed-collat-main"><b>${esc(c.unit.name)}</b><small>${classLabel(c.unit)} · Lv.${c.unit.level || 1} · ${c.where === 'party' ? '출전 명단' : '예비'}</small></span>
            <span class="fed-collat-val">가치 ${c.value}G<small>한도 ${c.max}G</small></span>
          </label>`).join('')}</div>
        <div class="fed-field"><label for="fed-loan-amt">대출액 <b id="fed-loan-amt-out">${ui.loanAmount}G</b></label>
          <input type="range" id="fed-loan-amt" min="${FE.CONFIG.minLoan}" max="${sel.max}" step="1" value="${ui.loanAmount}"></div>
        <div class="fed-field"><label for="fed-loan-term">상환 기간 <b id="fed-loan-term-out">${ui.loanTerm}시간 (${(ui.loanTerm / 24).toFixed(ui.loanTerm % 24 ? 1 : 0)}일)</b></label>
          <input type="range" id="fed-loan-term" min="${FE.CONFIG.minTermHours}" max="${FE.CONFIG.maxTermHours}" step="${FE.CONFIG.termStepHours}" value="${ui.loanTerm}"></div>
        <div class="fed-quote" id="fed-loan-quote">${loanQuoteHtml(q, ui.loanAmount, rate)}</div>
        <button type="button" class="fed-btn is-primary" data-fed-act="borrow" ${full || locked || banned ? 'disabled' : ''}>${locked ? '전투 중에는 불가' : banned ? '담보 몰수 직후라 대출 불가' : full ? `동시 ${FE.CONFIG.maxActiveLoans}건까지` : '🏦 담보 대출 받기'}</button>
        ${banned ? `<div class="fed-note">담보를 몰수당해 ${cd(banUntil)} 동안 새 대출을 받을 수 없습니다.</div>` : ''}`;
    }

    return `
      <p class="fed-help">캐릭터를 맡기고 골드를 빌립니다. 이자는 대출 시점부터 <b>8시간마다</b> 자동으로 나가고, 대출금리는 그때의 정책금리 + ${fmtPct(FE.CONFIG.spreadBp)}로 고정됩니다.
        만기(최대 ${FE.CONFIG.maxTermHours / 24}일)에 원금을 갚지 못하거나 이자를 ${FE.CONFIG.missLimit}회 연속 못 내면 <b>담보 캐릭터를 빼앗기고 경매에 넘어갑니다.</b></p>
      ${loans.length ? `<h3 class="fed-h">내 대출 <small>${loans.length}/${FE.CONFIG.maxActiveLoans}건</small></h3>${cards}` : ''}
      <h3 class="fed-h">새 대출 <small>현재 대출금리 ${fmtPct(rate)} / 8시간</small></h3>
      ${form}`;
  }

  function loanQuoteHtml(q, amount, rate) {
    return `8시간마다 <b>${q.perPeriod}G</b> × ${q.periods}회 = 총 이자 <b>${q.totalInterest}G</b> · 만기 상환 <b>${amount}G</b><br/>
      <small>총 상환액 ${q.totalRepay}G (이자율 ${fmtPct(rate)}) · 받는 즉시 ${amount}G 입금</small>`;
  }

  // ---- 탭 3: 경매시장 ----
  function renderAuctionTab() {
    const now = nowMs();
    const who = me();
    const open = auctions.filter((a) => a.status === 'open').sort((a, b) => a.endsAt - b.endsAt);
    const closed = auctions.filter((a) => a.status !== 'open' && now - (a.closedAt || 0) < RECENT_CLOSED_MS)
      .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0)).slice(0, 6);
    const card = (a) => {
      const min = FE.minBid(a);
      const mine = who && a.bidderId === who.id;
      const owned = ownsOrPledged(charIdOf(a.unit));
      const val = ui.bids[a.id] != null ? ui.bids[a.id] : min;
      const u = a.unit;
      return `
        <div class="fed-auc ${mine ? 'is-mine' : ''}" data-auc="${esc(a.id)}">
          <div class="fed-loan-unit"><span class="fed-ava">${portrait(u)}</span><div><b>${esc(u.name)}</b><small>${classLabel(u)} · Lv.${u.level || 1} · 감정가 ${a.value}G${a.relists ? ` · 유찰 ${a.relists}회` : ''}</small></div></div>
          <div class="fed-loan-grid">
            <span>${a.currentBid ? '현재가' : '시작가'}</span><b>${a.currentBid || a.startPrice}G</b>
            <span>최고 입찰자</span><b>${a.bidderName ? esc(a.bidderName) + (mine ? ' (나)' : '') : '없음'}${a.bids ? ` · ${a.bids}회` : ''}</b>
            <span>마감</span><b>${cd(a.endsAt)}</b>
          </div>
          ${owned ? '<div class="fed-note">이미 가지고 있는 캐릭터라 입찰할 수 없습니다.</div>'
            : mine ? '<div class="fed-note">당신이 최고 입찰자입니다. 마감까지 유지하면 낙찰됩니다.</div>'
              : `<div class="fed-bid-row"><input type="number" class="fed-input" data-bid-input="${esc(a.id)}" min="${min}" step="5" value="${val}" inputmode="numeric"><button type="button" class="fed-btn is-primary" data-fed-act="bid" data-auc-id="${esc(a.id)}" ${gold() >= min ? '' : 'disabled'}>입찰</button></div>
                 <small class="fed-min">최소 ${min}G · 보유 ${gold()}G · 입찰금은 즉시 묶였다가 밀리면 돌려받습니다</small>`}
        </div>`;
    };
    const closedHtml = closed.length ? `<h3 class="fed-h">최근 마감</h3><ul class="fed-closed">${closed.map((a) => `<li><b>${esc(a.unit.name)}</b><span>${a.finalPrice ? `${esc(a.winnerName)} · ${a.finalPrice}G 낙찰` : '유찰'}</span></li>`).join('')}</ul>` : '';
    return `
      <p class="fed-help">대출을 갚지 못한 플레이어의 담보 캐릭터가 이곳에 올라옵니다. 경매는 ${FE.CONFIG.auctionHours}시간 동안 열리고, 마감 ${FE.CONFIG.antiSnipeMs / 60000}분 안에 입찰하면 마감이 연장됩니다. 낙찰금은 연준 기금으로 들어갑니다.
        낙찰받은 캐릭터는 예비 명단으로 들어옵니다. 입찰이 없으면 시작가가 ${FE.CONFIG.relistDropPct}% 내려가 다시 올라옵니다.</p>
      ${open.length ? open.map(card).join('') : '<p class="fed-empty">지금 열려 있는 경매가 없습니다.</p>'}
      ${closedHtml}`;
  }

  function renderModal() {
    const root = document.getElementById('modal-fed');
    if (!root) return;
    const body = root.querySelector('.fed-body');
    if (!body) return;
    const tabs = [['fed', '🏛️ 연준'], ['loan', '🏦 대출'], ['auction', '🔨 경매시장']];
    root.querySelector('.fed-tabs').innerHTML = tabs.map(([k, label]) => `<button type="button" class="fed-tab ${ui.tab === k ? 'is-on' : ''}" data-fed-tab="${k}">${label}${k === 'auction' ? ` <small>${auctions.filter((a) => a.status === 'open').length}</small>` : k === 'loan' && loansOf().length ? ` <small>${loansOf().length}</small>` : ''}</button>`).join('');
    root.querySelector('.fed-gold').textContent = `🪙 ${gold()}G`;
    const b = global.SupabaseBridge;
    const acct = b && b.currentUser && !b.currentUser.offline ? b.currentUser : null;
    const foot = root.querySelector('.fed-foot');
    if (foot) foot.innerHTML = acct ? `<span>계정 <b>${esc(acct.email || acct.uid.slice(0, 8))}</b>${serverMode() ? ' · 서버 연결됨' : ''}</span><button type="button" class="fed-link" data-fed-act="logout">로그아웃</button>` : '<span>오프라인 모드 — 저장 · 서버 경제 없음</span>';
    const scroll = body.scrollTop;
    body.innerHTML = ui.tab === 'loan' ? renderLoanTab() : ui.tab === 'auction' ? renderAuctionTab() : renderFedTab();
    body.scrollTop = scroll;
    bindBody(body);
  }

  function bindBody(body) {
    body.querySelectorAll('input[name="fed-collat"]').forEach((el) => {
      el.addEventListener('change', () => { ui.loanUnit = el.value; ui.loanAmount = 0; renderModal(); });
    });
    const amt = body.querySelector('#fed-loan-amt'), term = body.querySelector('#fed-loan-term');
    const upd = () => {
      if (!amt || !term) return;
      ui.loanAmount = Number(amt.value);
      ui.loanTerm = Number(term.value);
      body.querySelector('#fed-loan-amt-out').textContent = `${ui.loanAmount}G`;
      body.querySelector('#fed-loan-term-out').textContent = `${ui.loanTerm}시간 (${(ui.loanTerm / 24).toFixed(ui.loanTerm % 24 ? 1 : 0)}일)`;
      const rate = FE.lendingRateBp(fed);
      body.querySelector('#fed-loan-quote').innerHTML = loanQuoteHtml(FE.quoteLoan(ui.loanAmount, ui.loanTerm, rate), ui.loanAmount, rate);
    };
    if (amt) amt.addEventListener('input', upd);
    if (term) term.addEventListener('input', upd);
    body.querySelectorAll('[data-bid-input]').forEach((el) => {
      el.addEventListener('input', () => { ui.bids[el.dataset.bidInput] = Number(el.value); });
    });
  }

  async function onAction(btn) {
    const act = btn.dataset.fedAct;
    btn.disabled = true;
    try {
      if (act === 'propose-up') await proposeRate(1);
      else if (act === 'propose-down') await proposeRate(-1);
      else if (act === 'vote-yes') await voteMotion('yes');
      else if (act === 'vote-no') await voteMotion('no');
      else if (act === 'borrow') {
        const ok = await takeLoan(ui.loanUnit, ui.loanAmount, ui.loanTerm);
        if (ok) { ui.loanUnit = null; ui.loanAmount = 0; }
      } else if (act === 'logout') {
        if (global.confirm('로그아웃할까요? (진행은 계정에 저장되어 있습니다)') && global.SupabaseBridge) await global.SupabaseBridge.signOut();
      } else if (act === 'repay') await repayLoan(btn.dataset.loan);
      else if (act === 'bid') {
        const id = btn.dataset.aucId;
        const input = document.querySelector(`#modal-fed [data-bid-input="${CSS.escape(id)}"]`);
        const ok = await bid(id, input ? input.value : 0);
        if (ok) delete ui.bids[id];
      }
    } finally {
      renderModal();
      updateBadges();
    }
  }

  function openModal(tab) {
    if (tab) ui.tab = tab;
    ui.open = true;
    document.getElementById('modal-fed')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'modal-fed';
    overlay.className = 'rbd-overlay';
    overlay.innerHTML = `
      <div class="rbd-card fed-card" role="dialog" aria-label="연방준비기금">
        <div class="fed-head"><h2>🏦 연방준비기금</h2><span class="fed-gold"></span><button type="button" class="fed-x" data-fed-close aria-label="닫기">✕</button></div>
        <div class="fed-tabs"></div>
        <div class="fed-body"></div>
        <div class="fed-foot"></div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-fed-close]')) { closeModal(); return; }
      const t = e.target.closest('[data-fed-tab]');
      if (t) { ui.tab = t.dataset.fedTab; renderModal(); return; }
      const b = e.target.closest('[data-fed-act]');
      if (b && !b.disabled) onAction(b);
    });
    document.body.appendChild(overlay);
    renderModal();
    refresh(true).then(() => { if (ui.open) renderModal(); });
  }
  function closeModal() {
    ui.open = false;
    document.getElementById('modal-fed')?.remove();
  }

  // 헤더 버튼의 물가 배지 · 열린 창이 있으면 숫자만 갱신
  function updateBadges() {
    document.querySelectorAll('[data-fed-badge]').forEach((el) => {
      el.textContent = fed ? `×${fed.price.toFixed(2)}` : '';
      const n = loansOf().length;
      el.title = fed ? `물가 지수 ×${fed.price.toFixed(3)} · 정책금리 ${fmtPct(fed.rateBp)}${n ? ` · 대출 ${n}건` : ''}` : '';
    });
    if (typeof window.refreshPriceLabels === 'function') window.refreshPriceLabels();
  }

  // ---- 주기 작업 ----
  let ticker = null;
  let lastSettleCheck = 0;
  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (typeof state === 'undefined' || !state || !state.run) return;
      const now = nowMs();
      if (ui.open) {
        document.querySelectorAll('#modal-fed [data-fed-cd]').forEach((el) => { el.textContent = fmtCd(Number(el.dataset.fedCd) - now); });
      }
      // 이자 정산은 8시간 경계마다 일어나므로 몇 초에 한 번씩만 본다
      if (Date.now() - lastSettleCheck > 4000) {
        lastSettleCheck = Date.now();
        if (settleLoans()) {
          saveGameState(true);
          flushDefaults().then(() => refresh(true)).then(() => { if (ui.open) renderModal(); updateBadges(); });
          if (ui.open) renderModal();
        }
      }
      refresh(false).then((changed) => {
        if (changed && ui.open && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#modal-fed') && /INPUT/.test(document.activeElement.tagName))) renderModal();
      });
    }, 1000);
  }

  function onReturnByDeath() {
    // 대출은 run에 있어 회귀와 함께 사라진다. 진행 중인 입찰의 환급/낙찰은 회차가 다르면 자동으로 소멸한다 (FedEngine.claimRefund/claimWinner).
    ui.loanUnit = null; ui.loanAmount = 0; ui.bids = {};
  }

  global.FedSystem = {
    refresh, price, resolvePledges, view: () => ({ fed, auctions, members: members(), macro: liveMacro || (fed && fed.macro) || null }),
    trackSpend, financial,
    openModal, closeModal, takeLoan, repayLoan, bid, proposeRate, voteMotion, settleLoans,
    collateralCandidates, onReturnByDeath, updateBadges,
    _store: store
  };
  global.openFedModal = openModal;

  startTicker();
  setTimeout(() => refresh(true), 1500);
  // 서버 모드: 다른 곳(지분 · 지갑)에서 동기화해도 이 화면의 캐시가 같이 갱신된다
  if (global.ServerEconomy && global.ServerEconomy.onSnapshot) global.ServerEconomy.onSnapshot(applyServerSnapshot);
})(typeof window !== 'undefined' ? window : globalThis);
