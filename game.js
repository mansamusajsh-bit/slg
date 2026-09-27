    'use strict';

    /* --------------------------------------------------------------------------
       Data State & Declarations
       -------------------------------------------------------------------------- */
    const GRID_COLS = 8;
    const GRID_ROWS = 10;

    // 지휘관 스킬 데이터 명세 (Passive Data & Logic)
    const COMMANDER_SKILLS_DATA = {
      BearDown: {
        id: 'BearDown',
        name: '베어 다운 (BearDown)',
        desc: '첫 번째 유닛 공격력 +20% 증가',
        cost: 1,
        prerequisite: null
      },
      Precision: {
        id: 'Precision',
        name: '세밀한 타격 (Precision)',
        desc: '적 지형 방어 보너스 1개(타일 방어) 무시',
        cost: 1,
        prerequisite: null
      },
      Berserk: {
        id: 'Berserk',
        name: '광폭화 (Berserk)',
        desc: '호감도 30 이하 및 저승률 상태에서도 전투 거부 무시하고 강제 공격',
        cost: 1,
        prerequisite: 'BearDown'
      },
      ShieldWall: {
        id: 'ShieldWall',
        name: '방패 장벽 (ShieldWall)',
        desc: '아군 전체 방어력 +15% 증가',
        cost: 1,
        prerequisite: null
      },
      Ironclad: {
        id: 'Ironclad',
        name: '철갑 외피 (Ironclad)',
        desc: '피격 피해 및 2차 스플래시 피해 30% 감소',
        cost: 1,
        prerequisite: 'ShieldWall'
      },
      RapidAdvance: {
        id: 'RapidAdvance',
        name: '신속한 진격 (RapidAdvance)',
        desc: '이동 시 소모 AP 포인트 50% 할인 (1 AP로 2칸 이동 효율)',
        cost: 1,
        prerequisite: null
      },
      CommanderLeadership: {
        id: 'CommanderLeadership',
        name: '지휘관의 통솔 (CommanderLeadership)',
        desc: '전투 승리 시 경험치 및 호감도 획득량 +30% 증폭',
        cost: 1,
        prerequisite: 'RapidAdvance'
      },
      StrategicDominance: {
        id: 'StrategicDominance',
        name: '전략적 지배 (StrategicDominance)',
        desc: '포섭 유닛의 초기 호감도 +25 추가 보정 (총 50 호감도로 시작)',
        cost: 1,
        prerequisite: 'CommanderLeadership'
      }
    };

    // 타일 맵 데이터 (8x10 = 80개 타일 정의)
    function generateInitialTiles() {
      const tiles = [];
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          let type = 'plain';
          let name = '평지';
          let defBonus = 0;
          let isSafe = false;
          let isCity = false;
          let terrainIcon = '🌱';

          // 도시 (CITY 2x2): (3,4), (3,5), (4,4), (4,5)
          if ((x === 3 || x === 4) && (y === 4 || y === 5)) {
            type = 'city';
            name = '왕도 에테르니아';
            defBonus = 0.40;
            isSafe = true;
            isCity = true;
            terrainIcon = '🏰';
          }
          // 마을 (VILLAGE 1x1): (1,1), (6,8)
          else if ((x === 1 && y === 1) || (x === 6 && y === 8)) {
            type = 'village';
            name = '평화로운 마을';
            defBonus = 0.20;
            isSafe = true;
            terrainIcon = '🏡';
          }
          // 숲 (FOREST): 방어 +20%
          else if ((x === 1 && (y === 3 || y === 4)) || (x === 5 && y === 2) || (x === 6 && y === 3) || (x === 2 && y === 7) || (x === 0 && y === 7)) {
            type = 'forest';
            name = '깊은 숲';
            defBonus = 0.20;
            terrainIcon = '🌲';
          }
          // 산악 (HILL): 방어 +40%
          else if ((x === 0 && y === 2) || (x === 7 && y === 1) || (x === 7 && y === 6) || (x === 4 && y === 8) || (x === 3 && y === 1)) {
            type = 'hill';
            name = '험준한 산악';
            defBonus = 0.40;
            terrainIcon = '⛰️';
          }

          tiles.push({ x, y, type, name, defBonus, isSafe, isCity, terrainIcon });
        }
      }
      return tiles;
    }

    // 기본 병과별 추천 고유 스킬 프리셋
    const DEFAULT_CLASS_SKILLS = {
      KNIGHT: {
        name: '빛의 수호 성벽',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'BUFF',
        effectValue: 35,
        description: '성스러운 기도의 방벽을 전개하여 자신과 아군의 체력을 35 회복하고 이번 턴 공/방을 25% 증폭합니다.'
      },
      MAGE: {
        name: '유성 비전 폭풍',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'AOE',
        effectValue: 32,
        description: '사거리 2칸 내의 모든 적에게 비전 유성 폭격을 쏟아부어 32의 광역 마법 피해를 입힙니다.'
      },
      ARCHER: {
        name: '질풍의 급소 저격',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'SINGLE_TARGET',
        effectValue: 45,
        description: '적의 약점을 노려 단일 적군에게 45의 치명적인 방어 관통 저격 화살을 날립니다.'
      },
      MELEE: {
        name: '철벽 분쇄 돌격',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'SINGLE_TARGET',
        effectValue: 42,
        description: '전방 2칸 내의 적에게 돌진하여 진형을 무너뜨리고 42의 강타 물리 피해를 입힙니다.'
      },
      FIREARM: {
        name: '초토화 포격 집중',
        type: 'ACTIVE',
        costAP: 2,
        coolDown: 3,
        targetType: 'AOE',
        effectValue: 40,
        description: '중포 십자포화를 발사하여 사거리 내 모든 적군에게 40의 괴멸적인 폭발 피해를 입힙니다.'
      }
    };

    // ========================================================================
    // 월드 섹터 노드 정의 (World Map / Sector Nodes Data)
    // ========================================================================
    const WORLD_SECTORS = {
      'A-1': {
        id: 'A-1',
        name: '벨른 평원',
        icon: '🌾',
        difficulty: 'EASY',
        stars: '★☆☆☆☆',
        terrainDesc: '탁 트인 평야 지대로 기동력이 우수하며 ZOC 전선 형성이 빠름',
        terrainComposition: { plain: 65, forest: 25, hill: 10 },
        enemyForce: '👺 고블린 유격대 (두목 그룩)',
        recPower: 320,
        upkeep: 15,
        clearReward: '250G + 장비',
        locked: false
      },
      'A-2': {
        id: 'A-2',
        name: '아이젠 요새',
        icon: '🏰',
        difficulty: 'NORMAL',
        stars: '★★☆☆☆',
        terrainDesc: '성벽과 방어 망루가 빽빽한 방어 거점. 공성 원거리 병과 중요',
        terrainComposition: { plain: 40, forest: 20, hill: 40 },
        enemyForce: '🛡️ 철혈 방위군 (사령관 바르크)',
        recPower: 450,
        upkeep: 25,
        clearReward: '400G + 강철 방패',
        locked: false
      },
      'B-1': {
        id: 'B-1',
        name: '에테르니아 왕도',
        icon: '👑',
        difficulty: 'HARD',
        stars: '★★★★☆',
        terrainDesc: '제국 수도 수복 작전. 고대 마법 결계와 다층 방어선 형성',
        terrainComposition: { plain: 30, forest: 30, hill: 40 },
        enemyForce: '🔮 마도 사제단 및 수호 골렘',
        recPower: 620,
        upkeep: 35,
        clearReward: '750G + 영웅의 서',
        locked: false
      },
      'B-2': {
        id: 'B-2',
        name: '흑염 화산지대',
        icon: '🌋',
        difficulty: 'NIGHTMARE',
        stars: '★★★★★',
        terrainDesc: '용암 지열과 유독가스로 인해 턴당 지속 피해가 발생하는 극한 전장',
        terrainComposition: { plain: 20, forest: 10, hill: 70 },
        enemyForce: '🐉 심연의 흑룡 및 광신도 군단',
        recPower: 880,
        upkeep: 50,
        clearReward: '1500G + 드래곤 하트',
        locked: true
      }
    };

    // 게스트 ID 생성기
    function generateGuestId() {
      const randNum = Math.floor(1000 + Math.random() * 9000);
      return `Guest_${randNum}`;
    }

    /* --------------------------------------------------------------------------
       HP Normalization & Percentage-Based Combat Mathematics Engine
       -------------------------------------------------------------------------- */

    /**
     * HP Normalization Utility
     * Iterates over all existing units in state (state.units, state.playerUnits,
     * state.enemyUnits, and tiles.units) and forces:
     *   unit.maxHp = 100;
     *   unit.hp = Math.min(100, Math.max(0, unit.hp)); (or reset to 100 if invalid)
     * Also keeps unit.stats synchronized with normalized HP values.
     *
     * @param {Object} [targetState] - Optional state object to normalize. Defaults to active state.
     * @returns {number} Count of unique units normalized.
     */
    function normalizeAllUnitsHP(targetState = (typeof state !== 'undefined' ? state : null)) {
      const s = targetState;
      const processedUnits = new Set();

      function normalizeUnit(unit) {
        if (!unit || typeof unit !== 'object' || processedUnits.has(unit)) return;
        processedUnits.add(unit);

        // Force maximum HP to standard 100-point scale
        unit.maxHp = 100;

        // Force current HP to integer clamped between 0 and 100 (or reset to 100 if invalid)
        if (typeof unit.hp !== 'number' || isNaN(unit.hp)) {
          unit.hp = 100;
        } else {
          unit.hp = Math.min(100, Math.max(0, Math.round(unit.hp)));
        }

        // Synchronize unit.stats object if present
        if (unit.stats && typeof unit.stats === 'object') {
          unit.stats.maxHp = 100;
          unit.stats.hp = unit.hp;
        }
      }

      if (s) {
        if (Array.isArray(s.playerUnits)) s.playerUnits.forEach(normalizeUnit);
        if (Array.isArray(s.enemyUnits)) s.enemyUnits.forEach(normalizeUnit);
        if (Array.isArray(s.units)) s.units.forEach(normalizeUnit);
        if (Array.isArray(s.tiles)) {
          s.tiles.forEach(t => {
            if (Array.isArray(t.units)) t.units.forEach(normalizeUnit);
          });
        }
      }

      if (typeof tiles !== 'undefined' && Array.isArray(tiles)) {
        tiles.forEach(t => {
          if (Array.isArray(t.units)) t.units.forEach(normalizeUnit);
        });
      }

      return processedUnits.size;
    }

    /**
     * Percentage Combat Strength Calculation
     * Formula: Effective Strength = Base Strength * (unit.hp / 100)
     *
     * @param {Object|number} unitOrBase - The unit object or raw base strength number.
     * @param {string|number} [typeOrHp='attack'] - Stat type ('attack'|'defense'|'strength') or current HP number.
     * @returns {number} Effective combat strength based on current HP percentage.
     */
    function calculateEffectiveStrength(unitOrBase, typeOrHp = 'attack') {
      if (typeof unitOrBase === 'number') {
        const base = unitOrBase;
        const hp = typeof typeOrHp === 'number' ? typeOrHp : 100;
        const clampedHp = Math.min(100, Math.max(0, hp));
        return base * (clampedHp / 100);
      }

      const unit = unitOrBase;
      if (!unit || typeof unit !== 'object') return 0;

      // Ensure HP is cleanly clamped between 0 and 100
      const hp = (typeof unit.hp === 'number' && !isNaN(unit.hp))
        ? Math.min(100, Math.max(0, unit.hp))
        : (unit.isDead ? 0 : 100);
      const hpPercentage = hp / 100;

      const statType = typeof typeOrHp === 'string' ? typeOrHp.toLowerCase() : 'attack';
      let baseStrength = 10;

      if (statType === 'defense' || statType === 'def') {
        baseStrength = typeof unit.def === 'number' ? unit.def :
                       (unit.stats && typeof unit.stats.def === 'number') ? unit.stats.def :
                       (typeof unit.defensePower === 'number') ? unit.defensePower :
                       (typeof unit.atk === 'number') ? unit.atk : 10;
      } else if (statType === 'strength') {
        baseStrength = typeof unit.strength === 'number' ? unit.strength :
                       typeof unit.atk === 'number' ? unit.atk :
                       (unit.stats && typeof unit.stats.atk === 'number') ? unit.stats.atk :
                       (typeof unit.attackPower === 'number') ? unit.attackPower : 10;
      } else {
        // Default: attack / atk
        baseStrength = typeof unit.atk === 'number' ? unit.atk :
                       typeof unit.strength === 'number' ? unit.strength :
                       (unit.stats && typeof unit.stats.atk === 'number') ? unit.stats.atk :
                       (typeof unit.attackPower === 'number') ? unit.attackPower : 10;
      }

      return baseStrength * hpPercentage;
    }

    /**
     * Calculates combat exchange damage per round and rounds damage to clean integers
     * so unit HP remains clean integers between 0 and 100.
     *
     * @param {Object} attacker - Attacker unit
     * @param {Object} defender - Defender unit
     * @param {boolean} attackerWon - Whether attacker won the round/exchange
     * @param {number} winChance - Win probability percentage (0 - 100)
     * @returns {{ attackerDamage: number, defenderDamage: number }}
     */
    function calculateRoundCombatDamage(attacker, defender, attackerWon, winChance) {
      const atkPower = calculateEffectiveStrength(attacker, 'atk');
      const defPower = calculateEffectiveStrength(defender, 'def');
      const winRate = Math.max(0.01, Math.min(0.99, (winChance || 50) / 100));

      let primaryDamage = 0;
      let counterDamage = 0;

      if (attackerWon) {
        primaryDamage = Math.round(atkPower * (1 + winRate * 0.4));
        counterDamage = Math.round(defPower * (1 - winRate) * 0.3);
      } else {
        primaryDamage = Math.round(defPower * (1 + (1 - winRate) * 0.5));
        counterDamage = Math.round(atkPower * winRate * 0.25);
      }

      return {
        defenderDamage: Math.max(0, Math.round(attackerWon ? primaryDamage : counterDamage)),
        attackerDamage: Math.max(0, Math.round(attackerWon ? counterDamage : primaryDamage))
      };
    }

    // 기본 지휘관 & 유닛 상태 생성
    function createInitialState(customGuestId) {
      const guestId = customGuestId || generateGuestId();
      return {
        guest: {
          id: guestId,
          createdAt: new Date().toISOString(),
          lastSavedAt: new Date().toISOString()
        },
        currentView: 'STRATEGY', // 'STRATEGY' (월드맵/전략 메인) | 'SECTOR_MAP' (8x14 전술 필드)
        currentSector: 'A-1',
        selectedSectorId: 'A-1',
        editingSectorId: 'A-1',
        currentMapData: null,
        isCombatActive: false,
        isCombatPaused: false,
        strategy: {
          commanderAP: 24,
          maxCommanderAP: 24,
          selectedSectorId: 'A-1',
          armyDeck: {
            KNIGHT: 30,
            MAGE: 15,
            ARCHER: 25,
            MELEE: 20,
            FIREARM: 10
          },
          activeSkills: {
            RapidAdvance: true,
            BearDown: true,
            ShieldWall: true,
            StrategicDominance: false,
            Precision: false
          }
        },
        turn: 1,
        gold: 450,
        rewinders: 3,
        stackMoveEnabled: true, // 중첩 유닛 함께 이동 기본 활성화
        commander: {
          name: '레오나르도',
          level: 1,
          exp: 20,
          maxExp: 100,
          skillPoints: 2,
          unlockedSkills: {
            BearDown: false,
            Precision: false,
            Berserk: false,
            ShieldWall: false,
            Ironclad: false,
            RapidAdvance: false,
            CommanderLeadership: false,
            StrategicDominance: false
          }
        },
        playerUnits: [
          {
            id: 'u1',
            owner: 'PLAYER',
            name: '성기사 롤랑',
            unitClass: 'KNIGHT',
            classType: 'KNIGHT',
            avatar: '🐴',
            level: 2,
            stats: { hp: 100, maxHp: 100, atk: 48, def: 38, mobility: 3 },
            hp: 100,
            maxHp: 100,
            atk: 48,
            def: 38,
            baseAP: 3,
            ap: 3,
            favorability: 85,
            affection: 85,
            upkeep: 12,
            x: 3,
            y: 4, // 왕도 에테르니아 내 배치
            imageUrl: '',
            isInactivated: false,
            isDead: false,
            promotions: { combatRank: 1 },
            customSkill: JSON.parse(JSON.stringify(DEFAULT_CLASS_SKILLS.KNIGHT)),
            customSkillCooldown: 0
          },
          {
            id: 'u2',
            owner: 'PLAYER',
            name: '용병대장 발터',
            unitClass: 'MELEE',
            classType: 'MELEE',
            avatar: '⚔️',
            level: 1,
            stats: { hp: 85, maxHp: 85, atk: 35, def: 30, mobility: 2 },
            hp: 85,
            maxHp: 85,
            atk: 35,
            def: 30,
            baseAP: 2,
            ap: 2,
            favorability: 40,
            affection: 40,
            upkeep: 8,
            x: 2,
            y: 3, // 평지
            imageUrl: '',
            isInactivated: false,
            isDead: false,
            promotions: { combatRank: 0 },
            customSkill: JSON.parse(JSON.stringify(DEFAULT_CLASS_SKILLS.MELEE)),
            customSkillCooldown: 0
          },
          {
            id: 'u3',
            owner: 'PLAYER',
            name: '명사수 리리아',
            unitClass: 'ARCHER',
            classType: 'ARCHER',
            avatar: '🏹',
            level: 1,
            stats: { hp: 70, maxHp: 70, atk: 42, def: 20, mobility: 2 },
            hp: 70,
            maxHp: 70,
            atk: 42,
            def: 20,
            baseAP: 2,
            ap: 2,
            favorability: 28,
            affection: 28, // 호감도 30 이하 (전투 거부 테스트용)
            upkeep: 8,
            x: 1,
            y: 3, // 숲 속
            imageUrl: '',
            isInactivated: false,
            isDead: false,
            promotions: { combatRank: 0 },
            customSkill: JSON.parse(JSON.stringify(DEFAULT_CLASS_SKILLS.ARCHER)),
            customSkillCooldown: 0
          }
        ],
        enemyUnits: [
          {
            id: 'e1',
            owner: 'ENEMY',
            name: '야생 고블린',
            classType: 'MELEE',
            avatar: '👺',
            level: 1,
            hp: 50,
            maxHp: 50,
            atk: 25,
            def: 18,
            baseAP: 2,
            ap: 2,
            x: 2,
            y: 1,
            isDead: false
          },
          {
            id: 'e2',
            owner: 'ENEMY',
            name: '야생 회색늑대',
            classType: 'MELEE',
            avatar: '🐺',
            level: 1,
            hp: 45,
            maxHp: 45,
            atk: 32,
            def: 15,
            baseAP: 2,
            ap: 2,
            x: 5,
            y: 1,
            isDead: false
          },
          {
            id: 'e3',
            owner: 'ENEMY',
            name: '암흑 흑마법사',
            classType: 'MAGE',
            avatar: '🔮',
            level: 2,
            hp: 65,
            maxHp: 65,
            atk: 52,
            def: 22,
            baseAP: 2,
            ap: 2,
            x: 6,
            y: 2,
            isDead: false
          },
          {
            id: 'e4',
            owner: 'ENEMY',
            name: '반란군 총병',
            classType: 'FIREARM',
            avatar: '💥',
            level: 2,
            hp: 75,
            maxHp: 75,
            atk: 58,
            def: 25,
            baseAP: 2,
            ap: 2,
            x: 5,
            y: 7,
            isDead: false
          },
          {
            id: 'e5',
            owner: 'ENEMY',
            name: '오크 돌격대장',
            classType: 'MELEE',
            avatar: '👹',
            level: 2,
            hp: 90,
            maxHp: 90,
            atk: 45,
            def: 32,
            baseAP: 2,
            ap: 2,
            x: 1,
            y: 6,
            isDead: false
          }
        ]
      };

      // 초기 상태 유닛 체력 100-Point 정규화 자동 실행
      normalizeAllUnitsHP(initialState);
      return initialState;
    }

    // 전역 상태 변수
    let tiles = generateInitialTiles();
    let state = createInitialState();
    normalizeAllUnitsHP(state);
    let historyStack = []; // 리와인더용 실행 취소 스택
    let selectedUnitId = 'u1';
    let currentInteractionMode = null; // 'MOVE' | 'ATTACK' | null
    let isEnemyTurnProcessing = false; // 적 AI 턴 진행 상태 플래그

    // 전술 전장 전투 및 승리 상태 관리
    let victoryProcessed = false;
    let defeatedEnemyCount = 0;

    window.victoryProcessed = victoryProcessed;
    window.defeatedEnemyCount = defeatedEnemyCount;

    // ========================================================================
    // 단일 진실 공급원(Single Source of Truth): state.isCombatActive
    // 4곳(window.isCombatActive, window.battleActive, window.playerState.isCombatActive,
    // window.gameState.isCombatActive)은 중복 저장하지 않고 getter/setter로 state.isCombatActive를 참조
    // ========================================================================
    function defineCombatActiveGetters() {
      const combatDescriptor = {
        get() {
          return (typeof state !== 'undefined' && state) ? !!state.isCombatActive : false;
        },
        set(val) {
          if (typeof state !== 'undefined' && state) {
            state.isCombatActive = !!val;
          }
        },
        configurable: true,
        enumerable: true
      };

      Object.defineProperty(window, 'isCombatActive', combatDescriptor);
      Object.defineProperty(window, 'battleActive', combatDescriptor);

      if (!window.playerState) {
        window.playerState = {};
      }
      Object.defineProperty(window.playerState, 'isCombatActive', combatDescriptor);

      if (!window.gameState) {
        window.gameState = {};
      }
      Object.defineProperty(window.gameState, 'isCombatActive', combatDescriptor);
    }
    defineCombatActiveGetters();

    // Global playerState object for universal access across map classes & external modules
    if (!window.playerState) {
      window.playerState = {};
    }
    if (!('gold' in window.playerState)) {
      Object.defineProperty(window.playerState, 'gold', {
        get() {
          return (typeof state !== 'undefined' && state && typeof state.gold === 'number') ? state.gold : 0;
        },
        set(val) {
          if (typeof state !== 'undefined' && state) {
            state.gold = val;
          }
        },
        configurable: true,
        enumerable: true
      });
    }
    if (!('rewinders' in window.playerState)) {
      Object.defineProperty(window.playerState, 'rewinders', {
        get() {
          return (typeof state !== 'undefined' && state && typeof state.rewinders === 'number') ? state.rewinders : 0;
        },
        set(val) {
          if (typeof state !== 'undefined' && state) {
            state.rewinders = val;
          }
        },
        configurable: true,
        enumerable: true
      });
    }

    // 실시간 디버그 & 개발자 파라미터 상태 (Live Binding)
    const debugParams = {
      // 1. 병과별 실시간 기본 스탯 (ATK, DEF, baseAP, affection, hp - 100-Point Scale)
      unitClassStats: {
        KNIGHT: { atk: 48, def: 38, baseAP: 3, affection: 85, hp: 100 },
        MELEE: { atk: 35, def: 30, baseAP: 2, affection: 40, hp: 100 },
        ARCHER: { atk: 42, def: 20, baseAP: 2, affection: 28, hp: 100 },
        MAGE: { atk: 52, def: 22, baseAP: 2, affection: 60, hp: 100 },
        FIREARM: { atk: 58, def: 25, baseAP: 2, affection: 45, hp: 100 }
      },
      // 2. 밸런스 & 전투 공식 가중치
      tileDefBonusMultiplier: 1.0, // 0.0 ~ 3.0 (0% ~ 300%)
      collateralDamageMultiplier: 0.30, // 2차 피해 비율 (0% ~ 100%)
      winChanceAttackerWeight: 1.0, // 공격 가중치 0.2 ~ 3.0
      winChanceDefenderWeight: 1.0, // 방어 가중치 0.2 ~ 3.0
      // 3. 강제 승패 치트
      forcedBattleResult: 'NONE', // 'NONE' | 'FORCE_WIN' | 'FORCE_LOSE'
      // 4. 선택 타일 좌표 (치트 소환용)
      targetSpawnCoord: { x: 2, y: 2 }
    };
    let currentDebugClass = 'KNIGHT';

    /* --------------------------------------------------------------------------
       Guest Mode & Pure Firebase Firestore Cloud Persistence System
       Zero LocalStorage: All state saved and loaded directly via Cloud Firestore
       -------------------------------------------------------------------------- */
    const STORAGE_KEY = 'slg_guest_save';

    // 게임 상태를 Firebase Firestore에 안전하게 영구 저장 (Zero LocalStorage)
    function saveGameState(silent = false) {
      try {
        if (!state) return;
        if (!state.guest) {
          state.guest = {
            id: generateGuestId(),
            createdAt: new Date().toISOString(),
            lastSavedAt: new Date().toISOString()
          };
        }
        state.guest.lastSavedAt = new Date().toISOString();

        // 1. 유닛 이미지 중복 저장 방지:
        // 병과 공통 이미지는 Cloud Firestore game_configs/unit_images에 영구 저장되므로 페이로드 경량화
        const sanitizedPlayerUnits = state.playerUnits.map(u => {
          const isClassImg = u.imageUrl && customClassImages[u.classType] && u.imageUrl === customClassImages[u.classType];
          return {
            ...u,
            imageUrl: isClassImg ? '' : u.imageUrl
          };
        });

        const payload = {
          version: '1.0.0',
          savedAt: state.guest.lastSavedAt,
          guest: state.guest,
          currentView: state.currentView || 'STRATEGY',
          currentSector: state.currentSector || 'A-1',
          strategy: state.strategy || {
            commanderAP: 24,
            maxCommanderAP: 24,
            selectedSectorId: 'A-1',
            armyDeck: { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
            activeSkills: { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
          },
          turn: state.turn,
          gold: state.gold,
          rewinders: state.rewinders,
          stackMoveEnabled: state.stackMoveEnabled,
          commander: state.commander,
          playerUnits: sanitizedPlayerUnits,
          enemyUnits: state.enemyUnits,
          selectedUnitId: selectedUnitId
        };

        // Firebase Firestore 동기화 처리 (Cloud Database 영구 저장)
        if (typeof window.saveGameStateToCloud === 'function') {
          window.saveGameStateToCloud(payload);
          updateGuestSaveIndicator(true);
        } else if (window.FirebaseBridge && typeof window.FirebaseBridge.saveGameStateToCloud === 'function') {
          window.FirebaseBridge.saveGameStateToCloud(payload);
          updateGuestSaveIndicator(true);
        }

        if (!silent) {
          addLog(`💾 [클라우드 저장] 게임 상태가 Cloud Firestore에 안전하게 저장되었습니다. (Turn ${state.turn})`, 'system');
        }
      } catch (err) {
        console.warn('Failed to save to cloud storage:', err);
      }
    }

    // Cloud Firestore에서 저장된 게임 상태 불러오기 (Zero LocalStorage)
    function loadGameState(cloudPayload = null) {
      try {
        const parsed = cloudPayload;
        if (!parsed || !parsed.playerUnits || !Array.isArray(parsed.playerUnits)) return false;

        if (parsed.guest && parsed.guest.id) {
          state.guest = parsed.guest;
        } else {
          state.guest = {
            id: generateGuestId(),
            createdAt: new Date().toISOString(),
            lastSavedAt: new Date().toISOString()
          };
        }

        state.currentView = parsed.currentView || 'STRATEGY';
        state.currentSector = parsed.currentSector || 'A-1';
        if (parsed.strategy) {
          state.strategy = {
            commanderAP: (typeof parsed.strategy.commanderAP === 'number') ? parsed.strategy.commanderAP : 24,
            maxCommanderAP: (typeof parsed.strategy.maxCommanderAP === 'number') ? parsed.strategy.maxCommanderAP : 24,
            selectedSectorId: parsed.strategy.selectedSectorId || 'A-1',
            armyDeck: parsed.strategy.armyDeck || { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
            activeSkills: parsed.strategy.activeSkills || { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
          };
        }

        state.turn = (typeof parsed.turn === 'number') ? parsed.turn : 1;
        state.gold = (typeof parsed.gold === 'number') ? parsed.gold : 450;
        state.rewinders = (typeof parsed.rewinders === 'number') ? parsed.rewinders : 3;
        state.stackMoveEnabled = (parsed.stackMoveEnabled !== undefined) ? parsed.stackMoveEnabled : true;

        if (parsed.commander) {
          state.commander = parsed.commander;
        }
        if (Array.isArray(parsed.playerUnits)) {
          state.playerUnits = parsed.playerUnits;
          state.playerUnits.forEach(u => {
            if (!u.owner) u.owner = 'PLAYER';
            if (!u.unitClass) u.unitClass = u.classType || 'KNIGHT';
            if (!u.stats) {
              u.stats = { hp: u.hp, maxHp: u.maxHp, atk: u.atk, def: u.def, mobility: u.baseAP || 2 };
            }
            if (typeof u.favorability !== 'number') u.favorability = u.affection || 50;
            if (typeof u.affection !== 'number') u.affection = u.favorability || 50;
            if (!u.customSkill && DEFAULT_CLASS_SKILLS[u.unitClass]) {
              u.customSkill = JSON.parse(JSON.stringify(DEFAULT_CLASS_SKILLS[u.unitClass]));
            }
            if (typeof u.customSkillCooldown !== 'number') u.customSkillCooldown = 0;
            if (typeof u.imageUrl !== 'string') u.imageUrl = '';
            // 병과 이미지가 등록되어 있다면 자동 복원
            if (!u.imageUrl && customClassImages[u.classType]) {
              u.imageUrl = customClassImages[u.classType];
            }
          });
        }
        if (Array.isArray(parsed.enemyUnits)) {
          state.enemyUnits = parsed.enemyUnits;
          state.enemyUnits.forEach(e => {
            if (!e.owner) e.owner = 'ENEMY';
            if (typeof e.baseAP !== 'number') {
              const preset = debugParams.unitClassStats[e.classType];
              e.baseAP = preset ? preset.baseAP : 2;
            }
            if (typeof e.ap !== 'number') e.ap = e.baseAP;
            if (typeof e.maxHp !== 'number') e.maxHp = e.hp || 100;
          });
        }

        // 불러온 모든 활성 유닛 체력 100-Point 정규화 자동 실행
        normalizeAllUnitsHP(state);

        if (parsed.selectedUnitId && state.playerUnits.some(u => u.id === parsed.selectedUnitId && !u.isDead)) {
          selectedUnitId = parsed.selectedUnitId;
        } else {
          const firstLiving = state.playerUnits.find(u => !u.isDead);
          selectedUnitId = firstLiving ? firstLiving.id : 'u1';
        }

        updateGuestSaveIndicator(false);
        renderAll();
        return true;
      } catch (err) {
        console.warn('Failed to load from Cloud Firestore:', err);
        return false;
      }
    }

    // 게스트 데이터 영구 초기화 및 새 게임 시작
    function resetGuestData() {
      historyStack = [];
      const newGuestId = generateGuestId();
      state = createInitialState(newGuestId);
      normalizeAllUnitsHP(state);
      selectedUnitId = 'u1';
      userCardViewPreference = 'AUTO';
      cardInspectedEnemyId = null;
      debugInspectedEnemyId = null;
      saveGameState(true);
      closeAllModals();
      renderAll();
      syncDebugInputsFromState();
      updateDebugInspector();
      addLog(`🔄 [데이터 초기화] 게스트 데이터가 초기화되었습니다. 새로운 게스트(${state.guest.id})로 1턴부터 시작합니다!`, 'gold');
    }

    // 상단 자동저장 상태 알림 배지 애니메이션 갱신
    function updateGuestSaveIndicator(justSaved = false) {
      const statusEl = document.getElementById('ui-guest-save-status');
      if (!statusEl) return;
      if (justSaved) {
        statusEl.textContent = '💾 저장 완료!';
        statusEl.classList.add('saving');
        setTimeout(() => {
          if (statusEl) {
            statusEl.textContent = '💾 자동저장 ON';
            statusEl.classList.remove('saving');
          }
        }, 1500);
      } else {
        statusEl.textContent = '💾 자동저장 ON';
      }
    }

    // 게스트 정보 모달 오픈
    function openGuestProfileModal() {
      closeAllModals();
      updateGuestModalInfo();
      const modal = document.getElementById('modal-guest-profile');
      if (modal) modal.classList.add('open');
    }

    // 게스트 정보 모달 데이터 실시간 바인딩
    function updateGuestModalInfo() {
      if (!state || !state.guest) return;
      const idEl = document.getElementById('modal-guest-id-val');
      const progEl = document.getElementById('modal-guest-progress-val');
      const createdEl = document.getElementById('modal-guest-created-val');
      const savedEl = document.getElementById('modal-guest-saved-val');

      if (idEl) idEl.textContent = state.guest.id;
      if (progEl) {
        const livingUnits = state.playerUnits.filter(u => !u.isDead).length;
        progEl.textContent = `Turn ${state.turn} / ${state.gold}G (생존 부대 ${livingUnits}기)`;
      }
      if (createdEl) {
        try {
          const d = new Date(state.guest.createdAt);
          createdEl.textContent = d.toLocaleString('ko-KR');
        } catch (e) {
          createdEl.textContent = state.guest.createdAt || '-';
        }
      }
      if (savedEl) {
        try {
          if (state.guest.lastSavedAt) {
            const d = new Date(state.guest.lastSavedAt);
            savedEl.textContent = d.toLocaleTimeString('ko-KR');
          } else {
            savedEl.textContent = '방금 전';
          }
        } catch (e) {
          savedEl.textContent = '방금 전';
        }
      }
    }

    // 초기화 확인 모달 오픈
    function openGuestResetModal() {
      closeAllModals();
      const modal = document.getElementById('modal-guest-reset-confirm');
      if (modal) modal.classList.add('open');
    }

    /* --------------------------------------------------------------------------
       Snapshot & Undo (리와인더) Engine
       -------------------------------------------------------------------------- */
    function saveHistorySnapshot() {
      // 딥 카피 스냅샷 저장
      const snapshot = JSON.stringify({
        turn: state.turn,
        gold: state.gold,
        rewinders: state.rewinders,
        stackMoveEnabled: state.stackMoveEnabled,
        commander: state.commander,
        playerUnits: state.playerUnits,
        enemyUnits: state.enemyUnits
      });
      historyStack.push(snapshot);
      if (historyStack.length > 8) historyStack.shift();
      saveGameState(true);
    }

    function executeRewind() {
      if (isEnemyTurnProcessing) {
        addLog('⚠️ 적 AI 작전 수행 중에는 리와인드를 실행할 수 없습니다.', 'warning');
        return;
      }
      if (state.rewinders <= 0) {
        addLog('⚠️ [리와인더 고갈] 사용 가능한 리와인더가 없습니다! 마을 상점에서 충전하세요.', 'warning');
        return;
      }
      if (historyStack.length === 0) {
        addLog('⚠️ [리와인더] 되돌릴 이전 턴 기록이 없습니다.', 'warning');
        return;
      }

      const prevJson = historyStack.pop();
      const prev = JSON.parse(prevJson);
      const currentRewinders = state.rewinders - 1;

      state.turn = prev.turn;
      state.gold = prev.gold;
      state.rewinders = currentRewinders;
      state.stackMoveEnabled = prev.stackMoveEnabled !== undefined ? prev.stackMoveEnabled : true;
      state.commander = prev.commander;
      state.playerUnits = prev.playerUnits;
      state.enemyUnits = prev.enemyUnits;

      addLog(`⏳ [리와인더 가동!] 시공간 왜곡으로 1턴 전 상태로 복원 완료! (잔여 리와인더: ${currentRewinders}개)`, 'capture');
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Logging & Console Output
       -------------------------------------------------------------------------- */
    function addLog(msg, type = 'system') {
      const wrap = document.getElementById('console-wrap');
      const div = document.createElement('div');
      div.className = `log-line log-${type}`;
      div.textContent = msg;
      wrap.appendChild(div);
      wrap.scrollTop = wrap.scrollHeight;
    }

    /* --------------------------------------------------------------------------
       Tile & Grid Logic
       -------------------------------------------------------------------------- */
    function getTile(x, y) {
      return tiles.find(t => t.x === x && t.y === y);
    }

    function getUnitsAt(x, y) {
      const players = state.playerUnits.filter(u => !u.isDead && u.x === x && u.y === y);
      const enemies = state.enemyUnits.filter(u => !u.isDead && u.x === x && u.y === y);
      return { players, enemies, total: players.length + enemies.length };
    }

    function getUnitAt(x, y) {
      // 1. 현재 선택된 아군 유닛이 (x, y)에 있으면 우선 반환
      const sel = state.playerUnits.find(u => !u.isDead && u.x === x && u.y === y && u.id === selectedUnitId);
      if (sel) return { unit: sel, isPlayer: true };

      // 2. 다른 생존 아군 유닛 반환
      const p = state.playerUnits.find(u => !u.isDead && u.x === x && u.y === y);
      if (p) return { unit: p, isPlayer: true };

      // 3. 디버그 인스펙터가 주시 중인 적군 반환
      if (debugInspectedEnemyId) {
        const inspected = state.enemyUnits.find(u => !u.isDead && u.x === x && u.y === y && u.id === debugInspectedEnemyId);
        if (inspected) return { unit: inspected, isPlayer: false };
      }

      // 4. 타일에 적군이 여러 기 중첩된 경우 방어력이 가장 높은 수비 유닛 반환
      const enemies = state.enemyUnits.filter(u => !u.isDead && u.x === x && u.y === y);
      if (enemies.length > 0) {
        const bestDef = enemies.slice().sort((a, b) => b.def - a.def)[0];
        return { unit: bestDef, isPlayer: false };
      }
      return null;
    }

    function getSelectedUnit() {
      return state.playerUnits.find(u => u.id === selectedUnitId && !u.isDead) || state.playerUnits.find(u => !u.isDead);
    }

    let userCardViewPreference = 'AUTO'; // 'AUTO' | 'FORCE_NORMAL'
    let cardInspectedEnemyId = null;

    /* --------------------------------------------------------------------------
       Combat Odds & Range Query Helper Functions
       -------------------------------------------------------------------------- */
    function getEnemiesInRange(unit) {
      if (!unit || unit.isDead || unit.isInactivated || unit.ap <= 0) return [];
      const range = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;
      const inRange = [];
      state.enemyUnits.forEach(e => {
        if (!e.isDead) {
          const dist = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
          if (dist > 0 && dist <= range) {
            inRange.push(e);
          }
        }
      });
      return inRange;
    }

    /* --------------------------------------------------------------------------
       Command Interception & Refusal Guard Logic
       -------------------------------------------------------------------------- */
    function checkCommandRefusal(unit, target, winChance = 1.0) {
      if (!unit || unit.owner === 'ENEMY') return false;

      // 1. 지휘관 패시브 광폭화(Berserk) 활성화 시 공포/거부 무시
      const commanderSkills = state?.commander?.unlockedSkills || {};
      if (commanderSkills.Berserk) {
        return false;
      }

      // 2. 충성도 / 호감도 (Loyalty/Affection) 임계치 검사 (30 이하)
      const currentLoyalty = unit.loyalty ?? unit.affection ?? 50;
      const isLowLoyalty = currentLoyalty <= 30;

      // 3. 체력(HP) 치명적 상태 검사 (최대 체력의 25% 이하)
      const maxHp = unit.maxHp || 100;
      const hpRatio = unit.hp / maxHp;
      const isCriticalHp = hpRatio <= 0.25;

      // 4. 위험 교전 여부 (승률 35% 미만)
      const isDangerousBattle = winChance < 0.35;
      const isTerrified = (isLowLoyalty && isDangerousBattle) || (isLowLoyalty && isCriticalHp) || (currentLoyalty <= 15);

      if (isTerrified) {
        let fearDialogue = '죽고 싶지 않아요...! 제발 이번 명령만은...!';
        if (isCriticalHp) {
          fearDialogue = `피가 멈추지 않아요... (HP ${unit.hp}/${maxHp}) 더 싸우다간 죽고 말 거예요!`;
        } else if (currentLoyalty <= 15) {
          fearDialogue = `지휘관님을 더는 신뢰할 수 없습니다! 이런 자살 특공 명령엔 따를 수 없어요!`;
        } else if (isDangerousBattle) {
          fearDialogue = `적(${target?.name || '적군'})의 기세가 너무 흉포합니다... 살아서 돌아오지 못할 것 같아요!`;
        }

        // a. 공포 비주얼 & 심장박동 사운드 효과 발동
        if (typeof window.triggerFearFX === 'function') {
          window.triggerFearFX(unit.id, fearDialogue);
        } else if (typeof window.UI?.triggerFearFX === 'function') {
          window.UI.triggerFearFX(unit.id, fearDialogue);
        }

        // b. 방어 태세(Defensive Stance / Guard)로 자동 전환
        unit.stance = 'GUARD';
        unit.isGuarding = true;
        unit.guardBonusDef = 0.30; // 방어력 +30% 보너스

        // c. 이벤트 로그 출력
        addLog(`🛡️ [명령 거부 및 방어 태세] ${unit.name}(충성/호감 ${currentLoyalty}, HP ${unit.hp}/${maxHp})이(가) 공포에 질려 명령을 거부하고 [방어 태세]로 전환했습니다! (방어력 +30%)`, 'danger');

        // d. UI 갱신
        if (state.selectedUnit?.id === unit.id) {
          renderUnitCard(unit);
        }
        renderMap();

        return true; // 명령 차단 및 취소
      }

      return false;
    }

    function executeAttack(attacker, defender) {
      if (!attacker || !defender) return false;
      const odds = getCombatOdds(attacker, defender);
      const winRate = odds ? odds.P : 0.5;

      if (checkCommandRefusal(attacker, defender, winRate)) {
        return false;
      }
      executeCombat(attacker, defender);
      return true;
    }

    /* --------------------------------------------------------------------------
       Combat Odds & Civ4 Formula
       -------------------------------------------------------------------------- */
    function getCombatOdds(attacker, defender) {
      if (!attacker || !defender) return null;
      const skills = state.commander.unlockedSkills;
      const isPlayerAttacker = (attacker.owner === 'PLAYER' || !attacker.owner);
      const isPlayerDefender = (defender.owner === 'PLAYER' || !defender.owner);
      const isFirstUnit = isPlayerAttacker && (state.playerUnits.filter(u => !u.isDead)[0]?.id === attacker.id);
      const targetTile = getTile(defender.x, defender.y);

      // 1. 공격력 산출 (Effective Strength = Base Strength * (HP / 100))
      let atkBonus = 1.0;
      if (attacker.promotions && attacker.promotions.combatRank) {
        atkBonus += attacker.promotions.combatRank * 0.10;
      }
      if (isPlayerAttacker && skills.BearDown && isFirstUnit) {
        atkBonus += 0.20; // BearDown: 첫 유닛 공격력 +20%
      }
      // 커스텀 패시브 스킬 및 활성 버프 적용
      if (attacker.customSkill && attacker.customSkill.type === 'PASSIVE') {
        atkBonus += (Number(attacker.customSkill.effectValue) || 20) / 100;
      }
      if (attacker.customSkillBuffAtk) {
        atkBonus += attacker.customSkillBuffAtk;
      }
      const effectiveAtk = calculateEffectiveStrength(attacker, 'atk');
      const finalAtk = effectiveAtk * atkBonus;

      // 2. 방어력 산출 (디버그 패널 타일 방어 배율 적용, Effective Strength = Base Strength * (HP / 100))
      let defBonus = 1.0;
      let rawTileDef = targetTile ? targetTile.defBonus : 0;
      let tileDefBonus = rawTileDef * (debugParams.tileDefBonusMultiplier ?? 1.0);
      if (isPlayerAttacker && skills.Precision) {
        tileDefBonus = 0; // Precision: 적 지형 방어 보너스 무시
      }
      defBonus += tileDefBonus;
      if (isPlayerDefender && skills.ShieldWall) {
        defBonus += 0.15; // ShieldWall: 아군 방어력 +15%
      }
      // 방어 태세 (GUARD stance) 보너스 +30% 적용
      if (defender.isGuarding || defender.stance === 'GUARD') {
        defBonus += (defender.guardBonusDef || 0.30);
      }
      // 커스텀 패시브 스킬 및 활성 버프 적용
      if (defender.customSkill && defender.customSkill.type === 'PASSIVE') {
        defBonus += (Number(defender.customSkill.effectValue) || 20) / 100;
      }
      if (defender.customSkillBuffDef) {
        defBonus += defender.customSkillBuffDef;
      }
      const effectiveDef = calculateEffectiveStrength(defender, 'def');
      const finalDef = effectiveDef * defBonus;

      // 3. 문명4 방식 승리 확률 P = (공격력 * W_atk) / (공격력 * W_atk + 방어력 * W_def)
      const wAtk = debugParams.winChanceAttackerWeight ?? 1.0;
      const wDef = debugParams.winChanceDefenderWeight ?? 1.0;
      const weightedAtk = finalAtk * wAtk;
      const weightedDef = finalDef * wDef;
      let P = (weightedAtk + weightedDef > 0) ? (weightedAtk / (weightedAtk + weightedDef)) : 0.5;

      let isCheat = false;
      if (debugParams.forcedBattleResult === 'FORCE_WIN') {
        P = isPlayerAttacker ? 1.0 : 0.0;
        isCheat = true;
      } else if (debugParams.forcedBattleResult === 'FORCE_LOSE') {
        P = isPlayerAttacker ? 0.0 : 1.0;
        isCheat = true;
      }

      const winPercent = (P * 100).toFixed(1);
      const isDangerAffection = isPlayerAttacker && (attacker.affection <= 30 && P < 0.30 && !skills.Berserk);

      return {
        attacker,
        defender,
        finalAtk,
        finalDef,
        tileDefBonus,
        weightedAtk,
        weightedDef,
        P,
        winPercent,
        isCheat,
        isDangerAffection
      };
    }

    /* --------------------------------------------------------------------------
       Combat Math & Engine (Civ4 Formula + Affection Check + Permadeath)
       -------------------------------------------------------------------------- */
    function executeCombat(attacker, defender) {
      saveHistorySnapshot();

      const odds = getCombatOdds(attacker, defender);
      if (!odds) return;

      const { finalAtk, finalDef, tileDefBonus, weightedAtk, weightedDef, P, winPercent, isDangerAffection } = odds;
      const skills = state.commander.unlockedSkills;
      const isPlayerAttacker = (attacker.owner === 'PLAYER' || !attacker.owner);

      addLog(`⚔️ [전투 개시] ${attacker.name}(공 ${finalAtk.toFixed(1)}) VS ${defender.name}(방 ${finalDef.toFixed(1)}${tileDefBonus > 0 ? ` [지형+${(tileDefBonus*100).toFixed(0)}%]` : ''})`, 'combat');
      addLog(`📊 [확률 산출] 승리 확률 P = ${weightedAtk.toFixed(1)} / (${weightedAtk.toFixed(1)} + ${weightedDef.toFixed(1)}) = ${winPercent}%`, 'combat');

      // 4. 호감도/체력 공포 명령 거부 및 자동 방어 태세 전환 가드 (플레이어 유닛 전용)
      if (isPlayerAttacker && checkCommandRefusal(attacker, defender, P)) {
        return; // 전투 취소 및 AP 보존 상태로 방어 태세 전환 완료
      }
      if (isPlayerAttacker && isDangerAffection) {
        addLog(`❌ [전투 거부!] ${attacker.name}의 호감도가 ${attacker.affection}이며 승률이 ${winPercent}%로 극히 위험합니다!`, 'danger');
        addLog(`💬 "${attacker.name}: 이런 무모한 사지로 갈 순 없습니다! 명령을 거부합니다!" (AP/턴 미소모)`, 'warning');
        return;
      }
      if (isPlayerAttacker && attacker.affection <= 30 && P < 0.30 && skills.Berserk) {
        addLog(`🔥 [지휘관 패시브: 광폭화] 호감도 저하(${attacker.affection})를 무시하고 강제 전투 돌입!`, 'warning');
      }

      // 5. 행동력(AP) 소모
      attacker.ap = Math.max(0, attacker.ap - 1);

      // 6. 주사위 굴림 (강제 승패 치트 지원)
      const roll = Math.random() * 100;
      let isWin = roll < (P * 100);

      if (debugParams.forcedBattleResult === 'FORCE_WIN') {
        isWin = isPlayerAttacker ? true : false;
        addLog(`⚡ [치트 발동] 디버그 강제 승리 (FORCE_WIN) 적용!`, 'gold');
      } else if (debugParams.forcedBattleResult === 'FORCE_LOSE') {
        isWin = isPlayerAttacker ? false : true;
        addLog(`⚡ [치트 발동] 디버그 강제 패배 (FORCE_LOSE) 적용!`, 'danger');
      } else {
        addLog(`🎲 [주사위 결과] Roll: ${roll.toFixed(1)} (목표: ${winPercent}% 미만) -> ${isWin ? '공격자 승리!' : '방어자 방어 성공!'}`, isWin ? 'success' : 'danger');
      }

      // 전투 교환 피해 계산 (Round Combat Damage & Clean Integer HP)
      const roundDmg = calculateRoundCombatDamage(attacker, defender, isWin, parseFloat(winPercent));

      if (isWin) {
        // 승리: 피격자(defender) 사망 (HP 0)
        defender.isDead = true;
        defender.hp = 0;
        if (defender.stats) defender.stats.hp = 0;
        if (defender.owner === 'ENEMY') {
          window.defeatedEnemyCount = (window.defeatedEnemyCount || 0) + 1;
          defeatedEnemyCount = window.defeatedEnemyCount;
        }

        // 수비측 반격 교환 피해 적용 (HP 1 이상 정수 유지)
        if (roundDmg.attackerDamage > 0) {
          attacker.hp = Math.max(1, Math.round(attacker.hp - roundDmg.attackerDamage));
          if (attacker.stats) attacker.stats.hp = attacker.hp;
          addLog(`🛡️ [수비측 반격] ${defender.name}의 저항으로 ${attacker.name}에게 ${roundDmg.attackerDamage} 피해 (잔여 HP: ${attacker.hp}/${attacker.maxHp})`, 'warning');
        }

        if (isPlayerAttacker) {
          // A. 아군 플레이어의 공격 성공
          const splashRatio = debugParams.collateralDamageMultiplier ?? 0.30;
          if (splashRatio > 0) {
            const splashDamage = Math.round(finalAtk * splashRatio);
            const adjEnemies = state.enemyUnits.filter(e =>
              !e.isDead && e.id !== defender.id &&
              Math.abs(e.x - defender.x) <= 1 && Math.abs(e.y - defender.y) <= 1
            );
            if (adjEnemies.length > 0) {
              adjEnemies.forEach(adj => {
                adj.hp = Math.max(0, adj.hp - splashDamage);
                if (adj.hp <= 0) {
                  adj.isDead = true;
                  if (adj.owner === 'ENEMY') {
                    window.defeatedEnemyCount = (window.defeatedEnemyCount || 0) + 1;
                    defeatedEnemyCount = window.defeatedEnemyCount;
                  }
                }
                addLog(`💥 [2차 스플래시 피해] 인접 적 ${adj.name}에게 ${splashDamage} 피해 (${(splashRatio*100).toFixed(0)}%)! (잔여 HP: ${adj.hp}/${adj.maxHp})`, 'warning');
              });
            }
          }

          // 포켓몬식 야생 유닛 포섭 판정 (50% 확률)
          const canCapture = Math.random() < 0.50;
          if (canCapture) {
            const initAffection = skills.StrategicDominance ? 50 : 25;
            const newUnitId = 'cap_' + Date.now();
            const capturedUnit = {
              id: newUnitId,
              owner: 'PLAYER',
              name: '포섭된 ' + defender.name,
              classType: defender.classType,
              avatar: defender.avatar,
              level: defender.level,
              hp: 70,
              maxHp: 100,
              stats: { hp: 70, maxHp: 100, atk: defender.atk, def: defender.def, mobility: 2 },
              atk: defender.atk,
              def: defender.def,
              baseAP: 2,
              ap: 0,
              affection: initAffection,
              upkeep: 8,
              x: defender.x,
              y: defender.y,
              isInactivated: false,
              isDead: false,
              promotions: { combatRank: 0 }
            };
            state.playerUnits.push(capturedUnit);
            addLog(`🎉 [야생 유닛 포섭 성공!] ${defender.name}을(를) 아군 부대로 영입했습니다! (초기 호감도: ${initAffection})`, 'capture');
          } else {
            const lootGold = 35 + defender.level * 10;
            state.gold += lootGold;
            addLog(`🏆 [적 격퇴 완료] ${defender.name} 처치 성공! 전리품 +${lootGold}G 획득`, 'gold');
          }

          // 지휘관 & 유닛 경험치
          let expGain = 25;
          let affGain = 5;
          if (skills.CommanderLeadership) {
            expGain = Math.round(expGain * 1.3);
            affGain = Math.round(affGain * 1.3);
          }
          state.commander.exp += expGain;
          attacker.affection = Math.min(100, attacker.affection + affGain);
          addLog(`⭐ ${attacker.name} 호감도 +${affGain}, 지휘관 경험치 +${expGain} EXP 획득!`, 'success');

          // 지휘관 레벨업 검사
          if (state.commander.exp >= state.commander.maxExp) {
            state.commander.level += 1;
            state.commander.exp -= state.commander.maxExp;
            state.commander.maxExp = Math.round(state.commander.maxExp * 1.4);
            state.commander.skillPoints += 1;
            addLog(`👑 [지휘관 레벨업!] Lv.${state.commander.level} 달성! (스킬 포인트 +1 SP 획득)`, 'gold');
          }

          // 승리 시 적진 돌파 및 타일 전진 점령 (해당 타일에 남은 적이 없을 때)
          const remainingEnemiesAtTile = state.enemyUnits.filter(e => !e.isDead && e.x === defender.x && e.y === defender.y);
          if (remainingEnemiesAtTile.length === 0) {
            const startX = attacker.x;
            const startY = attacker.y;
            const targetX = defender.x;
            const targetY = defender.y;
            const targetTile = getTile(targetX, targetY);

            if (state.stackMoveEnabled) {
              const squad = state.playerUnits.filter(u => !u.isDead && u.x === startX && u.y === startY && !u.isInactivated);
              squad.forEach(m => {
                m.x = targetX;
                m.y = targetY;
              });
              addLog(`🚩 [적진 돌파 점령!] ${attacker.name} 부대(총 ${squad.length}기)가 적을 소탕하고 [${targetTile ? targetTile.name : '목표'}] 타일로 전진 진격했습니다!`, 'gold');
            } else {
              attacker.x = targetX;
              attacker.y = targetY;
              addLog(`🚩 [적진 돌파 점령!] ${attacker.name}이(가) 적을 격퇴하고 [${targetTile ? targetTile.name : '목표'}] 타일로 전진 진격했습니다!`, 'gold');
            }
          }
        } else {
          // B. 적군(AI)의 공격 성공 -> 아군 유닛 영구 전사
          addLog(`💀 [아군 전사 (Permadeath)] 적 ${attacker.name}의 치명적인 공격에 아군 ${defender.name}이(가) 전사하여 영구 삭제되었습니다!`, 'danger');
          addLog(`💡 앗! 상단의 [⏳ 리와인더] 버튼을 눌러 직전 턴 상태로 복구할 수 있습니다!`, 'warning');

          // 인접 아군 유닛들에게 스플래시 피해
          const splashRatio = debugParams.collateralDamageMultiplier ?? 0.30;
          if (splashRatio > 0) {
            const splashDamage = Math.round(finalAtk * splashRatio);
            const adjPlayers = state.playerUnits.filter(p =>
              !p.isDead && p.id !== defender.id &&
              Math.abs(p.x - defender.x) <= 1 && Math.abs(p.y - defender.y) <= 1
            );
            if (adjPlayers.length > 0) {
              adjPlayers.forEach(adj => {
                adj.hp = Math.max(0, adj.hp - splashDamage);
                if (adj.hp <= 0) adj.isDead = true;
                addLog(`💥 [적군 스플래시 피해] 인접 아군 ${adj.name}에게 ${splashDamage} 피해! (잔여 HP: ${adj.hp}/${adj.maxHp})`, 'danger');
              });
            }
          }

          // 해당 타일에 아군이 모두 없으면 적군이 전진 돌파
          const remainingPlayersAtTile = state.playerUnits.filter(p => !p.isDead && p.x === defender.x && p.y === defender.y);
          if (remainingPlayersAtTile.length === 0) {
            attacker.x = defender.x;
            attacker.y = defender.y;
            const targetTile = getTile(defender.x, defender.y);
            addLog(`🚩 [적군 전선 돌파] ${attacker.name}이(가) 아군 거점을 돌파하고 [${targetTile ? targetTile.name : '타일'}]로 진격했습니다!`, 'danger');
          }
        }
      } else {
        // 공격자 패배: 공격자(attacker) 영구 사망 (HP 0)
        attacker.isDead = true;
        attacker.hp = 0;
        if (attacker.stats) attacker.stats.hp = 0;
        if (attacker.owner === 'ENEMY') {
          window.defeatedEnemyCount = (window.defeatedEnemyCount || 0) + 1;
          defeatedEnemyCount = window.defeatedEnemyCount;
        }

        // 수비자 교환 피해 적용 (HP 1 이상 정수 유지)
        if (roundDmg.defenderDamage > 0) {
          defender.hp = Math.max(1, Math.round(defender.hp - roundDmg.defenderDamage));
          if (defender.stats) defender.stats.hp = defender.hp;
          addLog(`🗡️ [공격측 발악 타격] ${attacker.name}의 돌격으로 ${defender.name}에게 ${roundDmg.defenderDamage} 피해 (잔여 HP: ${defender.hp}/${defender.maxHp})`, 'warning');
        }

        if (isPlayerAttacker) {
          addLog(`💀 [영구 사망 (Permadeath)] ${attacker.name}이(가) 치명타를 입고 전사하여 영구 삭제되었습니다!`, 'danger');
          addLog(`💡 앗! 실수인가요? 상단의 [⏳ 리와인더] 버튼을 눌러 직전 턴 상태로 복구할 수 있습니다!`, 'warning');
        } else {
          // 적군 공격자가 아군 수비자의 반격에 격퇴됨
          addLog(`🛡️ [반격 섬멸 성공!] 아군 ${defender.name}이(가) 적 ${attacker.name}의 돌격을 완벽히 저지하고 역공으로 적을 섬멸했습니다!`, 'success');
          const lootGold = 35 + attacker.level * 10;
          state.gold += lootGold;
          addLog(`🏆 [적 격퇴 전리품] +${lootGold}G 국고 획득!`, 'gold');
          state.commander.exp += 20;

          // 반격 승리 시 적 포섭 판정 (50%)
          const canCapture = Math.random() < 0.50;
          if (canCapture) {
            const initAffection = skills.StrategicDominance ? 50 : 25;
            const newUnitId = 'cap_' + Date.now();
            const capturedUnit = {
              id: newUnitId,
              owner: 'PLAYER',
              name: '포섭된 ' + attacker.name,
              classType: attacker.classType,
              avatar: attacker.avatar,
              level: attacker.level,
              hp: 70,
              maxHp: 100,
              stats: { hp: 70, maxHp: 100, atk: attacker.atk, def: attacker.def, mobility: 2 },
              atk: attacker.atk,
              def: attacker.def,
              baseAP: 2,
              ap: 0,
              affection: initAffection,
              upkeep: 8,
              x: defender.x,
              y: defender.y,
              isInactivated: false,
              isDead: false,
              promotions: { combatRank: 0 }
            };
            state.playerUnits.push(capturedUnit);
            addLog(`🎉 [적 유닛 포섭 성공!] 항복한 ${attacker.name}을(를) 아군 부대로 영입했습니다! (초기 호감도: ${initAffection})`, 'capture');
          }
        }
      }

      // 부대 전멸 상태 검증 (All-Units Defeat State Guard)
      if (typeof checkPartyWipeout === 'function') {
        checkPartyWipeout();
      }

      // 범용 전술 전장 승리 검증 및 보상 정산 (Universal Tactical Map Victory Check)
      if (typeof window.checkTacticalVictory === 'function') {
        window.checkTacticalVictory();
      }

      currentInteractionMode = null;
      renderAll();
      updateDebugInspector();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Move Logic (Single Unit & Coordinated Stack Movement)
       -------------------------------------------------------------------------- */
    function showStackAlertModal(title, messageHtml) {
      const modal = document.getElementById('modal-stack-alert');
      const titleEl = document.getElementById('stack-alert-title');
      const bodyEl = document.getElementById('stack-alert-body');
      if (titleEl) titleEl.innerText = title;
      if (bodyEl) bodyEl.innerHTML = messageHtml;
      if (modal) modal.classList.add('active');
    }

    function executeMove(unit, targetX, targetY) {
      const skills = state.commander.unlockedSkills;
      const costAP = skills.RapidAdvance ? 1 : 1; // 신속한 진격: 적은 AP 소모

      const startX = unit.x;
      const startY = unit.y;
      const targetTile = getTile(targetX, targetY);

      // 출발 타일에 주둔 중인 아군 유닛 수집
      const friendlyAtStart = state.playerUnits.filter(u => !u.isDead && u.x === startX && u.y === startY);
      const isStackMove = !!state.stackMoveEnabled && friendlyAtStart.length > 1;

      if (isStackMove) {
        // [사용자 요구사항] 부대가 중첩되었을 때 함께이동(ON) 상태면 최소 AP 기준으로 움직임.
        // 누군가 AP가 부족하여 함께 이동할 수 없으면 팝업으로 알리고 이동 중단!
        const insufficientUnits = friendlyAtStart.filter(u => u.isInactivated || u.ap < costAP);

        if (insufficientUnits.length > 0) {
          const namesStr = insufficientUnits.map(u => `${u.name}(AP ${u.ap}/${u.baseAP}${u.isInactivated ? ', 비활성' : ''})`).join(', ');
          addLog(`🚫 [부대 함께 이동 불가] ${namesStr}의 행동력(AP)이 부족하여 부대가 함께 이동할 수 없습니다! (필요 AP: ${costAP})`, 'danger');

          const detailListHtml = friendlyAtStart.map(u => {
            const isLack = u.isInactivated || u.ap < costAP;
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; background: ${isLack ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.08)'}; border: 1px solid ${isLack ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.2)'}; font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 16px;">${u.avatar}</span>
                  <div>
                    <span style="font-weight: 700; color: ${isLack ? '#ef4444' : '#15803d'};">${u.name}</span>
                    <span style="font-size: 9px; opacity: 0.8; margin-left: 4px;">Lv.${u.level} ${u.classType || ''}</span>
                  </div>
                </div>
                <div style="text-align: right;">
                  <span style="font-weight: 800; color: ${isLack ? '#dc2626' : '#16a34a'};">AP ${u.ap} / ${u.baseAP}</span>
                  ${isLack ? `<span style="display: block; font-size: 9px; color: #ef4444; font-weight: 700;">이동 불가 (-${costAP - u.ap} AP)</span>` : `<span style="display: block; font-size: 9px; color: #16a34a;">이동 준비 완료</span>`}
                </div>
              </div>
            `;
          }).join('');

          const alertHtml = `
            <div style="font-size: 12px; line-height: 1.5; color: #1e293b;">
              <p style="margin: 0 0 6px 0;">
                현재 <b>함께이동(ON)</b> 모드로 부대 전체가 동시 진격을 시도했으나, 
                <b style="color: #dc2626;">행동력(AP)이 부족한 부대원</b>이 있어 함께 이동할 수 없습니다.
              </p>
              <div style="background: #f8fafc; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; border-left: 3px solid #f59e0b; color: #475569;">
                <b>필요 최소 AP:</b> <span style="color: #d97706; font-weight: 800;">${costAP} AP</span> (신속한 진격 기준)<br>
                <b>부족한 유닛:</b> <span style="color: #dc2626; font-weight: 700;">${insufficientUnits.map(u => u.name).join(', ')}</span>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto;">
              ${detailListHtml}
            </div>
            <div style="display: flex; gap: 6px; margin-top: 4px;">
              <button class="btn-buy" style="flex: 1; padding: 8px; background: #0284c7; color: white; font-size: 11px;" onclick="closeAllModals()">
                확인 (부대 대기)
              </button>
              <button class="btn-buy" style="flex: 1; padding: 8px; background: #475569; color: white; font-size: 11px;" onclick="state.stackMoveEnabled = false; closeAllModals(); renderAll(); addLog('👤 [이동 모드 변경] 개별 이동 모드로 전환되었습니다. 이제 각 유닛을 단독 이동할 수 있습니다.', 'system');">
                개별 이동 모드로 전환 👤
              </button>
            </div>
          `;

          showStackAlertModal('⚠️ 부대 함께 이동 불가 (AP 부족)', alertHtml);
          return;
        }

        // 전체 부대원이 최소 AP 요건을 만족하므로 함께 이동 실행!
        saveHistorySnapshot();

        friendlyAtStart.forEach(m => {
          m.x = targetX;
          m.y = targetY;
          m.ap = Math.max(0, m.ap - costAP);
        });

        const minRemainingAP = Math.min(...friendlyAtStart.map(m => m.ap));
        const totalAtDest = state.playerUnits.filter(u => !u.isDead && u.x === targetX && u.y === targetY).length;
        addLog(`👟 [부대 동시 진격 완료!] 아군 총 ${friendlyAtStart.length}기가 [${targetTile.name}] 타일로 최소 AP(${costAP})를 소모하여 함께 이동했습니다! (부대 최소 잔여 AP: ${minRemainingAP}) [도착 타일 총 ${totalAtDest}기 주둔]`, 'success');
      } else {
        // 개별 단독 이동
        if (unit.isInactivated || unit.ap < costAP) {
          addLog(`⚠️ [이동 불가] ${unit.name}의 행동력(AP)이 부족합니다! (필요: ${costAP}, 현재: ${unit.ap})`, 'warning');
          return;
        }

        saveHistorySnapshot();

        unit.x = targetX;
        unit.y = targetY;
        unit.ap = Math.max(0, unit.ap - costAP);

        const friendlyStack = state.playerUnits.filter(u => !u.isDead && u.x === targetX && u.y === targetY);
        if (friendlyStack.length > 1) {
          addLog(`👟 [중첩 이동 완료] ${unit.name} -> [${targetTile.name}] (해당 타일에 아군 총 ${friendlyStack.length}기 중첩 집결! 잔여 AP: ${unit.ap})`, 'success');
        } else {
          addLog(`👟 [이동 완료] ${unit.name} -> [${targetTile.name}] (잔여 AP: ${unit.ap})`, 'system');
        }
      }

      currentInteractionMode = null;
      renderAll();
      updateDebugInspector();
    }

    /* --------------------------------------------------------------------------
       End Turn & Economy System (Upkeep + Village/City Safe Zone)
       -------------------------------------------------------------------------- */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function computeZocTiles() {
      const zocSet = new Set();
      const aliveEnemies = state.enemyUnits.filter(e => !e.isDead);
      aliveEnemies.forEach(e => {
        // 8방향 인접 타일들을 ZOC 통제 구역으로 판정
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = e.x + dx;
            const ny = e.y + dy;
            if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
              const hasEnemy = aliveEnemies.some(oe => oe.x === nx && oe.y === ny);
              if (!hasEnemy) {
                zocSet.add(`${nx},${ny}`);
              }
            }
          }
        }
      });
      return Array.from(zocSet).map(s => {
        const [x, y] = s.split(',').map(Number);
        return { x, y };
      });
    }

    function updateTurnUIState() {
      const banner = document.getElementById('ai-turn-banner');
      const endTurnBtn = document.getElementById('btn-end-turn');
      if (banner) {
        banner.style.display = isEnemyTurnProcessing ? 'flex' : 'none';
      }
      if (endTurnBtn) {
        if (isEnemyTurnProcessing) {
          endTurnBtn.classList.add('processing-enemy-turn');
          endTurnBtn.disabled = true;
          endTurnBtn.innerText = '적 AI 작전 중... 👾';
        } else {
          endTurnBtn.classList.remove('processing-enemy-turn');
          endTurnBtn.disabled = false;
          endTurnBtn.innerText = '턴 종료 ⏳';
        }
      }
    }

    async function executeEnemyDecision(enemy) {
      if (enemy.isDead || enemy.ap <= 0) return false;

      const livingPlayers = state.playerUnits.filter(p => !p.isDead);
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
      ];

      // ========================================================================
      // 우선순위 1: 플레이어 유닛 공격 (Combat Trigger)
      // 사거리(1) 또는 이동 가능한 타일(2) 내에 공격 가능한 플레이어 유닛이 존재하는 경우,
      // 가장 HP가 낮거나 사거리에 가까운 플레이어 유닛을 타겟팅하여 이동 후 즉시 공격
      // ========================================================================
      if (livingPlayers.length > 0) {
        const attackCandidates = [];

        livingPlayers.forEach(p => {
          const dist = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y);
          if (dist === 1) {
            // 즉시 공격 가능 (사거리 1)
            attackCandidates.push({
              target: p,
              dist: 1,
              requiresMove: false,
              hp: p.hp
            });
          } else if (dist === 2 && enemy.ap >= 2) {
            // 1보 전진 후 공격 가능 (AP 2 필요)
            // 전진 가능한 중간 타일 탐색 (아군 플레이어 유닛이 없는 빈 타일)
            const midTiles = directions
              .map(d => ({ x: enemy.x + d.dx, y: enemy.y + d.dy }))
              .filter(pt => getTile(pt.x, pt.y) && !state.playerUnits.some(pu => !pu.isDead && pu.x === pt.x && pu.y === pt.y) && (Math.abs(pt.x - p.x) + Math.abs(pt.y - p.y) === 1));

            if (midTiles.length > 0) {
              attackCandidates.push({
                target: p,
                dist: 2,
                requiresMove: true,
                moveStep: midTiles[0],
                hp: p.hp
              });
            }
          }
        });

        if (attackCandidates.length > 0) {
          // 정렬 기준: 1. 사거리(dist) 오름차순 -> 2. HP 오름차순 (가장 취약한 유닛 우선)
          attackCandidates.sort((a, b) => {
            if (a.dist !== b.dist) return a.dist - b.dist;
            return a.hp - b.hp;
          });

          const chosen = attackCandidates[0];

          if (chosen.requiresMove && chosen.moveStep) {
            enemy.x = chosen.moveStep.x;
            enemy.y = chosen.moveStep.y;
            enemy.ap -= 1;
            const destTile = getTile(chosen.moveStep.x, chosen.moveStep.y);
            addLog(`👟 [적군 돌격 기동] ${enemy.name}이(가) 아군 ${chosen.target.name}을(를) 요격하기 위해 [${destTile ? destTile.name : '타일'}](${chosen.moveStep.x}, ${chosen.moveStep.y})로 전진했습니다! (잔여 AP: ${enemy.ap})`, 'warning');
            renderAll();
            await sleep(350);
          }

          if (!enemy.isDead && enemy.ap > 0) {
            addLog(`⚔️ [적군 기습 공격] ${enemy.name}이(가) 아군 ${chosen.target.name}(HP: ${chosen.target.hp}/${chosen.target.maxHp})에게 전투를 개시합니다!`, 'danger');
            executeCombat(enemy, chosen.target);
            renderAll();
            await sleep(400);
          }
          return true;
        }
      }

      // 유닛이 이동할 수 있는 인접 타일 탐색 (플레이어 유닛이 주둔 중이지 않은 타일)
      const validMoves = directions
        .map(d => ({ x: enemy.x + d.dx, y: enemy.y + d.dy }))
        .filter(pt => getTile(pt.x, pt.y) && !state.playerUnits.some(pu => !pu.isDead && pu.x === pt.x && pu.y === pt.y));

      if (validMoves.length === 0) return false;

      // ========================================================================
      // 우선순위 2: 마을/도시 및 길목 차단 (ZOC / 포위망 형성)
      // 3셀 이내에 다른 적 유닛이 존재하는 경우, 상호 2셀 간격을 유지하며 길목 차단
      // ========================================================================
      const allyEnemies = state.enemyUnits.filter(e => !e.isDead && e.id !== enemy.id && (Math.abs(e.x - enemy.x) + Math.abs(e.y - enemy.y) <= 3));
      if (allyEnemies.length > 0) {
        const chokePoints = tiles.filter(t => t.isSafe || t.isCity || t.type === 'village' || t.type === 'city');

        // 각 후보 타일의 ZOC 포위망 적합도 점수 계산
        function scoreZocTile(pt) {
          let score = 0;
          // 1. 아군 적 유닛과 상호 2셀 간격 유지 보너스
          allyEnemies.forEach(a => {
            const d = Math.abs(pt.x - a.x) + Math.abs(pt.y - a.y);
            if (d === 2) score += 60; // 2셀 간격 유지 최고 점수
            else if (d === 1) score += 20; // 1셀(중첩/인접) 차선책
            else if (d === 3) score += 10;
          });

          // 2. 주요 거점 및 길목(마을, 도시 입구) 차단 보너스
          if (chokePoints.length > 0) {
            const minKeyDist = Math.min(...chokePoints.map(c => Math.abs(pt.x - c.x) + Math.abs(pt.y - c.y)));
            score -= minKeyDist * 5;
          }

          // 3. 플레이어 전선과의 대치 거리 (2~3셀 거리 압박)
          if (livingPlayers.length > 0) {
            const minPlayerDist = Math.min(...livingPlayers.map(p => Math.abs(pt.x - p.x) + Math.abs(pt.y - p.y)));
            score -= Math.abs(minPlayerDist - 2) * 8;
          }

          return score;
        }

        const currentScore = scoreZocTile({ x: enemy.x, y: enemy.y });
        let bestTile = null;
        let highestScore = currentScore;

        validMoves.forEach(m => {
          const s = scoreZocTile(m);
          if (s > highestScore) {
            highestScore = s;
            bestTile = m;
          }
        });

        if (bestTile) {
          enemy.x = bestTile.x;
          enemy.y = bestTile.y;
          enemy.ap -= 1;
          const targetTile = getTile(bestTile.x, bestTile.y);
          addLog(`🛡️ [적군 ZOC 차단선 형성] ${enemy.name}이(가) 동료 적군과 2셀 간격의 ZOC 포위망을 형성하며 [${targetTile ? targetTile.name : '길목'}](${bestTile.x}, ${bestTile.y})을(를) 차단했습니다! (잔여 AP: ${enemy.ap})`, 'warning');
          renderAll();
          return true;
        }
      }

      // ========================================================================
      // 우선순위 3: 마을/도시 거점 점령 및 압박
      // 가장 가까운 미점령 마을이나 도시(왕도/요새) 방향으로 전진 이동하여 거점 압박
      // ========================================================================
      const baseTargets = tiles.filter(t => t.isCity || t.type === 'village' || t.isSafe);
      if (baseTargets.length > 0) {
        let nearestBase = null;
        let minDistToBase = Infinity;

        baseTargets.forEach(b => {
          const d = Math.abs(enemy.x - b.x) + Math.abs(enemy.y - b.y);
          if (d < minDistToBase) {
            minDistToBase = d;
            nearestBase = b;
          }
        });

        if (nearestBase && minDistToBase > 0) {
          let bestBaseMove = null;
          let minDistanceAfterMove = minDistToBase;

          validMoves.forEach(m => {
            const d = Math.abs(m.x - nearestBase.x) + Math.abs(m.y - nearestBase.y);
            if (d < minDistanceAfterMove) {
              minDistanceAfterMove = d;
              bestBaseMove = m;
            }
          });

          if (bestBaseMove) {
            enemy.x = bestBaseMove.x;
            enemy.y = bestBaseMove.y;
            enemy.ap -= 1;
            const targetTile = getTile(bestBaseMove.x, bestBaseMove.y);
            addLog(`🏰 [적군 거점 압박] ${enemy.name}이(가) [${nearestBase.name}] 방면으로 전진 진격했습니다! -> [${targetTile ? targetTile.name : '타일'}](${bestBaseMove.x}, ${bestBaseMove.y}) (잔여 AP: ${enemy.ap})`, 'warning');
            renderAll();
            return true;
          }
        }
      }

      // ========================================================================
      // 우선순위 4: 정찰 및 배회 (Scout / Roam)
      // 플레이어 시작 지점(왕도 에테르니아 3, 4) 또는 생존 플레이어 방면으로 접근 탐색
      // ========================================================================
      const roamTarget = livingPlayers.length > 0 ? livingPlayers[0] : { x: 3, y: 4 };
      const curDistToRoam = Math.abs(enemy.x - roamTarget.x) + Math.abs(enemy.y - roamTarget.y);
      let bestRoamMove = null;
      let minRoamDist = curDistToRoam;

      validMoves.forEach(m => {
        const d = Math.abs(m.x - roamTarget.x) + Math.abs(m.y - roamTarget.y);
        if (d < minRoamDist) {
          minRoamDist = d;
          bestRoamMove = m;
        }
      });

      if (!bestRoamMove && validMoves.length > 0) {
        // 거리 감소가 없더라도 무작위 배회 탐색
        bestRoamMove = validMoves[Math.floor(Math.random() * validMoves.length)];
      }

      if (bestRoamMove) {
        enemy.x = bestRoamMove.x;
        enemy.y = bestRoamMove.y;
        enemy.ap -= 1;
        const targetTile = getTile(bestRoamMove.x, bestRoamMove.y);
        addLog(`🧭 [적군 수색 정찰] ${enemy.name}이(가) 아군 거점 방면을 수색 정찰 중입니다 -> [${targetTile ? targetTile.name : '타일'}](${bestRoamMove.x}, ${bestRoamMove.y}) (잔여 AP: ${enemy.ap})`, 'warning');
        renderAll();
        return true;
      }

      return false;
    }

    async function processEnemyTurn() {
      isEnemyTurnProcessing = true;
      updateTurnUIState();
      addLog(`👾 [적 AI 군단 턴 개시] 적 유닛들이 작전을 개시합니다...`, 'warning');
      renderAll();
      await sleep(400);

      // 생존 적 유닛 AP 회복
      const aliveEnemies = state.enemyUnits.filter(e => !e.isDead);
      aliveEnemies.forEach(e => {
        e.owner = 'ENEMY';
        if (typeof e.baseAP !== 'number') e.baseAP = 2;
        e.ap = e.baseAP;
      });

      // 각 적 유닛 순차적으로 행동 실행 (async/await 딜레이 350ms~500ms)
      for (const enemy of aliveEnemies) {
        if (enemy.isDead) continue;

        while (enemy.ap > 0 && !enemy.isDead) {
          const acted = await executeEnemyDecision(enemy);
          if (!acted) break; // 더 이상 가능한 행동이 없으면 다음 유닛으로
          await sleep(350);
        }
      }

      addLog(`🛡️ [적 AI 작전 완료] 적 군단의 모든 행동이 완료되었습니다.`, 'system');
      await sleep(300);
      isEnemyTurnProcessing = false;
      updateTurnUIState();
      if (typeof window.checkTacticalVictory === 'function') {
        window.checkTacticalVictory();
      }
      renderAll();
    }

    async function executeEndTurn() {
      if (isEnemyTurnProcessing) return;
      saveHistorySnapshot();

      // 1. 플레이어 턴 종료
      addLog(`🔚 [제 ${state.turn}턴 아군 작전 종료] 지휘관의 턴이 마감되었습니다.`, 'system');

      // 2. 필드 유닛 유지비 차감
      const livingUnits = state.playerUnits.filter(u => !u.isDead);
      let totalUpkeepNeeded = 0;
      let fieldUnits = [];
      let safeUnits = 0;

      livingUnits.forEach(unit => {
        const tile = getTile(unit.x, unit.y);
        // 마을(1x1) 및 도시(2x2)는 유지비 0G 완전 면제
        if (tile && tile.isSafe) {
          unit.isInactivated = false;
          safeUnits++;
        } else {
          totalUpkeepNeeded += unit.upkeep;
          fieldUnits.push(unit);
        }
      });

      addLog(`🌾 [유지비 정산] 안전지대 주둔: ${safeUnits}기(0G 면제), 필드 유닛: ${fieldUnits.length}기(청구액: ${totalUpkeepNeeded}G)`, 'gold');

      if (state.gold >= totalUpkeepNeeded) {
        state.gold -= totalUpkeepNeeded;
        fieldUnits.forEach(u => u.isInactivated = false);
        addLog(`✅ 유지비 ${totalUpkeepNeeded}G 정상 납부 완료. (보유 잔액: ${state.gold}G)`, 'gold');
      } else {
        // 골드 부족: 고레벨 유닛부터 지불, 부족한 유닛은 영구 사망이 아닌 'isInactivated' 처리
        addLog(`⚠️ [골드 부족 경보!] 보유 골드(${state.gold}G)가 유지비(${totalUpkeepNeeded}G)보다 부족합니다!`, 'danger');
        fieldUnits.sort((a, b) => b.level - a.level);
        let curGold = state.gold;
        fieldUnits.forEach(u => {
          if (curGold >= u.upkeep) {
            curGold -= u.upkeep;
            u.isInactivated = false;
          } else {
            u.isInactivated = true;
            addLog(`⛔ [체납 비활성화] ${u.name}(Lv.${u.level}) -> 작전 정지 (사망하지 않음)`, 'warning');
          }
        });
        state.gold = curGold;
      }

      currentInteractionMode = null;
      renderAll();
      saveGameState();

      // 3. 적 AI 턴 시작 (processEnemyTurn)
      await processEnemyTurn();

      // 4. 플레이어 턴 개시 및 AP 리셋
      state.turn += 1;
      addLog(`========== [제 ${state.turn}턴 아군 작전 개시] ==========`, 'system');

      const currentLiving = state.playerUnits.filter(u => !u.isDead);
      currentLiving.forEach(u => {
        u.ap = u.isInactivated ? 0 : u.baseAP;
        // 고유 스킬 쿨다운 1턴 감소 및 버프 리셋
        if (u.customSkillCooldown && u.customSkillCooldown > 0) {
          u.customSkillCooldown -= 1;
          if (u.customSkillCooldown === 0 && u.customSkill) {
            addLog(`✨ [스킬 재사용 가능] ${u.name}의 고유 스킬 [${u.customSkill.name}] 쿨다운이 완료되었습니다!`, 'gold');
          }
        }
        u.customSkillBuffAtk = 0;
        u.customSkillBuffDef = 0;
        u.isGuarding = false;
        u.guardBonusDef = 0;
        u.stance = 'NORMAL';
      });

      // 선택된 유닛 갱신 (적 턴 중 사망했을 수 있으므로)
      const sel = getSelectedUnit();
      if (!sel || sel.isDead) {
        const firstLiving = currentLiving[0];
        if (firstLiving) selectedUnitId = firstLiving.id;
      }

      currentInteractionMode = null;
      isEnemyTurnProcessing = false;
      updateTurnUIState();
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Offline Defense Simulation (비동기 수비 모드)
       -------------------------------------------------------------------------- */
    function runOfflineDefenseSimulation() {
      closeAllModals();
      saveHistorySnapshot();

      addLog(`🛡️ [오프라인 수비 시뮬레이션 가동] 가상 침공 레이드가 발생했습니다!`, 'warning');

      const livingUnits = state.playerUnits.filter(u => !u.isDead);
      const safeUnits = [];
      const fieldUnits = [];

      livingUnits.forEach(u => {
        const t = getTile(u.x, u.y);
        if (t && t.isSafe) {
          safeUnits.push(u);
        } else {
          fieldUnits.push(u);
        }
      });

      addLog(`🏰 안전지대(마을/도시) 주둔 유닛 ${safeUnits.length}기는 완벽히 보호되었습니다.`, 'success');

      if (fieldUnits.length === 0) {
        addLog(`🎉 필드에 노출된 유닛이 없어 적 침공군이 아무것도 얻지 못하고 퇴각했습니다!`, 'success');
        renderAll();
        return;
      }

      // 필드 유닛은 방어 모드 보너스(+20% 방어력)로 방어 시도
      addLog(`⚔️ 필드 주둔 유닛 ${fieldUnits.length}기가 긴급 방어 진형을 전개합니다.`, 'combat');

      // 가상 적의 총 공격력 vs 아군 총 방어력
      const totalDef = fieldUnits.reduce((acc, u) => acc + (u.def * 1.2), 0);
      const enemyRaidPower = 80 + Math.floor(Math.random() * 80);

      addLog(`📊 [침공 전력] 가상 적군 공격력 ${enemyRaidPower} VS 아군 총 방어력 ${totalDef.toFixed(0)}`, 'combat');

      if (totalDef >= enemyRaidPower) {
        // 수비 성공
        addLog(`🎉 [수비 대성공!] 강력한 방패 장벽으로 야간 기습을 완벽 격퇴했습니다!`, 'success');
      } else {
        // 패배 시: 전멸하지 않고 가장 약한 유닛 1기만 탈취/사망!
        fieldUnits.sort((a, b) => (a.atk + a.def + a.hp) - (b.atk + b.def + b.hp));
        const weakest = fieldUnits[0];
        weakest.isDead = true;

        addLog(`💥 [방어선 돌파!] 적의 야간 공습으로 방어선이 무너졌습니다!`, 'danger');
        addLog(`💀 [유닛 1기 탈취] 전멸하지 않고 가장 약했던 [${weakest.name}] 1개만 탈취/사망 처리되었습니다!`, 'danger');
        addLog(`⏱️ [1시간 보호막] 잔여 부대 전체에 1시간(1턴) 동안 긴급 방어막이 부여되어 연속 피해가 차단됩니다.`, 'system');
      }

      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       City Unit Sale (2x2 도시 전용 유닛 매각)
       -------------------------------------------------------------------------- */
    function executeCitySell() {
      const unit = getSelectedUnit();
      if (!unit) return;

      const tile = getTile(unit.x, unit.y);
      if (!tile || !tile.isCity) {
        const msg = '⚠️ 도시(2x2) 타일에 위치한 유닛만 매각할 수 있습니다!';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      saveHistorySnapshot();

      // 매각 환급 공식: 기본금 + 레벨보너스 + 호감도보너스 + 승급보너스
      const baseMap = { KNIGHT: 220, MAGE: 200, FIREARM: 180, ARCHER: 150, MELEE: 120 };
      const baseGold = baseMap[unit.classType] || 120;
      const levelMult = 1 + (unit.level - 1) * 0.35;
      const affBonus = Math.round(unit.affection * 2.0);
      const refund = Math.round(baseGold * levelMult + affBonus);

      unit.isDead = true;
      state.gold += refund;

      addLog(`🏛️ [도시 유닛 매각] ${unit.name} 명예 퇴역 완료 -> +${refund}G 국고 환급!`, 'gold');
      closeAllModals();
      renderAll();
      saveGameState();
    }

    function executeCityUpgrade(cost) {
      const unit = getSelectedUnit();
      if (!unit) return;

      if (state.gold < cost) {
        const msg = `⚠️ 골드가 부족합니다! (필요: ${cost}G)`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      saveHistorySnapshot();
      state.gold -= cost;
      unit.level += 1;
      unit.atk += 8;
      unit.def += 6;
      unit.maxHp += 20;
      unit.hp = unit.maxHp;
      if (!unit.promotions) unit.promotions = {};
      unit.promotions.combatRank = (unit.promotions.combatRank || 0) + 1;

      addLog(`⚔️ [아카데미 진급] ${unit.name} 레벨업! (Lv.${unit.level}, 공 +8, 방 +6, 최대 HP +20)`, 'gold');
      closeAllModals();
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Village Store Items (호감도 과일, 만찬, 리와인더)
       -------------------------------------------------------------------------- */
    function buyVillageItem(type, cost, affAdd) {
      if (state.gold < cost) {
        const msg = `⚠️ 골드가 부족합니다! (필요: ${cost}G)`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      const unit = getSelectedUnit();
      if (type === 'REWIND') {
        saveHistorySnapshot();
        state.gold -= cost;
        state.rewinders += 1;
        addLog(`⏳ [리와인더 충전] 시공간 리와인더 1개 충전 완료! (보유: ${state.rewinders}개)`, 'gold');
        closeAllModals();
        renderAll();
        saveGameState();
        return;
      }

      if (!unit) {
        const msg = '⚠️ 호감도를 부여할 유닛을 먼저 선택하세요!';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      saveHistorySnapshot();
      state.gold -= cost;
      unit.affection = Math.min(100, unit.affection + affAdd);
      addLog(`🎁 [선물 증정] ${unit.name}에게 보급품을 전달하여 호감도가 +${affAdd} 상승했습니다! (현재: ${unit.affection})`, 'success');
      closeAllModals();
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       UI Rendering & Event Listeners
       -------------------------------------------------------------------------- */
    function renderGrid() {
      const mapEl = document.getElementById('grid-map');
      if (!mapEl) return;
      mapEl.innerHTML = '';

      const currentTiles = (state && state.tiles && state.tiles.length > 0) ? state.tiles : tiles;
      const maxRow = currentTiles.reduce((max, t) => Math.max(max, t.y), 0);
      const rowCount = maxRow >= 10 ? 14 : 10;
      mapEl.style.display = 'grid';
      mapEl.style.gridTemplateColumns = 'repeat(8, 1fr)';
      mapEl.style.gridTemplateRows = `repeat(${rowCount}, 1fr)`;
      if (rowCount === 14) {
        mapEl.classList.add('grid-8x14');
      } else {
        mapEl.classList.remove('grid-8x14');
      }

      const selUnit = getSelectedUnit();
      let moveTiles = [];
      let attackTiles = [];
      const zocTiles = computeZocTiles();

      if (selUnit && !selUnit.isDead && !selUnit.isInactivated && selUnit.ap > 0) {
        // 이동 범위 (상하좌우 1~2칸 맨해튼 거리)
        const range = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;
        currentTiles.forEach(t => {
          const dist = Math.abs(t.x - selUnit.x) + Math.abs(t.y - selUnit.y);
          if (dist > 0 && dist <= range) {
            const hasEnemy = state.enemyUnits.some(e => !e.isDead && e.x === t.x && e.y === t.y);
            if (hasEnemy) {
              attackTiles.push(t);
            } else {
              // 적이 없는 타일은 빈 타일 및 아군 유닛이 이미 있는 타일 모두 이동/중첩 가능!
              moveTiles.push(t);
            }
          }
        });
      }

      currentTiles.forEach(t => {
        const tileDiv = document.createElement('div');
        const terrainType = t.terrain || t.type || 'plain';
        tileDiv.className = `tile ${terrainType}`;
        if (t.hasRoad) tileDiv.classList.add('has-road');
        if (t.structure) tileDiv.classList.add(`structure-${t.structure}`);

        const isSelected = selUnit && selUnit.x === t.x && selUnit.y === t.y;
        if (isSelected) tileDiv.classList.add('selected');

        const isZoc = zocTiles.some(zt => zt.x === t.x && zt.y === t.y);
        if (isZoc) tileDiv.classList.add('zoc-zone');

        // 스마트 모드: 유닛이 선택되면 이동 및 공격 가능 타일이 자동으로 활성화됨
        const canMove = moveTiles.some(mt => mt.x === t.x && mt.y === t.y);
        if (canMove) tileDiv.classList.add('move-target');

        const canAttack = attackTiles.some(at => at.x === t.x && at.y === t.y);
        if (canAttack) tileDiv.classList.add('attack-target');

        // 지형 방어 보너스 뱃지 & 스마트 액션 인디케이터
        const defPct = Math.round(t.defBonus * 100);
        let actionIcon = '';
        if (canAttack) {
          actionIcon = '<span class="tile-action-indicator attack" title="클릭 시 즉시 자동 전투 개시!">⚔️</span>';
        } else if (canMove) {
          actionIcon = '<span class="tile-action-indicator move" title="클릭 시 즉시 이동">👟</span>';
        }

        const roadBadge = t.hasRoad ? '<span class="tile-road-dot" title="도로 (AP 할인)">🛣️</span>' : '';

        tileDiv.innerHTML = `
          <span class="tile-def-badge">${defPct > 0 ? '+' + defPct + '%' : ''}</span>
          ${roadBadge}
          <span class="tile-terrain-icon">${t.terrainIcon || '🌱'}</span>
          ${actionIcon}
        `;

        // 타일 위 유닛 렌더링 (다중 유닛 중첩 지원)
        const pUnits = state.playerUnits.filter(u => !u.isDead && u.x === t.x && u.y === t.y);
        const eUnits = state.enemyUnits.filter(u => !u.isDead && u.x === t.x && u.y === t.y);

        if (pUnits.length > 0) {
          // 해당 타일에서 전면에 표시할 유닛 결정 (현재 선택된 유닛 우선)
          const topUnit = pUnits.find(u => u.id === selectedUnitId) || pUnits[0];

          // 중첩 표시 언더레이 카드 (물리적 겹침 입체감)
          if (pUnits.length > 1) {
            tileDiv.classList.add('has-stack');
            const underlay = document.createElement('div');
            underlay.className = 'unit-stacked-underlay';
            tileDiv.appendChild(underlay);
          }

          const uDiv = document.createElement('div');
          uDiv.className = `unit-avatar unit-player ${pUnits.length > 1 ? 'stacked-card' : ''}`;
          const customImg = topUnit.imageUrl || customClassImages[topUnit.classType];
          if (customImg) {
            uDiv.innerHTML = `<img src="${customImg}" class="unit-avatar-img" alt="${topUnit.name}" />`;
          } else {
            uDiv.textContent = topUnit.avatar;
          }

          // 클래스 뱃지
          const badge = document.createElement('span');
          badge.className = 'unit-class-badge';
          badge.textContent = topUnit.classType[0];
          uDiv.appendChild(badge);

          // 중첩 수량 뱃지 (2기 이상일 때 표시)
          if (pUnits.length > 1) {
            const stackBadge = document.createElement('span');
            stackBadge.className = 'unit-stack-badge';
            stackBadge.innerHTML = `👥${pUnits.length}`;
            stackBadge.title = `${pUnits.length}기 아군 중첩 (클릭 시 순환 선택)`;
            uDiv.appendChild(stackBadge);
          }

          // 체력 바
          const hpBar = document.createElement('div');
          hpBar.className = 'unit-hp-bar';
          const hpPct = Math.max(0, (topUnit.hp / topUnit.maxHp) * 100);
          hpBar.innerHTML = `<div class="unit-hp-fill ${hpPct < 35 ? 'low' : ''}" style="width: ${hpPct}%;"></div>`;
          uDiv.appendChild(hpBar);

          // 체납 비활성화 표시
          if (topUnit.isInactivated) {
            const inactBadge = document.createElement('div');
            inactBadge.className = 'unit-inactivated-badge';
            inactBadge.textContent = '정지';
            uDiv.appendChild(inactBadge);
          }

          tileDiv.appendChild(uDiv);
        } else if (eUnits.length > 0) {
          const topUnit = eUnits.find(e => e.id === debugInspectedEnemyId) || eUnits.slice().sort((a, b) => b.def - a.def)[0];

          if (eUnits.length > 1) {
            tileDiv.classList.add('has-stack');
            const underlay = document.createElement('div');
            underlay.className = 'unit-stacked-underlay enemy-underlay';
            tileDiv.appendChild(underlay);
          }

          const uDiv = document.createElement('div');
          uDiv.className = `unit-avatar unit-enemy ${eUnits.length > 1 ? 'stacked-card' : ''}`;
          const customEnemyImg = topUnit.imageUrl || customClassImages[topUnit.classType];
          if (customEnemyImg) {
            uDiv.innerHTML = `<img src="${customEnemyImg}" class="unit-avatar-img" alt="${topUnit.name}" />`;
          } else {
            uDiv.textContent = topUnit.avatar;
          }

          const badge = document.createElement('span');
          badge.className = 'unit-class-badge';
          badge.textContent = topUnit.classType[0];
          uDiv.appendChild(badge);

          if (eUnits.length > 1) {
            const stackBadge = document.createElement('span');
            stackBadge.className = 'unit-stack-badge enemy';
            stackBadge.innerHTML = `👾${eUnits.length}`;
            stackBadge.title = `${eUnits.length}기 적군 밀집 중첩`;
            uDiv.appendChild(stackBadge);
          }

          const hpBar = document.createElement('div');
          hpBar.className = 'unit-hp-bar';
          const hpPct = Math.max(0, (topUnit.hp / topUnit.maxHp) * 100);
          hpBar.innerHTML = `<div class="unit-hp-fill ${hpPct < 35 ? 'low' : ''}" style="width: ${hpPct}%;"></div>`;
          uDiv.appendChild(hpBar);

          tileDiv.appendChild(uDiv);
        }

        // 클릭 이벤트
        tileDiv.onclick = () => onTileClicked(t);
        mapEl.appendChild(tileDiv);
      });
    }

    function onTileClicked(tile) {
      if (isEnemyTurnProcessing) {
        addLog('⏳ 적 AI 군단이 작전을 수행 중입니다. 잠시만 기다려주세요...', 'system');
        return;
      }
      if (window.isCombatPaused || (state && state.isCombatPaused) || (window.playerState && window.playerState.isCombatPaused)) {
        addLog('⏸️ [전투 일시정지 중] 전술 작전이 일시 정지되었습니다. 일시 정지 메뉴에서 전투를 재개해주세요.', 'warning');
        return;
      }
      const selUnit = getSelectedUnit();
      const pUnits = state.playerUnits.filter(u => !u.isDead && u.x === tile.x && u.y === tile.y);
      const eUnits = state.enemyUnits.filter(u => !u.isDead && u.x === tile.x && u.y === tile.y);

      // 디버그 패널 소환 좌표 동기화
      debugParams.targetSpawnCoord = { x: tile.x, y: tile.y };
      const coordEl = document.getElementById('lbl-spawn-target-coord');
      if (coordEl) coordEl.textContent = `타일 (X:${tile.x}, Y:${tile.y}) - ${tile.name}`;
      const numX = document.getElementById('num-spawn-x');
      const numY = document.getElementById('num-spawn-y');
      if (numX) numX.value = tile.x;
      if (numY) numY.value = tile.y;

      // ------------------------------------------------------------------------
      // CASE 1: 아군 유닛이 이미 선택되어 있는 상태 (스마트 이동 & 자동 교전 엔진)
      // ------------------------------------------------------------------------
      if (selUnit && !selUnit.isDead) {
        const dist = Math.abs(tile.x - selUnit.x) + Math.abs(tile.y - selUnit.y);
        const range = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;

        // 1-A. 동일 타일(자기 자신 주둔지) 터치 시: 중첩 유닛 순환 선택
        if (dist === 0) {
          if (pUnits.length > 1) {
            const curIdx = pUnits.findIndex(u => u.id === selectedUnitId);
            const nextIdx = (curIdx + 1) % pUnits.length;
            selectedUnitId = pUnits[nextIdx].id;
            addLog(`👥 [중첩 부대 순환] ${pUnits[nextIdx].name} 선택 (${nextIdx + 1}/${pUnits.length}기) - 다시 터치 시 다음 부대원`, 'system');
          } else {
            addLog(`ℹ️ [유닛 대기] ${selUnit.name} (현재 타일 위치 유지)`, 'system');
          }
          renderAll();
          updateDebugInspector();
          return;
        }

        // 1-B. 이동/사거리 범위 내 타일 터치 시 (dist <= range)
        if (dist <= range && !selUnit.isInactivated && selUnit.ap > 0) {
          // ⚔️ 적이 주둔 중인 타일 -> 자동 즉시 전투 (Auto-Combat) 개시!
          if (eUnits.length > 0) {
            const targetDefender = eUnits.find(e => e.id === cardInspectedEnemyId) || eUnits.find(e => e.id === debugInspectedEnemyId) || eUnits.slice().sort((a, b) => b.def - a.def)[0];
            cardInspectedEnemyId = targetDefender.id;
            debugInspectedEnemyId = targetDefender.id;
            addLog(`🎯 [스마트 자동 교전] ${selUnit.name} -> 적 ${targetDefender.name} 위치로 진격하여 자동 전투를 시작합니다!`, 'combat');
            executeCombat(selUnit, targetDefender);
            return;
          }

          // 👟 적이 없는 타일 (빈 타일 또는 다른 아군 타일) -> 즉시 이동/중첩 집결!
          executeMove(selUnit, tile.x, tile.y);
          return;
        }

        // 1-C. 사거리 밖이지만 다른 아군이 있는 타일을 터치한 경우 -> 해당 아군으로 유닛 선택 전환!
        if (pUnits.length > 0) {
          selectedUnitId = pUnits[0].id;
          userCardViewPreference = 'AUTO';
          cardInspectedEnemyId = null;
          if (pUnits.length > 1) {
            addLog(`👥 [중첩 부대 전환] (${tile.x}, ${tile.y}) 타일의 ${pUnits[0].name} 선택 (총 ${pUnits.length}기 중첩)`, 'system');
          } else {
            addLog(`🎯 [유닛 선택 전환] ${pUnits[0].name} 선택 - 이동 및 교전 가능 범위가 갱신되었습니다.`, 'system');
          }
          openFullShotOverlay();
          renderAll();
          updateDebugInspector();
          return;
        }

        // 1-D. 사거리 밖의 적 타일 터치 시 -> 정찰 정보 표시 및 디버그 타겟 지정
        if (eUnits.length > 0) {
          const defUnit = eUnits.find(e => e.id === debugInspectedEnemyId) || eUnits.slice().sort((a, b) => b.def - a.def)[0];
          debugInspectedEnemyId = defUnit.id;
          cardInspectedEnemyId = defUnit.id;
          const stackNote = eUnits.length > 1 ? ` (적군 총 ${eUnits.length}기 밀집 중첩!)` : '';
          addLog(`🔍 [사거리 밖 적 정찰] ${defUnit.name} (공 ${defUnit.atk}, 방 ${defUnit.def}, HP ${defUnit.hp}/${defUnit.maxHp})${stackNote} - 현재 사거리(${range}칸) 밖입니다.`, 'combat');
          updateDebugInspector();
          return;
        }

        // 1-E. 사거리 밖의 마을/도시 터치 시 상점 열기
        if (tile.type === 'village') {
          openVillageModal();
          return;
        }
        if (tile.type === 'city') {
          openCityModal();
          return;
        }

        // 1-F. 사거리 밖의 빈 타일 터치 시 -> 유닛 선택 해제 및 풀샷 창 닫기
        selectedUnitId = null;
        closeFullShotOverlay();
        renderAll();
        addLog(`ℹ️ [선택 해제] 전장 맵을 확인하기 위해 유닛 선택 및 풀샷 창을 닫았습니다.`, 'system');
        return;
      }

      // ------------------------------------------------------------------------
      // CASE 2: 선택된 유닛이 없는 상태에서 타일을 클릭한 경우
      // ------------------------------------------------------------------------
      if (pUnits.length > 0) {
        selectedUnitId = pUnits[0].id;
        userCardViewPreference = 'AUTO';
        cardInspectedEnemyId = null;
        addLog(`🎯 [유닛 선택] ${pUnits[0].name} 선택 - 이동(초록) 및 공격(빨강) 가능 범위가 표시됩니다.`, 'system');
        openFullShotOverlay();
        renderAll();
        updateDebugInspector();
        return;
      }

      if (eUnits.length > 0) {
        const defUnit = eUnits[0];
        debugInspectedEnemyId = defUnit.id;
        addLog(`🔍 [적 정찰] ${defUnit.name} (공 ${defUnit.atk}, 방 ${defUnit.def}, HP ${defUnit.hp}/${defUnit.maxHp})`, 'combat');
        updateDebugInspector();
        return;
      }

      if (tile.type === 'village') {
        openVillageModal();
        return;
      }
      if (tile.type === 'city') {
        openCityModal();
        return;
      }

      selectedUnitId = null;
      closeFullShotOverlay();
      currentInteractionMode = null;
      renderAll();
    }

    /* --------------------------------------------------------------------------
       Battle Victory Odds View Renderer (전투 승리 확률 카드 인터페이스)
       -------------------------------------------------------------------------- */
    function renderBattleOddsView(attacker, inRangeEnemies) {
      if (!attacker || !inRangeEnemies || inRangeEnemies.length === 0) return;

      // 대상 방어 유닛 결정 (현재 주시 중인 적 우선)
      let defender = inRangeEnemies.find(e => e.id === cardInspectedEnemyId) ||
                     inRangeEnemies.find(e => e.id === debugInspectedEnemyId) ||
                     inRangeEnemies[0];
      cardInspectedEnemyId = defender.id;
      debugInspectedEnemyId = defender.id;

      // 승률 계산 (getCombatOdds)
      const odds = getCombatOdds(attacker, defender);
      if (!odds) return;

      // 1. 공격측 (플레이어) 렌더링
      const atkAvatar = document.getElementById('odds-atk-avatar');
      const atkName = document.getElementById('odds-atk-name');
      const atkPower = document.getElementById('odds-atk-power');
      if (atkAvatar) atkAvatar.textContent = attacker.avatar;
      if (atkName) atkName.textContent = attacker.name;
      if (atkPower) atkPower.textContent = odds.finalAtk.toFixed(1);

      // 2. 방어측 (적군) 렌더링
      const defAvatar = document.getElementById('odds-def-avatar');
      const defName = document.getElementById('odds-def-name');
      const defPower = document.getElementById('odds-def-power');
      if (defAvatar) defAvatar.textContent = defender.avatar;
      if (defName) defName.textContent = defender.name;
      if (defPower) {
        const bonusTxt = odds.tileDefBonus > 0 ? `<span style="font-size:7px; opacity:0.85; margin-left:1px;">(+${Math.round(odds.tileDefBonus * 100)}%)</span>` : '';
        defPower.innerHTML = `${odds.finalDef.toFixed(1)}${bonusTxt}`;
      }

      // 3. 중앙 승률 및 게이지 바
      const winRateEl = document.getElementById('odds-win-rate');
      const statusTagEl = document.getElementById('odds-status-tag');
      const meterFillEl = document.getElementById('odds-meter-fill');

      const P = odds.P;
      const winPct = (P * 100).toFixed(1);

      let statusText = '호각';
      let statusBg = '#fef3c7';
      let statusColor = '#b45309';
      let meterColor = '#f59e0b';
      let rateColor = '#d97706';

      if (odds.isDangerAffection) {
        statusText = '🚫 거부위험';
        statusBg = '#fee2e2';
        statusColor = '#b91c1c';
        meterColor = '#ef4444';
        rateColor = '#dc2626';
      } else if (P >= 0.70) {
        statusText = '🛡️ 압도/유리';
        statusBg = '#dcfce7';
        statusColor = '#15803d';
        meterColor = '#10b981';
        rateColor = '#16a34a';
      } else if (P <= 0.35) {
        statusText = '⚠️ 불리/위험';
        statusBg = '#fee2e2';
        statusColor = '#b91c1c';
        meterColor = '#ef4444';
        rateColor = '#dc2626';
      }

      if (winRateEl) {
        winRateEl.textContent = `${winPct}%`;
        winRateEl.style.color = rateColor;
      }
      if (statusTagEl) {
        statusTagEl.textContent = statusText;
        statusTagEl.style.backgroundColor = statusBg;
        statusTagEl.style.color = statusColor;
      }
      if (meterFillEl) {
        meterFillEl.style.width = `${Math.min(100, Math.max(0, P * 100))}%`;
        meterFillEl.style.backgroundColor = meterColor;
      }

      // 4. 복수 적군 대상 선택 칩 렌더링
      const chipsContainer = document.getElementById('odds-target-chips');
      if (chipsContainer) {
        if (inRangeEnemies.length > 1) {
          chipsContainer.style.display = 'flex';
          chipsContainer.innerHTML = inRangeEnemies.map(e => {
            const eOdds = getCombatOdds(attacker, e);
            const ePct = eOdds ? `${Math.round(eOdds.P * 100)}%` : '';
            return `
              <button class="odds-target-chip ${e.id === defender.id ? 'active' : ''}" data-enemy-id="${e.id}">
                <span>${e.avatar}</span>
                <span>${e.name}</span>
                <b style="font-size:7.5px;">(${ePct})</b>
              </button>
            `;
          }).join('');
          chipsContainer.querySelectorAll('.odds-target-chip').forEach(btn => {
            btn.onclick = (ev) => {
              ev.stopPropagation();
              const eid = btn.getAttribute('data-enemy-id');
              if (eid) {
                cardInspectedEnemyId = eid;
                debugInspectedEnemyId = eid;
                renderAll();
                updateDebugInspector();
              }
            };
          });
        } else {
          chipsContainer.style.display = 'none';
        }
      }

      // 5. 교전 개시 버튼 바인딩
      const fastAtkBtn = document.getElementById('btn-odds-fast-attack');
      if (fastAtkBtn) {
        fastAtkBtn.onclick = (ev) => {
          ev.stopPropagation();
          addLog(`🎯 [승률 창 교전 개시] ${attacker.name} -> 적 ${defender.name} 즉시 전투 시작!`, 'combat');
          executeCombat(attacker, defender);
        };
      }

      // 6. 기본 유닛 정보 전환 버튼 바인딩
      const toggleBtn = document.getElementById('btn-toggle-card-view');
      if (toggleBtn) {
        toggleBtn.onclick = (ev) => {
          ev.stopPropagation();
          userCardViewPreference = 'FORCE_NORMAL';
          renderAll();
        };
      }
    }

    function renderHeaderAndCard() {
      // Header Info
      document.getElementById('ui-cmd-level').textContent = `Lv.${state.commander.level}`;
      document.getElementById('ui-cmd-exp-fill').style.width = `${Math.min(100, (state.commander.exp / state.commander.maxExp) * 100)}%`;
      document.getElementById('ui-gold').textContent = `${state.gold}G`;
      document.getElementById('ui-rewinder').textContent = `${state.rewinders}/3`;
      document.getElementById('ui-turn').textContent = `Turn ${state.turn}`;
      document.getElementById('ui-sp-count').textContent = `${state.commander.skillPoints} SP`;

      // Selected Unit Card Info
      const unit = getSelectedUnit();
      if (!unit) return;

      const cardAvatar = document.getElementById('card-avatar');
      if (cardAvatar) {
        cardAvatar.classList.add('char-main-portrait');
        const customImg = unit.imageUrl || customClassImages[unit.classType];
        if (customImg && customImg.trim() !== '') {
          cardAvatar.innerHTML = `<img src="${customImg}" class="character-image card-avatar-img hero-card-img" alt="${unit.name}" loading="lazy" style="width:100%; height:100%; object-fit:contain; object-position:center bottom; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-size:28px; line-height:1;\\'>${unit.avatar || '🛡️'}</span>';" />`;
        } else {
          cardAvatar.innerHTML = `<span style="font-size: 30px; line-height: 1;">${unit.avatar || '⚔️'}</span>`;
        }
      }
      document.getElementById('card-name').textContent = unit.name;
      document.getElementById('card-level').textContent = `Lv.${unit.level}`;
      document.getElementById('card-stats').innerHTML = `
        <span>⚔️ ATK <b>${unit.atk}</b></span>
        <span>🛡️ DEF <b>${unit.def}${unit.isGuarding ? '<span style="color:#10b981; font-size:10px; font-weight:800; margin-left:2px;">(+30% 방어)</span>' : ''}</b></span>
        <span>⚡ AP <b style="color: ${unit.ap > 0 ? '#0284c7' : '#ef4444'}">${unit.ap}/${unit.baseAP}</b></span>
        ${unit.isGuarding ? '<span style="background:#0284c7; color:#fff; border-radius:4px; padding:1px 4px; font-size:9px; font-weight:800;">🛡️방어태세</span>' : ''}
      `;

      const hpPct = Math.max(0, (unit.hp / unit.maxHp) * 100);
      document.getElementById('card-hp-text').textContent = `${unit.hp}/${unit.maxHp}`;
      document.getElementById('card-hp-fill').style.width = `${hpPct}%`;

      document.getElementById('card-aff-text').textContent = `${unit.affection}/100`;
      document.getElementById('card-aff-fill').style.width = `${unit.affection}%`;
      if (unit.affection <= 30) {
        document.getElementById('card-aff-text').innerHTML = `${unit.affection}/100 <span style="color:#ef4444;">(거부위험)</span>`;
      }

      // 전투 승리 확률 창 (이동/사거리 내 적 존재 시 자동 변환)
      const inRangeEnemies = getEnemiesInRange(unit);
      const cardEl = document.getElementById('selected-unit-card');
      const normalViewEl = document.getElementById('unit-card-normal-view');
      const oddsViewEl = document.getElementById('unit-card-odds-view');
      const oddsBadgeBtn = document.getElementById('btn-show-odds-badge');

      if (inRangeEnemies.length > 0 && userCardViewPreference !== 'FORCE_NORMAL') {
        if (cardEl) cardEl.classList.add('battle-odds-mode');
        if (normalViewEl) normalViewEl.style.display = 'none';
        if (oddsViewEl) oddsViewEl.style.display = 'flex';
        renderBattleOddsView(unit, inRangeEnemies);
      } else {
        if (cardEl) cardEl.classList.remove('battle-odds-mode');
        if (oddsViewEl) oddsViewEl.style.display = 'none';
        if (normalViewEl) normalViewEl.style.display = 'flex';

        if (oddsBadgeBtn) {
          if (inRangeEnemies.length > 0) {
            oddsBadgeBtn.style.display = 'inline-flex';
            oddsBadgeBtn.onclick = (e) => {
              e.stopPropagation();
              userCardViewPreference = 'AUTO';
              renderAll();
            };
          } else {
            oddsBadgeBtn.style.display = 'none';
          }
        }

        // Promotion Menu Button Binding
        const promoBtn = document.getElementById('btn-show-promo-menu');
        if (promoBtn) {
          promoBtn.style.display = (unit.owner === 'PLAYER' || !unit.owner) ? 'inline-flex' : 'none';
          promoBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.renderPromotionMenu === 'function') {
              window.renderPromotionMenu(unit);
            } else if (typeof window.UI?.renderPromotionMenu === 'function') {
              window.UI.renderPromotionMenu(unit);
            }
          };
        }
      }

      // Stack Switcher Bar for units sharing the same tile
      const stackBar = document.getElementById('stack-switcher-bar');
      if (stackBar) {
        const stackUnits = state.playerUnits.filter(u => !u.isDead && u.x === unit.x && u.y === unit.y);
        if (stackUnits.length > 1) {
          stackBar.style.display = 'flex';
          const skills = state.commander.unlockedSkills;
          const costAP = skills.RapidAdvance ? 1 : 1;
          const minAP = Math.min(...stackUnits.map(su => su.isInactivated ? 0 : su.ap));
          const hasAPShortage = minAP < costAP;

          stackBar.innerHTML = `
            <div class="stack-switcher-label" title="현재 타일에 함께 주둔 중인 부대원">
              👥 부대 (${stackUnits.length}기)${state.stackMoveEnabled ? `<span style="margin-left:4px; font-size:8px; font-weight:800; color:${hasAPShortage ? '#ef4444' : '#22c55e'};">[최소AP: ${minAP}]</span>` : ''}:
            </div>
            <div style="display:flex; gap:4px; overflow-x:auto; flex:1;">
              ${stackUnits.map(su => {
                const isShort = state.stackMoveEnabled && (su.isInactivated || su.ap < costAP);
                return `
                  <button class="stack-unit-chip ${su.id === unit.id ? 'active' : ''}" data-unit-id="${su.id}" style="${isShort ? 'border-color:#ef4444; color:#ef4444;' : ''}" title="${su.name} (AP: ${su.ap}/${su.baseAP}${su.isInactivated ? ', 정지' : ''})">
                    <span>${su.avatar}</span>
                    <span>${su.name}</span>
                    <span style="opacity:0.85; font-size:8px; font-weight:700;">[AP ${su.ap}]</span>
                  </button>
                `;
              }).join('')}
            </div>
            <button id="btn-stack-bar-toggle" class="stack-unit-chip ${state.stackMoveEnabled ? 'active' : ''}" style="margin-left:auto; font-size:8px; ${state.stackMoveEnabled && hasAPShortage ? 'background:rgba(239,68,68,0.2); border-color:#ef4444;' : ''}" title="중첩 부대 동시 이동 모드 토글 (최소 AP 기준 일괄 이동)">
              <span>${state.stackMoveEnabled ? (hasAPShortage ? '⚠️ 동시이동(AP부족)' : '👥 동시이동 ON') : '👤 개별이동'}</span>
            </button>
          `;
          stackBar.querySelectorAll('.stack-unit-chip[data-unit-id]').forEach(btn => {
            btn.onclick = (e) => {
              e.stopPropagation();
              const uid = btn.getAttribute('data-unit-id');
              if (uid) {
                selectedUnitId = uid;
                renderAll();
                updateDebugInspector();
              }
            };
          });
          const barToggle = document.getElementById('btn-stack-bar-toggle');
          if (barToggle) {
            barToggle.onclick = (e) => {
              e.stopPropagation();
              state.stackMoveEnabled = !state.stackMoveEnabled;
              addLog(`👥 [부대 동시 이동] ${state.stackMoveEnabled ? '활성화 (ON - 최소 AP 기준 일괄 이동)' : '해제 (OFF - 개별 이동)'}`, 'gold');
              renderAll();
            };
          }
        } else {
          stackBar.style.display = 'none';
        }
      }
    }

    // ========================================================================
    // [ 1단계: 월드맵 / 전략 메인 화면 (Strategy Main View) 상호작용 엔진 ]
    // ========================================================================

    // 1. 뷰 레이어 전환 엔진 (Strategy View <-> Sector Map)
    function switchGameView(targetView) {
      if (!state) return;

      // 전투 진행 중인 상태에서 전략 화면으로 전환을 시도하면 전술 일시정지 메뉴 호출
      const isCombatOngoing = !!(state && state.isCombatActive);
      if (targetView === 'STRATEGY' && isCombatOngoing && !state.isCombatPaused) {
        if (typeof window.openTacticalPauseMenu === 'function') {
          window.openTacticalPauseMenu();
          return;
        }
      }

      state.currentView = targetView;

      const viewStrat = document.getElementById('view-strategy-main');
      const viewSector = document.getElementById('view-sector-field');

      if (targetView === 'STRATEGY') {
        if (viewStrat) viewStrat.classList.add('active');
        if (viewSector) viewSector.classList.remove('active');
        renderStrategyView();
        addLog(`🗺️ [전략 지휘 본부] 월드맵 및 출전 부대 편성 화면으로 이동했습니다.`, 'system');
      } else {
        if (viewStrat) viewStrat.classList.remove('active');
        if (viewSector) viewSector.classList.add('active');

        // 동적 섹터 ID 대응: loadAndRenderSectorMap(state.selectedSectorId) 자동 호출
        const secId = state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector || 'A-1';
        state.selectedSectorId = secId;
        state.currentSector = secId;

        if (typeof window.loadAndRenderSectorMap === 'function') {
          window.loadAndRenderSectorMap(secId);
        } else {
          renderGrid();
          renderHeaderAndCard();
          updateFullShotOverlay();
        }

        const curSec = WORLD_SECTORS[secId] || { id: secId, name: secId };
        addLog(`⚔️ [전술 작전 전개] [${curSec.id} ${curSec.name}] 8x14 전술 필드로 진입했습니다.`, 'combat');
      }
      saveGameState(true);
    }
    window.switchGameView = switchGameView;

    // 2. 월드 섹터 노드 선택
    function selectWorldSector(sectorId) {
      const sec = WORLD_SECTORS[sectorId];
      if (!sec) return;

      if (sec.locked) {
        const msg = `🔒 [작전 지역 잠김] ${sec.name}은(는) 상위 작전(A-2, B-1)을 완수한 후 개방됩니다.`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      state.selectedSectorId = sectorId;
      state.currentSector = sectorId;

      if (!state.strategy) {
        state.strategy = {
          commanderAP: 24,
          maxCommanderAP: 24,
          selectedSectorId: sectorId,
          armyDeck: { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
          activeSkills: { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
        };
      } else {
        state.strategy.selectedSectorId = sectorId;
      }

      // 노드 핀 시각 갱신
      document.querySelectorAll('.strat-node-pin').forEach(pin => {
        pin.classList.remove('active');
      });
      const activePin = document.getElementById(`node-pin-${sectorId}`);
      if (activePin) activePin.classList.add('active');

      renderStrategyView();
      addLog(`📍 [작전 목표 변경] [${sec.id} ${sec.name}] (${sec.difficulty}) 선택됨`, 'system');
      saveGameState(true);
    }
    window.selectWorldSector = selectWorldSector;

    // 3. 지휘관 패시브 스킬 토글
    function toggleCommanderSkill(skillKey) {
      if (!state.strategy) return;
      const current = !!state.strategy.activeSkills[skillKey];
      state.strategy.activeSkills[skillKey] = !current;
      if (state.commander && state.commander.unlockedSkills) {
        state.commander.unlockedSkills[skillKey] = !current;
      }

      const chip = document.getElementById(`skill-chip-${skillKey}`);
      if (chip) {
        const togglePill = chip.querySelector('.strat-skill-toggle-pill');
        if (!current) {
          chip.classList.add('active');
          if (togglePill) togglePill.textContent = 'ON';
          addLog(`✨ [지휘관 스킬 활성화] ${skillKey} 패시브가 작전에 반영됩니다.`, 'gold');
        } else {
          chip.classList.remove('active');
          if (togglePill) togglePill.textContent = 'OFF';
          addLog(`⚪ [지휘관 스킬 해제] ${skillKey} 패시브가 비활성화되었습니다.`, 'system');
        }
      }
      saveGameState(true);
    }
    window.toggleCommanderSkill = toggleCommanderSkill;

    // 4. 출전 부대 스택 수량 조절
    function updateArmyStack(cls, delta) {
      if (!state.strategy || !state.strategy.armyDeck) return;
      const deck = state.strategy.armyDeck;
      const currentVal = deck[cls] || 0;
      let newVal = Math.max(0, currentVal + delta);

      // 전체 100 유닛 한도 검증
      const totalOther = Object.keys(deck).reduce((acc, k) => k === cls ? acc : acc + (deck[k] || 0), 0);
      if (totalOther + newVal > 100) {
        newVal = 100 - totalOther;
      }
      deck[cls] = newVal;

      renderStrategyView();
      saveGameState(true);
    }
    window.updateArmyStack = updateArmyStack;

    // 5. 부대 프리셋
    function applyArmyPreset(type) {
      if (!state.strategy) return;
      if (type === 'BALANCED') {
        state.strategy.armyDeck = { KNIGHT: 25, MAGE: 20, ARCHER: 25, MELEE: 20, FIREARM: 10 };
        addLog(`⚖️ [부대 편성 프리셋] 균형 잡힌 5병과 전술 편성을 적용했습니다.`, 'system');
      } else if (type === 'CAVALRY') {
        state.strategy.armyDeck = { KNIGHT: 60, MAGE: 10, ARCHER: 15, MELEE: 10, FIREARM: 5 };
        addLog(`🐴 [부대 편성 프리셋] 기사 돌격 중심 고기동 편성을 적용했습니다.`, 'system');
      } else if (type === 'RANGED') {
        state.strategy.armyDeck = { KNIGHT: 15, MAGE: 30, ARCHER: 35, MELEE: 10, FIREARM: 10 };
        addLog(`🏹 [부대 편성 프리셋] 마법사/궁수 원거리 화력 편성을 적용했습니다.`, 'system');
      } else if (type === 'DEFENSIVE') {
        state.strategy.armyDeck = { KNIGHT: 20, MAGE: 15, ARCHER: 20, MELEE: 40, FIREARM: 5 };
        addLog(`🛡️ [부대 편성 프리셋] 보병 철벽 방어 진형 편성을 적용했습니다.`, 'system');
      }
      renderStrategyView();
      saveGameState(true);
    }
    window.applyArmyPreset = applyArmyPreset;

    // 6. 전략 메인 화면 데이터 전체 렌더링
    function renderStrategyView() {
      if (!state) return;
      const strat = state.strategy || {
        commanderAP: 24,
        maxCommanderAP: 24,
        selectedSectorId: 'A-1',
        armyDeck: { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
        activeSkills: { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
      };

      // Header Elements
      const cmdName = document.getElementById('strat-cmd-name');
      const cmdLvl = document.getElementById('strat-cmd-level');
      const cmdExpFill = document.getElementById('strat-cmd-exp-fill');
      const cmdAP = document.getElementById('strat-cmd-ap');
      const stratGold = document.getElementById('strat-gold');
      const stratRewind = document.getElementById('strat-rewinder');
      const stratGuestId = document.getElementById('strat-guest-id');

      if (cmdName) cmdName.textContent = state.commander ? state.commander.name : '레오나르도';
      if (cmdLvl) cmdLvl.textContent = `Lv.${state.commander ? state.commander.level : 1}`;
      if (cmdExpFill && state.commander) {
        const pct = Math.min(100, Math.round((state.commander.exp / (state.commander.maxExp || 100)) * 100));
        cmdExpFill.style.width = `${pct}%`;
      }
      if (cmdAP) cmdAP.textContent = `${strat.commanderAP}/${strat.maxCommanderAP}`;
      if (stratGold) stratGold.textContent = `${state.gold}G`;
      if (stratRewind) stratRewind.textContent = `${state.rewinders}/3`;
      if (stratGuestId && state.guest) {
        stratGuestId.textContent = state.guest.firebaseUid ? `FB_${state.guest.firebaseUid.substring(0, 5)}` : state.guest.id;
      }

      // Selected Sector Details
      const curSec = WORLD_SECTORS[strat.selectedSectorId] || WORLD_SECTORS['A-1'];
      const iconEl = document.getElementById('strat-sector-icon');
      const nameEl = document.getElementById('strat-sector-name-text');
      const diffBadge = document.getElementById('strat-sector-diff-badge');
      const descEl = document.getElementById('strat-sector-terrain-desc');
      const enemyEl = document.getElementById('strat-sector-enemy');
      const powerEl = document.getElementById('strat-sector-power');
      const upkeepEl = document.getElementById('strat-sector-upkeep');
      const rewardEl = document.getElementById('strat-sector-reward');

      if (iconEl) iconEl.textContent = curSec.icon;
      if (nameEl) nameEl.textContent = `[${curSec.id}] ${curSec.name}`;
      if (diffBadge) {
        diffBadge.className = `strat-diff-badge ${curSec.difficulty.toLowerCase()}`;
        diffBadge.textContent = `${curSec.difficulty} ${curSec.stars}`;
      }
      if (descEl) descEl.textContent = curSec.terrainDesc;
      if (enemyEl) enemyEl.textContent = curSec.enemyForce;
      if (powerEl) powerEl.textContent = `${curSec.recPower} PWR`;
      if (upkeepEl) upkeepEl.textContent = `${curSec.upkeep}G / 턴`;
      if (rewardEl) rewardEl.textContent = curSec.clearReward;

      // Terrain Bars
      const bPlain = document.getElementById('strat-bar-plain');
      const bForest = document.getElementById('strat-bar-forest');
      const bHill = document.getElementById('strat-bar-hill');
      if (bPlain) bPlain.style.width = `${curSec.terrainComposition.plain}%`;
      if (bForest) bForest.style.width = `${curSec.terrainComposition.forest}%`;
      if (bHill) bHill.style.width = `${curSec.terrainComposition.hill}%`;

      // Skill chips active states
      if (strat.activeSkills) {
        Object.keys(strat.activeSkills).forEach(k => {
          const chip = document.getElementById(`skill-chip-${k}`);
          if (chip) {
            const isAct = !!strat.activeSkills[k];
            chip.classList.toggle('active', isAct);
            const pill = chip.querySelector('.strat-skill-toggle-pill');
            if (pill) pill.textContent = isAct ? 'ON' : 'OFF';
          }
        });
      }

      // 출전 부대 편성 = 아군 캐릭터(영웅) 기반 (1편성부대 = 1캐릭터, 통솔력 제한)
      const activeUnits = (state.playerUnits || []).filter(u => !u.isDead);
      const totalUnits = activeUnits.length;
      const maxLeadership = (typeof strat.commanderAP === 'number') ? strat.commanderAP : (strat.maxCommanderAP || 24);

      let totalPower = 0;
      let totalUpkeep = 0;

      const rosterContainer = document.getElementById('strat-characters-roster-wrap');
      if (rosterContainer) {
        if (activeUnits.length === 0) {
          rosterContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 11px; padding: 14px;">현재 생존 중인 아군 영웅이 없습니다.</div>`;
        } else {
          rosterContainer.innerHTML = activeUnits.map((u, idx) => {
            const cls = u.classType || u.unitClass || 'KNIGHT';
            const clsMeta = (typeof CLASS_META !== 'undefined' && CLASS_META[cls]) ? CLASS_META[cls] : { name: cls, avatar: '👤' };
            const uPower = Math.round((u.atk || 40) * 2.2 + (u.def || 30) * 1.5 + (u.level || 1) * 30 + ((u.customSkill || (u.skillTree && u.skillTree.length)) ? 40 : 0));
            const uUpkeep = (u.upkeep !== undefined) ? u.upkeep : 10;
            totalPower += uPower;
            totalUpkeep += uUpkeep;

            const avatarContent = u.imageUrl 
              ? `<img src="${u.imageUrl}" alt="${u.name}" style="width: 100%; height: 100%; object-fit: cover;" />`
              : `<span style="font-size: 15px;">${u.avatar || clsMeta.avatar || '👤'}</span>`;

            return `
              <div class="strat-char-roster-item" title="${u.name} (클릭 시 캐릭터 상태창 열람)" onclick="selectRosterUnitAndOpenProfile('${u.id}')" role="button" tabindex="0">
                <div class="strat-char-roster-avatar">
                  ${avatarContent}
                </div>
                <div class="strat-char-roster-info">
                  <div class="strat-char-roster-name-row">
                    <span class="strat-char-roster-name">${u.name || ('부대 ' + (idx + 1))}</span>
                    <span class="strat-char-class-badge">${clsMeta.name}</span>
                    <span class="strat-char-lv-badge">Lv.${u.level || 1}</span>
                  </div>
                  <div class="strat-char-roster-stats">
                    <span>⚔️ ${u.atk || 40}</span>
                    <span>🛡️ ${u.def || 30}</span>
                    <span>❤️ ${u.hp || 100}/${u.maxHp || 100}</span>
                    <span style="color: #0284c7; font-weight: 800;">⚡ ${uPower} PWR</span>
                  </div>
                </div>
                <div class="strat-char-roster-badge ready">
                  상태창 🔍
                </div>
              </div>
            `;
          }).join('');
        }
      } else {
        // Fallback calculations if roster container missing
        activeUnits.forEach(u => {
          totalPower += Math.round((u.atk || 40) * 2.2 + (u.def || 30) * 1.5 + (u.level || 1) * 30 + ((u.customSkill || (u.skillTree && u.skillTree.length)) ? 40 : 0));
          totalUpkeep += (u.upkeep !== undefined ? u.upkeep : 10);
        });
      }

      const totalUnitsEl = document.getElementById('strat-total-units');
      const armyPowerEl = document.getElementById('strat-army-power');
      const armyUpkeepEl = document.getElementById('strat-army-upkeep');
      const leadershipLimitSub = document.getElementById('strat-leadership-limit-sub');

      if (leadershipLimitSub) {
        leadershipLimitSub.textContent = `통솔력 한도: 최대 ${maxLeadership}부대`;
      }

      if (totalUnitsEl) {
        totalUnitsEl.textContent = `${totalUnits} / ${maxLeadership}`;
        if (totalUnits > maxLeadership) {
          totalUnitsEl.classList.add('warning');
          totalUnitsEl.title = `통솔력(${maxLeadership})을 초과하여 출격할 수 없습니다!`;
        } else {
          totalUnitsEl.classList.remove('warning');
          totalUnitsEl.title = `1편성부대 = 1영웅 캐릭터 (통솔력 한도 내 출전)`;
        }
      }
      if (armyPowerEl) armyPowerEl.textContent = `${Math.round(totalPower)} PWR`;
      if (armyUpkeepEl) armyUpkeepEl.textContent = `${Math.round(totalUpkeep)}G / 턴`;

      // Bottom Action Summary
      const destSummary = document.getElementById('strat-action-summary-dest');
      if (destSummary) destSummary.textContent = `[${curSec.id} ${curSec.name}] 작전 준비`;

      const actionCostEl = document.getElementById('strat-action-summary-cost');
      if (actionCostEl) {
        actionCostEl.textContent = `⚡ 통솔력 -5 AP 소모 | ${totalUnits} 영웅 부대 출동`;
      }

      // Header sub-tag in sector map view
      const subTagEl = document.getElementById('ui-sector-sub-tag');
      if (subTagEl) subTagEl.textContent = `SECTOR ${curSec.id}: ${curSec.name.toUpperCase()}`;
    }
    window.renderStrategyView = renderStrategyView;

    // 전략 편성 화면에서 영웅 카드 클릭 시 캐릭터 상태창(풀샷 오버레이) 열기
    function selectRosterUnitAndOpenProfile(unitId) {
      if (!state || !state.playerUnits) return;
      const u = state.playerUnits.find(unit => unit.id === unitId);
      if (u) {
        selectedUnitId = u.id;
        openFullShotOverlay(u);
        const clsMeta = (typeof CLASS_META !== 'undefined' && CLASS_META[u.classType]) ? CLASS_META[u.classType] : { name: u.classType };
        addLog(`📋 [캐릭터 상태창] ${u.name} (Lv.${u.level || 1} ${clsMeta.name}) 상세 정보 및 능력치를 확인합니다.`, 'system');
      }
    }
    window.selectRosterUnitAndOpenProfile = selectRosterUnitAndOpenProfile;

    // 7. 섹터 강습 출격 시뮬레이션 모달 오픈
    function openSectorDeployModal() {
      const modal = document.getElementById('modal-sector-deploy');
      if (!modal) return;

      const strat = state.strategy;
      const curSec = WORLD_SECTORS[strat?.selectedSectorId || 'A-1'] || WORLD_SECTORS['A-1'];

      // 총 부대 수 및 전투력 계산 (1편성부대 = 1캐릭터)
      const activeUnits = (state.playerUnits || []).filter(u => !u.isDead);
      const totalUnits = activeUnits.length;
      const maxLeadership = (typeof strat?.commanderAP === 'number') ? strat.commanderAP : 24;
      let myPower = 0;
      activeUnits.forEach(u => {
        myPower += Math.round((u.atk || 40) * 2.2 + (u.def || 30) * 1.5 + (u.level || 1) * 30 + ((u.customSkill || (u.skillTree && u.skillTree.length)) ? 40 : 0));
      });
      myPower = Math.round(myPower);

      const titleEl = document.getElementById('deploy-sim-sector-name');
      const descEl = document.getElementById('deploy-sim-desc');
      const myPowerEl = document.getElementById('deploy-sim-my-power');
      const myUnitsEl = document.getElementById('deploy-sim-units-count');
      const enemyPowerEl = document.getElementById('deploy-sim-enemy-power');
      const enemyNameEl = document.getElementById('deploy-sim-enemy-name');
      const diffEl = document.getElementById('deploy-sim-diff');

      if (titleEl) titleEl.textContent = `[${curSec.id}] ${curSec.name} 강습 작전`;
      if (descEl) descEl.textContent = `${curSec.terrainDesc} 아군 선봉 ${totalUnits}개 영웅 부대가 8x14 전술 필드로 워프 전개합니다.`;
      if (myPowerEl) myPowerEl.textContent = `${myPower} PWR`;
      if (myUnitsEl) myUnitsEl.textContent = `${totalUnits}개 부대 (${totalUnits}명) 편성 완료`;
      if (enemyPowerEl) enemyPowerEl.textContent = `${curSec.recPower} PWR`;
      if (enemyNameEl) enemyNameEl.textContent = curSec.enemyForce;
      if (diffEl) {
        diffEl.className = `strat-diff-badge ${curSec.difficulty.toLowerCase()}`;
        diffEl.textContent = `${curSec.difficulty} ${curSec.stars}`;
      }

      modal.style.display = 'flex';
      modal.classList.add('open');
    }
    window.openSectorDeployModal = openSectorDeployModal;

    function closeSectorDeployModal() {
      const modal = document.getElementById('modal-sector-deploy');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
      }
    }
    window.closeSectorDeployModal = closeSectorDeployModal;

    // 8. 강습 작전 개시 (출격)
    function launchSectorOperation() {
      if (!state.strategy) return;
      if (state.strategy.commanderAP < 5) {
        const msg = '⚡ 통솔력(AP)이 부족합니다! (출격 필요: 5 AP)';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      const activeUnits = (state.playerUnits || []).filter(u => !u.isDead);
      const maxLeadership = state.strategy.commanderAP;
      if (activeUnits.length > maxLeadership) {
        const msg = `⚠️ 현재 편성된 부대 수(${activeUnits.length}개)가 지휘관 통솔력(${maxLeadership})을 초과하여 출격할 수 없습니다!`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      // 1) state.selectedSectorId = currentSector.id; 현재 선택된 섹터 ID 저장
      const activeSectorId = (state.strategy && state.strategy.selectedSectorId) || state.selectedSectorId || state.currentSector || 'A-1';
      state.selectedSectorId = activeSectorId;
      state.currentSector = activeSectorId;
      if (state.strategy) state.strategy.selectedSectorId = activeSectorId;

      state.strategy.commanderAP -= 5;
      closeSectorDeployModal();

      const curSec = WORLD_SECTORS[activeSectorId] || { id: activeSectorId, name: activeSectorId };
      addLog(`🚀 [작전 개시] [${curSec.id} ${curSec.name}] 전장으로 아군 선봉 ${activeUnits.length}개 부대가 출격했습니다! (-5 AP 소모)`, 'gold');

      // 전술 전장 상태 초기화 및 전투 활성화 플래그 설정
      if (typeof window.resetTacticalBattleState === 'function') {
        window.resetTacticalBattleState();
      }

      const views = window.GAME_VIEWS || { WORLD_STRATEGY: 'WORLD_STRATEGY', SECTOR_FIELD: 'SECTOR_FIELD', STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY' };
      const sectorView = views.SECTOR_FIELD || 'SECTOR_MAP';

      // 단일 진실 공급원인 state.isCombatActive 활성화 (나머지 4곳은 getter로 자동 참조)
      if (state) {
        state.isCombatActive = true;
        state.isCombatPaused = false;
        state.savedTacticalState = null;
        state.currentView = sectorView;
      }
      window.isCombatPaused = false;
      if (window.playerState) {
        window.playerState.isCombatPaused = false;
        window.playerState.savedTacticalState = null;
        window.playerState.currentView = sectorView;
      }
      if (window.gameState) {
        window.gameState.isCombatPaused = false;
        window.gameState.savedTacticalState = null;
        window.gameState.currentView = sectorView;
      }

      // 2) state.currentView = 'SECTOR_MAP' 전환 시 loadAndRenderSectorMap(state.selectedSectorId)를 자동 호출
      switchGameView('SECTOR_MAP');
    }
    window.launchSectorOperation = launchSectorOperation;

    function renderAll() {
      if (state && state.currentView === 'STRATEGY') {
        const viewStrat = document.getElementById('view-strategy-main');
        const viewSector = document.getElementById('view-sector-field');
        if (viewStrat) viewStrat.classList.add('active');
        if (viewSector) viewSector.classList.remove('active');
        renderStrategyView();
      } else {
        const viewStrat = document.getElementById('view-strategy-main');
        const viewSector = document.getElementById('view-sector-field');
        if (viewStrat) viewStrat.classList.remove('active');
        if (viewSector) viewSector.classList.add('active');
        renderGrid();
        renderHeaderAndCard();
        updateFullShotOverlay();
      }
    }

    /* --------------------------------------------------------------------------
       Modal Windows Handling
       -------------------------------------------------------------------------- */
    function closeAllModals() {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
    }

    /* --------------------------------------------------------------------------
       Unit Class Special Skill (병과특기) System
       -------------------------------------------------------------------------- */
    const UNIT_CLASS_SKILLS = {
      KNIGHT: {
        skillName: '돌격 태세 (Assault Stance)',
        icon: '🏇',
        tag: '기동 돌격기',
        costAP: 1,
        atkBonus: 6,
        desc: '기사도의 강인한 돌격력을 실어 이번 턴 공격력을 +6 영구(턴 내) 증폭합니다.'
      },
      MELEE: {
        skillName: '배수의 진 (Berserk Wrath)',
        icon: '⚔️',
        tag: '강습 연타',
        costAP: 1,
        atkBonus: 6,
        desc: '검기를 집중하여 전방 적을 분쇄하는 돌파력을 얻습니다. 이번 턴 공격력이 +6 증가합니다.'
      },
      ARCHER: {
        skillName: '정밀 저격 (Eagle Eye)',
        icon: '🏹',
        tag: '약점 사격',
        costAP: 1,
        atkBonus: 6,
        desc: '적의 사각지대와 급소를 간파하여 치명타 확률을 극대화합니다. 이번 턴 공격력이 +6 증가합니다.'
      }
    };

    function openClassSkillModal(targetUnit) {
      const unit = targetUnit || getSelectedUnit();
      if (!unit) {
        addLog('⚠️ 먼저 전장에서 아군 유닛을 선택해주세요.', 'system');
        return;
      }

      const modal = document.getElementById('modal-class-skill');
      if (!modal) return;

      const skillData = UNIT_CLASS_SKILLS[unit.classType] || {
        skillName: '전선의 함성 (Battle Roar)',
        icon: '✨',
        tag: '병과 고유기',
        costAP: 1,
        atkBonus: 6,
        desc: '아군 부대의 사기를 진작하여 이번 턴 공격력을 +6 증가시킵니다.'
      };

      const titleEl = document.getElementById('class-skill-modal-title');
      if (titleEl) {
        titleEl.innerHTML = `✨ ${unit.name} - 병과 고유 특기`;
      }

      const bodyEl = document.getElementById('class-skill-modal-body');
      if (bodyEl) {
        const canUse = unit.ap >= skillData.costAP && !unit.isInactivated && !unit.isDead;
        bodyEl.innerHTML = `
          <!-- Unit Profile Mini Banner -->
          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%); border: 1.5px solid #bae6fd; border-radius: 14px; padding: 12px; display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 30px; width: 48px; height: 48px; background: #ffffff; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.08); border: 2px solid #38bdf8; flex-shrink: 0;">
              ${unit.avatar}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 14px; font-weight: 900; color: #0f172a; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span>${unit.name}</span>
                <span style="font-size: 10px; background: #f59e0b; color: #fff; padding: 1px 6px; border-radius: 6px; font-weight: 900;">Lv.${unit.level}</span>
                <span style="font-size: 10px; background: #e0e7ff; color: #4338ca; padding: 1px 6px; border-radius: 6px; font-weight: 800;">${unit.classType}</span>
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px; display: flex; gap: 8px;">
                <span>⚔️ ATK <b style="color:#0f172a;">${unit.atk}</b></span>
                <span>🛡️ DEF <b style="color:#0f172a;">${unit.def}</b></span>
                <span>⚡ AP <b style="color:${unit.ap > 0 ? '#0284c7' : '#ef4444'};">${unit.ap}/${unit.baseAP}</b></span>
              </div>
            </div>
          </div>

          <!-- Skill Card -->
          <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px;">${skillData.icon}</span>
                <div>
                  <div style="font-size: 14px; font-weight: 900; color: #0f172a;">${skillData.skillName}</div>
                  <div style="font-size: 10px; color: #8b5cf6; font-weight: 800;">${skillData.tag}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 11px; font-weight: 900; background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; padding: 2px 8px; border-radius: 12px;">
                  ⚡ AP ${skillData.costAP} 소모
                </span>
              </div>
            </div>

            <p style="font-size: 12px; line-height: 1.5; color: #334155; margin: 0 0 10px 0; background: #f8fafc; padding: 8px 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
              ${skillData.desc}
            </p>

            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; color: #475569; padding-top: 4px;">
              <span>발동 효과: 이번 턴 <b style="color: #ea580c;">공격력 +${skillData.atkBonus}</b></span>
              <span style="color: ${canUse ? '#059669' : '#dc2626'}; font-weight: 900;">
                ${canUse ? '● 발동 가능' : (unit.ap < skillData.costAP ? '● 행동력(AP) 부족' : '● 행동 완료')}
              </span>
            </div>
          </div>

          <!-- Action Button -->
          <div style="margin-top: 4px;">
            ${canUse ? `
              <button id="btn-modal-exec-skill" style="width: 100%; padding: 12px; font-size: 13.5px; font-weight: 900; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff; border: none; box-shadow: 0 4px 12px rgba(109, 40, 217, 0.35); cursor: pointer; transition: all 0.15s ease;">
                ✨ 병과특기 즉시 발동 (AP 1 소모)
              </button>
            ` : `
              <button disabled style="width: 100%; padding: 12px; font-size: 13.5px; font-weight: 900; border-radius: 12px; background: #cbd5e1; color: #64748b; border: none; cursor: not-allowed;">
                ⚠️ 특기 발동 불가 (AP 부족 또는 행동 완료)
              </button>
            `}
          </div>
        `;

        const execBtn = document.getElementById('btn-modal-exec-skill');
        if (execBtn) {
          execBtn.onclick = () => {
            if (unit.ap < skillData.costAP || unit.isInactivated) return;
            saveHistorySnapshot();
            unit.ap -= skillData.costAP;
            unit.atk += skillData.atkBonus;
            addLog(`✨ [병과특기] ${unit.name}의 ${skillData.skillName} 발동! (이번 턴 공격력 +${skillData.atkBonus} 증가)`, 'success');
            renderAll();
            openClassSkillModal(unit);
          };
        }
      }

      modal.classList.add('open');
    }

    function openSkillsModal() {
      const modal = document.getElementById('modal-skills');
      const grid = document.getElementById('modal-skill-grid');
      document.getElementById('modal-sp-display').textContent = state.commander.skillPoints;

      grid.innerHTML = '';
      Object.keys(COMMANDER_SKILLS_DATA).forEach(skillId => {
        const s = COMMANDER_SKILLS_DATA[skillId];
        const isUnlocked = state.commander.unlockedSkills[skillId];
        const hasPrereq = !s.prerequisite || state.commander.unlockedSkills[s.prerequisite];
        const canUnlock = !isUnlocked && hasPrereq && state.commander.skillPoints >= s.cost;

        const card = document.createElement('div');
        card.className = `skill-card ${isUnlocked ? 'unlocked' : ''}`;
        card.innerHTML = `
          <div class="skill-card-name">
            <span>${s.name}</span>
            <span>${isUnlocked ? '✅ 해금' : s.cost + ' SP'}</span>
          </div>
          <div class="skill-card-desc">${s.desc}</div>
          ${s.prerequisite ? `<div style="font-size: 9px; color: #f59e0b;">(선행: ${COMMANDER_SKILLS_DATA[s.prerequisite].name})</div>` : ''}
          ${!isUnlocked ? `
            <button class="btn-skill-unlock ${canUnlock ? 'can-unlock' : ''}" ${!canUnlock ? 'disabled' : ''} onclick="unlockCommanderSkill('${skillId}')">
              ${canUnlock ? '스킬 해금하기' : (hasPrereq ? 'SP 부족' : '선행 스킬 필요')}
            </button>
          ` : ''}
        `;
        grid.appendChild(card);
      });

      modal.classList.add('open');
    }

    function unlockCommanderSkill(skillId) {
      const s = COMMANDER_SKILLS_DATA[skillId];
      if (state.commander.skillPoints < s.cost) return;

      saveHistorySnapshot();
      state.commander.skillPoints -= s.cost;
      state.commander.unlockedSkills[skillId] = true;

      addLog(`⭐ [지휘관 패시브 해금] ${s.name} 능력이 활성화되었습니다!`, 'gold');
      openSkillsModal(); // Re-render modal
      renderAll();
      saveGameState();
    }

    function openVillageModal() {
      document.getElementById('modal-village').classList.add('open');
    }

    function openCityModal() {
      const unit = getSelectedUnit();
      if (unit) {
        document.getElementById('city-sell-title').textContent = `💰 [${unit.name}] 명예 퇴역 (매각)`;
      }
      document.getElementById('modal-city').classList.add('open');
    }

    /* --------------------------------------------------------------------------
       Character Image Management & Full-Shot Overlay System (우마무스메풍 전신 풀샷)
       -------------------------------------------------------------------------- */
    const CLASS_META = {
      KNIGHT: { name: '성기사 롤랑 (Knight)', icon: '🐴', role: '전열 탱커 & 돌격기', color: '#0284c7' },
      MAGE: { name: '대마법사 셀레스테 (Mage)', icon: '🔮', role: '광역 마법 화력 지원', color: '#7c3aed' },
      ARCHER: { name: '엘프 사냥꾼 리리아 (Archer)', icon: '🏹', role: '원거리 저격 및 급소 사격', color: '#16a34a' },
      MELEE: { name: '철벽 전사 월터 (Melee)', icon: '⚔️', role: '근접 방벽 및 백병전', color: '#dc2626' },
      FIREARM: { name: '화포 사령관 빅터 (Firearm)', icon: '💥', role: '원거리 포격 및 진지 돌파', color: '#ea580c' }
    };

    let customClassImages = {
      KNIGHT: '',
      MAGE: '',
      ARCHER: '',
      MELEE: '',
      FIREARM: ''
    };

    // 고해상도 판타지 애니메 스타일 전신 풀샷 벡터 프리셋 (외부 네트워크 의존성 없는 즉시 로드용)
    const SAMPLE_CLASS_IMAGES = {
      KNIGHT: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="kg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#0284c7"/>
            </linearGradient>
            <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="100%" stop-color="#f59e0b"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#e0f2fe" opacity="0.35"/>
          <path d="M 120 110 Q 70 240 60 380 Q 140 400 170 380 Q 160 250 160 120 Z" fill="#0284c7" opacity="0.85"/>
          <path d="M 160 120 Q 170 250 180 380 Q 240 395 260 370 Q 220 230 190 110 Z" fill="#0369a1" opacity="0.9"/>
          <ellipse cx="160" cy="185" rx="42" ry="55" fill="url(#kg)"/>
          <path d="M 130 150 L 190 150 L 175 225 L 145 225 Z" fill="#ffffff" opacity="0.25"/>
          <rect x="132" y="225" width="56" height="12" rx="3" fill="#334155"/>
          <rect x="152" y="223" width="16" height="16" rx="4" fill="url(#gold)"/>
          <rect x="135" y="237" width="22" height="135" rx="8" fill="#0f172a"/>
          <rect x="163" y="237" width="22" height="135" rx="8" fill="#1e293b"/>
          <ellipse cx="146" cy="375" rx="15" ry="8" fill="#0284c7"/>
          <ellipse cx="174" cy="375" rx="15" ry="8" fill="#0369a1"/>
          <ellipse cx="118" cy="135" rx="18" ry="14" fill="url(#gold)"/>
          <ellipse cx="202" cy="135" rx="18" ry="14" fill="url(#gold)"/>
          <circle cx="160" cy="85" r="32" fill="#fed7aa"/>
          <path d="M 128 75 Q 160 30 192 75 Q 200 105 188 115 Q 160 95 132 115 Z" fill="#fef08a"/>
          <path d="M 145 70 Q 160 45 175 70 Q 165 95 155 95 Z" fill="#fef08a"/>
          <path d="M 135 75 Q 160 70 185 75" stroke="url(#gold)" stroke-width="4" fill="none"/>
          <polygon points="160,60 166,74 154,74" fill="url(#gold)"/>
          <ellipse cx="148" cy="88" rx="4" ry="6" fill="#0284c7"/>
          <circle cx="147" cy="86" r="1.5" fill="#ffffff"/>
          <ellipse cx="172" cy="88" rx="4" ry="6" fill="#0284c7"/>
          <circle cx="171" cy="86" r="1.5" fill="#ffffff"/>
          <path d="M 158 97 Q 160 100 162 97" stroke="#f43f5e" stroke-width="2" fill="none"/>
          <rect x="222" y="40" width="8" height="340" rx="4" fill="#e2e8f0"/>
          <polygon points="226,15 218,50 234,50" fill="url(#gold)"/>
          <rect x="210" y="210" width="32" height="8" rx="3" fill="url(#gold)"/>
          <circle cx="226" cy="214" r="7" fill="#38bdf8"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#38bdf8" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">✨ HOLY KNIGHT ROLAND</text>
        </svg>
      `),
      MAGE: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c084fc"/>
              <stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient>
            <linearGradient id="pStar" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f472b6"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#faf5ff" opacity="0.4"/>
          <path d="M 120 160 Q 80 300 70 385 Q 160 405 250 385 Q 240 300 200 160 Z" fill="url(#mg)"/>
          <path d="M 140 180 L 160 385 L 180 180 Z" fill="#ffffff" opacity="0.2"/>
          <ellipse cx="160" cy="170" rx="35" ry="45" fill="#581c87"/>
          <circle cx="160" cy="95" r="28" fill="#fed7aa"/>
          <path d="M 132 80 Q 90 140 85 240 Q 110 240 115 160 Q 140 80 132 80 Z" fill="#c084fc"/>
          <path d="M 188 80 Q 230 140 235 240 Q 210 240 205 160 Q 180 80 188 80 Z" fill="#a855f7"/>
          <path d="M 135 85 Q 160 60 185 85 Q 180 110 160 100 Q 140 110 135 85 Z" fill="#a855f7"/>
          <ellipse cx="149" cy="98" rx="4" ry="5.5" fill="#7c3aed"/>
          <circle cx="148" cy="96" r="1.5" fill="#fff"/>
          <ellipse cx="171" cy="98" rx="4" ry="5.5" fill="#7c3aed"/>
          <circle cx="170" cy="96" r="1.5" fill="#fff"/>
          <polygon points="160,15 125,75 195,75" fill="#4c1d95"/>
          <ellipse cx="160" cy="74" rx="48" ry="12" fill="#581c87"/>
          <rect x="135" y="66" width="50" height="7" fill="url(#pStar)"/>
          <rect x="75" y="60" width="7" height="320" rx="3.5" fill="#78350f"/>
          <circle cx="78" cy="55" r="20" fill="none" stroke="#e879f9" stroke-width="4"/>
          <polygon points="78,38 88,55 78,72 68,55" fill="#f472b6"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#e879f9" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">🔮 HIGH ARCHMAGE CELESTE</text>
        </svg>
      `),
      ARCHER: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4ade80"/>
              <stop offset="100%" stop-color="#15803d"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#f0fdf4" opacity="0.4"/>
          <path d="M 125 125 Q 90 260 85 375 Q 160 395 235 375 Q 230 260 195 125 Z" fill="url(#ag)"/>
          <ellipse cx="160" cy="185" rx="34" ry="46" fill="#14532d"/>
          <path d="M 130 140 L 190 225" stroke="#78350f" stroke-width="8"/>
          <rect x="138" y="240" width="18" height="135" rx="6" fill="#78350f"/>
          <rect x="164" y="240" width="18" height="135" rx="6" fill="#451a03"/>
          <circle cx="160" cy="95" r="28" fill="#fed7aa"/>
          <path d="M 132 85 Q 160 45 188 85 Q 192 120 185 130 Q 160 110 135 130 Z" fill="#fbbf24"/>
          <polygon points="132,95 105,80 134,105" fill="#fecdd3"/>
          <polygon points="188,95 215,80 186,105" fill="#fecdd3"/>
          <ellipse cx="150" cy="98" rx="4" ry="5.5" fill="#15803d"/>
          <circle cx="149" cy="96" r="1.5" fill="#fff"/>
          <ellipse cx="170" cy="98" rx="4" ry="5.5" fill="#15803d"/>
          <circle cx="169" cy="96" r="1.5" fill="#fff"/>
          <path d="M 225 35 Q 285 200 225 370" fill="none" stroke="#b45309" stroke-width="7" stroke-linecap="round"/>
          <path d="M 225 35 L 225 370" fill="none" stroke="#86efac" stroke-width="2"/>
          <path d="M 170 200 L 260 200" stroke="#f59e0b" stroke-width="4"/>
          <polygon points="265,200 255,194 255,206" fill="#22c55e"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#4ade80" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">🏹 WIND RUNNER LYRIA</text>
        </svg>
      `),
      MELEE: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="mlg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f87171"/>
              <stop offset="100%" stop-color="#b91c1c"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#fef2f2" opacity="0.4"/>
          <path d="M 115 130 L 205 130 L 195 260 L 125 260 Z" fill="url(#mlg)"/>
          <rect x="130" y="260" width="26" height="120" rx="8" fill="#334155"/>
          <rect x="164" y="260" width="26" height="120" rx="8" fill="#1e293b"/>
          <path d="M 60 140 Q 95 140 100 170 L 100 280 Q 60 320 50 330 Q 40 280 40 170 Z" fill="#991b1b" stroke="#fca5a5" stroke-width="4"/>
          <polygon points="70,190 85,220 55,220" fill="#fef08a"/>
          <circle cx="160" cy="90" r="28" fill="#fed7aa"/>
          <path d="M 130 85 L 140 45 L 155 70 L 170 35 L 180 70 L 195 48 L 190 85 Z" fill="#dc2626"/>
          <rect x="110" y="115" width="100" height="20" rx="10" fill="#7f1d1d"/>
          <rect x="220" y="70" width="16" height="260" rx="4" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
          <polygon points="228,40 216,75 240,75" fill="#e2e8f0"/>
          <rect x="208" y="240" width="40" height="12" rx="4" fill="#d97706"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#f87171" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">⚔️ IRON VANGUARD WALTER</text>
        </svg>
      `),
      FIREARM: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fb923c"/>
              <stop offset="100%" stop-color="#c2410c"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#fff7ed" opacity="0.4"/>
          <path d="M 120 120 L 200 120 L 225 380 L 95 380 Z" fill="url(#fg)"/>
          <rect x="140" y="130" width="40" height="130" fill="#1c1917"/>
          <rect x="105" y="120" width="25" height="12" rx="4" fill="#fbbf24"/>
          <rect x="190" y="120" width="25" height="12" rx="4" fill="#fbbf24"/>
          <circle cx="160" cy="90" r="28" fill="#fed7aa"/>
          <ellipse cx="160" cy="72" rx="36" ry="14" fill="#7c2d12"/>
          <circle cx="175" cy="65" r="7" fill="#fbbf24"/>
          <rect x="210" y="40" width="10" height="320" rx="3" fill="#292524"/>
          <rect x="212" y="160" width="22" height="45" rx="5" fill="#78350f"/>
          <circle cx="215" cy="40" r="8" fill="#f97316"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#fb923c" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">💥 ARTILLERY MARSHAL VICTOR</text>
        </svg>
      `)
    };

    /* --------------------------------------------------------------------------
       Image Compression Utility (LocalStorage 5MB Quota Protection)
       -------------------------------------------------------------------------- */
    function compressImageDataUrl(dataUrlOrFile, maxWidth = 640, maxHeight = 960, quality = 0.8) {
      return new Promise((resolve) => {
        const processImg = (srcStr) => {
          if (!srcStr || !srcStr.startsWith('data:image/')) {
            return resolve(srcStr);
          }
          // SVG or small images under 60KB don't need raster compression
          if (srcStr.startsWith('data:image/svg+xml') || srcStr.length < 60000) {
            return resolve(srcStr);
          }
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.max(1, Math.round(width * ratio));
              height = Math.max(1, Math.round(height * ratio));
            }
            try {
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', quality);
              resolve(compressed);
            } catch (e) {
              resolve(srcStr);
            }
          };
          img.onerror = () => resolve(srcStr);
          img.src = srcStr;
        };

        if (typeof dataUrlOrFile === 'string') {
          processImg(dataUrlOrFile);
        } else if (dataUrlOrFile instanceof File || dataUrlOrFile instanceof Blob) {
          const reader = new FileReader();
          reader.onload = (e) => processImg(e.target.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(dataUrlOrFile);
        } else {
          resolve('');
        }
      });
    }

    // Zero LocalStorage: 더 이상 브라우저 쿼터 제한이 없으므로 클라우드 저장소 활용
    function cleanStorageQuotaIfBloated() {
      // Pure Cloud Storage architecture - No local storage quota needed
    }

    function applyStoredCustomImages() {
      if (typeof window.loadGameConfigFromCloud === 'function') {
        window.loadGameConfigFromCloud('unit_images').then(data => {
          if (data && data.customClassImages) {
            customClassImages = { ...customClassImages, ...data.customClassImages };
            state.playerUnits.forEach(u => {
              if (customClassImages[u.classType]) {
                u.imageUrl = customClassImages[u.classType];
              }
            });
            renderAll();
            updateFullShotOverlay();
          }
        }).catch(err => console.warn("Load class images error:", err));
      }

      // Realtime subscription for unit class images across devices
      if (typeof window.subscribeGameConfig === 'function') {
        window.subscribeGameConfig('unit_images', (data) => {
          if (data && data.customClassImages) {
            customClassImages = { ...customClassImages, ...data.customClassImages };
            state.playerUnits.forEach(u => {
              if (customClassImages[u.classType]) {
                u.imageUrl = customClassImages[u.classType];
              }
            });
            renderAll();
            updateFullShotOverlay();
          }
        });
      }
    }

    function saveClassImage(classType, imgSource) {
      const meta = CLASS_META[classType] || { name: classType };

      // Base64인 경우 Firebase Storage에 직접 업로드하여 HTTPS URL 획득 후 Firestore 저장
      if (imgSource && imgSource.startsWith('data:') && typeof window.uploadCharacterAvatar === 'function') {
        addLog(`☁️ [Firebase Storage] ${meta.name} 이미지를 클라우드 스토리지에 전송 중...`, 'system');
        window.uploadCharacterAvatar(imgSource, `class_${classType}`).then(downloadUrl => {
          customClassImages[classType] = downloadUrl;
          state.playerUnits.forEach(u => {
            if (u.classType === classType) {
              u.imageUrl = downloadUrl;
            }
          });
          if (typeof window.saveGameConfigToCloud === 'function') {
            window.saveGameConfigToCloud('unit_images', { customClassImages });
          }
          addLog(`🎨 [캐릭터 이미지 적용] [${meta.name}] Firebase Storage URL이 성공적으로 등록되었습니다!`, 'success');
          renderDebugImageManager();
          renderAll();
          updateFullShotOverlay();
          saveGameState(true);
        }).catch(err => {
          console.error("Storage upload failed, saving directly:", err);
          customClassImages[classType] = imgSource;
          state.playerUnits.forEach(u => {
            if (u.classType === classType) u.imageUrl = imgSource;
          });
          if (typeof window.saveGameConfigToCloud === 'function') {
            window.saveGameConfigToCloud('unit_images', { customClassImages });
          }
          renderDebugImageManager();
          renderAll();
          updateFullShotOverlay();
          saveGameState(true);
        });
      } else {
        customClassImages[classType] = imgSource;
        state.playerUnits.forEach(u => {
          if (u.classType === classType) {
            u.imageUrl = imgSource;
          }
        });
        if (typeof window.saveGameConfigToCloud === 'function') {
          window.saveGameConfigToCloud('unit_images', { customClassImages });
        }
        addLog(`🎨 [캐릭터 이미지 적용] [${meta.name}] 이미지가 성공적으로 등록되었습니다!`, 'success');
        renderDebugImageManager();
        renderAll();
        updateFullShotOverlay();
        saveGameState(true);
      }
    }

    function resetClassImage(classType) {
      customClassImages[classType] = '';

      state.playerUnits.forEach(u => {
        if (u.classType === classType) {
          u.imageUrl = '';
        }
      });

      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('unit_images', { customClassImages });
      }

      const meta = CLASS_META[classType] || { name: classType };
      addLog(`🔄 [캐릭터 이미지 초기화] [${meta.name}] 이미지가 기본 실루엣으로 복원되었습니다.`, 'system');

      renderDebugImageManager();
      renderAll();
      updateFullShotOverlay();
      saveGameState(true);
    }

    function applySamplePresetImages() {
      Object.keys(SAMPLE_CLASS_IMAGES).forEach(cls => {
        const sampleUrl = SAMPLE_CLASS_IMAGES[cls];
        customClassImages[cls] = sampleUrl;
        state.playerUnits.forEach(u => {
          if (u.classType === cls) {
            u.imageUrl = sampleUrl;
          }
        });
      });

      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('unit_images', { customClassImages });
      }

      addLog(`✨ [샘플 일러스트 일괄 적용] 5종 전 병과에 고해상도 판타지 전신 일러스트 프리셋이 반영되었습니다!`, 'gold');
      renderDebugImageManager();
      renderAll();
      updateFullShotOverlay();
      saveGameState(true);
    }

    function resetAllClassImages() {
      Object.keys(CLASS_META).forEach(cls => {
        customClassImages[cls] = '';
        state.playerUnits.forEach(u => {
          if (u.classType === cls) {
            u.imageUrl = '';
          }
        });
      });

      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('unit_images', { customClassImages });
      }

      addLog(`🔄 [전체 이미지 초기화] 모든 병과의 커스텀 이미지가 제거되고 기본 실루엣으로 복원되었습니다.`, 'system');
      renderDebugImageManager();
      renderAll();
      updateFullShotOverlay();
      saveGameState(true);
    }

    function processImageFile(classType, file) {
      if (!file || !file.type.startsWith('image/')) {
        addLog('⚠️ 지원되지 않는 파일 형식입니다. PNG, JPG, WebP, SVG 이미지 파일을 선택해주세요.', 'warning');
        return;
      }
      addLog('⏳ 일러스트 이미지 최적화 압축 중...', 'system');
      compressImageDataUrl(file, 640, 960, 0.8).then(dataUrl => {
        if (dataUrl) {
          saveClassImage(classType, dataUrl);
        }
      });
    }

    function onClassFileSelected(classType, inputEl) {
      if (inputEl && inputEl.files && inputEl.files[0]) {
        processImageFile(classType, inputEl.files[0]);
        inputEl.value = '';
      }
    }

    function onClassUrlApplied(classType) {
      const input = document.getElementById(`url-input-${classType}`);
      if (!input) return;
      const url = input.value.trim();
      if (!url) {
        addLog('⚠️ 등록할 이미지 URL 주소를 입력해주세요.', 'warning');
        return;
      }
      saveClassImage(classType, url);
    }

    function renderDebugImageManager() {
      const container = document.getElementById('dbg-class-images-list');
      if (!container) return;

      container.innerHTML = '';

      Object.keys(CLASS_META).forEach(classKey => {
        const meta = CLASS_META[classKey];
        const curImg = customClassImages[classKey] || '';
        const card = document.createElement('div');
        card.className = 'dbg-class-img-card';
        card.id = `dbg-card-${classKey}`;

        card.innerHTML = `
          <div class="dbg-class-img-header">
            <div class="dbg-class-img-title">
              <span>${meta.icon}</span>
              <span>${meta.name}</span>
            </div>
            <span class="dbg-class-img-badge ${curImg ? 'active' : ''}">
              ${curImg ? '🎨 커스텀 등록됨' : '기본 실루엣'}
            </span>
          </div>

          <div class="dbg-class-img-body">
            <!-- Left: Thumbnail Preview & Drag/Drop Zone -->
            <div class="dbg-img-preview-box ${curImg ? 'has-img' : ''}" id="dbg-preview-box-${classKey}" title="이미지 파일을 이곳으로 드래그 & 드롭하거나 클릭하여 등록">
              ${curImg ? `
                <img src="${curImg}" class="dbg-img-preview-thumb" alt="${meta.name}" />
              ` : `
                <span class="dbg-preview-placeholder-ico">${meta.icon}</span>
                <span class="dbg-preview-placeholder-txt">드래그&드롭<br>또는 클릭</span>
              `}
              <div class="dbg-preview-drop-overlay">📥 이미지 놓기</div>
            </div>

            <!-- Right: Controls (Upload File, URL Input, Reset) -->
            <div class="dbg-img-controls-col">
              <div style="display: flex; gap: 6px; align-items: center;">
                <input type="file" id="file-input-${classKey}" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display: none;" onchange="onClassFileSelected('${classKey}', this)">
                <button class="btn-dbg-upload" onclick="document.getElementById('file-input-${classKey}').click()">
                  📁 내 컴퓨터 파일 선택 (PNG/JPG)
                </button>
                ${curImg ? `
                  <button class="btn-dbg-img-reset" onclick="resetClassImage('${classKey}')" title="등록된 이미지 삭제 및 기본값 복원">
                    🗑️ 초기화
                  </button>
                ` : ''}
              </div>

              <div class="dbg-url-input-row">
                <input type="text" id="url-input-${classKey}" class="dbg-url-text-input" placeholder="웹 이미지 URL (https://...)" value="${curImg.startsWith('http') ? curImg : ''}">
                <button class="btn-dbg-apply-url" onclick="onClassUrlApplied('${classKey}')">
                  URL 등록
                </button>
              </div>

              <div style="font-size: 9px; color: #64748b; line-height: 1.3;">
                💡 <b>권장 비율:</b> 세로형 3:4 또는 9:16 (PNG/JPG/WebP/SVG)<br>
                브라우저 LocalStorage에 즉시 영구 저장되어 유지됩니다.
              </div>
            </div>
          </div>
        `;

        // Setup Drag & Drop on the preview box
        const previewBox = card.querySelector(`#dbg-preview-box-${classKey}`);
        if (previewBox) {
          previewBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewBox.classList.add('drag-over');
          });
          previewBox.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewBox.classList.remove('drag-over');
          });
          previewBox.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewBox.classList.remove('drag-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const file = e.dataTransfer.files[0];
              processImageFile(classKey, file);
            }
          });
          previewBox.addEventListener('click', () => {
            const fi = document.getElementById(`file-input-${classKey}`);
            if (fi) fi.click();
          });
        }

        container.appendChild(card);
      });
    }

    /* --------------------------------------------------------------------------
       Custom Character & Skill Creation Studio Controller
       -------------------------------------------------------------------------- */
    const CUSTOM_CHARACTERS_STORAGE_KEY = 'slg_custom_created_characters';
    let createCharImageDataUrl = '';

    // 병과 선택 변경 시 기본 스탯, 추천 고유 스킬 및 실루엣 자동 동기화
    function onCustomClassSelectChanged(classType) {
      const presetStats = debugParams.unitClassStats[classType] || { atk: 40, def: 30, baseAP: 2, affection: 75, hp: 90 };
      const defaultSkill = DEFAULT_CLASS_SKILLS[classType];
      const avatarMap = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
      const avatar = avatarMap[classType] || '👤';

      const hpInput = document.getElementById('create-char-hp');
      const atkInput = document.getElementById('create-char-atk');
      const defInput = document.getElementById('create-char-def');
      const mobInput = document.getElementById('create-char-mobility');
      const placeholder = document.getElementById('create-char-preview-placeholder');

      if (hpInput) hpInput.value = presetStats.hp;
      if (atkInput) atkInput.value = presetStats.atk;
      if (defInput) defInput.value = presetStats.def;
      if (mobInput) mobInput.value = presetStats.baseAP;
      if (placeholder && !createCharImageDataUrl) placeholder.textContent = avatar;

      if (defaultSkill) {
        const nameInput = document.getElementById('create-skill-name');
        const typeSelect = document.getElementById('create-skill-type');
        const targetSelect = document.getElementById('create-skill-target');
        const effectInput = document.getElementById('create-skill-effect');
        const apInput = document.getElementById('create-skill-ap');
        const cdInput = document.getElementById('create-skill-cd');
        const descInput = document.getElementById('create-skill-desc');

        if (nameInput) nameInput.value = defaultSkill.name;
        if (typeSelect) {
          typeSelect.value = defaultSkill.type;
          onCustomSkillTypeChanged(defaultSkill.type);
        }
        if (targetSelect) targetSelect.value = defaultSkill.targetType;
        if (effectInput) effectInput.value = defaultSkill.effectValue;
        if (apInput) apInput.value = defaultSkill.costAP;
        if (cdInput) cdInput.value = defaultSkill.coolDown;
        if (descInput) descInput.value = defaultSkill.description;
      }
    }

    // 스킬 액티브/패시브 타입 토글 (패시브일 경우 소모 AP/쿨다운 숨김 및 0 처리)
    function onCustomSkillTypeChanged(type) {
      const activeRow = document.getElementById('create-skill-active-row');
      const apInput = document.getElementById('create-skill-ap');
      const cdInput = document.getElementById('create-skill-cd');
      const targetSelect = document.getElementById('create-skill-target');

      if (type === 'PASSIVE') {
        if (activeRow) activeRow.style.display = 'none';
        if (apInput) apInput.value = 0;
        if (cdInput) cdInput.value = 0;
        if (targetSelect) {
          targetSelect.innerHTML = `
            <option value="BUFF">🛡️ 공방 능력치 증폭 패시브 (BUFF)</option>
          `;
        }
      } else {
        if (activeRow) activeRow.style.display = 'grid';
        if (apInput && parseInt(apInput.value, 10) === 0) apInput.value = 1;
        if (cdInput && parseInt(cdInput.value, 10) === 0) cdInput.value = 2;
        if (targetSelect) {
          targetSelect.innerHTML = `
            <option value="BUFF">💖 아군 회복 및 공방 버프 (BUFF)</option>
            <option value="SINGLE_TARGET">🎯 단일 적군 집중 타격 (SINGLE_TARGET)</option>
            <option value="AOE">💥 사거리 내 광역 폭격 (AOE)</option>
            <option value="SELF">🌟 자신 행동력 완전 회복 (SELF)</option>
          `;
        }
      }
    }

    // 신규 캐릭터 전신 이미지 업로드 및 URL 바인딩
    function onCustomCharFileSelected(inputEl) {
      if (inputEl && inputEl.files && inputEl.files[0]) {
        const file = inputEl.files[0];
        if (!file.type.startsWith('image/')) {
          addLog('⚠️ 지원되지 않는 이미지 파일입니다. PNG, JPG, WebP 파일을 선택해주세요.', 'warning');
          return;
        }
        addLog('⏳ 일러스트 이미지 최적화 압축 중...', 'system');
        compressImageDataUrl(file, 640, 960, 0.8).then(compressedUrl => {
          setNewCharacterImage(compressedUrl);
          addLog('🖼️ 캐릭터 전신 일러스트가 최적화되어 성공적으로 등록되었습니다.', 'success');
        });
        inputEl.value = '';
      }
    }

    function onCustomCharUrlChanged(url) {
      const trimmed = (url || '').trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
        setNewCharacterImage(trimmed);
      } else if (!trimmed) {
        clearCustomCharImage();
      }
    }

    function setNewCharacterImage(dataUrlOrUrl) {
      createCharImageDataUrl = dataUrlOrUrl;
      const previewImg = document.getElementById('create-char-preview-img');
      const placeholder = document.getElementById('create-char-preview-placeholder');
      const urlInput = document.getElementById('create-char-img-url');

      if (previewImg && placeholder) {
        if (dataUrlOrUrl) {
          previewImg.src = dataUrlOrUrl;
          previewImg.style.display = 'block';
          placeholder.style.display = 'none';
        } else {
          previewImg.style.display = 'none';
          placeholder.style.display = 'block';
        }
      }
      if (urlInput && dataUrlOrUrl.startsWith('http')) {
        urlInput.value = dataUrlOrUrl;
      }
    }

    function clearCustomCharImage() {
      createCharImageDataUrl = '';
      const previewImg = document.getElementById('create-char-preview-img');
      const placeholder = document.getElementById('create-char-preview-placeholder');
      const urlInput = document.getElementById('create-char-img-url');

      if (previewImg) previewImg.style.display = 'none';
      if (placeholder) {
        placeholder.style.display = 'block';
        const curClass = document.getElementById('create-char-class')?.value || 'KNIGHT';
        const avatarMap = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
        placeholder.textContent = avatarMap[curClass] || '👤';
      }
      if (urlInput) urlInput.value = '';
      addLog('🗑️ 캐릭터 일러스트 등록이 초기화되었습니다.', 'system');
    }

    function applyPresetImageToNewChar() {
      const curClass = document.getElementById('create-char-class')?.value || 'KNIGHT';
      const presetImg = customClassImages[curClass] || PRESET_SVG_PORTRAITS[curClass];
      if (presetImg) {
        setNewCharacterImage(presetImg);
        addLog(`✨ [${CLASS_META[curClass]?.name || curClass}] 추천 프리셋 일러스트를 불러왔습니다.`, 'gold');
      }
    }

    function setupCustomCharDropzone() {
      const dropzone = document.getElementById('create-char-dropzone');
      if (!dropzone) return;

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            addLog('⏳ 일러스트 이미지 최적화 압축 중...', 'system');
            compressImageDataUrl(file, 640, 960, 0.8).then(compressedUrl => {
              setNewCharacterImage(compressedUrl);
              addLog('📥 드래그&드롭으로 캐릭터 이미지가 최적화되어 등록되었습니다.', 'success');
            });
          } else {
            addLog('⚠️ 이미지 파일(PNG/JPG)만 드래그하여 등록할 수 있습니다.', 'warning');
          }
        }
      });
    }

    // 캐릭터 & 고유 스킬 생성 및 전장 배치
    async function createAndDeployCharacter() {
      const nameInput = document.getElementById('create-char-name');
      const classSelect = document.getElementById('create-char-class');
      const favInput = document.getElementById('create-char-favorability');
      const hpInput = document.getElementById('create-char-hp');
      const atkInput = document.getElementById('create-char-atk');
      const defInput = document.getElementById('create-char-def');
      const mobInput = document.getElementById('create-char-mobility');

      const charName = (nameInput?.value || '').trim();
      if (!charName) {
        addLog('⚠️ 캐릭터 이름을 입력해주세요.', 'warning');
        if (nameInput) nameInput.focus();
        return;
      }

      const unitClass = classSelect?.value || 'KNIGHT';
      const favorability = Math.max(0, Math.min(100, parseInt(favInput?.value, 10) || 75));
      const hp = Math.max(10, parseInt(hpInput?.value, 10) || 100);
      const atk = Math.max(1, parseInt(atkInput?.value, 10) || 45);
      const def = Math.max(1, parseInt(defInput?.value, 10) || 35);
      const mobility = Math.max(1, Math.min(6, parseInt(mobInput?.value, 10) || 2));

      // 고유 스킬 데이터 수집
      const skillName = (document.getElementById('create-skill-name')?.value || '').trim() || `${charName}의 비기`;
      const skillType = document.getElementById('create-skill-type')?.value || 'ACTIVE';
      const skillTarget = document.getElementById('create-skill-target')?.value || 'BUFF';
      const skillEffect = parseInt(document.getElementById('create-skill-effect')?.value, 10) || 30;
      const skillCostAP = skillType === 'ACTIVE' ? (parseInt(document.getElementById('create-skill-ap')?.value, 10) || 1) : 0;
      const skillCoolDown = skillType === 'ACTIVE' ? (parseInt(document.getElementById('create-skill-cd')?.value, 10) || 2) : 0;
      const skillDesc = (document.getElementById('create-skill-desc')?.value || '').trim() || `${charName}의 고유 특수 기술입니다.`;

      const customSkill = {
        name: skillName,
        type: skillType,
        costAP: skillCostAP,
        coolDown: skillCoolDown,
        targetType: skillTarget,
        effectValue: skillEffect,
        description: skillDesc
      };

      const avatarMap = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
      const avatar = avatarMap[unitClass] || '👤';

      // 생성 위치 선정 (왕도 x:3, y:4 또는 인접 빈 타일)
      let spawnX = 3;
      let spawnY = 4;
      const occupiedByAnyPlayer = (x, y) => state.playerUnits.some(u => !u.isDead && u.x === x && u.y === y);
      if (occupiedByAnyPlayer(spawnX, spawnY)) {
        const candidates = [
          { x: 3, y: 5 }, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 3 }, { x: 4, y: 5 }
        ];
        const emptyCandidate = candidates.find(c => c.x >= 0 && c.x < GRID_COLS && c.y >= 0 && c.y < GRID_ROWS && !occupiedByAnyPlayer(c.x, c.y));
        if (emptyCandidate) {
          spawnX = emptyCandidate.x;
          spawnY = emptyCandidate.y;
        }
      }

      saveHistorySnapshot();

      // Firebase Storage 이미지 업로드 처리 (DataURL일 경우 Cloud Storage에 영구 보관)
      let finalImageUrl = createCharImageDataUrl || '';
      if (window.FirebaseBridge && createCharImageDataUrl && createCharImageDataUrl.startsWith('data:')) {
        addLog('☁️ [Firebase Storage] 캐릭터 일러스트를 Firebase Storage에 업로드 중...', 'system');
        try {
          const uploadedUrl = await window.FirebaseBridge.uploadCharacterImage(createCharImageDataUrl, charName);
          if (uploadedUrl) {
            finalImageUrl = uploadedUrl;
            addLog('✅ [Firebase Storage] 일러스트가 클라우드 Storage에 업로드되어 영구 URL이 발급되었습니다!', 'success');
          }
        } catch (storageErr) {
          console.warn('Storage upload fallback:', storageErr);
        }
      }

      const newId = 'custom_' + Date.now();
      const newCharacter = {
        id: newId,
        owner: 'PLAYER',
        name: charName,
        unitClass: unitClass,
        classType: unitClass,
        avatar: avatar,
        level: 1,
        stats: {
          hp: hp,
          maxHp: hp,
          atk: atk,
          def: def,
          mobility: mobility
        },
        hp: hp,
        maxHp: hp,
        atk: atk,
        def: def,
        baseAP: mobility,
        ap: mobility,
        favorability: favorability,
        affection: favorability,
        upkeep: 10,
        x: spawnX,
        y: spawnY,
        imageUrl: finalImageUrl,
        isInactivated: false,
        isDead: false,
        promotions: { combatRank: 0 },
        customSkill: customSkill,
        customSkillCooldown: 0,
        skillTree: (typeof window.UI?.getDevDraftSkillTree === 'function') 
          ? window.UI.getDevDraftSkillTree() 
          : (window.DEFAULT_SKILL_TREE_TEMPLATE ? JSON.parse(JSON.stringify(window.DEFAULT_SKILL_TREE_TEMPLATE)) : [])
      };

      // 플레이어 유닛 등록
      state.playerUnits.push(newCharacter);
      selectedUnitId = newId;

      // 영구 캐릭터 보관함에도 저장 (LocalStorage 백업)
      saveCustomCharacterRecord(newCharacter);

      // Firestore 'characters' 컬렉션 동기화
      if (window.FirebaseBridge) {
        window.FirebaseBridge.syncCharacterToFirestore(newCharacter).then(ok => {
          if (ok) {
            addLog(`🔥 [Firestore 동기화] 캐릭터 [${charName}] 데이터가 'characters' 컬렉션에 동기화되었습니다.`, 'gold');
          }
        });
      }

      saveGameState();
      renderAll();
      renderCustomCharactersList();

      // 디버그 모달을 닫고 풀샷 오버레이 즉시 오픈 연출
      closeAllModals();
      openFullShotOverlay(newCharacter);

      addLog(`✨ [신규 영웅 탄생!] Lv.1 ${charName} (${CLASS_META[unitClass]?.name || unitClass})이(가) 전장 (${spawnX}, ${spawnY})에 출진했습니다!`, 'gold');
      addLog(`⚡ [고유 스킬 장착] [${customSkill.name}] (${customSkill.type}) - ${customSkill.description}`, 'system');
    }

    // In-memory cache for Firestore 'characters' collection (Zero LocalStorage)
    let customCharactersCloudCache = [];

    function getStoredCustomCharacters() {
      return customCharactersCloudCache;
    }

    // Firestore 전역 'characters' 컬렉션 동기화 (모든 접속자/기기/브라우저 간 완전 실시간 공유)
    function syncGlobalCharactersFromFirestore(firestoreCharacters) {
      if (!Array.isArray(firestoreCharacters)) return;
      try {
        customCharactersCloudCache = [...firestoreCharacters];
        // 최신 생성일자 순 정렬
        customCharactersCloudCache.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        renderCustomCharactersList();
      } catch (e) {
        console.warn("Global characters sync error:", e);
      }
    }

    function saveCustomCharacterRecord(charObj) {
      try {
        // Direct save to Cloud Firestore & Firebase Storage
        if (typeof window.saveCharacterToCloud === 'function') {
          window.saveCharacterToCloud(charObj).then(() => {
            console.log("☁️ [Cloud Character] 캐릭터 Firestore 동기화 완료:", charObj.id);
          });
        }
        // 즉시 메모리 캐시 반영
        const existingIdx = customCharactersCloudCache.findIndex(c => c.id === charObj.id);
        if (existingIdx >= 0) {
          customCharactersCloudCache[existingIdx] = { ...customCharactersCloudCache[existingIdx], ...charObj };
        } else {
          customCharactersCloudCache.unshift(charObj);
        }
        renderCustomCharactersList();
      } catch (e) {
        console.warn('Failed to save custom character record:', e);
      }
    }

    function renderCustomCharactersList() {
      const container = document.getElementById('dbg-custom-char-list');
      const countEl = document.getElementById('dbg-custom-char-count');
      if (!container) return;

      const list = getStoredCustomCharacters();
      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        container.innerHTML = `
          <div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px 0;">
            아직 생성된 커스텀 캐릭터가 없습니다. 위 입력폼에서 첫 영웅을 생성해보세요!
          </div>
        `;
        return;
      }

      container.innerHTML = list.map(c => {
        const meta = CLASS_META[c.unitClass || c.classType] || { icon: c.avatar || '👤', name: c.unitClass || '영웅' };
        const skill = c.customSkill || { name: '스킬 없음', type: 'PASSIVE', description: '-' };
        const isActiveSkill = skill.type === 'ACTIVE';
        const imgDisplay = c.imageUrl ? `<img src="${c.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;" alt="${c.name}" />` : `<span style="font-size: 20px;">${c.avatar || meta.icon}</span>`;

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
              <div style="width: 38px; height: 38px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                ${imgDisplay}
              </div>
              <div style="min-width: 0;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <strong style="font-size: 12px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</strong>
                  <span style="font-size: 9px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 1px 5px; border-radius: 4px;">${meta.name.split(' ')[0]}</span>
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                  HP ${c.stats?.hp || 100} / ATK ${c.stats?.atk || 40} / DEF ${c.stats?.def || 30} / 호감도 ${c.favorability || 75}
                </div>
                <div style="font-size: 9.5px; color: #6366f1; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;">
                  ⚡ [${skill.name}] <span style="color:#64748b;">${isActiveSkill ? `(AP ${skill.costAP}, 쿨${skill.coolDown}턴)` : '(PASSIVE)'}</span>: ${skill.description}
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 4px; flex-shrink: 0;">
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #0284c7;" onclick="if(window.renderDevSkillTreeEditor) window.renderDevSkillTreeEditor('${c.id}'); else if(window.UI?.renderDevSkillTreeEditor) window.UI.renderDevSkillTreeEditor('${c.id}');" title="스킬트리 편집 및 커스텀 아이콘 관리">
                🌳 트리
              </button>
              <button class="btn-cheat purple" style="font-size: 9px; padding: 4px 7px;" onclick="spawnSavedCustomCharacter('${c.id}')" title="현재 전장에 이 캐릭터를 추가 배치합니다.">
                소환
              </button>
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #ef4444;" onclick="deleteSavedCustomCharacter('${c.id}')" title="보관함에서 삭제합니다.">
                삭제
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function spawnSavedCustomCharacter(charId) {
      const list = getStoredCustomCharacters();
      const target = list.find(c => c.id === charId);
      if (!target) return;

      saveHistorySnapshot();

      const newId = 'custom_' + Date.now();
      let spawnX = 3;
      let spawnY = 4;
      const occupied = state.playerUnits.some(u => !u.isDead && u.x === spawnX && u.y === spawnY);
      if (occupied) {
        const candidates = [{ x: 3, y: 5 }, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 2, y: 5 }];
        const empty = candidates.find(c => !state.playerUnits.some(u => !u.isDead && u.x === c.x && u.y === c.y));
        if (empty) { spawnX = empty.x; spawnY = empty.y; }
      }

      const copyChar = {
        id: newId,
        owner: 'PLAYER',
        name: target.name,
        unitClass: target.unitClass || target.classType,
        classType: target.classType || target.unitClass,
        avatar: target.avatar || '👤',
        level: 1,
        stats: JSON.parse(JSON.stringify(target.stats || { hp: 100, maxHp: 100, atk: 40, def: 30, mobility: 2 })),
        hp: target.stats?.hp || 100,
        maxHp: target.stats?.maxHp || target.stats?.hp || 100,
        atk: target.stats?.atk || 40,
        def: target.stats?.def || 30,
        baseAP: target.stats?.mobility || 2,
        ap: target.stats?.mobility || 2,
        favorability: target.favorability || 75,
        affection: target.favorability || 75,
        upkeep: 10,
        x: spawnX,
        y: spawnY,
        imageUrl: target.imageUrl || '',
        isInactivated: false,
        isDead: false,
        promotions: { combatRank: 0 },
        customSkill: JSON.parse(JSON.stringify(target.customSkill)),
        customSkillCooldown: 0,
        skillTree: target.skillTree ? JSON.parse(JSON.stringify(target.skillTree)) : (window.DEFAULT_SKILL_TREE_TEMPLATE ? JSON.parse(JSON.stringify(window.DEFAULT_SKILL_TREE_TEMPLATE)) : [])
      };

      state.playerUnits.push(copyChar);
      selectedUnitId = newId;
      saveGameState();
      renderAll();
      closeAllModals();
      openFullShotOverlay(copyChar);
      addLog(`✨ [보관함 소환] ${copyChar.name}이(가) 전장 (${spawnX}, ${spawnY})에 출격했습니다!`, 'gold');
    }

    function deleteSavedCustomCharacter(charId) {
      customCharactersCloudCache = customCharactersCloudCache.filter(c => c.id !== charId);
      if (typeof window.deleteCharacterFromCloud === 'function') {
        window.deleteCharacterFromCloud(charId);
      }
      renderCustomCharactersList();
      addLog('🗑️ Firestore 클라우드 보관함에서 선택한 영웅이 영구 삭제되었습니다.', 'system');
    }

    function initCustomCharCreationForm() {
      setupCustomCharDropzone();
      renderCustomCharactersList();
      // Load initial character list from Cloud Firestore
      if (typeof window.getCharactersFromCloud === 'function') {
        window.getCharactersFromCloud().then(chars => {
          if (Array.isArray(chars) && chars.length > 0) {
            syncGlobalCharactersFromFirestore(chars);
          }
        });
      }
      // Real-time synchronization
      if (typeof window.subscribeCharacterList === 'function') {
        window.subscribeCharacterList((chars) => {
          syncGlobalCharactersFromFirestore(chars);
        });
      }
      if (typeof window.renderDevSkillTreeEditor === 'function') {
        window.renderDevSkillTreeEditor(null);
      } else if (typeof window.UI?.renderDevSkillTreeEditor === 'function') {
        window.UI.renderDevSkillTreeEditor(null);
      }
    }

    /* --------------------------------------------------------------------------
       Full-Shot Overlay UI Controller
       -------------------------------------------------------------------------- */
    let currentOverlayTargetUnit = null;

    function updateFullShotOverlay(targetUnit) {
      const overlay = document.getElementById('unit-fullshot-overlay');
      if (!overlay) return;

      const unit = targetUnit || currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) {
        if (overlay.classList.contains('active')) {
          closeFullShotOverlay();
        }
        return;
      }

      const stageEl = document.getElementById('fullshot-character-stage');
      const nameEl = document.getElementById('fullshot-name-text');
      const classTagEl = document.getElementById('fullshot-tag-class');
      const lvEl = document.getElementById('fullshot-badge-lv');

      const meta = CLASS_META[unit.classType] || { name: unit.classType, icon: unit.avatar, color: '#0284c7' };
      const customImg = unit.imageUrl || customClassImages[unit.classType];

      if (nameEl) nameEl.textContent = unit.name;
      if (classTagEl) classTagEl.innerHTML = `${meta.icon} ${meta.name.split(' ')[0]}`;
      if (lvEl) lvEl.textContent = `Lv.${unit.level}`;

      // Left Character Illustration Stage
      if (stageEl) {
        const displayImg = customImg || (typeof SAMPLE_CLASS_IMAGES !== 'undefined' ? SAMPLE_CLASS_IMAGES[unit.classType] : '');
        if (displayImg) {
          stageEl.innerHTML = `<img src="${displayImg}" class="fullshot-main-img" alt="${unit.name}" />`;
        } else {
          stageEl.innerHTML = '';
        }
      }

      // HP Capsule Gauge & Text
      const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
      const hpValEl = document.getElementById('fullshot-hp-val-text');
      const hpGauge = document.getElementById('fullshot-hp-gauge');
      const hpOverlay = document.getElementById('fullshot-hp-overlay-text');
      if (hpValEl) hpValEl.textContent = `${unit.hp} / ${unit.maxHp}`;
      if (hpGauge) {
        hpGauge.style.width = `${hpPct}%`;
        hpGauge.style.background = hpPct < 35 ? 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)' : 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
      }
      if (hpOverlay) hpOverlay.textContent = `HP ${unit.hp} / ${unit.maxHp} (${Math.round(hpPct)}%)`;

      // Affection Capsule Gauge & Text
      const affValEl = document.getElementById('fullshot-aff-val-text');
      const affGauge = document.getElementById('fullshot-aff-gauge');
      const affOverlay = document.getElementById('fullshot-aff-overlay-text');
      const affPct = Math.max(0, Math.min(100, unit.affection));
      const isAffDanger = unit.affection <= 30;

      if (affValEl) {
        affValEl.innerHTML = `${unit.affection} / 100 ${isAffDanger ? '<span style="color:#dc2626; font-size:9px;">(거부위험)</span>' : ''}`;
      }
      if (affGauge) {
        affGauge.style.width = `${affPct}%`;
        affGauge.style.background = isAffDanger ? 'linear-gradient(90deg, #b91c1c 0%, #ef4444 100%)' : 'linear-gradient(90deg, #ec4899 0%, #f472b6 100%)';
      }
      if (affOverlay) {
        affOverlay.textContent = `호감도 ${unit.affection} / 100 ${isAffDanger ? '⚠️ 복종 거부 위험' : '💖 유대 양호'}`;
      }

      // Pastel Stats Grid
      const atkEl = document.getElementById('fullshot-stat-atk');
      const defEl = document.getElementById('fullshot-stat-def');
      const apEl = document.getElementById('fullshot-stat-ap');
      const coordEl = document.getElementById('fullshot-stat-coord');

      if (atkEl) atkEl.textContent = unit.atk;
      if (defEl) defEl.textContent = unit.def;
      if (apEl) {
        apEl.innerHTML = `<span style="color: ${unit.ap > 0 ? '#0284c7' : '#ef4444'}; font-weight: 900;">${unit.ap}</span> / ${unit.baseAP}`;
      }
      if (coordEl) {
        if (unit.x !== undefined && unit.y !== undefined) {
          const curTile = getTile(unit.x, unit.y);
          const tileName = curTile ? curTile.name : '평지';
          coordEl.innerHTML = `(${unit.x}, ${unit.y}) <span style="font-size:9px; font-weight:700; opacity:0.85;">${tileName}</span>`;
        } else {
          coordEl.innerHTML = `<span style="font-size:10px; font-weight:800; color:#0284c7;">본대 대기</span>`;
        }
      }

      // Visual Custom Skill Card (고유 스킬 연출 및 상태 렌더링)
      const skillContainer = document.getElementById('fullshot-skill-card-container');
      if (skillContainer) {
        if (unit.customSkill) {
          const s = unit.customSkill;
          const isActive = s.type === 'ACTIVE';
          const cdLeft = unit.customSkillCooldown || 0;
          const isAffDanger = unit.affection <= 30;

          let targetBadgeText = '💖 아군 회복/버프';
          if (s.targetType === 'SINGLE_TARGET') targetBadgeText = '🎯 단일 강타';
          else if (s.targetType === 'AOE') targetBadgeText = '💥 사거리 광역';
          else if (s.targetType === 'SELF') targetBadgeText = '🌟 자신 가속';

          let btnHtml = '';
          if (isActive) {
            if (unit.isInactivated) {
              btnHtml = `<button class="fullshot-btn-use-skill" disabled title="유지비 체납으로 정지됨">체납 정지</button>`;
            } else if (cdLeft > 0) {
              btnHtml = `<button class="fullshot-btn-use-skill" disabled title="쿨다운 대기 중">대기 ${cdLeft}턴</button>`;
            } else if (unit.ap < s.costAP) {
              btnHtml = `<button class="fullshot-btn-use-skill" disabled title="AP 부족 (필요: ${s.costAP})">AP ${s.costAP} 부족</button>`;
            } else {
              btnHtml = `<button class="fullshot-btn-use-skill" onclick="executeCustomSkill(getSelectedUnit())" title="클릭하여 고유 스킬 즉시 발동">⚡ 스킬 발동</button>`;
            }
          } else {
            btnHtml = `<span class="fullshot-skill-type-pill passive" style="font-size: 8.5px; padding: 2px 6px;">항시 적용(PASSIVE)</span>`;
          }

          const skillImg = s.imageUrl ? `<img src="${s.imageUrl}" alt="${s.name}" style="width:20px; height:20px; border-radius:4px; object-fit:cover; border:1px solid rgba(251,191,36,0.5);">` : `<span style="font-size: 13px;">${isActive ? '⚡' : '🛡️'}</span>`;

          skillContainer.className = 'fullshot-skill-card-container has-skill';
          skillContainer.innerHTML = `
            <div class="fullshot-skill-header">
              <div class="fullshot-skill-title-wrap">
                ${skillImg}
                <span class="fullshot-skill-name" title="${s.name}">${s.name}</span>
                <span class="fullshot-skill-type-pill ${isActive ? 'active' : 'passive'}">${isActive ? 'ACTIVE' : 'PASSIVE'}</span>
                ${s.tier ? `<span style="font-size: 8px; font-weight:800; background:#3b82f6; color:#fff; border-radius:3px; padding:1px 4px;">T${s.tier}</span>` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                ${isActive ? `<span class="fullshot-skill-cost-pill">AP -${s.costAP}</span>` : ''}
                ${isActive && s.coolDown > 0 ? `<span style="font-size: 8.5px; color: #64748b; font-weight: 700;">쿨 ${s.coolDown}턴</span>` : ''}
              </div>
            </div>
            <div class="fullshot-skill-desc" title="${s.description}">${s.description}</div>
            <div class="fullshot-skill-meta-row">
              <span class="fullshot-skill-target-tag">${targetBadgeText} (수치: ${s.effectValue}${s.type === 'PASSIVE' ? '%' : ''})</span>
              ${btnHtml}
            </div>
          `;
        } else {
          skillContainer.className = 'fullshot-skill-card-container';
          skillContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748b;">
              <span>✨ 등록된 고유 스킬이 없습니다</span>
              <button class="btn-cheat purple" style="font-size: 8.5px; padding: 2px 6px;" onclick="openDebugModal('create-char')">✨ 스킬 생성</button>
            </div>
          `;
        }
      }
    }

    /* --------------------------------------------------------------------------
       Custom Skill Execution Logic (고유 스킬 판정 및 발동 로직)
       -------------------------------------------------------------------------- */
    function executeCustomSkill(unit) {
      if (!unit || unit.isDead) return;
      const s = unit.customSkill;
      if (!s) {
        addLog(`⚠️ [스킬 없음] ${unit.name}에게 등록된 고유 스킬이 없습니다.`, 'warning');
        return;
      }
      if (s.type === 'PASSIVE') {
        addLog(`🛡️ [패시브 고유 스킬] ${unit.name}의 [${s.name}]은(는) 상시 발동 패시브입니다! 교전 시 공방 +${s.effectValue}%가 자동 적용됩니다.`, 'gold');
        return;
      }
      if (unit.isInactivated) {
        addLog(`🚫 [발동 불가] ${unit.name}은(는) 유지비 체납으로 행동이 정지된 상태입니다.`, 'danger');
        return;
      }
      if (unit.customSkillCooldown > 0) {
        addLog(`⏳ [쿨다운 대기] [${s.name}]의 재사용 대기시간이 아직 ${unit.customSkillCooldown}턴 남았습니다.`, 'warning');
        return;
      }
      if (unit.ap < s.costAP) {
        addLog(`⚡ [AP 부족] [${s.name}] 발동에 필요한 AP(${s.costAP})가 부족합니다. (현재: ${unit.ap})`, 'warning');
        return;
      }

      // 호감도 30 이하 전투/명령 거부 제약 체크 (공격형/원거리 스킬 시)
      if (unit.affection <= 30 && (s.targetType === 'SINGLE_TARGET' || s.targetType === 'AOE')) {
        const skills = state.commander.unlockedSkills;
        if (!skills.Berserk) {
          addLog(`❌ [스킬 거부!] ${unit.name}의 호감도가 ${unit.affection}으로 극히 낮아 위험한 스킬 명령을 거부합니다!`, 'danger');
          addLog(`💬 "${unit.name}: 지휘관님의 무리한 스킬 지시엔 따르지 않겠습니다!"`, 'warning');
          return;
        }
      }

      saveHistorySnapshot();

      const effectVal = Number(s.effectValue) || 30;
      let executed = false;

      if (s.targetType === 'BUFF') {
        // 아군 및 자신 회복 + 이번 턴 공격/방어 버프
        unit.hp = Math.min(unit.maxHp, unit.hp + effectVal);
        unit.customSkillBuffAtk = 0.25;
        unit.customSkillBuffDef = 0.25;

        // 인접 아군도 회복
        const allies = state.playerUnits.filter(u => !u.isDead && u.id !== unit.id && Math.abs(u.x - unit.x) <= 1 && Math.abs(u.y - unit.y) <= 1);
        allies.forEach(a => {
          a.hp = Math.min(a.maxHp, a.hp + Math.round(effectVal * 0.7));
          a.customSkillBuffAtk = 0.20;
          a.customSkillBuffDef = 0.20;
        });

        addLog(`✨ [고유 스킬 발동: ${s.name}] ${unit.name}이(가) 신성한 수호 성벽을 전개했습니다! HP +${effectVal} 회복 및 공격·방어 +25% 증폭! (인접 아군 ${allies.length}기 연계 수혜)`, 'gold');
        executed = true;

      } else if (s.targetType === 'SELF') {
        // 자신 행동력 회복 및 재생
        unit.ap = unit.baseAP;
        unit.hp = Math.min(unit.maxHp, unit.hp + effectVal);
        addLog(`🌟 [고유 스킬 발동: ${s.name}] ${unit.name}이(가) 내재된 잠재력을 각성하여 행동력(AP)을 전량(${unit.baseAP}) 회복하고 HP +${effectVal}을 치유했습니다!`, 'gold');
        executed = true;

      } else if (s.targetType === 'SINGLE_TARGET') {
        // 사거리 2칸 내의 적 타격
        const inRange = state.enemyUnits.filter(e => !e.isDead && (Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y) <= 2));
        if (inRange.length === 0) {
          addLog(`⚠️ [사거리 밖] 2칸 내에 [${s.name}]의 목표로 삼을 적군이 없습니다. 적 근처로 접근하세요.`, 'warning');
          return;
        }
        // 타겟팅 우선순위: 현재 검사 중인 적 or 첫 번째 적
        const target = inRange.find(e => e.id === cardInspectedEnemyId) || inRange[0];
        target.hp = Math.max(0, target.hp - effectVal);
        if (target.hp <= 0) {
          target.isDead = true;
          addLog(`💥 [고유 스킬 격살!] ${unit.name}의 [${s.name}]이(가) ${target.name}에게 ${effectVal}의 치명타를 꽂아 넣어 격퇴했습니다!`, 'success');
        } else {
          addLog(`⚡ [고유 스킬 명중!] ${unit.name}의 [${s.name}]이(가) ${target.name}에게 ${effectVal} 피해를 입혔습니다! (적 잔여 HP: ${target.hp}/${target.maxHp})`, 'combat');
        }
        executed = true;

      } else if (s.targetType === 'AOE') {
        // 사거리 2칸 내의 모든 적에게 광역 피해
        const inRange = state.enemyUnits.filter(e => !e.isDead && (Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y) <= 2));
        if (inRange.length === 0) {
          addLog(`⚠️ [사거리 밖] 사거리 2칸 내에 [${s.name}] 폭격을 가할 적군이 없습니다.`, 'warning');
          return;
        }
        let killedCount = 0;
        inRange.forEach(target => {
          target.hp = Math.max(0, target.hp - effectVal);
          if (target.hp <= 0) {
            target.isDead = true;
            killedCount++;
          }
        });
        addLog(`💥 [고유 광역 스킬 작렬: ${s.name}] ${unit.name}의 융단 폭격이 반경 2칸 내 적군 ${inRange.length}기에게 각각 ${effectVal} 피해를 입혔습니다! (격퇴: ${killedCount}기)`, 'gold');
        executed = true;
      }

      if (executed) {
        unit.ap = Math.max(0, unit.ap - s.costAP);
        unit.customSkillCooldown = s.coolDown;
        saveGameState();
        renderAll();
        updateFullShotOverlay();
      }
    }

    function openFullShotOverlay(targetUnit) {
      if (targetUnit && targetUnit.id) {
        selectedUnitId = targetUnit.id;
        currentOverlayTargetUnit = targetUnit;
      } else {
        currentOverlayTargetUnit = getSelectedUnit();
      }
      const unit = currentOverlayTargetUnit;
      if (!unit || unit.isDead) return;
      const overlay = document.getElementById('unit-fullshot-overlay');
      if (overlay) {
        overlay.classList.add('active');
        updateFullShotOverlay(unit);
      }
    }

    function closeFullShotOverlay() {
      const overlay = document.getElementById('unit-fullshot-overlay');
      if (overlay) {
        overlay.classList.remove('active');
      }
      currentOverlayTargetUnit = null;
    }

    window.openFullShotOverlay = openFullShotOverlay;
    window.closeFullShotOverlay = closeFullShotOverlay;
    window.updateFullShotOverlay = updateFullShotOverlay;

    function onFullshotMoveClicked() {
      const unit = currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) return;
      if (state.currentView === 'STRATEGY') {
        switchGameView('SECTOR_MAP');
      }
      if (unit.isInactivated) {
        addLog(`🚫 [이동 불가] ${unit.name}은(는) 유지비 미납으로 행동이 정지된 상태입니다.`, 'danger');
        return;
      }
      if (unit.ap <= 0) {
        addLog(`⚡ [AP 부족] ${unit.name}의 잔여 행동력(AP)이 부족합니다.`, 'warning');
        return;
      }
      addLog(`👟 [이동 대기] 지도 상의 초록색 타일을 터치하여 이동할 위치를 지정하세요.`, 'system');
      const mapEl = document.getElementById('grid-map');
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function onFullshotAttackClicked() {
      const unit = currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) return;
      if (state.currentView === 'STRATEGY') {
        switchGameView('SECTOR_MAP');
      }
      if (unit.isInactivated) {
        addLog(`🚫 [공격 불가] ${unit.name}은(는) 유지비 미납으로 행동이 정지된 상태입니다.`, 'danger');
        return;
      }
      if (unit.ap <= 0) {
        addLog(`⚡ [AP 부족] ${unit.name}의 잔여 행동력(AP)이 부족합니다.`, 'warning');
        return;
      }
      const inRangeEnemies = getEnemiesInRange(unit);
      if (inRangeEnemies.length > 0) {
        const targetDefender = inRangeEnemies.find(e => e.id === cardInspectedEnemyId) ||
                               inRangeEnemies.find(e => e.id === debugInspectedEnemyId) ||
                               inRangeEnemies[0];
        addLog(`⚔️ [교전 명령] ${unit.name} -> ${targetDefender.name} 요격을 개시합니다!`, 'combat');
        executeCombat(unit, targetDefender);
      } else {
        addLog(`⚠️ [사거리 밖] 현재 사거리 내에 교전 가능한 적이 없습니다. 먼저 적 근처로 이동하세요.`, 'warning');
      }
    }

    function onFullshotSkillClicked() {
      const unit = getSelectedUnit();
      if (!unit || unit.isDead) return;
      if (typeof window.renderPromotionMenu === 'function') {
        window.renderPromotionMenu(unit);
      } else if (typeof window.UI?.renderPromotionMenu === 'function') {
        window.UI.renderPromotionMenu(unit);
      } else if (unit.customSkill) {
        if (unit.customSkill.type === 'PASSIVE') {
          addLog(`🛡️ [패시브 고유 스킬] ${unit.name}의 [${unit.customSkill.name}]은(는) 상시 발동 패시브입니다! 교전 시 스탯/공식에 자동 반영됩니다.`, 'gold');
          return;
        }
        executeCustomSkill(unit);
      } else {
        openClassSkillModal(unit);
      }
    }

    function onFullshotDeselectClicked() {
      selectedUnitId = null;
      closeFullShotOverlay();
      currentInteractionMode = null;
      renderAll();
      addLog('ℹ️ [선택 해제] 유닛 선택을 해제하고 전장 맵을 확인합니다.', 'system');
    }

    /* --------------------------------------------------------------------------
       Admin Authentication & Debug Panel Controller Functions
       -------------------------------------------------------------------------- */
    let debugInspectedEnemyId = null;

    function openAdminAuthModal() {
      closeAllModals();
      const modal = document.getElementById('modal-admin-auth');
      const input = document.getElementById('input-admin-pwd');
      const errEl = document.getElementById('admin-pwd-error');
      if (modal) {
        modal.classList.add('open');
        if (input) {
          input.value = '';
          input.type = 'password';
          setTimeout(() => input.focus(), 150);
        }
        if (errEl) errEl.style.display = 'none';
      }
    }

    function closeAdminAuthModal() {
      const modal = document.getElementById('modal-admin-auth');
      if (modal) modal.classList.remove('open');
      const input = document.getElementById('input-admin-pwd');
      if (input) input.value = '';
      const errEl = document.getElementById('admin-pwd-error');
      if (errEl) errEl.style.display = 'none';
    }

    function submitAdminAuth() {
      const input = document.getElementById('input-admin-pwd');
      const errEl = document.getElementById('admin-pwd-error');
      const pwd = input ? input.value.trim() : '';

      if (pwd === '20250113') {
        closeAdminAuthModal();
        openDebugModal();
        addLog('🛡️ [관리자 인증 완료] 개발자 DEV 패널 접근 승인 완료', 'success');
      } else {
        if (errEl) {
          errEl.style.display = 'flex';
          errEl.textContent = '⚠️ 비밀번호가 일치하지 않습니다.';
        }
        if (input) {
          input.classList.add('shake-error');
          setTimeout(() => input.classList.remove('shake-error'), 450);
          input.select();
        }
        addLog('⚠️ [관리자 인증 실패] 비밀번호가 일치하지 않습니다.', 'danger');
      }
    }

    function setupTurnLongPress(element, isEndTurnBtn = false) {
      if (!element) return;
      let timer = null;
      let isLongPressed = false;

      const startHold = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isLongPressed = false;
        element.classList.add('holding');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          isLongPressed = true;
          element.classList.remove('holding');
          if (navigator.vibrate) {
            try { navigator.vibrate([40, 60, 40]); } catch (_) {}
          }
          openAdminAuthModal();
        }, 3000);
      };

      const cancelHold = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        element.classList.remove('holding');
      };

      element.addEventListener('pointerdown', startHold);
      element.addEventListener('pointerup', (e) => {
        if (isLongPressed) {
          e.preventDefault();
          e.stopPropagation();
        }
        cancelHold();
      });
      element.addEventListener('pointerleave', cancelHold);
      element.addEventListener('pointercancel', cancelHold);

      if (isEndTurnBtn) {
        const origOnClick = element.onclick;
        element.onclick = (e) => {
          if (isLongPressed) {
            e.preventDefault();
            e.stopPropagation();
            isLongPressed = false;
            return;
          }
          if (origOnClick) origOnClick.call(element, e);
        };
      } else {
        element.addEventListener('click', () => {
          if (!isLongPressed) {
            addLog('💡 [안내] Turn 버튼을 3초간 길게 누르면 관리자 DEV 패널에 진입할 수 있습니다.', 'system');
          }
        });
      }
    }

    function openDebugModal(preferredTab = 'create-char') {
      const modal = document.getElementById('modal-debug');
      if (modal) {
        modal.classList.add('open');
        syncDebugInputsFromState();
        updateDebugInspector();
        switchDebugTab(preferredTab);
      }
    }

    function switchDebugTab(tabName) {
      ['create-char', 'images', 'units', 'balance', 'econ', 'cheats'].forEach(t => {
        const btn = document.getElementById(`tab-btn-dbg-${t}`);
        const page = document.getElementById(`tab-content-dbg-${t}`);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (page) page.style.display = (t === tabName) ? 'block' : 'none';
      });
      if (tabName === 'create-char') {
        initCustomCharCreationForm();
      } else if (tabName === 'images') {
        renderDebugImageManager();
      }
      updateDebugInspector();
    }

    function selectDebugClass(classType) {
      currentDebugClass = classType;
      ['KNIGHT', 'MAGE', 'ARCHER', 'MELEE', 'FIREARM'].forEach(c => {
        const btn = document.getElementById(`class-btn-${c}`);
        if (btn) btn.classList.toggle('active', c === classType);
      });
      syncDebugInputsFromState();
      updateDebugInspector();
    }

    function onDebugStatChange(statKey, val) {
      const numVal = parseInt(val, 10);
      if (isNaN(numVal)) return;

      // Update current class parameters in debugParams
      if (debugParams.unitClassStats[currentDebugClass]) {
        debugParams.unitClassStats[currentDebugClass][statKey] = numVal;
      }

      // Update slider and number box in UI
      const idKey = statKey === 'baseAP' ? 'ap' : (statKey === 'affection' ? 'aff' : statKey);
      const slider = document.getElementById(`slider-dbg-${idKey}`);
      const numInput = document.getElementById(`num-dbg-${idKey}`);
      const lbl = document.getElementById(`lbl-dbg-${idKey}`);
      if (slider) slider.value = numVal;
      if (numInput) numInput.value = numVal;
      if (lbl) lbl.textContent = numVal;

      // Immediately propagate to all active units in playerUnits matching this class
      state.playerUnits.forEach(u => {
        if (u.classType === currentDebugClass) {
          u[statKey] = numVal;
          if (statKey === 'hp') u.maxHp = Math.max(u.maxHp, numVal);
          if (statKey === 'baseAP') u.ap = Math.min(u.ap, numVal);
        }
      });

      renderAll();
      updateDebugInspector();
    }

    function onDebugBalanceChange(paramKey, val) {
      const floatVal = parseFloat(val);
      if (isNaN(floatVal)) return;

      if (paramKey === 'tileDefBonusMultiplier') {
        debugParams.tileDefBonusMultiplier = floatVal / 100.0;
        const lbl = document.getElementById('lbl-dbg-tiledef');
        if (lbl) lbl.textContent = `${floatVal}%`;
        const slider = document.getElementById('slider-dbg-tiledef');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-tiledef');
        if (num) num.value = floatVal;
      } else if (paramKey === 'collateralDamageMultiplier') {
        debugParams.collateralDamageMultiplier = floatVal / 100.0;
        const lbl = document.getElementById('lbl-dbg-splash');
        if (lbl) lbl.textContent = `${floatVal}%`;
        const slider = document.getElementById('slider-dbg-splash');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-splash');
        if (num) num.value = floatVal;
      } else if (paramKey === 'winChanceAttackerWeight') {
        debugParams.winChanceAttackerWeight = floatVal;
        const lbl = document.getElementById('lbl-dbg-watk');
        if (lbl) lbl.textContent = `${floatVal.toFixed(1)}x`;
        const slider = document.getElementById('slider-dbg-watk');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-watk');
        if (num) num.value = floatVal;
      } else if (paramKey === 'winChanceDefenderWeight') {
        debugParams.winChanceDefenderWeight = floatVal;
        const lbl = document.getElementById('lbl-dbg-wdef');
        if (lbl) lbl.textContent = `${floatVal.toFixed(1)}x`;
        const slider = document.getElementById('slider-dbg-wdef');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-wdef');
        if (num) num.value = floatVal;
      }

      updateDebugInspector();
    }

    function onDebugResourceChange(resKey, val) {
      const intVal = parseInt(val, 10);
      if (isNaN(intVal)) return;

      if (resKey === 'gold') {
        state.gold = Math.max(0, intVal);
        const lbl = document.getElementById('lbl-dbg-gold');
        if (lbl) lbl.textContent = `${state.gold}G`;
        const slider = document.getElementById('slider-dbg-gold');
        if (slider) slider.value = state.gold;
        const num = document.getElementById('num-dbg-gold');
        if (num) num.value = state.gold;
      } else if (resKey === 'rewinders') {
        state.rewinders = Math.max(0, intVal);
        const lbl = document.getElementById('lbl-dbg-rewind');
        if (lbl) lbl.textContent = `${state.rewinders}개`;
        const slider = document.getElementById('slider-dbg-rewind');
        if (slider) slider.value = state.rewinders;
        const num = document.getElementById('num-dbg-rewind');
        if (num) num.value = state.rewinders;
      } else if (resKey === 'sp') {
        state.commander.skillPoints = Math.max(0, intVal);
        const lbl = document.getElementById('lbl-dbg-sp');
        if (lbl) lbl.textContent = `${state.commander.skillPoints} SP`;
        const slider = document.getElementById('slider-dbg-sp');
        if (slider) slider.value = state.commander.skillPoints;
        const num = document.getElementById('num-dbg-sp');
        if (num) num.value = state.commander.skillPoints;
      }

      renderAll();
    }

    function setForcedBattleResult(mode) {
      debugParams.forcedBattleResult = mode;
      ['NONE', 'WIN', 'LOSE'].forEach(m => {
        const btn = document.getElementById(`btn-force-${m}`);
        if (btn) {
          btn.classList.toggle('active',
            (m === 'NONE' && mode === 'NONE') ||
            (m === 'WIN' && mode === 'FORCE_WIN') ||
            (m === 'LOSE' && mode === 'FORCE_LOSE')
          );
        }
      });
      updateDebugInspector();
    }

    function updateDebugInspector() {
      const atkUnit = getSelectedUnit();
      let defUnit = state.enemyUnits.find(e => !e.isDead && e.id === debugInspectedEnemyId);
      if (!defUnit) {
        defUnit = state.enemyUnits.find(e => !e.isDead);
      }

      const atkNameEl = document.getElementById('dbg-inspect-atk-name');
      const atkValEl = document.getElementById('dbg-inspect-atk-val');
      const defNameEl = document.getElementById('dbg-inspect-def-name');
      const defValEl = document.getElementById('dbg-inspect-def-val');
      const winPctEl = document.getElementById('dbg-inspect-win-pct');
      const winBarEl = document.getElementById('dbg-inspect-win-bar');
      const notesEl = document.getElementById('dbg-inspect-notes');

      if (!atkNameEl) return;

      if (!atkUnit) {
        atkNameEl.textContent = '선택 유닛 없음';
        atkValEl.textContent = '0.0';
      } else {
        atkNameEl.textContent = `${atkUnit.name} (${atkUnit.classType})`;
        atkValEl.textContent = `${atkUnit.atk.toFixed(1)}`;
      }

      if (!defUnit) {
        defNameEl.textContent = '생존 적군 없음';
        defValEl.textContent = '0.0';
        winPctEl.textContent = '100.0%';
        winBarEl.style.width = '100%';
        if (notesEl) notesEl.textContent = '현재 전장에 생존한 적군이 없습니다.';
        return;
      }

      defNameEl.textContent = `${defUnit.name} (${defUnit.classType})`;

      const odds = atkUnit ? getCombatOdds(atkUnit, defUnit) : null;
      if (odds) {
        defValEl.textContent = `${odds.finalDef.toFixed(1)}${odds.tileDefBonus > 0 ? ` (+${(odds.tileDefBonus*100).toFixed(0)}%)` : ''}`;
        let pctStr = `${odds.winPercent}%`;
        if (debugParams.forcedBattleResult === 'FORCE_WIN') {
          pctStr = '100% (치트: 무조건 승리)';
        } else if (debugParams.forcedBattleResult === 'FORCE_LOSE') {
          pctStr = '0% (치트: 무조건 패배)';
        }
        winPctEl.textContent = pctStr;
        winBarEl.style.width = `${Math.min(100, Math.max(0, odds.P * 100))}%`;
        if (notesEl) {
          const wAtk = debugParams.winChanceAttackerWeight ?? 1.0;
          const wDef = debugParams.winChanceDefenderWeight ?? 1.0;
          notesEl.textContent = `공식: P = (${odds.finalAtk.toFixed(1)}*${wAtk.toFixed(1)}) / [ (${odds.finalAtk.toFixed(1)}*${wAtk.toFixed(1)}) + (${odds.finalDef.toFixed(1)}*${wDef.toFixed(1)}) ] = ${odds.winPercent}%${odds.isDangerAffection ? ' [호감도 거부위험]' : ''}`;
        }
      }
    }

    function syncDebugInputsFromState() {
      // 1. Current Class stats
      const curStats = debugParams.unitClassStats[currentDebugClass] || { atk: 40, def: 30, baseAP: 2, affection: 60, hp: 80 };
      const atkInput = document.getElementById('slider-dbg-atk');
      if (atkInput) {
        document.getElementById('slider-dbg-atk').value = curStats.atk;
        document.getElementById('num-dbg-atk').value = curStats.atk;
        document.getElementById('lbl-dbg-atk').textContent = curStats.atk;

        document.getElementById('slider-dbg-ap').value = curStats.baseAP;
        document.getElementById('num-dbg-ap').value = curStats.baseAP;
        document.getElementById('lbl-dbg-ap').textContent = curStats.baseAP;

        document.getElementById('slider-dbg-aff').value = curStats.affection;
        document.getElementById('num-dbg-aff').value = curStats.affection;
        document.getElementById('lbl-dbg-aff').textContent = curStats.affection;

        document.getElementById('slider-dbg-def').value = curStats.def;
        document.getElementById('num-dbg-def').value = curStats.def;
        document.getElementById('lbl-dbg-def').textContent = curStats.def;

        document.getElementById('slider-dbg-hp').value = curStats.hp;
        document.getElementById('num-dbg-hp').value = curStats.hp;
        document.getElementById('lbl-dbg-hp').textContent = curStats.hp;
      }

      // 2. Currencies
      const goldEl = document.getElementById('slider-dbg-gold');
      if (goldEl) {
        goldEl.value = state.gold;
        document.getElementById('num-dbg-gold').value = state.gold;
        document.getElementById('lbl-dbg-gold').textContent = `${state.gold}G`;

        document.getElementById('slider-dbg-rewind').value = state.rewinders;
        document.getElementById('num-dbg-rewind').value = state.rewinders;
        document.getElementById('lbl-dbg-rewind').textContent = `${state.rewinders}개`;

        document.getElementById('slider-dbg-sp').value = state.commander.skillPoints;
        document.getElementById('num-dbg-sp').value = state.commander.skillPoints;
        document.getElementById('lbl-dbg-sp').textContent = `${state.commander.skillPoints} SP`;
      }
    }

    /* --------------------------------------------------------------------------
       Cheat Actions Implementation
       -------------------------------------------------------------------------- */
    function cheatSpawnUnit() {
      const team = document.getElementById('sel-spawn-team').value;
      const classType = document.getElementById('sel-spawn-class').value;
      const x = Math.max(0, Math.min(GRID_COLS - 1, parseInt(document.getElementById('num-spawn-x').value, 10) || 0));
      const y = Math.max(0, Math.min(GRID_ROWS - 1, parseInt(document.getElementById('num-spawn-y').value, 10) || 0));

      saveHistorySnapshot();

      const unitId = (team === 'PLAYER' ? 'p_' : 'e_') + Date.now();
      const preset = debugParams.unitClassStats[classType] || { atk: 40, def: 25, baseAP: 2, affection: 70, hp: 80 };
      
      const avatarMap = {
        KNIGHT: '🐴',
        MAGE: '🔮',
        ARCHER: '🏹',
        MELEE: '⚔️',
        FIREARM: '💥'
      };
      const namePrefix = team === 'PLAYER' ? '소환된 ' : '적군 ';

      const newUnit = {
        id: unitId,
        name: namePrefix + classType,
        classType: classType,
        avatar: avatarMap[classType] || '👤',
        level: 1,
        hp: preset.hp,
        maxHp: preset.hp,
        atk: preset.atk,
        def: preset.def,
        baseAP: preset.baseAP,
        ap: preset.baseAP,
        affection: team === 'PLAYER' ? preset.affection : 0,
        upkeep: team === 'PLAYER' ? 10 : 0,
        x: x,
        y: y,
        isInactivated: false,
        isDead: false,
        promotions: { combatRank: 0 }
      };

      if (team === 'PLAYER') {
        state.playerUnits.push(newUnit);
        selectedUnitId = unitId;
        const totalStacked = state.playerUnits.filter(u => !u.isDead && u.x === x && u.y === y).length;
        if (totalStacked > 1) {
          addLog(`✨ [디버그 치트] 아군 유닛 ${newUnit.name}을(를) (${x}, ${y})에 생성 (해당 타일 아군 총 ${totalStacked}기 중첩 배치)!`, 'gold');
        } else {
          addLog(`✨ [디버그 치트] 아군 유닛 ${newUnit.name}을(를) (${x}, ${y}) 좌표에 즉시 생성했습니다!`, 'gold');
        }
      } else {
        state.enemyUnits.push(newUnit);
        const totalStacked = state.enemyUnits.filter(u => !u.isDead && u.x === x && u.y === y).length;
        if (totalStacked > 1) {
          addLog(`⚡ [디버그 치트] 적군 유닛 ${newUnit.name}을(를) (${x}, ${y})에 생성 (해당 타일 적군 총 ${totalStacked}기 중첩 배치)!`, 'warning');
        } else {
          addLog(`⚡ [디버그 치트] 적군 유닛 ${newUnit.name}을(를) (${x}, ${y}) 좌표에 즉시 생성했습니다!`, 'warning');
        }
      }

      renderAll();
      updateDebugInspector();
    }

    function cheatAddGold(amount) {
      saveHistorySnapshot();
      state.gold += amount;
      addLog(`💰 [디버그 치트] 골드 +${amount}G 지급! (현재: ${state.gold}G)`, 'gold');
      renderAll();
      syncDebugInputsFromState();
    }

    function cheatAddRewinder(amount) {
      saveHistorySnapshot();
      state.rewinders = Math.min(10, state.rewinders + amount);
      addLog(`⏳ [디버그 치트] 리와인더 +${amount} 충전! (현재: ${state.rewinders}개)`, 'gold');
      renderAll();
      syncDebugInputsFromState();
    }

    function cheatSetAffection(val) {
      const unit = getSelectedUnit();
      if (!unit) {
        addLog('⚠️ 선택된 아군 유닛이 없습니다.', 'warning');
        return;
      }
      saveHistorySnapshot();
      unit.affection = val;
      addLog(`💖 [디버그 치트] ${unit.name}의 호감도를 ${val}으로 설정했습니다.`, 'gold');
      renderAll();
    }

    function cheatSetAllAffection(val) {
      saveHistorySnapshot();
      state.playerUnits.forEach(u => {
        if (!u.isDead) u.affection = val;
      });
      addLog(`🌟 [디버그 치트] 모든 생존 아군 유닛의 호감도를 ${val}으로 설정했습니다!`, 'gold');
      renderAll();
    }

    function cheatDeleteSelectedUnit() {
      const unit = getSelectedUnit();
      if (!unit) {
        addLog('⚠️ 선택된 아군 유닛이 없습니다.', 'warning');
        return;
      }
      saveHistorySnapshot();
      unit.isDead = true;
      addLog(`💀 [디버그 치트] 선택된 유닛 ${unit.name}을(를) 영구 제거(Permadeath) 처리했습니다.`, 'danger');
      
      const aliveUnit = state.playerUnits.find(u => !u.isDead);
      if (aliveUnit) selectedUnitId = aliveUnit.id;
      
      renderAll();
      updateDebugInspector();
    }

    function cheatUnlockAllSkills() {
      saveHistorySnapshot();
      Object.keys(COMMANDER_SKILLS_DATA).forEach(k => {
        state.commander.unlockedSkills[k] = true;
      });
      addLog(`⭐ [디버그 치트] 지휘관의 모든 패시브 스킬 8종을 즉시 해금했습니다!`, 'gold');
      renderAll();
      updateDebugInspector();
    }

    function cheatLevelUpCommander() {
      saveHistorySnapshot();
      state.commander.level += 1;
      state.commander.skillPoints += 2;
      addLog(`👑 [디버그 치트] 지휘관 레벨업! Lv.${state.commander.level} (SP +2 지급)`, 'gold');
      renderAll();
      syncDebugInputsFromState();
    }

    function cheatRecoverAllAP() {
      saveHistorySnapshot();
      state.playerUnits.forEach(u => {
        if (!u.isDead) {
          u.ap = u.baseAP;
          u.isInactivated = false;
        }
      });
      addLog(`⚡ [디버그 치트] 모든 아군 유닛의 행동력(AP)을 완전히 충전했습니다!`, 'gold');
      renderAll();
    }

    function cheatHealAllUnits() {
      saveHistorySnapshot();
      state.playerUnits.forEach(u => {
        if (!u.isDead) {
          u.hp = u.maxHp;
        }
      });
      addLog(`🩸 [디버그 치트] 모든 아군 유닛의 체력을 100% 회복했습니다!`, 'gold');
      renderAll();
    }

    function cheatResetAllDefaults() {
      saveHistorySnapshot();
      debugParams.unitClassStats = {
        KNIGHT: { atk: 48, def: 38, baseAP: 3, affection: 85, hp: 100 },
        MELEE: { atk: 35, def: 30, baseAP: 2, affection: 40, hp: 85 },
        ARCHER: { atk: 42, def: 20, baseAP: 2, affection: 28, hp: 70 },
        MAGE: { atk: 52, def: 22, baseAP: 2, affection: 60, hp: 65 },
        FIREARM: { atk: 58, def: 25, baseAP: 2, affection: 45, hp: 75 }
      };
      debugParams.tileDefBonusMultiplier = 1.0;
      debugParams.collateralDamageMultiplier = 0.30;
      debugParams.winChanceAttackerWeight = 1.0;
      debugParams.winChanceDefenderWeight = 1.0;
      debugParams.forcedBattleResult = 'NONE';

      onDebugBalanceChange('tileDefBonusMultiplier', 100);
      onDebugBalanceChange('collateralDamageMultiplier', 30);
      onDebugBalanceChange('winChanceAttackerWeight', 1.0);
      onDebugBalanceChange('winChanceDefenderWeight', 1.0);
      setForcedBattleResult('NONE');
      syncDebugInputsFromState();

      addLog(`🔄 [디버그 치트] 모든 밸런스 및 유닛 파라미터가 초기값으로 리셋되었습니다.`, 'gold');
      renderAll();
      updateDebugInspector();
    }

    /* --------------------------------------------------------------------------
       Initialization & Button Binding
       -------------------------------------------------------------------------- */
    function init() {
      // 0. 모든 활성 및 대기 유닛 체력 100-Point 정규화 자동 실행
      normalizeAllUnitsHP(state);

      // 턴 종료 버튼
      const btnEndTurn = document.getElementById('btn-end-turn');
      if (btnEndTurn) btnEndTurn.onclick = executeEndTurn;

      // 리와인더 버튼
      const btnRewind = document.getElementById('btn-rewind');
      if (btnRewind) btnRewind.onclick = executeRewind;

      // 스킬 모달 오픈
      const btnOpenSkills = document.getElementById('btn-open-skills');
      if (btnOpenSkills) btnOpenSkills.onclick = openSkillsModal;

      // 오프라인 수비 시뮬레이션 모달 오픈
      const btnOpenDefense = document.getElementById('btn-open-defense-modal');
      if (btnOpenDefense) {
        btnOpenDefense.onclick = () => {
          const modalDef = document.getElementById('modal-defense');
          if (modalDef) modalDef.classList.add('open');
        };
      }

      // Turn 버튼 3초 이상 누를 시 관리자 DEV 패널 인증 진입 (Turn 배지 및 턴 종료 버튼 모두 지원)
      const uiTurnEl = document.getElementById('ui-turn');
      if (uiTurnEl) setupTurnLongPress(uiTurnEl, false);
      if (btnEndTurn) setupTurnLongPress(btnEndTurn, true);

      // 관리자 비밀번호 엔터키 및 비밀번호 표시 토글
      const adminPwdInput = document.getElementById('input-admin-pwd');
      if (adminPwdInput) {
        adminPwdInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitAdminAuth();
          }
        });
      }
      const btnTogglePwd = document.getElementById('btn-toggle-admin-pwd');
      if (btnTogglePwd && adminPwdInput) {
        btnTogglePwd.onclick = () => {
          if (adminPwdInput.type === 'password') {
            adminPwdInput.type = 'text';
            btnTogglePwd.textContent = '🙈';
          } else {
            adminPwdInput.type = 'password';
            btnTogglePwd.textContent = '👁️';
          }
        };
      }

      // 헤더 DEV 패널 버튼
      const btnHeaderDev = document.getElementById('btn-header-dev');
      if (btnHeaderDev) {
        btnHeaderDev.onclick = () => {
          openDebugModal('create-char');
        };
      }

      // 플레이어 네임 클릭 시 병과특기(특수스킬) 진입
      const cardNameWrap = document.getElementById('card-name-wrap');
      if (cardNameWrap) {
        cardNameWrap.onclick = () => openClassSkillModal();
      }
      // 유닛 카드 아바타 클릭 시 풀샷 오버레이 오픈
      const cardAvatarWrap = document.getElementById('card-avatar-wrap');
      if (cardAvatarWrap) {
        cardAvatarWrap.onclick = () => openFullShotOverlay();
      }

      // 하단 카드 영역 클릭 시 풀샷 오버레이 오픈 (버튼 클릭 제외)
      const unitCard = document.getElementById('selected-unit-card');
      if (unitCard) {
        unitCard.addEventListener('click', (e) => {
          if (!e.target.closest('button') && selectedUnitId) {
            openFullShotOverlay();
          }
        });
      }

      // Firebase Cloud Firestore & Auth 자동 연동 리스너 설정 (Zero LocalStorage)
      window.onFirebaseUserReady = function(user) {
        if (!user || !user.uid) return;
        try {
          console.log("🔥 [Firebase Ready] Cloud Firestore 연동 활성화:", user.uid);
          if (state && state.guest) {
            state.guest.firebaseUid = user.uid;
          }
          const guestIdEl = document.getElementById('ui-guest-id');
          if (guestIdEl) {
            guestIdEl.textContent = `FB_${user.uid.substring(0, 5)}`;
            guestIdEl.title = `Firebase 익명 인증 UID: ${user.uid}`;
          }
          addLog(`🔥 [Firebase 연동 완료] 익명 인증(UID: ${user.uid.substring(0, 8)}...) 및 Firestore/Storage 실시간 동기화 활성화!`, 'gold');

          if (typeof window.loadGameStateFromCloud === 'function') {
            window.loadGameStateFromCloud().then(data => {
              if (data) {
                loadGameState(data);
                addLog(`☁️ [클라우드 복원] 이전 게임 진행 상태가 Firestore에서 복원되었습니다. (Turn ${state.turn})`, 'system');
              }
            }).catch(e => console.warn(e));
          }
          if (typeof window.getCharactersFromCloud === 'function') {
            window.getCharactersFromCloud().then(chars => {
              if (Array.isArray(chars) && chars.length > 0) {
                syncGlobalCharactersFromFirestore(chars);
              }
            }).catch(e => console.warn(e));
          }
          if (typeof window.subscribeCharacterList === 'function') {
            try {
              window.subscribeCharacterList((chars) => {
                syncGlobalCharactersFromFirestore(chars);
              });
            } catch (e) {
              console.warn(e);
            }
          }

          // Firestore 'maps' 컬렉션에 현재 맵 데이터 동기화
          if (window.FirebaseBridge && typeof window.FirebaseBridge.syncMapToFirestore === 'function') {
            window.FirebaseBridge.syncMapToFirestore('default_map', tiles);
            saveGameState(true);
          }

          applyStoredCustomImages();
        } catch (err) {
          console.warn('onFirebaseUserReady error:', err);
        }
      };

      // 이미 Firebase가 준비되어 있는 경우 즉시 동기화
      if (window.FirebaseBridge && window.FirebaseBridge.isReady && window.FirebaseBridge.currentUser) {
        window.onFirebaseUserReady(window.FirebaseBridge.currentUser);
      }

      // 저장된 커스텀 캐릭터 이미지 복원 및 DEV 패널 초기화
      applyStoredCustomImages();
      renderDebugImageManager();
      initCustomCharCreationForm();

      // 상단 지휘관 네임 클릭 시에도 스킬 메뉴 진입 지원
      const cmdName = document.getElementById('ui-cmd-name');
      if (cmdName) {
        cmdName.style.cursor = 'pointer';
        cmdName.title = '지휘관 패시브 스킬 메뉴 열기';
        cmdName.onclick = openSkillsModal;
      }

      // 플로팅 배너 닫기
      const btnCloseBanner = document.getElementById('btn-close-banner');
      if (btnCloseBanner) {
        btnCloseBanner.onclick = () => {
          const banner = document.getElementById('floating-banner');
          if (banner) banner.style.display = 'none';
        };
      }

      // 전략 메인 화면 -> 작전 개시 (출격 시뮬레이션 모달 오픈)
      const btnOpenDeploy = document.getElementById('btn-open-deploy-modal');
      if (btnOpenDeploy) {
        btnOpenDeploy.onclick = openSectorDeployModal;
      }

      // 섹터 맵 필드 -> 전략 월드맵 복귀 버튼
      const btnReturnToStrat = document.getElementById('btn-return-to-strategy');
      if (btnReturnToStrat) {
        btnReturnToStrat.onclick = () => switchGameView('STRATEGY');
      }

      // 출격 시뮬레이션 모달 내 전술 전개 시작 버튼
      const btnLaunchSim = document.getElementById('btn-launch-deploy-sim');
      if (btnLaunchSim) {
        btnLaunchSim.onclick = launchSectorOperation;
      }

      // 월드 섹터 탐색 롱프레스는 civ4-editor.js (EditorAuth)에서 안전한 인앱 모달로 전담 관리됨
      // 초기 스냅샷 보관 및 렌더링
      saveHistorySnapshot();
      renderAll();
      syncDebugInputsFromState();
      updateDebugInspector();
    }

    // Window Exports
    window.checkCommandRefusal = checkCommandRefusal;
    window.executeAttack = executeAttack;
    window.applyPromotion = applyPromotion;
    window.calculateCombatModifiers = calculateCombatModifiers;
    window.addSkillToTree = addSkillToTree;
    window.updateSkillImage = updateSkillImage;
    window.getCharacterSkillTree = getCharacterSkillTree;
    window.syncGlobalCharactersFromFirestore = syncGlobalCharactersFromFirestore;

    // Window Load
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    /* --------------------------------------------------------------------------
       Promotion Level-Up & Commander Synergy System (Civ4-inspired)
       -------------------------------------------------------------------------- */
    const PROMOTION_XP_TABLE = {
      1: 1,
      2: 2,
      3: 5,
      4: 10,
      5: 17
    };

    function applyPromotion(unit, promotionId) {
      if (!unit || unit.isDead) {
        console.warn('[applyPromotion] Invalid or dead unit.');
        return false;
      }

      const promoData = window.PROMOTION_DATA ? window.PROMOTION_DATA[promotionId] : null;
      if (!promoData) {
        addLog(`❌ [승급 실패] 존재하지 않는 승급 ID입니다: ${promotionId}`, 'warning');
        return false;
      }

      if (!unit.promotions) {
        unit.promotions = [];
      } else if (!Array.isArray(unit.promotions)) {
        const legacyArr = [];
        if (unit.promotions.combatRank) {
          for (let i = 1; i <= Math.min(unit.promotions.combatRank, 4); i++) {
            legacyArr.push(`combat_${i}`);
          }
        }
        unit.promotions = legacyArr;
      }

      if (unit.promotions.includes(promotionId)) {
        addLog(`⚠️ [승급 불가] ${unit.name}은(는) 이미 [${promoData.name}]을(를) 습득했습니다.`, 'warning');
        return false;
      }

      const unitClass = unit.classType || unit.class || 'MELEE';
      if (typeof window.isPromotionAllowed === 'function') {
        const allowed = window.isPromotionAllowed(unitClass, promoData.category);
        if (!allowed) {
          addLog(`🚫 [병과 제한] ${unit.name}(${unitClass}) 병과는 [${promoData.category}] 계열 승급을 습득할 수 없습니다!`, 'danger');
          return false;
        }
      }

      if (Array.isArray(promoData.prereqs) && promoData.prereqs.length > 0) {
        const hasAllPrereqs = promoData.prereqs.every((reqId) => unit.promotions.includes(reqId));
        if (!hasAllPrereqs) {
          const missingNames = promoData.prereqs
            .filter((reqId) => !unit.promotions.includes(reqId))
            .map((reqId) => window.PROMOTION_DATA[reqId]?.name || reqId)
            .join(', ');
          addLog(`🔒 [선행 조건 미달] [${missingNames}] 습득 후 승급할 수 있습니다.`, 'warning');
          return false;
        }
      }

      const requiredXP = PROMOTION_XP_TABLE[promoData.level] || (promoData.level * 3);
      const currentXP = unit.xp || 0;
      if (currentXP < requiredXP) {
        addLog(`⚡ [XP 부족] [${promoData.name}] 승급에는 ${requiredXP} XP가 필요합니다. (현재 XP: ${currentXP})`, 'warning');
        return false;
      }

      unit.xp = currentXP - requiredXP;
      unit.promotions.push(promotionId);

      if (promoData.category === 'Combat') {
        unit.combatRank = Math.max(unit.combatRank || 0, promoData.level);
      }

      // Instant Heal Effect: 50% Max HP recovery
      const maxHp = unit.maxHp || 100;
      const healAmount = Math.round(maxHp * 0.50);
      const oldHp = unit.hp;
      unit.hp = Math.min(maxHp, unit.hp + healAmount);
      const actualHealed = unit.hp - oldHp;

      addLog(
        `⭐ [승급 완료] ${unit.name} -> [${promoData.name}] 습득! (${promoData.effects.description}) ` +
        `💚 즉시 응급 치료: HP +${actualHealed} 회복! (${unit.hp}/${maxHp}) [소모 XP: ${requiredXP}]`,
        'gold'
      );

      if (state.selectedUnit?.id === unit.id) {
        renderUnitCard(unit);
      }
      renderMap();

      return true;
    }

    function getUnitPromotionIds(unit) {
      if (!unit || !unit.promotions) return [];
      if (Array.isArray(unit.promotions)) return unit.promotions;
      const res = [];
      if (unit.promotions.combatRank) {
        for (let i = 1; i <= Math.min(unit.promotions.combatRank, 4); i++) {
          res.push(`combat_${i}`);
        }
      }
      return res;
    }

    function calculateCombatModifiers(attacker, defender, commanderSkills) {
      const skills = commanderSkills || state?.commander?.unlockedSkills || {};
      const promoDataMap = window.PROMOTION_DATA || {};

      const attackerPromos = getUnitPromotionIds(attacker);
      const defenderPromos = getUnitPromotionIds(defender);

      const targetTile = defender ? getTile(defender.x, defender.y) : null;
      const tileType = targetTile?.type || 'PLAIN';
      const isCityTile = ['CITY', 'BASE', 'HEADQUARTERS', 'CASTLE'].includes(tileType);
      const isHillTile = ['HILL', 'MOUNTAIN'].includes(tileType);
      const isForestTile = ['FOREST', 'JUNGLE'].includes(tileType);

      let attackerAtkMultiplier = 1.0;
      let attackerFirstStrikes = 0;
      let attackerRetreatChance = 0.0;

      attackerPromos.forEach((pId) => {
        const p = promoDataMap[pId];
        if (!p || !p.effects) return;
        if (p.effects.atkPercent) attackerAtkMultiplier += p.effects.atkPercent;
        if (isCityTile && p.effects.cityAtkBonus) attackerAtkMultiplier += p.effects.cityAtkBonus;
        if (p.effects.firstStrikes) attackerFirstStrikes = Math.max(attackerFirstStrikes, p.effects.firstStrikes);
        if (p.effects.retreatChance) attackerRetreatChance = Math.max(attackerRetreatChance, p.effects.retreatChance);
      });

      let defenderDefMultiplier = 1.0;
      let defenderFirstStrikes = 0;
      let defenderCounterBonus = 0.0;
      let defenderRetreatChance = 0.0;

      defenderPromos.forEach((pId) => {
        const p = promoDataMap[pId];
        if (!p || !p.effects) return;
        if (p.effects.atkPercent) defenderDefMultiplier += p.effects.atkPercent * 0.5;
        if (isCityTile && p.effects.cityDefBonus) defenderDefMultiplier += p.effects.cityDefBonus;
        if (isHillTile && p.effects.hillDefBonus) defenderDefMultiplier += p.effects.hillDefBonus;
        if (isForestTile && p.effects.forestDefBonus) defenderDefMultiplier += p.effects.forestDefBonus;
        if (p.effects.firstStrikes) defenderFirstStrikes = Math.max(defenderFirstStrikes, p.effects.firstStrikes);
        if (p.effects.counterBonus) defenderCounterBonus += p.effects.counterBonus;
        if (p.effects.retreatChance) defenderRetreatChance = Math.max(defenderRetreatChance, p.effects.retreatChance);
      });

      if (defender.isGuarding || defender.stance === 'GUARD') {
        defenderDefMultiplier += (defender.guardBonusDef || 0.30);
      }

      const effectiveAtk = calculateEffectiveStrength(attacker, 'atk');
      const effectiveDef = calculateEffectiveStrength(defender, 'def');
      const calculatedAtk = effectiveAtk * attackerAtkMultiplier;
      const calculatedDef = effectiveDef * defenderDefMultiplier;

      const totalPower = calculatedAtk + calculatedDef;
      const defenderWinChance = totalPower > 0 ? (calculatedDef / totalPower) : 0.5;

      const activeSynergies = [];
      let defenderRetreatHpRecovery = 0.0;

      // Synergy 1: Defender's Leader
      const hasDefendersLeader = !!(skills.DefendersLeader || skills.defendersLeader || skills["Defender's Leader"]);
      if (hasDefendersLeader && defenderWinChance < 0.50) {
        defenderFirstStrikes = Math.max(defenderFirstStrikes, 2);
        defenderCounterBonus += 0.20;
        activeSynergies.push({
          id: 'DefendersLeader_Drill2',
          name: "지휘관 패시브: 수비의 리더",
          desc: "수세 상황(승률 < 50%)에서 임시 [제식 훈련 II(선제 타격 2회)] 효과 발동!"
        });
      }

      // Synergy 2: Tactical Retreat
      const hasTacticalRetreat = !!(skills.TacticalRetreat || skills.tacticalRetreat || skills["Tactical Retreat"]);
      if (hasTacticalRetreat && defenderWinChance < 0.30) {
        defenderRetreatChance = Math.min(1.0, defenderRetreatChance + 0.20);
        defenderRetreatHpRecovery = 0.50;
        activeSynergies.push({
          id: 'TacticalRetreat_FlankingBonus',
          name: "지휘관 패시브: 전략적 후퇴",
          desc: "절대적 위기(승률 < 30%)에서 [후퇴 확률 +20%] 및 생존 시 [HP 50% 즉시 회복] 효과 부여!"
        });
      }

      return {
        attacker: {
          rawAtk: attacker.atk,
          finalAtk: calculatedAtk,
          multiplier: attackerAtkMultiplier,
          firstStrikes: attackerFirstStrikes,
          retreatChance: attackerRetreatChance,
          promotions: attackerPromos
        },
        defender: {
          rawDef: defender.def,
          finalDef: calculatedDef,
          multiplier: defenderDefMultiplier,
          firstStrikes: defenderFirstStrikes,
          counterBonus: defenderCounterBonus,
          retreatChance: defenderRetreatChance,
          retreatHpRecovery: defenderRetreatHpRecovery,
          winChance: defenderWinChance,
          promotions: defenderPromos
        },
        environment: {
          tileType,
          isCityTile,
          isHillTile,
          isForestTile
        },
        synergies: activeSynergies
      };
    }

    /* --------------------------------------------------------------------------
       Character Skill Tree & Custom Skill Image Management Module
       -------------------------------------------------------------------------- */

    /**
     * Helper to find a character unit by ID from player or enemy roster
     */
    function findCharacterById(characterId) {
      if (!characterId) return null;
      const allUnits = [...(state.playerUnits || []), ...(state.enemyUnits || [])];
      return allUnits.find(u => String(u.id) === String(characterId)) || null;
    }

    /**
     * Retrieves the complete skillTree array for a character.
     * Automatically initializes with DEFAULT_SKILL_TREE_TEMPLATE if none exists.
     *
     * @param {string|number} characterId
     * @returns {Array<Object>} Skill tree nodes array
     */
    function getCharacterSkillTree(characterId) {
      const unit = findCharacterById(characterId);
      if (!unit) return [];

      if (!Array.isArray(unit.skillTree)) {
        // Initialize with default template if available
        const defaultTemplate = window.DEFAULT_SKILL_TREE_TEMPLATE || [];
        unit.skillTree = JSON.parse(JSON.stringify(defaultTemplate));
      }

      return unit.skillTree;
    }

    /**
     * Appends a new skill node to the character's skill tree.
     *
     * @param {string|number} characterId - Target character/unit ID
     * @param {Object} skillData - Skill data definition object
     * @returns {Object|null} Newly created skill node or null on failure
     */
    function addSkillToTree(characterId, skillData) {
      const unit = findCharacterById(characterId);
      if (!unit) {
        console.warn(`[addSkillToTree] Character not found with ID: ${characterId}`);
        return null;
      }

      if (!Array.isArray(unit.skillTree)) {
        unit.skillTree = [];
      }

      // Use helper or sanitize skill node
      const createNodeFn = window.createSkillTreeNode || function(s) {
        return {
          id: s.id || `skill_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: s.name || '신규 스킬',
          tier: Number(s.tier) || 1,
          prerequisites: Array.isArray(s.prerequisites) ? s.prerequisites : [],
          imageUrl: s.imageUrl || '',
          type: (String(s.type).toUpperCase() === 'PASSIVE') ? 'PASSIVE' : 'ACTIVE',
          costAP: Number(s.costAP) >= 0 ? Number(s.costAP) : 1,
          coolDown: Number(s.coolDown) >= 0 ? Number(s.coolDown) : 1,
          effectValue: Number(s.effectValue) || 15,
          targetType: s.targetType || 'SINGLE_TARGET',
          description: s.description || '스킬 효과'
        };
      };

      const newSkill = createNodeFn(skillData);
      if (!newSkill) return null;

      // Duplicate ID prevention
      const existingIdx = unit.skillTree.findIndex(s => s.id === newSkill.id);
      if (existingIdx >= 0) {
        unit.skillTree[existingIdx] = newSkill;
      } else {
        unit.skillTree.push(newSkill);
      }

      // Save state to LocalStorage and optional Firestore
      saveGameState();

      addLog(`✨ [스킬트리 추가] ${unit.name}에게 새로운 스킬 [${newSkill.name}] (Tier ${newSkill.tier}) 트리가 등록되었습니다.`, 'gold');

      // Refresh UI if selected
      if (state.selectedUnit?.id === unit.id) {
        renderUnitCard(unit);
        updateFullShotOverlay();
      }

      return newSkill;
    }

    /**
     * Updates the specific skill's imageUrl (Firebase Storage HTTPS URL) and saves to Cloud Firestore.
     *
     * @param {string|number} characterId - Target character/unit ID
     * @param {string} skillId - Target skill node ID
     * @param {string} base64Image - Base64 data URL image string
     * @returns {boolean} True if successfully updated, false otherwise
     */
    function updateSkillImage(characterId, skillId, base64Image) {
      const unit = findCharacterById(characterId);
      if (!unit) {
        console.warn(`[updateSkillImage] Character not found: ${characterId}`);
        return false;
      }

      if (!Array.isArray(unit.skillTree)) {
        getCharacterSkillTree(characterId);
      }

      const targetSkill = unit.skillTree.find(s => s.id === skillId);
      if (!targetSkill) {
        // Also check if it's the unit's active customSkill
        if (unit.customSkill && unit.customSkill.id === skillId) {
          unit.customSkill.imageUrl = base64Image;
        } else {
          console.warn(`[updateSkillImage] Skill not found: ${skillId}`);
          return false;
        }
      } else {
        targetSkill.imageUrl = base64Image;
        // Sync with active customSkill if matching
        if (unit.customSkill && unit.customSkill.id === skillId) {
          unit.customSkill.imageUrl = base64Image;
        }
      }

      // Cloud storage upload for Base64 image
      if (base64Image && base64Image.startsWith('data:') && typeof window.uploadSkillIcon === 'function') {
        window.uploadSkillIcon(base64Image, targetSkill ? targetSkill.name : 'skill').then(downloadUrl => {
          if (targetSkill) targetSkill.imageUrl = downloadUrl;
          if (unit.customSkill && unit.customSkill.id === skillId) {
            unit.customSkill.imageUrl = downloadUrl;
          }
          if (typeof window.saveSkillToCloud === 'function' && targetSkill) {
            window.saveSkillToCloud(targetSkill);
          }
          saveGameState(true);
        }).catch(err => {
          console.warn("Skill icon storage upload error:", err);
          saveGameState(true);
        });
      } else {
        if (typeof window.saveSkillToCloud === 'function' && targetSkill) {
          window.saveSkillToCloud(targetSkill);
        }
        saveGameState(true);
      }

      addLog(`🖼️ [스킬 이미지 변경] ${unit.name}의 [${targetSkill ? targetSkill.name : '스킬'}] 아이콘 이미지가 갱신되었습니다.`, 'system');

      // Re-render UI components if currently selected
      if (state.selectedUnit?.id === unit.id) {
        updateFullShotOverlay();
        renderUnitCard(unit);
      }

      return true;
    }

    /* ============================================================================
       1. TOTAL DEFEAT (ALL UNITS DEAD) STATE GUARD SYSTEM
       ============================================================================ */

    /**
     * Checks if all active units in the player's roster/stack are defeated (HP <= 0 or isDead).
     * If party wipeout is detected, activates 1-hour inactivation status on player state
     * and invokes window.UI.showDefeatModal().
     *
     * @returns {boolean} True if party wipeout occurred, false otherwise.
     */
    function checkPartyWipeout() {
      if (!state || !Array.isArray(state.playerUnits)) return false;

      const livingUnits = state.playerUnits.filter(u => !u.isDead && (typeof u.hp === 'number' ? u.hp > 0 : true));

      if (livingUnits.length === 0) {
        const now = Date.now();
        const oneHourMs = 60 * 60 * 1000; // 1시간 (3600초)

        // 1-hour inactivation timer/status on player state
        state.isWipedOut = true;
        state.wipeoutTimestamp = now;
        state.wipeoutUntil = now + oneHourMs;
        state.inactivated = true;

        // Sync individual unit states
        state.playerUnits.forEach(u => {
          u.isDead = true;
          u.hp = 0;
          u.isInactivated = true;
          u.inactivatedUntil = state.wipeoutUntil;
        });

        addLog(`💀 [부대 전멸 (Party Wipeout)] 아군 모든 부대가 쓰러졌습니다! 지휘권이 1시간 동안 전선 정비(비활성화) 상태로 전환됩니다.`, 'danger');
        addLog(`⏳ 복구 가능 시각: ${new Date(state.wipeoutUntil).toLocaleTimeString()} (리와인더로 즉시 회귀 가능)`, 'warning');

        saveGameState();
        renderAll();

        // Invoke window.UI.showDefeatModal()
        if (typeof window.UI?.showDefeatModal === 'function') {
          window.UI.showDefeatModal({
            wipeoutUntil: state.wipeoutUntil,
            remainingMs: oneHourMs,
            message: '전선 부대가 전멸하여 1시간 동안 부대 정비 상태에 돌입합니다.'
          });
        }

        return true;
      }

      return false;
    }

    // Default UI Fallback for Defeat Modal if not initialized by UI module
    if (!window.UI) {
      window.UI = {};
    }
    if (typeof window.UI.showDefeatModal !== 'function') {
      window.UI.showDefeatModal = function (defeatInfo) {
        let modal = document.getElementById('modal-party-defeat');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'modal-party-defeat';
          modal.className = 'modal-backdrop active';
          modal.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';
          document.body.appendChild(modal);
        } else {
          modal.style.display = 'flex';
          modal.classList.add('active');
        }

        const wipeoutUntil = defeatInfo?.wipeoutUntil || (Date.now() + 3600000);

        function formatRemaining() {
          const remaining = Math.max(0, wipeoutUntil - Date.now());
          const mins = Math.floor(remaining / 60000);
          const secs = Math.floor((remaining % 60000) / 1000);
          return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        modal.innerHTML = `
          <div class="modal-window" style="background: #0f172a; border: 2px solid #ef4444; box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.45); border-radius: 18px; padding: 24px; max-width: 420px; width: 92%; color: #f8fafc; text-align: center;">
            <div style="font-size: 46px; margin-bottom: 8px;">💀</div>
            <h2 style="font-size: 19px; font-weight: 900; color: #f87171; margin-bottom: 6px; letter-spacing: -0.5px;">아군 부대 전멸 (PARTY WIPEOUT)</h2>
            <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">
              전선의 모든 지휘 부대가 치명상을 입고 쓰러졌습니다.<br/>
              야전 부대 재정비 및 치료를 위해 <strong style="color: #fbbf24;">1시간 동안 전장 출격이 제한</strong>됩니다.
            </p>

            <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 12px; margin-bottom: 18px;">
              <div style="font-size: 10px; color: #fca5a5; font-weight: 700; text-transform: uppercase;">정비 완료까지 남은 시간</div>
              <div id="defeat-timer-countdown" style="font-size: 26px; font-weight: 900; color: #f87171; font-family: monospace; letter-spacing: 2px; margin-top: 4px;">
                ${formatRemaining()}
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-defeat-rewind" style="width: 100%; padding: 11px; background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); color: #ffffff; border: none; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);">
                <span>⏳ 직전 턴으로 시간 되돌리기 (리와인더)</span>
              </button>
              <button id="btn-defeat-emergency-retreat" style="width: 100%; padding: 10px; background: #334155; color: #cbd5e1; border: 1px solid #475569; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">
                <span>🏰 안전지대(마을/도시)로 응급 퇴각</span>
              </button>
            </div>
          </div>
        `;

        const intervalId = setInterval(() => {
          const timerEl = document.getElementById('defeat-timer-countdown');
          if (timerEl) {
            timerEl.textContent = formatRemaining();
            if (Date.now() >= wipeoutUntil) {
              clearInterval(intervalId);
              state.isWipedOut = false;
              state.inactivated = false;
              saveGameState();
            }
          } else {
            clearInterval(intervalId);
          }
        }, 1000);

        const btnRewind = document.getElementById('btn-defeat-rewind');
        if (btnRewind) {
          btnRewind.onclick = () => {
            clearInterval(intervalId);
            modal.style.display = 'none';
            modal.classList.remove('active');
            if (typeof window.rewindLastTurn === 'function') {
              window.rewindLastTurn();
            }
          };
        }

        const btnRetreat = document.getElementById('btn-defeat-emergency-retreat');
        if (btnRetreat) {
          btnRetreat.onclick = () => {
            clearInterval(intervalId);
            modal.style.display = 'none';
            modal.classList.remove('active');
            const activeTiles = (state.tiles || (typeof tiles !== 'undefined' ? tiles : []) || []);
            const safeTile = activeTiles.find(t => t && (t.isSafe || t.isCity || t.type === 'city' || t.type === 'village')) || { x: 1, y: 1, name: '평화로운 마을' };
            const safeTownName = safeTile?.name || '평화로운 마을';
            if (state.playerUnits && state.playerUnits.length > 0) {
              const commanderUnit = state.playerUnits[0];
              commanderUnit.isDead = false;
              commanderUnit.hp = Math.round((commanderUnit.maxHp || 100) * 0.35);
              commanderUnit.x = typeof safeTile?.x === 'number' ? safeTile.x : 1;
              commanderUnit.y = typeof safeTile?.y === 'number' ? safeTile.y : 1;
              commanderUnit.isInactivated = false;
              commanderUnit.inactivatedUntil = null;
              state.isWipedOut = false;
              state.inactivated = false;
              addLog(`🏥 [응급 후송] ${safeTownName} 안전지대로 응급 퇴각하여 ${commanderUnit.name}이(가) 회복되었습니다.`, 'gold');
              saveGameState();
              renderAll();
            }
          };
        }
      };
    }

    /* ============================================================================
       2. UNIVERSAL TACTICAL MAP VICTORY CHECK & REWARD CALCULATION SYSTEM
       ============================================================================ */

    /**
     * Resets tactical battle state for a new engagement or dynamically generated map.
     */
    function resetTacticalBattleState() {
      if (state) state.isCombatActive = true;
      victoryProcessed = false;
      defeatedEnemyCount = 0;
      window.victoryProcessed = false;
      window.defeatedEnemyCount = 0;
    }

    /**
     * Victory Condition Guard: Automatically checks remaining enemy units on the active tactical map.
     * If remaining enemy count == 0 and victory has not yet been processed for the current battle:
     *   - Marks battle state as won (battleActive = false)
     *   - Executes victory reward calculations (window.calculateTacticalVictoryRewards())
     *
     * @returns {boolean} True if victory was triggered and processed, false otherwise.
     */
    function checkTacticalVictory() {
      if (!state) return false;

      // Count remaining enemy units/monsters on the active map grid
      const enemyList = Array.isArray(state.enemyUnits) ? state.enemyUnits : [];
      const remainingEnemies = enemyList.filter(e => !e.isDead && (typeof e.hp === 'number' ? e.hp > 0 : true));
      const remainingEnemyCount = remainingEnemies.length;

      // If remaining enemy count == 0 and victory has not yet been processed for current battle
      if (remainingEnemyCount === 0 && !victoryProcessed && !window.victoryProcessed && state && state.isCombatActive) {
        // Mark battle state as won on single source of truth
        state.isCombatActive = false;
        victoryProcessed = true;
        window.victoryProcessed = true;

        addLog(`🏆 [전술 전장 승리!] 작전 구역의 모든 적군 부대가 완전히 섬멸되었습니다!`, 'gold');

        // Execute victory reward calculations
        const rewardData = (typeof window.calculateTacticalVictoryRewards === 'function')
          ? window.calculateTacticalVictoryRewards()
          : calculateTacticalVictoryRewards();

        return true;
      }

      return false;
    }

    /**
     * Reward Calculation:
     * - Track defeatedEnemyCount: Total number of enemies/monsters defeated during this tactical battle.
     * - Gold Reward (100% Probability): goldEarned = defeatedEnemyCount * 100. Add goldEarned to window.playerState.gold.
     * - Rewinder Item Reward (50% Probability): Roll Math.random() < 0.5. If true, grant +1 'Rewinder' item (window.playerState.rewinders += 1).
     * - Package result object: { gold: goldEarned, rewinderGranted: boolean, defeatedCount: defeatedEnemyCount }.
     * - Calls window.UI.showVictoryModal(rewardData) immediately.
     *
     * @returns {{ gold: number, rewinderGranted: boolean, defeatedCount: number }}
     */
    function calculateTacticalVictoryRewards() {
      // 1. Determine total defeated enemy count during this tactical battle
      let count = (typeof window.defeatedEnemyCount === 'number' && window.defeatedEnemyCount > 0)
        ? window.defeatedEnemyCount
        : (defeatedEnemyCount > 0 ? defeatedEnemyCount : 0);

      // Fallback check against dead units in enemyUnits if count was not incremented
      if (count <= 0 && state && Array.isArray(state.enemyUnits)) {
        const deadUnits = state.enemyUnits.filter(e => e.isDead || (typeof e.hp === 'number' && e.hp <= 0));
        count = deadUnits.length;
      }
      if (count <= 0) {
        count = 1; // Fallback guarantee for cleared tactical encounter
      }

      const totalDefeatedCount = count;

      // 2. Gold Reward (100% Probability): goldEarned = defeatedEnemyCount * 100
      const goldEarned = totalDefeatedCount * 100;
      if (window.playerState) {
        window.playerState.gold = (window.playerState.gold || 0) + goldEarned;
      }
      if (state && typeof state.gold === 'number' && state.gold !== window.playerState?.gold) {
        state.gold = (state.gold || 0) + goldEarned;
      }

      // 3. Rewinder Item Reward (50% Probability): Math.random() < 0.5 -> rewinderGranted
      const rewinderGranted = Math.random() < 0.5;
      if (rewinderGranted) {
        if (window.playerState) {
          window.playerState.rewinders = (window.playerState.rewinders || 0) + 1;
        }
        if (state && typeof state.rewinders === 'number' && state.rewinders !== window.playerState?.rewinders) {
          state.rewinders = (state.rewinders || 0) + 1;
        }
      }

      // 4. Package result object
      const rewardData = {
        gold: goldEarned,
        rewinderGranted: rewinderGranted,
        defeatedCount: totalDefeatedCount
      };

      addLog(`✨ [전투 승리 전리품] 적군 ${totalDefeatedCount}기 격퇴 보상: +${goldEarned}G 국고 추가 획득!${rewinderGranted ? ' ⏳ [시간 왜곡 보너스] 시공간 리와인더 +1개 획득!' : ''}`, 'gold');

      // 5. Trigger UI: Call window.UI.showVictoryModal(rewardData) immediately upon victory calculation
      if (window.UI && typeof window.UI.showVictoryModal === 'function') {
        window.UI.showVictoryModal(rewardData);
      } else if (typeof window.showVictoryModal === 'function') {
        window.showVictoryModal(rewardData);
      }

      saveGameState();
      renderAll();

      return rewardData;
    }

    // Modal UI Implementation for Victory
    if (!window.UI) {
      window.UI = {};
    }

    if (typeof window.UI.showVictoryModal !== 'function') {
      window.UI.showVictoryModal = function (rewardData) {
        let modal = document.getElementById('modal-tactical-victory');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'modal-tactical-victory';
          document.body.appendChild(modal);
        }

        modal.className = 'modal-backdrop modal-victory-overlay active';
        modal.style.display = 'flex';

        const gold = rewardData?.gold ?? 0;
        const rewinderGranted = !!rewardData?.rewinderGranted;
        const defeatedCount = rewardData?.defeatedCount ?? 0;
        const curGold = window.playerState?.gold ?? (state?.gold ?? 0);
        const curRewinders = window.playerState?.rewinders ?? (state?.rewinders ?? 0);

        modal.innerHTML = `
          <div class="modal-window victory-modal-window">
            
            <div class="victory-trophy-icon">🏆</div>
            
            <h2 class="victory-title">전술 전장 승리!</h2>
            <div class="victory-subtitle">TACTICAL VICTORY & REWARDS</div>
            
            <p style="font-size: 12.5px; color: #cbd5e1; line-height: 1.5; margin-bottom: 18px;">
              작전 지역의 모든 적군 부대를 완전히 소탕하고<br/>
              <strong style="color: #fef08a;">전술적 승리</strong>를 쟁취했습니다!
            </p>

            <!-- Rewards Box -->
            <div class="victory-reward-card">
              
              <!-- Defeated Count -->
              <div class="victory-reward-row">
                <span class="victory-reward-label">
                  <span>⚔️</span> 격퇴한 적군 수
                </span>
                <span class="victory-reward-val victory-defeated-counter">${defeatedCount}기 소탕</span>
              </div>

              <!-- Gold Reward (100%) -->
              <div class="victory-reward-row">
                <span class="victory-reward-label">
                  <span>💰</span> 국고 승리 전리품
                </span>
                <span class="victory-reward-val victory-gold-text">+${gold} Gold <span class="victory-gold-badge">${defeatedCount} × 100G</span></span>
              </div>

              <!-- Rewinder Item Reward (50% Chance) -->
              <div class="victory-reward-row">
                <span class="victory-reward-label">
                  <span>⏳</span> 시간 회귀의 모래시계
                </span>
                ${rewinderGranted 
                  ? `<span class="victory-rewinder-highlight">✨ Rewinder Item Obtained (+1)</span>`
                  : `<span class="victory-rewinder-none">Rewinder Item: None (50% Chance)</span>`
                }
              </div>
            </div>

            <!-- Current Resources Status Bar -->
            <div class="victory-status-bar">
              <span>보유 국고: <strong class="victory-gold-text" style="font-size: 13px;">${curGold} G</strong></span>
              <span style="color: #475569;">|</span>
              <span>보유 리와인더: <strong style="color: #00ffff; font-weight: 900;">${curRewinders} 개</strong></span>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-victory-to-strategy" class="victory-action-btn">
                <span>🏛️ Return to Map / Proceed (전략 사령부 복귀)</span>
              </button>
              <button id="btn-victory-keep-exploring" class="victory-action-btn secondary">
                <span>🗺️ 현재 전장 잔류 (주변 수색)</span>
              </button>
            </div>
          </div>
        `;

        const btnToStrat = document.getElementById('btn-victory-to-strategy');
        if (btnToStrat) {
          btnToStrat.onclick = () => {
            modal.style.display = 'none';
            modal.classList.remove('active');
            if (typeof window.completeTacticalStage === 'function') {
              window.completeTacticalStage(true);
            } else if (typeof window.switchGameView === 'function') {
              window.switchGameView('STRATEGY');
            }
          };
        }

        const btnKeep = document.getElementById('btn-victory-keep-exploring');
        if (btnKeep) {
          btnKeep.onclick = () => {
            modal.style.display = 'none';
            modal.classList.remove('active');
          };
        }
      };
    }
    window.showVictoryModal = window.UI.showVictoryModal;

    const VictorySystem = {
      checkTacticalVictory,
      calculateTacticalVictoryRewards,
      resetTacticalBattleState
    };
    window.VictorySystem = VictorySystem;

    /* ============================================================================
       3. WILD UNIT PERSUASION & RECRUITMENT SYSTEM (recruitmentSystem)
       ============================================================================ */

    /**
     * Calculates success probability for persuading a wild/enemy unit.
     *
     * @param {Object} targetUnit - Target enemy or wild unit.
     * @param {string|Object} [affinityItemUsed] - Optional affinity/bribery item used.
     * @returns {number} Probability between 0.05 and 0.95.
     */
    function calculatePersuadeChance(targetUnit, affinityItemUsed) {
      if (!targetUnit) return 0;

      let baseRate = 0.35; // 35% 기본 확률

      // 1. 대상 유닛 잔여 HP 비율 보정 (체력이 낮을수록 설득에 굴복하기 쉬움)
      const maxHp = targetUnit.maxHp || 100;
      const hpRatio = (targetUnit.hp || 0) / maxHp;

      if (hpRatio <= 0.25) {
        baseRate += 0.30; // HP 25% 이하: +30% 보너스
      } else if (hpRatio <= 0.50) {
        baseRate += 0.15; // HP 50% 이하: +15% 보너스
      } else if (hpRatio >= 0.85) {
        baseRate -= 0.15; // 거의 만피: -15% 페널티
      }

      // 2. 호감도 및 지휘관 친밀도 보정
      const affinity = targetUnit.favorability || targetUnit.affection || 50;
      baseRate += (affinity - 50) / 200; // 호감도 100일 시 +25%

      // 지휘관 패시브 스킬 (전술적 위압감 / StrategicDominance)
      if (state.commander?.unlockedSkills?.StrategicDominance) {
        baseRate += 0.20;
      }

      // 3. 아이템 사용 효과
      if (affinityItemUsed) {
        const itemKey = (typeof affinityItemUsed === 'string' ? affinityItemUsed : affinityItemUsed.id || '').toLowerCase();
        if (itemKey.includes('treaty') || itemKey.includes('contract')) {
          baseRate += 0.40; // 평화 조약 / 용병 계약서: +40%
        } else if (itemKey.includes('gem') || itemKey.includes('bribe') || itemKey.includes('gold')) {
          baseRate += 0.30; // 보석 / 뇌물: +30%
        } else if (itemKey.includes('meat') || itemKey.includes('food') || itemKey.includes('ration')) {
          baseRate += 0.25; // 특급 고기 / 군량: +25%
        } else {
          baseRate += 0.20; // 기타 아이템: +20%
        }
      }

      // 5% ~ 95% 범위 클램핑
      return Math.min(0.95, Math.max(0.05, baseRate));
    }

    /**
     * Attempts to persuade and recruit a wild unit to the player's roster.
     *
     * @param {Object} targetUnit - Target unit to persuade.
     * @param {string|Object} [affinityItemUsed] - Optional affinity item.
     * @returns {Object} Result object { success: boolean, action?: string, unit?: Object, message: string }
     */
    function attemptPersuadeWildUnit(targetUnit, affinityItemUsed) {
      if (!targetUnit) {
        return { success: false, message: '유효하지 않은 대상 유닛입니다.' };
      }

      if (targetUnit.owner === 'PLAYER' || targetUnit.isPlayer) {
        return { success: false, message: '이미 아군에 소속된 부대입니다.' };
      }

      const successRate = calculatePersuadeChance(targetUnit, affinityItemUsed);
      const roll = Math.random();
      const isSuccess = roll <= successRate;
      const ratePct = Math.round(successRate * 100);

      if (isSuccess) {
        // --------------------------------------------------------------------
        // 성공 (Success): 플레이어 로스터로 영입 및 상태 초기화
        // --------------------------------------------------------------------
        const recruitId = `recruited_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const originalName = targetUnit.name || '야생 유닛';

        // 적군 목록에서 제거
        const enemyIdx = state.enemyUnits.findIndex(e => e.id === targetUnit.id);
        if (enemyIdx !== -1) {
          state.enemyUnits.splice(enemyIdx, 1);
        }

        // 유닛 데이터 아군으로 전환 및 상태 초기화
        targetUnit.id = recruitId;
        targetUnit.owner = 'PLAYER';
        targetUnit.isPlayer = true;
        targetUnit.name = `[포섭] ${originalName.replace(/^\[.*?\]\s*/, '')}`;
        targetUnit.isDead = false;
        targetUnit.isInactivated = false;
        targetUnit.inactivatedUntil = null;
        targetUnit.hp = Math.max(targetUnit.hp || 0, Math.round((targetUnit.maxHp || 100) * 0.75));
        targetUnit.affection = Math.max(targetUnit.affection || 50, 70);
        targetUnit.favorability = Math.max(targetUnit.favorability || 50, 70);
        targetUnit.ap = targetUnit.baseAP || 2;

        state.playerUnits.push(targetUnit);

        const logMsg = `🤝 [야생 유닛 영입 성공!] (성공률 ${ratePct}%) ${originalName}을(를) 설득하여 아군 부대로 정식 영입했습니다!`;
        addLog(logMsg, 'gold');

        if (typeof window.UI?.showToast === 'function') {
          window.UI.showToast(logMsg, 'success');
        }

        renderAll();
        saveGameState();

        return {
          success: true,
          unit: targetUnit,
          successRate: ratePct,
          message: `${originalName} 부대를 아군으로 영입했습니다!`
        };
      } else {
        // --------------------------------------------------------------------
        // 실패 (Failure): 도주 (60%) 또는 분노 반격 (40%)
        // --------------------------------------------------------------------
        const isCounterAttack = Math.random() < 0.40;

        if (isCounterAttack) {
          // 분노 반격: 인접 또는 현재 활성 유닛에게 기습 반격 피해
          const livingPlayers = state.playerUnits.filter(u => !u.isDead);
          const adjPlayer = livingPlayers.find(p => Math.abs(p.x - targetUnit.x) <= 1 && Math.abs(p.y - targetUnit.y) <= 1) || state.selectedUnit || livingPlayers[0];

          let counterDamage = 0;
          if (adjPlayer) {
            counterDamage = Math.max(12, Math.round((targetUnit.atk || 35) * 0.45));
            adjPlayer.hp = Math.max(0, adjPlayer.hp - counterDamage);
            if (adjPlayer.hp <= 0) {
              adjPlayer.isDead = true;
              addLog(`💀 [치명상 전사] ${adjPlayer.name}이(가) ${targetUnit.name}의 기습 반격에 쓰러졌습니다!`, 'danger');
              checkPartyWipeout();
            }
          }

          const logMsg = `💥 [포섭 실패 - 적군 반격!] (성공률 ${ratePct}%) ${targetUnit.name}이(가) 격분하여 반격해왔습니다!` + (adjPlayer ? ` (${adjPlayer.name} -${counterDamage} HP)` : '');
          addLog(logMsg, 'danger');

          if (typeof window.UI?.showToast === 'function') {
            window.UI.showToast(logMsg, 'error');
          }

          renderAll();
          saveGameState();

          return {
            success: false,
            action: 'COUNTER_ATTACK',
            successRate: ratePct,
            damage: counterDamage,
            message: `${targetUnit.name}이(가) 설득을 거부하고 반격했습니다!`
          };
        } else {
          // 도주: 전장에서 이탈
          targetUnit.isDead = true;
          const enemyIdx = state.enemyUnits.findIndex(e => e.id === targetUnit.id);
          if (enemyIdx !== -1) {
            state.enemyUnits.splice(enemyIdx, 1);
          }

          const logMsg = `💨 [포섭 실패 - 적군 도주] (성공률 ${ratePct}%) ${targetUnit.name}이(가) 경계심을 품고 전장에서 도주했습니다!`;
          addLog(logMsg, 'warning');

          if (typeof window.UI?.showToast === 'function') {
            window.UI.showToast(logMsg, 'warning');
          }

          renderAll();
          saveGameState();

          return {
            success: false,
            action: 'FLED',
            successRate: ratePct,
            message: `${targetUnit.name}이(가) 설득을 거부하고 도주했습니다.`
          };
        }
      }
    }

    const recruitmentSystem = {
      calculatePersuadeChance,
      attemptPersuadeWildUnit
    };

    /* ============================================================================
       3. SAFE ZONE (TOWN/CITY) UNIT SHOP SYSTEM (unitShopSystem)
       ============================================================================ */

    /**
     * Checks if the player has an active unit on or adjacent to a Safe Zone (Town/City) tile.
     *
     * @returns {Object|null} Safe tile object if adjacent/on, null otherwise.
     */
    function isPlayerAtSafeZone() {
      if (!state || !state.tiles) return null;

      const livingUnits = (state.playerUnits || []).filter(u => !u.isDead);
      if (livingUnits.length === 0) return null;

      for (const unit of livingUnits) {
        // 1. 현재 주둔 중인 타일 확인
        const currentTile = getTile(unit.x, unit.y);
        if (currentTile && (currentTile.isSafe || currentTile.isCity || currentTile.type === 'city' || currentTile.type === 'village')) {
          return currentTile;
        }

        // 2. 인접한 타일 (거리 1 이내) 확인
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighbor = getTile(unit.x + dx, unit.y + dy);
            if (neighbor && (neighbor.isSafe || neighbor.isCity || neighbor.type === 'city' || neighbor.type === 'village')) {
              return neighbor;
            }
          }
        }
      }

      return null;
    }

    /**
     * Returns town level based on tile type and coordinates.
     *
     * @param {Object} tile - Tile object
     * @returns {number} Town level (1: Village, 2: City, 3: Royal Capital)
     */
    function getTownLevel(tile) {
      if (!tile) return 1;
      if (tile.name?.includes('에테르니아') || (tile.x >= 3 && tile.x <= 4 && tile.y >= 4 && tile.y <= 5)) {
        return 3; // 왕도 에테르니아: Level 3
      }
      if (tile.isCity || tile.type === 'city') {
        return 2; // 일반 도시: Level 2
      }
      return 1; // 마을: Level 1
    }

    /**
     * Purchases a unit from the safe zone town shop catalog and spawns it into player roster.
     *
     * @param {string|null} townId - Optional identifier or tile coordinate string
     * @param {string} unitCatalogId - Catalog unit template ID
     * @returns {Object} Result { success: boolean, unit?: Object, remainingGold: number, message: string }
     */
    function buyUnitAtTown(townId, unitCatalogId) {
      const safeTile = isPlayerAtSafeZone();
      if (!safeTile) {
        const errorMsg = '⚠️ 유닛을 고용하려면 아군 부대가 안전지대(마을 또는 도시)에 위치하거나 인접해야 합니다!';
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      const catalog = window.TOWN_UNIT_SHOP_CATALOG || [];
      const template = catalog.find(item => item.id === unitCatalogId);
      if (!template) {
        const errorMsg = `❌ 존재하지 않는 유닛 템플릿입니다: ${unitCatalogId}`;
        addLog(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      const townLevel = getTownLevel(safeTile);
      const safeTownName = safeTile?.name || '안전 거점';
      if (townLevel < template.reqTownLevel) {
        const errorMsg = `🔒 이 유닛은 거점 레벨 ${template.reqTownLevel} 이상에서만 고용할 수 있습니다. (현재 ${safeTownName}: Lv.${townLevel})`;
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      if (state.gold < template.cost) {
        const errorMsg = `💰 골드가 부족합니다! (필요: ${template.cost}G, 보유: ${state.gold}G)`;
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      // 지휘관 통솔력 제한 확인
      const activeCount = (state.playerUnits || []).filter(u => !u.isDead).length;
      const maxLeadership = state.strategy?.commanderAP || 24;
      if (activeCount >= maxLeadership) {
        const errorMsg = `⚠️ 최대 통솔력 한도(${maxLeadership}부대)에 도달하여 추가 유닛을 편성할 수 없습니다!`;
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      // 골드 차감
      state.gold -= template.cost;

      // 안전지대 타일 좌표에 유닛 스폰
      const spawnX = safeTile.x;
      const spawnY = safeTile.y;

      const newUnitId = `hired_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const newUnit = {
        id: newUnitId,
        owner: 'PLAYER',
        isPlayer: true,
        name: template.name,
        classType: template.classType,
        unitClass: template.classType,
        avatar: template.avatar || '🛡️',
        level: 1,
        exp: 0,
        hp: template.stats.hp,
        maxHp: template.stats.maxHp,
        atk: template.stats.atk,
        def: template.stats.def,
        ap: template.stats.mobility || 2,
        baseAP: template.stats.mobility || 2,
        mobility: template.stats.mobility || 2,
        range: (template.classType === 'ARCHER' || template.classType === 'FIREARM') ? 2 : 1,
        affection: 80,
        favorability: 80,
        promotions: [],
        skillTree: [],
        x: spawnX,
        y: spawnY,
        isDead: false,
        isInactivated: false,
        inactivatedUntil: null,
        upkeep: template.upkeep || 10,
        description: template.description
      };

      state.playerUnits.push(newUnit);
      const hiredTownName = safeTile?.name || safeTownName || '안전 거점';
      const successMsg = `🛒 [안전지대 유닛 고용] [${hiredTownName}]에서 신규 부대 [${newUnit.name}]을(를) 고용했습니다! (-${template.cost}G, 잔여: ${state.gold}G)`;
      addLog(successMsg, 'gold');

      if (typeof window.UI?.showToast === 'function') {
        window.UI.showToast(successMsg, 'success');
      }

      renderAll();
      saveGameState();

      return {
        success: true,
        unit: newUnit,
        remainingGold: state.gold,
        message: successMsg
      };
    }

    const unitShopSystem = {
      TOWN_UNIT_SHOP_CATALOG: window.TOWN_UNIT_SHOP_CATALOG || [],
      isPlayerAtSafeZone,
      getTownLevel,
      buyUnitAtTown
    };

    // ============================================================================
    // Global Window Attachments (Dependency & Scope Safeguard)
    // ============================================================================
    window.checkPartyWipeout = checkPartyWipeout;
    window.checkTacticalVictory = checkTacticalVictory;
    window.calculateTacticalVictoryRewards = calculateTacticalVictoryRewards;
    window.resetTacticalBattleState = resetTacticalBattleState;
    window.VictorySystem = VictorySystem;
    window.attemptPersuadeWildUnit = attemptPersuadeWildUnit;
    window.recruitmentSystem = recruitmentSystem;
    window.buyUnitAtTown = buyUnitAtTown;
    window.unitShopSystem = unitShopSystem;
    window.TOWN_UNIT_SHOP_CATALOG = window.TOWN_UNIT_SHOP_CATALOG || unitShopSystem.TOWN_UNIT_SHOP_CATALOG;

    // ============================================================================
    // Global GameEngine & Combat Math Attachments (Dependency & Scope Safeguard)
    // ============================================================================
    window.normalizeAllUnitsHP = normalizeAllUnitsHP;
    window.calculateEffectiveStrength = calculateEffectiveStrength;
    window.calculateRoundCombatDamage = calculateRoundCombatDamage;
    window.getCombatOdds = getCombatOdds;
    window.executeCombat = executeCombat;

    window.GameEngine = window.GameEngine || {};
    window.GameEngine.normalizeAllUnitsHP = normalizeAllUnitsHP;
    window.GameEngine.calculateEffectiveStrength = calculateEffectiveStrength;
    window.GameEngine.calculateRoundCombatDamage = calculateRoundCombatDamage;
    window.GameEngine.getCombatOdds = getCombatOdds;
    window.GameEngine.executeCombat = executeCombat;
    window.GameEngine.calculateCombatModifiers = calculateCombatModifiers;
    window.GameEngine.getState = () => (typeof state !== 'undefined' ? state : null);
    window.GameEngine.getTiles = () => (typeof tiles !== 'undefined' ? tiles : []);

    // ============================================================================
    // Navigation Flow & Combat Cleanup Logic
    // ============================================================================

    /**
     * 1-A. Temporary Tactical Pause Menu Trigger
     * Freezes tactical timers/animations, marks isCombatPaused = true, switches view
     * to STRATEGY_MENU_OVERLAY, and displays UI pause overlay.
     */
    function openTacticalPauseMenu() {
      const isCombat = !!(state && state.isCombatActive);

      if (!isCombat) {
        console.warn('[openTacticalPauseMenu] Tactical combat is not currently active.');
        return;
      }

      // 1. Freeze tactical timer/animations (isCombatPaused = true)
      window.isCombatPaused = true;
      if (state) state.isCombatPaused = true;
      if (window.playerState) window.playerState.isCombatPaused = true;
      if (window.gameState) window.gameState.isCombatPaused = true;

      // 2. Set currentView = GAME_VIEWS.STRATEGY_MENU_OVERLAY
      const views = window.GAME_VIEWS || { WORLD_STRATEGY: 'WORLD_STRATEGY', SECTOR_FIELD: 'SECTOR_FIELD', STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY' };
      const overlayView = views.STRATEGY_MENU_OVERLAY;
      if (state) state.currentView = overlayView;
      if (window.playerState) window.playerState.currentView = overlayView;
      if (window.gameState) window.gameState.currentView = overlayView;

      // 3. Snapshot active battle data safely into savedTacticalState
      const activeSectorId = (state && (state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector)) || 'A-1';
      const tacticalSnapshot = (typeof window.snapshotTacticalState === 'function')
        ? window.snapshotTacticalState(
            activeSectorId,
            state?.turn || 1,
            state?.playerUnits || [],
            state?.enemyUnits || [],
            (typeof tiles !== 'undefined' ? tiles : [])
          )
        : {
            sectorId: activeSectorId,
            turn: state?.turn || 1,
            playerUnits: JSON.parse(JSON.stringify(state?.playerUnits || [])),
            enemyUnits: JSON.parse(JSON.stringify(state?.enemyUnits || [])),
            savedAt: new Date().toISOString()
          };

      if (state) state.savedTacticalState = tacticalSnapshot;
      if (window.playerState) window.playerState.savedTacticalState = tacticalSnapshot;
      if (window.gameState) window.gameState.savedTacticalState = tacticalSnapshot;

      addLog(`⏸️ [전술 일시 정지] 전투가 일시 정지되었습니다. 전략 메뉴 오버레이를 표시합니다.`, 'system');

      // 4. Call window.UI.showPauseOverlay()
      if (window.UI && typeof window.UI.showPauseOverlay === 'function') {
        window.UI.showPauseOverlay();
      }
    }

    /**
     * 1-B. Resume Tactical Combat
     * Restores currentView to SECTOR_FIELD, unfreezes timer (isCombatPaused = false),
     * closes the pause overlay, and restores tactical interaction smoothly.
     */
    function resumeTacticalCombat() {
      // 1. Restore currentView = GAME_VIEWS.SECTOR_FIELD
      const views = window.GAME_VIEWS || { WORLD_STRATEGY: 'WORLD_STRATEGY', SECTOR_FIELD: 'SECTOR_FIELD', STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY' };
      const fieldView = views.SECTOR_FIELD;
      if (state) state.currentView = fieldView;
      if (window.playerState) window.playerState.currentView = fieldView;
      if (window.gameState) window.gameState.currentView = fieldView;

      // 2. Unfreeze timer (isCombatPaused = false)
      window.isCombatPaused = false;
      if (state) state.isCombatPaused = false;
      if (window.playerState) window.playerState.isCombatPaused = false;
      if (window.gameState) window.gameState.isCombatPaused = false;

      // 3. Hide pause overlay
      if (window.UI && typeof window.UI.hidePauseOverlay === 'function') {
        window.UI.hidePauseOverlay();
      }

      // 4. Resume tactical grid interaction seamlessly
      const viewStrat = document.getElementById('view-strategy-main');
      const viewSector = document.getElementById('view-sector-field');
      if (viewStrat) viewStrat.classList.remove('active');
      if (viewSector) viewSector.classList.add('active');

      renderGrid();
      renderHeaderAndCard();
      updateFullShotOverlay();

      addLog(`▶️ [전투 재개] 전술 전장(8x14 그리드) 상호작용이 재개되었습니다.`, 'combat');
    }

    /**
     * 2. Tactical Stage Completion & Full Combat Cleanup
     * Called ONLY after combat is fully finished (e.g., after victory modal rewards
     * are claimed or tactical retreat is confirmed).
     *
     * @param {boolean} [isVictory=true] - Whether combat concluded with victory
     */
    function completeTacticalStage(isVictory = true) {
      const views = window.GAME_VIEWS || {
        WORLD_STRATEGY: 'WORLD_STRATEGY',
        SECTOR_FIELD: 'SECTOR_FIELD',
        STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY'
      };

      // 1. 단일 진실 공급원 state.isCombatActive 종료 (getter로 연결된 4곳 동시 반영)
      if (state) {
        state.isCombatActive = false;
        state.isCombatPaused = false;
        state.savedTacticalState = null;
        state.currentView = views.WORLD_STRATEGY;
      }

      window.isCombatPaused = false;

      // 2. Clear active tactical grid/instance data & update screen state on playerState / gameState
      if (!window.playerState) {
        window.playerState = {};
      }
      window.playerState.isCombatPaused = false;
      window.playerState.savedTacticalState = null;
      window.playerState.currentView = views.WORLD_STRATEGY;

      if (window.gameState) {
        window.gameState.isCombatPaused = false;
        window.gameState.savedTacticalState = null;
        window.gameState.currentView = views.WORLD_STRATEGY;
      }

      // 4. Mark current sector node as cleared if isVictory is true
      const activeSectorId = (state && (state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector)) || 'A-1';

      if (isVictory) {
        if (!Array.isArray(window.playerState.clearedSectors)) {
          window.playerState.clearedSectors = [];
        }
        if (!window.playerState.clearedSectors.includes(activeSectorId)) {
          window.playerState.clearedSectors.push(activeSectorId);
        }

        if (state) {
          if (!Array.isArray(state.clearedSectors)) state.clearedSectors = [];
          if (!state.clearedSectors.includes(activeSectorId)) {
            state.clearedSectors.push(activeSectorId);
          }
        }

        if (typeof WORLD_SECTORS !== 'undefined' && WORLD_SECTORS[activeSectorId]) {
          WORLD_SECTORS[activeSectorId].cleared = true;
        }

        // Unlock next tier (e.g. B-2) if prerequisites cleared
        if (typeof WORLD_SECTORS !== 'undefined' && WORLD_SECTORS['B-2'] && (activeSectorId === 'A-2' || activeSectorId === 'B-1')) {
          WORLD_SECTORS['B-2'].locked = false;
          const b2Pin = document.getElementById('node-pin-B-2');
          if (b2Pin) {
            b2Pin.style.opacity = '1.0';
            const lockSpan = b2Pin.querySelector('.strat-node-circle span');
            if (lockSpan && lockSpan.textContent === '🔒') {
              lockSpan.textContent = '🌋';
            }
          }
        }

        // Visual node pin update
        const pin = document.getElementById(`node-pin-${activeSectorId}`);
        if (pin) {
          pin.classList.add('cleared');
          if (!pin.querySelector('.strat-node-clear-tag')) {
            const tag = document.createElement('span');
            tag.className = 'strat-node-clear-tag';
            tag.style.cssText = 'position:absolute; top:-12px; left:50%; transform:translateX(-50%); font-size:8px; font-weight:900; background:#22c55e; color:#0f172a; padding:1px 5px; border-radius:4px; white-space:nowrap; box-shadow:0 0 6px rgba(34,197,94,0.6);';
            tag.textContent = 'CLEARED';
            pin.appendChild(tag);
          }
        }

        addLog(`🚩 [작전 완수 & 전장 정리] 섹터 [${activeSectorId}] 작전이 성공적으로 종결되어 전략 사령부로 복귀했습니다.`, 'gold');
      } else {
        addLog(`🏳️ [전술 후퇴 & 전장 이탈] 섹터 [${activeSectorId}] 전술 전장에서 이탈하여 전략 사령부로 복귀했습니다.`, 'warning');
      }

      // 5. Hide pause overlay if visible
      if (window.UI && typeof window.UI.hidePauseOverlay === 'function') {
        window.UI.hidePauseOverlay();
      }

      // 6. Invokes UI transition: Call window.UI.renderWorldStrategyView()
      if (window.UI && typeof window.UI.renderWorldStrategyView === 'function') {
        window.UI.renderWorldStrategyView();
      } else {
        switchGameView('STRATEGY');
        if (typeof renderStrategyView === 'function') {
          renderStrategyView();
        }
      }

      saveGameState();
    }

    /**
     * 3. Tactical Retreat Handler
     * Handles player retreating mid-battle. Clears active battle flags,
     * triggers retreat notification, and invokes window.completeTacticalStage(false).
     */
    function executeTacticalRetreat() {
      // 1. Clear active battle flags on single source of truth
      if (state) {
        state.isCombatActive = false;
        state.isCombatPaused = false;
        state.savedTacticalState = null;
      }

      window.isCombatPaused = false;

      if (!window.playerState) {
        window.playerState = {};
      }
      window.playerState.isCombatPaused = false;
      window.playerState.savedTacticalState = null;

      if (window.gameState) {
        window.gameState.isCombatPaused = false;
        window.gameState.savedTacticalState = null;
      }

      // 2. Trigger minor retreat notification / status update
      const activeSectorId = (state && (state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector)) || 'A-1';
      const retreatMsg = `🏳️ [전술적 후퇴] 섹터 [${activeSectorId}] 전장에서 안전하게 퇴각하여 전략 사령부로 복귀합니다.`;
      addLog(retreatMsg, 'warning');

      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(retreatMsg, 'warning');
      }

      // 3. Invokes window.completeTacticalStage(false) to return player directly to WORLD_STRATEGY
      if (typeof window.completeTacticalStage === 'function') {
        window.completeTacticalStage(false);
      } else {
        completeTacticalStage(false);
      }
    }

    // ============================================================================
    // UI Pause Overlay & World Strategy View Renderer Bindings
    // ============================================================================
    if (!window.UI) {
      window.UI = {};
    }

    if (typeof window.UI.showPauseOverlay !== 'function') {
      window.UI.showPauseOverlay = function () {
        let modal = document.getElementById('modal-tactical-pause');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'modal-tactical-pause';
          document.body.appendChild(modal);
        }

        modal.className = 'modal-backdrop modal-pause-overlay active';
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';

        const secId = (state && (state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector)) || 'A-1';
        const curSec = (typeof WORLD_SECTORS !== 'undefined' && WORLD_SECTORS[secId]) ? WORLD_SECTORS[secId] : { id: secId, name: '전술 작전 구역' };
        const turnNum = (state && state.turn) || 1;
        const livingPlayers = (state && state.playerUnits) ? state.playerUnits.filter(u => !u.isDead).length : 0;
        const livingEnemies = (state && state.enemyUnits) ? state.enemyUnits.filter(u => !u.isDead).length : 0;

        modal.innerHTML = `
          <div class="modal-window pause-modal-window" style="max-width: 400px; text-align: center; border-top: 3px solid #38bdf8; background: #0f172a; border-radius: 14px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.7);">
            <div style="font-size: 38px; margin-bottom: 6px;">⏸️</div>
            <h2 style="font-size: 18px; font-weight: 900; color: #f8fafc; margin: 0 0 4px 0;">전술 전투 일시 정지</h2>
            <div style="font-size: 11px; font-weight: 700; color: #38bdf8; letter-spacing: 1px; margin-bottom: 14px;">TACTICAL COMBAT PAUSED</div>

            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; border-radius: 10px; padding: 12px; margin-bottom: 16px; text-align: left; font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">📍 작전 구역:</span>
                <strong style="color: #f1f5f9;">[${curSec.id}] ${curSec.name}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">⏳ 진행 턴수:</span>
                <strong style="color: #38bdf8;">Turn ${turnNum}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">🛡️ 아군 잔존 부대:</span>
                <strong style="color: #22c55e;">${livingPlayers}기 생존</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">👾 적군 잔존 병력:</span>
                <strong style="color: #ef4444;">${livingEnemies}기 대치 중</strong>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-pause-resume" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: 1.5px solid #38bdf8; border-radius: 10px; font-size: 13px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>▶️ 전투 재개 (Resume Combat)</span>
              </button>
              <button id="btn-pause-retreat" style="width: 100%; padding: 10px; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid #ef4444; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>🏳️ 전술적 후퇴 (Tactical Retreat)</span>
              </button>
            </div>
          </div>
        `;

        const btnResume = document.getElementById('btn-pause-resume');
        if (btnResume) {
          btnResume.onclick = () => {
            if (typeof window.resumeTacticalCombat === 'function') {
              window.resumeTacticalCombat();
            }
          };
        }

        const btnRetreat = document.getElementById('btn-pause-retreat');
        if (btnRetreat) {
          btnRetreat.onclick = () => {
            if (confirm('전술 전장에서 후퇴하시겠습니까? (현재 전투 상태는 종료되고 전략 사령부로 복귀합니다.)')) {
              if (typeof window.executeTacticalRetreat === 'function') {
                window.executeTacticalRetreat();
              } else if (typeof window.completeTacticalStage === 'function') {
                window.completeTacticalStage(false);
              }
            }
          };
        }
      };
    }

    if (typeof window.UI.hidePauseOverlay !== 'function') {
      window.UI.hidePauseOverlay = function () {
        const modal = document.getElementById('modal-tactical-pause');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
      };
    }

    if (typeof window.UI.renderWorldStrategyView !== 'function') {
      window.UI.renderWorldStrategyView = function () {
        if (typeof switchGameView === 'function') {
          switchGameView('STRATEGY');
        }
        if (typeof renderStrategyView === 'function') {
          renderStrategyView();
        }
      };
    }

    // ============================================================================
    // Global Navigation & Combat Lifecycle Attachments
    // ============================================================================
    window.openTacticalPauseMenu = openTacticalPauseMenu;
    window.resumeTacticalCombat = resumeTacticalCombat;
    window.completeTacticalStage = completeTacticalStage;
    window.executeTacticalRetreat = executeTacticalRetreat;
    window.showPauseOverlay = window.UI.showPauseOverlay;
    window.hidePauseOverlay = window.UI.hidePauseOverlay;
    window.renderWorldStrategyView = window.UI.renderWorldStrategyView;

