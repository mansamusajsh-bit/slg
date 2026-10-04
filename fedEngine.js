// ============================================================
// fedEngine.js — 연방준비기금(연준) · 인플레이션 · 담보대출 · 캐릭터 경매 (순수 로직, DOM·state·Supabase를 모름)
// 사용법: <script src="fedEngine.js"></script> → window.FedEngine
//
// 연준 기록 하나(= Supabase fedState/main)의 모양:
//   { id, rev, rateBp, price, lastTickAt, tickCount, lastRateChangeAt, history: [{ at, price, rateBp }],
//     motion: null | { id, dir, proposerId, proposerName, createdAt, expiresAt, votes: { [memberId]: { name, v } } },
//     lastMotion: null | { result, dir, at, rateBp, yes, no, total } }
//   - rateBp: 정책금리. 8시간당 이자율을 1/10000 단위로 (150 = 8시간마다 1.5%).
//   - price: 물가 지수 (1.0 = 기준). 골드로 사고파는 모든 가격에 곱해진다.
//   - 물가는 서버 시각 기준 8시간(틱)마다 한 번씩 움직인다: 변동률 = 기본 상승분 − 민감도 × (정책금리 − 중립금리) ± 잡음.
//     금리가 중립보다 높으면 물가가 눌리고, 낮으면 더 오른다.
//
// 연준 위원: 국가별 지분을 가장 많이 가진 (더미가 아닌) 플레이어. 한 사람이 여러 국가 1위여도 한 표.
//   금리 인상/인하 안건은 위원이 발의하고, 위원 과반(전체 위원의 절반 초과)이 찬성하면 확정된다.
//
// 대출: 캐릭터 담보 → 담보가치 × LTV까지. 이자는 대출 시점부터 8시간마다 원금 × (정책금리 + 가산금리) 를 낸다.
//   (대출 때 금리가 고정된다.) 만기는 8시간 단위로 최대 1주일. 만기에 갚지 못하거나 이자를 연속으로 못 내면
//   담보 캐릭터를 빼앗기고 경매시장에 올라간다.
// 경매: 입찰금은 즉시 에스크로(입찰자의 골드에서 빠짐), 밀려난 입찰자는 환급을 받는다.
//   마감 직전 입찰은 마감 시각을 늘린다.
// ============================================================

