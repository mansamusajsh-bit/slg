// ============================================================
// nationShop.js — 국가 국영상점 화면 · 구매 연결부 (게임 state ↔ ShopEngine ↔ 서버)
// 사용법: <script src="nationShop.js"></script> (shopEngine.js · game.js · nationShares.js 다음)
//
// - 규칙/계산: shopEngine.js (순수 로직). 서버 권위 모드의 같은 규칙: supabase-economy.sql (slg_shop_list / slg_shop_buy)
// - 국가마다 파는 유물이 다르고, 최상급은 팔지 않는다. 점령한(이번 회차) 국가의 상점만 열린다.
// - 가격은 물가(인플레이션)와 유물 상점 할인을 따른다.
// - 판매 대금은 그 국가의 세수에 가산된다: 다음 정산 때 지분율대로 보유자에게 나뉜다 (nationShares.js · shareEngine.js).
// - 서버 모드: 진열 · 가격 · 구매는 서버가 정하고 유물도 서버가 지급한다. 서버가 없으면(로컬) 이 탭 안에서만 돈다.
// ============================================================

(function (global) {
  'use strict';

  const SH = global.ShopEngine;
  const OVERLAY_ID = 'modal-nation-shop';

  const getState = () => (typeof state !== 'undefined' ? state : null);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const log = (msg, type = 'gold') => { if (typeof addLog === 'function') addLog(msg, type); };
  const toast = (msg, type) => global.UI && global.UI.showToast && global.UI.showToast(msg, type);
  const serverMode = () => !!(global.ServerEconomy && global.ServerEconomy.enabled && global.ServerEconomy.itemsActive);

  const ERRORS = {
    not_secured: '점령한 국가의 상점만 이용할 수 있습니다.',
    not_in_stock: '이 상점에서 팔지 않는 유물입니다.',
    sold_out: '이미 구매한 유물입니다. 진열을 모두 사면 새 유물이 들어옵니다.',
    daily_limit: '오늘 구매 한도에 도달했습니다. 시간이 지나면 다시 살 수 있습니다.',
    owned: '이미 가진 지휘관 유물입니다.',
    insufficient: '골드가 부족합니다.',
    bad_request: '잘못된 요청입니다.',
    not_found: '알 수 없는 국가입니다.'
  };

  let shopRegionId = null;
  let data = null;          // { regionId, items, bought, dayLimit, pending, ... } 마지막으로 읽은 진열
  let loading = false;
  let busy = false;
  let loadToken = 0;
  let justBought = false;   // 방금 산 직후의 새로고침 알림은 구매 쪽에서 이미 띄웠다

  // ---- 점령한 국가 ----
  function securedRegionIds() {
    const st = getState();
    const campaign = st && st.run && st.run.campaign;
    if (!campaign || typeof REGIONS === 'undefined') return [];
    return Object.keys(REGIONS).filter((id) => campaign.regions[id] && campaign.regions[id].status === 'secured');
  }

  // ---- 진열 읽기 ----
  async function loadLocal(regionId) {
    const rewardData = await global.ensureRewardDataLoaded();
    if (!rewardData) return { ok: false, error: 'load_failed' };
    const owned = new Set((global.getOwnedRelics ? global.getOwnedRelics() : []).filter((r) => r.kind === 'commander').map((r) => r.id));
    const run = getState().run;
    // 진열을 하나씩 다 사면 회차가 올라가 새 진열이 된다 (이미 가진 지휘관 유물은 산 것으로 친다)
    if (!run.shopState) run.shopState = {};
    const ss = run.shopState[regionId] || (run.shopState[regionId] = { round: 0, bought: [] });
    const relicList = [...rewardData.relics.values()];
    const isSold = (d) => ss.bought.includes(String(d.id)) || (d.kind === 'commander' && owned.has(String(d.id)));
    let stock = SH.stockFor(REGIONS[regionId], relicList, SH.CONFIG.slots, ss.round);
    let refreshed = false;
    for (let i = 0; stock.length && stock.every(isSold) && i < 5; i++) {
      ss.round += 1; ss.bought = []; refreshed = true;
      stock = SH.stockFor(REGIONS[regionId], relicList, SH.CONFIG.slots, ss.round);
    }
    const dayAgo = Date.now() - 86400000;
    const bought = (run.shopBuys || []).filter((t) => t > dayAgo).length;
    const pending = global.NationShares ? global.NationShares.shopPending(regionId) : 0;
    return {
      ok: true, regionId, refreshed, round: ss.round, bought, dayLimit: SH.CONFIG.dayBuys, pending, taxPct: SH.CONFIG.shopTaxPct,
      items: stock.map((d) => ({
        id: String(d.id), name: d.name, kind: d.kind, rarity: d.rarity, description: d.description || '', effects: d.effects || [], imageUrl: d.imageUrl,
        price: typeof global.scaleShopGold === 'function' ? global.scaleShopGold(SH.basePrice(d)) : SH.price(d, 1, 0),
        sold: isSold(d)
      }))
    };
  }

  async function load(regionId) {
    if (serverMode()) {
      const res = await global.ServerEconomy.call('slg_shop_list', { p_region: regionId });
      return res || { ok: false, error: 'network' };
    }
    return loadLocal(regionId);
  }

  async function refresh() {
    const token = ++loadToken;
    loading = true;
    render();
    let res;
    try { res = await load(shopRegionId); } catch (e) { console.warn('[NationShop] 진열 읽기 실패', e); res = { ok: false, error: 'network' }; }
    if (token !== loadToken) return;
    loading = false;
    data = res;
    if (res && res.ok && res.refreshed && !justBought) refreshedNotice(REGIONS[shopRegionId] ? REGIONS[shopRegionId].title.ko : shopRegionId);
    render();
  }

  // ---- 구매 ----
  async function buy(regionId, relicId) {
    if (busy) return false;
    const st = getState();
    const item = data && data.items && data.items.find((i) => i.id === relicId);
    if (!st || !item || item.sold) return false;
    busy = true;
    render();
    let done = false;
    try {
      const regionName = REGIONS[regionId] ? REGIONS[regionId].title.ko : regionId;
      if (serverMode()) {
        const res = await global.ServerEconomy.call('slg_shop_buy', { p_region: regionId, p_relic_id: relicId });
        if (res && res.ok) {
          done = true;
          log(`🏪 [국영상점] ${regionName}에서 ${item.name} 구매 (-${res.cost}G) · 세수에 +${res.tax}G 가산`);
          toast(`🏪 ${item.name} 구매 (-${res.cost}G)`, 'success');
          if (res.refreshed) refreshedNotice(regionName);
          await global.ServerEconomy.sync('now');   // 가산 대기 매출 · 물가를 다시 읽는다
        } else {
          toast(ERRORS[res && res.error] || (res && res.network ? '서버와 통신하지 못했습니다.' : '구매하지 못했습니다.'), 'warning');
        }
      } else {
        const price = item.price;
        if (data.dayLimit && data.bought >= data.dayLimit) toast(ERRORS.daily_limit, 'warning');
        else if ((Number(st.gold) || 0) < price) toast(ERRORS.insufficient, 'warning');
        else {
          const entry = global.grantRelic ? global.grantRelic(relicId, { type: 'shop', regionId }) : null;
          if (!entry) {
            toast('유물을 지급하지 못해 구매가 취소되었습니다.', 'warning');
          } else {
            st.gold -= price;   // 소비로 잡혀 물가(수요)에도 반영된다
            const ss = st.run.shopState && st.run.shopState[regionId];
            if (ss) ss.bought.push(relicId);
            if (!Array.isArray(st.run.shopBuys)) st.run.shopBuys = [];
            const now = Date.now();
            st.run.shopBuys = st.run.shopBuys.filter((t) => t > now - 86400000).concat(now);
            const tax = SH.taxShare(price);
            if (global.NationShares) await global.NationShares.recordShopSale(regionId, tax);
            log(`🏪 [국영상점] ${regionName}에서 ${item.name} 구매 (-${price}G) · 세수에 +${tax}G 가산`);
            toast(`🏪 ${item.name} 구매 (-${price}G)`, 'success');
            if (typeof saveGameState === 'function') saveGameState(true);
            if (typeof renderAll === 'function') renderAll();
            done = true;
          }
        }
      }
    } catch (e) {
      console.warn('[NationShop] 구매 실패', e);
      toast('구매 중 오류가 발생했습니다.', 'warning');
    } finally {
      busy = false;
    }
    justBought = true;
    try { await refresh(); } finally { justBought = false; }
    return done;
  }

  function refreshedNotice(regionName) {
    log(`🔄 [국영상점] ${regionName} 진열을 모두 사서 새 유물이 들어왔습니다.`, 'system');
    toast('🔄 진열이 모두 팔려 새 유물이 들어왔습니다', 'success');
  }

  // ---- 화면 ----
  const fmtPct = (bp) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;

  function itemCard(it, gold) {
    const meta = (global.RELIC_RARITY_META && global.RELIC_RARITY_META[it.rarity]) || { label: it.rarity, color: '#64748b' };
    const effect = typeof global.describeRelicEffects === 'function' ? global.describeRelicEffects({ kind: it.kind, rarity: it.rarity, effects: it.effects || [] }) : '';
    const can = !it.sold && !busy && gold >= it.price;
    const label = it.sold ? '구매 완료' : gold < it.price ? `${it.price}G · 골드 부족` : `구매 ${it.price}G`;
    return `
      <div class="nshop-item${it.sold ? ' is-owned' : ''}" style="--rar:${meta.color}">
        <div class="nshop-item-top">
          <span class="nshop-thumb">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="">` : '💎'}</span>
          <span class="nshop-item-head">
            <b class="nshop-item-name">${esc(it.name)}</b>
            <span class="nshop-badges"><i class="nshop-rar">${esc(meta.label)}</i><i class="nshop-kind">${it.kind === 'commander' ? '지휘관 유물' : '선물 유물'}</i></span>
          </span>
        </div>
        ${it.description ? `<p class="nshop-desc">${esc(it.description)}</p>` : ''}
        ${effect ? `<p class="nshop-effect">${esc(effect)}</p>` : ''}
        <button type="button" class="nshop-buy" data-nshop-buy="${esc(it.id)}" ${can ? '' : 'disabled'}>${esc(label)}</button>
      </div>`;
  }

  function render() {
    const overlay = document.getElementById(OVERLAY_ID);
    const st = getState();
    if (!overlay || !st) return;
    const ids = securedRegionIds();
    const gold = Number(st.gold) || 0;
    const region = shopRegionId && REGIONS[shopRegionId];

    const tabs = ids.map((id) => `<button type="button" class="nshop-tab${id === shopRegionId ? ' is-active' : ''}" data-nshop-tab="${id}">${esc(REGIONS[id].name.ko)}</button>`).join('');
    let body;
    if (!ids.length) {
      body = '<p class="nshop-empty">아직 점령한 국가가 없습니다.<br/>국가를 점령하면 그 국가의 국영상점을 이용할 수 있습니다.</p>';
    } else if (loading || !data || data.regionId !== shopRegionId) {
      body = '<p class="nshop-empty">진열을 불러오는 중…</p>';
    } else if (!data.ok) {
      body = `<p class="nshop-empty">${esc(ERRORS[data.error] || '상점을 열지 못했습니다. 잠시 후 다시 시도하세요.')}</p>`;
    } else {
      const NS = global.NationShares;
      const v = NS && NS.view ? NS.view(shopRegionId) : null;
      const mine = v && v.nation ? v.nation.mine : 0;
      const pending = Number(data.pending) || 0;
      const myCut = Math.floor(pending * mine / 10000);
      const profile = global.ShareEngine ? global.ShareEngine.relicProfile(region).label : '';
      const level = typeof getPriceLevel === 'function' ? getPriceLevel() : 1;
      body = `
        <div class="nshop-info">
          <span>🏛️ <b>${esc(region.title.ko)}</b> · ${esc(profile)}</span>
          <span title="인플레이션이 가격에 반영됩니다">📈 물가 ×${level.toFixed(2)}</span>
          <span>🪙 ${gold}G</span>
        </div>
        <div class="nshop-tax">판매 대금의 <b>${data.taxPct || SH.CONFIG.shopTaxPct}%</b>가 이 국가의 세수에 가산됩니다.
          다음 정산에 얹힐 매출 <b>+${pending}G</b>${mine ? ` · 내 지분 ${fmtPct(mine)} → 내 몫 <b>+${myCut}G</b>` : ' · 지분이 있으면 지분율만큼 받습니다'}</div>
        <div class="nshop-grid">${data.items.length ? data.items.map((it) => itemCard(it, gold)).join('') : '<p class="nshop-empty">지금 진열된 유물이 없습니다.</p>'}</div>
        <div class="nshop-foot">진열을 하나씩 모두 사면 새 유물로 바뀝니다 (${data.items.filter((i) => i.sold).length}/${data.items.length}) · 최상급 유물은 판매하지 않습니다 — 전투로만 얻을 수 있습니다.${data.dayLimit ? ` · 오늘 구매 ${data.bought}/${data.dayLimit}` : ''}${data.discountPct ? ` · 유물 할인 ${data.discountPct}% 적용` : ''}</div>`;
    }
    overlay.querySelector('.nshop-card').innerHTML = `
      <div class="nshop-head"><h2>🏪 국영상점</h2><button type="button" class="nshop-close" data-nshop-close aria-label="닫기">✕</button></div>
      ${ids.length ? `<div class="nshop-tabs">${tabs}</div>` : ''}
      ${body}`;
    overlay.querySelector('[data-nshop-close]').onclick = close;
    overlay.querySelectorAll('[data-nshop-tab]').forEach((b) => {
      b.onclick = () => { if (busy || b.dataset.nshopTab === shopRegionId) return; shopRegionId = b.dataset.nshopTab; data = null; refresh(); };
    });
    overlay.querySelectorAll('[data-nshop-buy]').forEach((b) => { b.onclick = () => buy(shopRegionId, b.dataset.nshopBuy); });
  }

  function close() {
    document.getElementById(OVERLAY_ID)?.remove();
    loadToken++;
    data = null;
    if (global.CampaignMapView && getState() && state.currentView === 'CAMPAIGN') global.CampaignMapView.render();
  }

  /** 상점을 연다. regionId가 점령한 국가면 그 국가부터, 아니면 첫 번째 점령 국가. */
  function open(regionId) {
    const ids = securedRegionIds();
    shopRegionId = ids.includes(regionId) ? regionId : (ids[0] || null);
    data = null;
    document.getElementById(OVERLAY_ID)?.remove();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'nshop-overlay';
    overlay.innerHTML = '<div class="nshop-card"></div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    if (shopRegionId) refresh(); else render();
  }

  global.NationShop = { open, close, securedRegionIds };
})(typeof window !== 'undefined' ? window : globalThis);
