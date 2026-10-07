// ============================================================
// shopEngine.js — 국가 국영상점 (순수 로직, DOM·state·Supabase를 모름)
// 사용법: <script src="shopEngine.js"></script> (shareEngine.js 다음) → window.ShopEngine
//
// 국영상점은 국가마다 유물을 판다. 규칙:
//  - 진열: 국가 성향(ShareEngine.RELIC_PROFILES)의 종류·등급 가중치로, 구역마다 고정된 시드로 뽑는다.
//          → 국가마다 파는 유물이 다르다 (변경은 보급품 선물만, 신비는 영웅 위주 …). 같은 국가는 누구에게나 같은 진열이다.
//  - 최상급(legendary)·개명 유물은 팔지 않는다. 최상급은 전투 보상으로만 얻는다.
//  - 가격: 등급 기준가(× 지휘관 유물 배수) × 물가(인플레이션, config.js scaleGold와 같은 반올림) − 유물 상점 할인(%)
//  - 판매 대금의 shopTaxPct(%)가 그 국가의 세수에 가산된다: 다음 정산 때 지분율대로 보유자에게 나뉜다.
//    (대금은 이미 물가가 반영된 값이므로 정산에서 물가를 다시 곱하지 않는다)
// 서버 권위 모드의 같은 규칙은 supabase-economy.sql (slg_shop_*) 에 있다.
// ============================================================

(function (global) {
  'use strict';

  const CONFIG = {
    slots: 6,                                   // 국가마다 진열하는 유물 수
    basePrice: { common: 150, rare: 400, epic: 1000 },   // 등급별 기준가 (물가 1.0)
    commanderMult: 1.5,                         // 지휘관 유물은 선물 유물보다 비싸다
    soldRarities: ['common', 'rare', 'epic'],   // 최상급(legendary)은 팔지 않는다
    soldKinds: ['gift', 'commander'],           // 개명 유물은 팔지 않는다
    shopTaxPct: 100,                            // 판매 대금 중 세수에 가산되는 비율 (%)
    dayBuys: 12                                 // 한 플레이어가 24시간에 살 수 있는 횟수
  };

  const isSellable = (d) => !!d && CONFIG.soldRarities.includes(d.rarity) && CONFIG.soldKinds.includes(d.kind);

  function basePrice(d) {
    const base = CONFIG.basePrice[d && d.rarity] || 0;
    return base * (d && d.kind === 'commander' ? CONFIG.commanderMult : 1);
  }

  // config.js scaleGold 와 같은 반올림: 소액은 1G, 100G 이상은 5G 단위
  function scaleGold(base, level) {
    const v = Number(base) * (level > 0 ? level : 1);
    if (!(v > 0)) return 0;
    const unit = v >= 100 ? 5 : 1;
    return Math.max(1, Math.round(v / unit) * unit);
  }
  /** 물가와 유물 상점 할인(%)을 반영한 실제 가격 */
  function price(d, level, discountPct) {
    const full = scaleGold(basePrice(d), level);
    const pct = Math.min(75, Math.max(0, Number(discountPct) || 0));
    return pct ? Math.max(1, Math.round(full * (1 - pct / 100))) : full;
  }
  /** 판매 대금 중 세수에 가산되는 금액 */
  const taxShare = (cost) => Math.floor((Number(cost) || 0) * CONFIG.shopTaxPct / 100);

  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
    return ((h >>> 0) + 0.5) / 4294967296;
  }

  /**
   * 국가의 진열. 가중치 비복원 추출 (키 = -ln(u)/가중치가 작은 순). 같은 구역·같은 유물 DB → 항상 같은 결과.
   * @param region  campaignRegions의 구역 (id, relicProfile)
   * @param relics  유물 정의 배열 [{ id, kind, rarity, ... }]
   */
  function stockFor(region, relics, slots = CONFIG.slots) {
    const SE = global.ShareEngine;
    const prof = SE.relicProfile(region);
    const regionId = region && region.id;
    return (relics || []).filter(isSellable).map((d) => {
      const w = (Number(prof.kind[d.kind]) || 0) * (Number(prof.rarity[d.rarity]) || 0);
      return { d, key: w > 0 ? -Math.log(hash01(`shop|${regionId}|${d.id}`)) / w : Infinity };
    }).filter((x) => x.key < Infinity)
      .sort((a, b) => a.key - b.key || String(a.d.id).localeCompare(String(b.d.id)))
      .slice(0, slots).map((x) => x.d);
  }

  global.ShopEngine = { CONFIG, isSellable, basePrice, scaleGold, price, taxShare, stockFor };
})(typeof window !== 'undefined' ? window : globalThis);
