// ============================================================================
// UI Module: Unit Fear, Disobedience & Refusal FX Handler
// ============================================================================

(function (global) {
  'use strict';

  if (!global.UI) {
    global.UI = {};
  }

  /**
   * Generates a synthetic low-frequency thudding heartbeat sound using Web Audio API
   *
   * @param {number} intensity - Gain level (0.0 to 1.0)
   */
  function playHeartbeatSFX(intensity = 0.8) {
    try {
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Double-thump heartbeat simulation ("lub-dub")
      const thumps = [
        { timeOffset: 0.0, freq: 55, duration: 0.18, vol: intensity * 0.9 },
        { timeOffset: 0.22, freq: 48, duration: 0.22, vol: intensity * 0.7 }
      ];

      thumps.forEach((thump) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(thump.freq, now + thump.timeOffset);
        osc.frequency.exponentialRampToValueAtTime(25, now + thump.timeOffset + thump.duration);

        gain.gain.setValueAtTime(0.001, now + thump.timeOffset);
        gain.gain.exponentialRampToValueAtTime(thump.vol, now + thump.timeOffset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + thump.timeOffset + thump.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + thump.timeOffset);
        osc.stop(now + thump.timeOffset + thump.duration + 0.05);
      });

      setTimeout(() => {
        if (ctx.state !== 'closed') {
          ctx.close();
        }
      }, 800);
    } catch (e) {
      console.warn('[UI] Web Audio heartbeat SFX failed:', e);
    }
  }

  /**
   * Fast Typewriter effect for dialogue / panic lines
   *
   * @param {HTMLElement} element - Target container element
   * @param {string} text - Message to print
   * @param {number} speedMs - Delay in ms per character
   * @param {Function} [onComplete] - Callback on finish
   */
  function typewriteText(element, text, speedMs = 24, onComplete) {
    if (!element) return;
    element.textContent = '';
    element.classList.add('typing-active');

    let idx = 0;
    const timer = setInterval(() => {
      element.textContent += text.charAt(idx);
      idx++;
      if (idx >= text.length) {
        clearInterval(timer);
        element.classList.remove('typing-active');
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }
    }, speedMs);
  }

  /**
   * 캐릭터 일러스트 + 말풍선을 게임 화면 위에 잠깐 띄운다. (클릭은 통과, 화면 터치 시 즉시 닫힘)
   *
   * @param {Object} unit - 말하는 유닛 (name 사용)
   * @param {string} text - 대사
   * @param {Object} [opts]
   * @param {string} [opts.imageUrl] - 전신 일러스트 URL
   * @param {'refuse'|'brave'|'forced'|'victory'} [opts.mood='refuse'] - 연출 톤
   * @param {number} [opts.durationMs=3000]
   */
  let removeActiveSpeech = null;
  function showUnitSpeech(unit, text, opts = {}) {
    if (!unit || !text) return;
    const mood = opts.mood || 'refuse';
    const durationMs = opts.durationMs || 3000;
    const host = document.getElementById('mobile-app') || document.body;

    if (removeActiveSpeech) removeActiveSpeech();

    const layer = document.createElement('div');
    layer.id = 'unit-speech-layer';
    layer.className = `unit-speech-layer mood-${mood}`;
    layer.innerHTML = `
      ${opts.imageUrl ? `<img class="unit-speech-illust" alt="" />` : ''}
      <div class="unit-speech-bubble">
        <div class="unit-speech-name"></div>
        <div class="unit-speech-text"></div>
      </div>
    `;
    if (opts.imageUrl) layer.querySelector('.unit-speech-illust').src = opts.imageUrl;
    layer.querySelector('.unit-speech-name').textContent = unit.name || '';
    host.appendChild(layer);

    let hideTimer = null;
    let armTimer = null;
    const cleanup = () => {
      clearTimeout(hideTimer);
      clearTimeout(armTimer);
      document.removeEventListener('pointerdown', dismiss, true);
      if (removeActiveSpeech === removeNow) removeActiveSpeech = null;
    };
    // 새 대사가 오면 이전 연출은 즉시 제거
    const removeNow = () => { cleanup(); layer.remove(); };
    function dismiss() {
      cleanup();
      layer.classList.add('leaving');
      setTimeout(() => layer.remove(), 280);
    }
    removeActiveSpeech = removeNow;

    requestAnimationFrame(() => layer.classList.add('show'));
    typewriteText(layer.querySelector('.unit-speech-text'), text, 26);
    hideTimer = setTimeout(dismiss, durationMs + text.length * 26);
    // 다음 조작(터치/클릭)이 들어오면 연출을 바로 걷어낸다. 조작 자체는 막지 않는다.
    armTimer = setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 400);
  }

  /**
   * Main Trigger: Fear & Command Rejection Emotional FX
   *
   * @param {string|number} unitId - Identifier of the distressed unit
   * @param {string} [textMessage] - Panic line
   * @param {number} [durationMs=2600] - Duration of the fear state in milliseconds
   * @param {Object} [speech] - { unit, imageUrl } 주면 일러스트+말풍선 연출을 함께 띄운다
   */
  function triggerFearFX(unitId, textMessage, durationMs = 2600, speech = null) {
    const panicQuote = textMessage || '죽고 싶지 않아요...! 제발 이번 명령만은...!';

    const unitCardAvatar = document.getElementById('card-avatar');
    const unitDetailCard = document.getElementById('selected-unit-card') || document.querySelector('.bottom-unit-card');
    const screenFrame = document.getElementById('mobile-app') || document.body;

    // Haptic vibration feedback if available
    if (navigator.vibrate) {
      try {
        navigator.vibrate([40, 80, 50, 100]);
      } catch (_) {}
    }

    // Play heartbeat sound
    playHeartbeatSFX(0.85);
    const heartbeatTimer = setTimeout(() => {
      playHeartbeatSFX(0.7);
    }, 1150);

    // Apply visual FX classes
    if (screenFrame) {
      screenFrame.classList.add('fx-heartbeat-vignette');
    }

    if (unitCardAvatar) {
      unitCardAvatar.classList.add('fx-fear-shake', 'fx-zoom-in');
    }

    if (unitDetailCard) {
      unitDetailCard.classList.add('fx-disobedience-active');
    }

    const tileUnitTokens = document.querySelectorAll(`[data-unit-id="${unitId}"]`);
    tileUnitTokens.forEach((token) => token.classList.add('fx-fear-shake'));

    // Dialogue display: 일러스트 + 말풍선
    if (speech?.unit) {
      showUnitSpeech(speech.unit, panicQuote, { imageUrl: speech.imageUrl, mood: 'refuse' });
    }

    if (typeof global.addLog === 'function') {
      global.addLog(`💔 [명령 거부/공포] "${panicQuote}"`, 'danger');
    }

    // Automatic Cleanup Logic
    setTimeout(() => {
      clearTimeout(heartbeatTimer);

      if (screenFrame) {
        screenFrame.classList.remove('fx-heartbeat-vignette');
      }

      if (unitCardAvatar) {
        unitCardAvatar.classList.remove('fx-fear-shake', 'fx-zoom-in');
      }

      if (unitDetailCard) {
        unitDetailCard.classList.remove('fx-disobedience-active');
      }

      tileUnitTokens.forEach((token) => token.classList.remove('fx-fear-shake'));
    }, durationMs);
  }

  /**
   * Helper: Resolves unit promotions array regardless of legacy format
   */
  function getUnitPromotions(unit) {
    if (!unit || !unit.promotions) return [];
    if (Array.isArray(unit.promotions)) return unit.promotions;
    const list = [];
    if (unit.promotions.combatRank) {
      for (let i = 1; i <= Math.min(unit.promotions.combatRank, 4); i++) {
        list.push(`combat_${i}`);
      }
    }
    return list;
  }

  /**
   * Generates and mounts a modal/popover dialog listing ONLY the promotions:
   * 1. Allowed for the unit's class according to window.isPromotionAllowed
   * 2. Meeting all prerequisites according to promotion.prereqs
   * 3. Not already acquired by the unit
   *
   * @param {Object} unit - Target unit object to promote
   */
  // 병과 승급 XP 테이블 + 획득 방식 안내
  function renderPromotionXpGuide() {
    const table = global.PROMOTION_XP_TABLE || {};
    const gain = global.PROMOTION_XP_GAIN || {};
    const tiers = Object.keys(table)
      .map((lv) => `<span style="padding:2px 6px; border-radius:6px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3);">Tier ${lv} · <b style="color:#fbbf24;">${table[lv]} XP</b></span>`)
      .join('');
    return `
      <div style="margin-bottom:10px; padding:8px 10px; border-radius:10px; background:rgba(15,23,42,0.6); border:1px solid rgba(148,163,184,0.2); font-size:11px; color:#cbd5e1; line-height:1.6;">
        <div style="font-weight:800; color:#fbbf24; margin-bottom:4px;">📈 승급 필요 XP</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">${tiers}</div>
        <div style="font-weight:800; color:#fbbf24; margin-bottom:2px;">🎖️ XP 획득 (전술 전투)</div>
        <div>· 교전 승리 +${gain.victory ?? 2} XP (승률 50% 미만 +${gain.underdog ?? 1}, 25% 미만 추가 +${gain.longshot ?? 1})</div>
        <div>· 패배 후 퇴각 확률로 생존 +${gain.retreat ?? 1} XP</div>
      </div>
    `;
  }

  function renderPromotionMenu(unit, opts = {}) {
    if (!unit || unit.isDead) return;

    // Remove existing promotion modal if open
    const existingModal = document.getElementById('ui-promotion-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const promoData = global.PROMOTION_DATA || {};
    const unitClass = unit.classType || unit.class || 'MELEE';
    const currentPromos = getUnitPromotions(unit);
    const unitXP = unit.xp || 0;

    // Filter strictly allowed promotions that meet prerequisites and aren't already learned
    const candidatePromos = Object.values(promoData).filter((p) => {
      // 1. Not already owned
      if (currentPromos.includes(p.id)) return false;

      // 2. Class Restriction Check
      if (typeof global.isPromotionAllowed === 'function') {
        if (!global.isPromotionAllowed(unitClass, p.category)) return false;
      }

      // 3. Prerequisite check
      if (Array.isArray(p.prereqs) && p.prereqs.length > 0) {
        const hasAllPrereqs = p.prereqs.every((reqId) => currentPromos.includes(reqId));
        if (!hasAllPrereqs) return false;
      }

      return true;
    });

    // Create Modal Elements
    const overlay = document.createElement('div');
    overlay.id = 'ui-promotion-modal';
    overlay.className = 'promotion-modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    const container = document.createElement('div');
    container.className = 'promotion-modal-card';
    container.onclick = (e) => e.stopPropagation();

    // Modal Header & Tab Navigation
    const skillTree = (typeof global.getCharacterSkillTree === 'function') 
      ? global.getCharacterSkillTree(unit.id) 
      : (unit.skillTree || global.DEFAULT_SKILL_TREE_TEMPLATE || []);

    container.innerHTML = `
      <div class="promotion-modal-header">
        <div class="promotion-modal-title">
          <span class="promotion-modal-icon">🌳</span>
          <div>
            <h3>부대 승급 훈련 & 스킬트리</h3>
            <p>${unit.name} <span class="badge-class">${(typeof CLASS_META !== 'undefined' && CLASS_META[unitClass]?.name) || unitClass}</span> | 잔여 XP: <b style="color: #fbbf24;">${unitXP} XP</b></p>
          </div>
        </div>
        <button class="promotion-modal-close" id="btn-promo-close">&times;</button>
      </div>

      <!-- Tab Switcher -->
      <div style="display:flex; background:#0f172a; border-bottom:1px solid rgba(245,158,11,0.2); padding:4px 12px; gap:8px;">
        <button id="tab-btn-promo" class="promo-tab-btn active" style="flex:1; padding:6px 0; background:transparent; border:none; border-bottom:2px solid #fbbf24; color:#fbbf24; font-weight:800; font-size:12px; cursor:pointer;">
          ⭐ 병과 승급 (Promotions)
        </button>
        <button id="tab-btn-skills" class="promo-tab-btn" style="flex:1; padding:6px 0; background:transparent; border:none; border-bottom:2px solid transparent; color:#94a3b8; font-weight:800; font-size:12px; cursor:pointer;">
          🌳 스킬트리 (해금권 ${Number(unit.skillPoints) || 0})
        </button>
      </div>

      <!-- Tab 1: Promotion List -->
      <div class="promotion-modal-body" id="tab-content-promo">
        ${renderPromotionXpGuide()}
        ${
          candidatePromos.length === 0
            ? `<div class="promotion-empty-state">현재 습득 가능한 승급 항목이 없거나 이미 최고 단계입니다.</div>`
            : `<div class="promotion-list-grid">
                ${candidatePromos
                  .map((p) => {
                    const reqXp = typeof global.getPromotionXpCost === 'function' ? global.getPromotionXpCost(p.level) : p.level * 3;
                    const canAfford = unitXP >= reqXp;
                    return `
                      <div class="promotion-option-card ${canAfford ? '' : 'disabled'}" data-promo-id="${p.id}">
                        <div class="promo-card-top">
                          <span class="promo-icon">${p.icon || '⚔️'}</span>
                          <div class="promo-info">
                            <span class="promo-name">${p.name}</span>
                            <span class="promo-category">${p.category} Tier ${p.level}</span>
                          </div>
                          <span class="promo-cost-tag ${canAfford ? 'cost-ok' : 'cost-short'}">${reqXp} XP</span>
                        </div>
                        <div class="promo-desc">${p.effects?.description || '전투 능력 강화'}</div>
                        <div class="promo-heal-note">💚 승급 즉시 최대 HP의 50% 응급 치료</div>
                        <button class="promo-select-btn" ${canAfford ? '' : 'disabled'}>
                          ${canAfford ? '승급 습득 (+50% HP)' : 'XP 부족'}
                        </button>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
        }
      </div>

      <!-- Tab 2: Character Skill Tree (SP로 습득) -->
      <div class="promotion-modal-body" id="tab-content-skills" style="display:none;"></div>
    `;

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Event Listeners
    container.querySelector('#btn-promo-close').onclick = () => overlay.remove();

    // Tab Switching Logic
    const tabPromoBtn = container.querySelector('#tab-btn-promo');
    const tabSkillsBtn = container.querySelector('#tab-btn-skills');
    const tabContentPromo = container.querySelector('#tab-content-promo');
    const tabContentSkills = container.querySelector('#tab-content-skills');

    if (tabPromoBtn && tabSkillsBtn) {
      tabPromoBtn.onclick = () => {
        tabPromoBtn.style.borderBottomColor = '#fbbf24';
        tabPromoBtn.style.color = '#fbbf24';
        tabSkillsBtn.style.borderBottomColor = 'transparent';
        tabSkillsBtn.style.color = '#94a3b8';
        tabContentPromo.style.display = '';
        tabContentSkills.style.display = 'none';
      };

      tabSkillsBtn.onclick = () => {
        tabSkillsBtn.style.borderBottomColor = '#38bdf8';
        tabSkillsBtn.style.color = '#38bdf8';
        tabPromoBtn.style.borderBottomColor = 'transparent';
        tabPromoBtn.style.color = '#94a3b8';
        tabContentPromo.style.display = 'none';
        tabContentSkills.style.display = '';
      };
    }

    // 스킬트리 탭: SP로 스킬 습득
    const skillsBody = container.querySelector('#tab-content-skills');
    if (skillsBody && global.SkillEditor) {
      global.SkillEditor.renderLearnTree(skillsBody, unit, {
        onLearn: (u, node) => {
          if (typeof global.addLog === 'function') global.addLog(`🌳 [스킬 해금] ${u.name}이(가) [${node.name}]을(를) 익혔습니다! (잔여 해금권 ${u.skillPoints}장)`, 'gold');
          if (tabSkillsBtn) tabSkillsBtn.textContent = `🌳 스킬트리 (해금권 ${u.skillPoints})`;
          if (typeof global.saveGameState === 'function') global.saveGameState();
          if (typeof global.updateFullShotOverlay === 'function') global.updateFullShotOverlay();
          if (typeof global.renderAll === 'function') global.renderAll();
        },
        onAbsorb: (u) => {
          if (tabSkillsBtn) tabSkillsBtn.textContent = `🌳 스킬트리 (해금권 ${u.skillPoints})`;
          if (typeof global.updateFullShotOverlay === 'function') global.updateFullShotOverlay();
          if (typeof global.renderAll === 'function') global.renderAll();
        }
      });
    }
    if (opts.tab === 'skills' && tabSkillsBtn) tabSkillsBtn.onclick();

    container.querySelectorAll('.promotion-option-card[data-promo-id]:not(.disabled)').forEach((card) => {
      card.onclick = () => {
        const promoId = card.getAttribute('data-promo-id');
        if (!promoId) return;

        // Apply Promotion Logic
        if (typeof global.applyPromotion === 'function') {
          const success = global.applyPromotion(unit, promoId);
          if (success) {
            triggerLevelUpFX(unit.id);
            overlay.remove();
          }
        }
      };
    });
  }

  /**
   * Plays a radiant golden glow/aura animation on the unit and floats
   * an animated green "+50% HP" recovery text over the unit sprite.
   *
   * @param {string|number} unitId - Target unit identifier
   */
  function triggerLevelUpFX(unitId) {
    // 1. Target elements (Tile Sprite and Bottom Portrait Card)
    const unitTokens = document.querySelectorAll(`[data-unit-id="${unitId}"]`);
    const cardAvatar = document.getElementById('card-avatar');
    const selectedUnitCard = document.getElementById('selected-unit-card') || document.querySelector('.bottom-unit-card');

    // 2. Play subtle chime sound effect via Web Audio API
    try {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 triumph arpeggio
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.001, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.3);
        });
        setTimeout(() => ctx.close(), 1200);
      }
    } catch (_) {}

    // 3. Attach Aura & Glowing Keyframe classes
    unitTokens.forEach((token) => {
      token.classList.add('fx-promote-glow');

      // Floating "+50% HP" & "LEVEL UP!" indicator tag
      const floatTag = document.createElement('div');
      floatTag.className = 'floating-heal-text';
      floatTag.innerHTML = `<span>⭐ UPGRADE!</span><br><b style="color:#22c55e;">+50% HP</b>`;
      token.appendChild(floatTag);

      setTimeout(() => {
        token.classList.remove('fx-promote-glow');
        floatTag.remove();
      }, 2200);
    });

    if (cardAvatar) {
      cardAvatar.classList.add('fx-promote-glow');
      setTimeout(() => cardAvatar.classList.remove('fx-promote-glow'), 2200);
    }

    if (selectedUnitCard) {
      selectedUnitCard.classList.add('fx-promote-pulse');
      setTimeout(() => selectedUnitCard.classList.remove('fx-promote-pulse'), 2200);
    }
  }

  // ============================================================================
  // DEV 캐릭터 생성용 스킬트리 빌더 (UI는 skillEditor.js, 데이터 구조는 skillEngine.js)
  // ============================================================================

  // 생성 대기 중인 캐릭터의 스킬트리 초안
  let devDraftSkillTree = null;
  let devDraftTouched = false;
  let devBuilder = null;

  function currentCreateClass() {
    const sel = document.getElementById('create-char-class');
    return (sel && sel.value) || 'KNIGHT';
  }

  function initDevDraftSkillTree(classType) {
    devDraftSkillTree = global.SkillEngine
      ? global.SkillEngine.buildClassTree(classType || currentCreateClass())
      : JSON.parse(JSON.stringify(global.DEFAULT_SKILL_TREE_TEMPLATE || []));
    devDraftTouched = false;
  }

  /**
   * characterId가 있으면 저장된 캐릭터의 스킬트리 편집 모달을 열고,
   * 없으면 DEV 생성 탭(섹션 3)에 생성 초안용 빌더를 그린다.
   */
  function renderDevSkillTreeEditor(characterId) {
    if (characterId) {
      if (typeof global.openCharacterSkillTreeEditor === 'function') global.openCharacterSkillTreeEditor(characterId);
      return;
    }
    const container = document.getElementById('dev-skill-tree-builder-container');
    if (!container || !global.SkillEditor) return;
    if (!devDraftSkillTree) initDevDraftSkillTree();
    devBuilder = global.SkillEditor.mountBuilder(container, {
      getTree: () => devDraftSkillTree,
      setTree: (tree) => { devDraftSkillTree = tree; devDraftTouched = true; },
      getClassType: currentCreateClass
    });
  }

  /** 병과를 바꿨을 때: 사용자가 손대지 않은 초안이면 새 병과의 추천 트리로 교체한다. */
  function resetDevDraftSkillTree(classType, force) {
    if (devDraftTouched && !force) return false;
    initDevDraftSkillTree(classType);
    if (devBuilder) devBuilder.render();
    return true;
  }

  /** 생성 버튼을 눌렀을 때 사용할 스킬트리 사본 */
  function getDevDraftSkillTree() {
    if (!devDraftSkillTree) initDevDraftSkillTree();
    return JSON.parse(JSON.stringify(devDraftSkillTree));
  }

  // ============================================================================
  // 1. TOTAL DEFEAT (PARTY WIPEOUT) POPUP MODAL (window.UI.showDefeatModal)
  // ============================================================================

  /**
   * Displays a dark full-screen modal informing the player that all units have been defeated,
   * with a 1-hour inactivation status timer and clear guide steps on recovery options.
   *
   * @param {Object} [defeatInfo] - Optional defeat metadata (wipeoutUntil, remainingMs, message)
   */
  function showDefeatModal(defeatInfo) {
    let modal = document.getElementById('modal-party-defeat');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-party-defeat';
      modal.className = 'modal-backdrop modal-defeat-overlay active';
      document.body.appendChild(modal);
    } else {
      modal.style.display = 'flex';
      modal.className = 'modal-backdrop modal-defeat-overlay active';
    }

    const state = global.state || {};
    const wipeoutUntil = defeatInfo?.wipeoutUntil || state.wipeoutUntil || (Date.now() + 3600000);

    function formatRemaining() {
      const remaining = Math.max(0, wipeoutUntil - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    modal.innerHTML = `
      <div class="modal-window defeat-modal-window">
        <div class="defeat-skull-icon">💀</div>
        <h2 class="defeat-title">아군 전멸 (ALL UNITS DEFEATED)</h2>
        <p class="defeat-subtitle">
          All units have been defeated! Your roster is incapacitated for 1 hour.
        </p>
        <p style="font-size: 11.5px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">
          전선의 모든 부대가 치명상을 입고 쓰러졌습니다.<br/>
          야전 부대 정비 및 긴급 치료를 위해 1시간 동안 전선 출격이 제한됩니다.
        </p>

        <!-- Countdown Box -->
        <div class="defeat-timer-box">
          <div style="font-size: 10px; color: #fca5a5; font-weight: 800; letter-spacing: 0.5px;">⏳ 부대 정비 완료까지 남은 시간</div>
          <div id="defeat-timer-countdown" class="defeat-timer-val">
            ${formatRemaining()}
          </div>
        </div>

        <!-- Instructions & Recovery Options Guide -->
        <div class="defeat-guide-card">
          <div class="defeat-guide-header">
            <span>📋</span>
            <span>지휘관 긴급 복구 가이드 (How to Recover)</span>
          </div>

          <div class="defeat-guide-step step-rewind">
            <div class="defeat-step-title">Option A: ⏳ 리와인더(Rewinder) 시간 회귀</div>
            <div class="defeat-step-desc">직전 턴 상태 스냅샷으로 되돌려 전멸 참사를 회피하고 전술을 재수립합니다.</div>
          </div>

          <div class="defeat-guide-step step-safezone">
            <div class="defeat-step-title">Option B: 🏰 안전지대(마을/도시) 신규 용병 고용</div>
            <div class="defeat-step-desc">평화로운 마을이나 왕도 에테르니아 용병 고용소에서 즉시 새로운 부대를 고용합니다.</div>
          </div>

          <div class="defeat-guide-step step-wildrecruit">
            <div class="defeat-step-title">Option C: 🤝 안전지대 경계 야생 유닛 설득/포섭</div>
            <div class="defeat-step-desc">거점 주변의 야생 유닛에게 금화나 군량을 제시하여 아군 부대로 포섭 영입합니다.</div>
          </div>
        </div>

        <!-- Action Buttons Grid -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="btn-defeat-rewind" style="width: 100%; padding: 11px; background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); color: #ffffff; border: none; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);">
            <span>⏳ 리와인더 사용 (Use Rewinder)</span>
          </button>

          <button id="btn-defeat-safe-shop" style="width: 100%; padding: 11px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; border: none; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
            <span>🏰 안전지대 상점 이동 (Go to Nearest Safe Zone / Shop)</span>
          </button>

          <button id="btn-defeat-close" style="width: 100%; padding: 9px; background: #334155; color: #94a3b8; border: 1px solid #475569; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">
            <span>✕ 닫기 (Close)</span>
          </button>
        </div>
      </div>
    `;

    const timerInterval = setInterval(() => {
      const countdownEl = document.getElementById('defeat-timer-countdown');
      if (countdownEl) {
        countdownEl.textContent = formatRemaining();
        if (Date.now() >= wipeoutUntil) {
          clearInterval(timerInterval);
          if (global.state) {
            global.state.isWipedOut = false;
            global.state.inactivated = false;
            if (typeof global.saveGameState === 'function') global.saveGameState();
          }
        }
      } else {
        clearInterval(timerInterval);
      }
    }, 1000);

    const btnRewind = document.getElementById('btn-defeat-rewind');
    if (btnRewind) {
      btnRewind.onclick = () => {
        clearInterval(timerInterval);
        modal.style.display = 'none';
        modal.classList.remove('active');
        if (typeof global.rewindLastTurn === 'function') {
          global.rewindLastTurn();
        } else if (typeof global.addLog === 'function') {
          global.addLog('⏳ 직전 턴 스냅샷으로 회귀를 시도합니다.', 'system');
        }
      };
    }

    const btnSafeShop = document.getElementById('btn-defeat-safe-shop');
    if (btnSafeShop) {
      btnSafeShop.onclick = () => {
        clearInterval(timerInterval);
        modal.style.display = 'none';
        modal.classList.remove('active');

        // 안전 거점 타일 찾기
        const tiles = (typeof global.getBattleTiles === 'function' ? global.getBattleTiles() : []) || [];
        const safeTile = tiles.find(t => t && (t.isSafe || t.isCity || t.type === 'city' || t.type === 'village'))
          || { x: 1, y: 1, name: '평화로운 마을' };
        const safeTownName = safeTile.name || '평화로운 마을';

        // 최소 체력으로 지휘관 부대 응급 회복 후 거점에 배치
        if (global.state && Array.isArray(global.state.playerUnits) && global.state.playerUnits.length > 0) {
          const leader = global.state.playerUnits[0];
          leader.isDead = false;
          leader.hp = Math.round((leader.maxHp || 100) * 0.35);
          leader.x = typeof safeTile.x === 'number' ? safeTile.x : 1;
          leader.y = typeof safeTile.y === 'number' ? safeTile.y : 1;
          leader.isInactivated = false;
          leader.inactivatedUntil = null;
          global.state.isWipedOut = false;
          global.state.inactivated = false;
          if (typeof global.addLog === 'function') {
            global.addLog(`🏥 [응급 후송] ${safeTownName} 안전지대로 긴급 후송되었습니다.`, 'gold');
          }
          if (typeof global.saveGameState === 'function') global.saveGameState();
          if (typeof global.renderAll === 'function') global.renderAll();
        }

        // 안전 거점 상점 모달 열기
        renderTownUnitShop(safeTile.id || 'safe_town');
      };
    }

    const btnClose = document.getElementById('btn-defeat-close');
    if (btnClose) {
      btnClose.onclick = () => {
        clearInterval(timerInterval);
        modal.style.display = 'none';
        modal.classList.remove('active');
      };
    }
  }

  // ============================================================================
  // TACTICAL MAP VICTORY MODAL & REWARD DISPLAY HANDLERS (window.UI.showVictoryModal)
  // ============================================================================

  /**
   * Generates a triumphant, heroic victory fanfare sound using Web Audio API
   */
  function playVictoryFanfareSFX() {
    try {
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Heroic triumphant fanfare chord progression: C5 -> E5 -> G5 -> C6 with warm harmonics
      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.16, vol: 0.28 }, // C5
        { freq: 659.25, time: 0.15, dur: 0.16, vol: 0.30 }, // E5
        { freq: 783.99, time: 0.30, dur: 0.20, vol: 0.35 }, // G5
        { freq: 1046.50, time: 0.50, dur: 0.75, vol: 0.42 }, // C6 (triumphant climax)
        { freq: 1318.51, time: 0.52, dur: 0.65, vol: 0.20 }  // E6 (sparkle overtone)
      ];

      notes.forEach(({ freq, time, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle'; // Warm brass timbre
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.001, now + time);
        gain.gain.exponentialRampToValueAtTime(vol, now + time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });

      // Bass undertone for cinematic impact
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(130.81, now + 0.50); // C3
      bassGain.gain.setValueAtTime(0.001, now + 0.50);
      bassGain.gain.exponentialRampToValueAtTime(0.25, now + 0.54);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
      bass.connect(bassGain);
      bassGain.connect(ctx.destination);
      bass.start(now + 0.50);
      bass.stop(now + 1.30);

      setTimeout(() => {
        if (ctx.state !== 'closed') {
          ctx.close();
        }
      }, 1600);
    } catch (e) {
      console.warn('[UI] Web Audio victory fanfare SFX failed:', e);
    }
  }

  /**
   * Displays a tactical victory modal overlaying the game screen with victory
   * sound/visual effects and battle summary statistics.
   *
   * @param {Object} [rewardData] - Tactical victory reward summary payload
   * @param {number} [rewardData.gold] - Total gold reward earned (Defeated Count * 100 Gold)
   * @param {boolean} [rewardData.rewinderGranted] - Whether Rewinder item was obtained (50% chance)
   * @param {number} [rewardData.defeatedCount] - Total number of enemies defeated in battle
   */
  function showVictoryModal(rewardData, opts) {
    // 1. Play triumphant fanfare sound effects (서버 수령 결과로 다시 그릴 때는 생략)
    if (!(opts && opts.silent)) playVictoryFanfareSFX();

    // 2. Locate or dynamically construct victory modal backdrop
    let modal = document.getElementById('modal-tactical-victory');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-tactical-victory';
      document.body.appendChild(modal);
    }

    modal.className = 'modal-backdrop modal-victory-overlay active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 14px;';

    // 3. Extract and sanitize battle reward parameters
    const state = global.state || {};
    const defeatedCount = (typeof rewardData?.defeatedCount === 'number')
      ? rewardData.defeatedCount
      : (typeof global.defeatedEnemyCount === 'number' ? global.defeatedEnemyCount : 1);
    const gold = (typeof rewardData?.gold === 'number')
      ? rewardData.gold
      : (defeatedCount * 100);
    const rewinderGranted = !!rewardData?.rewinderGranted;
    // 서버 수령 상태: pending(확인 중) · deferred(서버 연결 대기 — 연결되면 지급) · failed(지급 거절)
    const rewardPending = !!rewardData?.pending, rewardDeferred = !!rewardData?.deferred, rewardFailed = !!rewardData?.failed;
    const waitText = rewardDeferred ? '서버 연결 대기 — 연결되면 지급' : '서버 확인 중…';

    const curGold = global.playerState?.gold ?? (state?.gold ?? 0);
    const curRewinders = global.playerState?.rewinders ?? (state?.rewinders ?? 0);

    // 4. Render Victory Modal HTML
    modal.innerHTML = `
      <div class="modal-window victory-modal-window">
        
        <!-- Victory Icon & Confetti Radiance -->
        <div class="victory-trophy-icon">
          🏆
        </div>
        
        <h2 class="victory-title">
          전술 전장 승리!
        </h2>
        <div class="victory-subtitle">
          TACTICAL VICTORY & REWARDS
        </div>
        
        <p style="font-size: 12.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 18px 0;">
          작전 지역의 모든 적군 부대를 완전히 소탕하고<br/>
          <strong style="color: #fef08a;">전술적 승리</strong>를 쟁취하였습니다!
        </p>

        <!-- Battle Summary Statistics Card -->
        <div class="victory-reward-card">
          
          <!-- Number of Enemies Defeated -->
          <div class="victory-reward-row">
            <span class="victory-reward-label">
              <span>⚔️</span> 격퇴한 적군 수
            </span>
            <span class="victory-reward-val victory-defeated-counter">
              <span>${defeatedCount}기 소탕</span>
              <span style="font-size: 11px; color: #cbd5e1; font-weight: 700;">(${defeatedCount} Defeated)</span>
            </span>
          </div>

          <!-- Guaranteed Gold Reward (Defeated Count * 100) -->
          <div class="victory-reward-row">
            <span class="victory-reward-label">
              <span>💰</span> 확정 골드 전리품
            </span>
            <span class="victory-reward-val victory-gold-text">
              ${rewardPending ? waitText : rewardFailed ? '지급되지 않음' : `+${gold} Gold <span class="victory-gold-badge">${defeatedCount} × 100G</span>`}
            </span>
          </div>

          <!-- Rewinder Item Result (50% Chance) -->
          <div class="victory-reward-row">
            <span class="victory-reward-label">
              <span>⏳</span> 시간 회귀의 모래시계
            </span>
            ${rewardPending ? `<span class="victory-rewinder-none">${waitText}</span>` : rewinderGranted
              ? `<span class="victory-rewinder-highlight">
                  <span>✨</span> Rewinder Item Obtained (+1)
                </span>`
              : `<span class="victory-rewinder-none">
                  Rewinder Item: None (50% Chance)
                </span>`
            }
          </div>
        </div>

        <!-- Current Player State Summary Bar -->
        <div class="victory-status-bar">
          <span>보유 국고: <strong class="victory-gold-text" style="font-size: 13px;">${curGold} Gold</strong></span>
          <span style="color: #475569;">|</span>
          <span>보유 리와인더: <strong style="color: #00ffff; font-weight: 900;">${curRewinders} 개</strong></span>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="btn-victory-proceed" class="victory-action-btn">
            <span>🏛️ Return to Map / Proceed</span>
          </button>
          <button id="btn-victory-explore" class="victory-action-btn secondary">
            <span>🗺️ 현재 전장 잔류 (Explore Field)</span>
          </button>
        </div>
      </div>
    `;

    // 5. Action Button Handlers
    const closeVictoryModal = (proceedToStrategy = false) => {
      modal.style.display = 'none';
      modal.classList.remove('active');

      // Safely resets tactical stage state
      if (typeof global.resetTacticalBattleState === 'function') {
        global.resetTacticalBattleState();
      }

      // Transition player if requested
      if (proceedToStrategy) {
        if (typeof global.switchGameView === 'function') {
          global.switchGameView('STRATEGY');
        }
      }

      if (typeof global.renderAll === 'function') {
        global.renderAll();
      }
      if (typeof global.saveGameState === 'function') {
        global.saveGameState();
      }
    };

    const btnProceed = document.getElementById('btn-victory-proceed');
    if (btnProceed) {
      btnProceed.onclick = () => closeVictoryModal(true);
    }

    const btnExplore = document.getElementById('btn-victory-explore');
    if (btnExplore) {
      btnExplore.onclick = () => closeVictoryModal(false);
    }
  }

  // ============================================================================
  // 2. SAFE ZONE (TOWN/CITY) UNIT SHOP MODAL (window.UI.renderTownUnitShop)
  // ============================================================================

  /**
   * Generates a modal listing available units for hire in the town with price,
   * unit stats, and a [Hire / Buy] button for each.
   *
   * @param {string|number} [townId] - Safe Zone Town/City identifier
   */
  function renderTownUnitShop(townId) {
    let modal = document.getElementById('modal-town-unit-shop');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-town-unit-shop';
      modal.className = 'modal-backdrop town-shop-modal-overlay active';
      document.body.appendChild(modal);
    } else {
      modal.style.display = 'flex';
      modal.className = 'modal-backdrop town-shop-modal-overlay active';
    }

    const state = global.state || {};
    const catalog = (global.TOWN_UNIT_SHOP_CATALOG || global.unitShopSystem?.TOWN_UNIT_SHOP_CATALOG || []).map(u => ({ ...u, cost: global.scaleShopGold ? global.scaleShopGold(u.cost) : (global.scaleGold ? global.scaleGold(u.cost) : u.cost) })); // 기준가 × 물가

    // 안전 거점 정보 계산 (safeZoneTile이 null일 경우에도 안전하게 마을 거점 정보로 폴백)
    const safeZoneTile = (typeof global.unitShopSystem?.isPlayerAtSafeZone === 'function')
      ? global.unitShopSystem.isPlayerAtSafeZone()
      : null;

    const allTiles = (typeof global.getBattleTiles === 'function' ? global.getBattleTiles() : []) || [];

    const fallbackTile = allTiles.find(t => t && (t.isSafe || t.isCity || t.type === 'city' || t.type === 'village'))
      || { name: '평화로운 마을 거점', isCity: false, x: 1, y: 1 };

    const safeTile = safeZoneTile || fallbackTile || { name: '평화로운 마을 거점', isCity: false, x: 1, y: 1 };
    const safeTileName = safeTile.name || '평화로운 마을 거점';

    const townLevel = (typeof global.unitShopSystem?.getTownLevel === 'function')
      ? global.unitShopSystem.getTownLevel(safeTile)
      : (safeTileName.includes('에테르니아') ? 3 : (safeTile.isCity ? 2 : 1));

    const livingUnits = (state.playerUnits || []).filter(u => !u.isDead);
    const maxLeadership = typeof global.getLeadership === 'function' ? global.getLeadership() : 4;
    const playerGold = typeof state.gold === 'number' ? state.gold : 0;

    const classColors = {
      MELEE: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
      ARCHER: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
      MAGE: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
      KNIGHT: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
      FIREARM: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' }
    };

    modal.innerHTML = `
      <div class="modal-window town-shop-modal">
        <!-- Header -->
        <div class="town-shop-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 26px;">🏰</span>
            <div>
              <div style="font-size: 16px; font-weight: 900; letter-spacing: -0.3px;">${safeTileName} 용병 고용소</div>
              <div style="font-size: 11px; color: #bae6fd; font-weight: 600;">거점 등급: Lv.${townLevel} (${townLevel >= 3 ? '왕도 수도' : (townLevel === 2 ? '성채 도시' : '자유 마을')})</div>
            </div>
          </div>
          <button id="btn-close-unit-shop" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>

        <!-- Resources Pill Bar -->
        <div class="town-shop-pills-bar">
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #0f172a;">
            <span>🪙 보유 국고:</span>
            <span id="shop-player-gold" style="color: #b45309; font-size: 14px;">${playerGold}G</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #0f172a;">
            <span>⚡ 편성 통솔력:</span>
            <span id="shop-roster-count" style="color: ${livingUnits.length >= maxLeadership ? '#ef4444' : '#0284c7'}; font-size: 13px;">${livingUnits.length} / ${maxLeadership}</span>
          </div>
        </div>

        <!-- Catalog List Body -->
        <div class="town-shop-catalog-list">
          ${catalog.map(unit => {
            const isLocked = townLevel < unit.reqTownLevel;
            const canAfford = playerGold >= unit.cost;
            const hasCapacity = livingUnits.length < maxLeadership;
            const cStyle = classColors[unit.classType] || classColors.MELEE;

            let buttonLabel = `고용 (🪙 ${unit.cost}G)`;
            let buttonDisabled = false;

            if (isLocked) {
              buttonLabel = `🔒 거점 Lv.${unit.reqTownLevel} 필요`;
              buttonDisabled = true;
            } else if (!canAfford) {
              buttonLabel = `골드 부족 (🪙 ${unit.cost}G)`;
              buttonDisabled = true;
            } else if (!hasCapacity) {
              buttonLabel = `통솔력 한도 초과`;
              buttonDisabled = true;
            }

            return `
              <div class="unit-shop-card shop-unit-card ${isLocked ? 'locked' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="display: flex; gap: 10px; align-items: center;">
                    <div class="unit-shop-avatar-box" style="background: ${cStyle.bg}; border: 1.5px solid ${cStyle.border};">
                      ${unit.avatar || '🛡️'}
                    </div>
                    <div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 14px; font-weight: 900; color: #0f172a;">${unit.name}</span>
                        <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: ${cStyle.bg}; color: ${cStyle.text}; border: 0.5px solid ${cStyle.border};">${unit.classType}</span>
                      </div>
                      <div style="font-size: 11px; color: #64748b; margin-top: 2px; line-height: 1.3;">
                        ${unit.description}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Stats Bar -->
                <div class="shop-stats-grid">
                  <div>❤️ HP <b style="color: #0f172a;">${unit.stats.hp}</b></div>
                  <div>⚔️ ATK <b style="color: #b91c1c;">${unit.stats.atk}</b></div>
                  <div>🛡️ DEF <b style="color: #0369a1;">${unit.stats.def}</b></div>
                  <div>⚡ AP <b style="color: #7c3aed;">${unit.stats.mobility}</b></div>
                </div>

                <!-- Footer / Buy Button -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                  <div style="font-size: 11px; color: #64748b;">
                    유지비: <b style="color: #0f172a;">${unit.upkeep || 10}G</b>/턴
                  </div>
                  <button class="btn-hire-unit" data-unit-id="${unit.id}" ${buttonDisabled ? 'disabled' : ''}>
                    ${buttonLabel}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Close button
    const closeBtn = document.getElementById('btn-close-unit-shop');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.style.display = 'none';
        modal.classList.remove('active');
      };
    }

    // Bind Hire buttons
    modal.querySelectorAll('.btn-hire-unit').forEach((btn) => {
      btn.onclick = () => {
        const uId = btn.getAttribute('data-unit-id');
        if (!uId) return;

        if (typeof global.buyUnitAtTown === 'function') {
          const res = global.buyUnitAtTown(townId, uId);
          if (res?.success) {
            // Re-render to update gold and unit counts
            renderTownUnitShop(townId);
          }
        }
      };
    });
  }

  // ============================================================================
  // 3. WILD UNIT PERSUASION & RECRUITMENT MODAL (window.UI.renderWildRecruitMenu)
  // ============================================================================

  /**
   * Displays persuasion options (Offer Gold, Use Affinity Item, Persuade by Force)
   * with calculated success rates for recruiting wild units.
   *
   * @param {Object} [wildUnit] - Target wild/enemy unit to negotiate with
   */
  function renderWildRecruitMenu(wildUnit) {
    const state = global.state || {};
    const target = wildUnit || state.selectedUnit || (state.enemyUnits || []).find(e => !e.isDead);

    if (!target) {
      if (typeof global.addLog === 'function') {
        global.addLog('⚠️ 설득 가능한 야생/적군 유닛이 선택되지 않았습니다.', 'warning');
      }
      return;
    }

    let modal = document.getElementById('modal-wild-recruit');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-wild-recruit';
      modal.className = 'modal-backdrop wild-recruit-modal-overlay active';
      document.body.appendChild(modal);
    } else {
      modal.style.display = 'flex';
      modal.className = 'modal-backdrop wild-recruit-modal-overlay active';
    }

    // Calculate rates for the 3 options
    const calcFn = global.recruitmentSystem?.calculatePersuadeChance;
    const rateGold = calcFn ? Math.round(calcFn(target, 'gold') * 100) : 75;
    const rateItem = calcFn ? Math.round(calcFn(target, 'treaty') * 100) : 90;
    const rateForce = calcFn ? Math.round(calcFn(target, null) * 100) : 45;

    const currentGold = typeof state.gold === 'number' ? state.gold : 0;
    const bribeCost = global.scaleGold ? global.scaleGold(80) : 80; // 금화 제시 계약금 (기준가 80G × 물가)
    const hpPct = Math.round(((target.hp || 1) / (target.maxHp || 100)) * 100);

    modal.innerHTML = `
      <div class="modal-window wild-recruit-window">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">🤝</span>
            <span style="font-size: 16px; font-weight: 900; color: #38bdf8;">야생 유닛 포섭 및 협상</span>
          </div>
          <button id="btn-close-wild-recruit" style="background: #1e293b; border: 1px solid #334155; color: #94a3b8; width: 28px; height: 28px; border-radius: 50%; font-size: 14px; cursor: pointer;">✕</button>
        </div>

        <!-- Target Unit Status Card -->
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 14px; margin-bottom: 16px; text-align: left;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
            <div style="width: 46px; height: 46px; border-radius: 12px; background: #0f172a; border: 1.5px solid #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 22px;">
              ${target.avatar || '👹'}
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 900; color: #f8fafc;">${target.name}</div>
              <div style="font-size: 11px; color: #94a3b8; display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                <span style="color: #38bdf8; font-weight: 800;">Lv.${target.level || 1}</span>
                <span>•</span>
                <span>${target.classType || 'WILD'}</span>
                <span>•</span>
                <span>호감도: ${target.affection || target.favorability || 50}/100</span>
              </div>
            </div>
          </div>

          <!-- HP Bar -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">
              <span>잔여 생명력 (낮을수록 포섭률 증가)</span>
              <span style="color: ${hpPct <= 35 ? '#4ade80' : '#f87171'};">${target.hp} / ${target.maxHp} (${hpPct}%)</span>
            </div>
            <div style="width: 100%; height: 6px; background: #0f172a; border-radius: 3px; overflow: hidden;">
              <div style="width: ${hpPct}%; height: 100%; background: ${hpPct <= 35 ? '#4ade80' : '#38bdf8'}; transition: width 0.3s ease;"></div>
            </div>
          </div>
        </div>

        <!-- 3 Persuasion Strategy Options -->
        <div class="recruit-options-list">
          <!-- 1. Offer Gold -->
          <button id="btn-recruit-gold" class="recruit-option-btn" ${currentGold < bribeCost ? 'disabled' : ''}>
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                <span>🪙 금화 제시 (Offer Gold)</span>
                <span style="font-size: 11px; color: #fbbf24; font-weight: 700;">-${bribeCost}G</span>
              </div>
              <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">풍족한 금화로 용병 계약 체결 (보유: ${currentGold}G)</div>
            </div>
            <div class="recruit-rate-badge mid">
              성공률 ${rateGold}%
            </div>
          </button>

          <!-- 2. Use Affinity Item -->
          <button id="btn-recruit-item" class="recruit-option-btn">
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                <span>🎁 친밀 계약서/군량 선물 (Use Affinity Item)</span>
              </div>
              <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">평화 조약서 또는 특급 군량으로 최고 호감도 유도</div>
            </div>
            <div class="recruit-rate-badge high">
              성공률 ${rateItem}%
            </div>
          </button>

          <!-- 3. Persuade by Force -->
          <button id="btn-recruit-force" class="recruit-option-btn">
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                <span>⚔️ 무력 위압 설득 (Persuade by Force)</span>
                <span style="font-size: 10.5px; color: #94a3b8; font-weight: 700;">(비용 없음)</span>
              </div>
              <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">지휘관 위압감으로 굴복 유도 (실패 시 기습 반격 위험)</div>
            </div>
            <div class="recruit-rate-badge risky">
              성공률 ${rateForce}%
            </div>
          </button>
        </div>

        <button id="btn-recruit-cancel" style="width: 100%; padding: 10px; background: #334155; color: #94a3b8; border: 1px solid #475569; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">
          ✕ 협상 중단 및 후퇴
        </button>
      </div>
    `;

    const closeHandler = () => {
      modal.style.display = 'none';
      modal.classList.remove('active');
    };

    const closeBtn = document.getElementById('btn-close-wild-recruit');
    const cancelBtn = document.getElementById('btn-recruit-cancel');
    if (closeBtn) closeBtn.onclick = closeHandler;
    if (cancelBtn) cancelBtn.onclick = closeHandler;

    // 1. Offer Gold Handler
    const btnGold = document.getElementById('btn-recruit-gold');
    if (btnGold) {
      btnGold.onclick = () => {
        if (state.gold < bribeCost) return;
        state.gold -= bribeCost;
        if (typeof global.attemptPersuadeWildUnit === 'function') {
          global.attemptPersuadeWildUnit(target, 'bribe');
        }
        closeHandler();
      };
    }

    // 2. Use Affinity Item Handler
    const btnItem = document.getElementById('btn-recruit-item');
    if (btnItem) {
      btnItem.onclick = () => {
        if (typeof global.attemptPersuadeWildUnit === 'function') {
          global.attemptPersuadeWildUnit(target, 'treaty');
        }
        closeHandler();
      };
    }

    // 3. Persuade by Force Handler
    const btnForce = document.getElementById('btn-recruit-force');
    if (btnForce) {
      btnForce.onclick = () => {
        if (typeof global.attemptPersuadeWildUnit === 'function') {
          global.attemptPersuadeWildUnit(target, null);
        }
        closeHandler();
      };
    }
  }

  // Floating Toast Notification System (Zero window.alert)
  function showToast(message, type = 'info') {
    try {
      let toastContainer = document.getElementById('app-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'app-toast-container';
        toastContainer.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:999999; display:flex; flex-direction:column; gap:8px; pointer-events:none; width:90%; max-width:420px;';
        document.body.appendChild(toastContainer);
      }

      const toast = document.createElement('div');
      const bgColors = {
        success: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        error: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        danger: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        warning: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        gold: 'linear-gradient(135deg, #b45309 0%, #fbbf24 100%)',
        info: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)'
      };
      const bg = bgColors[type] || bgColors.info;
      toast.style.cssText = `background:${bg}; color:#ffffff; padding:10px 16px; border-radius:10px; font-size:12px; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,0.4); text-align:center; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); opacity:0; transform:translateY(-10px); border:1px solid rgba(255,255,255,0.2); letter-spacing:-0.2px;`;
      toast.textContent = message;
      toastContainer.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, 3000);
    } catch (_) {}
  }

  // 성장 안내창: 레벨업·승급 직후 스킬트리로 바로 안내한다.
  // 같은 대상(key)의 안내가 열려 있으면 새 창을 띄우지 않고 내용만 이어 붙인다 (연속 레벨업 등). replace면 내용을 바꾼다.
  function showGrowthNotice({ key = 'growth', icon = '⭐', title = '', lines = [], actionLabel = '🌳 스킬트리 보기', onAction = null, replace = false } = {}) {
    try {
      const existing = document.querySelector(`.growth-notice-overlay[data-key="${key}"]`);
      if (existing) {
        const titleEl = existing.querySelector('.growth-notice-title');
        if (titleEl) titleEl.textContent = title;
        const list = existing.querySelector('.growth-notice-lines');
        if (list && replace) list.innerHTML = '';
        if (list) lines.forEach((t) => { const li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'growth-notice-overlay';
      overlay.dataset.key = key;
      overlay.innerHTML = `
        <div class="growth-notice-card" role="dialog" aria-modal="true">
          <div class="growth-notice-icon"></div>
          <div class="growth-notice-title"></div>
          <ul class="growth-notice-lines"></ul>
          <div class="growth-notice-actions">
            <button type="button" class="growth-notice-later">나중에</button>
            <button type="button" class="growth-notice-go"></button>
          </div>
        </div>`;
      overlay.querySelector('.growth-notice-icon').textContent = icon;
      overlay.querySelector('.growth-notice-title').textContent = title;
      overlay.querySelector('.growth-notice-go').textContent = actionLabel;
      const list = overlay.querySelector('.growth-notice-lines');
      lines.forEach((t) => { const li = document.createElement('li'); li.textContent = t; list.appendChild(li); });

      const close = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      overlay.querySelector('.growth-notice-later').onclick = close;
      overlay.querySelector('.growth-notice-go').onclick = () => {
        close();
        if (typeof onAction === 'function') onAction();
      };
      document.body.appendChild(overlay);
    } catch (_) {}
  }

  // Initialize on load

  // Export to global.UI and root window
  global.UI.showToast = showToast;
  global.UI.showGrowthNotice = showGrowthNotice;
  global.UI.triggerFearFX = triggerFearFX;
  global.UI.showUnitSpeech = showUnitSpeech;
  global.UI.playHeartbeatSFX = playHeartbeatSFX;
  global.UI.playVictoryFanfareSFX = playVictoryFanfareSFX;
  global.UI.showVictoryModal = showVictoryModal;
  global.UI.renderPromotionMenu = renderPromotionMenu;
  global.UI.triggerLevelUpFX = triggerLevelUpFX;
  global.UI.renderDevSkillTreeEditor = renderDevSkillTreeEditor;
  global.UI.getDevDraftSkillTree = getDevDraftSkillTree;
  global.UI.resetDevDraftSkillTree = resetDevDraftSkillTree;
  global.UI.showDefeatModal = showDefeatModal;
  global.UI.renderTownUnitShop = renderTownUnitShop;
  global.UI.renderWildRecruitMenu = renderWildRecruitMenu;

  global.showToast = showToast;
  global.triggerFearFX = triggerFearFX;
  global.playVictoryFanfareSFX = playVictoryFanfareSFX;
  global.showVictoryModal = showVictoryModal;
  global.renderPromotionMenu = renderPromotionMenu;
  global.triggerLevelUpFX = triggerLevelUpFX;
  global.renderDevSkillTreeEditor = renderDevSkillTreeEditor;
  global.getDevDraftSkillTree = getDevDraftSkillTree;
  global.showDefeatModal = showDefeatModal;
  global.renderTownUnitShop = renderTownUnitShop;
  global.renderWildRecruitMenu = renderWildRecruitMenu;

})(typeof window !== 'undefined' ? window : this);

