// ============================================================
// campaignMap.js — 작전지도 화면 (전략맵에 들어가기 전 단계)
// 사용법: <script src="campaignMap.js"></script> (game.js 다음에 로드)
//
// - 지도 형태: campaignRegions.js (REGIONS / CAMPAIGN_MAP, 고정)
// - 회차 상태: state.run.campaign (회귀 시 초기화) / 부관: state.run.adjutant
// - 게임 로직(구역 진입·확보, 부관 임명)은 game.js의 enterRegion / appointAdjutant 가 한다.
//   이 파일은 화면과 부관 브리핑 대사만 맡는다.
// ============================================================

(function (global) {
  'use strict';

  // ------------------------------------------------------------
  // 부관 브리핑 대사. {region} {title} {threat} {adjutant} {desc} {current} {opened} 는 출력 시 치환된다.
  // 조사는 {region|은/는} 처럼 쓰면 앞 단어의 받침에 맞춰 고른다 (모르는 / 리오나는 …).
  // 한 상황에 여러 줄이면 (구역, 회귀 횟수)로 하나를 고른다 → 같은 회차에서는 같은 말을 한다.
  // ------------------------------------------------------------
  const BRIEFING = {
    welcome: [
      '부관 {adjutant}, 지휘관님 곁에서 보좌하겠습니다. 작전 지역을 지정해 주십시오.',
      '지도는 준비됐습니다. 어디부터 치시겠습니까, 지휘관님?'
    ],
    available: [
      '{title}입니다. {desc}. 위협도는 {threat}로 판단됩니다.',
      '{region} 방면 정찰 보고입니다. {desc}. 위협도 {threat}.'
    ],
    final: [
      '{title}… 정찰대가 돌아오지 않았습니다. 이곳이 마지막이 될 겁니다.'
    ],
    // 적의 성향은 수치 없이 말로만 전한다 ({intel}은 campaignRegions.js REGION_COMBAT의 intel)
    intel: [
      '적은 {intel}입니다.',
      '{region} 방면 적군은 {intel}입니다.'
    ],
    hostage: [
      '{region|은/는} 쓰러진 아군을 포로로 잡아 몸값을 요구하는 일이 잦다고 합니다.'
    ],
    locked: [
      '{region|은/는} 아직 정찰 정보가 없습니다. 인접한 구역을 먼저 확보해야 합니다.'
    ],
    secured: [
      '{region|은/는} 우리 깃발 아래 있습니다.'
    ],
    // 확보한 구역인데 내 지분이 다른 플레이어에게 매입되어 줄었다 → 재점령하면 구매권을 되찾는다
    sharesLostRegion: [
      '{region|은/는} 우리 깃발 아래 있지만, 그사이 지분 일부가 다른 손에 넘어갔습니다. 다시 점령하면 되찾을 수 있습니다.'
    ],
    // 접속했을 때(선택한 구역 없음) 지분이 줄어든 구역 보고. {regions}는 구역 이름 목록
    sharesLost: [
      '지휘관님, 자리를 비우신 사이 {regions}의 지분 일부가 다른 손에 넘어갔습니다. 다시 점령하면 되찾을 수 있습니다.',
      '보고드립니다. {regions}에서 우리 지분이 줄었습니다. 재점령 작전으로 구매권을 회복할 수 있습니다.'
    ],
    inProgress: [
      '{region} 작전이 진행 중입니다. 복귀하시겠습니까?'
    ],
    busyElsewhere: [
      '{current} 작전부터 끝내셔야 합니다. 병력을 둘로 나눌 수는 없습니다.'
    ],
    river: [
      '강을 건너야 하는 경로입니다. 도하 준비가 필요합니다.'
    ],
    justSecured: [
      '{region} 확보 완료. {opened} 방면이 열렸습니다.',
      '{region}에 깃발을 꽂았습니다. 다음은 {opened} 쪽입니다.'
    ],
    justSecuredNone: [
      '{region} 확보 완료. 새로 열린 길은 없습니다.'
    ],
    cleared: [
      '…끝났습니다, 지휘관님. 대륙 전체가 우리 손에 있습니다.'
    ],
    noAdjutant: [
      '부관이 공석입니다. 작전을 시작하려면 먼저 부관을 임명하십시오.'
    ],
    // 회귀 횟수에 따라 브리핑 끝에 붙는 반응 (부관은 처음 보는 지역이지만 지휘관은 이미 안다)
    loopAware: [
      { min: 1, lines: ['…지휘관님? 처음 보는 지도인데 망설임이 없으시네요.'] },
      { min: 3, lines: ['지휘관님, 이 지역을 아시는 것 같군요.', '제 보고보다 먼저 아시는 눈치입니다.'] },
      { min: 6, lines: ['…몇 번째입니까, 지휘관님. 그런 눈을 하고 계십니다.'] }
    ]
  };

  const STATUS_LABEL = { locked: '미확인', available: '진입 가능', secured: '확보', current: '작전 중' };

  let selectedRegionId = null;
  let lastEnemySpokenRegion = ''; // 전략맵에서 마지막으로 적 설명을 한 구역
  let lastSpokenKey = ''; // 마지막으로 큰 일러스트로 말한 부관+대사 (같은 대사 반복 방지)

  // game.js의 state는 전역 let이라 window 속성이 아니다. 같은 전역 스코프에서 직접 읽는다.
  const getState = () => (typeof state !== 'undefined' ? state : null);

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 받침이 있으면 첫 번째, 없으면 두 번째 조사를 붙인다.
  function josa(word, withFinal, withoutFinal) {
    const text = String(word);
    const code = text.charCodeAt(text.length - 1) - 0xac00;
    const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
    return text + (hasFinal ? withFinal : withoutFinal);
  }

  function fillVars(line, vars) {
    return line.replace(/\{(\w+)(?:\|([^/}]+)\/([^}]+))?\}/g, (m, k, withFinal, withoutFinal) => {
      if (vars[k] == null) return m;
      return withFinal ? josa(vars[k], withFinal, withoutFinal) : String(vars[k]);
    });
  }

  // 부관의 브리핑 대사: 캐릭터 고유 대사(dialogueLines.js의 brief_*) → 그 캐릭터 성격의 기본 대사 → 위 BRIEFING
  function briefingLines(key, speaker) {
    const own = speaker && global.DialogueLines ? DialogueLines.linesFor(speaker, `brief_${key}`) : [];
    return own.length ? own : (BRIEFING[key] || []);
  }

  function pickLine(key, salt, vars, speaker) {
    const lines = briefingLines(key, speaker);
    if (!lines.length) return '';
    const loop = Number(state.player && state.player.loopCount) || 0;
    const who = speaker ? speaker.id : '';
    const rng = global.SeedEngine ? SeedEngine.createRNG(`briefing|${key}|${salt}|${loop}|${who}`) : Math.random;
    return fillVars(lines[Math.floor(rng() * lines.length)], vars);
  }

  // 회귀 반응: 부관 성격별 대사(dialogueLines.js의 brief_loop1/3/6) → 위 BRIEFING.loopAware
  function loopAwareLine(salt, speaker) {
    const loop = Number(state.player && state.player.loopCount) || 0;
    const tier = BRIEFING.loopAware.filter((t) => loop >= t.min).pop();
    if (!tier) return '';
    const own = speaker && global.DialogueLines ? DialogueLines.linesFor(speaker, `brief_loop${tier.min}`) : [];
    const lines = own.length ? own : tier.lines;
    const who = speaker ? speaker.id : '';
    const rng = global.SeedEngine ? SeedEngine.createRNG(`briefing|loop|${salt}|${loop}|${who}`) : Math.random;
    return lines[Math.floor(rng() * lines.length)];
  }

  function regionStatus(campaign, id) {
    if (campaign.currentRegionId === id) return 'current';
    return campaign.regions[id] ? campaign.regions[id].status : 'locked';
  }

  function threatStars(n) {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 6 - n));
  }

  // 구역의 적 설명: 적의 성향(intel) · 포로 · 국가 전투 규칙. 작전지도와 전략맵(노드 선택)이 함께 쓴다.
  // 수치(스탯 배율·인원·확률)는 보여 주지 않고 부관의 말로만 전한다. 말할 내용이 없으면 ''.
  function enemyBriefing(regionId, adjutant) {
    const r = REGIONS[regionId];
    if (!r || !adjutant) return '';
    const vars = { adjutant: adjutant.name, region: r.name.ko, title: r.title.ko, threat: r.threat };
    let text = '';
    const profile = typeof getRegionEnemyProfile === 'function' ? getRegionEnemyProfile(regionId) : null;
    if (profile && profile.intel) {
      vars.intel = profile.intel;
      text += ' ' + pickLine('intel', regionId, vars, adjutant);
      if (profile.hostage > 0) text += ' ' + pickLine('hostage', regionId, vars, adjutant);
    }
    const nationRule = global.NationRules ? NationRules.getRule(regionId) : null;
    if (nationRule) {
      // 부관의 성격(말투)에 맞춘 문장 (nationRuleBriefs.js). 없으면 규칙 원문으로 대신한다.
      const tone = global.DialogueLines ? DialogueLines.toneOf(adjutant) : '';
      const briefs = global.NATION_RULE_BRIEFS && NATION_RULE_BRIEFS[regionId];
      text += ' ' + ((briefs && briefs[tone]) || `${nationRule.description} ${nationRule.weakness}`);
    }
    return text.trim();
  }

  // 전략맵에서 노드를 골랐을 때: 그 구역의 적 설명을 부관이 큰 일러스트로 말한다. 말할 게 없으면 아무것도 하지 않는다.
  function speakEnemyBriefing(regionId) {
    const run = getState() && state.run;
    const adjutant = run && getAdjutantUnit(run);
    if (!adjutant || typeof REGIONS === 'undefined') return false;
    // 같은 구역의 노드를 연달아 눌러도 한 번만 말한다. 작전지도로 돌아갔다 다시 들어오면 초기화된다.
    if (regionId === lastEnemySpokenRegion) return false;
    const line = enemyBriefing(regionId, adjutant);
    if (!line) return false;
    lastEnemySpokenRegion = regionId;
    const img = typeof getUnitIllustration === 'function' ? getUnitIllustration(adjutant) : adjutant.imageUrl;
    global.UI?.showUnitSpeech?.(adjutant, line, { imageUrl: img || '', mood: 'adjutant', durationMs: 4500 });
    return true;
  }

  // 지금 브리핑할 내용: 선택한 구역 > 방금 확보한 구역 > 인사
  function buildBriefing(campaign, adjutant) {
    if (!adjutant) return pickLine('noAdjutant', 'none', {});
    const vars = { adjutant: adjutant.name };
    const sel = selectedRegionId ? REGIONS[selectedRegionId] : null;
    // 지분이 다른 플레이어에게 매입되어 줄어든 확보 구역 (재점령 가능)
    const NS = global.NationShares;
    const lost = NS && NS.canRerun
      ? Object.keys(campaign.regions).filter((id) => REGIONS[id] && campaign.regions[id].status === 'secured' && NS.canRerun(id))
      : [];
    const lostLine = () => pickLine('sharesLost', lost.join(','), { ...vars, regions: lost.map((id) => getRegionName(id)).join(', ') }, adjutant);
    if (campaign.cleared) return !sel && lost.length ? lostLine() : pickLine('cleared', 'end', vars, adjutant);

    if (selectedRegionId && sel) {
      const r = sel;
      Object.assign(vars, {
        region: r.name.ko, title: r.title.ko, threat: r.threat,
        desc: (r.description.ko || '').replace(/[.。]\s*$/, '')
      });
      const status = regionStatus(campaign, selectedRegionId);
      if (status === 'secured') return pickLine(lost.includes(selectedRegionId) ? 'sharesLostRegion' : 'secured', selectedRegionId, vars, adjutant);
      if (status === 'locked') return pickLine('locked', selectedRegionId, vars, adjutant);
      // 작전 중이거나 다른 작전 때문에 못 들어가는 구역도, 정찰된 구역이면 적 설명(성향·국가 규칙)을 덧붙인다.
      // 미확인(locked) 구역은 정찰 정보가 없다는 설정이라 덧붙이지 않는다.
      const withEnemy = (line) => { const enemy = enemyBriefing(selectedRegionId, adjutant); return enemy ? line + ' ' + enemy : line; };
      if (status === 'current') return withEnemy(pickLine('inProgress', selectedRegionId, vars, adjutant));
      if (campaign.currentRegionId) {
        vars.current = getRegionName(campaign.currentRegionId);
        return withEnemy(pickLine('busyElsewhere', selectedRegionId, vars, adjutant));
      }
      let text = pickLine(r.role === 'final' ? 'final' : 'available', selectedRegionId, vars, adjutant);
      const enemy = enemyBriefing(selectedRegionId, adjutant);
      if (enemy) text += ' ' + enemy;
      const crossesRiver = r.neighbors.some((n) => campaign.regions[n] && campaign.regions[n].status === 'secured' && isRiverCrossing(n, selectedRegionId));
      if (crossesRiver) text += ' ' + pickLine('river', selectedRegionId, vars, adjutant);
      const aware = loopAwareLine(selectedRegionId, adjutant);
      return aware ? `${text} ${aware}` : text;
    }

    const last = campaign.lastSecured;
    if (last && REGIONS[last.regionId]) {
      vars.region = getRegionName(last.regionId);
      vars.opened = last.unlocked.map((id) => getRegionName(id)).join(', ');
      return pickLine(last.unlocked.length ? 'justSecured' : 'justSecuredNone', last.regionId, vars, adjutant);
    }
    if (lost.length) return lostLine();
    const welcome = pickLine('welcome', 'welcome', vars, adjutant);
    const aware = loopAwareLine('welcome', adjutant);
    return aware ? `${welcome} ${aware}` : welcome;
  }

  // ------------------------------------------------------------
  // 지도 SVG
  // ------------------------------------------------------------
  // 배경 이미지는 한 번만 만든다 (다시 그릴 때마다 <image>를 새로 만들면 디코딩 동안 깜빡인다).
  let mapSvgEl = null;
  function getMapSvg() {
    if (mapSvgEl) return mapSvgEl;
    const bg = CAMPAIGN_MAP.background
      ? `<image href="${esc(CAMPAIGN_MAP.background)}" width="${CAMPAIGN_MAP.width}" height="${CAMPAIGN_MAP.height}" preserveAspectRatio="none"/>`
      : `<rect width="${CAMPAIGN_MAP.width}" height="${CAMPAIGN_MAP.height}" fill="#e7dcc2"/>`;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg class="cmp-map-svg" viewBox="0 0 ${CAMPAIGN_MAP.width} ${CAMPAIGN_MAP.height}" xmlns="http://www.w3.org/2000/svg">${bg}<g class="cmp-regions"></g><g class="cmp-labels" aria-hidden="true"></g></svg>`;
    mapSvgEl = holder.firstElementChild;
    return mapSvgEl;
  }

  function renderMapSvg(campaign) {
    const svg = getMapSvg();
    const paths = Object.values(REGIONS).map((r) => {
      const status = regionStatus(campaign, r.id);
      const sel = selectedRegionId === r.id ? ' is-selected' : '';
      const label = `${r.title.ko} · ${STATUS_LABEL[status]} · 위협도 ${r.threat}`;
      return `<path class="cmp-region is-${status}${sel}" d="${r.path}" data-region="${r.id}" tabindex="0" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title></path>`;
    }).join('');
    const labels = Object.values(REGIONS).map((r) => {
      const status = regionStatus(campaign, r.id);
      const mark = status === 'locked' ? '🔒 ' : status === 'secured' ? '🏴 ' : status === 'current' ? '⚔️ ' : '';
      const mine = myShareBp(r.id);
      const share = mine ? `<tspan class="cmp-label-share" x="${r.label.x}" dy="26">📈 ${fmtPct(mine)}</tspan>` : '';
      return `<text class="cmp-label is-${status}" x="${r.label.x}" y="${r.label.y}">${mark}${esc(r.name.ko)}${share}</text>`;
    }).join('');
    svg.querySelector('.cmp-regions').innerHTML = paths;
    svg.querySelector('.cmp-labels').innerHTML = labels;
    return svg;
  }

  // ------------------------------------------------------------
  // 국가 지분 패널 (로직은 nationShares.js / shareEngine.js)
  // ------------------------------------------------------------
  const BUY_STEPS = [100, 500, 1000]; // 1% · 5% · 10%
  const SHARE_COLORS = ['#64748b', '#94a3b8', '#475569', '#a8a29e', '#78716c', '#cbd5e1'];

  const fmtPct = (bp) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;
  function myShareBp(regionId) {
    const NS = global.NationShares;
    if (!NS) return 0;
    const v = NS.view(regionId);
    return v.nation ? v.nation.mine : 0;
  }
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  function renderSharePanel(campaign, sel) {
    const NS = global.NationShares;
    if (!NS) return '';
    const v = NS.view(sel ? sel.id : null);
    const gold = Number(state.gold) || 0;
    const head = `
      <div class="strat-section-header">
        <h2 class="strat-section-title">📈 국가 지분</h2>
        <span class="strat-section-sub" title="지분 보유 플레이어 ${v.realHolders}명 · 서버 시각 기준">⏱️ ${v.hours}시간 주기 · 다음 정산 <b data-share-countdown data-at="${v.nextAt}">${fmtCountdown(v.nextAt - v.now)}</b></span>
      </div>`;
    if (!v.ready) return `<section class="strat-section-card cmp-share-card">${head}<p class="cmp-share-empty">지분 현황을 불러오는 중…</p></section>`;

    let body = '';
    if (sel && v.nation) {
      const n = v.nation;
      let ci = 0;
      const segs = n.holders.map((h) => {
        const isMe = h.id === v.myId;
        return { ...h, isMe, color: isMe ? '#16a34a' : SHARE_COLORS[ci++ % SHARE_COLORS.length] };
      });
      const bar = segs.map((h) => `<span style="width:${h.bp / 100}%;background:${h.color}" title="${esc(h.name)} ${fmtPct(h.bp)}"></span>`).join('')
        + (n.unowned ? `<span class="is-unowned" style="width:${n.unowned / 100}%" title="무주 ${fmtPct(n.unowned)}"></span>` : '');
      const rows = segs.map((h) => `<li class="${h.isMe ? 'is-me' : ''}"><i style="background:${h.color}"></i><span>${esc(h.name)}${h.isMe ? ' (나)' : ''}</span><b>${fmtPct(h.bp)}</b></li>`).join('')
        + (n.unowned ? `<li class="is-unowned"><i></i><span>무주 지분</span><b>${fmtPct(n.unowned)}</b></li>` : '');

      let buy;
      if (v.right > 0) {
        const steps = [...BUY_STEPS.filter((bp) => bp < v.right), v.right];
        const btns = steps.map((bp) => {
          const q = NS.quote(sel.id, bp);
          const can = q && q.bp === bp && q.cost <= gold && !v.busy;
          return `<button type="button" class="cmp-share-buy-btn" data-share-buy="${bp}" ${can ? '' : 'disabled'}>+${fmtPct(bp)}<small>${q ? q.cost : '-'}G</small></button>`;
        }).join('');
        const afford = NS.maxAffordableBp(sel.id);
        const maxBtn = afford > 0 && !steps.includes(afford)
          ? `<button type="button" class="cmp-share-buy-btn is-max" data-share-buy="${afford}" ${v.busy ? 'disabled' : ''}>최대 +${fmtPct(afford)}<small>${NS.quote(sel.id, afford).cost}G</small></button>` : '';
        buy = `<div class="cmp-share-buy">
            <div class="cmp-share-buy-head">📜 구매권 남은 <b>${fmtPct(v.right)}</b><small>무주 지분부터, 모자라면 기존 보유자에게서 할증가로 사 옵니다</small></div>
            <div class="cmp-share-buy-row">${btns}${maxBtn}</div>
          </div>`;
      } else if (v.rightWaitMs > 0) {
        buy = `<p class="cmp-share-note">📜 점령한 구역의 구매권이 곧 열립니다 (<b data-share-wait data-at="${v.now + v.rightWaitMs}">${fmtCountdown(v.rightWaitMs)}</b>).</p>`;
      } else if (regionStatus(campaign, sel.id) === 'secured' && v.rerun) {
        buy = '<p class="cmp-share-note">🔁 내 지분이 다른 플레이어에게 매입되었습니다. 이 구역을 다시 점령하면 잃은 만큼 다시 살 수 있습니다.</p>';
      } else if (regionStatus(campaign, sel.id) === 'secured') {
        buy = '<p class="cmp-share-note">📜 이번 회차 구매권을 모두 썼습니다.</p>';
      } else {
        buy = '<p class="cmp-share-note">📜 이 국가를 점령하면 지분 구매권을 얻습니다.</p>';
      }
      body = `
        <div class="cmp-share-region">
          <div class="cmp-share-sub"><b>${esc(sel.title.ko)}</b><span>세수 ${n.taxPerSettlement}G / 정산 (세율 ×${Number(sel.taxMult || 1).toFixed(1)})</span>${n.shopPending > 0 ? `<span title="국영상점 판매 대금이 다음 정산 세수에 가산됩니다">🏪 상점 매출 가산 +${n.shopPending}G</span>` : ''}<span title="지분 1위가 아닌 보유자에게 정산 때 확률로 지급">유물: ${esc(NS && global.ShareEngine ? global.ShareEngine.relicProfile(sel).label : '')}</span><span>내 지분 <b class="cmp-share-mine">${fmtPct(n.mine)}</b></span></div>
          <div class="cmp-share-bar">${bar}</div>
          <ul class="cmp-share-list">${rows}</ul>
          ${buy}
        </div>`;
    } else if (v.holdings.length) {
      body = `<ul class="cmp-share-list is-mine">${v.holdings.map((h) => `<li><i style="background:#16a34a"></i><span>${esc(REGIONS[h.regionId].title.ko)}</span><b>${fmtPct(h.bp)}</b></li>`).join('')}</ul>`;
    } else {
      body = '<p class="cmp-share-empty">보유 지분이 없습니다. 국가를 점령하면 그 국가의 지분 구매권이 생깁니다.</p>';
    }
    const last = v.last ? ` · 최근 정산 +${v.last.total}G` : '';
    return `<section class="strat-section-card cmp-share-card">${head}${body}
      <div class="cmp-share-foot">정산당 예상 세수 <b>+${v.perSettlement}G</b>${last}${v.cloud ? '' : ' · <span title="Supabase 미연결: 이 탭 안에서만 유지됩니다">오프라인</span>'}</div>
    </section>`;
  }

  // 1초마다 카운트다운 갱신 + 작전지도에 있으면 지분 기록을 주기적으로 다시 읽는다 (새로 읽으면 다시 그림).
  // 정산 시각이 지나면 바로 다시 읽어 세금을 받는다.
  let shareTicker = null;
  function startShareTicker() {
    if (shareTicker || !global.NationShares) return;
    shareTicker = setInterval(() => {
      if (!getState() || state.currentView !== 'CAMPAIGN') return;
      const NS = global.NationShares;
      const el = document.querySelector('#campaign-map-body [data-share-countdown]');
      const left = el ? Number(el.dataset.at) - NS.serverNow() : 1;
      if (el) el.textContent = fmtCountdown(left);
      const wait = document.querySelector('#campaign-map-body [data-share-wait]');
      if (wait) {
        const w = Number(wait.dataset.at) - NS.serverNow();
        if (w <= 0) render(); else wait.textContent = fmtCountdown(w);
      }
      NS.refresh(left <= 0).then((changed) => { if (changed && state.currentView === 'CAMPAIGN') render(); });
    }, 1000);
  }

  // ------------------------------------------------------------
  // 화면
  // ------------------------------------------------------------
  function render() {
    // 공용 헤더(게스트·지휘관·용병 고용)는 game.js가 view-campaign-map 맨 위에 붙인다. 여기는 그 아래 본문만.
    const root = document.getElementById('campaign-map-body');
    const run = getState() && state.run;
    if (!root || !run || !run.campaign || typeof REGIONS === 'undefined') return;
    const campaign = run.campaign;
    const adjutant = getAdjutantUnit(run);
    if (selectedRegionId && !REGIONS[selectedRegionId]) selectedRegionId = null;

    const securedCount = Object.values(campaign.regions).filter((r) => r.status === 'secured').length;
    const total = Object.keys(REGIONS).length;
    const loop = Number(state.player && state.player.loopCount) || 0;
    const sel = selectedRegionId ? REGIONS[selectedRegionId] : null;
    const selStatus = sel ? regionStatus(campaign, sel.id) : null;

    // 하단 액션 바 (전략맵의 "작전 개시 (출격)" 바와 같은 모양)
    let actionIcon = '🗺️';
    let actionLabel = '구역 선택';
    let actionEnabled = false;
    let summaryDest = '작전 구역을 선택하세요';
    let summaryCost = `🏴 확보 ${securedCount}/${total} 구역`;
    if (campaign.currentRegionId) {
      const cur = REGIONS[campaign.currentRegionId];
      actionIcon = '⚔️';
      actionLabel = '작전 계속';
      actionEnabled = true;
      summaryDest = `[${cur.title.ko}] 작전 진행 중`;
      summaryCost = `위협도 ${threatStars(cur.threat)} · 전략맵으로 복귀`;
    } else if (sel && selStatus === 'secured' && global.NationShares?.canRerun?.(sel.id)) {
      // 내 지분이 다른 플레이어에게 매입되어 줄었다 → 다시 점령해서 구매권을 되찾는다
      summaryDest = `[${sel.title.ko}] 지분 감소 — 재점령 가능`;
      summaryCost = `위협도 ${threatStars(sel.threat)} · 잃은 지분만큼 구매권 회복`;
      actionIcon = adjutant ? '🔁' : '🎖️';
      actionLabel = adjutant ? '재점령 (지분 회복)' : '부관 임명';
      actionEnabled = true;
    } else if (campaign.cleared) {
      actionIcon = '🏆';
      actionLabel = '대륙 평정 완료';
      summaryDest = '모든 작전 완수';
    } else if (sel) {
      summaryDest = `[${sel.title.ko}] ${STATUS_LABEL[selStatus]}`;
      summaryCost = `위협도 ${threatStars(sel.threat)}`;
      if (selStatus === 'available') {
        actionIcon = adjutant ? '🚩' : '🎖️';
        actionLabel = adjutant ? '작전 개시 (진입)' : '부관 임명';
        actionEnabled = true; // 부관이 없으면 이 버튼이 임명 창을 연다
      }
    }

    root.innerHTML = `
      <section class="strat-section-card cmp-map-card">
        <div class="strat-section-header">
          <h2 class="strat-section-title">🗺️ 작전지도 (Operation Map)</h2>
          <div class="cmp-chips">
            ${loop ? `<span class="strat-section-sub cmp-chip-loop" title="사망회귀 ${loop}회">🔁 ${loop}회차</span>` : ''}
            <span class="strat-section-sub" title="확보한 구역">🏴 ${securedCount}/${total}</span>
          </div>
        </div>
        <div class="cmp-map-wrap"></div>
      </section>
      <section class="strat-section-card cmp-brief-card">
        <div class="cmp-briefing">
          <button type="button" class="cmp-adjutant" data-cmp-appoint title="${adjutant ? '부관 교체·해임 (지휘관 창)' : '부관 임명'}">
            <span class="cmp-adjutant-portrait">${adjutant ? renderPortrait(adjutant, { emojiSize: '30px' }) : '<span class="portrait-emoji" style="font-size:26px;">🎖️</span>'}</span>
            <span class="cmp-adjutant-role">${adjutant ? '부관' : '공석'}</span>
          </button>
          <div class="cmp-bubble">
            <div class="cmp-bubble-name">${adjutant ? esc(adjutant.name) : '부관 공석'}</div>
            <p class="cmp-bubble-text">${esc(buildBriefing(campaign, adjutant))}</p>
            ${sel ? `<div class="cmp-region-meta"><b>${esc(sel.title.ko)}</b><span class="cmp-threat" title="위협도 ${sel.threat}">${threatStars(sel.threat)}</span><span class="cmp-status is-${selStatus}">${STATUS_LABEL[selStatus]}</span></div>` : ''}
          </div>
        </div>
      </section>
      ${renderSharePanel(campaign, sel)}
      <footer class="strat-bottom-action-bar cmp-action-bar">
        <div class="strat-action-summary">
          <span class="strat-action-dest">${esc(summaryDest)}</span>
          <span class="strat-action-cost">${esc(summaryCost)}</span>
        </div>
        <button type="button" class="strat-btn-launch-main" data-cmp-launch ${actionEnabled ? '' : 'disabled'}>
          <span>${actionIcon}</span>
          <span>${esc(actionLabel)}</span>
        </button>
      </footer>`;

    const mapWrap = root.querySelector('.cmp-map-wrap');
    mapWrap.appendChild(renderMapSvg(campaign));
    // 지도 오른쪽 아래: 국영상점 (지도 위에 상점 아이콘). 점령한 국가의 상점만 열린다.
    if (global.NationShop) {
      const shopBtn = document.createElement('button');
      shopBtn.type = 'button';
      shopBtn.className = 'cmp-shop-btn';
      shopBtn.dataset.cmpShop = '';
      shopBtn.title = '국영상점 — 국가마다 파는 유물이 다릅니다';
      shopBtn.setAttribute('aria-label', '국영상점');
      shopBtn.innerHTML = `<span class="cmp-shop-ico"><span class="m">🗺️</span><span class="s">🏪</span></span>`;
      shopBtn.addEventListener('click', () => global.NationShop.open(selectedRegionId));
      mapWrap.appendChild(shopBtn);
    }
    root.querySelectorAll('[data-region]').forEach((el) => {
      const pick = () => { selectedRegionId = el.dataset.region; campaign.lastSecured = null; lastSpokenKey = ''; render(); };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    root.querySelectorAll('[data-share-buy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await global.NationShares.buy(selectedRegionId, Number(btn.dataset.shareBuy));
        render();
      });
    });
    startShareTicker();
    root.querySelector('[data-cmp-appoint]')?.addEventListener('click', () => (adjutant ? openSkillsModal() : openAdjutantSelect(true)));
    root.querySelector('[data-cmp-launch]')?.addEventListener('click', async () => {
      const target = campaign.currentRegionId || selectedRegionId;
      if (!target) return;
      if (!campaign.currentRegionId && !adjutant) { openAdjutantSelect(true); return; }
      const ok = await enterRegion(target);
      if (ok) selectedRegionId = null;
      else render();
    });

    // 부관의 브리핑은 스킬·전투 거부 때와 같은 큰 일러스트 + 말풍선 연출로 보여 준다.
    // 같은 대사로 다시 그려질 때(지분 구매 등)는 반복해서 띄우지 않는다.
    if (adjutant) {
      const line = buildBriefing(campaign, adjutant);
      const key = `${adjutant.id}|${line}`;
      if (key !== lastSpokenKey) {
        lastSpokenKey = key;
        const img = typeof getUnitIllustration === 'function' ? getUnitIllustration(adjutant) : adjutant.imageUrl;
        global.UI?.showUnitSpeech?.(adjutant, line, { imageUrl: img || '', mood: 'adjutant', durationMs: 4500 });
      }
    } else {
      lastSpokenKey = '';
    }

    // 부관 임명 창은 자동으로 띄우지 않는다. 작전지도의 부관 버튼으로만 연다.
    if (adjutant) document.getElementById('modal-adjutant')?.remove();
  }

  // ------------------------------------------------------------
  // 부관 임명 (회차 시작 시 한 번, 부관이 전사하면 다시)
  // ------------------------------------------------------------
  // 열려 있으면 지금 파티 기준으로 다시 만든다 (클라우드 세이브가 늦게 도착해 파티가 바뀐 경우).
  function openAdjutantSelect(force) {
    if (!force && typeof cloudLoadPending !== 'undefined' && cloudLoadPending) return; // 클라우드 세이브가 곧 덮어쓴다
    if (typeof isRunBlocked === 'function' && isRunBlocked()) return; // 회귀/긴급 모집이 먼저
    // 작전지도를 벗어났으면 창을 닫는다 (클라우드 세이브가 도착해 전략맵으로 넘어간 경우 등 — 남겨 두면 옛 파티로 만든 창이 그대로 남는다)
    if (state.currentView !== 'CAMPAIGN') { document.getElementById('modal-adjutant')?.remove(); return; }
    const run = state.run;
    const candidates = (run.party || []).filter((u) => !u.isDead);
    if (!candidates.length) { document.getElementById('modal-adjutant')?.remove(); return; }
    const loop = Number(state.player && state.player.loopCount) || 0;
    const command = run.loopReward && run.loopReward.type === 'command';
    const prev = run.adjutant;
    const { card } = rbdModal('modal-adjutant', '#f59e0b');
    card.innerHTML = `
      <div class="rbd-icon">🎖️</div>
      <h2 class="rbd-title" style="color:#fcd34d;">부관 임명</h2>
      <p class="rbd-text">${prev ? `부관 ${esc(prev.name)}이(가) 전사했습니다. 새 부관을 임명하세요.` : `${loop ? `회귀 ${loop}회차. ` : ''}이번 생에서 곁을 지킬 부관을 고르세요.`}<br/>부관은 작전지도에서 구역 브리핑을 맡습니다. 임명된 대원은 호감도 +${ADJUTANT_AFFECTION_GAIN}.${command ? '<br/>🛡️ <b>지휘력</b>: 부관은 이번 런 동안 방어력 +1을 얻습니다.' : ''}</p>
      <div class="rbd-list">${candidates.map((u) => `
        <button type="button" class="rbd-row rbd-row-pick" data-unit="${esc(u.id)}">
          <span class="rbd-row-avatar">${renderPortrait(u, { emojiSize: '22px' })}</span>
          <span class="rbd-row-main"><b>${esc(u.name)}</b><small>${esc(window.getClassLabel ? window.getClassLabel(u.classType) : (u.classType || ''))} · Lv.${u.level || 1} · 💗 ${getUnitAffection(u)}${command ? ` · 방어 ${getBaseDef(u)} → <b class="rbd-up">${getBaseDef(u) + 1}</b>` : ''}</small></span>
        </button>`).join('')}
      </div>`;
    card.querySelectorAll('[data-unit]').forEach((btn) => {
      btn.onclick = () => {
        if (!appointAdjutant(btn.dataset.unit)) { render(); return; }
        document.getElementById('modal-adjutant')?.remove();
        selectedRegionId = null;
        render();
      };
    });
  }

  // 작전지도를 떠났다가 돌아오면 같은 대사라도 부관이 다시 말한다 (선택한 구역은 그대로 남아 있으므로).
  const campaignViewEl = document.getElementById('view-campaign-map');
  if (campaignViewEl && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { lastEnemySpokenRegion = ''; if (!campaignViewEl.classList.contains('active')) lastSpokenKey = ''; })
      .observe(campaignViewEl, { attributes: true, attributeFilter: ['class'] });
  }

  global.CampaignMapView = { render, BRIEFING, speakEnemyBriefing };
  global.openCampaignMap = () => goToCampaignMap();

  // game.js가 먼저 그렸을 때는 이 파일이 없었으므로 한 번 더 그린다.
  if (getState() && state.currentView === 'CAMPAIGN') {
    document.getElementById('view-campaign-map')?.classList.add('active');
    if (typeof renderCampaignView === 'function') renderCampaignView(); // 공용 헤더까지 붙인다
    else render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
