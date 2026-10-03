/**
 * mapSchema.js — 로그라이크 맵 시스템 2단계: 데이터 구조 확정
 * ==========================================================================
 *
 * 이 파일이 하는 일은 딱 하나다.
 *   "Sector / TacticalMapTemplate / CurrentBattle 세 개념을 완전히 분리하고,
 *    그 경계를 넘나드는 유일한 통로(factory/validate 함수)를 제공한다."
 *
 * 지금까지의 버그(맵 저장 안 됨 / 에디터와 실전투 맵이 다름 / 기본맵으로 몰래 대체됨)의
 * 근본 원인은 "부여 평야(A-1)"라는 하나의 단어가 코드 안에서
 *   - 전략맵 노드 이름이기도 하고
 *   - Supabase 레코드 키이기도 하고
 *   - 지금 그려지고 있는 타일 배열(LEGACY: state.tiles)이기도 했기 때문이다.
 *
 * 이 모듈 밖에서는 어떤 코드도 아래 세 형태를 손으로 조립하지 않는다.
 * 에디터(civ4-editor.js), 영속화(supabase-bridge.js), 전투 진입(game.js의
 * enterEncounter)은 전부 이 파일이 내보내는 함수를 거쳐서만 데이터를 주고받는다.
 *
 * 데이터 흐름은 단방향이다:
 *
 *   Sector (전략, WORLD_SECTORS)
 *        ↓  defaultTemplateId
 *   TacticalMapTemplate (에디터 설계도, Supabase 'tacticalMapTemplates')  +  Seed
 *        ↓  MapSchema.createCurrentBattle()
 *   CurrentBattle.map (실제 전투에서 쓰는 단 하나의 기준 데이터)
 *        ↓
 *   전술 렌더러 (state.currentBattle.map만 본다)
 *
 * --------------------------------------------------------------------------
 * @typedef {{x:number, y:number}} Point
 *
 * @typedef {Object} Sector                 // 전략맵의 '장소'. 타일 정보를 절대 갖지 않는다.
 * @property {string} id                    // 예: "A-1"
 * @property {string} name                  // 예: "벨른 평원"
 * @property {string} [defaultTemplateId]   // 이 섹터가 기본으로 쓸 TacticalMapTemplate id
 * @property {string[]} [encounterPool]     // 로그라이크 노드 생성 시 뽑을 인카운터 유형들
 *
 * @typedef {Object} TacticalMapTemplate    // 에디터가 저장하는 '설계도'. 진행 중인 전투 상태를 갖지 않는다.
 * @property {string} id                    // 예: "A-1" 또는 "A-1-forest"
 * @property {number} width
 * @property {number} height
 * @property {Array}  tiles                 // width*height 길이
 * @property {{player:Point[], enemy:Point[]}} spawnPoints
 * @property {Object} metadata              // name/terrain/roads/structures/units 등 부가 정보
 * @property {string|null} updatedAt
 *
 * @typedef {Object} CurrentBattle          // 지금 진행 중인 '실전 인스턴스'. 저장(템플릿)하지 않는다.
 * @property {string} id                    // 예: "enc-00123" (전투 진입마다 1씩 증가)
 * @property {string} nodeId
 * @property {string} sectorId
 * @property {string} templateId
 * @property {string|null} seed
 * @property {'battle'|'elite'|'event'|'boss'} type
 * @property {{width:number, height:number, tiles:Array}} map   // 전술 렌더러가 참조할 유일한 기준
 * @property {Array} enemies                // 이 전투에 스폰된 적 유닛 목록 (템플릿 원본과 별개의 사본)
 * @property {Array<{type:string, amount:number}>} rewards  // 이 전투를 이기면 받을 보상 (seed로 결정 — 같은 seed면 항상 같은 보상)
 * @property {'active'|'won'|'lost'} status
 * @property {string} createdAt
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const DEFAULT_TEMPLATE_WIDTH = 8;
  const DEFAULT_TEMPLATE_HEIGHT = 14;

  // ==========================================================================
  // 1. Sector — 전략맵 지역 정보
  // ==========================================================================

  /**
   * Sector 객체에 타일 데이터가 섞여 들어오는 구조적 오염을 방지한다.
   * (지금 당장 버그를 고치는 함수가 아니라, "역할 분리"를 코드로 강제하는 안전장치.)
   */
  function validateSector(sector) {
    const errors = [];
    if (!sector || typeof sector !== 'object') {
      return { valid: false, errors: ['sector 객체가 아닙니다.'] };
    }
    if (!sector.id) errors.push('id 누락');
    if (!sector.name) errors.push('name 누락');
    ['tiles', 'width', 'height', 'cols', 'rows'].forEach((forbidden) => {
      if (forbidden in sector) {
        errors.push(`Sector에는 '${forbidden}' 필드가 있으면 안 됩니다 (TacticalMapTemplate의 책임입니다).`);
      }
    });
    return { valid: errors.length === 0, errors };
  }

  function getSector(sectorId) {
    const table = global.WORLD_SECTORS || {};
    return table[sectorId] || null;
  }

  /**
   * Sector가 사용할 TacticalMapTemplate id를 해석한다.
   * 명시적 defaultTemplateId가 없으면 지금까지의 관례대로 sectorId 자체를 템플릿 id로 쓴다
   * (1:1 매핑, 하위호환). 나중에 A-1-forest 같은 복수 템플릿을 붙일 때 defaultTemplateId만
   * 바꾸면 되고 Sector의 나머지 필드는 건드릴 필요가 없다.
   */
  function resolveDefaultTemplateId(sectorId) {
    const sec = getSector(sectorId);
    return (sec && sec.defaultTemplateId) || String(sectorId);
  }

  // ==========================================================================
  // 2. TacticalMapTemplate — 에디터 산출물(설계도)
  // ==========================================================================

  /**
   * Supabase 등에서 온 원본 문서(과거 포맷: sectorId/cols/rows/tiles/roads/
   * structures/units)든, 신규 포맷(id/width/height/spawnPoints/metadata)이든 전부 받아서
   * canonical TacticalMapTemplate 형태로 변환한다.
   *
   * ⚠️ 이 함수를 거치지 않은 원본 객체를 state.currentBattle.map에 직접 넣지 않는다.
   *
   * @param {Object} raw
   * @param {string} [fallbackId]
   * @returns {TacticalMapTemplate|null}
   */
  // 배열 두 후보 중 먼저 유효한 배열을 얕게 복사해 돌려준다.
  function pickList(primary, secondary) {
    const src = Array.isArray(primary) ? primary : (Array.isArray(secondary) ? secondary : []);
    return src.map((item) => ({ ...item }));
  }

  function normalizeTacticalMapTemplate(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;

    const id = String(raw.id || raw.sectorId || raw.templateId || fallbackId || '');
    const width = Number(raw.width || raw.cols) || DEFAULT_TEMPLATE_WIDTH;
    const height = Number(raw.height || raw.rows) || DEFAULT_TEMPLATE_HEIGHT;

    const tiles = Array.isArray(raw.tiles) ? raw.tiles.map((t) => ({ ...t })) : [];

    const rawSpawn = raw.spawnPoints && typeof raw.spawnPoints === 'object' ? raw.spawnPoints : null;
    const spawnPoints = {
      player: rawSpawn && Array.isArray(rawSpawn.player) ? rawSpawn.player.map((p) => ({ ...p })) : [],
      enemy: rawSpawn && Array.isArray(rawSpawn.enemy) ? rawSpawn.enemy.map((p) => ({ ...p })) : []
    };

    return {
      id,
      width,
      height,
      tiles,
      spawnPoints,
      metadata: {
        name: raw.name || (raw.metadata && raw.metadata.name) || `Sector ${id}`,
        terrain: (raw.metadata && raw.metadata.terrain) || null,
        // 전술 화면 배경 일러스트 경로 (예: 'assets/tactical/meadow-road.jpg'). 그리드 전체에 늘려 깔고
        // 타일 지형은 이 그림에 맞춰 에디터에서 칠한다. 없으면 기존처럼 단색 타일로 그린다.
        background: raw.background || (raw.metadata && raw.metadata.background) || null,
        // 이 함수는 "멱등"이어야 한다: 에디터/DB 원본(raw.roads/structures/units)뿐 아니라
        // 이미 정규화된 템플릿(raw.metadata.roads/structures/units)을 다시 넣어도 같은 결과가 나와야 한다.
        // (enterEncounter가 한 번, generateBattleMap이 한 번 더 정규화한다 — 여기서 units를 잃으면 에디터가 배치한 적이 사라진다.)
        roads: pickList(raw.roads, raw.metadata && raw.metadata.roads),
        structures: pickList(raw.structures, raw.metadata && raw.metadata.structures),
        // 템플릿에 미리 박아둔 적/유닛 배치. 실제 전투 유닛 상태(hp, 턴 등)는 여기 두지 않는다.
        units: pickList(raw.units, raw.metadata && raw.metadata.units)
      },
      updatedAt: raw.updatedAt || null,

      // ---- 하위호환 별칭 -----------------------------------------------------
      // 레거시 코드(civ4-editor.js 일부, 전술 렌더러)가 cols/rows/sectorId를
      // 직접 읽는 동안만 유지한다. 새 코드는 이 별칭에 의존하지 말 것.
      // LEGACY: (로드맵 7~8단계: state.tiles 완전 제거 시점에 함께 정리 예정)
      sectorId: id,
      cols: width,
      rows: height
    };
  }

  /**
   * @param {TacticalMapTemplate} template
   * @returns {{valid:boolean, errors:string[]}}
   */
  function validateTacticalMapTemplate(template) {
    const errors = [];
    if (!template || typeof template !== 'object') {
      return { valid: false, errors: ['template 객체가 아닙니다.'] };
    }
    if (!template.id) errors.push('id 누락');
    if (!Number.isFinite(template.width) || template.width <= 0) errors.push('width 값이 올바르지 않습니다.');
    if (!Number.isFinite(template.height) || template.height <= 0) errors.push('height 값이 올바르지 않습니다.');
    if (!Array.isArray(template.tiles) || template.tiles.length === 0) {
      errors.push('tiles 배열이 비어 있습니다.');
    } else if (template.tiles.length !== template.width * template.height) {
      errors.push(
        `tiles 길이(${template.tiles.length})가 width*height(${template.width * template.height})와 일치하지 않습니다.`
      );
    }
    // CurrentBattle 전용 필드가 설계도 최상위에 섞여 들어오는 구조적 오염을 방지한다.
    if ('seed' in template) errors.push(`TacticalMapTemplate에는 'seed'가 있으면 안 됩니다 (CurrentBattle의 책임입니다).`);
    if ('status' in template) errors.push(`TacticalMapTemplate에는 'status'가 있으면 안 됩니다 (CurrentBattle의 책임입니다).`);
    return { valid: errors.length === 0, errors };
  }

  function createBlankTacticalMapTemplate(id, width, height) {
    const w = width || DEFAULT_TEMPLATE_WIDTH;
    const h = height || DEFAULT_TEMPLATE_HEIGHT;
    const tiles = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tiles.push({ x, y, terrain: 'plain', hasRoad: false, structure: null, units: [], isSpawnPlayer: false, isSpawnEnemy: false });
      }
    }
    return normalizeTacticalMapTemplate({ id, width: w, height: h, tiles }, id);
  }

  /**
   * 에디터가 타일 위에 직접 찍은 스폰 마커(tile.isSpawnPlayer / tile.isSpawnEnemy)를
   * template.spawnPoints.{player,enemy} 좌표 배열로 뽑아낸다.
   * 저장 직전, 에디터 밖으로 나가는 유일한 변환 지점이다.
   * @param {Array} tiles
   * @returns {{player:Point[], enemy:Point[]}}
   */
  function deriveSpawnPointsFromTiles(tiles) {
    const player = [];
    const enemy = [];
    (tiles || []).forEach((t) => {
      if (!t) return;
      if (t.isSpawnPlayer) player.push({ x: t.x, y: t.y });
      if (t.isSpawnEnemy) enemy.push({ x: t.x, y: t.y });
    });
    return { player, enemy };
  }

  /**
   * 반대 방향: Supabase/템플릿에 저장된 spawnPoints 좌표 배열을 타일 위 마커로 되돌린다.
   * 에디터가 기존 템플릿을 다시 불러와 편집할 때, 스폰 지점이 화면에 그대로 보이도록 한다.
   * @param {Array} tiles
   * @param {{player:Point[], enemy:Point[]}} spawnPoints
   * @returns {Array} tiles (동일 배열을 그대로 반환, 참조상 mutate)
   */
  function applySpawnPointsToTiles(tiles, spawnPoints) {
    const list = tiles || [];
    list.forEach((t) => { if (t) { t.isSpawnPlayer = false; t.isSpawnEnemy = false; } });
    const sp = spawnPoints || { player: [], enemy: [] };
    (sp.player || []).forEach((p) => {
      const t = list.find((tile) => tile && tile.x === p.x && tile.y === p.y);
      if (t) t.isSpawnPlayer = true;
    });
    (sp.enemy || []).forEach((p) => {
      const t = list.find((tile) => tile && tile.x === p.x && tile.y === p.y);
      if (t) t.isSpawnEnemy = true;
    });
    return list;
  }

  /**
   * 타일 배열에서 지형 비율(%)을 계산한다. 합계는 항상 100(최대잔여법).
   *   plain  = 평야
   *   forest = 숲
   *   hill   = 산 + 암벽
   *   water  = 강 + 바다
   * 전략 화면의 지형 막대가 하드코딩 숫자 대신 이 값을 쓴다 (에디터에서 맵을 고치면 같이 바뀐다).
   * @param {Array} tiles
   * @returns {{plain:number, forest:number, hill:number, water:number}|null} 타일이 없으면 null
   */
  function computeTerrainComposition(tiles) {
    if (!Array.isArray(tiles) || tiles.length === 0) return null;
    const groupOf = { plain: 'plain', forest: 'forest', hill: 'hill', mountain: 'hill', river: 'water', sea: 'water' };
    const keys = ['plain', 'forest', 'hill', 'water'];
    const counts = { plain: 0, forest: 0, hill: 0, water: 0 };
    tiles.forEach((t) => {
      const g = groupOf[(t && (t.terrain || t.type)) || 'plain'] || 'plain';
      counts[g]++;
    });
    const total = tiles.length;
    const raw = keys.map((k) => ({ k, v: (counts[k] / total) * 100 }));
    const out = {};
    let used = 0;
    raw.forEach((r) => { out[r.k] = Math.floor(r.v); used += out[r.k]; });
    raw.slice().sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))
      .slice(0, 100 - used).forEach((r) => { out[r.k]++; });
    return out;
  }

  // 타일 방어 보너스의 단일 기준표. 에디터/DB 타일에는 defBonus가 저장되지 않으므로
  // 전투 계산과 타일 뱃지는 항상 terrain + structure로 여기서 계산한다. (값은 합산)
  const TILE_DEFENSE = {
    terrain: { plain: 0, forest: 0.20, hill: 0.40, mountain: 0.50, river: -0.10, sea: 0 },
    structure: { city: 0.50, village: 0.25, tree: 0.10, resource: 0 }
  };

  /**
   * @param {{terrain?:string, type?:string, structure?:string|null}} tile
   * @returns {number} 방어 보너스 비율 (0.4 = +40%). 타일이 없으면 0.
   */
  function getTileDefBonus(tile) {
    if (!tile) return 0;
    const terrain = String(tile.terrain || tile.type || 'plain').toLowerCase();
    const structure = tile.structure ? String(tile.structure).toLowerCase() : null;
    return (TILE_DEFENSE.terrain[terrain] || 0) + ((structure && TILE_DEFENSE.structure[structure]) || 0);
  }

  // 지형별 진입 AP의 단일 기준표. 물(강·바다)과 암벽은 들어가기 어려워 AP를 더 쓴다.
  // 기본 AP 2인 유닛은 이런 칸에 들어가면 그 턴 이동이 끝난다. 도로(다리)가 깔린 칸은 항상 1.
  const TERRAIN_MOVE_COST = { plain: 1, forest: 1, hill: 1, river: 2, sea: 2, mountain: 2 };

  /**
   * @param {{terrain?:string, type?:string, hasRoad?:boolean}} tile
   * @returns {number} 이 칸으로 들어갈 때 드는 AP
   */
  function getTileMoveCost(tile) {
    if (!tile) return 1;
    if (tile.hasRoad) return 1;
    const terrain = String(tile.terrain || tile.type || 'plain').toLowerCase();
    return TERRAIN_MOVE_COST[terrain] || 1;
  }

  // ==========================================================================
  // 3. Seed 기반 결정론적 난수 생성기 (8단계)
  // ==========================================================================

  /**
   * 동일 seed 문자열을 넣으면 항상 동일한 순서의 난수를 내는 LCG 기반 PRNG.
   * Math.random()은 재현 불가능하므로 맵/적/보상 생성에는 절대 쓰지 않는다.
   */
  class SeededRandom {
    constructor(seedString) {
      // 난수 알고리즘(Mulberry32)은 seedEngine.js 한 곳에만 둔다. 같은 seed면 항상 같은 순서.
      if (!global.SeedEngine) {
        throw new Error('[MapSchema] SeedEngine을 찾을 수 없습니다. index.html에서 seedEngine.js를 mapSchema.js보다 먼저 로드하세요.');
      }
      this._rng = global.SeedEngine.createRNG(seedString);
    }

    /** @returns {number} 0 이상 1 미만의 난수 */
    next() {
      return this._rng();
    }

    /** @returns {number} min~max(양끝 포함) 정수 */
    rangeInt(min, max) {
      if (max <= min) return min;
      return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /** @returns {*} 배열에서 하나를 뽑는다 (빈 배열이면 undefined) */
    pick(array) {
      if (!Array.isArray(array) || array.length === 0) return undefined;
      return array[Math.floor(this.next() * array.length)];
    }

    /** @returns {Array} 원본을 건드리지 않는 Fisher-Yates 셔플 사본 */
    shuffle(array) {
      return global.SeedEngine.shuffleArray(array, this._rng);
    }
  }

  /** 전투 진입마다 새 시드를 만든다. 예: "A-1-849201" (버그 재현용으로 battle.seed에 기록됨) */
  function generateSeed(sectorId) {
    return global.SeedEngine.generateRandomSeed(String(sectorId || 'BATTLE'));
  }

  /** 적 유닛 원본(수동 배치 또는 생성기 산출)을 CurrentBattle.enemies 표준 형태로 정규화 */
  function normalizeBattleEnemy(u, index = 0) {
    return {
      ...u,
      id: u.id || `enemy-${index}`,
      owner: 'ENEMY',
      side: 'ENEMY',
      hp: Number(u.hp) || 100,
      maxHp: Number(u.maxHp) || Number(u.hp) || 100,
      isDead: false
    };
  }

  /**
   * 8단계 핵심: TacticalMapTemplate + Seed → 실제 전투에 쓸 tiles/spawnPoints/enemies.
   *
   * randomize:false(기본값)이면 템플릿을 깊은 복사만 해서 그대로 돌려준다.
   * (맵 에디터의 '테스트 플레이'와, 아직 이 옵션을 넘기지 않는 기존 호출부가 이 경로를 탄다 —
   *  "에디터에서 그린 그대로 나와야 한다"는 1차 목표를 계속 보장한다.)
   *
   * randomize:true일 때만 같은 seed에 대해 결정론적으로:
   *   - 빈 평지 타일 일부를 숲/장애물로 변형하고
   *   - 빈 평지 타일에 보물 상자를 배치하고
   *   - (에디터가 적을 직접 배치하지 않은 템플릿에 한해) enemyPool에서 적을 뽑아 spawnPoints.enemy에 배치한다.
   * 에디터가 직접 배치한 적(template.metadata.units 중 owner/side === 'ENEMY')이 있으면
   * 그건 작가가 의도한 고정 전투(보스전 등)로 보고 절대 랜덤으로 덮어쓰지 않는다.
   *
   * @param {TacticalMapTemplate} tpl - 이미 normalizeTacticalMapTemplate()을 거친 템플릿
   * @param {string} seed
   * @param {{randomize?:boolean, enemyPool?:Array, terrainNoiseRate?:number, chestCountRange?:[number,number], enemyCountRange?:[number,number]}} [options]
   * @returns {{tiles:Array, spawnPoints:{player:Array,enemy:Array}, enemies:Array}}
   */
  function generateBattleMapWithSeed(tpl, seed, options = {}) {
    const tiles = JSON.parse(JSON.stringify(tpl.tiles));
    const spawnPoints = JSON.parse(JSON.stringify(tpl.spawnPoints || { player: [], enemy: [] }));

    const manualEnemies = Array.isArray(tpl.metadata && tpl.metadata.units)
      ? tpl.metadata.units.filter((u) => u && (u.owner === 'ENEMY' || u.side === 'ENEMY'))
      : [];

    const randomize = options.randomize === true;
    if (!randomize) {
      return { tiles, spawnPoints, enemies: manualEnemies.map(normalizeBattleEnemy) };
    }

    const rng = new SeededRandom(seed || `${tpl.id}-static`);
    const terrainNoiseRate = typeof options.terrainNoiseRate === 'number' ? options.terrainNoiseRate : 0.15;
    // 에디터 타일은 terrain 필드를 쓴다(구버전 데이터는 type). 읽기/쓰기 모두 같은 필드로 맞춘다.
    const terrainOf = (t) => t.terrain || t.type || 'plain';
    const setTerrain = (t, v) => { t.terrain = v; if ('type' in t) t.type = v; };

    // 스폰 지점/수동 배치 적이 서 있는 칸은 지형 변형 대상에서 제외한다.
    const reserved = new Set([
      ...spawnPoints.player.map((p) => `${p.x},${p.y}`),
      ...spawnPoints.enemy.map((p) => `${p.x},${p.y}`),
      ...manualEnemies.map((u) => `${u.x},${u.y}`)
    ]);

    // [1] 지형 변형: 빈 평지 일부를 숲으로 (통행 불가 지형은 만들지 않는다 — 길이 막히는 맵 방지)
    // 도로/구조물이 있는 칸은 작가가 의도한 자리이므로 건드리지 않는다.
    tiles.forEach((tile) => {
      if (terrainOf(tile) === 'plain' && !tile.hasRoad && !tile.structure
          && !reserved.has(`${tile.x},${tile.y}`) && rng.next() < terrainNoiseRate) {
        setTerrain(tile, 'forest');
        // 배경 그림에는 없는 숲이므로, 렌더러가 이 칸에 나무 스프라이트를 덧그려 그림과 판정을 맞춘다.
        tile.decor = 'tree';
      }
    });

    // [2] 보물 상자: 빈 평지에 0~2개
    const emptyTiles = tiles.filter((t) => terrainOf(t) === 'plain' && !t.structure && !t.object && !reserved.has(`${t.x},${t.y}`));
    const [chestMin, chestMax] = options.chestCountRange || [0, 2];
    const chestCount = Math.min(emptyTiles.length, rng.rangeInt(chestMin, chestMax));
    for (let i = 0; i < chestCount; i++) {
      const idx = rng.rangeInt(0, emptyTiles.length - 1);
      const targetTile = emptyTiles.splice(idx, 1)[0];
      targetTile.object = { id: `chest_${i}`, type: 'treasure_chest', looted: false };
    }

    // [2.5] 적 스폰 지점이 하나도 없는 템플릿: 풀에서 뽑을 적을 세울 자리가 없으므로 seed로 자리를 고른다.
    //       (고정 적이 이미 배치된 템플릿은 작가가 의도한 전투이므로 건드리지 않는다.)
    //       플레이어 스폰에서 멀리 떨어진 빈 평지/숲 칸 중에서 고른다.
    const poolForSpawn = Array.isArray(options.enemyPool) ? options.enemyPool : [];
    if (spawnPoints.enemy.length === 0 && manualEnemies.length === 0 && poolForSpawn.length > 0) {
      const playerYs = spawnPoints.player.map((p) => p.y);
      const avgY = playerYs.length ? playerYs.reduce((a, b) => a + b, 0) / playerYs.length : tpl.height;
      const farFromPlayers = (t) => spawnPoints.player.every((p) => Math.abs(p.x - t.x) + Math.abs(p.y - t.y) >= 4);
      const open = tiles.filter((t) => ['plain', 'forest'].includes(terrainOf(t)) && !t.structure && !t.object && !reserved.has(`${t.x},${t.y}`) && farFromPlayers(t));
      const farSide = open.filter((t) => Math.abs(t.y - avgY) >= tpl.height * 0.3);
      const candidates = farSide.length >= 2 ? farSide : open;
      const [dMin, dMax] = options.enemyCountRange || [2, 4];
      const n = Math.min(candidates.length, rng.rangeInt(dMin, Math.max(dMin, dMax)));
      spawnPoints.enemy = rng.shuffle(candidates).slice(0, n).map((t) => ({ x: t.x, y: t.y }));
      if (n > 0) applySpawnPointsToTiles(tiles, spawnPoints);
    }

    // [3] 적 스폰 위치: 템플릿의 enemy 스폰 후보 중 일부만 seed로 골라 이번 전투에 실제로 쓴다.
    // (템플릿 원본은 건드리지 않는다 — 위에서 깊은 복사한 사본만 줄인다.)
    if (spawnPoints.enemy.length > 1) {
      const [eMin, eMax] = options.enemyCountRange || [Math.max(1, Math.ceil(spawnPoints.enemy.length / 2)), spawnPoints.enemy.length];
      const keep = Math.min(spawnPoints.enemy.length, rng.rangeInt(eMin, Math.max(eMin, eMax)));
      spawnPoints.enemy = rng.shuffle(spawnPoints.enemy).slice(0, keep);
      // 타일 위 스폰 마커도 실제 사용하는 자리와 일치시킨다.
      applySpawnPointsToTiles(tiles, spawnPoints);
    }

    let enemies;
    if (manualEnemies.length > 0) {
      enemies = manualEnemies.map(normalizeBattleEnemy);
    } else {
      const enemyPool = Array.isArray(options.enemyPool) ? options.enemyPool : [];
      enemies = [];
      // enemyPool이 비어 있으면(= 아직 적 유닛 데이터 소스가 연결되지 않음) 조용히 빈 배열을 반환한다.
      // 지형/보물 랜덤화는 이미 적용됐으므로 맵 자체는 이 상태로도 매번 달라진다.
      if (enemyPool.length > 0 && spawnPoints.enemy.length > 0) {
        const availableSpawns = spawnPoints.enemy.slice();
        const enemyCount = availableSpawns.length;
        // 풀을 한 번 섞어 차례로 뽑는다: 풀이 스폰 수보다 크면 같은 캐릭터가 한 전투에 두 번 나오지 않는다.
        const shuffledPool = rng.shuffle(enemyPool);
        for (let i = 0; i < enemyCount; i++) {
          const spawnIdx = rng.rangeInt(0, availableSpawns.length - 1);
          const spawnPos = availableSpawns.splice(spawnIdx, 1)[0];
          const base = shuffledPool[i % shuffledPool.length] || {};
          enemies.push(normalizeBattleEnemy({
            ...base,
            id: `${base.id || base.type || 'enemy'}_${i + 1}`,
            x: spawnPos.x,
            y: spawnPos.y
          }, i));
        }
      }
    }

    return { tiles, spawnPoints, enemies };
  }

  // ==========================================================================
  // 4. CurrentBattle — 실전 인스턴스 (런타임 전용, Supabase에 템플릿으로 저장하지 않음)
  // ==========================================================================

  let _fallbackEncounterSeq = 0;

  /**
   * 10단계: 전투(Encounter) id를 만든다. 예: "enc-00123".
   * st(게임 state)가 있으면 st.encounterSeq를 1 올려서 쓰고, 없으면(에디터 미리보기 등)
   * 게임 state를 건드리지 않도록 모듈 내부 카운터를 쓴다.
   */
  function createEncounterId(st) {
    let n;
    if (st && typeof st === 'object') {
      st.encounterSeq = (Number(st.encounterSeq) || 0) + 1;
      n = st.encounterSeq;
    } else {
      n = ++_fallbackEncounterSeq;
    }
    return `enc-${String(n).padStart(5, '0')}`;
  }

  /**
   * 10단계: 이 전투의 보상 목록. 지형/적 생성과는 별개의 난수 흐름(`seed|rewards`)을 쓰므로
   * 보상 규칙을 바꿔도 같은 seed의 맵 모양은 그대로 유지된다.
   *
   * 골드 공식(적 수 × 100)과 리와인더 50%는 기존 승리 정산(calculateTacticalVictoryRewards)과
   * 같은 값이다. 다만 골드는 실제 격퇴 수 기준으로 정산되고, 리와인더 여부는 여기서 미리 정한
   * 결과를 승리 정산이 그대로 사용한다.
   *
   * @param {string} seed
   * @param {{enemyCount?:number, type?:string}} [ctx]
   * @returns {Array<{type:string, amount:number}>}
   */
  function generateEncounterRewards(seed, ctx = {}) {
    const rng = new SeededRandom(`${seed}|rewards`);
    const enemyCount = Math.max(1, Number(ctx.enemyCount) || 0);
    // 11단계: 노드 타입에 따른 보상 배율. 정예 x1.5, 보스 x2 (일반 전투는 기존 공식 그대로 적 수 x 100).
    const goldMultiplier = ctx.type === 'boss' ? 2 : ctx.type === 'elite' ? 1.5 : 1;
    const rewards = [{ type: 'gold', amount: Math.round(enemyCount * 100 * goldMultiplier) }];
    // 난수는 결과와 무관하게 항상 1번 소비한다 (뒤에 보상 종류가 늘어나도 앞쪽 결과가 흔들리지 않게).
    const rewinderRoll = rng.next();
    if (ctx.type === 'boss' || rewinderRoll < 0.5) rewards.push({ type: 'rewinder', amount: 1 });
    return rewards;
  }

  /**
   * 10단계: Encounter 객체를 만드는 유일한 조립 함수.
   * enterBattleWithSeed()(seedEngine.js)와 createCurrentBattle() 둘 다 이 함수로 끝낸다.
   * 필드 구성이 한 곳에만 있으므로 두 경로가 서로 다른 모양의 전투를 만들 수 없다.
   *
   * @returns {CurrentBattle}
   */
  function assembleEncounter({ seed, sectorId, nodeId = null, type = 'battle', templateId, map, enemies = [], state = null }) {
    const battleEnemies = Array.isArray(enemies) ? enemies : [];
    return {
      id: createEncounterId(state),
      nodeId: String(nodeId || sectorId),
      sectorId: String(sectorId),
      type,
      seed: String(seed),
      templateId,
      map,
      enemies: battleEnemies,
      rewards: generateEncounterRewards(seed, { enemyCount: battleEnemies.length, type }),
      status: 'active',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * TacticalMapTemplate(+ 선택적 seed)로부터 state.currentBattle에 들어갈 단일 객체를 만든다.
   * 전술 렌더러는 이 함수의 결과물, 그중에서도 오직 `.map` 필드만 바라봐야 한다.
   *
   * @param {{sectorId:string, template:(TacticalMapTemplate|Object), seed?:string|null, nodeId?:string, type?:string, randomize?:boolean, enemyPool?:Array}} args
   * @returns {CurrentBattle|null}
   */
  function createCurrentBattle({ sectorId, template, seed = null, nodeId = null, type = 'battle', randomize = false, enemyPool = [], state = null }) {
    if (!sectorId) return null;

    // 이미 정규화된 template이면 그대로, 아니면 여기서 한 번 더 정규화해 방어한다.
    const isAlreadyNormalized = template && typeof template.width === 'number' && Array.isArray(template.tiles) && template.metadata;
    const tpl = isAlreadyNormalized ? template : normalizeTacticalMapTemplate(template, sectorId);
    if (!tpl) return null;

    const check = validateTacticalMapTemplate(tpl);
    if (!check.valid) {
      console.error(`❌ [MapSchema] '${sectorId}' 템플릿이 유효하지 않아 CurrentBattle을 만들 수 없습니다:`, check.errors);
      return null;
    }

    const battleSeed = seed || `${sectorId}-${Date.now()}`;

    // 6+8단계: 템플릿과 전투 인스턴스는 완전히 독립된 객체여야 하고(깊은 복사),
    // randomize:true일 때만 같은 seed에 대해 결정론적으로 지형/보물/적이 변형된다.
    const generated = generateBattleMapWithSeed(tpl, battleSeed, { randomize, enemyPool });

    return assembleEncounter({
      seed: battleSeed,
      sectorId,
      nodeId,
      type,
      templateId: tpl.id,
      enemies: generated.enemies,
      state, // 에디터 미리보기처럼 state를 넘기지 않으면 게임의 encounterSeq는 건드리지 않는다.
      map: {
        width: tpl.width,
        height: tpl.height,
        tiles: generated.tiles,
        spawnPoints: generated.spawnPoints,
        // ---- 하위호환 별칭 ----
        cols: tpl.width,
        rows: tpl.height,
        sectorId: String(sectorId),
        name: tpl.metadata.name,
        background: tpl.metadata.background,
        roads: tpl.metadata.roads,
        structures: tpl.metadata.structures,
        units: tpl.metadata.units,
        updatedAt: tpl.updatedAt
      }
    });
  }

  /**
   * @param {CurrentBattle} battle
   * @returns {{valid:boolean, errors:string[]}}
   */
  function validateCurrentBattle(battle) {
    const errors = [];
    if (!battle || typeof battle !== 'object') return { valid: false, errors: ['battle 객체가 아닙니다.'] };
    if (!battle.id || !/^enc-/.test(String(battle.id))) errors.push('id 형식 오류 (enc-00000)');
    if (!battle.sectorId) errors.push('sectorId 누락');
    if (!battle.nodeId) errors.push('nodeId 누락');
    if (!battle.templateId) errors.push('templateId 누락');
    if (!battle.seed) errors.push('seed 누락');
    if (!Array.isArray(battle.enemies)) errors.push('enemies가 배열이 아닙니다.');
    if (!Array.isArray(battle.rewards)) errors.push('rewards가 배열이 아닙니다.');
    if (!['active', 'won', 'lost'].includes(battle.status)) errors.push('status 값 오류');
    if (!battle.map || !Array.isArray(battle.map.tiles) || battle.map.tiles.length === 0) {
      errors.push('map.tiles가 비어 있습니다.');
    }
    return { valid: errors.length === 0, errors };
  }

  // ==========================================================================
  // Export
  // ==========================================================================
  const MapSchema = {
    DEFAULT_TEMPLATE_WIDTH,
    DEFAULT_TEMPLATE_HEIGHT,

    // Sector
    validateSector,
    getSector,
    resolveDefaultTemplateId,

    // TacticalMapTemplate
    normalizeTacticalMapTemplate,
    validateTacticalMapTemplate,
    createBlankTacticalMapTemplate,
    deriveSpawnPointsFromTiles,
    applySpawnPointsToTiles,
    computeTerrainComposition,
    TILE_DEFENSE,
    getTileDefBonus,
    TERRAIN_MOVE_COST,
    getTileMoveCost,

    // CurrentBattle
    createCurrentBattle,
    validateCurrentBattle,
    assembleEncounter,
    createEncounterId,
    generateEncounterRewards,

    // 8단계: Seed 기반 랜덤 생성기 (콘솔/테스트에서 직접 검증할 수 있도록 공개)
    SeededRandom,
    generateSeed,
    generateBattleMapWithSeed
  };

  global.MapSchema = MapSchema;
})(typeof window !== 'undefined' ? window : globalThis);
