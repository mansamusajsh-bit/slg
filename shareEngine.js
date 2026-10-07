// ============================================================
// shareEngine.js — 국가 지분 / 세금 정산 (순수 로직, DOM·state·Supabase를 모름)
// 사용법: <script src="shareEngine.js"></script> → window.ShareEngine
//
// 국가 기록 하나(= Supabase nationShares/{regionId})의 모양:
//   { id, regionId, rev, holders: { [holderId]: { name, bp, dummy?, loop? } },
//     payouts: { [holderId]: { gold, loop } }, createdAt }
//   - bp: 지분을 1/10000 단위 정수로 (5000 = 50%). 합이 10000보다 작으면 나머지는 무주(無主) 지분.
//   - dummy: 초기 인구를 채우는 더미 플레이어. 정산 주기 계산(보유 플레이어 수)에서는 빠진다.
//   - loop: 그 플레이어가 지분을 얻었을 때의 회귀 횟수. 회귀하면 지분이 초기화된다
//           (회귀 횟수가 달라진 항목은 본인이 접속했을 때 정리한다).
//   - payouts: 다른 플레이어가 내 지분을 사 가면 그 대금이 여기 쌓이고, 내가 접속할 때 받는다.
//   - rev: 동시 수정 방지용 버전. 저장은 "읽었을 때의 rev와 같을 때만" 한다.
//
// 지분 획득: 국가를 점령(구역 확보)하면 그 국가 지분을 살 수 있는 "구매권"이 생긴다.
//   무주 지분부터 사고, 모자라면 다른 보유자 지분을 비율대로 사 온다(보유자 몫은 할증 가격, 대금은 보유자에게).
// 세금: 서버 시각 기준 고정 주기(8h → 보유 플레이어가 늘면 4h → 1h)의 경계마다 지분율대로 지급.
//   시간당 세수는 주기와 무관하게 같다 (주기가 짧아지면 자주, 조금씩 받는다).
//   세수는 국가마다 다르다: (base + 위협도 × perThreat) × 국가 세율(region.taxMult). 받을 때 물가(인플레이션)가 곱해진다.
//   국영상점(shopEngine.js) 판매 대금은 세수에 가산된다: 국가 기록의 sales[{at,gold}]가 다음 정산 때 지분율대로 나뉜다 (물가는 이미 반영됨).
// 유물: 정산 때마다 그 국가 지분 1위가 아닌 보유자에게 확률로 유물이 나온다. 종류·등급 분포는 국가 성향(RELIC_PROFILES)이 정한다.
// ============================================================

