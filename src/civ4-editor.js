// ============================================================================
// civ4-editor.js - Civilization IV Scenario Tactical 8x14 Map Editor
// ============================================================================

(function () {
  const EDITOR_PASSWORD = '20250113';

  // 1. Map Editor Controller Object
  const MapEditorController = {
    cols: 8,
    rows: 14,
    currentSectorId: 'A-1',
    activeTab: 'terrain', // 'terrain' | 'structure' | 'unit' | 'eraser'
    selectedTool: {
      type: 'terrain',
      val: 'plain'
    },
    unitCountInput: 1,
    currentGridData: [],

    initGrid(existingData = null) {
      if (existingData && Array.isArray(existingData) && existingData.length === this.cols * this.rows) {
        this.currentGridData = JSON.parse(JSON.stringify(existingData));
      } else {
        this.currentGridData = [];
        for (let y = 0; y < this.rows; y++) {
          for (let x = 0; x < this.cols; x++) {
            this.currentGridData.push({
              x,
              y,
              terrain: 'plain', // plain, forest, hill, mountain, river, sea
              hasRoad: false,
              structure: null, // city (2x2), village, resource, tree
              units: [] // Stack array up to 100 units
            });
          }
        }
      }
      this.renderCanvas();
    },

    getTile(x, y) {
      return this.currentGridData.find(t => t.x === x && t.y === y);
    },

    // 도로 이동력 1/2 계산 로직 (Civ4 Road Movement)
    calculateMovementCost(tile, unit) {
      let baseCost = 1;
      if (tile.terrain === 'forest') baseCost = 2;
      else if (tile.terrain === 'hill') baseCost = 3;
      else if (tile.terrain === 'river') baseCost = 2;
      else if (tile.terrain === 'mountain' || tile.terrain === 'sea') baseCost = 99; // Impassable

      // 도로가 설치된 경우 이동력 1/2 (이동력 2배 효율)
      if (tile.hasRoad) {
        return Math.max(0.5, baseCost * 0.5);
      }
      return baseCost;
    },

    applyToolToTile(x, y) {
      const tile = this.getTile(x, y);
      if (!tile) return;

      const { type, val } = this.selectedTool;

      if (type === 'terrain') {
        tile.terrain = val;
      } else if (type === 'road') {
        tile.hasRoad = !tile.hasRoad;
      } else if (type === 'structure') {
        tile.structure = val;
      } else if (type === 'unit') {
        const count = Math.min(100, Math.max(1, parseInt(this.unitCountInput, 10) || 1));
        const [owner, cls] = val.split('_'); // 'ally_KNIGHT' or 'enemy_MELEE'
        
        // Push units into stack
        for (let i = 0; i < count; i++) {
          if (tile.units.length >= 100) break; // 100 Max Limit
          tile.units.push({
            id: `ed_${owner}_${Date.now()}_${i}`,
            owner: owner.toUpperCase(),
            classType: cls,
            level: 1
          });
        }
      } else if (type === 'eraser') {
        tile.terrain = 'plain';
        tile.hasRoad = false;
        tile.structure = null;
        tile.units = [];
      }

      this.renderCanvas();
    },

    renderCanvas() {
      const container = document.getElementById('civ4-editor-grid-canvas') || document.getElementById('civ4-editor-grid-dom');
      if (!container) return;
      container.innerHTML = '';

      this.currentGridData.forEach(tile => {
        const el = document.createElement('div');
        el.className = `civ4-tile terrain-${tile.terrain}`;
        if (tile.hasRoad) el.classList.add('has-road');

        let icon = '';
        if (tile.structure === 'city') icon = '🏰';
        else if (tile.structure === 'village') icon = '🏡';
        else if (tile.structure === 'resource') icon = '💎';
        else if (tile.structure === 'tree') icon = '🌲';
        else if (tile.terrain === 'mountain') icon = '⛰️';
        else if (tile.terrain === 'forest') icon = '🌳';
        else if (tile.terrain === 'sea') icon = '🌊';
        else if (tile.terrain === 'river') icon = '〰️';

        let unitBadge = '';
        if (tile.units && tile.units.length > 0) {
          const isAlly = tile.units[0].owner === 'ALLY' || tile.units[0].owner === 'PLAYER';
          const topUnitCls = tile.units[0].classType;
          const classIcons = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
          icon = classIcons[topUnitCls] || '🛡️';
          unitBadge = `<span class="civ4-unit-stack-badge ${isAlly ? 'ally' : ''}">x${tile.units.length}</span>`;
        }

        el.innerHTML = `<span>${icon}</span>${unitBadge}`;

        el.onclick = () => {
          this.applyToolToTile(tile.x, tile.y);
        };

        container.appendChild(el);
      });
    },

    renderGrid() {
      this.renderCanvas();
    },

    saveScenarioMap() {
      const key = `civ4_scenario_map_${this.currentSectorId}`;
      const payload = {
        sectorId: this.currentSectorId,
        cols: this.cols,
        rows: this.rows,
        tiles: this.currentGridData,
        savedAt: new Date().toISOString()
      };

      try {
        if (typeof window.syncMapToFirestore === 'function') {
          window.syncMapToFirestore(
            `scenario_${this.currentSectorId}`,
            this.currentGridData,
            `Sector ${this.currentSectorId}`
          );
        }
        if (window.WORLD_SECTORS && window.WORLD_SECTORS[this.currentSectorId]) {
          window.WORLD_SECTORS[this.currentSectorId].scenarioMap = payload;
        }
        if (window.addLog) {
          window.addLog(`💾 [맵 에디터] ${this.currentSectorId} 시나리오 8x14 전술 맵이 Firestore에 저장되었습니다!`, 'gold');
        }
        alert(`[${this.currentSectorId}] 8x14 시나리오 맵 저장이 Firestore에 완료되었습니다.`);
      } catch (e) {
        console.error('Save scenario error:', e);
      }
    }
  };

  // 2. Editor Auth & LongPress Event Handler
  function setupSectorTitleLongPress() {
    const titleEl = document.getElementById('sector-nodes-title');
    if (!titleEl) return;

    let timer = null;
    let isLongPressTriggered = false;

    const startHold = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      isLongPressTriggered = false;
      titleEl.classList.add('holding-editor-target');

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        isLongPressTriggered = true;
        titleEl.classList.remove('holding-editor-target');
        if (navigator.vibrate) {
          try { navigator.vibrate([60, 80, 60]); } catch (_) {}
        }
        promptEditorAuth();
      }, 3000);
    };

    const cancelHold = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      titleEl.classList.remove('holding-editor-target');
    };

    titleEl.addEventListener('pointerdown', startHold);
    titleEl.addEventListener('pointerup', (e) => {
      if (isLongPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
      }
      cancelHold();
    });
    titleEl.addEventListener('pointerleave', cancelHold);
    titleEl.addEventListener('pointercancel', cancelHold);

    titleEl.addEventListener('click', (e) => {
      if (isLongPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        isLongPressTriggered = false;
      }
    });
  }

  function promptEditorAuth() {
    const pwd = prompt('🔐 [관리자 인증] 월드 섹터 및 시나리오 맵 에디터 비밀번호를 입력하세요:');
    if (pwd === null) return; // Cancelled

    if (pwd.trim() === EDITOR_PASSWORD) {
      if (window.state) window.state.isEditMode = true;
      if (window.addLog) {
        window.addLog('🛠️ [에디터 활성화] 문명4 스타일 8x14 전술 맵 에디터 접근이 승인되었습니다.', 'gold');
      }
      openCiv4MapEditor();
    } else {
      alert('비밀번호가 올바르지 않습니다.');
      if (window.addLog) {
        window.addLog('⚠️ [인증 실패] 에디터 비밀번호가 일치하지 않습니다.', 'danger');
      }
    }
  }

  // 3. Editor Modal Creation & UI Wiring
  function openCiv4MapEditor() {
    let modal = document.getElementById('modal-civ4-editor');
    if (!modal) {
      modal = createEditorModalDOM();
      document.body.appendChild(modal);
      wireEditorUIEvents();
    }

    modal.style.display = 'flex';
    syncSectorDropdown();
    loadCurrentSectorMap();
  }

  function closeCiv4MapEditor() {
    const modal = document.getElementById('modal-civ4-editor');
    if (modal) modal.style.display = 'none';
  }

  function syncSectorDropdown() {
    const sel = document.getElementById('civ4-editor-sector-select');
    if (!sel || !window.WORLD_SECTORS) return;

    sel.innerHTML = '';
    Object.keys(window.WORLD_SECTORS).forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `[${id}] ${window.WORLD_SECTORS[id].name}`;
      if (id === MapEditorController.currentSectorId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function loadCurrentSectorMap() {
    const secId = MapEditorController.currentSectorId;
    if (window.WORLD_SECTORS && window.WORLD_SECTORS[secId] && window.WORLD_SECTORS[secId].scenarioMap) {
      MapEditorController.initGrid(window.WORLD_SECTORS[secId].scenarioMap.tiles);
      return;
    }
    if (typeof window.loadMapFromFirestore === 'function') {
      window.loadMapFromFirestore(`scenario_${secId}`).then(data => {
        if (data && data.tiles) {
          MapEditorController.initGrid(data.tiles);
        }
      });
    }
    MapEditorController.initGrid();
  }

  function createEditorModalDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'modal-civ4-editor';
    overlay.className = 'game-modal-overlay';
    overlay.style.display = 'none';

    overlay.innerHTML = `
      <div class="civ4-editor-window" onclick="event.stopPropagation()">
        <!-- Header -->
        <div class="civ4-editor-header">
          <h3>🏛️ 문명4 스타일 8x14 시나리오 맵 에디터</h3>
          <button class="btn-close" id="btn-close-civ4-editor">✕</button>
        </div>

        <!-- Sector Management Bar -->
        <div class="civ4-sector-bar">
          <span>월드 섹터:</span>
          <select id="civ4-editor-sector-select" style="flex:1;"></select>
          <button class="civ4-btn-primary" id="btn-civ4-add-sector">➕ 신규 섹터</button>
        </div>

        <!-- 8x14 Grid Canvas Viewport -->
        <div class="civ4-grid-viewport">
          <div class="civ4-editor-grid" id="civ4-editor-grid-canvas"></div>
        </div>

        <!-- Palette Toolbar -->
        <div class="civ4-palette-toolbar">
          <!-- Palette Tabs -->
          <div class="civ4-palette-tabs">
            <button class="civ4-tab-btn active" data-tab="terrain">지형 (Terrain)</button>
            <button class="civ4-tab-btn" data-tab="structure">거점/요소</button>
            <button class="civ4-tab-btn" data-tab="unit">유닛 배치</button>
            <button class="civ4-tab-btn" data-tab="eraser">지우개</button>
          </div>

          <!-- Palette Items Container -->
          <div class="civ4-palette-items" id="civ4-palette-items-list">
            <!-- Dynamically populated -->
          </div>

          <!-- Bottom Actions -->
          <div class="civ4-action-bar">
            <div id="civ4-unit-count-wrap" style="display:none; align-items:center; gap:6px; font-size:11px;">
              <span>수량:</span>
              <input type="number" id="civ4-unit-count-input" value="1" min="1" max="100" style="width:48px; background:#0f172a; color:#fff; border:1px solid #475569; border-radius:4px; padding:2px 4px;" />
              <span style="color:#94a3b8;">(최대 100)</span>
            </div>
            <div style="display:flex; gap:8px; margin-left:auto;">
              <button class="civ4-btn-primary" id="btn-civ4-clear-grid" style="background:#475569;">초기화</button>
              <button class="civ4-btn-primary" id="btn-civ4-save-map" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">💾 시나리오 맵 저장</button>
            </div>
          </div>
        </div>
      </div>
    `;

    return overlay;
  }

  function wireEditorUIEvents() {
    const closeBtn = document.getElementById('btn-close-civ4-editor');
    if (closeBtn) closeBtn.onclick = closeCiv4MapEditor;

    const sectorSel = document.getElementById('civ4-editor-sector-select');
    if (sectorSel) {
      sectorSel.onchange = (e) => {
        MapEditorController.currentSectorId = e.target.value;
        loadCurrentSectorMap();
      };
    }

    const addSectorBtn = document.getElementById('btn-civ4-add-sector');
    if (addSectorBtn) {
      addSectorBtn.onclick = () => {
        const id = prompt('신규 섹터 ID 입력 (예: Sector_C1):');
        if (!id) return;
        const name = prompt('신규 섹터 이름 입력 (예: C-1 검은 숲):') || '미지의 전선';
        const recPower = parseInt(prompt('권장 전투력 (예: 500):') || '500', 10);

        if (!window.WORLD_SECTORS) window.WORLD_SECTORS = {};
        window.WORLD_SECTORS[id] = {
          id,
          name,
          icon: '🌲',
          difficulty: 'NORMAL',
          stars: '★★★☆☆',
          terrainDesc: '에디터에서 새로 추가된 작전 구역',
          recPower,
          upkeep: 30,
          locked: false
        };

        if (window.state && window.state.worldSectors) {
          window.state.worldSectors.push(window.WORLD_SECTORS[id]);
        }

        syncSectorDropdown();
        sectorSel.value = id;
        MapEditorController.currentSectorId = id;
        loadCurrentSectorMap();
        alert(`신규 섹터 [${name}]가 추가되었습니다.`);
      };
    }

    // Palette Tabs
    const tabs = document.querySelectorAll('.civ4-tab-btn');
    tabs.forEach(btn => {
      btn.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        MapEditorController.activeTab = tab;
        renderPaletteItems(tab);
      };
    });

    renderPaletteItems('terrain');

    // Unit Count Input
    const unitCountInput = document.getElementById('civ4-unit-count-input');
    if (unitCountInput) {
      unitCountInput.onchange = (e) => {
        MapEditorController.unitCountInput = parseInt(e.target.value, 10) || 1;
      };
    }

    // Clear Button
    const clearBtn = document.getElementById('btn-civ4-clear-grid');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('8x14 전술 맵을 기본 평야로 초기화하시겠습니까?')) {
          MapEditorController.initGrid();
        }
      };
    }

    // Save Button
    const saveBtn = document.getElementById('btn-civ4-save-map');
    if (saveBtn) {
      saveBtn.onclick = () => {
        MapEditorController.saveScenarioMap();
      };
    }
  }

  function renderPaletteItems(tab) {
    const list = document.getElementById('civ4-palette-items-list');
    const unitCountWrap = document.getElementById('civ4-unit-count-wrap');
    if (!list) return;
    list.innerHTML = '';

    if (unitCountWrap) {
      unitCountWrap.style.display = (tab === 'unit') ? 'flex' : 'none';
    }

    let items = [];
    if (tab === 'terrain') {
      items = [
        { label: '🌱 평야 (AP 1)', type: 'terrain', val: 'plain' },
        { label: '🌲 숲 (AP 2, 방어+20%)', type: 'terrain', val: 'forest' },
        { label: '⛰️ 산악 (AP 3, 방어+40%)', type: 'terrain', val: 'hill' },
        { label: '🏔️ 절벽 (통과불가)', type: 'terrain', val: 'mountain' },
        { label: '〰️ 강 (AP 2 소모)', type: 'terrain', val: 'river' },
        { label: '🌊 바다 (통과불가)', type: 'terrain', val: 'sea' },
        { label: '═ 도로 (이동력 1/2 감면)', type: 'road', val: 'road' }
      ];
    } else if (tab === 'structure') {
      items = [
        { label: '🏰 왕도 (2x2)', type: 'structure', val: 'city' },
        { label: '🏡 마을 (1x1)', type: 'structure', val: 'village' },
        { label: '💎 특수 자원', type: 'structure', val: 'resource' },
        { label: '🌳 정글 나무', type: 'structure', val: 'tree' }
      ];
    } else if (tab === 'unit') {
      items = [
        { label: '🐴 아군 성기사', type: 'unit', val: 'ally_KNIGHT' },
        { label: '⚔️ 아군 전사', type: 'unit', val: 'ally_MELEE' },
        { label: '🏹 아군 궁수', type: 'unit', val: 'ally_ARCHER' },
        { label: '🔮 아군 마법사', type: 'unit', val: 'ally_MAGE' },
        { label: '💥 아군 총병', type: 'unit', val: 'ally_FIREARM' },
        { label: '👺 적 고블린', type: 'unit', val: 'enemy_MELEE' },
        { label: '🐺 적 회색늑대', type: 'unit', val: 'enemy_MELEE' },
        { label: '👹 적 오크돌격병', type: 'unit', val: 'enemy_MELEE' }
      ];
    } else if (tab === 'eraser') {
      items = [
        { label: '🧹 타일 초기화 지우개', type: 'eraser', val: 'eraser' }
      ];
    }

    items.forEach((it, idx) => {
      const btn = document.createElement('button');
      btn.className = `civ4-palette-btn ${idx === 0 ? 'active' : ''}`;
      btn.textContent = it.label;
      if (idx === 0) {
        MapEditorController.selectedTool = { type: it.type, val: it.val };
      }

      btn.onclick = () => {
        document.querySelectorAll('.civ4-palette-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        MapEditorController.selectedTool = { type: it.type, val: it.val };
      };

      list.appendChild(btn);
    });
  }

  // Global Binding & Initialization
  window.MapEditorController = MapEditorController;
  window.openCiv4MapEditor = openCiv4MapEditor;
  window.closeCiv4MapEditor = closeCiv4MapEditor;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSectorTitleLongPress);
  } else {
    setupSectorTitleLongPress();
  }
})();
