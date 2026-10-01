// LEGACY: 이 파일은 index.html/빌드(scripts/vercel-static-build.mjs)에서 로드되지 않는 구버전 코드다.
// LEGACY: Firestore 'scenarioMaps' + state.tiles + 기본맵 fallback 구조이며, 현재는 supabase-bridge.js(tacticalMapTemplates)를 쓴다.
/**
 * dbManager.js - Universal Tactical Scenario Map & Firestore Persistence Module
 * 
 * Provides:
 * 1. Dynamic Sector ID Map Loader: loadAndRenderSectorMap(sectorId)
 *    - Asynchronously queries Firestore collection 'scenarioMaps' / doc(sectorId)
 *    - Deserializes 8x14 grid tiles, roads, structures, and unit placements into state.currentMapData
 *    - Falls back to generateDefaultSectorMap(sectorId) for newly created or unseeded sectors
 * 2. Default 8x14 Sector Map Generator: generateDefaultSectorMap(sectorId)
 * 3. Universal Scenario Map Saver: saveCurrentSectorMap(sectorId)
 *    - Dynamically saves to Firestore 'scenarioMaps' with the active sector key (state.selectedSectorId)
 * 4. Tactical Field Renderer: renderTacticalSectorField(mapData)
 * 
 * Compatible with Vanilla JS browser scripts (window.*) and ES Module imports.
 */

