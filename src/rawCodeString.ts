// 순수 JavaScript 단일 파일 HTML/JS Web-SLG 즉시 삽입용 코드 문자열

export const RAW_GAME_DATA_JS = `/**
 * ============================================================================
 * [Web-SLG] Step 1: 핵심 데이터 구조 및 시스템 규칙 (Game Data Definitions)
 * ============================================================================
 * 세로형 턴제 HTML/JS 단일 파일 Web-SLG 모바일 게임용 순수 자바스크립트 객체
 * HTML <script> 태그 내부 또는 별도 JS 파일에 직접 복사하여 사용하십시오.
 */

const GameData = {
  // 1. 게임 시스템 코어 룰 데이터
  GameRules: {
    turnTimeLimit: {
      baseDurationSec: 60,         // 기본 턴 시간 (60초)
      warningThresholdSec: 15,     // 턴 종료 경고 비프음/UI 점멸 (15초 전)
      overtimeBufferSec: 10,       // 오버타임 지연 버퍼 (10초)
      fastModeDurationSec: 30,     // 고속 교전 모드 턴 시간 (30초)
      autoEndOnTimeout: true,      // 시간 초과 시 자동 턴 종료
      timeoutPenalty: {
        skipAction: true,          // 미수행 유닛 행동 강제 스킵
        moraleDeduction: 2         // 시간 초과 패널티: 사기/호감도 -2
      }
    },
    rewinder: {
      itemId: "ITEM_TIME_REWINDER_CHRONOS",
      name: "크로노스의 모래시계 (Turn Rewinder)",
      description: "잘못된 전략 이동이나 참패한 교전 1턴 전으로 전황을 복구합니다.",
      currentCount: 3,             // 현재 보유 개수
      maxCapacity: 10,             // 최대 보관 수량
      costPerUse: 1,               // 1회 사용 시 소모량
      maxDailyRewinds: 5,          // 24시간 내 최대 사용 횟수
      cooldownTurns: 3,            // 1회 사용 후 쿨다운 (3턴)
      rechargeRateHours: 8,        // 8시간당 1개 무료 자연 충전
      freeRechargeCap: 3,          // 무료 자연 충전 상한선
      premiumGemPrice: 150,        // 유료 보석 즉시 충전 가격 (150 캐시)
      refundOnVictory: false,      // 승리 시 아이템 환급 불가
      canRewindPvP: false          // 비동기/실시간 PvP 사용 불가
    },
    logoutPenalty: {
      autoDefenseMode: true,       // 로그아웃 시 필드 유닛 자동 수비 모드 전환
      deactivationDurationSec: 3600, // 오프라인 수비 패배 시 3600초(1시간) 비활성화 보호
      maxDailyUnitLoss: 24,        // 24시간 내 최대 유닛 손실 24기 (초과 시 보호막 자동 전개)
      resetCondition: {
        triggerOnZeroUnits: true,      // 모든 유닛 소멸 시 발동
        resetTerritoryProgress: true,  // 영지 점령 진행도 0으로 리셋
        resetResourceStockpile: true,  // 필드 자원 창고 초기화
        keepCommanderLevel: true,      // [핵심] 지휘관 레벨 영구 보존
        keepCommanderSkills: true,     // [핵심] 지휘관 스킬 투자 내역 보존
        keepPurchasedSkins: true,      // 구매한 코스메틱/스킨 보존
        compensationUnits: [
          { classId: "MELEE", count: 2, level: 1, name: "의용 보병" },
          { classId: "ARCHER", count: 1, level: 1, name: "초보 궁수" }
        ]
      }
    }
  },

  // 2. 5대 병과 기본 스탯 및 스킬/승급 사다리
  UnitClasses: {
    KNIGHT: {
      id: "KNIGHT",
      name: "기사 (Knight)",
      role: "최정예 기동 돌격병",
      tier: "TOP_TIER",
      description: "압도적인 기동력과 돌파력을 갖춘 최고 티어 유닛. 험지 방어 보너스가 낮은 대신 2랭크에서 방탄 패시브를 획득. 필드 보스 격파로만 파밍 가능.",
      acquisitionSource: "FIELD_BOSS_ONLY",
      baseStats: {
        hp: 480,
        attack: 88,
        defense: 45,
        mobility: 5,               // 이동력 5타일/AP (최고 기동)
        range: { min: 1, max: 1 },
        collateralDamage: 0.10,    // 돌격 충격 2차 피해 10%
        tileDefensePenalty: 0.50   // 험지 방어 보너스 50% 삭감
      },
      growthPerLevel: { hp: 38, attack: 7.5, defense: 4.0 },
      baseMaintenanceCost: 15,
      innatePassives: [
        {
          id: "PASSIVE_KNIGHT_MOUNTED_CHARGE",
          name: "기마 돌격",
          bonusPerTileMoved: 0.04,
          maxBonus: 0.20
        },
        {
          id: "PASSIVE_KNIGHT_ANTIBULLET_RANK2",
          name: "방탄 마갑 (Rank 2)",
          requiredPromotionRank: 2,
          damageReductionVsFirearm: 0.40 // 화기 피해 40% 경감
        }
      ],
      skillTree: [
        {
          id: "SKILL_KNIGHT_BASH",
          name: "배쉬 (Bash)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD", // 교전 충돌 직전 선제 필드 시전
          apCost: 2,
          cooldownTurns: 1,
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
          firstStrikeBonus: 0.35
        }
      ]
    },

    MAGE: {
      id: "MAGE",
      name: "마법사 (Mage)",
      role: "공성 파괴 및 광역 화력 유닛",
      tier: "STANDARD",
      description: "긴 사거리의 광역 마법과 강력한 공성 유닛. 인접 타일 및 동일 타일 유닛에 막대한 2차 피해(Collateral Damage)를 입힘.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 260,
        attack: 94,
        defense: 18,
        mobility: 2,
        range: { min: 2, max: 3 },
        collateralDamage: 0.45,    // 2차 피해 45% (광역 스플래시)
        siegeBonus: 0.60           // 성벽/도시 구조물 +60% 피해
      },
      growthPerLevel: { hp: 18, attack: 8.8, defense: 1.5 },
      baseMaintenanceCost: 12,
      innatePassives: [
        {
          id: "PASSIVE_MAGE_COLLATERAL_BURST",
          name: "연쇄 폭발",
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
          damageReduction: 0.30
        }
      ]
    },

    MELEE: {
      id: "MELEE",
      name: "근접전투 (Melee Infantry)",
      role: "전선 방어형 중장 보병 / 탱커",
      tier: "STANDARD",
      description: "전선의 중심을 지탱하는 표준 중장 보병. 높은 방어력과 반격 보너스를 지님.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 420,
        attack: 62,
        defense: 52,
        mobility: 3,
        range: { min: 1, max: 1 },
        collateralDamage: 0.05,
        counterAttackBonus: 0.25   // 반격 시 +25% 추가 피해
      },
      growthPerLevel: { hp: 35, attack: 5.2, defense: 5.5 },
      baseMaintenanceCost: 8,
      innatePassives: [
        {
          id: "PASSIVE_MELEE_FORTIFY",
          name: "방진 구축",
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
          guaranteedDodge: true,
          counterCritMultiplier: 1.80
        }
      ]
    },

    ARCHER: {
      id: "ARCHER",
      name: "궁수 (Archer)",
      role: "곡사 원거리 물리 저격수",
      tier: "STANDARD",
      description: "곡사 궤적으로 장애물 뒤 적을 타격할 수 있는 원거리 사격수. 높은 치명타율 보유.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 310,
        attack: 74,
        defense: 24,
        mobility: 3,
        range: { min: 2, max: 3 },
        collateralDamage: 0.12,
        critRate: 0.20,
        canArcShot: true           // 장애물 우회 사격
      },
      growthPerLevel: { hp: 22, attack: 6.8, defense: 2.2 },
      baseMaintenanceCost: 9,
      innatePassives: [
        {
          id: "PASSIVE_ARCHER_EAGLE_EYE",
          name: "독수리의 눈",
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
          accuracyBonus: 0.25,
          critBonus: 0.15
        }
      ]
    },

    FIREARM: {
      id: "FIREARM",
      name: "화기병 (Firearm Battalion)",
      role: "직사 고화력 관통 중화기병",
      tier: "STANDARD",
      description: "직사 탄도를 가진 압도적 파괴력의 현대식 화기병. 방어구 관통력이 뛰어나나 기사의 방탄 패시브에 상성 카운터를 받음.",
      acquisitionSource: "TECH_LAB_WORKSHOP",
      baseStats: {
        hp: 340,
        attack: 96,
        defense: 28,
        mobility: 2,
        range: { min: 2, max: 4 },
        collateralDamage: 0.20,
        armorPenetration: 0.35,    // 방어력 35% 관통
        isBulletType: true         // 기사 방탄 대상
      },
      growthPerLevel: { hp: 24, attack: 9.2, defense: 2.8 },
      baseMaintenanceCost: 14,
      innatePassives: [
        {
          id: "PASSIVE_FIREARM_DIRECT_FIRE",
          name: "직사 궤적",
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
          damageMultiplier: 1.50,
          linearPenetrationDepth: 3,
          range: 4
        },
        {
          id: "SKILL_FIREARM_BUNKER_BUSTER",
          name: "벙커 버스터 (Bunker Buster)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 4,
          cooldownTurns: 3,
          nullifyTileDefense: true,
          damageMultiplier: 1.80,
          range: 4
        },
        {
          id: "SKILL_FIREARM_OVERHEAT_VENT",
          name: "오버히트 벤트 (Overheat Vent)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 3,
          durationTurns: 1,
          attackBuff: 0.30
        }
      ]
    }
  },

  // 승급 사다리 정의
  Promotions: {
    COMBAT: {
      id: "COMBAT",
      name: "전투 숙련 (Combat)",
      maxRank: 4,
      ranks: [
        { rank: 1, attackBonus: 0.05, hpBonus: 0.05, costGold: 200 },
        { rank: 2, attackBonus: 0.10, hpBonus: 0.10, costGold: 500 },
        { rank: 3, attackBonus: 0.18, hpBonus: 0.16, costGold: 1200 },
        { rank: 4, attackBonus: 0.28, hpBonus: 0.25, costGold: 3000 }
      ]
    },
    FIRST_STRIKE: {
      id: "FIRST_STRIKE",
      name: "선제공격 (First Strike)",
      maxRank: 4,
      ranks: [
        { rank: 1, firstStrikeChance: 0.15, costGold: 300 },
        { rank: 2, firstStrikeChance: 0.30, costGold: 800 },
        { rank: 3, firstStrikeChance: 0.50, costGold: 1800 },
        { rank: 4, firstStrikeChance: 0.75, costGold: 4000 }
      ]
    },
    WITHDRAWAL_RATE: {
      id: "WITHDRAWAL_RATE",
      name: "퇴각술 (Withdrawal Mastery)",
      maxRank: 2,
      ranks: [
        { rank: 1, baseWithdrawalBonus: 0.10, hpPreservedOnRetreat: 0.20, costGold: 600 },
        { rank: 2, baseWithdrawalBonus: 0.25, hpPreservedOnRetreat: 0.40, costGold: 1500 }
      ]
    },
    ANTIBULLET: {
      id: "ANTIBULLET",
      name: "방탄 외골격 (Antibullet Armor)",
      maxRank: 2,
      ranks: [
        { rank: 1, bulletDamageReduction: 0.25, costGold: 1000 },
        { rank: 2, bulletDamageReduction: 0.45, costGold: 2500 }
      ]
    },
    COLLATERAL_RESIST: {
      id: "COLLATERAL_RESIST",
      name: "폭압 저항 (Collateral Resistance)",
      maxRank: 2,
      ranks: [
        { rank: 1, collateralDamageReduction: 0.20, costGold: 400 },
        { rank: 2, collateralDamageReduction: 0.40, costGold: 1000 }
      ]
    }
  },

  // 3. 지휘관 패시브 스킬 트리 (12종)
  CommanderSkills: {
    BEAR_DOWN: {
      id: "BEAR_DOWN",
      name: "베어 다운",
      description: "첫 번째(선두) 유닛 공격력 +20%",
      effectValue: 0.20,
      appliesTo: "FIRST_DEPLOYED_UNIT"
    },
    PRECISION_STRIKE: {
      id: "PRECISION_STRIKE",
      name: "세밀한 타격",
      description: "선두 유닛이 적의 타일 방어 보너스 무시",
      effectValue: 1.00,
      appliesTo: "FIRST_DEPLOYED_UNIT"
    },
    BERSERK: {
      id: "BERSERK",
      name: "광폭화",
      description: "턴당 1회, 호감도 30 이하 전투 거부 상태를 무시하고 강제 공격 명령 수행",
      effectValue: 1,
      appliesTo: "SINGLE_COMMAND_PER_TURN"
    },
    ART_OF_WAR: {
      id: "ART_OF_WAR",
      name: "전투의 예술",
      description: "모든 아군 유닛 퇴각확률 +5%",
      effectValue: 0.05,
      appliesTo: "ALL_ALLY_UNITS"
    },
    SHIELD_WALL: {
      id: "SHIELD_WALL",
      name: "방패 장벽",
      description: "모든 아군 유닛 방어력 +15%",
      effectValue: 0.15,
      appliesTo: "ALL_ALLY_UNITS"
    },
    IRONCLAD: {
      id: "IRONCLAD",
      name: "철갑",
      description: "유입되는 2차 피해(Collateral Damage) 30% 경감",
      effectValue: 0.30,
      appliesTo: "ALL_ALLY_UNITS"
    },
    DEFENDER_LEADER: {
      id: "DEFENDER_LEADER",
      name: "수비의 리더",
      description: "승률 50% 미만 전투에 돌입하는 유닛에게 선제공격 Rank 2 부여",
      effectValue: 2,
      appliesTo: "UNITS_WITH_LOW_WIN_PROBABILITY"
    },
    TACTICAL_RETREAT: {
      id: "TACTICAL_RETREAT",
      name: "전략적 후퇴",
      description: "승률 30% 미만 극단적 열세 시 퇴각확률 +20%, 생존 시 최대 HP 50% 즉시 복구",
      effectValue: { withdrawalRateBonus: 0.20, survivalHpRestoreRatio: 0.50 },
      appliesTo: "UNITS_WITH_CRITICAL_WIN_RATE"
    },
    TECH_INNOVATION: {
      id: "TECH_INNOVATION",
      name: "기술 혁신",
      description: "유닛 영구 소멸 위기 시 100분마다 1회 응급 소생 (쿨다운: 100분/6000초)",
      cooldownMinutes: 100,
      appliesTo: "FIRST_FATAL_DEFEAT"
    },
    RAPID_ADVANCE: {
      id: "RAPID_ADVANCE",
      name: "신속한 진격",
      description: "이동 AP 소모량 50% 감소 (최소 1)",
      effectValue: 0.50,
      appliesTo: "ALL_MOVEMENT_ACTIONS"
    },
    COMMANDER_LEADERSHIP: {
      id: "COMMANDER_LEADERSHIP",
      name: "지휘자의 지도력",
      description: "승리 시 경험치 및 호감도 획득량 +30%",
      effectValue: 0.30,
      appliesTo: "POST_BATTLE_REWARDS"
    },
    STRATEGIC_DOMINANCE: {
      id: "STRATEGIC_DOMINANCE",
      name: "전략적 지배",
      description: "신규 모집/포획 유닛이 호감도 25에서 시작 (전투 거부 위험성 제거)",
      effectValue: 25,
      appliesTo: "NEWLY_RECRUITED_OR_CAPTURED_UNITS"
    }
  },

  // 4. 타일 시스템
  TileTypes: {
    PLAIN: {
      id: "PLAIN",
      name: "평지",
      size: "1x1",
      defenseBonus: 0.00,
      apCost: 1,
      consumesMaintenance: true,
      description: "엄폐물 없는 기본 이동 타일. 방어 보너스 0%, AP 1"
    },
    DEFENSIVE_TERRAIN: {
      id: "DEFENSIVE_TERRAIN",
      name: "방어 타일 (산/숲)",
      size: "1x1",
      defenseBonusMin: 0.20,
      defenseBonusMax: 0.40,
      apCost: 2,
      consumesMaintenance: true,
      description: "방어력 +20%~+40%, 이동 AP 2 소모 (기사는 지형 페널티로 효과 50% 감소)"
    },
    TOWN: {
      id: "TOWN",
      name: "마을",
      size: "1x1",
      defenseBonus: 0.15,
      apCost: 1,
      consumesMaintenance: false, // 유지비 0골드
      offlineProtection: {
        autoDefenseExempt: true,
        invulnerableState: true
      },
      description: "1x1 크기. 유지비 0, 로그아웃 시 무적/비활성화, 호감도 상점 운영",
      favorabilityShop: [
        { name: "특제 휴대 식량", favorabilityGain: 5, priceGold: 100 },
        { name: "고급 에일 맥주", favorabilityGain: 12, priceGold: 250 },
        { name: "무공 훈장", favorabilityGain: 30, priceGold: 700 }
      ]
    },
    CITY: {
      id: "CITY",
      name: "도시",
      size: "2x2",
      defenseBonus: 0.35,
      apCost: 1,
      consumesMaintenance: false, // 유지비 0골드
      offlineProtection: {
        autoDefenseExempt: true,
        invulnerableState: true
      },
      description: "2x2 크기. 유지비 0, 안전 오프라인, 불필요 유닛 매각 및 군학 코어 교환소",
      unitMarket: {
        sellRefundRate: 0.70,
        expCoreConversion: (level) => ({ count: level * 2, expPerCore: 150 })
      }
    },
    BLOCKADE_FRONT: {
      id: "BLOCKADE_FRONT",
      name: "포위망 / 전선",
      size: "DYNAMIC_ZONE",
      defenseBonus: 0.10,
      apCost: 2,
      consumesMaintenance: true,
      description: "동맹/적군 포위 전선. 1800초 이상 지속 시 도시 수비 방위부대 출격.",
      garrisonDefenseSystem: {
        siegeDurationThresholdSec: 1800,
        noPermanentLossPenalty: true, // 방위부대에 패배해도 유닛 영구 삭제 없음!
        penaltyExemptionRule: "방위부대 격퇴 시 포위 해제, 아군 패배 시에도 영구 유닛 삭제 없이 인접 타일 후퇴."
      }
    }
  },

  // 5. 핵심 판정 로직 함수 모음
  Formulas: {
    checkCombatRefusal: (unit, winRate, skills = []) => {
      if (skills.includes("BERSERK")) return { refusesToFight: false, reason: "광폭화 발동" };
      if (unit.favorability <= 30 && winRate < 0.30) {
        return { refusesToFight: true, reason: "호감도 30 이하 및 승률 30% 미만으로 전투 거부" };
      }
      return { refusesToFight: false, reason: "정상 전투 수행" };
    }
  }
};

// 브라우저 전역 바인딩
if (typeof window !== "undefined") {
  window.GameData = GameData;
}
`;
