/* ==========================================================================
   civ4-editor.js - Civilization IV Style 8x14 Tactical Scenario Map Editor
   & Editor Auth System (3-second LongPress Detection)
   ========================================================================== */

/**
 * 1. EditorAuth: 월드 섹터 탐색 버튼 3초 롱프레스 감지 및 비밀번호 인증 컨트롤러
 */
const EditorAuth = {
  LONG_PRESS_MS: 3000,
  PASSWORD_KEY: '20250113',

  init() {
    const targetElement = document.getElementById('sector-nodes-title');
    if (!targetElement) return;

    let timer = null;
    let isLongPressed = false;

    const startPress = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      isLongPressed = false;
      targetElement.classList.add('holding-editor-target');

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        isLongPressed = true;
        targetElement.classList.remove('holding-editor-target');
        if (navigator.vibrate) {
          try { navigator.vibrate([60, 80, 60]); } catch (_) {}
        }
        EditorAuth.openAuthPrompt();
      }, EditorAuth.LONG_PRESS_MS);
    };

    const cancelPress = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      targetElement.classList.remove('holding-editor-target');
    };

    targetElement.addEventListener('pointerdown', startPress);
    targetElement.addEventListener('pointerup', (e) => {
      if (isLongPressed) {
        e.preventDefault();
        e.stopPropagation();
      }
      cancelPress();
    });
    targetElement.addEventListener('pointerleave', cancelPress);
    targetElement.addEventListener('pointercancel', cancelPress);

    targetElement.addEventListener('click', (e) => {
      if (isLongPressed) {
        e.preventDefault();
        e.stopPropagation();
        isLongPressed = false;
      }
    });
  },

  openAuthPrompt() {
    let modal = document.getElementById('modal-editor-auth');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-editor-auth';
      modal.className = 'civ4-auth-overlay';
      modal.innerHTML = `
        <div class="civ4-auth-box">
          <div class="civ4-auth-title">🔐 시나리오 에디터 관리자 인증</div>
          <div class="civ4-auth-desc">3초 롱프레스 감지됨. 편집 모드 비밀번호를 입력하십시오.</div>
          <input type="password" id="input-editor-pwd" class="civ4-auth-input" placeholder="비밀번호 입력..." autocomplete="off" />
          <div id="editor-auth-error" class="civ4-auth-error" style="display:none;">비밀번호가 올바르지 않습니다.</div>
          <div class="civ4-auth-actions">
            <button id="btn-editor-auth-cancel" class="civ4-auth-btn cancel">취소</button>
            <button id="btn-editor-auth-confirm" class="civ4-auth-btn confirm">인증 및 진입</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('btn-editor-auth-cancel').onclick = () => {
        modal.style.display = 'none';
      };

      document.getElementById('btn-editor-auth-confirm').onclick = () => {
        EditorAuth.verify();
      };

      document.getElementById('input-editor-pwd').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') EditorAuth.verify();
      });
    }

    const input = document.getElementById('input-editor-pwd');
    const errEl = document.getElementById('editor-auth-error');
    if (input) input.value = '';
    if (errEl) errEl.style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => { if (input) input.focus(); }, 100);
  },

  verify() {
    const input = document.getElementById('input-editor-pwd');
    const errEl = document.getElementById('editor-auth-error');
    const pwd = input ? input.value.trim() : '';

    if (pwd === EditorAuth.PASSWORD_KEY) {
      document.getElementById('modal-editor-auth').style.display = 'none';
      if (typeof state !== 'undefined') {
        state.isEditMode = true;
      }
      if (typeof addLog === 'function') {
        addLog('🛠️ [에디터 활성화] 월드 섹터 및 8x14 시나리오 맵 에디터에 진입했습니다.', 'gold');
      }
      MapEditorController.open();
    } else {
      if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = '비밀번호가 올바르지 않습니다.';
      }
      if (input) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 400);
        input.select();
      }
      if (typeof addLog === 'function') {
        addLog('⚠️ [인증 실패] 비밀번호가 일치하지 않습니다.', 'danger');
      }
    }
  }
};

/**
 * 2. MapEditorController: 8x14 문명4 스타일 전술 시나리오 맵 에디터 엔진
 */
const MapEditorController = {
  COLS: 8,
  ROWS: 14,
  currentSectorId: 'A-1',
  selectedToolCategory: 'TERRAIN', // 'TERRAIN' | 'ROAD' | 'STRUCTURE' | 'UNIT' | 'ERASER'
  selectedPaletteItem: 'plain',
  unitBrushConfig: {
    side: 'ALLY',
    unitClass: 'KNIGHT',
    count: 1
  },

  TERRAIN_SPECS: {
    plain:    { name: '평야', apCost: 1, defBonus: 0.0, icon: '🌱', passable: true },
    forest:   { name: '숲',   apCost: 2, defBonus: 0.20, icon: '🌲', passable: true },
    hill:     { name: '산',   apCost: 3, defBonus: 0.40, icon: '⛰️', passable: true },
    mountain: { name: '암벽', apCost: 99, defBonus: 0.50, icon: '🏔️', passable: false },
    river:    { name: '강',   apCost: 3, defBonus: -0.10, icon: '〰️', passable: true },
    sea:      { name: '바다', apCost: 99, defBonus: 0.0, icon: '🌊', passable: false }
  },

  createBlankMap() {
    const mapTiles = [];
    for (let y = 0; y < MapEditorController.ROWS; y++) {
      for (let x = 0; x < MapEditorController.COLS; x++) {
        mapTiles.push({
          x,
          y,
          terrain: 'plain',
          hasRoad: false,
          structure: null,
          units: []
        });
      }
    }
    return mapTiles;
  },

  calculateMoveCost(fromTile, toTile) {
    const spec = MapEditorController.TERRAIN_SPECS[toTile.terrain] || MapEditorController.TERRAIN_SPECS.plain;
    if (!spec.passable) return 999;

    let baseCost = spec.apCost;
    if (toTile.hasRoad) {
      baseCost = Math.max(0.5, baseCost * 0.5); // 문명4 도로: 이동력 2배 = AP 50% 할인
    }
    return baseCost;
  },

  loadSectorMap(sectorId) {
    MapEditorController.currentSectorId = sectorId;
    if (typeof state !== 'undefined') {
      state.selectedSectorId = sectorId;
      state.editingSectorId = sectorId;
    }

    // 1. Check in-memory state.currentMapData
    if (typeof state !== 'undefined' && state.currentMapData && state.currentMapData.sectorId === sectorId) {
      const tiles = Array.isArray(state.currentMapData.tiles) ? state.currentMapData.tiles : [];
      if (tiles.length > 0) {
        MapEditorController.currentMapData = tiles;
        return tiles;
      }
    }

    // 2. Check worldSectors
    if (typeof state !== 'undefined' && state.worldSectors) {
      const targetSec = state.worldSectors.find(s => s.id === sectorId);
      if (targetSec && targetSec.scenarioMap) {
        const cached = Array.isArray(targetSec.scenarioMap)
          ? targetSec.scenarioMap
          : (targetSec.scenarioMap.tiles || null);
        if (cached && cached.length > 0) {
          MapEditorController.currentMapData = cached;
          return cached;
        }
      }
    }

    // 3. Asynchronously load from Firestore 'scenarioMaps' collection
    const loaderFunc = (typeof window.loadScenarioMapFromFirestore === 'function')
      ? window.loadScenarioMapFromFirestore
      : (window.FirebaseBridge ? window.FirebaseBridge.loadScenarioMapFromFirestore : null);

    if (loaderFunc) {
      loaderFunc(sectorId).then(data => {
        if (data && Array.isArray(data.tiles) && data.tiles.length > 0) {
          MapEditorController.currentMapData = data.tiles;
          if (typeof state !== 'undefined') {
            state.currentMapData = data;
            const targetSec = state.worldSectors ? state.worldSectors.find(s => s.id === sectorId) : null;
            if (targetSec) targetSec.scenarioMap = data.tiles;
          }
          MapEditorController.renderGrid();
          if (typeof addLog === 'function') {
            addLog(`🗺️ [에디터] Firestore 'scenarioMaps'에서 [${sectorId}] 맵을 불러왔습니다.`, 'gold');
          }
        }
      }).catch(err => console.warn(err));
    }

    // 4. Default: generateDefaultSectorMap or blank 8x14
    const defMap = (typeof window.generateDefaultSectorMap === 'function')
      ? window.generateDefaultSectorMap(sectorId).tiles
      : MapEditorController.createBlankMap();
    MapEditorController.currentMapData = defMap;
    return defMap;
  },

  saveSectorMap() {
    const activeSecId = MapEditorController.currentSectorId || 
                        (typeof state !== 'undefined' && (state.selectedSectorId || state.editingSectorId)) || 
                        'A-1';
    MapEditorController.currentSectorId = activeSecId;
    if (typeof state !== 'undefined') {
      state.selectedSectorId = activeSecId;
      state.editingSectorId = activeSecId;
    }

    const tiles = Array.isArray(MapEditorController.currentMapData)
      ? MapEditorController.currentMapData
      : (MapEditorController.currentMapData && Array.isArray(MapEditorController.currentMapData.tiles)
        ? MapEditorController.currentMapData.tiles
        : []);

    if (typeof state !== 'undefined' && state.worldSectors) {
      const targetSec = state.worldSectors.find(s => s.id === activeSecId);
      if (targetSec) {
        targetSec.scenarioMap = tiles;
      }
    }

    // Firestore 'scenarioMaps' 컬렉션에 동적 키값으로 저장
    if (typeof window.saveCurrentSectorMap === 'function') {
      window.saveCurrentSectorMap(activeSecId);
    } else if (typeof window.saveScenarioMapToFirestore === 'function') {
      window.saveScenarioMapToFirestore(activeSecId, {
        sectorId: activeSecId,
        cols: 8,
        rows: 14,
        tiles: tiles,
        updatedAt: new Date().toISOString()
      });
      if (typeof addLog === 'function') {
        addLog(`💾 [시나리오 저장 완료] 섹터 [${activeSecId}] 8x14 전술 맵 데이터가 Firestore 'scenarioMaps'에 안전하게 저장되었습니다.`, 'gold');
      }
    }
  },

  addNewWorldSector(sectorId, sectorName, recPower = 400) {
    if (!sectorId || !sectorName) {
      alert('섹터 ID와 이름을 정확히 입력하세요.');
      return;
    }

    if (typeof state !== 'undefined') {
      if (!state.worldSectors) state.worldSectors = [];
      const exists = state.worldSectors.some(s => s.id === sectorId);
      if (exists) {
        alert('이미 존재하는 섹터 ID입니다.');
        return;
      }

      const newSector = {
        id: sectorId,
        name: sectorName,
        recPower: Number(recPower) || 400,
        stars: '★★★☆☆',
        terrainComposition: { plain: 50, forest: 30, hill: 20 },
        scenarioMap: MapEditorController.createBlankMap()
      };

      state.worldSectors.push(newSector);
      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('world_sectors', { worldSectors: state.worldSectors });
      }
      
      MapEditorController.renderSectorDropdown();
      MapEditorController.switchSector(sectorId);
      if (typeof addLog === 'function') {
        addLog(`🗺️ [신규 섹터 생성] ${sectorName} (${sectorId}) 등록 완료 (Cloud 동기화)`, 'success');
      }
    }
  },

  open() {
    let editorModal = document.getElementById('modal-civ4-editor');
    if (!editorModal) {
      editorModal = document.createElement('div');
      editorModal.id = 'modal-civ4-editor';
      editorModal.innerHTML = MapEditorController.getEditorMarkup();
      document.body.appendChild(editorModal);
      MapEditorController.bindEvents();
    }

    if (typeof state !== 'undefined' && state.selectedSectorId) {
      MapEditorController.currentSectorId = state.selectedSectorId;
    }

    MapEditorController.currentMapData = MapEditorController.loadSectorMap(MapEditorController.currentSectorId);
    editorModal.style.display = 'flex';
    MapEditorController.renderSectorDropdown();
    MapEditorController.updatePaletteItemsUI();
    MapEditorController.renderGrid();
  },

  close() {
    const editorModal = document.getElementById('modal-civ4-editor');
    if (editorModal) editorModal.style.display = 'none';
  },

  renderSectorDropdown() {
    const select = document.getElementById('civ4-editor-sector-select');
    if (!select) return;
    select.innerHTML = '';

    const sectors = (typeof state !== 'undefined' && state.worldSectors && state.worldSectors.length > 0)
      ? state.worldSectors
      : [
          { id: 'A-1', name: '벨른 평원' },
          { id: 'A-2', name: '아이젠 요새' },
          { id: 'B-1', name: '에테르니아 왕도' },
          { id: 'B-2', name: '발할라 화산 화랑' }
        ];

    sectors.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `[${sec.id}] ${sec.name}`;
      if (sec.id === MapEditorController.currentSectorId) opt.selected = true;
      select.appendChild(opt);
    });
  },

  switchSector(sectorId) {
    MapEditorController.currentSectorId = sectorId;
    MapEditorController.currentMapData = MapEditorController.loadSectorMap(sectorId);
    MapEditorController.renderGrid();
  },

  renderGrid() {
    const gridEl = document.getElementById('civ4-editor-grid-dom') || document.getElementById('civ4-editor-grid-canvas');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const tiles = Array.isArray(MapEditorController.currentMapData)
      ? MapEditorController.currentMapData
      : (MapEditorController.currentMapData && Array.isArray(MapEditorController.currentMapData.tiles)
        ? MapEditorController.currentMapData.tiles
        : []);

    tiles.forEach((tile, index) => {
      const tileDiv = document.createElement('div');
      tileDiv.className = `civ4-tile terrain-${tile.terrain}`;
      if (tile.hasRoad) tileDiv.classList.add('has-road');

      const tSpec = MapEditorController.TERRAIN_SPECS[tile.terrain] || MapEditorController.TERRAIN_SPECS.plain;
      let centerIcon = tSpec.icon;

      if (tile.structure === 'city') centerIcon = '🏰';
      else if (tile.structure === 'village') centerIcon = '🏡';
      else if (tile.structure === 'resource') centerIcon = '💎';
      else if (tile.structure === 'tree') centerIcon = '🌴';

      tileDiv.innerHTML = `<span class="civ4-tile-ico">${centerIcon}</span>`;

      if (tile.units && tile.units.length > 0) {
        const totalUnits = tile.units.reduce((acc, u) => acc + (u.count || 1), 0);
        const topUnit = tile.units[0];
        const isAlly = topUnit.owner === 'PLAYER' || topUnit.owner === 'ALLY';

        const badge = document.createElement('span');
        badge.className = `civ4-unit-stack-badge ${isAlly ? 'ally' : 'enemy'}`;
        badge.textContent = totalUnits > 1 ? `x${totalUnits}` : (isAlly ? 'P' : 'E');
        tileDiv.appendChild(badge);
      }

      tileDiv.onclick = () => MapEditorController.applyBrushToTile(index);
      gridEl.appendChild(tileDiv);
    });
  },

  renderCanvas() {
    this.renderGrid();
  },

  applyBrushToTile(tileIndex) {
    const tiles = Array.isArray(MapEditorController.currentMapData)
      ? MapEditorController.currentMapData
      : (MapEditorController.currentMapData && Array.isArray(MapEditorController.currentMapData.tiles)
        ? MapEditorController.currentMapData.tiles
        : null);
    if (!tiles) return;
    const tile = tiles[tileIndex];
    if (!tile) return;

    const cat = MapEditorController.selectedToolCategory;
    const item = MapEditorController.selectedPaletteItem;

    if (cat === 'TERRAIN') {
      tile.terrain = item;
    } else if (cat === 'ROAD') {
      tile.hasRoad = !tile.hasRoad;
    } else if (cat === 'STRUCTURE') {
      tile.structure = (tile.structure === item) ? null : item;
    } else if (cat === 'UNIT') {
      const cfg = MapEditorController.unitBrushConfig;
      const count = Math.min(100, Math.max(1, parseInt(cfg.count, 10) || 1));

      if (!tile.units) tile.units = [];
      const currentTotal = tile.units.reduce((acc, u) => acc + u.count, 0);

      if (currentTotal + count > 100) {
        alert('동일 타일에는 최대 100개의 유닛까지만 중첩 배치할 수 있습니다.');
        return;
      }

      tile.units.push({
        id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        owner: cfg.side === 'ALLY' ? 'PLAYER' : 'ENEMY',
        classType: cfg.unitClass,
        count: count
      });
    } else if (cat === 'ERASER') {
      tile.terrain = 'plain';
      tile.hasRoad = false;
      tile.structure = null;
      tile.units = [];
    }

    MapEditorController.renderGrid();
  },

  bindEvents() {
    document.querySelectorAll('.civ4-tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.civ4-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        MapEditorController.selectedToolCategory = btn.dataset.category;
        MapEditorController.updatePaletteItemsUI();
      };
    });

    const secSelect = document.getElementById('civ4-editor-sector-select');
    if (secSelect) {
      secSelect.onchange = (e) => MapEditorController.switchSector(e.target.value);
    }

    const btnNewSector = document.getElementById('btn-civ4-add-sector');
    if (btnNewSector) {
      btnNewSector.onclick = () => {
        const id = prompt('새 월드 섹터 ID (예: C-1, Sector_Boss):');
        if (!id) return;
        const name = prompt('새 월드 섹터 이름 (예: C-1 검은 숲):');
        if (!name) return;
        MapEditorController.addNewWorldSector(id, name);
      };
    }

    const btnSave = document.getElementById('btn-civ4-save-map');
    if (btnSave) {
      btnSave.onclick = () => MapEditorController.saveSectorMap();
    }

    const btnClose = document.getElementById('btn-civ4-editor-close');
    if (btnClose) {
      btnClose.onclick = () => MapEditorController.close();
    }
  },

  updatePaletteItemsUI() {
    const container = document.getElementById('civ4-palette-items-list');
    if (!container) return;
    container.innerHTML = '';

    const cat = MapEditorController.selectedToolCategory;

    if (cat === 'TERRAIN') {
      Object.keys(MapEditorController.TERRAIN_SPECS).forEach(key => {
        const spec = MapEditorController.TERRAIN_SPECS[key];
        const btn = document.createElement('button');
        btn.className = `civ4-palette-btn ${MapEditorController.selectedPaletteItem === key ? 'active' : ''}`;
        btn.innerHTML = `<span>${spec.icon}</span> <span>${spec.name}</span>`;
        btn.onclick = () => {
          MapEditorController.selectedPaletteItem = key;
          MapEditorController.updatePaletteItemsUI();
        };
        container.appendChild(btn);
      });
    } else if (cat === 'ROAD') {
      container.innerHTML = `
        <div style="font-size: 11px; color:#38bdf8; display:flex; align-items:center; gap:8px;">
          <span>═ 도로 붓 활성화</span>
          <span style="color:#94a3b8;">(타일을 클릭하여 도로 설치/제거. AP 이동력 소모 50% 절감)</span>
        </div>
      `;
    } else if (cat === 'STRUCTURE') {
      const structures = [
        { id: 'city', name: '도시 (2x2)', icon: '🏰' },
        { id: 'village', name: '마을 (1x1)', icon: '🏡' },
        { id: 'resource', name: '자원 광맥', icon: '💎' },
        { id: 'tree', name: '오아시스/수림', icon: '🌴' }
      ];
      structures.forEach(st => {
        const btn = document.createElement('button');
        btn.className = `civ4-palette-btn ${MapEditorController.selectedPaletteItem === st.id ? 'active' : ''}`;
        btn.innerHTML = `<span>${st.icon}</span> <span>${st.name}</span>`;
        btn.onclick = () => {
          MapEditorController.selectedPaletteItem = st.id;
          MapEditorController.updatePaletteItemsUI();
        };
        container.appendChild(btn);
      });
    } else if (cat === 'UNIT') {
      container.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-size:11px;">
          <select id="civ4-brush-unit-side" class="civ4-auth-input" style="width:70px; padding:3px;">
            <option value="ALLY">아군</option>
            <option value="ENEMY">적군</option>
          </select>
          <select id="civ4-brush-unit-class" class="civ4-auth-input" style="width:85px; padding:3px;">
            <option value="KNIGHT">성기사</option>
            <option value="MAGE">마법사</option>
            <option value="ARCHER">궁수</option>
            <option value="MELEE">보병</option>
            <option value="FIREARM">화포병</option>
          </select>
          <input type="number" id="civ4-brush-unit-count" min="1" max="100" value="1" style="width:50px; padding:3px; background:#0f172a; color:#fff; border:1px solid #475569; border-radius:4px;" />
          <span style="color:#94a3b8;">기 중첩</span>
        </div>
      `;

      const sideSel = document.getElementById('civ4-brush-unit-side');
      const classSel = document.getElementById('civ4-brush-unit-class');
      const countInp = document.getElementById('civ4-brush-unit-count');

      sideSel.value = MapEditorController.unitBrushConfig.side;
      classSel.value = MapEditorController.unitBrushConfig.unitClass;
      countInp.value = MapEditorController.unitBrushConfig.count;

      sideSel.onchange = (e) => MapEditorController.unitBrushConfig.side = e.target.value;
      classSel.onchange = (e) => MapEditorController.unitBrushConfig.unitClass = e.target.value;
      countInp.oninput = (e) => MapEditorController.unitBrushConfig.count = Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1));
    } else if (cat === 'ERASER') {
      container.innerHTML = `<span style="font-size:11px; color:#ef4444;">🧹 지우개 모드: 타일을 탭하면 기본 평야로 초기화되고 유닛/도로가 삭제됩니다.</span>`;
    }
  },

  getEditorMarkup() {
    return `
      <div class="civ4-editor-window">
        <div class="civ4-editor-header">
          <h3>🏛️ 문명4 스타일 8x14 시나리오 전술 맵 에디터</h3>
          <button id="btn-civ4-editor-close" class="btn-close">✕</button>
        </div>

        <div class="civ4-sector-bar">
          <span>월드 섹터:</span>
          <select id="civ4-editor-sector-select" style="flex:1;"></select>
          <button id="btn-civ4-add-sector" class="civ4-btn-primary">➕ 섹터 추가</button>
        </div>

        <div class="civ4-grid-viewport">
          <div id="civ4-editor-grid-dom" class="civ4-editor-grid"></div>
        </div>

        <div class="civ4-palette-toolbar">
          <div class="civ4-palette-tabs">
            <button class="civ4-tab-btn active" data-category="TERRAIN">🌱 지형</button>
            <button class="civ4-tab-btn" data-category="ROAD">═ 도로</button>
            <button class="civ4-tab-btn" data-category="STRUCTURE">🏰 거점</button>
            <button class="civ4-tab-btn" data-category="UNIT">⚔️ 유닛 중첩</button>
            <button class="civ4-tab-btn" data-category="ERASER">🧹 초기화</button>
          </div>
          <div id="civ4-palette-items-list" class="civ4-palette-items"></div>
          <div class="civ4-action-bar">
            <span style="font-size: 10px; color: #64748b;">* 타일당 최대 100개 유닛 중첩 배치 지원</span>
            <button id="btn-civ4-save-map" class="civ4-btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              💾 시나리오 맵 저장
            </button>
          </div>
        </div>
      </div>
    `;
  }
};

window.EditorAuth = EditorAuth;
window.MapEditorController = MapEditorController;

// 3초 롱프레스 바인딩 자동 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EditorAuth.init());
} else {
  EditorAuth.init();
}
