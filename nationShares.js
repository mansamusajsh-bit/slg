// ============================================================
// nationShares.js — 국가 지분 시스템 연결부 (게임 state ↔ ShareEngine ↔ Supabase)
// 사용법: <script src="nationShares.js"></script> (shareEngine.js · game.js 다음, campaignMap.js 앞)
//
// - 규칙/계산: shareEngine.js (순수 로직)
// - 국가별 지분: Supabase nationShares/{regionId} — 전 플레이어 공유. Supabase가 없으면 이 탭 안에서만 메모리로 돈다.
// - 내 회차 상태(회귀 시 초기화): state.run.shareRights  { [regionId]: { maxBp, boughtBp, grantedAt } }  구매권
//                                 state.run.shareLedger  { lastSettledAt, last }                       세금 정산 기록
// - 회귀하면 내 지분은 전부 풀린다. 네트워크 실패로 못 풀었어도 holders[내 id].loop가 지금 회귀 횟수와 다르면
//   다음 접속 때 정리한다.
// ============================================================

(function (global) {
  'use strict';

  const SE = global.ShareEngine;
  const REFRESH_MS = 30 * 1000;      // 작전지도에 있을 때 국가 기록을 다시 읽는 최소 간격
  const CLOCK_REFRESH_MS = 10 * 60 * 1000;
  const CAS_RETRIES = 3;

  // ---- 저장소: Supabase가 있으면 공유, 없으면 메모리 ----
  const memory = new Map();
  const cloud = () => !!(global.SupabaseBridge && global.SupabaseBridge.isReady && global.SupabaseBridge.casNationShare);
  const store = {
    async list() {
      if (cloud()) return global.SupabaseBridge.listNationShares();
      return [...memory.values()].map((n) => JSON.parse(JSON.stringify(n)));
    },
    async get(id) {
      if (cloud()) return global.SupabaseBridge.getNationShare(id);
      return memory.has(id) ? JSON.parse(JSON.stringify(memory.get(id))) : null;
    },
    // expectedRev === null → 없을 때만 만든다
    async cas(id, expectedRev, value) {
      if (cloud()) return global.SupabaseBridge.casNationShare(id, expectedRev, value);
      const cur = memory.get(id);
      if (expectedRev == null ? !!cur : (!cur || cur.rev !== expectedRev)) return false;
      memory.set(id, JSON.parse(JSON.stringify(value)));
      return true;
    }
  };

  // ---- 서버 시각 ----
  let clockOffset = 0;
  let clockSyncedAt = 0;
  async function syncClock(force) {
    if (!cloud()) { clockOffset = 0; return; }
    if (!force && Date.now() - clockSyncedAt < CLOCK_REFRESH_MS) return;
    try {
      const t0 = Date.now();
      const server = await global.SupabaseBridge.getServerTime();
      const t1 = Date.now();
      if (Number.isFinite(server)) { clockOffset = server - (t0 + t1) / 2; clockSyncedAt = t1; }
    } catch (e) { console.warn('[NationShares] 서버 시각 동기화 실패 — 기기 시각을 씁니다.', e); }
  }
  const serverNow = () => Date.now() + clockOffset;

  // ---- 나 ----
  function me() {
    if (typeof state === 'undefined' || !state) return null;
    if (!state.guest && typeof saveGameState === 'function') saveGameState(true); // guest id를 만든다
    if (!state.guest || !state.guest.id) return null;
    return {
      id: String(state.guest.id),
      name: (state.commander && state.commander.name) || String(state.guest.id),
      loop: Number(state.player && state.player.loopCount) || 0
    };
  }
  function runState() {
    const run = state.run;
    if (!run.shareRights) run.shareRights = {};
    if (!run.shareLedger) run.shareLedger = { lastSettledAt: null, last: null };
    return run;
  }
  const log = (msg, type = 'gold') => { if (typeof addLog === 'function') addLog(msg, type); };
  const toast = (msg, type) => global.UI && global.UI.showToast && global.UI.showToast(msg, type);
  const regionTitle = (id) => (REGIONS[id] ? REGIONS[id].title.ko : id);

  // ---- 캐시 ----
  const nations = {};           // regionId → 국가 기록 (마지막으로 읽은 것)
  let lastRefreshAt = 0;
  let refreshing = null;
  let busy = false;

  function nationList() { return Object.values(nations); }
  function currentInterval() { return SE.intervalHours(SE.countRealHolders(nationList())); }

  // 국가 기록 하나를 읽고 → fn(기록)이 돌려준 새 기록을 rev 조건부로 저장. 충돌하면 다시 읽어 재시도.
  // fn이 null을 돌려주면 저장하지 않는다. 성공하면 { nation, result }.
  async function mutate(regionId, fn) {
    for (let i = 0; i < CAS_RETRIES; i++) {
      const stored = await store.get(regionId);
      const base = stored || SE.createNation(regionId, serverNow());
      const out = fn(base);
      if (!out) { nations[regionId] = base; return { nation: base, result: null }; }
      const ok = await store.cas(regionId, stored ? stored.rev : null, out.nation);
      if (ok) { nations[regionId] = out.nation; return { nation: out.nation, result: out.result }; }
    }
    throw new Error('다른 플레이어와 동시에 수정되어 저장하지 못했습니다. 잠시 후 다시 시도하세요.');
  }

  /**
   * 국가 기록을 다시 읽고, 없는 국가는 더미 플레이어를 넣어 만들고, 내 이전 회차 지분 정리 →
   * 매각 대금 수령 → 세금 정산까지 한 번에 한다. 작전지도를 그릴 때 불린다 (REFRESH_MS 간격).
   */
  function refresh(force) {
    if (refreshing) return refreshing;
    if (!force && Date.now() - lastRefreshAt < REFRESH_MS) return Promise.resolve(false);
    if (typeof cloudLoadPending !== 'undefined' && cloudLoadPending) return Promise.resolve(false); // 세이브 복원 전
    refreshing = (async () => {
      try {
        await syncClock(false);
        const rows = await store.list();
        rows.forEach((n) => { if (n && n.regionId && REGIONS[n.regionId]) nations[n.regionId] = n; });
        for (const id of Object.keys(REGIONS)) {
          if (!nations[id]) {
            const fresh = SE.createNation(id, serverNow());
            if (await store.cas(id, null, fresh)) nations[id] = fresh;
            else nations[id] = (await store.get(id)) || fresh;
          }
        }
        const who = me();
        if (who) {
          let gold = 0;
          for (const id of Object.keys(nations)) {
            const n = nations[id];
            if (SE.isStale(n, who.id, who.loop)) await mutate(id, (b) => { const x = SE.releaseHolder(b, who.id); return x && { nation: x }; });
            else if (n.payouts && n.payouts[who.id]) {
              const { result } = await mutate(id, (b) => { const c = SE.claimPayout(b, who.id, who.loop); return c && { nation: c.nation, result: c.gold }; });
              if (result) { gold += result; log(`💰 [지분 매각] ${regionTitle(id)} 지분 일부가 다른 플레이어에게 매입됨 — 대금 +${result}G`); }
            }
          }
          if (gold) state.gold += gold;
          const settled = settle();
          if (gold || settled) saveGameState(true);
        }
        lastRefreshAt = Date.now();
        return true;
      } catch (e) {
        console.warn('[NationShares] 갱신 실패', e);
        lastRefreshAt = Date.now();
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // 지난 정산 이후 지나간 정산 시각마다 지금 지분율대로 세금을 받는다.
  function settle() {
    const who = me();
    if (!who) return null;
    const run = runState();
    const ledger = run.shareLedger;
    const now = serverNow();
    const holds = nationList().some((n) => n.holders && n.holders[who.id] && n.holders[who.id].loop === who.loop && SE.holderBp(n, who.id) > 0);
    if (ledger.lastSettledAt == null || !holds) { ledger.lastSettledAt = now; return null; }
    const hours = currentInterval();
    const res = SE.computePayout({ nations: nationList(), regions: REGIONS, holderId: who.id, fromMs: ledger.lastSettledAt, toMs: now, hours });
    if (!res.count) return null;
    ledger.lastSettledAt = res.settledUntil;
    ledger.last = { at: res.settledUntil, total: res.total, count: res.count, hours };
    if (res.total > 0) {
      state.gold += res.total;
      const detail = Object.entries(res.byRegion).map(([id, g]) => `${REGIONS[id].name.ko} ${g}G`).join(', ');
      log(`🏛️ [세금 정산] ${hours}시간 주기 ${res.count}회분 +${res.total}G (${detail})`);
      toast(`🏛️ 세금 정산 +${res.total}G`, 'success');
    }
    return res;
  }

  // ---- 게임 이벤트 ----
  /** 구역 확보(점령) → 그 국가 지분 구매권 */
  function onRegionSecured(regionId) {
    if (!REGIONS[regionId]) return;
    const run = runState();
    const prev = run.shareRights[regionId];
    run.shareRights[regionId] = { maxBp: SE.CONFIG.purchaseRightBp, boughtBp: prev ? prev.boughtBp : 0, grantedAt: serverNow() };
    log(`📜 [지분 구매권] ${regionTitle(regionId)} 점령 — 지분을 최대 ${SE.CONFIG.purchaseRightBp / 100}%까지 살 수 있습니다. (작전지도에서 구매)`);
  }

  /** 사망회귀: 내 지분을 전부 푼다 (실패해도 다음 접속 때 loop 비교로 정리된다). */
  async function onReturnByDeath() {
    const who = me();
    if (!who) return;
    try {
      const rows = await store.list();
      for (const n of rows) {
        if (!n || !n.regionId) continue;
        if ((n.holders && n.holders[who.id]) || (n.payouts && n.payouts[who.id])) {
          await mutate(n.regionId, (b) => { const x = SE.releaseHolder(b, who.id); return x && { nation: x }; });
        }
      }
      log('🕳️ [지분 초기화] 회귀와 함께 모든 국가 지분을 잃었습니다.', 'danger');
    } catch (e) {
      console.warn('[NationShares] 회귀 지분 정리 실패 — 다음 접속 때 정리합니다.', e);
    }
    lastRefreshAt = 0;
  }

  // ---- 구매 ----
  function rightRemaining(regionId) {
    const r = state.run && state.run.shareRights && state.run.shareRights[regionId];
    return r ? Math.max(0, r.maxBp - r.boughtBp) : 0;
  }

  /** 지금 캐시 기준 견적 (화면 표시용). wantBp는 구매권 남은 양으로 잘린다. */
  function quote(regionId, wantBp) {
    const who = me();
    const n = nations[regionId];
    if (!who || !n) return null;
    return SE.quotePurchase(n, REGIONS[regionId], who.id, Math.min(wantBp, rightRemaining(regionId)));
  }

  /** 가진 골드로 살 수 있는 최대량 (bp) */
  function maxAffordableBp(regionId) {
    let lo = 0, hi = rightRemaining(regionId);
    const gold = Number(state.gold) || 0;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const q = quote(regionId, mid);
      if (q && q.bp === mid && q.cost <= gold) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  async function buy(regionId, wantBp) {
    if (busy) return null;
    const who = me();
    if (!who || !REGIONS[regionId]) return null;
    const want = Math.min(Math.floor(wantBp), rightRemaining(regionId));
    if (want <= 0) { toast('📜 이 국가의 지분 구매권이 없습니다. 점령하면 생깁니다.', 'warning'); return null; }
    busy = true;
    try {
      await syncClock(false);
      settle(); // 새로 산 지분이 지난 정산분까지 받지 않도록 먼저 정산
      const { result } = await mutate(regionId, (base) => {
        const q = SE.quotePurchase(base, REGIONS[regionId], who.id, want);
        if (q.bp <= 0) return null;
        if (q.cost > (Number(state.gold) || 0)) return null;
        return { nation: SE.applyPurchase(base, q, who), result: q };
      });
      if (!result) {
        const q = quote(regionId, want);
        toast(q && q.bp > 0 ? `💸 골드가 부족합니다 (필요 ${q.cost}G)` : '살 수 있는 지분이 없습니다.', 'warning');
        return null;
      }
      state.gold -= result.cost;
      const run = runState();
      run.shareRights[regionId].boughtBp += result.bp;
      if (run.shareLedger.lastSettledAt == null) run.shareLedger.lastSettledAt = serverNow();
      const fromOthers = Object.values(result.fromHolders).reduce((a, b) => a + b, 0);
      log(`📈 [지분 매입] ${regionTitle(regionId)} ${(result.bp / 100).toFixed(2)}% 매입 (-${result.cost}G)` +
        (fromOthers ? ` — 기존 보유자에게서 ${(fromOthers / 100).toFixed(2)}%` : ''));
      toast(`📈 ${REGIONS[regionId].name.ko} 지분 +${(result.bp / 100).toFixed(2)}%`, 'success');
      saveGameState(true);
      return result;
    } catch (e) {
      console.warn('[NationShares] 매입 실패', e);
      toast(`⚠️ ${e.message || '지분 매입 실패'}`, 'warning');
      return null;
    } finally {
      busy = false;
    }
  }

  // ---- 화면용 요약 ----
  function view(regionId) {
    const who = me();
    const hours = currentInterval();
    const now = serverNow();
    const n = regionId ? nations[regionId] : null;
    const myId = who && who.id;
    const holdings = nationList()
      .map((x) => ({ regionId: x.regionId, bp: myId ? SE.holderBp(x, myId) : 0 }))
      .filter((x) => x.bp > 0 && REGIONS[x.regionId])
      .sort((a, b) => b.bp - a.bp);
    const perSettlement = holdings.reduce((a, h) => a + SE.taxPerSettlement(REGIONS[h.regionId], hours) * h.bp / SE.TOTAL_BP, 0);
    return {
      ready: nationList().length > 0,
      cloud: cloud(),
      myId,
      hours,
      realHolders: SE.countRealHolders(nationList()),
      nextAt: SE.nextSettlementAt(now, hours),
      now,
      holdings,
      perSettlement: Math.floor(perSettlement),
      last: state.run && state.run.shareLedger ? state.run.shareLedger.last : null,
      nation: n ? {
        holders: SE.listHolders(n),
        unowned: SE.unownedBp(n),
        mine: myId ? SE.holderBp(n, myId) : 0,
        taxPerSettlement: Math.floor(SE.taxPerSettlement(REGIONS[regionId], hours))
      } : null,
      right: regionId ? rightRemaining(regionId) : 0,
      busy
    };
  }

  global.NationShares = {
    refresh, settle, buy, quote, maxAffordableBp, view, serverNow,
    onRegionSecured, onReturnByDeath,
    _nations: nations
  };
})(typeof window !== 'undefined' ? window : globalThis);
