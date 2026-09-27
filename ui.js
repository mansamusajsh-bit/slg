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
   * Main Trigger: Fear & Command Rejection Emotional FX
   *
   * @param {string|number} unitId - Identifier of the distressed unit
   * @param {string} [textMessage] - Panic line
   * @param {number} [durationMs=2600] - Duration of the fear state in milliseconds
   */
  function triggerFearFX(unitId, textMessage, durationMs = 2600) {
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

    // Dialogue display
    const dialogueBox = document.getElementById('dialogue-content') || document.getElementById('ui-dialogue-text');
    if (dialogueBox) {
      typewriteText(dialogueBox, `😨 "${panicQuote}"`, 22);
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
  function renderPromotionMenu(unit) {
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
            <p>${unit.name} <span class="badge-class">${unitClass}</span> | 잔여 XP: <b style="color: #fbbf24;">${unitXP} XP</b></p>
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
          🌳 캐릭터 스킬트리 (${skillTree.length})
        </button>
      </div>

      <!-- Tab 1: Promotion List -->
      <div class="promotion-modal-body" id="tab-content-promo">
        ${
          candidatePromos.length === 0
            ? `<div class="promotion-empty-state">현재 습득 가능한 승급 항목이 없거나 이미 최고 단계입니다.</div>`
            : `<div class="promotion-list-grid">
                ${candidatePromos
                  .map((p) => {
                    const reqXp = p.level === 2 ? 2 : p.level === 3 ? 5 : p.level === 4 ? 10 : 1;
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

      <!-- Tab 2: Character Skill Tree & Image Update -->
      <div class="promotion-modal-body" id="tab-content-skills" style="display:none;">
        <div style="font-size:11px; color:#94a3b8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>유닛 고유 스킬 트리 및 커스텀 아이콘</span>
          <span style="color:#38bdf8; font-weight:800;">총 ${skillTree.length}개 노드</span>
        </div>
        <div class="promotion-list-grid">
          ${skillTree.map((s) => `
            <div class="promotion-option-card" style="cursor:default; border-color: rgba(56, 189, 248, 0.25);">
              <div class="promo-card-top" style="align-items:flex-start;">
                <div style="position:relative; width:44px; height:44px; flex-shrink:0; background:#1e293b; border:1px solid #0284c7; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                  ${s.imageUrl ? `<img src="${s.imageUrl}" alt="${s.name}" style="width:100%; height:100%; object-fit:cover;" id="img-preview-${s.id}">` : `<span style="font-size:22px;">⚡</span>`}
                  <label for="skill-img-input-${s.id}" title="스킬 이미지 변경" style="position:absolute; bottom:0; right:0; left:0; background:rgba(0,0,0,0.65); color:#fff; font-size:8px; text-align:center; cursor:pointer; padding:1px 0;">변경</label>
                  <input type="file" id="skill-img-input-${s.id}" accept="image/*" style="display:none;" data-skill-id="${s.id}" class="skill-file-input">
                </div>
                <div class="promo-info" style="margin-left:6px;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span class="promo-name" style="color:#f0f9ff;">${s.name}</span>
                    <span style="font-size:9px; background:#0284c7; color:#fff; padding:1px 5px; border-radius:4px; font-weight:800;">Tier ${s.tier}</span>
                    <span style="font-size:9px; background:${s.type === 'PASSIVE' ? '#10b981' : '#f59e0b'}; color:#fff; padding:1px 5px; border-radius:4px; font-weight:800;">${s.type}</span>
                  </div>
                  <div style="font-size:10px; color:#cbd5e1; margin-top:2px;">
                    ${s.type === 'ACTIVE' ? `⚡ 소모 AP: <b>${s.costAP}</b> | ⏳ 쿨다운: <b>${s.coolDown}턴</b> | 🎯 위력: <b>${s.effectValue}</b>` : `🛡️ 위력/계수: <b>+${s.effectValue}%</b> (상시 지속)`}
                  </div>
                  ${s.prerequisites && s.prerequisites.length > 0 ? `<div style="font-size:9.5px; color:#f59e0b; margin-top:2px;">🔗 선행 요구 스킬: ${s.prerequisites.join(', ')}</div>` : ''}
                </div>
              </div>
              <div class="promo-desc" style="margin-top:4px;">${s.description}</div>
            </div>
          `).join('')}
        </div>
      </div>
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

    // Custom Skill Image Uploader Binding
    container.querySelectorAll('.skill-file-input').forEach((input) => {
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        const skillId = input.getAttribute('data-skill-id');
        if (!file || !skillId) return;

        const reader = new FileReader();
        reader.onload = (re) => {
          const base64 = re.target?.result;
          if (typeof base64 === 'string') {
            if (typeof global.updateSkillImage === 'function') {
              global.updateSkillImage(unit.id, skillId, base64);
            }
            const previewImg = container.querySelector(`#img-preview-${skillId}`);
            if (previewImg) {
              previewImg.src = base64;
            }
          }
        };
        reader.readAsDataURL(file);
      };
    });

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
  // DEV Skill Tree Editor & Custom Skill Image Drag & Drop UI Module
  // ============================================================================

  // In-memory draft skill tree for character creation in DEV mode
  let devDraftSkillTree = [];

  function initDevDraftSkillTree() {
    if (global.DEFAULT_SKILL_TREE_TEMPLATE) {
      devDraftSkillTree = JSON.parse(JSON.stringify(global.DEFAULT_SKILL_TREE_TEMPLATE));
    } else {
      devDraftSkillTree = [
        {
          id: 'skill_t1_base',
          name: '전선의 돌파',
          tier: 1,
          prerequisites: [],
          imageUrl: '',
          type: 'ACTIVE',
          costAP: 1,
          coolDown: 1,
          effectValue: 20,
          targetType: 'SINGLE_TARGET',
          description: '적 단일 목표에 20의 피해를 가합니다.'
        }
      ];
    }
  }

  /**
   * Reads an Image file via FileReader, validates it, and triggers a callback with Base64
   */
  function handleImageFileToDataURL(file, callback) {
    if (!file || !file.type.startsWith('image/')) {
      if (typeof global.addLog === 'function') {
        global.addLog('⚠️ 올바른 이미지 파일(PNG/JPG/WebP/SVG)을 선택해주세요.', 'warning');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl === 'string' && typeof callback === 'function') {
        callback(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * Attaches drag-and-drop & file selection event listeners to an element
   */
  function attachSkillDropzone(dropEl, onImageLoaded) {
    if (!dropEl) return;

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropEl.style.borderColor = '#fbbf24';
        dropEl.style.background = 'rgba(251, 191, 36, 0.15)';
      }, false);
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropEl.style.borderColor = '';
        dropEl.style.background = '';
      }, false);
    });

    dropEl.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt?.files?.[0];
      if (file) {
        handleImageFileToDataURL(file, onImageLoaded);
      }
    }, false);
  }

  /**
   * Renders the complete Skill Tree Editor inside the DEV Character Creation modal
   * or as an interactive modal for an existing character (characterId).
   *
   * @param {string|number|null} characterId - Optional character ID. If null, targets the DEV creation draft.
   */
  function renderDevSkillTreeEditor(characterId) {
    let targetContainer = document.getElementById('dev-skill-tree-builder-container');
    let isModalMode = false;
    let targetUnit = null;

    if (characterId) {
      // Standalone modal mode for an existing character
      if (typeof global.findCharacterById === 'function') {
        targetUnit = global.findCharacterById(characterId);
      } else {
        const stateObj = global.state || {};
        const all = [...(stateObj.playerUnits || []), ...(stateObj.enemyUnits || [])];
        targetUnit = all.find(u => String(u.id) === String(characterId));
      }
      isModalMode = true;
    }

    if (isModalMode && targetUnit) {
      // Ensure unit skill tree is initialized
      if (!Array.isArray(targetUnit.skillTree)) {
        if (typeof global.getCharacterSkillTree === 'function') {
          targetUnit.skillTree = global.getCharacterSkillTree(targetUnit.id);
        } else {
          targetUnit.skillTree = JSON.parse(JSON.stringify(global.DEFAULT_SKILL_TREE_TEMPLATE || []));
        }
      }

      // Open or re-use standalone modal
      let modalOverlay = document.getElementById('modal-dev-skill-tree-overlay');
      if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-dev-skill-tree-overlay';
        modalOverlay.className = 'promotion-modal-overlay';
        modalOverlay.onclick = (e) => {
          if (e.target === modalOverlay) modalOverlay.remove();
        };
        document.body.appendChild(modalOverlay);
      }

      modalOverlay.innerHTML = `
        <div class="promotion-modal-card" style="max-width: 580px; max-height: 88vh; display: flex; flex-direction: column;" onclick="event.stopPropagation()">
          <div class="promotion-modal-header" style="border-bottom: 1.5px solid #334155;">
            <div class="promotion-modal-title">
              <span class="promotion-modal-icon">🌳</span>
              <div>
                <h3>DEV 스킬트리 빌더 & 노드 에디터</h3>
                <p>${targetUnit.name} | 고유 스킬 트리 계층 구성 및 커스텀 아이콘 드래그&드롭</p>
              </div>
            </div>
            <button class="btn-close" id="btn-close-dev-tree-modal">✕</button>
          </div>
          <div class="promotion-modal-body" id="dev-tree-modal-body" style="overflow-y: auto; padding: 12px; flex: 1;">
            <div id="dev-skill-tree-builder-container"></div>
          </div>
        </div>
      `;

      modalOverlay.querySelector('#btn-close-dev-tree-modal').onclick = () => modalOverlay.remove();
      targetContainer = modalOverlay.querySelector('#dev-skill-tree-builder-container');
    }

    if (!targetContainer) {
      // Find within DEV creation tab
      const createCharSection = document.getElementById('tab-content-dbg-create-char');
      if (createCharSection) {
        let builderWrapper = document.getElementById('dbg-section-skill-tree-builder');
        if (!builderWrapper) {
          builderWrapper = document.createElement('div');
          builderWrapper.id = 'dbg-section-skill-tree-builder';
          builderWrapper.className = 'dbg-card-section';
          builderWrapper.style.borderColor = '#0284c7';
          builderWrapper.style.background = 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)';
          builderWrapper.style.marginTop = '8px';
          builderWrapper.innerHTML = `
            <div class="dbg-card-section-title" style="color: #0369a1; border-bottom-color: #bae6fd; display: flex; justify-content: space-between; align-items: center;">
              <span>🌳 4. 캐릭터 스킬 트리 빌더 (Skill Tree Builder & Image Drag&Drop)</span>
              <span style="font-size: 10px; font-weight: 800; color: #0284c7;" id="dbg-skill-tree-count-badge">4개 노드</span>
            </div>
            <div id="dev-skill-tree-builder-container"></div>
          `;

          // Insert right before submit button
          const submitBtn = createCharSection.querySelector('.dbg-btn-primary-create');
          if (submitBtn && submitBtn.parentNode) {
            submitBtn.parentNode.insertBefore(builderWrapper, submitBtn);
          } else {
            createCharSection.appendChild(builderWrapper);
          }
        }
        targetContainer = document.getElementById('dev-skill-tree-builder-container');
      }
    }

    if (!targetContainer) return;

    // Determine current active skill list
    let currentTreeList = [];
    if (targetUnit) {
      currentTreeList = targetUnit.skillTree;
    } else {
      if (devDraftSkillTree.length === 0) {
        initDevDraftSkillTree();
      }
      currentTreeList = devDraftSkillTree;
    }

    const countBadge = document.getElementById('dbg-skill-tree-count-badge');
    if (countBadge) countBadge.textContent = `${currentTreeList.length}개 노드`;

    targetContainer.innerHTML = `
      <div style="font-size: 11px; color: #64748b; margin-bottom: 10px; line-height: 1.4;">
        각 스킬의 <b>Tier(계층)</b>, <b>AP 소모량</b>, <b>효과 수치</b>를 설정하고, 
        <b>미리보기 박스에 이미지 파일을 직접 드래그&드롭</b>하거나 클릭하여 커스텀 스킬 아이콘(PNG/JPG/WebP/SVG)을 실시간 변경할 수 있습니다.
      </div>

      <!-- Add New Node Bar -->
      <div style="background: #ffffff; border: 1.5px dashed #38bdf8; border-radius: 10px; padding: 10px; margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 900; color: #0369a1; margin-bottom: 6px;">➕ 새 스킬 노드 추가 (Add New Skill Node)</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <div>
            <label style="font-size: 9.5px; font-weight: 800; color: #475569;">스킬명</label>
            <input type="text" id="dev-new-skill-name" class="dbg-form-control" style="padding: 4px 6px; font-size: 11px;" placeholder="예: 천벌의 일격" value="천벌의 일격" />
          </div>
          <div>
            <label style="font-size: 9.5px; font-weight: 800; color: #475569;">계층 (Tier)</label>
            <select id="dev-new-skill-tier" class="dbg-form-control" style="padding: 4px 6px; font-size: 11px;">
              <option value="1">Tier 1 (기초)</option>
              <option value="2">Tier 2 (숙련)</option>
              <option value="3">Tier 3 (심화)</option>
              <option value="4">Tier 4 (궁극)</option>
            </select>
          </div>
          <div>
            <label style="font-size: 9.5px; font-weight: 800; color: #475569;">유형 (Type)</label>
            <select id="dev-new-skill-type" class="dbg-form-control" style="padding: 4px 6px; font-size: 11px;">
              <option value="ACTIVE">⚡ ACTIVE</option>
              <option value="PASSIVE">🛡️ PASSIVE</option>
            </select>
          </div>
          <div>
            <label style="font-size: 9.5px; font-weight: 800; color: #475569;">소모 AP / 쿨다운</label>
            <div style="display: flex; gap: 4px;">
              <input type="number" id="dev-new-skill-ap" class="dbg-form-control" style="padding: 4px; font-size: 11px;" value="2" min="0" max="6" title="소모 AP" />
              <input type="number" id="dev-new-skill-cd" class="dbg-form-control" style="padding: 4px; font-size: 11px;" value="2" min="0" max="10" title="쿨다운" />
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <div>
            <label style="font-size: 9.5px; font-weight: 800; color: #475569;">효과 수치 (Effect)</label>
            <input type="number" id="dev-new-skill-val" class="dbg-form-control" style="padding: 4px 6px; font-size: 11px;" value="30" min="1" max="999" />
          </div>
          <div>
            <label style="font-size: 9.5px; font-weight: 800; color: #475569;">선행 스킬 ID (쉼표 구분)</label>
            <input type="text" id="dev-new-skill-prereqs" class="dbg-form-control" style="padding: 4px 6px; font-size: 11px;" placeholder="예: skill_tier1_strike" />
          </div>
        </div>

        <div style="margin-bottom: 6px;">
          <label style="font-size: 9.5px; font-weight: 800; color: #475569;">스킬 설명</label>
          <input type="text" id="dev-new-skill-desc" class="dbg-form-control" style="padding: 4px 6px; font-size: 11px;" value="단일 적에게 30의 강력한 신성 피해를 입힙니다." />
        </div>

        <button type="button" id="dev-btn-add-skill-node" class="btn-cheat purple" style="width: 100%; padding: 6px; font-size: 11px; font-weight: 900; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;">
          <span>✨</span> 스킬 노드 트리에 추가하기
        </button>
      </div>

      <!-- Skill Nodes List with Drag & Drop Preview -->
      <div id="dev-skill-nodes-container" style="display: flex; flex-direction: column; gap: 8px;">
        ${currentTreeList.map((skill, index) => {
          const hasImg = !!skill.imageUrl;
          return `
            <div class="dev-skill-node-card" data-skill-id="${skill.id}" style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; gap: 10px; align-items: flex-start; transition: all 0.15s ease;">
              
              <!-- Drag & Drop Image Dropzone Box -->
              <div class="dev-skill-img-dropzone" id="dropzone-${skill.id}" title="클릭하거나 이미지 파일을 여기로 드래그&드롭하여 스킬 아이콘을 변경하세요." style="position: relative; width: 54px; height: 54px; flex-shrink: 0; background: #0f172a; border: 2px dashed #0284c7; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                <input type="file" id="file-input-${skill.id}" accept="image/*" style="display: none;" class="dev-skill-file-input" data-skill-id="${skill.id}" />
                <div id="preview-wrap-${skill.id}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                  ${hasImg 
                    ? `<img src="${skill.imageUrl}" alt="${skill.name}" style="width: 100%; height: 100%; object-fit: cover;" id="img-display-${skill.id}" />` 
                    : `<span style="font-size: 22px;">⚡</span>`}
                </div>
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: #ffffff; font-size: 8px; font-weight: 800; text-align: center; padding: 2px 0;">
                  DROP/클릭
                </div>
              </div>

              <!-- Node Info & Quick Edit -->
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 13px; font-weight: 900; color: #0f172a;">${skill.name}</span>
                    <span style="font-size: 9px; font-weight: 900; background: #0284c7; color: #ffffff; padding: 1px 6px; border-radius: 4px;">Tier ${skill.tier}</span>
                    <span style="font-size: 9px; font-weight: 900; background: ${skill.type === 'PASSIVE' ? '#10b981' : '#f59e0b'}; color: #ffffff; padding: 1px 6px; border-radius: 4px;">${skill.type}</span>
                  </div>
                  <button type="button" class="btn-delete-node" data-skill-id="${skill.id}" style="background: transparent; border: none; color: #ef4444; font-size: 12px; cursor: pointer; padding: 2px 4px;" title="스킬 노드 삭제">🗑️</button>
                </div>

                <div style="font-size: 10px; color: #475569; margin-bottom: 4px;">
                  ${skill.type === 'ACTIVE' 
                    ? `⚡ 소모 AP: <b>${skill.costAP}</b> | ⏳ 쿨다운: <b>${skill.coolDown}턴</b> | 🎯 위력: <b>${skill.effectValue}</b>` 
                    : `🛡️ 스탯/효과 강화: <b>+${skill.effectValue}%</b> (상시 지속)`}
                  ${skill.prerequisites && skill.prerequisites.length > 0 ? ` | 🔗 선행: <span style="color:#d97706;">${skill.prerequisites.join(', ')}</span>` : ''}
                </div>

                <div style="font-size: 10px; color: #64748b; background: #f8fafc; border: 1px solid #f1f5f9; padding: 4px 6px; border-radius: 6px; line-height: 1.3;">
                  ${skill.description}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 1. Add Skill Node Button Handler
    const addBtn = targetContainer.querySelector('#dev-btn-add-skill-node');
    if (addBtn) {
      addBtn.onclick = () => {
        const nameVal = targetContainer.querySelector('#dev-new-skill-name')?.value?.trim();
        if (!nameVal) {
          if (typeof global.addLog === 'function') global.addLog('⚠️ 스킬 이름을 입력해주세요.', 'warning');
          return;
        }

        const tierVal = parseInt(targetContainer.querySelector('#dev-new-skill-tier')?.value || '1', 10);
        const typeVal = targetContainer.querySelector('#dev-new-skill-type')?.value || 'ACTIVE';
        const apVal = parseInt(targetContainer.querySelector('#dev-new-skill-ap')?.value || '1', 10);
        const cdVal = parseInt(targetContainer.querySelector('#dev-new-skill-cd')?.value || '1', 10);
        const effectVal = parseInt(targetContainer.querySelector('#dev-new-skill-val')?.value || '20', 10);
        const prereqsRaw = targetContainer.querySelector('#dev-new-skill-prereqs')?.value?.trim() || '';
        const descVal = targetContainer.querySelector('#dev-new-skill-desc')?.value?.trim() || '스킬 효과';

        const prereqs = prereqsRaw ? prereqsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        const newSkillObj = {
          id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: nameVal,
          tier: tierVal,
          prerequisites: prereqs,
          imageUrl: '',
          type: typeVal,
          costAP: apVal,
          coolDown: cdVal,
          effectValue: effectVal,
          targetType: (typeVal === 'PASSIVE') ? 'BUFF' : 'SINGLE_TARGET',
          description: descVal
        };

        if (targetUnit) {
          if (typeof global.addSkillToTree === 'function') {
            global.addSkillToTree(targetUnit.id, newSkillObj);
          } else {
            targetUnit.skillTree.push(newSkillObj);
            if (typeof global.saveGameState === 'function') global.saveGameState();
          }
        } else {
          devDraftSkillTree.push(newSkillObj);
          if (typeof global.addLog === 'function') {
            global.addLog(`✨ [스킬트리 추가] [${newSkillObj.name}] 노드가 생성 대기 목록에 추가되었습니다.`, 'gold');
          }
        }

        // Re-render
        renderDevSkillTreeEditor(characterId);
      };
    }

    // 2. Delete Node Button Handlers
    targetContainer.querySelectorAll('.btn-delete-node').forEach((delBtn) => {
      delBtn.onclick = () => {
        const sId = delBtn.getAttribute('data-skill-id');
        if (!sId) return;

        if (targetUnit) {
          targetUnit.skillTree = targetUnit.skillTree.filter(s => s.id !== sId);
          if (typeof global.saveGameState === 'function') global.saveGameState();
          if (typeof global.addLog === 'function') {
            global.addLog(`🗑️ ${targetUnit.name}의 스킬 트리에서 [${sId}] 노드가 제거되었습니다.`, 'system');
          }
        } else {
          devDraftSkillTree = devDraftSkillTree.filter(s => s.id !== sId);
        }

        renderDevSkillTreeEditor(characterId);
      };
    });

    // 3. Dropzone & File Input Binding for Each Skill Node
    targetContainer.querySelectorAll('.dev-skill-node-card').forEach((card) => {
      const sId = card.getAttribute('data-skill-id');
      const dropzone = card.querySelector(`#dropzone-${sId}`);
      const fileInput = card.querySelector(`#file-input-${sId}`);
      const imgDisplay = card.querySelector(`#img-display-${sId}`);
      const previewWrap = card.querySelector(`#preview-wrap-${sId}`);

      if (!dropzone || !fileInput) return;

      dropzone.onclick = () => fileInput.click();

      const onImageReady = (base64) => {
        if (targetUnit) {
          if (typeof global.updateSkillImage === 'function') {
            global.updateSkillImage(targetUnit.id, sId, base64);
          } else {
            const skill = targetUnit.skillTree.find(s => s.id === sId);
            if (skill) skill.imageUrl = base64;
            if (typeof global.saveGameState === 'function') global.saveGameState();
          }
        } else {
          const draftSkill = devDraftSkillTree.find(s => s.id === sId);
          if (draftSkill) draftSkill.imageUrl = base64;
          if (typeof global.addLog === 'function') {
            global.addLog(`🖼️ [스킬 아이콘 등록] [${draftSkill?.name || '스킬'}] 이미지가 설정되었습니다.`, 'system');
          }
        }

        // Live DOM update
        if (imgDisplay) {
          imgDisplay.src = base64;
        } else if (previewWrap) {
          previewWrap.innerHTML = `<img src="${base64}" alt="스킬" style="width: 100%; height: 100%; object-fit: cover;" id="img-display-${sId}" />`;
        }
      };

      // File input change
      fileInput.onchange = (e) => {
        const f = e.target.files?.[0];
        if (f) handleImageFileToDataURL(f, onImageReady);
      };

      // Drag & Drop
      attachSkillDropzone(dropzone, onImageReady);
    });
  }

  /**
   * Helper to retrieve currently prepared skill tree during character creation
   */
  function getDevDraftSkillTree() {
    if (devDraftSkillTree.length === 0) {
      initDevDraftSkillTree();
    }
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
        const tiles = global.state?.tiles
          || (typeof global.getTiles === 'function' ? global.getTiles() : [])
          || global.tiles
          || [];
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
  function showVictoryModal(rewardData) {
    // 1. Play triumphant fanfare sound effects
    playVictoryFanfareSFX();

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
              +${gold} Gold <span class="victory-gold-badge">${defeatedCount} × 100G</span>
            </span>
          </div>

          <!-- Rewinder Item Result (50% Chance) -->
          <div class="victory-reward-row">
            <span class="victory-reward-label">
              <span>⏳</span> 시간 회귀의 모래시계
            </span>
            ${rewinderGranted 
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
    const catalog = global.TOWN_UNIT_SHOP_CATALOG || global.unitShopSystem?.TOWN_UNIT_SHOP_CATALOG || [];

    // 안전 거점 정보 계산 (safeZoneTile이 null일 경우에도 안전하게 마을 거점 정보로 폴백)
    const safeZoneTile = (typeof global.unitShopSystem?.isPlayerAtSafeZone === 'function')
      ? global.unitShopSystem.isPlayerAtSafeZone()
      : null;

    const allTiles = state.tiles
      || (typeof global.getTiles === 'function' ? global.getTiles() : [])
      || global.tiles
      || [];

    const fallbackTile = allTiles.find(t => t && (t.isSafe || t.isCity || t.type === 'city' || t.type === 'village'))
      || { name: '평화로운 마을 거점', isCity: false, x: 1, y: 1 };

    const safeTile = safeZoneTile || fallbackTile || { name: '평화로운 마을 거점', isCity: false, x: 1, y: 1 };
    const safeTileName = safeTile.name || '평화로운 마을 거점';

    const townLevel = (typeof global.unitShopSystem?.getTownLevel === 'function')
      ? global.unitShopSystem.getTownLevel(safeTile)
      : (safeTileName.includes('에테르니아') ? 3 : (safeTile.isCity ? 2 : 1));

    const livingUnits = (state.playerUnits || []).filter(u => !u.isDead);
    const maxLeadership = state.strategy?.commanderAP || 24;
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
          <button id="btn-recruit-gold" class="recruit-option-btn" ${currentGold < 80 ? 'disabled' : ''}>
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                <span>🪙 금화 제시 (Offer Gold)</span>
                <span style="font-size: 11px; color: #fbbf24; font-weight: 700;">-80G</span>
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
        if (state.gold < 80) return;
        state.gold -= 80;
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

  // Initialize on load
  initDevDraftSkillTree();

  // Export to global.UI and root window
  global.UI.showToast = showToast;
  global.UI.triggerFearFX = triggerFearFX;
  global.UI.playHeartbeatSFX = playHeartbeatSFX;
  global.UI.playVictoryFanfareSFX = playVictoryFanfareSFX;
  global.UI.showVictoryModal = showVictoryModal;
  global.UI.renderPromotionMenu = renderPromotionMenu;
  global.UI.triggerLevelUpFX = triggerLevelUpFX;
  global.UI.renderDevSkillTreeEditor = renderDevSkillTreeEditor;
  global.UI.getDevDraftSkillTree = getDevDraftSkillTree;
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

