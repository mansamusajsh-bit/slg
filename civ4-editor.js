/* ==========================================================================
   scenario-editor.js - 8x14 Tactical Scenario Map Editor
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
 * 2. MapEditorController: 8x14 전술 시나리오 맵 에디터 엔진
 */
const MapEditorController = {
  COLS: 8,
  ROWS: 14,
  currentSectorId: 'A-1',
  // 3단계: "섹터"와 "이 섹터에서 불러오는 전술맵 설계도"는 서로 다른 축이다.
  // 기본은 sectorId와 1:1(MapSchema.resolveDefaultTemplateId와 동일한 관례)이지만,
  // 이 입력값만 바꾸면 'A-1-forest' 같은 같은 섹터의 다른 템플릿을 편집/저장할 수 있다.
  currentTemplateId: 'A-1',
  selectedToolCategory: 'TERRAIN', // 'TERRAIN' | 'ROAD' | 'STRUCTURE' | 'UNIT' | 'SPAWN' | 'ERASER'
  selectedPaletteItem: 'plain',
  spawnBrushSide: 'player', // 'player' | 'enemy' — SPAWN 카테고리에서 어느 진영의 시작 지점을 찍을지
  unitBrushConfig: {
    side: 'ALLY',
    unitClass: 'KNIGHT',
    count: 1
  },
  isLoadingTemplate: false,
  isNewUnsavedTemplate: false,
  testBattle: null, // 마지막으로 만든 '독립 테스트' CurrentBattle. state.currentBattle과 완전히 분리된다.

  TERRAIN_SPECS: {
    plain:    { name: '평야', apCost: 1, defBonus: 0.0, icon: '🌱', passable: true },
    forest:   { name: '숲',   apCost: 2, defBonus: 0.20, icon: '🌲', passable: true },
    hill:     { name: '산',   apCost: 3, defBonus: 0.40, icon: '⛰️', passable: true },
    mountain: { name: '암벽', apCost: 99, defBonus: 0.50, icon: '🏔️', passable: false },
    river:    { name: '강',   apCost: 3, defBonus: -0.10, icon: '〰️', passable: true },
    sea:      { name: '바다', apCost: 99, defBonus: 0.0, icon: '🌊', passable: false }
  },

  /**
   * 에디터 섹터 목록의 '기준 데이터'. game.js의 실제 WORLD_SECTORS(게임에서 쓰는 진짜 섹터 목록)를
   * 그대로 배열로 변환해서 쓴다. 예전에는 이 목록을 civ4-editor.js 안에 따로 하드코딩해 둬서
   * WORLD_SECTORS와 내용이 어긋날 수 있었다 — 지금은 항상 WORLD_SECTORS를 그대로 따라간다.
   * WORLD_SECTORS가 아직 로드되지 않은 극히 예외적인 경우에만 최소 fallback을 쓴다.
   */
  getBaseSectorList() {
    if (typeof window.WORLD_SECTORS === 'object' && window.WORLD_SECTORS) {
      return Object.values(window.WORLD_SECTORS).map(s => ({ id: s.id, name: s.name }));
    }
    return [
      { id: 'A-1', name: '벨른 평원' },
      { id: 'A-2', name: '아이젠 요새' },
      { id: 'B-1', name: '에테르니아 왕도' },
      { id: 'B-2', name: '흑염 화산지대' }
    ];
  },

  /**
   * 버그 수정: 기존에는 '섹터 추가'로 커스텀 섹터를 하나라도 만들면 state.worldSectors가
   * 채워지면서 renderSectorDropdown()이 기준 목록(A-1~B-2)을 완전히 버리고 커스텀 섹터만
   * 보여줬다. 그 결과 "섹터 추가하면 기존에 있던 맵이 다 사라진 것처럼 보이는" 증상이 났다.
   * (Supabase의 실제 tacticalMapTemplates 데이터는 지워지지 않았지만, 에디터에서 선택할
   * 방법이 없어져서 사실상 접근 불가능해진다.)
   * 이제는 항상 "기준 목록 + 커스텀 섹터"를 id 기준으로 합쳐서 돌려준다.
   */
  getMergedSectorList() {
    const base = MapEditorController.getBaseSectorList();
    const custom = (typeof state !== 'undefined' && Array.isArray(state.worldSectors)) ? state.worldSectors : [];
    const merged = [...base];
    custom.forEach(sec => {
      if (!sec || !sec.id) return;
      const idx = merged.findIndex(s => s.id === sec.id);
      if (idx >= 0) merged[idx] = sec; // 커스텀이 같은 id를 덮어쓴 경우(기준 섹터 재정의)만 교체
      else merged.push(sec);
    });
    return merged;
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
          units: [],
          isSpawnPlayer: false,
          isSpawnEnemy: false
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
      baseCost = Math.max(0.5, baseCost * 0.5); // 도로: 이동력 2배 = AP 50% 할인
    }
    return baseCost;
  },

  /**
   * 템플릿 id 하나를 Supabase에서 "끝까지 기다린 뒤" 불러온다.
   * 예전 loadSectorMap()의 버그: 비동기 Supabase 조회를 시작해 놓고 그 결과를 기다리지 않은 채
   * 곧바로 기본맵을 return 해버려서, 나중에 Supabase 응답이 도착하면 화면이 몰래 바뀌는
   * "언제 맵이 바뀌는지 모르는" 경합 상태가 있었다. 이 함수는 그 경합을 없앤다:
   * 반드시 await가 끝난 뒤에만 currentMapData를 확정하고 그린다.
   *
   * 우선순위: Supabase(신규/구버전 포맷 모두 MapSchema가 정규화) → 인메모리 캐시 → 빈 템플릿(신규 제작).
   *
   * @param {string} templateId
   * @returns {Promise<Object>} 정규화된 TacticalMapTemplate
   */
  async loadTemplate(templateId) {
    const id = String(templateId || MapEditorController.currentTemplateId || '').trim();
    if (!id) throw new Error('전술 맵 템플릿 ID가 필요합니다.');
    MapEditorController.currentTemplateId = id;
    MapEditorController.isLoadingTemplate = true;
    MapEditorController.renderGrid();
    try {
      if (!window.MapSchema) throw new Error('MapSchema 모듈을 찾을 수 없습니다.');
      const strict = window.findTacticalMapTemplateStrict
        || (window.SupabaseBridge && typeof window.SupabaseBridge.findTacticalMapTemplateStrict === 'function'
            ? window.SupabaseBridge.findTacticalMapTemplateStrict.bind(window.SupabaseBridge) : null);
      const loader = strict
        || window.loadTacticalMapTemplateFromSupabase
        || window.loadScenarioMapFromSupabase;
      if (typeof loader !== 'function') throw new Error('Supabase 템플릿 로더가 연결되지 않았습니다.');
      // strict 로더: Supabase 오류는 여기서 throw(→ 아래 catch, 빈 맵 덮어쓰기 방지), 정말 없으면 null.
      const raw = await loader(id);
      if (!raw || !Array.isArray(raw.tiles) || raw.tiles.length === 0) {
        // 에디터 전용: 템플릿이 아직 없으면 기본 타일(평지)이 깔린 새 템플릿으로 편집을 시작한다.
        // (실제 전투 진입에서는 여전히 "템플릿 없음 = 실패"이며, 몰래 기본맵을 끼워 넣지 않는다.)
        // 저장 버튼을 눌러야 Supabase에 기록된다.
        const blank = MapSchema.normalizeTacticalMapTemplate({
          id,
          sectorId: MapEditorController.currentSectorId,
          width: MapEditorController.COLS,
          height: MapEditorController.ROWS,
          tiles: MapEditorController.createBlankMap(),
          spawnPoints: { player: [], enemy: [] },
          name: `Sector ${id}`
        }, id);
        MapEditorController.currentMapData = blank.tiles;
        MapEditorController.currentTemplateMeta = null;
        MapEditorController.isNewUnsavedTemplate = true;
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(`[${id}] 저장된 템플릿이 없어 기본 타일로 새로 시작합니다. 저장을 눌러야 등록됩니다.`, 'info');
        if (typeof addLog === 'function') addLog(`🆕 [${id}] 저장된 템플릿이 없어 기본 타일(평지)로 시작합니다. "저장"을 눌러야 Supabase에 기록됩니다.`, 'gold');
        return blank;
      }
      MapEditorController.isNewUnsavedTemplate = false;
      const template = MapSchema.normalizeTacticalMapTemplate(raw, id);
      const validation = MapSchema.validateTacticalMapTemplate(template);
      if (!validation.valid) throw new Error(validation.errors.join(', '));
      MapSchema.applySpawnPointsToTiles(template.tiles, template.spawnPoints);
      MapEditorController.currentMapData = template.tiles;
      MapEditorController.currentTemplateMeta = template;
      if (typeof addLog === 'function') addLog(`Supabase에서 템플릿 [${id}]을 불러왔습니다.`, 'gold');
      return template;
    } catch (err) {
      MapEditorController.currentMapData = null;
      MapEditorController.currentTemplateMeta = null;
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(err.message || '템플릿 불러오기 실패', 'warning');
      throw err;
    } finally {
      MapEditorController.isLoadingTemplate = false;
      MapEditorController.renderGrid();
      MapEditorController.syncTemplateIdInputUI();
    }
  },

  // 하위호환 별칭: 예전 이름으로 부르는 코드가 있어도 동작하도록 유지한다.
  loadSectorMap(sectorId) {
    return MapEditorController.loadTemplate(sectorId);
  },

  /**
   * 현재 편집 중인 타일을 TacticalMapTemplate 스키마로 패키징하고,
   * MapSchema로 검증한 뒤에만 Supabase에 저장한다. 검증 실패 시 절대 저장하지 않는다.
   */
  async saveTemplate() {
    if (!window.MapSchema) {
      console.error('❌ [에디터] MapSchema 모듈을 찾을 수 없어 저장을 중단합니다.');
      if (typeof window.UI?.showToast === 'function') window.UI.showToast('❌ MapSchema 모듈을 찾을 수 없습니다.', 'warning');
      return false;
    }

    const templateId = String(MapEditorController.currentTemplateId || MapEditorController.currentSectorId || 'A-1').trim() || MapEditorController.currentSectorId;
    MapEditorController.currentTemplateId = templateId;

    const tiles = Array.isArray(MapEditorController.currentMapData) ? MapEditorController.currentMapData : [];
    const spawnPoints = MapSchema.deriveSpawnPointsFromTiles(tiles);

    const rawTemplate = {
      id: templateId,
      sectorId: MapEditorController.currentSectorId,
      width: MapEditorController.COLS,
      height: MapEditorController.ROWS,
      tiles,
      spawnPoints,
      name: (MapEditorController.currentTemplateMeta && MapEditorController.currentTemplateMeta.metadata && MapEditorController.currentTemplateMeta.metadata.name)
        || `Sector ${templateId}`
    };

    const template = MapSchema.normalizeTacticalMapTemplate(rawTemplate, templateId);
    const check = MapSchema.validateTacticalMapTemplate(template);

    if (!check.valid) {
      const msg = `❌ [에디터] [${templateId}] 템플릿이 유효하지 않아 저장할 수 없습니다: ${check.errors.join(', ')}`;
      console.error(msg);
      if (typeof addLog === 'function') addLog(msg, 'warning');
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
      return false;
    }

    const payload = {
      sectorId: template.sectorId,
      name: template.metadata.name,
      cols: template.width,
      rows: template.height,
      tiles: template.tiles,
      spawnPoints: template.spawnPoints,
      roads: template.metadata.roads,
      structures: template.metadata.structures,
      units: template.metadata.units,
      updatedAt: new Date().toISOString()
    };

    const saver = (typeof window.saveTacticalMapTemplateToSupabase === 'function')
      ? window.saveTacticalMapTemplateToSupabase
      : (typeof window.saveScenarioMapToSupabase === 'function')
        ? window.saveScenarioMapToSupabase
        : null;

    if (!saver) {
      const msg = '❌ [에디터] Supabase 저장 함수를 찾을 수 없습니다.';
      console.error(msg);
      if (typeof addLog === 'function') addLog(msg, 'warning');
      return false;
    }

    // 기본 섹터 맵은 실제 원본인 game_configs/world_sectors의 scenarioMap에도 반영한다.
    // tacticalMapTemplates는 구버전 호환 및 향후 다중 템플릿용으로 병행 유지한다.
    let ok = await saver(templateId, payload);
    if (ok && templateId === MapEditorController.currentSectorId && typeof window.saveSectorScenarioMapToSupabase === 'function') {
      // 저장의 성공 기준은 tacticalMapTemplates(위 saver) 하나다. world_sectors 미러는 구버전 호환용이라
      // 실패하거나(false) 섹터가 없어 건너뛰어도('skipped') 저장 자체는 성공으로 본다. 실패는 경고만 남긴다.
      const sectorSaveOk = await window.saveSectorScenarioMapToSupabase(templateId, payload);
      if (sectorSaveOk === false && typeof addLog === 'function') {
        addLog(`⚠️ [${templateId}] 템플릿은 저장됐지만 world_sectors 구버전 사본 갱신에는 실패했습니다. (전투는 tacticalMapTemplates를 사용하므로 영향 없음)`, 'warning');
      }
    }

    if (ok) {
      MapEditorController.currentTemplateMeta = template;
      if (typeof window.updateSectorTerrainCache === 'function') window.updateSectorTerrainCache(templateId, template.tiles);
      // 이 템플릿이 섹터의 '기본' 템플릿(= sectorId와 동일한 id)일 때만
      // 레거시 state.worldSectors 캐시를 함께 갱신한다 (다른 코드와의 하위호환용).
      if (typeof state !== 'undefined' && state.worldSectors && templateId === MapEditorController.currentSectorId) {
        const targetSec = state.worldSectors.find(s => s.id === MapEditorController.currentSectorId);
        if (targetSec) targetSec.scenarioMap = template.tiles;
      }
      if (typeof addLog === 'function') {
        addLog(`💾 [템플릿 저장 완료] [${templateId}] 전술 맵 템플릿이 Supabase에 저장되었습니다. (스폰: 아군 ${spawnPoints.player.length} / 적군 ${spawnPoints.enemy.length})`, 'gold');
      }
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(`💾 템플릿 [${templateId}] 저장 완료`, 'success');
    } else {
      const msg = `❌ [에디터] [${templateId}] 템플릿 저장에 실패했습니다.`;
      console.warn(msg);
      if (typeof addLog === 'function') addLog(msg, 'warning');
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
    }
    return ok;
  },

  // 하위호환 별칭
  saveSectorMap() {
    return MapEditorController.saveTemplate();
  },

  /**
   * 템플릿 id 입력창을 현재 currentTemplateId 값으로 맞춘다.
   */
  syncTemplateIdInputUI() {
    const input = document.getElementById('civ4-editor-template-id-input');
    if (input) input.value = MapEditorController.currentTemplateId;
  },

  /**
   * 4단계: '독립 테스트' 모드.
   * 저장하지 않은 현재 편집 상태를 그대로 CurrentBattle 스키마로 감싸서
   * MapEditorController.testBattle에만 넣는다. state.currentBattle / state.tiles는
   * 절대 건드리지 않으므로, 실제 진행 중인 게임 상태를 오염시키지 않는다.
   */
  testPlayCurrentMap() {
    if (!window.MapSchema) {
      if (typeof window.UI?.showToast === 'function') window.UI.showToast('❌ MapSchema 모듈을 찾을 수 없습니다.', 'warning');
      return;
    }

    const tiles = Array.isArray(MapEditorController.currentMapData) ? MapEditorController.currentMapData : [];
    const templateId = MapEditorController.currentTemplateId || MapEditorController.currentSectorId;
    const rawTemplate = {
      id: templateId,
      width: MapEditorController.COLS,
      height: MapEditorController.ROWS,
      tiles,
      spawnPoints: MapSchema.deriveSpawnPointsFromTiles(tiles),
      name: `${templateId} (테스트 미리보기, 미저장)`
    };
    const template = MapSchema.normalizeTacticalMapTemplate(rawTemplate, templateId);
    const check = MapSchema.validateTacticalMapTemplate(template);
    if (!check.valid) {
      const msg = `⚠️ 테스트 플레이 불가: ${check.errors.join(', ')}`;
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
      if (typeof addLog === 'function') addLog(`⚠️ [에디터 테스트] ${msg}`, 'warning');
      return;
    }

    const testBattle = MapSchema.createCurrentBattle({
      sectorId: MapEditorController.currentSectorId,
      template,
      seed: 'EDITOR-TEST',
      nodeId: 'EDITOR_TEST_PREVIEW',
      type: 'battle'
    });

    MapEditorController.testBattle = testBattle;
    MapEditorController.openTestPlayModal(testBattle);
    if (typeof addLog === 'function') {
      addLog(`🧪 [에디터] [${templateId}] 저장되지 않은 편집 상태를 독립 테스트 미리보기로 열었습니다. (게임 진행 상태는 변경되지 않음)`, 'system');
    }
  },

  openTestPlayModal(testBattle) {
    let modal = document.getElementById('modal-civ4-test-play');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-civ4-test-play';
      modal.className = 'civ4-auth-overlay';
      document.body.appendChild(modal);
    }

    const map = testBattle.map;
    const tilesHtml = map.tiles.map(t => {
      const spec = MapEditorController.TERRAIN_SPECS[t.terrain] || MapEditorController.TERRAIN_SPECS.plain;
      let icon = spec.icon;
      if (t.structure === 'city') icon = '🏰';
      else if (t.structure === 'village') icon = '🏡';
      else if (t.structure === 'resource') icon = '💎';
      else if (t.structure === 'tree') icon = '🌴';
      const spawnCls = t.isSpawnPlayer ? ' spawn-player' : (t.isSpawnEnemy ? ' spawn-enemy' : '');
      return `<div class="civ4-tile terrain-${t.terrain}${spawnCls}"><span class="civ4-tile-ico">${icon}</span></div>`;
    }).join('');

    modal.innerHTML = `
      <div class="civ4-auth-box" style="max-width: 420px; width: 92vw;">
        <div class="civ4-auth-title">🧪 독립 테스트 미리보기 — 저장되지 않음</div>
        <div class="civ4-auth-desc">
          [${testBattle.sectorId}] 템플릿 [${testBattle.templateId}]을(를) state.currentBattle에 반영하지 않고
          그대로 미리 보여주는 화면입니다. 실제 게임 진행 상태는 변하지 않습니다.
        </div>
        <div class="civ4-grid-viewport" style="max-height: 50vh;">
          <div class="civ4-editor-grid" style="pointer-events:none;">${tilesHtml}</div>
        </div>
        <div class="civ4-auth-actions">
          <button id="btn-civ4-test-play-close" class="civ4-auth-btn cancel">닫기</button>
        </div>
      </div>
    `;
    document.getElementById('btn-civ4-test-play-close').onclick = () => {
      modal.style.display = 'none';
    };
    modal.style.display = 'flex';
  },

  async addNewWorldSector(sectorId, sectorName, recPower = 400) {
    if (!sectorId || !sectorName) {
      if (typeof window.UI?.showToast === 'function') {
        window.UI.showToast('⚠️ 섹터 ID와 이름을 정확히 입력하세요.', 'warning');
      } else {
        console.warn('섹터 ID와 이름을 정확히 입력하세요.');
      }
      return;
    }

    if (typeof state !== 'undefined') {
      if (!state.worldSectors) state.worldSectors = [];
      // 버그 수정: 기준 섹터(A-1~B-2)와도 겹치는지 함께 확인해야 한다.
      // 예전에는 state.worldSectors(커스텀 섹터)만 봐서, 기준 섹터와 같은 id를 새로 만들면
      // 기준 섹터가 조용히 가려지는 문제가 있었다.
      const exists = MapEditorController.getMergedSectorList().some(s => s.id === sectorId);
      if (exists) {
        if (typeof window.UI?.showToast === 'function') {
          window.UI.showToast('⚠️ 이미 존재하는 섹터 ID입니다.', 'warning');
        } else {
          console.warn('이미 존재하는 섹터 ID입니다.');
        }
        return;
      }

      const blankTiles = MapEditorController.createBlankMap();
      const newSector = {
        id: sectorId,
        name: sectorName,
        recPower: Number(recPower) || 400,
        stars: '★★★☆☆',
        terrainComposition: { plain: 50, forest: 30, hill: 20 },
        scenarioMap: blankTiles
      };

      state.worldSectors.push(newSector);
      if (typeof window.saveGameConfigToCloud === 'function') {
        const saved = await window.saveGameConfigToCloud('world_sectors', { worldSectors: state.worldSectors });
        if (!saved) {
          window.UI?.showToast?.('신규 섹터 저장에 실패했습니다. 연결 및 권한을 확인하세요.', 'warning');
          return;
        }
      }

      MapEditorController.renderSectorDropdown();
      if (typeof window.refreshWorldSectorNodes === 'function') window.refreshWorldSectorNodes();

      // 버그 수정: 방금 만든 섹터는 Supabase에 저장된 템플릿이 아직 없다(당연하다 — 막 만들었으니까).
      // 예전에는 여기서 switchSector()를 불러 곧바로 Supabase 로드를 시도했고, 그게 실패하면서
      // "전술맵 템플릿이 Supabase에 없습니다" 경고가 사용자를 놀라게 했다. 신규 섹터는 네트워크
      // 조회 없이 방금 만든 빈 맵으로 바로 편집을 시작하고, "저장" 버튼을 눌러야 비로소
      // Supabase에 실제 템플릿이 생긴다.
      MapEditorController.currentSectorId = sectorId;
      MapEditorController.currentTemplateId = sectorId;
      MapEditorController.currentMapData = blankTiles;
      MapEditorController.currentTemplateMeta = null;
      MapEditorController.renderGrid();
      MapEditorController.syncTemplateIdInputUI();

      if (typeof addLog === 'function') {
        addLog(`🗺️ [신규 섹터 생성] ${sectorName} (${sectorId}) 등록 완료. 빈 맵으로 시작합니다 — "저장" 버튼을 눌러야 Supabase에 기록됩니다.`, 'success');
      }
    }
  },

  async open() {
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
      MapEditorController.currentTemplateId = state.selectedSectorId;
    }

    // 버그 수정: addNewWorldSector()는 커스텀 섹터를 game_configs/world_sectors에 저장은 했지만
    // 그동안 이걸 다시 읽어오는 코드가 없었다 — 그래서 브라우저를 새로고침하면 세션 동안 만든
    // 커스텀 섹터가 (Supabase의 실제 템플릿 데이터는 멀쩡히 남아있는데도) 드롭다운에서 보이지
    // 않게 됐다. 에디터를 열 때 한 번, 기준 목록(WORLD_SECTORS)에 커스텀 섹터를 병합해 복원한다.
    if (typeof state !== 'undefined') {
      try {
        const loader = window.loadGameConfigFromCloud
          || (window.SupabaseBridge && window.SupabaseBridge.loadGameConfigFromCloud.bind(window.SupabaseBridge));
        const cfg = typeof loader === 'function' ? await loader('world_sectors') : null;
        state.worldSectors = (cfg && Array.isArray(cfg.worldSectors)) ? cfg.worldSectors : [];
      } catch (err) {
        console.warn('[에디터] 커스텀 섹터 목록 복원 실패:', err);
        state.worldSectors = [];
      }
    }

    editorModal.style.display = 'flex';
    MapEditorController.renderSectorDropdown();
    MapEditorController.updatePaletteItemsUI();
    await MapEditorController.loadTemplate(MapEditorController.currentTemplateId);
  },

  close() {
    const editorModal = document.getElementById('modal-civ4-editor');
    if (editorModal) editorModal.style.display = 'none';
  },

  renderSectorDropdown() {
    const select = document.getElementById('civ4-editor-sector-select');
    if (!select) return;
    select.innerHTML = '';

    const sectors = MapEditorController.getMergedSectorList();

    sectors.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `[${sec.id}] ${sec.name}`;
      if (sec.id === MapEditorController.currentSectorId) opt.selected = true;
      select.appendChild(opt);
    });
  },

  async switchSector(sectorId) {
    MapEditorController.currentSectorId = sectorId;
    // 섹터를 바꾸면 기본적으로 그 섹터의 기본 템플릿(=sectorId와 동일한 id)을 연다.
    // 특정 하위 템플릿(A-1-forest 등)을 계속 보고 싶다면 템플릿 id 입력창에서 직접 불러오면 된다.
    MapEditorController.currentTemplateId = sectorId;
    await MapEditorController.loadTemplate(sectorId).catch(err => null);
  },

  renderGrid() {
    const gridEl = document.getElementById('civ4-editor-grid-dom') || document.getElementById('civ4-editor-grid-canvas');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    if (MapEditorController.isLoadingTemplate) {
      gridEl.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; text-align:center; color:#94a3b8; font-size:12px;">⏳ 템플릿을 불러오는 중...</div>`;
      return;
    }

    const tiles = Array.isArray(MapEditorController.currentMapData)
      ? MapEditorController.currentMapData
      : (MapEditorController.currentMapData && Array.isArray(MapEditorController.currentMapData.tiles)
        ? MapEditorController.currentMapData.tiles
        : []);

    tiles.forEach((tile, index) => {
      const tileDiv = document.createElement('div');
      tileDiv.className = `civ4-tile terrain-${tile.terrain}`;
      if (tile.hasRoad) tileDiv.classList.add('has-road');
      if (tile.isSpawnPlayer) tileDiv.classList.add('spawn-player');
      if (tile.isSpawnEnemy) tileDiv.classList.add('spawn-enemy');

      const tSpec = MapEditorController.TERRAIN_SPECS[tile.terrain] || MapEditorController.TERRAIN_SPECS.plain;
      let centerIcon = tSpec.icon;

      if (tile.structure === 'city') centerIcon = '🏰';
      else if (tile.structure === 'village') centerIcon = '🏡';
      else if (tile.structure === 'resource') centerIcon = '💎';
      else if (tile.structure === 'tree') centerIcon = '🌴';

      tileDiv.innerHTML = `<span class="civ4-tile-ico">${centerIcon}</span>`;

      if (tile.isSpawnPlayer || tile.isSpawnEnemy) {
        const spawnBadge = document.createElement('span');
        spawnBadge.className = `civ4-spawn-badge ${tile.isSpawnPlayer ? 'player' : 'enemy'}`;
        spawnBadge.textContent = tile.isSpawnPlayer ? '🟦' : '🟥';
        tileDiv.appendChild(spawnBadge);
      }

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
        if (typeof window.UI?.showToast === 'function') {
          window.UI.showToast('⚠️ 동일 타일에는 최대 100개의 유닛까지만 중첩 배치할 수 있습니다.', 'warning');
        } else if (typeof window.addLog === 'function') {
          window.addLog('⚠️ 동일 타일에는 최대 100개의 유닛까지만 중첩 배치할 수 있습니다.', 'warning');
        }
        return;
      }

      tile.units.push({
        id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        owner: cfg.side === 'ALLY' ? 'PLAYER' : 'ENEMY',
        classType: cfg.unitClass,
        count: count
      });
    } else if (cat === 'SPAWN') {
      if (MapEditorController.spawnBrushSide === 'enemy') {
        tile.isSpawnEnemy = !tile.isSpawnEnemy;
      } else {
        tile.isSpawnPlayer = !tile.isSpawnPlayer;
      }
    } else if (cat === 'ERASER') {
      tile.terrain = 'plain';
      tile.hasRoad = false;
      tile.structure = null;
      tile.units = [];
      tile.isSpawnPlayer = false;
      tile.isSpawnEnemy = false;
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
        const nextNum = MapEditorController.getMergedSectorList().length + 1;
        const newSecId = `C-${nextNum}`;
        const newSecName = `신규 전술 섹터 C-${nextNum}`;
        MapEditorController.addNewWorldSector(newSecId, newSecName);
        if (typeof window.UI?.showToast === 'function') {
          window.UI.showToast(`✨ 신규 섹터 [${newSecId} ${newSecName}]이(가) 등록되었습니다.`, 'success');
        }
      };
    }

    const btnSave = document.getElementById('btn-civ4-save-map');
    if (btnSave) {
      btnSave.onclick = () => MapEditorController.saveTemplate();
    }

    const tplInput = document.getElementById('civ4-editor-template-id-input');
    if (tplInput) {
      tplInput.oninput = (e) => {
        // 공백/슬래시는 Supabase 문서 키로 쓸 수 없으므로 즉시 제거한다.
        const cleaned = e.target.value.replace(/[\s/\\'"]/g, '');
        if (cleaned !== e.target.value) e.target.value = cleaned;
        MapEditorController.currentTemplateId = cleaned;
      };
    }

    const btnLoadTpl = document.getElementById('btn-civ4-load-template');
    if (btnLoadTpl) {
      btnLoadTpl.onclick = () => {
        const id = (MapEditorController.currentTemplateId || '').trim();
        if (!id) {
          if (typeof window.UI?.showToast === 'function') window.UI.showToast('⚠️ 템플릿 ID를 입력하세요.', 'warning');
          return;
        }
        MapEditorController.loadTemplate(id).catch(err => console.error("[맵 템플릿 로드 실패]", err));
      };
    }

    const btnTest = document.getElementById('btn-civ4-test-play');
    if (btnTest) {
      btnTest.onclick = () => MapEditorController.testPlayCurrentMap();
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
    } else if (cat === 'SPAWN') {
      const side = MapEditorController.spawnBrushSide;
      container.innerHTML = '';
      [
        { id: 'player', label: '🟦 아군 시작 지점' },
        { id: 'enemy', label: '🟥 적군 스폰 지점' }
      ].forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `civ4-palette-btn ${side === opt.id ? 'active' : ''}`;
        btn.textContent = opt.label;
        btn.onclick = () => {
          MapEditorController.spawnBrushSide = opt.id;
          MapEditorController.updatePaletteItemsUI();
        };
        container.appendChild(btn);
      });
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:10px; color:#94a3b8; width:100%;';
      hint.textContent = '타일을 탭하면 시작/스폰 지점이 켜지고, 다시 탭하면 해제됩니다.';
      container.appendChild(hint);
    } else if (cat === 'ERASER') {
      container.innerHTML = `<span style="font-size:11px; color:#ef4444;">🧹 지우개 모드: 타일을 탭하면 기본 평야로 초기화되고 유닛/도로가 삭제됩니다.</span>`;
    }
  },

  getEditorMarkup() {
    return `
      <div class="civ4-editor-window">
        <div class="civ4-editor-header">
          <h3>🗺️ 8×14 시나리오 전술 맵 에디터</h3>
          <button id="btn-civ4-editor-close" class="btn-close">✕</button>
        </div>

        <div class="civ4-sector-bar">
          <span>월드 섹터:</span>
          <select id="civ4-editor-sector-select" style="flex:1;"></select>
          <button id="btn-civ4-add-sector" class="civ4-btn-primary">➕ 섹터 추가</button>
        </div>

        <div class="civ4-sector-bar">
          <span>템플릿 ID:</span>
          <input type="text" id="civ4-editor-template-id-input" class="civ4-auth-input" style="flex:1; padding:4px 6px;" placeholder="예: A-1-forest" autocomplete="off" />
          <button id="btn-civ4-load-template" class="civ4-btn-primary">📂 불러오기</button>
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
            <button class="civ4-tab-btn" data-category="SPAWN">🚩 스폰</button>
            <button class="civ4-tab-btn" data-category="ERASER">🧹 초기화</button>
          </div>
          <div id="civ4-palette-items-list" class="civ4-palette-items"></div>
          <div class="civ4-action-bar">
            <span style="font-size: 10px; color: #64748b;">* 타일당 최대 100개 유닛 중첩 배치 지원</span>
            <button id="btn-civ4-test-play" class="civ4-btn-primary" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
              🧪 테스트
            </button>
            <button id="btn-civ4-save-map" class="civ4-btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              💾 템플릿 저장
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