(function (global) {
  'use strict';

  const GRID_COLS = 8;
  const GRID_ROWS = 14;

  /**
   * Terrain specifications dictionary for 8x14 tactical maps
   */
  const TERRAIN_SPECS = {
    plain:    { name: '평야', apCost: 1, defBonus: 0.0, icon: '🌱', type: 'plain' },
    forest:   { name: '깊은 숲', apCost: 2, defBonus: 0.20, icon: '🌲', type: 'forest' },
    hill:     { name: '험준한 산악', apCost: 3, defBonus: 0.40, icon: '⛰️', type: 'hill' },
    mountain: { name: '암벽 영봉', apCost: 99, defBonus: 0.50, icon: '🏔️', type: 'mountain' },
    river:    { name: '급류 하천', apCost: 3, defBonus: -0.10, icon: '〰️', type: 'river' },
    sea:      { name: '심해 연안', apCost: 99, defBonus: 0.0, icon: '🌊', type: 'sea' }
  };

  /**
   * Generates a fully featured, balanced 8x14 tile terrain layout for any sector ID.
   * Adapts layout themes for recognized sectors (A-1, A-2, B-1, B-2) or dynamically
   * seeds procedural terrain for custom sectors ('Sector_B1', 'C-3', etc.).
   *
   * @param {string} sectorId - Unique identifier of the world sector
   * @returns {Object} Complete 8x14 scenario map data object
   */
  function generateDefaultSectorMap(sectorId) {
    const secId = String(sectorId || 'A-1');
    const tiles = [];
    const roads = [];
    const structures = [];
    const units = [];

    // Extract sector metadata if registered in WORLD_SECTORS
    const worldSector = (typeof global.WORLD_SECTORS !== 'undefined' && global.WORLD_SECTORS[secId])
      ? global.WORLD_SECTORS[secId]
      : null;

    const sectorName = worldSector ? worldSector.name : `섹터 [${secId}]`;

    // Themed layout logic based on sector archetype
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        let terrain = 'plain';
        let name = '평야';
        let defBonus = 0.0;
        let isSafe = false;
        let isCity = false;
        let terrainIcon = '🌱';
        let hasRoad = false;
        let structure = null;

        if (secId === 'A-1') {
          // [A-1 벨른 평원]: 기동성 중심의 탁 트인 평원, 숲 거점, 남북 관통 도로
          if ((x === 3 || x === 4) && y >= 3 && y <= 11) hasRoad = true;
          if (y === 6 && (x >= 1 && x <= 6)) hasRoad = true;

          if (x === 3 && y === 6) {
            terrain = 'plain';
            structure = 'village';
            name = '벨른 중앙 마을';
            defBonus = 0.20;
            isSafe = true;
            terrainIcon = '🏡';
          } else if ((x === 1 && (y === 3 || y === 4)) || (x === 6 && (y === 4 || y === 5)) || (x === 2 && y === 9)) {
            terrain = 'forest';
            name = '초원 수목림';
            defBonus = 0.20;
            terrainIcon = '🌲';
          } else if ((x === 0 && y === 2) || (x === 7 && y === 1) || (x === 7 && y === 10)) {
            terrain = 'hill';
            name = '완만한 구릉';
            defBonus = 0.30;
            terrainIcon = '⛰️';
          }
        } else if (secId === 'A-2') {
          // [A-2 아이젠 요새]: 성채 요새, 방어 망루, 험준한 산악 방어선
          if ((x === 3 || x === 4) && (y === 5 || y === 6)) {
            terrain = 'plain';
            structure = 'city';
            name = '아이젠 철혈 요새';
            defBonus = 0.45;
            isSafe = true;
            isCity = true;
            terrainIcon = '🏰';
          } else if ((x === 2 && y === 5) || (x === 5 && y === 5) || (x === 2 && y === 6) || (x === 5 && y === 6)) {
            terrain = 'hill';
            structure = 'village';
            name = '외곽 방어 망루';
            defBonus = 0.35;
            terrainIcon = '🛡️';
          } else if (x === 3 || x === 4) {
            hasRoad = true;
          }

          if ((x === 0 || x === 7) && (y >= 3 && y <= 9)) {
            terrain = 'mountain';
            name = '외벽 단애 절벽';
            defBonus = 0.50;
            terrainIcon = '🏔️';
          } else if ((x === 1 && y === 4) || (x === 6 && y === 7) || (x === 1 && y === 9)) {
            terrain = 'forest';
            name = '요새 수풀 매복지';
            defBonus = 0.25;
            terrainIcon = '🌲';
          }
        } else if (secId === 'B-1') {
          // [B-1 에테르니아 왕도]: 2x2 대형 수도성, 십자 포장도로, 강과 외곽 마을
          if ((x === 3 || x === 4) && (y === 6 || y === 7)) {
            terrain = 'plain';
            structure = 'city';
            name = '에테르니아 왕성';
            defBonus = 0.50;
            isSafe = true;
            isCity = true;
            terrainIcon = '👑';
          } else if ((x === 1 && y === 2) || (x === 6 && y === 11)) {
            terrain = 'plain';
            structure = 'village';
            name = '왕도 성하마을';
            defBonus = 0.25;
            isSafe = true;
            terrainIcon = '🏡';
          }

          // 십자 고속도로
          if (x === 3 || x === 4 || y === 6 || y === 7) {
            hasRoad = true;
          }

          // 수도 방위 하천 (X=1, Y=4~9)
          if (x === 1 && (y >= 4 && y <= 8)) {
            terrain = 'river';
            name = '왕도 해자 수로';
            defBonus = -0.10;
            terrainIcon = '〰️';
          } else if ((x === 6 && y <= 3) || (x === 0 && y >= 10)) {
            terrain = 'forest';
            name = '왕실 수렵림';
            defBonus = 0.20;
            terrainIcon = '🌲';
          }
        } else if (secId === 'B-2') {
          // [B-2 흑염 화산지대]: 고열 용암 지열, 암벽, 산악 협곡 전장
          if ((x === 2 || x === 5) && (y === 4 || y === 5 || y === 8)) {
            terrain = 'mountain';
            name = '흑염 화산 봉우리';
            defBonus = 0.50;
            terrainIcon = '🌋';
          } else if ((x === 3 && y === 6) || (x === 4 && y === 6)) {
            terrain = 'plain';
            structure = 'resource';
            name = '고대 흑요석 마그마 제단';
            defBonus = 0.30;
            terrainIcon = '💎';
          } else if ((x + y) % 3 === 0) {
            terrain = 'hill';
            name = '용암 고원 둔덕';
            defBonus = 0.40;
            terrainIcon = '⛰️';
          }
          if (x === 3 || x === 4) hasRoad = true;
        } else {
          // 동적 생성/임의의 신규 섹터 (Sector_B1, C-3 등): 절차적 밸런스 지형 생성
          const hash = Math.abs(secId.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7));
          const isCenterRoad = (x === 3 || x === 4);
          if (isCenterRoad && y >= 2 && y <= 11) hasRoad = true;

          // 중앙 거점 구조물
          if ((x === 3 || x === 4) && (y === 6 || y === 7)) {
            terrain = 'plain';
            structure = (hash % 2 === 0) ? 'city' : 'village';
            name = (structure === 'city') ? `${sectorName} 중앙 요새` : `${sectorName} 전초 기지`;
            defBonus = (structure === 'city') ? 0.40 : 0.25;
            isSafe = true;
            isCity = (structure === 'city');
            terrainIcon = (structure === 'city') ? '🏰' : '🏡';
          } else {
            const tileSeed = (hash + x * 13 + y * 29) % 100;
            if (tileSeed < 20) {
              terrain = 'forest';
              name = '울창한 수림';
              defBonus = 0.20;
              terrainIcon = '🌲';
            } else if (tileSeed < 38) {
              terrain = 'hill';
              name = '고지대 능선';
              defBonus = 0.35;
              terrainIcon = '⛰️';
            } else if (tileSeed < 44 && (x === 0 || x === 7)) {
              terrain = 'mountain';
              name = '외곽 암벽';
              defBonus = 0.50;
              terrainIcon = '🏔️';
            } else {
              terrain = 'plain';
              name = '평야';
              defBonus = 0.0;
              terrainIcon = '🌱';
            }
          }
        }

        const tileObj = {
          x,
          y,
          terrain,
          type: terrain,
          name,
          defBonus,
          isSafe,
          isCity,
          terrainIcon,
          hasRoad,
          structure,
          units: []
        };

        if (hasRoad) {
          roads.push({ x, y });
        }
        if (structure) {
          structures.push({ x, y, type: structure, name });
        }

        tiles.push(tileObj);
      }
    }

    // 기본 적군 배치 생성 (상단 구역 Y: 1 ~ 3)
    units.push({
      id: `enemy_${secId}_1`,
      name: `${sectorName} 정찰대`,
      owner: 'ENEMY',
      side: 'ENEMY',
      classType: 'MELEE',
      unitClass: 'MELEE',
      avatar: '👺',
      level: 1,
      hp: 100,
      maxHp: 100,
      atk: 42,
      def: 28,
      baseAP: 2,
      ap: 2,
      x: 3,
      y: 2,
      isDead: false
    });
    units.push({
      id: `enemy_${secId}_2`,
      name: `${sectorName} 궁병대`,
      owner: 'ENEMY',
      side: 'ENEMY',
      classType: 'ARCHER',
      unitClass: 'ARCHER',
      avatar: '🏹',
      level: 1,
      hp: 85,
      maxHp: 85,
      atk: 48,
      def: 22,
      baseAP: 2,
      ap: 2,
      x: 5,
      y: 1,
      isDead: false
    });
    units.push({
      id: `enemy_${secId}_3`,
      name: `${sectorName} 수비대장`,
      owner: 'ENEMY',
      side: 'ENEMY',
      classType: 'KNIGHT',
      unitClass: 'KNIGHT',
      avatar: '🛡️',
      level: 2,
      hp: 100,
      maxHp: 100,
      atk: 52,
      def: 40,
      baseAP: 3,
      ap: 3,
      x: 4,
      y: 3,
      isDead: false
    });

    const scenarioMapData = {
      sectorId: secId,
      name: sectorName,
      cols: GRID_COLS,
      rows: GRID_ROWS,
      tiles,
      roads,
      structures,
      units,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return scenarioMapData;
  }

  /**
   * Sanitizes and deserializes Firestore document payload into hydrated 8x14 scenario map.
   *
   * @param {Object} rawData - Firestore snapshot data
   * @param {string} fallbackSectorId - Fallback ID if not provided in doc
   * @returns {Object} Deserialized 8x14 map data object
   */
  function deserializeScenarioMapData(rawData, fallbackSectorId) {
    if (!rawData) return null;

    const sectorId = rawData.sectorId || rawData.id || fallbackSectorId || 'A-1';
    const cols = Number(rawData.cols) || GRID_COLS;
    const rows = Number(rawData.rows) || GRID_ROWS;

    const tiles = Array.isArray(rawData.tiles)
      ? rawData.tiles.map(t => {
          const spec = TERRAIN_SPECS[t.terrain || t.type] || TERRAIN_SPECS.plain;
          const terrain = t.terrain || t.type || 'plain';
          return {
            x: Number(t.x) || 0,
            y: Number(t.y) || 0,
            terrain: terrain,
            type: terrain,
            name: t.name || spec.name,
            defBonus: (typeof t.defBonus === 'number') ? t.defBonus : spec.defBonus,
            hasRoad: !!t.hasRoad,
            structure: t.structure || null,
            terrainIcon: t.terrainIcon || spec.icon,
            isCity: !!t.isCity,
            isSafe: !!t.isSafe,
            units: Array.isArray(t.units) ? t.units : []
          };
        })
      : [];

    return {
      sectorId: String(sectorId),
      name: rawData.name || `Sector ${sectorId}`,
      cols,
      rows,
      // 저장된 템플릿의 타일을 그대로 유지한다. 누락/불량 데이터는 호출부에서 실패 처리한다.
      tiles,
      roads: Array.isArray(rawData.roads) ? rawData.roads : [],
      structures: Array.isArray(rawData.structures) ? rawData.structures : [],
      units: Array.isArray(rawData.units) ? rawData.units : [],
      updatedAt: rawData.updatedAt || new Date().toISOString()
    };
  }

  /**
   * ■ 1. Dynamic Sector ID Map Loader
   * Asynchronously queries Firestore 'scenarioMaps' collection for the specified sectorId.
   * If found: deserializes 8x14 grid tiles, roads, structures, and unit placements into state.currentMapData.
   * If not found: runs generateDefaultSectorMap(sectorId) and mounts the baseline field.
   *
   * @param {string} sectorId - Sector ID (e.g., 'A-2', 'Sector_B1', 'C-3')
   * @returns {Promise<Object>} Loaded map data object
   */
  async function waitForFirebaseBridge(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (global.FirebaseBridge && typeof global.FirebaseBridge.loadScenarioMapFromFirestore === 'function') {
        if (global.FirebaseBridge.isReady || typeof global.FirebaseBridge.initAuth !== 'function') return true;
        try { await global.FirebaseBridge.initAuth(); } catch (e) {}
        if (global.FirebaseBridge.isReady) return true;
      }
      if (typeof global.loadScenarioMapFromFirestore === 'function') return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return !!(global.FirebaseBridge && typeof global.FirebaseBridge.loadScenarioMapFromFirestore === 'function');
  }

  async function loadAndRenderSectorMap(sectorId) {
    const targetSectorId = String(
      sectorId ||
      (global.state && (global.state.selectedSectorId || global.state.currentSector)) ||
      'A-1'
    );

    console.log(`🗺️ [SectorMapLoader] 섹터 [${targetSectorId}] 8x14 전술 맵 로드 시도...`);

    let loadedMapData = null;

    // 1. Firebase 모듈이 준비될 때까지 기다린 뒤 Firestore 조회
    try {
      const firebaseReady = await waitForFirebaseBridge(10000);
      if (!firebaseReady) {
        console.warn('[SectorMapLoader] Firebase Bridge 준비 시간 초과. 기본맵으로 즉시 대체하지 않습니다.');
      }

      if (typeof global.loadScenarioMapFromFirestore === 'function') {
        const cloudDoc = await global.loadScenarioMapFromFirestore(targetSectorId);
        if (cloudDoc && Array.isArray(cloudDoc.tiles) && cloudDoc.tiles.length > 0) {
          loadedMapData = deserializeScenarioMapData(cloudDoc, targetSectorId);
          console.log(`✅ [SectorMapLoader] Firestore 'scenarioMaps'에서 [${targetSectorId}] 맵 복원 완료`);
        }
      } else if (global.FirebaseBridge && typeof global.FirebaseBridge.loadScenarioMapFromFirestore === 'function') {
        const cloudDoc = await global.FirebaseBridge.loadScenarioMapFromFirestore(targetSectorId);
        if (cloudDoc && Array.isArray(cloudDoc.tiles) && cloudDoc.tiles.length > 0) {
          loadedMapData = deserializeScenarioMapData(cloudDoc, targetSectorId);
          console.log(`✅ [SectorMapLoader] FirebaseBridge로 [${targetSectorId}] 맵 복원 완료`);
        }
      }
    } catch (err) {
      console.warn(`⚠️ [SectorMapLoader] Firestore 조회 중 오류 발생 (기본 맵으로 대체):`, err);
    }

    // 2. Firestore가 일시적으로 준비되지 않았거나 문서가 없는 경우, 같은 브라우저에서 저장한 맵을 복구
    if (!loadedMapData) {
      try {
        const cached = localStorage.getItem(`slg_scenarioMap_${targetSectorId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.tiles) && parsed.tiles.length > 0) {
            loadedMapData = deserializeScenarioMapData(parsed, targetSectorId);
            console.log(`🗂️ [SectorMapLoader] localStorage에서 [${targetSectorId}] 저장 맵 복구 완료`);
          }
        }
      } catch (e) {}
    }

    // 3. 저장된 데이터가 없는 경우 (신규 섹터): 기본 8x14 타일 지형 자동 생성
    if (!loadedMapData) {
      console.log(`🌱 [SectorMapLoader] 저장된 데이터 없음 -> generateDefaultSectorMap('${targetSectorId}') 실행`);
      loadedMapData = generateDefaultSectorMap(targetSectorId);

      // 백그라운드에서 신규 섹터 초기 데이터를 Firestore에 자동 저장 (동기화)
      if (typeof global.saveScenarioMapToFirestore === 'function') {
        global.saveScenarioMapToFirestore(targetSectorId, loadedMapData).catch(() => {});
      }
    }

    // 3. 전술 필드 상태에 바인딩
    if (global.state) {
      global.state.selectedSectorId = targetSectorId;
      global.state.currentSector = targetSectorId;
      if (global.state.strategy) {
        global.state.strategy.selectedSectorId = targetSectorId;
      }
      global.state.currentMapData = loadedMapData;
      global.state.tiles = loadedMapData.tiles; // LEGACY: 미사용 파일
    }

    // 전역 tiles 변수 동기화
    if (Array.isArray(loadedMapData.tiles)) {
      global.tiles = loadedMapData.tiles;
    }

    // 4. 유닛 배치 동기화 (적군 및 아군 유닛 재배치)
    if (global.state) {
      // 적군 유닛 동기화: 맵에 지정된 적군 유닛이 있으면 필드에 배치
      if (Array.isArray(loadedMapData.units) && loadedMapData.units.length > 0) {
        const mapEnemies = loadedMapData.units.filter(u => u.owner === 'ENEMY' || u.side === 'ENEMY');
        if (mapEnemies.length > 0) {
          global.state.enemyUnits = mapEnemies.map(e => ({
            ...e,
            hp: e.hp || 100,
            maxHp: e.maxHp || 100,
            isDead: false
          }));
        }
      }

      // 아군 영웅 선봉 부대 배치: 8x14 그리드 하단부 (Y: 11~13) 안전 배치
      if (Array.isArray(global.state.playerUnits)) {
        const allyUnits = global.state.playerUnits.filter(u => !u.isDead);
        const deploySlots = [
          { x: 3, y: 12 }, { x: 4, y: 12 },
          { x: 2, y: 12 }, { x: 5, y: 12 },
          { x: 3, y: 13 }, { x: 4, y: 13 },
          { x: 2, y: 13 }, { x: 5, y: 13 },
          { x: 1, y: 12 }, { x: 6, y: 12 }
        ];
        allyUnits.forEach((unit, idx) => {
          const slot = deploySlots[idx % deploySlots.length];
          unit.x = slot.x;
          unit.y = slot.y;
        });
      }
    }

    // 5. 에디터 컨트롤러와도 실시간 연동 (에디터가 열려있을 때 즉시 반영)
    if (global.MapEditorController) {
      global.MapEditorController.currentSectorId = targetSectorId;
      global.MapEditorController.currentMapData = loadedMapData.tiles;
      if (typeof global.MapEditorController.renderSectorDropdown === 'function') {
        global.MapEditorController.renderSectorDropdown();
      }
    }

    // 6. 전술 필드 렌더링 호출
    renderTacticalSectorField(loadedMapData);

    if (typeof global.addLog === 'function') {
      global.addLog(`🗺️ [전술 필드 로드] [${targetSectorId}] 8x14 전술 지형 및 시나리오 맵이 성공적으로 로드되었습니다.`, 'gold');
    }

    return loadedMapData;
  }

  /**
   * ■ 3. Universal Scenario Map Saver
   * Saves the active sector map to Firestore under 'scenarioMaps' collection.
   * Document key is dynamically bound to state.selectedSectorId (or editingSectorId),
   * strictly avoiding any hardcoded keys.
   *
   * @param {string} [customSectorId] - Optional sector ID override
   * @returns {Promise<boolean>}
   */
  async function saveCurrentSectorMap(customSectorId) {
    const targetSectorId = String(
      customSectorId ||
      (global.state && (global.state.selectedSectorId || global.state.editingSectorId || global.state.currentSector)) ||
      (global.MapEditorController && global.MapEditorController.currentSectorId) ||
      'A-1'
    );

    console.log(`💾 [SectorMapSaver] 섹터 [${targetSectorId}] 8x14 맵 데이터 Firestore 저장 시작...`);

    // 맵 데이터 추출 (state.currentMapData, MapEditorController, 또는 tiles)
    let currentTiles = [];
    if (global.MapEditorController && Array.isArray(global.MapEditorController.currentMapData)) {
      currentTiles = global.MapEditorController.currentMapData;
    } else if (global.state && global.state.currentMapData && Array.isArray(global.state.currentMapData.tiles)) {
      currentTiles = global.state.currentMapData.tiles;
    } else if (Array.isArray(global.tiles)) {
      currentTiles = global.tiles;
    }

    if (currentTiles.length === 0) {
      console.warn(`⚠️ [SectorMapSaver] 저장할 타일 데이터가 없습니다.`);
      return false;
    }

    const roads = [];
    const structures = [];
    const cleanTiles = currentTiles.map(t => {
      if (t.hasRoad) roads.push({ x: t.x, y: t.y });
      if (t.structure) structures.push({ x: t.x, y: t.y, type: t.structure, name: t.name });
      return {
        x: Number(t.x) || 0,
        y: Number(t.y) || 0,
        terrain: t.terrain || t.type || 'plain',
        type: t.terrain || t.type || 'plain',
        name: t.name || '평야',
        defBonus: Number(t.defBonus) || 0,
        hasRoad: !!t.hasRoad,
        structure: t.structure || null,
        terrainIcon: t.terrainIcon || '🌱',
        isCity: !!t.isCity,
        isSafe: !!t.isSafe,
        units: Array.isArray(t.units) ? t.units : []
      };
    });

    const activeUnits = [];
    if (global.state) {
      if (Array.isArray(global.state.enemyUnits)) {
        global.state.enemyUnits.forEach(u => activeUnits.push({ ...u, side: 'ENEMY', owner: 'ENEMY' }));
      }
      if (Array.isArray(global.state.playerUnits)) {
        global.state.playerUnits.forEach(u => activeUnits.push({ ...u, side: 'ALLY', owner: 'PLAYER' }));
      }
    }

    const worldSector = (typeof global.WORLD_SECTORS !== 'undefined' && global.WORLD_SECTORS[targetSectorId])
      ? global.WORLD_SECTORS[targetSectorId]
      : null;

    const payload = {
      sectorId: targetSectorId,
      name: worldSector ? worldSector.name : `섹터 ${targetSectorId}`,
      cols: GRID_COLS,
      rows: GRID_ROWS,
      tiles: cleanTiles,
      roads,
      structures,
      units: activeUnits,
      updatedAt: new Date().toISOString()
    };

    let saveSuccess = false;

    // 브라우저 로컬에도 즉시 보관해 Firebase 초기화 지연 시에도 같은 브라우저에서 맵이 사라지지 않도록 함
    try { localStorage.setItem(`slg_scenarioMap_${targetSectorId}`, JSON.stringify(payload)); } catch (e) {}

    // Firebase Bridge가 준비된 뒤 저장하여 '저장 완료'처럼 보이지만 실제 저장되지 않는 경로를 차단
    await waitForFirebaseBridge(10000);

    // 1. Firestore 'scenarioMaps' 컬렉션에 동적 키값으로 저장
    if (typeof global.saveScenarioMapToFirestore === 'function') {
      saveSuccess = await global.saveScenarioMapToFirestore(targetSectorId, payload);
    } else if (global.FirebaseBridge && typeof global.FirebaseBridge.saveScenarioMapToFirestore === 'function') {
      saveSuccess = await global.FirebaseBridge.saveScenarioMapToFirestore(targetSectorId, payload);
    } else if (typeof global.syncMapToFirestore === 'function') {
      saveSuccess = await global.syncMapToFirestore(`scenario_${targetSectorId}`, cleanTiles, `Sector ${targetSectorId}`);
    }

    if (saveSuccess) {
      // 로컬 메모리 상태 동기화
      if (global.state) {
        try { localStorage.setItem(`slg_scenarioMap_${targetSectorId}`, JSON.stringify(payload)); } catch (e) {}
        global.state.currentMapData = payload;
        global.state.selectedSectorId = targetSectorId;
        if (global.state.worldSectors) {
          const secObj = global.state.worldSectors.find(s => s.id === targetSectorId);
          if (secObj) secObj.scenarioMap = payload;
        }
      }

      if (typeof global.addLog === 'function') {
        global.addLog(`💾 [클라우드 저장 성공] 섹터 [${targetSectorId}] 8x14 전술 맵 데이터가 Firestore 'scenarioMaps'에 저장되었습니다.`, 'gold');
      }
      return true;
    } else {
      console.warn(`⚠️ [SectorMapSaver] Firestore 저장 실패`);
      return false;
    }
  }

  /**
   * Renders the 8x14 tactical sector field into the DOM container (#grid-map).
   * Dynamically adjusts grid rows to 14 and supports road/structure overlays.
   *
   * @param {Object} mapData - Scenario map data
   */
  function renderTacticalSectorField(mapData) {
    const mapEl = document.getElementById('grid-map');
    if (!mapEl) return;

    // 8x14 그리드 레이아웃 동적 보정
    mapEl.style.display = 'grid';
    mapEl.style.gridTemplateColumns = 'repeat(8, 1fr)';
    mapEl.style.gridTemplateRows = 'repeat(14, 1fr)';
    mapEl.classList.add('grid-8x14');

    // UI 헤더 섹터 서브태그 업데이트
    const subTagEl = document.getElementById('ui-sector-sub-tag');
    if (subTagEl && mapData) {
      const secName = mapData.name || mapData.sectorId;
      subTagEl.textContent = `SECTOR ${mapData.sectorId}: ${secName.toUpperCase()}`;
    }

    // game.js의 기본 renderGrid() 및 전장 인터페이스 갱신
    if (typeof global.renderGrid === 'function') {
      global.renderGrid();
    }
    if (typeof global.renderHeaderAndCard === 'function') {
      global.renderHeaderAndCard();
    }
    if (typeof global.updateFullShotOverlay === 'function') {
      global.updateFullShotOverlay();
    }
  }

  // ========================================================================
  // Global & Modular Namespace Registration
  // ========================================================================
  const DBManager = {
    GRID_COLS,
    GRID_ROWS,
    TERRAIN_SPECS,
    generateDefaultSectorMap,
    deserializeScenarioMapData,
    loadAndRenderSectorMap,
    saveCurrentSectorMap,
    renderTacticalSectorField
  };

  global.DBManager = DBManager;
  global.generateDefaultSectorMap = generateDefaultSectorMap;
  global.loadAndRenderSectorMap = loadAndRenderSectorMap;
  global.saveCurrentSectorMap = saveCurrentSectorMap;
  global.renderTacticalSectorField = renderTacticalSectorField;

})(typeof window !== 'undefined' ? window : globalThis);
