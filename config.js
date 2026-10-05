// ============================================================================
// Turn-Based Strategy (SLG) - System Configuration & Promotion Matrix
// Module: config.js
// ============================================================================

(function (global) {
  'use strict';

  /**
   * 1. PROMOTION_DATA
   * Civilization 4-inspired Promotion System definition with id, category, name, level, effects, and prerequisites.
   */
  const PROMOTION_DATA = {
    // --------------------------------------------------------------------------
    // Combat Line (Combat I ~ IV) : Base Damage Boost (+10% per level)
    // --------------------------------------------------------------------------
    'combat_1': {
      id: 'combat_1',
      category: 'Combat',
      name: '전투 I (Combat I)',
      level: 1,
      icon: '⚔️',
      effects: {
        atkPercent: 0.10,
        description: '기본 공격력 +10%'
      },
      prereqs: []
    },
    'combat_2': {
      id: 'combat_2',
      category: 'Combat',
      name: '전투 II (Combat II)',
      level: 2,
      icon: '⚔️',
      effects: {
        atkPercent: 0.20,
        description: '기본 공격력 +20%'
      },
      prereqs: ['combat_1']
    },
    'combat_3': {
      id: 'combat_3',
      category: 'Combat',
      name: '전투 III (Combat III)',
      level: 3,
      icon: '⚔️',
      effects: {
        atkPercent: 0.30,
        description: '기본 공격력 +30%'
      },
      prereqs: ['combat_2']
    },
    'combat_4': {
      id: 'combat_4',
      category: 'Combat',
      name: '전투 IV (Combat IV)',
      level: 4,
      icon: '⚔️',
      effects: {
        atkPercent: 0.40,
        description: '기본 공격력 +40%'
      },
      prereqs: ['combat_3']
    },

    // --------------------------------------------------------------------------
    // City Raider Line (Raider I ~ III) : City Attack Bonus
    // --------------------------------------------------------------------------
    'raider_1': {
      id: 'raider_1',
      category: 'City Raider',
      name: '도시 공격 I (City Raider I)',
      level: 1,
      icon: '🏰',
      effects: {
        cityAtkBonus: 0.20,
        description: '도시/거점 타일 공격 시 공격력 +20%'
      },
      prereqs: []
    },
    'raider_2': {
      id: 'raider_2',
      category: 'City Raider',
      name: '도시 공격 II (City Raider II)',
      level: 2,
      icon: '🏰',
      effects: {
        cityAtkBonus: 0.45,
        description: '도시/거점 타일 공격 시 공격력 +45%'
      },
      prereqs: ['raider_1']
    },
    'raider_3': {
      id: 'raider_3',
      category: 'City Raider',
      name: '도시 공격 III (City Raider III)',
      level: 3,
      icon: '🏰',
      effects: {
        cityAtkBonus: 0.75,
        description: '도시/거점 타일 공격 시 공격력 +75%'
      },
      prereqs: ['raider_2']
    },

    // --------------------------------------------------------------------------
    // City Garrison Line (Garrison I ~ III) : City Defense Bonus
    // --------------------------------------------------------------------------
    'garrison_1': {
      id: 'garrison_1',
      category: 'City Garrison',
      name: '도시 주둔 I (City Garrison I)',
      level: 1,
      icon: '🛡️',
      effects: {
        cityDefBonus: 0.20,
        description: '도시/거점 타일 주둔 시 방어력 +20%'
      },
      prereqs: []
    },
    'garrison_2': {
      id: 'garrison_2',
      category: 'City Garrison',
      name: '도시 주둔 II (City Garrison II)',
      level: 2,
      icon: '🛡️',
      effects: {
        cityDefBonus: 0.45,
        description: '도시/거점 타일 주둔 시 방어력 +45%'
      },
      prereqs: ['garrison_1']
    },
    'garrison_3': {
      id: 'garrison_3',
      category: 'City Garrison',
      name: '도시 주둔 III (City Garrison III)',
      level: 3,
      icon: '🛡️',
      effects: {
        cityDefBonus: 0.75,
        description: '도시/거점 타일 주둔 시 방어력 +75%'
      },
      prereqs: ['garrison_2']
    },

    // --------------------------------------------------------------------------
    // Flanking Line (Flanking I ~ II) : Retreat/Survival Probability on Defeat
    // --------------------------------------------------------------------------
    'flanking_1': {
      id: 'flanking_1',
      category: 'Flanking',
      name: '측면 기습 I (Flanking I)',
      level: 1,
      icon: '🐎',
      effects: {
        retreatChance: 0.20,
        description: '전투 패배 시 20% 확률로 전사하지 않고 후퇴/생존'
      },
      prereqs: []
    },
    'flanking_2': {
      id: 'flanking_2',
      category: 'Flanking',
      name: '측면 기습 II (Flanking II)',
      level: 2,
      icon: '🐎',
      effects: {
        retreatChance: 0.50,
        description: '전투 패배 시 50% 확률로 전사하지 않고 후퇴/생존'
      },
      prereqs: ['flanking_1']
    },

    // --------------------------------------------------------------------------
    // Drill Line (Drill I ~ IV) : First Strike / Counter-Attack Priority
    // --------------------------------------------------------------------------
    'drill_1': {
      id: 'drill_1',
      category: 'Drill',
      name: '제식 훈련 I (Drill I)',
      level: 1,
      icon: '🎯',
      effects: {
        firstStrikes: 1,
        counterBonus: 0.10,
        description: '선제 타격 1회(받는 피해 -5%) 및 방어 시 반격 피해 +10%'
      },
      prereqs: []
    },
    'drill_2': {
      id: 'drill_2',
      category: 'Drill',
      name: '제식 훈련 II (Drill II)',
      level: 2,
      icon: '🎯',
      effects: {
        firstStrikes: 2,
        counterBonus: 0.20,
        description: '선제 타격 2회(받는 피해 -10%) 및 방어 시 반격 피해 +20%'
      },
      prereqs: ['drill_1']
    },
    'drill_3': {
      id: 'drill_3',
      category: 'Drill',
      name: '제식 훈련 III (Drill III)',
      level: 3,
      icon: '🎯',
      effects: {
        firstStrikes: 3,
        counterBonus: 0.35,
        description: '선제 타격 3회(받는 피해 -15%) 및 방어 시 반격 피해 +35%'
      },
      prereqs: ['drill_2']
    },
    'drill_4': {
      id: 'drill_4',
      category: 'Drill',
      name: '제식 훈련 IV (Drill IV)',
      level: 4,
      icon: '🎯',
      effects: {
        firstStrikes: 4,
        counterBonus: 0.50,
        description: '선제 타격 4회(받는 피해 -20%) 및 방어 시 반격 피해 +50%'
      },
      prereqs: ['drill_3']
    },

    // --------------------------------------------------------------------------
    // Terrain Line (Guerilla, Woodsman) : Defense Bonus on Specific Tiles
    // --------------------------------------------------------------------------
    'guerilla_1': {
      id: 'guerilla_1',
      category: 'Terrain',
      name: '게릴라 (Guerilla I)',
      level: 1,
      icon: '⛰️',
      effects: {
        hillDefBonus: 0.25,
        description: '언덕/산악 타일에서 방어력 +25%'
      },
      prereqs: []
    },
    'guerilla_2': {
      id: 'guerilla_2',
      category: 'Terrain',
      name: '게릴라 II (Guerilla II)',
      level: 2,
      icon: '⛰️',
      effects: {
        hillDefBonus: 0.50,
        movementHillBonus: 1,
        description: '언덕/산악 타일에서 방어력 +50% 및 산악 진입 AP -1 (최소 1)'
      },
      prereqs: ['guerilla_1']
    },
    'woodsman_1': {
      id: 'woodsman_1',
      category: 'Terrain',
      name: '밀림/삼림 전문 (Woodsman I)',
      level: 1,
      icon: '🌲',
      effects: {
        forestDefBonus: 0.25,
        description: '숲/밀림 타일에서 방어력 +25%'
      },
      prereqs: []
    },
    'woodsman_2': {
      id: 'woodsman_2',
      category: 'Terrain',
      name: '밀림/삼림 전문 II (Woodsman II)',
      level: 2,
      icon: '🌲',
      effects: {
        forestDefBonus: 0.50,
        movementForestBonus: 1,
        description: '숲/밀림 타일에서 방어력 +50% 및 숲 진입 AP -1 (최소 1)'
      },
      prereqs: ['woodsman_1']
    },

    // --------------------------------------------------------------------------
    // Medic Line (Medic I ~ II) : Adjacent Unit HP Healing Rate Increase
    // --------------------------------------------------------------------------
    'medic_1': {
      id: 'medic_1',
      category: 'Medic',
      name: '의무병 I (Medic I)',
      level: 1,
      icon: '🩹',
      effects: {
        healAdjacentPercent: 0.10,
        healSelfPercent: 0.10,
        healRange: 1,
        description: '턴 종료 시 본인 최대 HP +10%, 같은 타일·인접 1칸 아군 최대 HP +10% 회복'
      },
      prereqs: []
    },
    'medic_2': {
      id: 'medic_2',
      category: 'Medic',
      name: '의무병 II (Medic II)',
      level: 2,
      icon: '🩹',
      effects: {
        healAdjacentPercent: 0.20,
        healSelfPercent: 0.20,
        healRange: 2,
        description: '턴 종료 시 본인 최대 HP +20%, 같은 타일·2칸 이내 아군 최대 HP +20% 회복'
      },
      prereqs: ['medic_1']
    }
  };

  /**
   * 2. PROMOTION_MATRIX
   * Class Restriction Matrix mapping allowed and restricted promotion categories for each unit class.
   */
  const PROMOTION_MATRIX = {
    KNIGHT: {
      allowed: ['Combat', 'City Raider', 'Flanking', 'Terrain', 'Medic'],
      restricted: ['City Garrison', 'Drill']
    },
    MAGE: {
      allowed: ['Combat', 'City Raider', 'Flanking', 'Terrain'],
      restricted: ['City Garrison', 'Drill', 'Medic']
    },
    ARCHER: {
      allowed: ['Combat', 'City Garrison', 'Drill', 'Terrain'],
      restricted: ['City Raider', 'Flanking', 'Medic']
    },
    MELEE: {
      allowed: ['Combat', 'City Raider', 'City Garrison', 'Drill', 'Terrain', 'Medic'],
      restricted: ['Flanking']
    },
    FIREARM: {
      allowed: ['Combat', 'City Raider', 'Drill'],
      restricted: ['City Garrison', 'Flanking', 'Terrain', 'Medic']
    }
  };

  /**
   * 3. Helper Function: isPromotionAllowed
   * Checks if a given promotion category is permitted for a specified unit class.
   *
   * @param {string} unitClass - Unit class identifier (e.g., 'KNIGHT', 'MAGE', 'ARCHER', 'MELEE', 'FIREARM')
   * @param {string} promotionCategory - Promotion category name (e.g., 'Combat', 'Flanking', 'City Raider')
   * @returns {boolean} True if the promotion category is allowed, false otherwise.
   */
  function isPromotionAllowed(unitClass, promotionCategory) {
    if (!unitClass || !promotionCategory) return false;

    const normalizedClass = String(unitClass).toUpperCase().trim();
    const matrixEntry = PROMOTION_MATRIX[normalizedClass];

    if (!matrixEntry) {
      console.warn(`[config.js] Unknown unit class: ${unitClass}`);
      return false;
    }

    // Direct check in allowed list
    const isAllowed = matrixEntry.allowed.some(
      (cat) => cat.toLowerCase() === String(promotionCategory).toLowerCase().trim()
    );

    // Ensure it is not explicitly restricted
    const isRestricted = matrixEntry.restricted.some(
      (cat) => cat.toLowerCase() === String(promotionCategory).toLowerCase().trim()
    );

    return isAllowed && !isRestricted;
  }

  /**
   * 4. Character Creation Schema & Skill Tree Template
   * Schema definition for character skill tree node and helper creation utilities.
   */
  const DEFAULT_SKILL_TREE_TEMPLATE = [
    {
      id: "skill_tier1_strike",
      name: "정밀 타격",
      tier: 1,
      prerequisites: [],
      imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2'><polygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'/></svg>",
      type: "ACTIVE",
      costAP: 1,
      coolDown: 1,
      effectValue: 15,
      targetType: "SINGLE_TARGET",
      description: "단일 적군에게 15의 정밀 피해를 입힙니다."
    },
    {
      id: "skill_tier1_iron_will",
      name: "강철 의지",
      tier: 1,
      prerequisites: [],
      imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%2338bdf8' stroke-width='2'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>",
      type: "PASSIVE",
      costAP: 0,
      coolDown: 0,
      effectValue: 10,
      targetType: "BUFF",
      description: "상시 발동: 전투 시 받는 피해 10% 감소."
    },
    {
      id: "skill_tier2_whirlwind",
      name: "선풍연격",
      tier: 2,
      prerequisites: ["skill_tier1_strike"],
      imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2'><path d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z'/><polyline points='14 2 14 8 20 8'/></svg>",
      type: "ACTIVE",
      costAP: 2,
      coolDown: 2,
      effectValue: 25,
      targetType: "AOE",
      description: "사거리 2칸 내 모든 적군에게 25의 광역 피해를 가합니다."
    },
    {
      id: "skill_tier3_valkyrie",
      name: "발키리의 축복",
      tier: 3,
      prerequisites: ["skill_tier2_whirlwind", "skill_tier1_iron_will"],
      imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23a855f7' stroke-width='2'><circle cx='12' cy='12' r='10'/><path d='m4.93 4.93 4.24 4.24'/><path d='m14.83 9.17 4.24-4.24'/><path d='m14.83 14.83 4.24 4.24'/><path d='m9.17 14.83-4.24 4.24'/></svg>",
      type: "ACTIVE",
      costAP: 2,
      coolDown: 3,
      effectValue: 40,
      targetType: "BUFF",
      description: "자신 및 인접 아군의 체력을 40 회복하고 1턴 간 공격력/방어력을 30% 증폭합니다."
    }
  ];

  /**
   * Helper to create or sanitize a character skillTree node
   */
  function createSkillTreeNode(skillObj) {
    if (!skillObj || !skillObj.name) return null;
    return {
      id: skillObj.id || `skill_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: skillObj.name,
      tier: Number(skillObj.tier) || 1,
      prerequisites: Array.isArray(skillObj.prerequisites) ? skillObj.prerequisites : [],
      imageUrl: skillObj.imageUrl || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2'><circle cx='12' cy='12' r='10'/><path d='M12 8v8'/><path d='M8 12h8'/></svg>",
      type: (String(skillObj.type).toUpperCase() === 'PASSIVE') ? 'PASSIVE' : 'ACTIVE',
      costAP: Number(skillObj.costAP) >= 0 ? Number(skillObj.costAP) : 1,
      coolDown: Number(skillObj.coolDown) >= 0 ? Number(skillObj.coolDown) : 1,
      effectValue: Number(skillObj.effectValue) || 15,
      targetType: skillObj.targetType || (skillObj.type === 'PASSIVE' ? 'BUFF' : 'SINGLE_TARGET'),
      description: skillObj.description || '고유 스킬 효과'
    };
  }

  /**
   * 5. UnitClasses
   * Base unit class templates standardized to a strict 0-100 percentage scale (maxHp: 100, hp: 100).
   */
  const UnitClasses = {
    // 5-1. 기사 (KNIGHT): 최상위 기동 돌격병
    KNIGHT: {
      id: "KNIGHT",
      name: "기사 (Knight)",
      role: "최정예 기동 돌격병",
      tier: "TOP_TIER",
      avatar: "🐴",
      hp: 100,
      maxHp: 100,
      description: "압도적인 기동력과 돌파력을 갖춘 최고 티어 유닛. 험지 방어 보너스가 낮은 대신 2랭크에서 방탄(Antibullet) 패시브를 획득합니다.",
      acquisitionSource: "FIELD_BOSS_ONLY",
      baseStats: {
        hp: 100,
        maxHp: 100,
        attack: 88,
        defense: 45,
        mobility: 5,
        range: { min: 1, max: 1 },
        collateralDamage: 0.10,
        tileDefensePenalty: 0.50
      },
      growthPerLevel: { hp: 0, attack: 7.5, defense: 4.0 },
      baseMaintenanceCost: 15,
      innatePassives: [
        {
          id: "PASSIVE_KNIGHT_MOUNTED_CHARGE",
          name: "기마 돌격",
          description: "이동 후 바로 공격 시, 이동한 타일 1칸당 공격력 +4% 증가 (최대 +20%).",
          bonusPerTileMoved: 0.04,
          maxBonus: 0.20
        },
        {
          id: "PASSIVE_KNIGHT_ANTIBULLET_RANK2",
          name: "방탄 마갑 (Rank 2)",
          description: "승급 2단계 해금. 화기(FIREARM) 유닛으로부터 받는 모든 원거리 피해를 40% 경감합니다.",
          requiredPromotionRank: 2,
          damageReductionVsFirearm: 0.40
        }
      ],
      skillTree: [
        {
          id: "SKILL_KNIGHT_BASH",
          name: "배쉬 (Bash)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "전방 1타일 적에게 180% 물리 피해를 입히고 20% 확률로 1턴간 스턴 부여.",
          damageMultiplier: 1.80,
          stunChance: 0.20,
          range: 1
        },
        {
          id: "SKILL_KNIGHT_MAGNUM_BREAK",
          name: "매그넘 브레이크 (Magnum Break)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "주변 8방향 모든 적에게 화속성 폭발 충격파로 130% 피해 및 1타일 넉백.",
          damageMultiplier: 1.30,
          knockbackTiles: 1,
          areaOfEffect: "SURROUNDING_8_TILES"
        },
        {
          id: "SKILL_KNIGHT_BOWLING_BASH",
          name: "볼링 배쉬 (Bowling Bash)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 4,
          cooldownTurns: 3,
          description: "목표를 강타하여 후방 연쇄 충돌 발생. 충돌된 유닛 양측 모두 220% 피해.",
          damageMultiplier: 2.20,
          chainCollisionDamage: 1.50,
          range: 1
        },
        {
          id: "SKILL_KNIGHT_TWO_HAND_QUICKEN",
          name: "투핸드 퀴큰 (Two-Hand Quicken)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 3,
          durationTurns: 2,
          description: "2턴간 공격 속도와 선제 타격 확률을 +35% 증가시킵니다.",
          firstStrikeBonus: 0.35
        }
      ]
    },

    // 5-2. 마법사 (MAGE): 광역 공성 및 2차 피해 유닛
    MAGE: {
      id: "MAGE",
      name: "마법사 (Mage)",
      role: "공성 파괴 및 광역 화력 유닛",
      tier: "STANDARD",
      avatar: "🔮",
      hp: 100,
      maxHp: 100,
      description: "긴 사거리의 광역 마법과 강력한 공성 유닛. 인접 타일 및 동일 타일에 중첩된 적들에게 막대한 2차 피해를 입힙니다.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 100,
        maxHp: 100,
        attack: 94,
        defense: 18,
        mobility: 2,
        range: { min: 2, max: 3 },
        collateralDamage: 0.45,
        siegeBonus: 0.60
      },
      growthPerLevel: { hp: 0, attack: 8.8, defense: 1.5 },
      baseMaintenanceCost: 12,
      innatePassives: [
        {
          id: "PASSIVE_MAGE_COLLATERAL_BURST",
          name: "연쇄 폭발",
          description: "목표 타일에 인접한 적 유닛 수마다 2차 피해량이 +5%씩 증폭 (최대 +20%).",
          splashScalePerAdjacent: 0.05,
          maxBonus: 0.20
        }
      ],
      skillTree: [
        {
          id: "SKILL_MAGE_FIRE_BOLT",
          name: "파이어 볼트 (Fire Bolt)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "화염 화살 5연타를 발사하여 단일 대상에게 175%의 마법 피해.",
          damageMultiplier: 1.75,
          range: 3
        },
        {
          id: "SKILL_MAGE_SIGHTRASHER",
          name: "사이트래셔 (Sightrasher)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "호위 불꽃 구체를 방출하여 접근하는 적 근접 유닛을 밀쳐내며 140% 피해.",
          damageMultiplier: 1.40,
          knockbackTiles: 1,
          range: 1
        },
        {
          id: "SKILL_MAGE_METEOR_STORM",
          name: "메테오 스톰 (Meteor Storm)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 4,
          cooldownTurns: 3,
          description: "지정 3x3 범위에 유성을 투하하여 중심부 200%, 주변부 70% 2차 피해 및 30% 스턴.",
          centerMultiplier: 2.00,
          splashMultiplier: 0.70,
          stunChance: 0.30,
          radiusTiles: 1,
          range: 3
        },
        {
          id: "SKILL_MAGE_ENERGY_COAT",
          name: "에너지 코트 (Energy Coat)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 4,
          durationTurns: 2,
          description: "마력 보호막을 둘러 2턴간 받는 물리 피해를 30% 흡수 경감.",
          damageReduction: 0.30
        }
      ]
    },

    // 5-3. 근접전투 (MELEE): 전방 탱커 및 전선 방어형 중장 보병
    MELEE: {
      id: "MELEE",
      name: "근접전투 (Melee Infantry)",
      role: "전선 방어형 중장 보병 / 탱커",
      tier: "STANDARD",
      avatar: "⚔️",
      hp: 100,
      maxHp: 100,
      description: "전선의 척추 역할을 수행하는 표준 중장 보병. 높은 방어력과 지형 적응력을 가지며 아군 원거리 유닛을 호위합니다.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 100,
        maxHp: 100,
        attack: 62,
        defense: 52,
        mobility: 3,
        range: { min: 1, max: 1 },
        collateralDamage: 0.05,
        counterAttackBonus: 0.25
      },
      growthPerLevel: { hp: 0, attack: 5.2, defense: 5.5 },
      baseMaintenanceCost: 8,
      innatePassives: [
        {
          id: "PASSIVE_MELEE_FORTIFY",
          name: "방진 구축",
          description: "방어 타일(산/숲/도시)에서 전투 시 받는 최종 피해가 15% 추가 감소합니다.",
          defensiveTerrainBonus: 0.15
        }
      ],
      skillTree: [
        {
          id: "SKILL_MELEE_PROVOKE",
          name: "도발 (Provoke)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 2,
          description: "적 1기를 도발하여 2턴간 방어력을 20% 깎고 분노 유도.",
          defenseDebuff: 0.20,
          range: 2
        },
        {
          id: "SKILL_MELEE_ENDURE",
          name: "인듀어 (Endure)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 3,
          durationTurns: 2,
          description: "2턴간 마법 방어력 +25 및 피격 경직/넉백 완전 면역.",
          magicDefBonus: 25,
          ignoreKnockback: true
        },
        {
          id: "SKILL_MELEE_SHIELD_CHARGE",
          name: "쉴드 차지 (Shield Charge)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 2,
          description: "방패로 돌진하여 130% 피해를 주고 적을 2타일 밀어냄.",
          damageMultiplier: 1.30,
          knockbackTiles: 2,
          range: 1
        },
        {
          id: "SKILL_MELEE_AUTO_COUNTER",
          name: "오토 카운터 (Auto Counter)",
          type: "STANCE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 2,
          description: "반격 태세를 취해 다음 근접 공격을 100% 회피하고 180% 확정 치명타 반격.",
          guaranteedDodge: true,
          counterCritMultiplier: 1.80
        }
      ]
    },

    // 5-4. 활 (ARCHER): 곡사 원거리 물리 저격수
    ARCHER: {
      id: "ARCHER",
      name: "궁수 (Archer)",
      role: "곡사 원거리 물리 저격수",
      tier: "STANDARD",
      avatar: "🏹",
      hp: 100,
      maxHp: 100,
      description: "곡사 궤적으로 장애물 뒤 적을 타격할 수 있는 원거리 사격수. 높은 치명타율 보유.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 100,
        maxHp: 100,
        attack: 74,
        defense: 24,
        mobility: 3,
        range: { min: 2, max: 3 },
        collateralDamage: 0.12,
        critRate: 0.20,
        canArcShot: true
      },
      growthPerLevel: { hp: 0, attack: 6.8, defense: 2.2 },
      baseMaintenanceCost: 9,
      innatePassives: [
        {
          id: "PASSIVE_ARCHER_EAGLE_EYE",
          name: "독수리의 눈",
          description: "고지대(산악 타일) 점령 시 사거리가 +1 타일 확장됩니다.",
          highGroundRangeBonus: 1
        }
      ],
      skillTree: [
        {
          id: "SKILL_ARCHER_DOUBLE_STRAFE",
          name: "더블 스트레이핑 (Double Strafe)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "화살 2발을 고속 발사하여 190% 집중 관통 피해.",
          damageMultiplier: 1.90,
          range: 3
        },
        {
          id: "SKILL_ARCHER_ARROW_SHOWER",
          name: "애로우 샤워 (Arrow Shower)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "화살비를 쏟아 지정 타일 및 주변에 120% 피해 및 넉백.",
          damageMultiplier: 1.20,
          splashRadius: 1,
          knockbackTiles: 1,
          range: 3
        },
        {
          id: "SKILL_ARCHER_CHARGE_ARROW",
          name: "차지 애로우 (Charge Arrow)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 2,
          description: "150% 피해를 입히고 목표를 3타일 뒤로 튕겨냄.",
          damageMultiplier: 1.50,
          knockbackTiles: 3,
          range: 3
        },
        {
          id: "SKILL_ARCHER_IMPROVE_CONCENTRATION",
          name: "집중력 향상 (Improve Concentration)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 3,
          durationTurns: 3,
          description: "3턴간 명중률 +25%, 치명타율 +15% 상승.",
          accuracyBonus: 0.25,
          critBonus: 0.15
        }
      ]
    },

    // 5-5. 화기 (FIREARM): 직사 고화력 관통 중화기병
    FIREARM: {
      id: "FIREARM",
      name: "화기병 (Firearm Battalion)",
      role: "직사 고화력 관통 중화기병",
      tier: "STANDARD",
      avatar: "💥",
      hp: 100,
      maxHp: 100,
      description: "직사 탄도를 가진 압도적 파괴력의 현대식 화기병. 방어구 관통력이 매우 뛰어납니다.",
      acquisitionSource: "TECH_LAB_WORKSHOP",
      baseStats: {
        hp: 100,
        maxHp: 100,
        attack: 96,
        defense: 28,
        mobility: 2,
        range: { min: 2, max: 4 },
        collateralDamage: 0.20,
        armorPenetration: 0.35,
        isBulletType: true
      },
      growthPerLevel: { hp: 0, attack: 9.2, defense: 2.8 },
      baseMaintenanceCost: 14,
      innatePassives: [
        {
          id: "PASSIVE_FIREARM_DIRECT_FIRE",
          name: "직사 궤적",
          description: "직선 경로상에 아군이나 산악이 가로막을 경우 사격 불가.",
          requiresClearLineOfSight: true
        }
      ],
      skillTree: [
        {
          id: "SKILL_FIREARM_GATLING_RUSH",
          name: "개틀링 러시 (Gatling Rush)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "전방 부채꼴 범위에 무차별 연사를 가해 대상에게 210% 관통 피해.",
          damageMultiplier: 2.10,
          range: 3
        },
        {
          id: "SKILL_FIREARM_PIERCING_SHOT",
          name: "관통 탄환 (Piercing Shot)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "일렬로 늘어선 최대 3개 타일의 모든 적을 일거에 꿰뚫어 150% 피해.",
          damageMultiplier: 1.50,
          linearPenetrationDepth: 3,
          range: 4
        }
      ]
    }
  };

  /**
   * 6. Factory Logic: createUnit(unitType, customConfig)
   * Instantiates a new unit strictly inheriting standard percentage-based health:
   *   hp: 100,
   *   maxHp: 100
   *
   * @param {string|object} unitType - Class identifier ('KNIGHT', 'MAGE', 'MELEE', 'ARCHER', 'FIREARM') or config object
   * @param {object} [customConfig={}] - Optional initial properties, positions, owner, or overrides
   * @returns {object} Standardized unit instance
   */
  function createUnit(unitType, customConfig = {}) {
    let resolvedType = unitType;
    let config = customConfig;

    if (typeof unitType === 'object' && unitType !== null) {
      config = unitType;
      resolvedType = config.unitClass || config.class || config.classType || 'MELEE';
    }

    const normalizedClass = String(resolvedType || 'MELEE').toUpperCase().trim();
    const template = UnitClasses[normalizedClass] || UnitClasses.MELEE;
    const level = Number(config.level) || 1;

    const baseAtk = config.atk !== undefined
      ? Number(config.atk)
      : (config.stats?.atk !== undefined ? Number(config.stats.atk) : template.baseStats.attack);

    const baseDef = config.def !== undefined
      ? Number(config.def)
      : (config.stats?.def !== undefined ? Number(config.stats.def) : template.baseStats.defense);

    const baseMobility = config.mobility !== undefined
      ? Number(config.mobility)
      : (config.stats?.mobility !== undefined ? Number(config.stats.mobility) : template.baseStats.mobility);

    const baseRange = config.range !== undefined
      ? config.range
      : (config.stats?.range !== undefined ? config.stats.range : template.baseStats.range);

    const defaultSkill = (template.skillTree && template.skillTree.length > 0)
      ? JSON.parse(JSON.stringify(template.skillTree[0]))
      : null;

    const unitInstance = {
      id: config.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      owner: config.owner || 'PLAYER',
      name: config.name || template.name,
      unitClass: normalizedClass,
      classType: normalizedClass,
      avatar: config.avatar || template.avatar,
      level: level,
      exp: Number(config.exp) || 0,
      maxExp: level * 100,

      // Strictly Standardized Percentage Health Scale (0-100%)
      hp: 100,
      maxHp: 100,

      // Core attributes & stats object
      stats: {
        hp: 100,
        maxHp: 100,
        atk: baseAtk,
        def: baseDef,
        mobility: baseMobility,
        range: baseRange
      },
      atk: baseAtk,
      def: baseDef,
      mobility: baseMobility,
      range: baseRange,
      baseAP: config.baseAP !== undefined ? Number(config.baseAP) : baseMobility,
      ap: config.ap !== undefined ? Number(config.ap) : (config.baseAP !== undefined ? Number(config.baseAP) : baseMobility),

      // Morale & Affection (0 - 100)
      favorability: config.favorability !== undefined ? Number(config.favorability) : (config.affection !== undefined ? Number(config.affection) : 50),
      affection: config.affection !== undefined ? Number(config.affection) : (config.favorability !== undefined ? Number(config.favorability) : 50),

      // Economy & Upkeep
      upkeep: config.upkeep !== undefined ? Number(config.upkeep) : (config.maintenanceCostPerTurn !== undefined ? Number(config.maintenanceCostPerTurn) : template.baseMaintenanceCost),
      maintenanceCostPerTurn: config.maintenanceCostPerTurn !== undefined ? Number(config.maintenanceCostPerTurn) : (config.upkeep !== undefined ? Number(config.upkeep) : template.baseMaintenanceCost),

      // Map Grid Coordinates
      x: config.x !== undefined ? config.x : 0,
      y: config.y !== undefined ? config.y : 0,
      currentTileType: config.currentTileType || 'PLAIN',

      // Operational Status
      imageUrl: config.imageUrl || '',
      isDead: false,
      isInactivated: false,
      isDeactivated: false,
      deactivatedUntilTimestamp: null,

      // Promotions
      promotions: {
        combatRank: config.promotions?.combatRank || 0,
        firstStrikeRank: config.promotions?.firstStrikeRank || 0,
        withdrawalRank: config.promotions?.withdrawalRank || 0,
        antibulletRank: config.promotions?.antibulletRank || (normalizedClass === 'KNIGHT' ? 1 : 0),
        collateralResistRank: config.promotions?.collateralResistRank || 0,
        ...(config.promotions || {})
      },

      // Skill system
      customSkill: config.customSkill ? JSON.parse(JSON.stringify(config.customSkill)) : defaultSkill,
      customSkillCooldown: 0,
      activeSkillSlot: config.activeSkillSlot || (defaultSkill ? defaultSkill.id : ''),
      autoCastPreCollision: true
    };

    return unitInstance;
  }

  /**
   * 7. TOWN_UNIT_SHOP_CATALOG
   * Safe Zone (Town/City) Unit Shop Catalog - Purchasable unit templates with gold costs and town tiers
   * Standardized strictly to percentage-based scale (hp: 100, maxHp: 100).
   */
  const TOWN_UNIT_SHOP_CATALOG = [
    {
      id: 'recruit_militia_guard',
      name: '마을 수비대원',
      classType: 'MELEE',
      avatar: '🛡️',
      cost: 120,
      reqTownLevel: 1,
      stats: { hp: 100, maxHp: 100, atk: 38, def: 34, mobility: 2 },
      upkeep: 8,
      description: '마을을 지키는 훈련된 보병 용병. 튼튼한 체력과 안정적인 방어력을 보유합니다.'
    },
    {
      id: 'recruit_frontier_scout',
      name: '국경 척후 궁수',
      classType: 'ARCHER',
      avatar: '🏹',
      cost: 180,
      reqTownLevel: 1,
      stats: { hp: 100, maxHp: 100, atk: 48, def: 22, mobility: 3 },
      upkeep: 10,
      description: '사정거리 2칸의 정예 척후병. 신속한 정찰과 원거리 저격 지원에 능합니다.'
    },
    {
      id: 'recruit_academy_adept',
      name: '아카데미 수습 마법사',
      classType: 'MAGE',
      avatar: '🔮',
      cost: 260,
      reqTownLevel: 2,
      stats: { hp: 100, maxHp: 100, atk: 60, def: 18, mobility: 2 },
      upkeep: 14,
      description: '원소 마법을 연마한 학파 마법사. 높은 공격력으로 광역 원소 화력을 담당합니다.'
    },
    {
      id: 'recruit_royal_cavalry',
      name: '왕실 근위 기병',
      classType: 'KNIGHT',
      avatar: '🐴',
      cost: 380,
      reqTownLevel: 2,
      stats: { hp: 100, maxHp: 100, atk: 54, def: 42, mobility: 3 },
      upkeep: 18,
      description: '왕도 직속의 중갑 기병. 뛰어난 기동력과 돌파력으로 전선을 순식간에 허뭅니다.'
    },
    {
      id: 'recruit_artillery_engineer',
      name: '공병 연대 화기병',
      classType: 'FIREARM',
      avatar: '💥',
      cost: 450,
      reqTownLevel: 3,
      stats: { hp: 100, maxHp: 100, atk: 68, def: 28, mobility: 2 },
      upkeep: 20,
      description: '최신 화포와 화약을 다루는 화기 전문가. 사거리 2칸에서 파괴적인 피해를 가합니다.'
    }
  ];

  // ============================================================================
  // 8. Navigation Views (GAME_VIEWS) & Tactical Combat State Management
  // ============================================================================

  /**
   * Navigation Views (window.GAME_VIEWS)
   * Defines constant identifiers for the primary views and combat overlay states:
   * - WORLD_STRATEGY: Main world/sector selection map.
   * - SECTOR_FIELD: Tactical 8x14 grid combat map.
   * - STRATEGY_MENU_OVERLAY: Temporary strategy/pause menu while combat is ongoing.
   */
  /**
   * ECONOMY: 골드 가격은 기본가(BASE_PRICES) × 인플레이션 배율로 정한다.
   * 가격은 항상 getGamePrice(key)로 읽고, 인플레이션을 도입할 때는
   * ECONOMY.inflation 값이나 ECONOMY.getInflation(회차·층 등을 보고 배율을 돌려주는 함수)만 바꾸면 된다.
   */
  const BASE_PRICES = Object.freeze({
    ACADEMY_UPGRADE: 300, // 왕실 아카데미 진급 훈련
    CAPTURE_BRIBE: 80,    // 포섭 방침 "금화 회유": 포섭 성공 시 지불
    CAPTIVE_RANSOM: 300   // 적에게 붙잡힌 아군의 기본 몸값 (레벨·승급에 따라 가산)
  });
  const ECONOMY = {
    inflation: 1.0,
    getInflation: null
  };
  // 현재 물가 지수 (1.0 = 기준). 연준(fedSystem.js)이 ECONOMY.getInflation에 물가를 연결한다.
  function getPriceLevel() {
    const rate = typeof ECONOMY.getInflation === 'function' ? Number(ECONOMY.getInflation()) : Number(ECONOMY.inflation);
    return rate > 0 ? rate : 1;
  }
  function getGamePrice(key) {
    const base = BASE_PRICES[key];
    if (!(base > 0)) return 0;
    return Math.max(1, Math.round((base * getPriceLevel()) / 10) * 10); // 10G 단위로 반올림
  }
  // 코드에 박혀 있는 골드 기준가(상점·고용 등)를 현재 물가로 환산한다. 소액은 1G, 100G 이상은 5G 단위.
  // 사는 값과 파는 값 모두 이 함수를 지나야 인플레이션이 반영된다.
  // 수입(전리품·보상·세수)도 물가를 따라가야 구매력이 유지된다. 1G 단위로 반올림.
  function scaleIncome(base) {
    const v = Number(base);
    if (!(v > 0)) return 0;
    return Math.max(1, Math.round(v * getPriceLevel()));
  }
  function scaleGold(base) {
    const v = Number(base) * getPriceLevel();
    if (!(v > 0)) return 0;
    const unit = v >= 100 ? 5 : 1;
    return Math.max(1, Math.round(v / unit) * unit);
  }

  const GAME_VIEWS = Object.freeze({
    WORLD_STRATEGY: 'WORLD_STRATEGY',
    SECTOR_FIELD: 'SECTOR_FIELD',
    STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY'
  });

  /**
   * Helper function to instantiate an empty tactical state container
   * Holds active battle data (unit HP, turn count, grid positions) during temporary exits.
   *
   * @returns {Object} Safe tactical battle data template
   */
  function createInitialTacticalState() {
    return {
      sectorId: null,
      turn: 1,
      playerUnits: [],
      enemyUnits: [],
      gridPositions: {},
      savedAt: null
    };
  }

  /**
   * Helper function to capture and deep-clone an active tactical battle state snapshot
   *
   * @param {string} [sectorId=null] - Active sector ID (e.g., 'A-1')
   * @param {number} [turn=1] - Current combat turn
   * @param {Array} [playerUnits=[]] - Player unit array with HP and stats
   * @param {Array} [enemyUnits=[]] - Enemy unit array with HP and stats
   * @param {Object} [gridPositions={}] - Unit coordinate mapping on tactical grid
   * @returns {Object} Sanitized tactical snapshot
   */
  function snapshotTacticalState(sectorId, turn, playerUnits = [], enemyUnits = [], gridPositions = {}) {
    return {
      sectorId: sectorId || null,
      turn: Number(turn) || 1,
      playerUnits: Array.isArray(playerUnits) ? JSON.parse(JSON.stringify(playerUnits)) : [],
      enemyUnits: Array.isArray(enemyUnits) ? JSON.parse(JSON.stringify(enemyUnits)) : [],
      gridPositions: (typeof gridPositions === 'object' && gridPositions !== null)
        ? JSON.parse(JSON.stringify(gridPositions))
        : {},
      savedAt: new Date().toISOString()
    };
  }

  // --------------------------------------------------------------------------
  // Global State Extension: window.playerState & window.gameState
  // --------------------------------------------------------------------------

  // 1) Initialize & extend window.playerState
  if (typeof global.playerState === 'undefined' || !global.playerState) {
    global.playerState = {};
  }
  if (global.playerState.currentView === undefined) {
    global.playerState.currentView = GAME_VIEWS.WORLD_STRATEGY;
  }
  // Single source of truth for isCombatActive: state.isCombatActive
  if (!('isCombatActive' in global.playerState) || Object.getOwnPropertyDescriptor(global.playerState, 'isCombatActive')?.configurable) {
    Object.defineProperty(global.playerState, 'isCombatActive', {
      get() {
        return (typeof state !== 'undefined' && state)
          ? !!state.isCombatActive
          : (this._isCombatActive !== undefined ? !!this._isCombatActive : false);
      },
      set(val) {
        if (typeof state !== 'undefined' && state) {
          state.isCombatActive = !!val;
        } else {
          this._isCombatActive = !!val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }
  if (global.playerState.isCombatPaused === undefined) {
    global.playerState.isCombatPaused = false;
  }
  if (global.playerState.savedTacticalState === undefined) {
    global.playerState.savedTacticalState = createInitialTacticalState();
  }
  if (global.playerState.clearedSectors === undefined) {
    global.playerState.clearedSectors = [];
  }

  // Preserve universal gold / rewinders accessors on playerState
  if (!('gold' in global.playerState)) {
    Object.defineProperty(global.playerState, 'gold', {
      get() {
        return (typeof state !== 'undefined' && state && typeof state.gold === 'number')
          ? state.gold
          : (this._gold !== undefined ? this._gold : 450);
      },
      set(val) {
        if (typeof state !== 'undefined' && state) {
          state.gold = val;
        } else {
          this._gold = val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }
  if (!('rewinders' in global.playerState)) {
    Object.defineProperty(global.playerState, 'rewinders', {
      get() {
        return (typeof state !== 'undefined' && state && typeof state.rewinders === 'number')
          ? state.rewinders
          : (this._rewinders !== undefined ? this._rewinders : 3);
      },
      set(val) {
        if (typeof state !== 'undefined' && state) {
          state.rewinders = val;
        } else {
          this._rewinders = val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }

  // 2) Initialize & extend window.gameState
  if (typeof global.gameState === 'undefined' || !global.gameState) {
    global.gameState = {};
  }
  if (global.gameState.currentView === undefined) {
    global.gameState.currentView = GAME_VIEWS.WORLD_STRATEGY;
  }
  if (!('isCombatActive' in global.gameState) || Object.getOwnPropertyDescriptor(global.gameState, 'isCombatActive')?.configurable) {
    Object.defineProperty(global.gameState, 'isCombatActive', {
      get() {
        return (typeof state !== 'undefined' && state)
          ? !!state.isCombatActive
          : (this._isCombatActive !== undefined ? !!this._isCombatActive : false);
      },
      set(val) {
        if (typeof state !== 'undefined' && state) {
          state.isCombatActive = !!val;
        } else {
          this._isCombatActive = !!val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }
  if (global.gameState.isCombatPaused === undefined) {
    global.gameState.isCombatPaused = false;
  }
  if (global.gameState.savedTacticalState === undefined) {
    global.gameState.savedTacticalState = createInitialTacticalState();
  }
  if (global.gameState.clearedSectors === undefined) {
    global.gameState.clearedSectors = [];
  }

  // 3) Global getters for isCombatActive and battleActive on window/global
  if (!('isCombatActive' in global) || Object.getOwnPropertyDescriptor(global, 'isCombatActive')?.configurable) {
    Object.defineProperty(global, 'isCombatActive', {
      get() {
        return (typeof state !== 'undefined' && state)
          ? !!state.isCombatActive
          : (global.playerState && global.playerState.isCombatActive !== undefined ? !!global.playerState.isCombatActive : false);
      },
      set(val) {
        if (typeof state !== 'undefined' && state) {
          state.isCombatActive = !!val;
        } else if (global.playerState) {
          global.playerState.isCombatActive = !!val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }
  if (!('battleActive' in global) || Object.getOwnPropertyDescriptor(global, 'battleActive')?.configurable) {
    Object.defineProperty(global, 'battleActive', {
      get() {
        return (typeof state !== 'undefined' && state)
          ? !!state.isCombatActive
          : (global.playerState && global.playerState.isCombatActive !== undefined ? !!global.playerState.isCombatActive : false);
      },
      set(val) {
        if (typeof state !== 'undefined' && state) {
          state.isCombatActive = !!val;
        } else if (global.playerState) {
          global.playerState.isCombatActive = !!val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }

  // ============================================================================
  // Global Scope Binding (Zero Bundler / Modular Vanilla JS Architecture)
  // ============================================================================
  const GameConfig = {
    PROMOTION_DATA,
    PROMOTION_MATRIX,
    isPromotionAllowed,
    DEFAULT_SKILL_TREE_TEMPLATE,
    createSkillTreeNode,
    TOWN_UNIT_SHOP_CATALOG,
    UnitClasses,
    createUnit,
    createUnitInstance: createUnit,
    GAME_VIEWS,
    BASE_PRICES,
    ECONOMY,
    getGamePrice,
    getPriceLevel,
    scaleGold,
    scaleIncome,
    createInitialTacticalState,
    snapshotTacticalState
  };

  global.PROMOTION_DATA = PROMOTION_DATA;
  global.PROMOTION_MATRIX = PROMOTION_MATRIX;
  global.isPromotionAllowed = isPromotionAllowed;
  global.DEFAULT_SKILL_TREE_TEMPLATE = DEFAULT_SKILL_TREE_TEMPLATE;
  global.createSkillTreeNode = createSkillTreeNode;
  global.TOWN_UNIT_SHOP_CATALOG = TOWN_UNIT_SHOP_CATALOG;
  global.UnitClasses = UnitClasses;
  global.createUnit = createUnit;
  global.createUnitInstance = createUnit;
  global.GAME_VIEWS = GAME_VIEWS;
  global.BASE_PRICES = BASE_PRICES;
  global.ECONOMY = ECONOMY;
  global.getGamePrice = getGamePrice;
  global.getPriceLevel = getPriceLevel;
  global.scaleGold = scaleGold;
  global.scaleIncome = scaleIncome;
  global.createInitialTacticalState = createInitialTacticalState;
  global.snapshotTacticalState = snapshotTacticalState;
  global.GameConfig = GameConfig;

})(typeof window !== 'undefined' ? window : this);