(function (global) {
  'use strict';

  const TOTAL_BP = 10000;
  const HOUR = 3600 * 1000;

  const CONFIG = {
    // 국가 세수 (100% 기준, 시간당) = base + threat × perThreat → 위협도 2 국가는 8시간에 400G
    taxPerHourBase: 25,
    taxPerHourPerThreat: 12.5,
    // 점령 1회로 살 수 있는 최대 지분
    purchaseRightBp: 5000,
    // 1% 가격 = (8시간 세수의 1%) × 배수 → 몇 번의 8시간 정산으로 본전을 뽑는지
    priceUnownedPaybacks: 6,   // 무주 지분
    priceHolderPaybacks: 9,    // 다른 보유자에게서 사 오는 지분 (할증, 대금은 그 보유자에게)
    // 오래 접속하지 않았을 때 한 번에 받을 수 있는 최대 시간
    maxCatchupHours: 72,
    // 지분을 가진 (더미 제외) 플레이어 수에 따른 정산 주기. minHolders가 큰 것부터 맞춘다.
    intervalTiers: [
      { minHolders: 30, hours: 1 },
      { minHolders: 10, hours: 4 },
      { minHolders: 0, hours: 8 }
    ],
    // 지분 1위가 아닌 보유자가 정산 1회마다 유물을 받을 확률 = base + 위협도 × perThreat (국가별)
    relicChanceBase: 0.2,
    relicChancePerThreat: 0.04,
    maxRelicsPerPayout: 5,   // 오래 접속하지 않아 한꺼번에 정산해도 한 번에 받는 유물 수 상한
    // 처음 만드는 국가에 섞어 넣는 더미 플레이어
    dummyCount: [2, 4],
    dummyTotalBp: [3000, 7000]
  };

  // 국가 성향별 유물 분포: kind = 선물/지휘관 가중치, rarity = 등급 가중치 (campaignRegions.js의 region.relicProfile)
  const RELIC_PROFILES = {
    frontier: { label: '변경 · 보급품',   kind: { gift: 100, commander: 0 },  rarity: { common: 90, rare: 10, epic: 0, legendary: 0 } },
    merchant: { label: '상업 · 선물 위주', kind: { gift: 80, commander: 20 },  rarity: { common: 50, rare: 40, epic: 10, legendary: 0 } },
    tribal:   { label: '부족 · 균형',     kind: { gift: 60, commander: 40 },  rarity: { common: 55, rare: 35, epic: 9, legendary: 1 } },
    martial:  { label: '군사 · 지휘관 위주', kind: { gift: 30, commander: 70 }, rarity: { common: 30, rare: 45, epic: 22, legendary: 3 } },
    mystic:   { label: '신비 · 고등급',   kind: { gift: 40, commander: 60 },  rarity: { common: 5, rare: 25, epic: 50, legendary: 20 } }
  };
  const DEFAULT_RELIC_PROFILE = 'tribal';

  const DUMMY_NAMES = [
    '철혈백작', 'Lumi_K', '금저울상단', 'Guest_4821', '붉은매용병단', 'Arden', '북부곡물왕',
    'Guest_7302', '흑요석', 'mira_lover', '은행가베른', '세이렌', 'Guest_1957', '방랑기사단',
    'Rokan_fan', '소금장수', 'Valen', '모래시계', 'Guest_6640', '청동망치'
  ];

  // ---- 난수 (seedEngine.js 없이도 돌아가게 자체 구현: 같은 regionId → 같은 더미 구성) ----
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hashString(String(seed));
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (r, min, max) => min + Math.floor(r() * (max - min + 1));

  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---- 국가 기록 ----
  function createNation(regionId, nowMs = 0) {
    const r = rng(`nation|${regionId}`);
    const count = randInt(r, CONFIG.dummyCount[0], CONFIG.dummyCount[1]);
    const total = randInt(r, CONFIG.dummyTotalBp[0] / 100, CONFIG.dummyTotalBp[1] / 100) * 100;
    const names = DUMMY_NAMES.slice();
    const weights = [];
    for (let i = 0; i < count; i++) weights.push(1 + r() * 3);
    const shares = splitBp(total, weights);
    const holders = {};
    shares.forEach((bp, i) => {
      const name = names.splice(Math.floor(r() * names.length), 1)[0];
      holders[`dummy_${regionId}_${i}`] = { name, bp, dummy: true };
    });
    return { id: regionId, regionId, rev: 0, holders, payouts: {}, createdAt: nowMs ? new Date(nowMs).toISOString() : null };
  }

  // total을 weights 비율로 나눈 정수 목록 (합이 정확히 total, 최대 나머지 방식)
  function splitBp(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum || total <= 0) return weights.map(() => 0);
    const raw = weights.map((w) => (total * w) / sum);
    const out = raw.map(Math.floor);
    let rest = total - out.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .forEach(([, i]) => { if (rest > 0) { out[i]++; rest--; } });
    return out;
  }

  function holderBp(nation, holderId) {
    const h = nation && nation.holders && nation.holders[holderId];
    return h ? Number(h.bp) || 0 : 0;
  }
  function unownedBp(nation) {
    const used = Object.values((nation && nation.holders) || {}).reduce((a, h) => a + (Number(h.bp) || 0), 0);
    return Math.max(0, TOTAL_BP - used);
  }
  // 보유 비율이 큰 순서 (화면 표시용). 무주 지분은 포함하지 않는다.
  function listHolders(nation) {
    return Object.entries((nation && nation.holders) || {})
      .filter(([, h]) => (Number(h.bp) || 0) > 0)
      .map(([id, h]) => ({ id, name: h.name, bp: Number(h.bp) || 0, dummy: !!h.dummy }))
      .sort((a, b) => b.bp - a.bp || String(a.id).localeCompare(String(b.id)));
  }

  // ---- 세수 / 주기 ----
  function taxPerHour(region) {
    const threat = Number(region && region.threat) || 1;
    const mult = Number(region && region.taxMult);
    return (CONFIG.taxPerHourBase + threat * CONFIG.taxPerHourPerThreat) * (mult > 0 ? mult : 1);
  }
  function taxPerSettlement(region, hours) {
    return taxPerHour(region) * hours;
  }
  // 지분을 1bp 이상 가진 더미가 아닌 플레이어 수 (모든 국가를 합쳐 중복 없이)
  function countRealHolders(nations) {
    const ids = new Set();
    (nations || []).forEach((n) => Object.entries((n && n.holders) || {}).forEach(([id, h]) => {
      if (!h.dummy && (Number(h.bp) || 0) > 0) ids.add(id);
    }));
    return ids.size;
  }
  function intervalHours(realHolderCount) {
    const tier = CONFIG.intervalTiers.find((t) => realHolderCount >= t.minHolders);
    return tier ? tier.hours : 8;
  }
  // 정산 시각은 UTC 0시 기준 hours 배수 (8h → 00·08·16시 UTC = 한국 09·17·01시)
  function lastSettlementAt(nowMs, hours) {
    const step = hours * HOUR;
    return Math.floor(nowMs / step) * step;
  }
  function nextSettlementAt(nowMs, hours) {
    return lastSettlementAt(nowMs, hours) + hours * HOUR;
  }
  // (fromMs, toMs] 안에 있는 정산 시각 개수. 최대 maxCatchupHours 만큼만 거슬러 올라간다.
  function settlementsBetween(fromMs, toMs, hours) {
    if (!(toMs > fromMs)) return 0;
    const step = hours * HOUR;
    const from = Math.max(fromMs, toMs - CONFIG.maxCatchupHours * HOUR);
    return Math.max(0, Math.floor(toMs / step) - Math.floor(from / step));
  }

  /**
   * 한 플레이어가 (fromMs, toMs] 사이 정산에서 받을 세금. 지금 가진 지분 기준으로 계산한다.
   * @returns {{ count, total, byRegion: {[regionId]: gold}, settledUntil }}
   */
  function computePayout({ nations, regions, holderId, fromMs, toMs, hours }) {
    const count = settlementsBetween(fromMs, toMs, hours);
    const byRegion = {};
    const shopByRegion = {};   // 국영상점 매출 가산분 (물가가 이미 반영되어 있다)
    let total = 0;
    let shopTotal = 0;
    const settledUntil = count > 0 ? lastSettlementAt(toMs, hours) : fromMs;
    if (count > 0) {
      const from = Math.max(fromMs, toMs - CONFIG.maxCatchupHours * HOUR);
      (nations || []).forEach((n) => {
        const bp = holderBp(n, holderId);
        if (!bp) return;
        const gold = Math.floor((taxPerSettlement(regions[n.regionId], hours) * bp / TOTAL_BP) * count);
        if (gold > 0) { byRegion[n.regionId] = gold; total += gold; }
        const shop = Math.floor(shopRevenue(n, from, settledUntil) * bp / TOTAL_BP);
        if (shop > 0) { shopByRegion[n.regionId] = shop; shopTotal += shop; }
      });
    }
    return { count, total, byRegion, shopTotal, shopByRegion, settledUntil };
  }

  // ---- 국영상점 매출 (세수 가산) ----
  // 국가 기록의 sales: [{ at, gold }] — 상점에서 팔린 대금 중 세수에 가산되는 금액. 정산이 지나면 쓸모가 없어 오래된 것은 버린다.
  function shopRevenue(nation, fromMs, toMs) {
    return ((nation && nation.sales) || []).reduce((a, s) => (s.at > fromMs && s.at <= toMs ? a + (Number(s.gold) || 0) : a), 0);
  }
  /** 매출 1건을 더한 새 국가 기록 (원본은 건드리지 않는다) */
  function addShopSale(nation, gold, atMs) {
    const next = clone(nation);
    const keepFrom = atMs - (CONFIG.maxCatchupHours + 24) * HOUR;
    next.sales = (next.sales || []).filter((s) => s.at > keepFrom);
    if (gold > 0) next.sales.push({ at: atMs, gold: Math.floor(gold) });
    next.rev = (Number(nation.rev) || 0) + 1;
    return next;
  }

  // ---- 유물 보상 (지분 1위 제외) ----
  function relicProfile(region) {
    return RELIC_PROFILES[region && region.relicProfile] || RELIC_PROFILES[DEFAULT_RELIC_PROFILE];
  }
  // 이 국가에서 holderId가 지분 1위인가? (다른 누구보다 많거나 같으면 1위로 본다 — 동률은 1위 취급)
  function isTopHolder(nation, holderId) {
    const mine = holderBp(nation, holderId);
    if (!(mine > 0)) return false;
    return !Object.entries((nation && nation.holders) || {}).some(([id, h]) => id !== holderId && (Number(h.bp) || 0) > mine);
  }
  function relicChance(region) {
    const threat = Number(region && region.threat) || 1;
    return Math.min(1, CONFIG.relicChanceBase + threat * CONFIG.relicChancePerThreat);
  }
  /** 국가 성향에 맞춰 유물 하나를 고른다. relics: 정의 배열 [{ id, kind, rarity }]. 후보가 없으면 null. */
  function pickRelic(relics, region, rand = Math.random, excludeIds) {
    const p = relicProfile(region);
    const skip = new Set(excludeIds || []);
    const pool = [];
    let sum = 0;
    (relics || []).forEach((d) => {
      if (!d || skip.has(String(d.id))) return;
      const w = (Number(p.kind[d.kind]) || 0) * (Number(p.rarity[d.rarity]) || 0);
      if (w > 0) { pool.push([d, w]); sum += w; }
    });
    if (!pool.length) return null;
    let x = rand() * sum;
    for (const [d, w] of pool) { x -= w; if (x < 0) return d; }
    return pool[pool.length - 1][0];
  }
  /**
   * 정산 count회 동안 holderId가 받을 유물 목록 [{ regionId, relic }]. 지분을 가졌지만 1위가 아닌 국가마다 정산 1회당 확률로 굴린다.
   * @param regionIds 지분에서 세금을 받은 국가 (없으면 보유 국가 전부)
   */
  function rollTaxRelics({ nations, regions, holderId, count, relics, regionIds, ownedCommanderIds, rand = Math.random }) {
    const out = [];
    const owned = new Set(ownedCommanderIds || []);
    const only = regionIds ? new Set(regionIds) : null;
    (nations || []).forEach((n) => {
      if (out.length >= CONFIG.maxRelicsPerPayout) return;
      if (only && !only.has(n.regionId)) return;
      if (!(holderBp(n, holderId) > 0) || isTopHolder(n, holderId)) return;
      const region = regions[n.regionId];
      const chance = relicChance(region);
      for (let i = 0; i < count && out.length < CONFIG.maxRelicsPerPayout; i++) {
        if (rand() >= chance) continue;
        const d = pickRelic(relics, region, rand, [...owned]);
        if (!d) break;
        if (d.kind === 'commander') owned.add(String(d.id));
        out.push({ regionId: n.regionId, relic: d });
      }
    });
    return out;
  }

  // ---- 구매 ----
  // mult: 물가 배율. 세수(수입)가 물가를 따라 오르므로 지분 값도 같이 오른다.
  function pricePerBp(region, fromHolder, mult = 1) {
    const paybacks = fromHolder ? CONFIG.priceHolderPaybacks : CONFIG.priceUnownedPaybacks;
    return (taxPerSettlement(region, 8) / TOTAL_BP) * paybacks * (mult > 0 ? mult : 1);
  }

  /**
   * buyerId가 bp만큼 살 때의 견적. 무주 지분부터, 모자라면 다른 보유자 지분을 보유 비율대로 사 온다.
   * 살 수 있는 만큼으로 줄여서 돌려준다 (bp가 0이면 살 것이 없다).
   * @returns {{ bp, fromUnowned, fromHolders: {[id]: bp}, cost, payouts: {[id]: gold} }}
   */
  function quotePurchase(nation, region, buyerId, wantBp, mult = 1) {
    const want = Math.max(0, Math.floor(Number(wantBp) || 0));
    const free = unownedBp(nation);
    const fromUnowned = Math.min(want, free);
    const others = Object.entries(nation.holders || {})
      .filter(([id, h]) => id !== buyerId && (Number(h.bp) || 0) > 0);
    const othersBp = others.reduce((a, [, h]) => a + (Number(h.bp) || 0), 0);
    const fromOthers = Math.min(want - fromUnowned, othersBp);
    const fromHolders = {};
    if (fromOthers > 0) {
      // 각자 가진 만큼을 넘지 않게 비율 분배 (splitBp 결과는 가진 양 이하)
      const parts = splitBp(fromOthers, others.map(([, h]) => Number(h.bp) || 0));
      others.forEach(([id], i) => { if (parts[i] > 0) fromHolders[id] = parts[i]; });
    }
    const unitUnowned = pricePerBp(region, false, mult);
    const unitHolder = pricePerBp(region, true, mult);
    const payouts = {};
    Object.entries(fromHolders).forEach(([id, bp]) => { payouts[id] = Math.ceil(bp * unitHolder); });
    const cost = Math.ceil(fromUnowned * unitUnowned) + Object.values(payouts).reduce((a, b) => a + b, 0);
    return { bp: fromUnowned + fromOthers, fromUnowned, fromHolders, cost, payouts };
  }

  /** 견적대로 지분을 옮긴 새 국가 기록 (원본은 건드리지 않는다). 더미에게 가는 대금은 버린다. */
  function applyPurchase(nation, quote, buyer) {
    const next = clone(nation);
    next.holders = next.holders || {};
    next.payouts = next.payouts || {};
    Object.entries(quote.fromHolders).forEach(([id, bp]) => {
      const h = next.holders[id];
      if (!h) return;
      h.bp = (Number(h.bp) || 0) - bp;
      if (h.bp <= 0) delete next.holders[id];
      if (!h.dummy && quote.payouts[id] > 0) {
        const prev = next.payouts[id];
        const sameLoop = prev && prev.loop === h.loop;
        next.payouts[id] = { gold: (sameLoop ? prev.gold : 0) + quote.payouts[id], loop: h.loop };
      }
    });
    const mine = next.holders[buyer.id];
    next.holders[buyer.id] = { name: buyer.name, bp: (mine && mine.loop === buyer.loop ? Number(mine.bp) || 0 : 0) + quote.bp, loop: buyer.loop };
    next.rev = (Number(nation.rev) || 0) + 1;
    return next;
  }

  /** 한 플레이어의 지분과 미수령 대금을 없앤 새 기록 (회귀 시). 바뀐 것이 없으면 null. */
  function releaseHolder(nation, holderId) {
    const has = nation.holders && nation.holders[holderId];
    const owed = nation.payouts && nation.payouts[holderId];
    if (!has && !owed) return null;
    const next = clone(nation);
    if (next.holders) delete next.holders[holderId];
    if (next.payouts) delete next.payouts[holderId];
    next.rev = (Number(nation.rev) || 0) + 1;
    return next;
  }

  /** 이전 회차(loop가 다른) 지분/대금이면 정리 대상 */
  function isStale(nation, holderId, loop) {
    const h = nation.holders && nation.holders[holderId];
    const p = nation.payouts && nation.payouts[holderId];
    return !!((h && h.loop !== loop) || (p && p.loop !== loop));
  }

  /** 지분 매각 대금 수령: { nation(새 기록), gold }. 받을 게 없으면 null. */
  function claimPayout(nation, holderId, loop) {
    const p = nation.payouts && nation.payouts[holderId];
    if (!p || p.loop !== loop || !(p.gold > 0)) return null;
    const next = clone(nation);
    delete next.payouts[holderId];
    next.rev = (Number(nation.rev) || 0) + 1;
    return { nation: next, gold: p.gold };
  }

  global.ShareEngine = {
    TOTAL_BP, CONFIG, DUMMY_NAMES, RELIC_PROFILES,
    createNation, splitBp, holderBp, unownedBp, listHolders,
    taxPerHour, taxPerSettlement, countRealHolders, intervalHours,
    lastSettlementAt, nextSettlementAt, settlementsBetween, computePayout, shopRevenue, addShopSale,
    relicProfile, isTopHolder, relicChance, pickRelic, rollTaxRelics,
    pricePerBp, quotePurchase, applyPurchase, releaseHolder, isStale, claimPayout
  };
})(typeof window !== 'undefined' ? window : globalThis);
