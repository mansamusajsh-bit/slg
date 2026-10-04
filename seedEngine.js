/**
 * seedEngine.js — 9단계: Seed 시스템 (Deterministic Seed Engine + Battle Generator)
 *
 * 로드 순서: mapSchema.js보다 "먼저" 로드해야 한다 (MapSchema.SeededRandom이 SeedEngine을 쓴다).
 *
 * 규칙: 같은 (template, seed)는 항상 100% 같은 BattleMap을 만든다.
 *   - 전투 결과물 생성 경로에서는 Math.random()/Date.now()를 절대 쓰지 않는다.
 *   - 비결정적인 곳은 딱 두 군데뿐이다: generateRandomSeed()(새 seed를 뽑을 때)와
 *     Encounter의 id(순번)/createdAt(BattleMap 본체와 rewards에는 들어가지 않는다).
 *
 * 노출: window.SeedEngine, window.generateBattleMap, window.enterBattleWithSeed
 */
(function (global) {
  'use strict';

  // ==========================================================================
  // 1. SeedEngine — Mulberry32 PRNG
  // ==========================================================================
  const SeedEngine = {
    /**
     * 문자열 seed(예: "A1-927381")를 부호 없는 32비트 정수로 해싱한다 (FNV-1a).
     * 숫자가 들어와도 문자열로 바꿔서 처리한다.
     * @param {string|number} str
     * @returns {number} 0 ~ 4294967295
     */
    hashString(str) {
      const s = String(str == null ? '' : str);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    },

    /**
     * 같은 seed 문자열이면 항상 같은 순서의 값을 내는 난수 함수를 만든다.
     * @param {string|number} seedStr
     * @returns {function(): number} 호출할 때마다 0 이상 1 미만의 값
     */
    createRNG(seedStr) {
      let a = SeedEngine.hashString(seedStr);
      return function mulberry32() {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    /**
     * 새 seed 문자열을 만든다. 예: generateRandomSeed("A1") -> "A1-482910"
     * (이 함수만 Math.random()을 쓴다 — "어떤 seed로 할지"를 정하는 유일한 비결정 지점.)
     * @param {string} [prefix="SEED"]
     * @returns {string}
     */
    generateRandomSeed(prefix = 'SEED') {
      const n = Math.floor(100000 + Math.random() * 900000);
      return `${String(prefix || 'SEED')}-${n}`;
    },

    /**
     * Fisher-Yates 셔플. 원본을 바꾸지 않고 섞인 사본을 돌려준다.
     * @param {Array} array
     * @param {function(): number} rng - createRNG()가 돌려준 함수
     * @returns {Array}
     */
    shuffleArray(array, rng) {
      const out = Array.isArray(array) ? array.slice() : [];
      const next = typeof rng === 'function' ? rng : SeedEngine.createRNG('shuffle-default');
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    }
  };

  // ==========================================================================
  // 2. generateBattleMap(template, seed)
  // ==========================================================================

  /**
   * 템플릿에서 가로/세로를 읽는다. 에디터 포맷(width/height, cols/rows)과
   * 문서에 나온 포맷(grid.width/grid.height)을 모두 받는다.
   */
  function readGridSize(template) {
    const grid = template && template.grid ? template.grid : {};
    const width = Number(template && (template.width || template.cols || grid.width));
    const height = Number(template && (template.height || template.rows || grid.height));
    return { width, height };
  }

  /**
   * 템플릿 + seed -> 결정론적 BattleMap.
   *
   * 실제 지형 변형 / 보물 상자 / 적 스폰 추첨 알고리즘은 MapSchema.generateBattleMapWithSeed()가
   * 담당한다(에디터가 직접 배치한 고정 적 보존, 도로/구조물/스폰 칸 보호 규칙이 거기 있다).
   * 이 함수는 그 결과를 SeedEngine의 RNG로 돌려서(=MapSchema.SeededRandom이 SeedEngine을 씀)
   * BattleMap 형태로 조립한다. 알고리즘 구현이 두 벌로 갈라지지 않게 하려는 의도적인 구조다.
   *
   * @param {Object} template - 에디터/DB의 TacticalMapTemplate (원본이든 MapSchema로 정규화된 것이든 무방)
   * @param {string} seed
   * @param {{enemyPool?:Array, terrainNoiseRate?:number, chestCountRange?:[number,number], enemyCountRange?:[number,number], sectorId?:string}} [options]
   * @returns {Object|null} BattleMap (유효하지 않은 템플릿이면 null)
   */
  function generateBattleMap(template, seed, options = {}) {
    if (!template || typeof template !== 'object') {
      console.error('❌ [generateBattleMap] template이 없습니다.');
      return null;
    }
    if (!global.MapSchema || typeof global.MapSchema.generateBattleMapWithSeed !== 'function') {
      console.error('❌ [generateBattleMap] MapSchema를 찾을 수 없습니다 (mapSchema.js 로드 순서를 확인하세요).');
      return null;
    }
    const MapSchema = global.MapSchema;
    if (seed == null || String(seed) === '') {
      console.error('❌ [generateBattleMap] seed가 없습니다. 결정론적 생성에는 seed가 필수입니다.');
      return null;
    }
    const seedStr = String(seed);

    // 1) 정규화 + 검증. grid.width/grid.height 형식의 템플릿도 여기서 width/height로 맞춘다.
    const size = readGridSize(template);
    const sectorId = (options && options.sectorId) || template.sectorId || template.id;
    const tpl = MapSchema.normalizeTacticalMapTemplate(
      { ...template, width: size.width || template.width, height: size.height || template.height },
      String(template.id || sectorId || '')
    );
    const check = tpl ? MapSchema.validateTacticalMapTemplate(tpl) : { valid: false, errors: ['템플릿 정규화 실패'] };
    if (!check.valid) {
      console.error(`❌ [generateBattleMap] '${template.id}' 템플릿이 유효하지 않습니다:`, check.errors);
      return null;
    }

    // 2~5) 깊은 복사 + 스폰 풀 추첨 + 지형/오브젝트 배치 (원본 템플릿은 절대 수정되지 않는다)
    const generated = MapSchema.generateBattleMapWithSeed(tpl, seedStr, {
      randomize: true,
      enemyPool: (options && options.enemyPool) || [],
      terrainNoiseRate: options && options.terrainNoiseRate,
      chestCountRange: options && options.chestCountRange,
      enemyCountRange: options && options.enemyCountRange,
      enemyCount: options && options.enemyCount
    });

    // 배치된 오브젝트(보물 상자 등)를 좌표와 함께 평탄한 목록으로 뽑는다.
    const objects = [];
    generated.tiles.forEach((t) => {
      if (t && t.object) {
        objects.push({ ...t.object, x: t.x, y: t.y });
      }
    });

    const playerSpawns = generated.spawnPoints.player.map((p) => ({ x: p.x, y: p.y }));
    const enemySpawns = generated.spawnPoints.enemy.map((p) => ({ x: p.x, y: p.y }));

    return {
      templateId: tpl.id,
      seed: seedStr,
      grid: { width: tpl.width, height: tpl.height },
      tiles: generated.tiles,
      spawns: { player: playerSpawns, enemy: enemySpawns },
      objects,

      // ---- 현재 전술 엔진/렌더러 호환 필드 (전술 코드는 map.width/height/tiles/spawnPoints를 읽는다) ----
      width: tpl.width,
      height: tpl.height,
      cols: tpl.width,
      rows: tpl.height,
      spawnPoints: { player: playerSpawns.map((p) => ({ ...p })), enemy: enemySpawns.map((p) => ({ ...p })) },
      sectorId: String(sectorId || tpl.id),
      name: tpl.metadata.name,
      background: tpl.metadata.background,
      roads: tpl.metadata.roads,
      structures: tpl.metadata.structures,
      units: tpl.metadata.units,
      enemies: generated.enemies
    };
  }

  // ==========================================================================
  // 3. enterBattleWithSeed(template, customSeed) -> state.currentBattle
  // ==========================================================================

  /**
   * 전투 하나를 초기화해서 state.currentBattle에 넣는다.
   *
   * @param {Object} template - TacticalMapTemplate
   * @param {string|null} [customSeed] - 디버깅/리플레이용 seed. 없으면 새로 뽑는다.
   * @param {{sectorId?:string, nodeId?:string, type?:string, enemyPool?:Array, state?:Object}} [options]
   * @returns {Object|null} 만들어진 currentBattle = Encounter (실패하면 null, 이때 state는 건드리지 않는다)
   */
  function enterBattleWithSeed(template, customSeed = null, options = {}) {
    const st = (options && options.state)
      || (typeof state !== 'undefined' ? state : null)
      || global.state
      || null;
    if (!st) {
      console.error('❌ [Battle Engine] state 객체를 찾을 수 없습니다.');
      return null;
    }

    const sectorId = (options && options.sectorId) || (template && (template.sectorId || template.id)) || 'BATTLE';
    const hasCustom = customSeed != null && String(customSeed).trim() !== '';
    const seed = hasCustom ? String(customSeed).trim() : SeedEngine.generateRandomSeed(String(sectorId));

    const battleMap = generateBattleMap(template, seed, { enemyPool: options && options.enemyPool, enemyCount: options && options.enemyCount, sectorId });
    if (!battleMap) return null;

    // 10단계: Encounter 객체는 MapSchema.assembleEncounter() 한 곳에서만 조립한다.
    // (id "enc-00123", seed, templateId, map, enemies, rewards, status)
    const battle = global.MapSchema.assembleEncounter({
      seed,
      sectorId,
      nodeId: options && options.nodeId,
      type: (options && options.type) || 'battle',
      templateId: battleMap.templateId,
      map: battleMap,
      enemies: battleMap.enemies || [],
      state: st
    });

    st.currentBattle = battle;
    console.log(`[Battle Engine] Battle initialized with Seed: ${seed}`);
    return battle;
  }

  // ==========================================================================
  // Global binding
  // ==========================================================================
  global.SeedEngine = SeedEngine;
  global.generateBattleMap = generateBattleMap;
  global.enterBattleWithSeed = enterBattleWithSeed;
})(typeof window !== 'undefined' ? window : globalThis);