(function (global) {
  'use strict';

  const HOUR = 3600 * 1000;
  const MINUTE = 60 * 1000;

  const CONFIG = {
    // ---- 연준 ----
    tickHours: 8,
    rateInitBp: 150,
    rateMinBp: 25,
    rateMaxBp: 500,
    rateStepBp: 25,
    neutralBp: 150,            // 이 금리에서 물가는 baseDriftPct 만큼 오른다
    baseDriftPct: 0.30,        // 틱당 기본 상승률 (%)
    sensitivityPct: 0.20,      // 금리 1%p 차이당 틱당 물가 변동 (%p)
    noisePct: 0.10,            // 틱당 잡음 폭 (±%p)
    priceMin: 0.5,
    priceMax: 5,
    maxCatchupTicks: 90,       // 오래 아무도 접속하지 않았을 때 한꺼번에 밀어 주는 최대 틱 수
    motionTtlHours: 24,        // 안건 유효 시간
    rateCooldownHours: 8,      // 금리 변경 후 다음 변경까지
    minSeatBp: 100,            // 위원이 되려면 국가 지분 1% 이상
    historyLen: 30,
    // ---- 대출 ----
    spreadBp: 50,              // 대출금리 = 정책금리 + 가산금리
    ltv: 0.6,                  // 담보가치 대비 한도
    minLoan: 50,
    termStepHours: 8,
    minTermHours: 8,
    maxTermHours: 168,         // 최대 1주일
    maxActiveLoans: 3,
    missLimit: 3,              // 이자를 이만큼 연속으로 못 내면 만기 전이라도 담보 몰수
    // ---- 경매 ----
    auctionHours: 24,
    antiSnipeMs: 5 * MINUTE,
    minIncrementPct: 5,
    minIncrementFlat: 10,
    openPct: 0.5,              // 시작가 = 담보가치 × 이 비율
    relistDropPct: 30,         // 유찰되면 시작가를 이만큼 낮춰 다시 올린다
    minStartPrice: 10
  };

  const TICK_MS = () => CONFIG.tickHours * HOUR;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- 난수 (틱 번호 → 같은 잡음. 어느 클라이언트가 밀어도 같은 결과) ----
  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function unitRandom(seed) {
    let a = hashString(String(seed));
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ============================================================
  // 연준 상태 · 물가
  // ============================================================
  function lastTickBoundary(nowMs) {
    return Math.floor(nowMs / TICK_MS()) * TICK_MS();
  }
  function nextTickAt(nowMs) {
    return lastTickBoundary(nowMs) + TICK_MS();
  }

  function createFed(nowMs) {
    const at = lastTickBoundary(nowMs);
    return {
      id: 'main', rev: 0,
      rateBp: CONFIG.rateInitBp, price: 1,
      lastTickAt: at, tickCount: 0, lastRateChangeAt: 0,
      history: [{ at, price: 1, rateBp: CONFIG.rateInitBp }],
      motion: null, lastMotion: null
    };
  }

  /** 정책금리 rateBp에서 틱 하나가 물가를 몇 % 움직이는가 (잡음 제외) */
  function driftPct(rateBp) {
    return CONFIG.baseDriftPct - CONFIG.sensitivityPct * ((rateBp - CONFIG.neutralBp) / 100);
  }

  /** 지나간 틱을 모두 적용한 새 연준 기록. 밀 것이 없으면 같은 객체를 돌려준다. */
  function advance(fed, nowMs) {
    const boundary = lastTickBoundary(nowMs);
    if (boundary <= fed.lastTickAt) return fed;
    const missed = Math.floor((boundary - fed.lastTickAt) / TICK_MS());
    const steps = Math.min(missed, CONFIG.maxCatchupTicks);
    const next = clone(fed);
    for (let i = 1; i <= steps; i++) {
      const n = next.tickCount + 1;
      const noise = (unitRandom(`fed|${n}`) * 2 - 1) * CONFIG.noisePct;
      const pct = driftPct(next.rateBp) + noise;
      next.price = clamp(Math.round(next.price * (1 + pct / 100) * 10000) / 10000, CONFIG.priceMin, CONFIG.priceMax);
      next.tickCount = n;
      next.history.push({ at: next.lastTickAt + i * TICK_MS(), price: next.price, rateBp: next.rateBp });
    }
    next.lastTickAt = boundary;
    if (next.history.length > CONFIG.historyLen) next.history = next.history.slice(-CONFIG.historyLen);
    next.rev = (Number(fed.rev) || 0) + 1;
    return next;
  }

  /** 가격 배율을 적용한 골드 (기준가 → 현재가). 소액은 1G, 100G 이상은 5G 단위로 맞춘다. */
  function scale(base, price) {
    const v = Number(base) * (Number(price) > 0 ? Number(price) : 1);
    if (!(v > 0)) return 0;
    const unit = v >= 100 ? 5 : 1;
    return Math.max(1, Math.round(v / unit) * unit);
  }

  function lendingRateBp(fed) {
    return fed.rateBp + CONFIG.spreadBp;
  }

  // ============================================================
  // 위원회 · 안건
  // ============================================================
  /**
   * 국가별 지분 1위(더미 제외) → 위원 목록. 한 사람이 여러 국가 1위여도 한 명으로 센다.
   * @returns {Array<{ id, name, seats: Array<{regionId, bp}>, totalBp }>}
   */
  function committee(nations) {
    const byId = new Map();
    (nations || []).forEach((n) => {
      const real = Object.entries((n && n.holders) || {})
        .filter(([, h]) => !h.dummy && (Number(h.bp) || 0) >= CONFIG.minSeatBp)
        .sort((a, b) => (Number(b[1].bp) || 0) - (Number(a[1].bp) || 0) || String(a[0]).localeCompare(String(b[0])));
      if (!real.length) return;
      const [id, h] = real[0];
      if (!byId.has(id)) byId.set(id, { id, name: h.name, seats: [], totalBp: 0 });
      const m = byId.get(id);
      m.seats.push({ regionId: n.regionId, bp: Number(h.bp) || 0 });
      m.totalBp += Number(h.bp) || 0;
    });
    return [...byId.values()].sort((a, b) => b.totalBp - a.totalBp || String(a.id).localeCompare(String(b.id)));
  }

  const majority = (total) => Math.floor(total / 2) + 1;

  /** 지금 위원 명단 기준 득표 집계 (위원이 아닌 사람의 표는 세지 않는다) */
  function tally(motion, members) {
    const ids = new Set((members || []).map((m) => m.id));
    let yes = 0, no = 0;
    Object.entries((motion && motion.votes) || {}).forEach(([id, v]) => {
      if (!ids.has(id)) return;
      if (v.v === 'yes') yes++; else if (v.v === 'no') no++;
    });
    const total = ids.size;
    const need = majority(total);
    return { yes, no, total, need, passed: total > 0 && yes >= need, dead: total > 0 && no > total - need };
  }

  function canChangeRate(fed, dir, nowMs) {
    const target = fed.rateBp + dir * CONFIG.rateStepBp;
    if (target < CONFIG.rateMinBp) return { ok: false, reason: `정책금리는 ${CONFIG.rateMinBp / 100}% 아래로 내릴 수 없습니다.` };
    if (target > CONFIG.rateMaxBp) return { ok: false, reason: `정책금리는 ${CONFIG.rateMaxBp / 100}%를 넘길 수 없습니다.` };
    const wait = (fed.lastRateChangeAt || 0) + CONFIG.rateCooldownHours * HOUR - nowMs;
    if (wait > 0) return { ok: false, reason: '직전 금리 변경 후 냉각 기간입니다.', waitMs: wait };
    return { ok: true, target };
  }

  /**
   * 안건 정리: 만료/부결/가결을 반영한 새 기록. 바뀐 것이 없으면 같은 객체.
   * 가결이면 금리가 바뀐다 (그 전에 advance로 물가를 현재 금리까지 밀어 둔다).
   */
  function resolve(fed, members, nowMs) {
    const m = fed.motion;
    if (!m) return fed;
    const t = tally(m, members);
    let result = null;
    if (t.passed) result = 'passed';
    else if (t.total === 0 || t.dead) result = 'rejected';
    else if (nowMs >= m.expiresAt) result = 'expired';
    if (!result) return fed;
    let next = advance(fed, nowMs);
    next = next === fed ? clone(fed) : next;
    if (result === 'passed') {
      const chk = canChangeRate(next, m.dir, nowMs);
      if (chk.ok) {
        next.rateBp = chk.target;
        next.lastRateChangeAt = nowMs;
        next.history.push({ at: nowMs, price: next.price, rateBp: next.rateBp });
        if (next.history.length > CONFIG.historyLen) next.history = next.history.slice(-CONFIG.historyLen);
      } else {
        result = 'rejected';
      }
    }
    next.lastMotion = { result, dir: m.dir, at: nowMs, rateBp: next.rateBp, yes: t.yes, no: t.no, total: t.total, proposerName: m.proposerName };
    next.motion = null;
    next.rev = (Number(fed.rev) || 0) + 1;
    return next;
  }

  /** 위원이 금리 인상(+1)/인하(-1) 안건을 발의. 발의자는 찬성표를 던진 것으로 친다. */
  function propose(fed, member, dir, members, nowMs) {
    if (!member || !members.some((x) => x.id === member.id)) return { error: '연준 위원만 안건을 낼 수 있습니다.' };
    if (fed.motion) return { error: '이미 표결 중인 안건이 있습니다.' };
    const d = dir > 0 ? 1 : -1;
    const chk = canChangeRate(fed, d, nowMs);
    if (!chk.ok) return { error: chk.reason, waitMs: chk.waitMs };
    const next = clone(fed);
    next.motion = {
      id: `m${next.tickCount}_${Math.floor(nowMs / 1000)}`,
      dir: d, proposerId: member.id, proposerName: member.name,
      createdAt: nowMs, expiresAt: nowMs + CONFIG.motionTtlHours * HOUR,
      votes: { [member.id]: { name: member.name, v: 'yes' } }
    };
    next.rev = (Number(fed.rev) || 0) + 1;
    return { fed: resolve(next, members, nowMs) };
  }

  /** 표결. 같은 사람이 다시 던지면 표를 바꾼다. */
  function vote(fed, member, choice, members, nowMs) {
    if (!fed.motion) return { error: '표결 중인 안건이 없습니다.' };
    if (!member || !members.some((x) => x.id === member.id)) return { error: '연준 위원만 표결할 수 있습니다.' };
    if (nowMs >= fed.motion.expiresAt) return { error: '이미 만료된 안건입니다.' };
    const next = clone(fed);
    next.motion.votes[member.id] = { name: member.name, v: choice === 'no' ? 'no' : 'yes' };
    next.rev = (Number(fed.rev) || 0) + 1;
    return { fed: resolve(next, members, nowMs) };
  }

  // ============================================================
  // 대출
  // ============================================================
  /** 담보가치(골드) → 최대 대출액 */
  function maxLoan(collateralValue) {
    return Math.max(0, Math.floor((Number(collateralValue) || 0) * CONFIG.ltv));
  }

  function normalizeTerm(hours) {
    const step = CONFIG.termStepHours;
    const h = Math.round((Number(hours) || CONFIG.minTermHours) / step) * step;
    return clamp(h, CONFIG.minTermHours, CONFIG.maxTermHours);
  }

  const interestPerPeriod = (principal, rateBp) => Math.max(1, Math.ceil(principal * rateBp / 10000));

  /** 대출 견적 (화면 표시용) */
  function quoteLoan(principal, termHours, rateBp) {
    const periods = normalizeTerm(termHours) / CONFIG.termStepHours;
    const per = interestPerPeriod(principal, rateBp);
    return { periods, termHours: periods * CONFIG.termStepHours, perPeriod: per, totalInterest: per * periods, totalRepay: principal + per * periods };
  }

  function createLoan({ id, principal, termHours, rateBp, collateral, collateralValue, nowMs }) {
    const term = normalizeTerm(termHours);
    return {
      id, principal: Math.floor(principal), rateBp,
      startedAt: nowMs, termHours: term, dueAt: nowMs + term * HOUR,
      periodsDone: 0, interestPaid: 0, arrears: 0, missed: 0,
      status: 'active',
      collateral, collateralValue: Math.floor(collateralValue)
    };
  }

  const loanPeriods = (loan) => loan.termHours / CONFIG.termStepHours;
  const nextInterestAt = (loan) => loan.startedAt + (loan.periodsDone + 1) * CONFIG.termStepHours * HOUR;
  /** 지금 당장 갚으면 드는 돈 (원금 + 밀린 이자) */
  const payoffAmount = (loan) => loan.principal + (loan.arrears || 0);

  /**
   * 대출 하나를 nowMs까지 정산한다 (8시간 이자 → 만기 상환/몰수). gold는 정산 시작 시점의 보유 골드.
   * @returns {{ loan, gold, events: Array<{type, at, amount}> }}  loan.status: active | repaid | defaulted
   *   events: interest(이자 납부) · missed(이자 미납) · repaid(만기 상환) · default(몰수: reason maturity|missed)
   */
  function settleLoan(loanIn, nowMs, goldIn) {
    const loan = clone(loanIn);
    let gold = Number(goldIn) || 0;
    const events = [];
    if (loan.status !== 'active') return { loan, gold, events };
    const total = loanPeriods(loan);
    while (loan.periodsDone < total && nextInterestAt(loan) <= nowMs) {
      const at = nextInterestAt(loan);
      const due = interestPerPeriod(loan.principal, loan.rateBp) + (loan.arrears || 0);
      loan.periodsDone += 1;
      if (gold >= due) {
        gold -= due;
        loan.interestPaid += due;
        loan.arrears = 0;
        loan.missed = 0;
        events.push({ type: 'interest', at, amount: due });
      } else {
        loan.arrears = due;
        loan.missed += 1;
        events.push({ type: 'missed', at, amount: due });
        if (loan.missed >= CONFIG.missLimit) {
          loan.status = 'defaulted';
          events.push({ type: 'default', at, reason: 'missed' });
          return { loan, gold, events };
        }
      }
    }
    if (loan.periodsDone >= total && nowMs >= loan.dueAt) {
      const owed = payoffAmount(loan);
      if (gold >= owed) {
        gold -= owed;
        loan.status = 'repaid';
        events.push({ type: 'repaid', at: loan.dueAt, amount: owed });
      } else {
        loan.status = 'defaulted';
        events.push({ type: 'default', at: loan.dueAt, reason: 'maturity', amount: owed });
      }
    }
    return { loan, gold, events };
  }

  // ============================================================
  // 경매
  // ============================================================
  function startPriceFor(collateralValue, relists) {
    const open = (Number(collateralValue) || 0) * CONFIG.openPct * Math.pow(1 - CONFIG.relistDropPct / 100, relists || 0);
    return Math.max(CONFIG.minStartPrice, Math.round(open));
  }

  /** 몰수한 담보 캐릭터를 경매에 올린다. */
  function createAuction({ id, unit, value, reason, sellerName, nowMs }) {
    return {
      id, rev: 0, status: 'open',
      unit, value: Math.floor(value), reason: reason || 'default', sellerName: sellerName || '',
      relists: 0, startPrice: startPriceFor(value, 0),
      currentBid: 0, bidderId: null, bidderName: null, bidderLoop: null,
      bids: 0, refunds: {},
      createdAt: nowMs, endsAt: nowMs + CONFIG.auctionHours * HOUR,
      winnerId: null, winnerName: null, winnerLoop: null, finalPrice: 0, closedAt: null
    };
  }

  function minBid(a) {
    if (!(a.currentBid > 0)) return a.startPrice;
    return a.currentBid + Math.max(CONFIG.minIncrementFlat, Math.ceil(a.currentBid * CONFIG.minIncrementPct / 100));
  }

  const isOpen = (a, nowMs) => a.status === 'open' && nowMs < a.endsAt;

  /** 입찰. 이전 최고 입찰자의 금액은 refunds에 쌓인다 (본인이 접속할 때 받는다). */
  function applyBid(a, bidder, amount, nowMs) {
    if (!isOpen(a, nowMs)) return { error: '이미 끝난 경매입니다.' };
    if (a.bidderId === bidder.id) return { error: '이미 최고 입찰자입니다.' };
    const bid = Math.floor(Number(amount) || 0);
    if (bid < minBid(a)) return { error: `최소 ${minBid(a)}G부터 입찰할 수 있습니다.` };
    const next = clone(a);
    if (next.bidderId) {
      const prev = next.refunds[next.bidderId];
      const same = prev && prev.loop === next.bidderLoop;
      next.refunds[next.bidderId] = { gold: (same ? prev.gold : 0) + next.currentBid, loop: next.bidderLoop };
    }
    next.currentBid = bid;
    next.bidderId = bidder.id;
    next.bidderName = bidder.name;
    next.bidderLoop = bidder.loop;
    next.bids = (next.bids || 0) + 1;
    if (next.endsAt - nowMs < CONFIG.antiSnipeMs) next.endsAt = nowMs + CONFIG.antiSnipeMs;
    next.rev = (Number(a.rev) || 0) + 1;
    return { auction: next, bid };
  }

  /** 마감 시각이 지난 경매를 낙찰/유찰 처리. 바뀐 것이 없으면 null. */
  function closeIfEnded(a, nowMs) {
    if (a.status !== 'open' || nowMs < a.endsAt) return null;
    const next = clone(a);
    next.rev = (Number(a.rev) || 0) + 1;
    if (next.bidderId) {
      next.status = 'sold';
      next.winnerId = next.bidderId;
      next.winnerName = next.bidderName;
      next.winnerLoop = next.bidderLoop;
      next.finalPrice = next.currentBid;
      next.closedAt = nowMs;
    } else {
      // 유찰: 더 낮은 시작가로 다시 올린다
      next.relists = (next.relists || 0) + 1;
      next.startPrice = startPriceFor(next.value, next.relists);
      next.endsAt = nowMs + CONFIG.auctionHours * HOUR;
    }
    return next;
  }

  /** 밀려난 입찰금 환급 수령. 받을 게 없으면 null. 회귀한 입찰자의 환급금은 사라진다. */
  function claimRefund(a, playerId, loop) {
    const r = a.refunds && a.refunds[playerId];
    if (!r) return null;
    const next = clone(a);
    delete next.refunds[playerId];
    next.rev = (Number(a.rev) || 0) + 1;
    return { auction: next, gold: r.loop === loop ? Number(r.gold) || 0 : 0 };
  }

  /** 낙찰자가 캐릭터를 받는다. 회귀로 낙찰금을 잃은 사람이면 캐릭터는 없던 일이 된다(void). */
  function claimWinner(a, playerId, loop) {
    if (a.status !== 'sold' || a.winnerId !== playerId) return null;
    const next = clone(a);
    next.status = a.winnerLoop === loop ? 'delivered' : 'void';
    next.rev = (Number(a.rev) || 0) + 1;
    return { auction: next, unit: next.status === 'delivered' ? clone(a.unit) : null };
  }

  global.FedEngine = {
    CONFIG, HOUR,
    lastTickBoundary, nextTickAt, createFed, driftPct, advance, scale, lendingRateBp,
    committee, majority, tally, canChangeRate, resolve, propose, vote,
    maxLoan, normalizeTerm, interestPerPeriod, quoteLoan, createLoan, loanPeriods, nextInterestAt, payoffAmount, settleLoan,
    startPriceFor, createAuction, minBid, isOpen, applyBid, closeIfEnded, claimRefund, claimWinner
  };
})(typeof window !== 'undefined' ? window : globalThis);
