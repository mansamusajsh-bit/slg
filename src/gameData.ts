/**
 * ============================================================================
 * [Web-SLG] Step 1: 핵심 데이터 구조 및 시스템 규칙 (Game Data Definitions)
 * ============================================================================
 * 
 * 본 파일은 세로형 턴제 모바일 Web-SLG 단일 파일(Single-File) 및 모듈형 환경 모두에서
 * 즉시 사용할 수 있도록 완벽하게 구조화된 프로덕션급 JavaScript/TypeScript 데이터 객체입니다.
 * 
 * 주요 포함 모듈:
 * 1. GameRules: 턴 제한, 시간 역행기(Rewinder), 오프라인 로그아웃 페널티 및 전멸 리셋 룰
 * 2. UnitClasses: 5대 병과(기사, 마법사, 근접, 활, 화기) 기본 스탯, 승급 래더, 라그나로크풍 스킬트리
 * 3. UnitInstanceTemplate: 호감도(전투 거부 기제), 선제 필드 스킬, 스킨 슬롯, 유지비 추적 스키마
 * 4. CommanderSkills: 12대 지휘관 패시브 스킬 트리 및 수치 계산 로직
 * 5. TileTypes: 타일 시스템 (평지, 산/숲, 1x1 마을, 2x2 도시, 포위망 전선 및 방위부대 기제)
 * 6. BattleFormulas: 호감도 거부 판정, 선제공격 우선권, 방탄/2차 피해, 퇴각 생존 공식
 */

export const GameData = {
  // ==========================================================================
  // 1. 게임 시스템 코어 룰 데이터 (Game System Core Rules Data)
  // ==========================================================================
  GameRules: {
    // ------------------------------------------------------------------------
    // 1-1. 턴 시간 제한 설정 (Turn Time Limit)
    // ------------------------------------------------------------------------
    turnTimeLimit: {
      baseDurationSec: 60,         // 기본 턴 제한 시간 (60초)
      warningThresholdSec: 15,     // 턴 종료 임박 경고 비프음/UI 플래시 시작 시간 (15초 전)
      overtimeBufferSec: 10,       // 지연 패널티 버퍼 시간 (10초)
      fastModeDurationSec: 30,     // 고속 교전 모드(PvP 랭크전 등) 적용 시 턴 시간 (30초)
      autoEndOnTimeout: true,      // 시간 초과 시 잔여 AP 자동 소멸 및 강제 턴 종료 여부
      timeoutPenalty: {
        skipAction: true,          // 행동 강제 스킵
        moraleDeduction: 2,        // 시간 초과로 인한 전 유닛 사기/호감도 감소치 (2pt)
      }
    },

    // ------------------------------------------------------------------------
    // 1-2. 시간 역행기 (Rewinder) 인벤토리 데이터 (유료/프리미엄 턴 되돌리기 아이템)
    // ------------------------------------------------------------------------
    rewinder: {
      itemId: "ITEM_TIME_REWINDER_CHRONOS",
      name: "크로노스의 모래시계 (Turn Rewinder)",
      description: "잘못된 전략 이동이나 참패한 교전 1턴 전으로 전황을 완벽히 복구합니다.",
      currentCount: 3,             // 현재 보유 수량
      maxCapacity: 10,             // 최대 보관 가능 수량
      costPerUse: 1,               // 1회 되돌리기 소모량
      maxDailyRewinds: 5,          // 24시간 내 최대 사용 한도 (과도한 리셋 방지)
      cooldownTurns: 3,            // 1회 사용 후 재사용 대기 턴 수 (3턴)
      rechargeRateHours: 8,        // 무료 충전 주기 (8시간당 1개 자연 충전, 최대 3개까지)
      freeRechargeCap: 3,          // 무료 자연 충전 상한선
      premiumGemPrice: 150,        // 유료 보석 즉시 구매 가격 (150 캐시)
      refundOnVictory: false,      // 되돌린 후 승리하더라도 아이템 반환 불가 정책
      canRewindPvP: false,         // 공정성을 위해 비동기/실시간 PvP에서는 사용 불가
    },

    // ------------------------------------------------------------------------
    // 1-3. 로그아웃 페널티 시스템 (Logout Penalty System)
    // ------------------------------------------------------------------------
    logoutPenalty: {
      // 로그아웃 시 필드 유닛은 자동 수비 모드로 전환 (마을/도시 주둔 유닛은 면제)
      autoDefenseMode: true,

      // 오프라인 수비전에서 유닛 손실 시 보호 비활성화 유예 시간 (3600초 = 1시간)
      // 연쇄 약탈을 막기 위해 패배한 거점/유닛에 1시간 동안 무적 보호막 또는 비활성화 상태 부여
      deactivationDurationSec: 3600,

      // 24시간(1일) 동안 오프라인 방어전에서 잃을 수 있는 최대 유닛 손실 한도
      // 24기 초과 손실 발생 시 당일 추가 기습 공격으로부터 강제 보호막 자동 전개
      maxDailyUnitLoss: 24,

      // 보유 유닛 전멸 시 게임 리셋 조건 (Reset Condition)
      // 모든 유닛을 잃으면 플레이어의 영지 진행도는 0으로 초기화되나, 지휘관 레벨 및 스킬은 보존됨
      resetCondition: {
        triggerOnZeroUnits: true,      // 총 유닛 수 0 도달 시 발동
        resetTerritoryProgress: true,  // 점령 영지, 점령 타일 점유권 초기화 (0으로 리셋)
        resetResourceStockpile: true,  // 필드 창고 자원 초기화 (기초 스타트 지원금으로 리롤)
        keepCommanderLevel: true,      // 지휘관 레벨(Commander Level) 영구 보존
        keepCommanderSkills: true,     // 지휘관 스킬 트리(Commander Skills) 투자 내역 보존
        keepPurchasedSkins: true,      // 구매한 프리미엄 스킨 및 코스메틱 영구 보존
        compensationUnits: [           // 전멸 리셋 후 제공되는 기본 스타터 팩
          { classId: "MELEE", count: 2, level: 1, name: "의용 보병" },
          { classId: "ARCHER", count: 1, level: 1, name: "초보 궁수" },
        ]
      }
    }
  },

  // ==========================================================================
  // 2. 유닛 클래스 및 기본 스탯 (Unit Classes & Stats)
  // ==========================================================================
  UnitClasses: {
    // ------------------------------------------------------------------------
    // 2-1. 기사 (KNIGHT): 최상위 기동/돌파 유닛, 필드 보스 파밍 전용
    // ------------------------------------------------------------------------
    KNIGHT: {
      id: "KNIGHT",
      name: "기사 (Knight)",
      role: "최정예 기동 돌격병",
      tier: "TOP_TIER",
      description: "압도적인 기동력과 돌파력을 갖춘 최고 티어 유닛. 험지 방어 보너스가 낮은 대신 2랭크에서 방탄(Antibullet) 패시브를 획득합니다. 필드 보스 격파를 통해서만 파밍 가능합니다.",
      acquisitionSource: "FIELD_BOSS_ONLY", // 필드 보스 전리품으로만 획득 가능
      baseStats: {
        hp: 480,                 // 기본 체력 (우수)
        attack: 88,              // 기본 공격력 (최상급)
        defense: 45,             // 기본 방어력 (상급)
        mobility: 5,             // 이동력 (5타일/AP - 최고 기동력)
        range: { min: 1, max: 1 },// 근접 1타일 사거리
        collateralDamage: 0.10,  // 충돌 돌격 시 2차 충격파 피해 (10%)
        tileDefensePenalty: 0.50,// 타일 방어 보너스 50% 삭감 페널티 (기마 특성상 숲/산 방어 효율 저조)
      },
      growthPerLevel: {
        hp: 38,
        attack: 7.5,
        defense: 4.0,
      },
      baseMaintenanceCost: 15,   // 필드 주둔 시 턴당 유지비 (15골드)
      innatePassives: [
        {
          id: "PASSIVE_KNIGHT_MOUNTED_CHARGE",
          name: "기마 돌격 (Mounted Charge)",
          description: "이동 후 바로 공격 시, 이동한 타일 1칸당 공격력 +4% 증가 (최대 +20%).",
          bonusPerTileMoved: 0.04,
          maxBonus: 0.20,
        },
        {
          id: "PASSIVE_KNIGHT_ANTIBULLET_RANK2",
          name: "방탄 마갑 (Antibullet Carapace - Rank 2)",
          description: "승급 2단계 해금. 화기(FIREARM) 유닛으로부터 받는 모든 원거리 피해를 40% 경감합니다.",
          requiredPromotionRank: 2,
          damageReductionVsFirearm: 0.40,
        }
      ],
      // 라그나로크 온라인(Ragnarok Online) 모티브의 검사/기사 계열 스킬 트리
      skillTree: [
        {
          id: "SKILL_KNIGHT_BASH",
          name: "배쉬 (Bash)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD", // 교전 충돌 직전 선제 필드 시전
          apCost: 2,
          cooldownTurns: 1,
          description: "전방 1타일 적에게 강력한 충격타를 가하여 180% 물리 피해를 입히고 20% 확률로 1턴간 스턴을 부여합니다.",
          damageMultiplier: 1.80,
          stunChance: 0.20,
          range: 1,
        },
        {
          id: "SKILL_KNIGHT_MAGNUM_BREAK",
          name: "매그넘 브레이크 (Magnum Break)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "자신 주변 8방향 모든 적에게 화속성 폭발 충격파를 일으켜 130% 피해를 입히고 1타일 밀쳐냅니다(넉백).",
          damageMultiplier: 1.30,
          knockbackTiles: 1,
          areaOfEffect: "SURROUNDING_8_TILES",
        },
        {
          id: "SKILL_KNIGHT_BOWLING_BASH",
          name: "볼링 배쉬 (Bowling Bash)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 4,
          cooldownTurns: 3,
          description: "목표 유닛을 강타하여 후방 연쇄 충돌을 발생시킵니다. 밀려난 유닛이 다른 유닛과 충돌 시 양측 모두 220% 피해.",
          damageMultiplier: 2.20,
          chainCollisionDamage: 1.50,
          range: 1,
        },
        {
          id: "SKILL_KNIGHT_TWO_HAND_QUICKEN",
          name: "투핸드 퀴큰 (Two-Hand Quicken)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 3,
          durationTurns: 2,
          description: "2턴간 공격 속도와 선제공격 우선도를 극한으로 끌어올려 선제 타격 확률을 +35% 증가시킵니다.",
          firstStrikeBonus: 0.35,
        }
      ]
    },

    // ------------------------------------------------------------------------
    // 2-2. 마법사 (MAGE): 광역 공성 및 2차 피해(Collateral Damage) 특화
    // ------------------------------------------------------------------------
    MAGE: {
      id: "MAGE",
      name: "마법사 (Mage)",
      role: "공성 파괴 및 광역 화력 유닛",
      tier: "STANDARD",
      description: "긴 사거리의 광역 마법과 강력한 공성 유닛. 인접 타일 및 동일 타일에 중첩된 적들에게 막대한 2차 피해(Collateral Damage)를 입힙니다.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 260,                 // 체력 (취약)
        attack: 94,              // 기본 마법 공격력 (최상)
        defense: 18,             // 기본 방어력 (매우 낮음)
        mobility: 2,             // 이동력 (2타일/AP - 둔중)
        range: { min: 2, max: 3 },// 2~3타일 장거리 사거리
        collateralDamage: 0.45,  // 목표 주변 인접 타일에 45%의 강력한 2차 연쇄 피해!
        siegeBonus: 0.60,        // 방벽 및 도시 구조물에 +60% 추가 공성 피해
      },
      growthPerLevel: {
        hp: 18,
        attack: 8.8,
        defense: 1.5,
      },
      baseMaintenanceCost: 12,
      innatePassives: [
        {
          id: "PASSIVE_MAGE_COLLATERAL_BURST",
          name: "연쇄 폭발 (Chain Resonation)",
          description: "목표 타일에 인접한 적 유닛 수만큼 2차 피해량이 +5%씩 증폭됩니다 (최대 +20%).",
          splashScalePerAdjacent: 0.05,
          maxBonus: 0.20,
        }
      ],
      // 라그나로크 온라인 모티브의 마법사 계열 스킬 트리
      skillTree: [
        {
          id: "SKILL_MAGE_FIRE_BOLT",
          name: "파이어 볼트 (Fire Bolt)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "연속적인 화염 화살 5연타를 발사하여 단일 대상에게 175%의 마법 피해를 입힙니다.",
          damageMultiplier: 1.75,
          range: 3,
        },
        {
          id: "SKILL_MAGE_SIGHTRASHER",
          name: "사이트래셔 (Sightrasher)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "자신을 호위하는 불꽃 구체를 사방으로 방출하여 접근하는 적 근접 유닛을 밀쳐내며 140% 피해를 입힙니다.",
          damageMultiplier: 1.40,
          knockbackTiles: 1,
          range: 1,
        },
        {
          id: "SKILL_MAGE_METEOR_STORM",
          name: "메테오 스톰 (Meteor Storm)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 4,
          cooldownTurns: 3,
          description: "지정 3x3 범위에 유성을 쏟아부어 중심부 200%, 주변부 70% 2차 피해 및 30% 확률 스턴을 부여합니다.",
          centerMultiplier: 2.00,
          splashMultiplier: 0.70,
          stunChance: 0.30,
          radiusTiles: 1, // 중심 기준 반경 1칸 (3x3)
          range: 3,
        },
        {
          id: "SKILL_MAGE_ENERGY_COAT",
          name: "에너지 코트 (Energy Coat)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 4,
          durationTurns: 2,
          description: "마력 보호막을 둘러 다음 2턴간 받는 물리 피해를 30% 흡수 경감합니다.",
          damageReduction: 0.30,
        }
      ]
    },

    // ------------------------------------------------------------------------
    // 2-3. 근접전투 (MELEE): 전방 탱커 및 균형 잡힌 근접 반격 딜러
    // ------------------------------------------------------------------------
    MELEE: {
      id: "MELEE",
      name: "근접전투 (Melee Infantry)",
      role: "전선 방어형 중장 보병 / 탱커",
      tier: "STANDARD",
      description: "전선의 척추 역할을 수행하는 표준 중장 보병. 높은 방어력과 지형 적응력을 가지며, 아군 원거리 유닛을 호위하기에 최적화되어 있습니다.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 420,                 // 기본 체력 (우수)
        attack: 62,              // 기본 공격력 (보통)
        defense: 52,             // 기본 방어력 (최고)
        mobility: 3,             // 이동력 (3타일/AP)
        range: { min: 1, max: 1 },// 근접 1타일
        collateralDamage: 0.05,  // 2차 피해 5%
        counterAttackBonus: 0.25,// 피격 시 반격 대미지 +25% 가산
      },
      growthPerLevel: {
        hp: 35,
        attack: 5.2,
        defense: 5.5,
      },
      baseMaintenanceCost: 8,
      innatePassives: [
        {
          id: "PASSIVE_MELEE_FORTIFY",
          name: "방진 구축 (Phalanx)",
          description: "방어 타일(산/숲/도시)에서 전투 시 받는 최종 피해가 추가로 15% 감소합니다.",
          defensiveTerrainBonus: 0.15,
        }
      ],
      // 라그나로크 온라인 모티브의 검사 전직/방어 계열 스킬 트리
      skillTree: [
        {
          id: "SKILL_MELEE_PROVOKE",
          name: "도발 (Provoke)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 2,
          description: "전방 2타일 내 적 1기를 도발하여 방어력을 20% 깎는 대신 대상의 분노를 유도합니다.",
          defenseDebuff: 0.20,
          range: 2,
        },
        {
          id: "SKILL_MELEE_ENDURE",
          name: "인듀어 (Endure)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 3,
          durationTurns: 2,
          description: "2턴간 마법 방어력을 +25 올리고 피격 경직 및 넉백을 완전히 무시합니다.",
          magicDefBonus: 25,
          ignoreKnockback: true,
        },
        {
          id: "SKILL_MELEE_SHIELD_CHARGE",
          name: "쉴드 차지 (Shield Charge)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 2,
          description: "방패로 돌진하여 130% 물리 피해를 주고 적을 2타일 밀어내며 진형을 와해시킵니다.",
          damageMultiplier: 1.30,
          knockbackTiles: 2,
          range: 1,
        },
        {
          id: "SKILL_MELEE_AUTO_COUNTER",
          name: "오토 카운터 (Auto Counter)",
          type: "STANCE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 2,
          description: "반격 태세를 취해 다음 근접 공격을 100% 회피하고 180% 확정 치명타 반격을 가합니다.",
          guaranteedDodge: true,
          counterCritMultiplier: 1.80,
        }
      ]
    },

    // ------------------------------------------------------------------------
    // 2-4. 활 (ARCHER): 원거리 곡사 물리 사격수
    // ------------------------------------------------------------------------
    ARCHER: {
      id: "ARCHER",
      name: "궁수 (Archer)",
      role: "곡사 원거리 물리 저격수",
      tier: "STANDARD",
      description: "곡사 궤적을 이용하여 장애물 뒤 적을 타격할 수 있는 원거리 사격수. 높은 명중률과 치명타율을 자랑합니다.",
      acquisitionSource: "STANDARD_BARRACKS",
      baseStats: {
        hp: 310,
        attack: 74,
        defense: 24,
        mobility: 3,
        range: { min: 2, max: 3 },// 2~3타일 곡사 사거리
        collateralDamage: 0.12,  // 2차 피해 12%
        critRate: 0.20,          // 기본 치명타 확률 20%
        canArcShot: true,        // 아군이나 장애물을 넘어서 사격 가능 (곡사)
      },
      growthPerLevel: {
        hp: 22,
        attack: 6.8,
        defense: 2.2,
      },
      baseMaintenanceCost: 9,
      innatePassives: [
        {
          id: "PASSIVE_ARCHER_EAGLE_EYE",
          name: "독수리의 눈 (Eagle Eye)",
          description: "고지대(산악 타일) 점령 시 사거리가 +1 타일 확장됩니다.",
          highGroundRangeBonus: 1,
        }
      ],
      // 라그나로크 온라인 모티브의 궁수 계열 스킬 트리
      skillTree: [
        {
          id: "SKILL_ARCHER_DOUBLE_STRAFE",
          name: "더블 스트레이핑 (Double Strafe)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "동시에 2발의 화살을 고속 발사하여 190%의 집중 관통 피해를 입힙니다.",
          damageMultiplier: 1.90,
          range: 3,
        },
        {
          id: "SKILL_ARCHER_ARROW_SHOWER",
          name: "애로우 샤워 (Arrow Shower)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "지정 타일과 주변 1칸 범위에 화살비를 쏟아 120% 피해를 입히고 주변 적들을 밀쳐냅니다.",
          damageMultiplier: 1.20,
          splashRadius: 1,
          knockbackTiles: 1,
          range: 3,
        },
        {
          id: "SKILL_ARCHER_CHARGE_ARROW",
          name: "차지 애로우 (Charge Arrow)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 2,
          description: "강하게 당긴 화살로 150% 피해를 입히고 목표를 3타일 뒤로 튕겨냅니다.",
          damageMultiplier: 1.50,
          knockbackTiles: 3,
          range: 3,
        },
        {
          id: "SKILL_ARCHER_IMPROVE_CONCENTRATION",
          name: "집중력 향상 (Improve Concentration)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 3,
          durationTurns: 3,
          description: "3턴간 명중률 +25%, 치명타율 +15%를 상승시킵니다.",
          accuracyBonus: 0.25,
          critBonus: 0.15,
        }
      ]
    },

    // ------------------------------------------------------------------------
    // 2-5. 화기 (FIREARM): 고화력 직사 물리 중화기병
    // ------------------------------------------------------------------------
    FIREARM: {
      id: "FIREARM",
      name: "화기병 (Firearm Battalion)",
      role: "직사 고화력 관통 중화기병",
      tier: "STANDARD",
      description: "직사 탄도를 가진 압도적 파괴력의 현대식 화기병. 방어구 관통력이 매우 뛰어나나, 기사(KNIGHT)의 방탄 패시브(Rank 2)에 직접적인 상성 카운터를 받습니다.",
      acquisitionSource: "TECH_LAB_WORKSHOP",
      baseStats: {
        hp: 340,
        attack: 96,              // 기본 공격력 매우 높음
        defense: 28,
        mobility: 2,             // 이동력 2 (무거움)
        range: { min: 2, max: 4 },// 2~4타일 긴 직사 사거리
        collateralDamage: 0.20,  // 2차 탄편 피해 20%
        armorPenetration: 0.35,  // 적 방어력의 35%를 무시하고 타격
        isBulletType: true,      // 기사의 방탄 패시브에 의해 대미지 40% 삭감되는 탄환 판정
      },
      growthPerLevel: {
        hp: 24,
        attack: 9.2,
        defense: 2.8,
      },
      baseMaintenanceCost: 14,
      innatePassives: [
        {
          id: "PASSIVE_FIREARM_DIRECT_FIRE",
          name: "직사 궤적 (Direct Fire Velocity)",
          description: "직선 경로상에 아군이나 산악 타일이 가로막을 경우 사격 불가 (위치 선정 필수).",
          requiresClearLineOfSight: true,
        }
      ],
      // 건슬링거/중화기병 모티브의 스킬 트리
      skillTree: [
        {
          id: "SKILL_FIREARM_GATLING_RUSH",
          name: "개틀링 러시 (Gatling Rush)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 3,
          cooldownTurns: 2,
          description: "전방 부채꼴 범위에 무차별 연사를 가하여 대상에게 210% 관통 피해를 입힙니다.",
          damageMultiplier: 2.10,
          range: 3,
        },
        {
          id: "SKILL_FIREARM_PIERCING_SHOT",
          name: "관통 탄환 (Piercing Shot)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 2,
          cooldownTurns: 1,
          description: "직선상 일렬로 늘어선 최대 3개 타일의 모든 적을 일거에 꿰뚫어 150% 피해를 줍니다.",
          damageMultiplier: 1.50,
          linearPenetrationDepth: 3,
          range: 4,
        },
        {
          id: "SKILL_FIREARM_BUNKER_BUSTER",
          name: "벙커 버스터 (Bunker Buster)",
          type: "ACTIVE",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 4,
          cooldownTurns: 3,
          description: "요새와 방어 타일에 매몰된 적을 폭격하여 타일 방어 보너스를 0%로 무력화시키고 180% 피해를 입힙니다.",
          nullifyTileDefense: true,
          damageMultiplier: 1.80,
          range: 4,
        },
        {
          id: "SKILL_FIREARM_OVERHEAT_VENT",
          name: "오버히트 벤트 (Overheat Vent)",
          type: "BUFF",
          castPhase: "PRE_COLLISION_FIELD",
          apCost: 1,
          cooldownTurns: 3,
          durationTurns: 1,
          description: "총열을 강제 냉각하여 이번 턴 공격력을 +30% 증폭시키고 넉백 면역을 얻습니다.",
          attackBuff: 0.30,
        }
      ]
    }
  },

  // ==========================================================================
  // 2-B. 유닛 승급 시스템 사다리 정의 (Unit Promotion Ladders)
  // ==========================================================================
  Promotions: {
    // 1. 전투 (Combat 1~4)
    COMBAT: {
      id: "COMBAT",
      name: "전투 숙련 (Combat)",
      maxRank: 4,
      ranks: [
        { rank: 1, name: "전투 I", attackBonus: 0.05, hpBonus: 0.05, costGold: 200 },
        { rank: 2, name: "전투 II", attackBonus: 0.10, hpBonus: 0.10, costGold: 500 },
        { rank: 3, name: "전투 III", attackBonus: 0.18, hpBonus: 0.16, costGold: 1200 },
        { rank: 4, name: "전투 IV (마스터)", attackBonus: 0.28, hpBonus: 0.25, costGold: 3000 },
      ]
    },
    // 2. 선제공격 (First Strike 1~4)
    FIRST_STRIKE: {
      id: "FIRST_STRIKE",
      name: "선제공격 (First Strike)",
      maxRank: 4,
      ranks: [
        { rank: 1, name: "선제타격 I", firstStrikeChance: 0.15, priorityWeight: 1, costGold: 300 },
        { rank: 2, name: "선제타격 II", firstStrikeChance: 0.30, priorityWeight: 2, costGold: 800 },
        { rank: 3, name: "선제타격 III", firstStrikeChance: 0.50, priorityWeight: 3, costGold: 1800 },
        { rank: 4, name: "신속의 극의 IV", firstStrikeChance: 0.75, priorityWeight: 4, costGold: 4000 },
      ]
    },
    // 3. 퇴각확률 (Withdrawal Rate 1~2)
    WITHDRAWAL_RATE: {
      id: "WITHDRAWAL_RATE",
      name: "퇴각술 (Withdrawal Mastery)",
      maxRank: 2,
      ranks: [
        { rank: 1, name: "전술 퇴각 I", baseWithdrawalBonus: 0.10, hpPreservedOnRetreat: 0.20, costGold: 600 },
        { rank: 2, name: "전술 퇴각 II", baseWithdrawalBonus: 0.25, hpPreservedOnRetreat: 0.40, costGold: 1500 },
      ]
    },
    // 4. 방탄 승급 (Antibullet 1~2) - 기사 특화 및 일반 보병 확장
    ANTIBULLET: {
      id: "ANTIBULLET",
      name: "방탄 외골격 (Antibullet Armor)",
      maxRank: 2,
      ranks: [
        { rank: 1, name: "방탄 I", bulletDamageReduction: 0.25, costGold: 1000 },
        { rank: 2, name: "방탄 II (완충)", bulletDamageReduction: 0.45, costGold: 2500 },
      ]
    },
    // 5. 2차 피해 내성 (Collateral Resistance 1~2)
    COLLATERAL_RESIST: {
      id: "COLLATERAL_RESIST",
      name: "폭압 저항 (Collateral Resistance)",
      maxRank: 2,
      ranks: [
        { rank: 1, name: "방호벽 I", collateralDamageReduction: 0.20, costGold: 400 },
        { rank: 2, name: "방호벽 II", collateralDamageReduction: 0.40, costGold: 1000 },
      ]
    }
  },

  // ==========================================================================
  // 2-C. 개별 유닛 인스턴스 팩토리 템플릿 (Unit Instance Tracking Schema)
  // ==========================================================================
  createUnitInstance: (customConfig: Record<string, any> = {}) => {
    const level = customConfig.level || 1;
    return {
      id: customConfig.id || `unit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: customConfig.name || "정예 기사 1번대",
      class: customConfig.class || "KNIGHT",   // KNIGHT | MAGE | MELEE | ARCHER | FIREARM
      level: level,                            // 동일 유닛 합성 및 전투 승리를 통해 성장
      exp: customConfig.exp || 0,
      maxExp: level * 100,                     // 레벨당 필요 경험치 공식: level * 100

      // 호감도 수치 (0 ~ 100)
      // 핵심 기제: 호감도가 30 이하(<= 30)일 때, 예상 승률이 30% 미만(< 30%)인 전투 명령에 불복종하고 거부함.
      favorability: customConfig.favorability !== undefined ? customConfig.favorability : 50,

      // 승급 현황 (Promotions)
      promotions: {
        combatRank: customConfig.promotions?.combatRank || 0,         // 0 ~ 4
        firstStrikeRank: customConfig.promotions?.firstStrikeRank || 0,// 0 ~ 4
        withdrawalRank: customConfig.promotions?.withdrawalRank || 0, // 0 ~ 2
        antibulletRank: customConfig.promotions?.antibulletRank || (customConfig.class === "KNIGHT" ? 1 : 0),
        collateralResistRank: customConfig.promotions?.collateralResistRank || 0,
      },

      // 활성화된 스킬 트리 및 선제 필드 시전(Pre-collision) 설정
      activeSkillSlot: customConfig.activeSkillSlot || "SKILL_KNIGHT_BASH",
      autoCastPreCollision: true, // 유닛 간 물리적 충돌 전 필드 선제 스킬 자동 발동 여부

      // 스킨 ID (성인/성숙 코스메틱 스킨 데이터 플레이스홀더)
      skinId: customConfig.skinId || "SKIN_DEFAULT_VALKYRIE",
      skinMetadata: {
        isMatureSkin: customConfig.isMatureSkin || false,
        censorshipFilter: true, // 기본 모바일 검열 필터 On
        thumbnailUrl: "/assets/skins/knight_default.webp",
      },

      // 주둔 상태 및 턴당 유지비 계산
      currentTileType: customConfig.currentTileType || "PLAIN", // PLAIN | DEFENSIVE_TERRAIN | TOWN | CITY | BLOCKADE_FRONT
      maintenanceCostPerTurn: customConfig.maintenanceCostPerTurn || 15,
      isExemptFromMaintenance: false, // TOWN 또는 CITY 주둔 시 true로 토글됨

      // 상태 플래그
      isDeactivated: false,           // 오프라인 방어전 패배 시 3600초간 비활성화
      deactivatedUntilTimestamp: null as number | null,// 비활성화 종료 시각 (UNIX Timestamp)
    };
  },

  // ==========================================================================
  // 3. 지휘관 패시브 스킬 트리 (Commander Passive Skills Tree - 12종)
  // ==========================================================================
  CommanderSkills: {
    // ------------------------------------------------------------------------
    // 1. BEAR_DOWN (베어 다운)
    // ------------------------------------------------------------------------
    BEAR_DOWN: {
      id: "BEAR_DOWN",
      name: "베어 다운 (Bear Down)",
      tier: 1,
      category: "OFFENSE",
      description: "돌격 대형의 첫 번째(선두) 유닛 공격력 +20%.",
      formulaKey: "FIRST_UNIT_ATTACK_BOOST",
      effectValue: 0.20,
      appliesTo: "FIRST_DEPLOYED_UNIT",
      logic: (unit, isFirstUnit) => {
        if (!isFirstUnit) return { attackMultiplier: 1.0 };
        return { attackMultiplier: 1.20, log: "베어 다운 발동: 선두 유닛 공격력 +20%" };
      }
    },

    // ------------------------------------------------------------------------
    // 2. PRECISION_STRIKE (세밀한 타격)
    // ------------------------------------------------------------------------
    PRECISION_STRIKE: {
      id: "PRECISION_STRIKE",
      name: "세밀한 타격 (Precision Strike)",
      tier: 1,
      category: "OFFENSE",
      description: "선두 유닛이 적의 타일 방어 보너스(산/숲/도시)를 100% 무시하고 공격합니다.",
      formulaKey: "IGNORE_ENEMY_TILE_DEFENSE",
      effectValue: 1.00, // 100% 무시
      appliesTo: "FIRST_DEPLOYED_UNIT",
      logic: (isFirstUnit, targetTileDefBonus) => {
        if (!isFirstUnit) return { effectiveTileDefBonus: targetTileDefBonus };
        return { effectiveTileDefBonus: 0.0, log: "세밀한 타격 발동: 적 타일 방어 보너스 무시" };
      }
    },

    // ------------------------------------------------------------------------
    // 3. BERSERK (광폭화)
    // ------------------------------------------------------------------------
    BERSERK: {
      id: "BERSERK",
      name: "광폭화 (Berserk)",
      tier: 2,
      category: "MORALE",
      description: "턴당 1회, 호감도가 30 이하이거나 승률이 30% 미만이어도 전투 거부를 무시하고 강제 공격 명령을 수행합니다.",
      formulaKey: "OVERRIDE_FAVORABILITY_REFUSAL",
      effectValue: 1, // 1회 강제 지휘권
      appliesTo: "SINGLE_COMMAND_PER_TURN",
      logic: (unitFavorability, winRate, berserkChargesLeft) => {
        const wouldRefuse = unitFavorability <= 30 && winRate < 0.30;
        if (wouldRefuse && berserkChargesLeft > 0) {
          return { canAttack: true, consumedBerserk: true, log: "광폭화 발동: 호감도 거부를 극복하고 강제 진격!" };
        }
        return { canAttack: !wouldRefuse, consumedBerserk: false };
      }
    },

    // ------------------------------------------------------------------------
    // 4. ART_OF_WAR (전투의 예술)
    // ------------------------------------------------------------------------
    ART_OF_WAR: {
      id: "ART_OF_WAR",
      name: "전투의 예술 (Art of War)",
      tier: 1,
      category: "SURVIVAL",
      description: "전장에 투입된 모든 아군 유닛의 기본 퇴각확률(Withdrawal Rate) +5%.",
      formulaKey: "GLOBAL_WITHDRAWAL_RATE_BOOST",
      effectValue: 0.05,
      appliesTo: "ALL_ALLY_UNITS",
      logic: (baseWithdrawalRate) => {
        return { modifiedWithdrawalRate: baseWithdrawalRate + 0.05, log: "전투의 예술: 전 유닛 퇴각확률 +5%" };
      }
    },

    // ------------------------------------------------------------------------
    // 5. SHIELD_WALL (방패 장벽)
    // ------------------------------------------------------------------------
    SHIELD_WALL: {
      id: "SHIELD_WALL",
      name: "방패 장벽 (Shield Wall)",
      tier: 2,
      category: "DEFENSE",
      description: "모든 아군 유닛의 방어력 +15%.",
      formulaKey: "GLOBAL_DEFENSE_BOOST",
      effectValue: 0.15,
      appliesTo: "ALL_ALLY_UNITS",
      logic: (baseDefense) => {
        return { modifiedDefense: Math.round(baseDefense * 1.15), log: "방패 장벽: 전 유닛 방어력 +15%" };
      }
    },

    // ------------------------------------------------------------------------
    // 6. IRONCLAD (철갑)
    // ------------------------------------------------------------------------
    IRONCLAD: {
      id: "IRONCLAD",
      name: "철갑 (Ironclad)",
      tier: 2,
      category: "DEFENSE",
      description: "마법사나 포격 등으로 인해 유입되는 2차 피해(Collateral Damage)를 30% 경감합니다.",
      formulaKey: "COLLATERAL_DAMAGE_REDUCTION",
      effectValue: 0.30,
      appliesTo: "ALL_ALLY_UNITS",
      logic: (incomingCollateralDamage) => {
        return {
          finalCollateralDamage: Math.round(incomingCollateralDamage * 0.70),
          log: "철갑 발동: 2차 스플래시 피해 30% 흡수 경감"
        };
      }
    },

    // ------------------------------------------------------------------------
    // 7. DEFENDER_LEADER (수비의 리더)
    // ------------------------------------------------------------------------
    DEFENDER_LEADER: {
      id: "DEFENDER_LEADER",
      name: "수비의 리더 (Defender Leader)",
      tier: 3,
      category: "TACTICS",
      description: "예상 승률이 50% 미만인 열세 전투에 돌입하는 유닛에게 '선제공격 2단계(First Strike Rank 2)' 효과를 임시 부여합니다.",
      formulaKey: "UNDERDOG_FIRST_STRIKE",
      effectValue: 2, // Rank 2 선제타격
      appliesTo: "UNITS_WITH_LOW_WIN_PROBABILITY",
      logic: (winRate, currentFirstStrikeRank) => {
        if (winRate < 0.50) {
          const effectiveRank = Math.max(currentFirstStrikeRank, 2);
          return {
            firstStrikeRank: effectiveRank,
            grantedBonus: true,
            log: "수비의 리더 발동: 승률 50% 미만 열세로 선제공격 Rank 2 부여"
          };
        }
        return { firstStrikeRank: currentFirstStrikeRank, grantedBonus: false };
      }
    },

    // ------------------------------------------------------------------------
    // 8. TACTICAL_RETREAT (전략적 후퇴)
    // ------------------------------------------------------------------------
    TACTICAL_RETREAT: {
      id: "TACTICAL_RETREAT",
      name: "전략적 후퇴 (Tactical Retreat)",
      tier: 3,
      category: "SURVIVAL",
      description: "예상 승률 30% 미만인 극단적 열세 상황에서 퇴각확률 +20% 추가. 퇴각 성공 생존 시 최대 HP의 50%를 즉시 복구합니다.",
      formulaKey: "CRITICAL_RETREAT_HEAL",
      effectValue: { withdrawalRateBonus: 0.20, survivalHpRestoreRatio: 0.50 },
      appliesTo: "UNITS_WITH_CRITICAL_WIN_RATE",
      logic: (winRate, baseWithdrawalRate, maxHp) => {
        if (winRate < 0.30) {
          return {
            boostedWithdrawalRate: baseWithdrawalRate + 0.20,
            restoredHpOnSurvival: Math.round(maxHp * 0.50),
            log: "전략적 후퇴 발동: 퇴각률 +20% 가산 및 생존 시 HP 50% 회복 보장"
          };
        }
        return { boostedWithdrawalRate: baseWithdrawalRate, restoredHpOnSurvival: 0 };
      }
    },

    // ------------------------------------------------------------------------
    // 9. TECH_INNOVATION (기술 혁신)
    // ------------------------------------------------------------------------
    TECH_INNOVATION: {
      id: "TECH_INNOVATION",
      name: "기술 혁신 (Tech Innovation)",
      tier: 4,
      category: "SPECIAL",
      description: "유닛이 영구 소멸(사망/영구 삭제) 위기에 처했을 때, 100분(6000초)마다 1회 응급 소생하여 소멸을 방지합니다.",
      formulaKey: "DEATH_PREVENTION_COOLDOWN",
      cooldownMinutes: 100, // 100분 재사용 대기시간
      cooldownSeconds: 6000,
      appliesTo: "FIRST_FATAL_DEFEAT",
      logic: (isFatalDamage, lastUsedTimestamp, currentTimestamp) => {
        const cooldownElapsed = (currentTimestamp - lastUsedTimestamp) >= 6000;
        if (isFatalDamage && cooldownElapsed) {
          return {
            rescuedFromDeath: true,
            newLastUsedTimestamp: currentTimestamp,
            survivedHp: 1, // 최소 1 HP로 생환
            log: "기술 혁신 발동: 긴급 양자 구조망으로 유닛의 영구 사망/삭제를 방어했습니다! (재사용 대기: 100분)"
          };
        }
        return { rescuedFromDeath: false };
      }
    },

    // ------------------------------------------------------------------------
    // 10. RAPID_ADVANCE (신속한 진격)
    // ------------------------------------------------------------------------
    RAPID_ADVANCE: {
      id: "RAPID_ADVANCE",
      name: "신속한 진격 (Rapid Advance)",
      tier: 3,
      category: "MOBILITY",
      description: "모든 지형 이동 시 소모되는 AP(Action Point) 비용이 50% 감소합니다 (최소 소모 AP 1, 반올림 적용).",
      formulaKey: "AP_COST_HALVED",
      effectValue: 0.50, // 50% 감소
      appliesTo: "ALL_MOVEMENT_ACTIONS",
      logic: (baseApCost) => {
        const reducedCost = Math.max(1, Math.round(baseApCost * 0.50));
        return { finalApCost: reducedCost, log: `신속한 진격: 이동 AP ${baseApCost} -> ${reducedCost}` };
      }
    },

    // ------------------------------------------------------------------------
    // 11. COMMANDER_LEADERSHIP (지휘자의 지도력)
    // ------------------------------------------------------------------------
    COMMANDER_LEADERSHIP: {
      id: "COMMANDER_LEADERSHIP",
      name: "지휘자의 지도력 (Commander Leadership)",
      tier: 2,
      category: "GROWTH",
      description: "교전 승리 시 획득하는 경험치(EXP) 및 승리 유닛의 호감도(Favorability) 획득량이 +30% 증폭됩니다.",
      formulaKey: "VICTORY_REWARD_BOOST",
      effectValue: 0.30,
      appliesTo: "POST_BATTLE_REWARDS",
      logic: (earnedExp, earnedFavorability) => {
        return {
          boostedExp: Math.round(earnedExp * 1.30),
          boostedFavorability: Math.round(earnedFavorability * 1.30),
          log: "지휘자의 지도력: 승리 경험치 및 호감도 보너스 +30%"
        };
      }
    },

    // ------------------------------------------------------------------------
    // 12. STRATEGIC_DOMINANCE (전략적 지배)
    // ------------------------------------------------------------------------
    STRATEGIC_DOMINANCE: {
      id: "STRATEGIC_DOMINANCE",
      name: "전략적 지배 (Strategic Dominance)",
      tier: 4,
      category: "RECRUITMENT",
      description: "신규 모집(소환)되거나 전장에서 포획된 모든 유닛이 호감도 0 대신 기본 호감도 25에서 시작합니다.",
      formulaKey: "STARTING_FAVORABILITY_FLOOR",
      effectValue: 25,
      appliesTo: "NEWLY_RECRUITED_OR_CAPTURED_UNITS",
      logic: (incomingInitialFavorability = 0) => {
        return {
          finalInitialFavorability: Math.max(incomingInitialFavorability, 25),
          log: "전략적 지배: 신규 유닛 초기 호감도 25 즉시 적용 (전투 거부 위험성 제거)"
        };
      }
    }
  },

  // ==========================================================================
  // 4. 타일 시스템 (Tile System & Grid Properties)
  // ==========================================================================
  TileTypes: {
    // ------------------------------------------------------------------------
    // 4-1. 평지 (PLAIN): 기본 이동 타일
    // ------------------------------------------------------------------------
    PLAIN: {
      id: "PLAIN",
      name: "평지 (Plain)",
      size: "1x1",
      defenseBonus: 0.00,       // 방어 보너스 0%
      apCost: 1,                // 진입 AP 소모량 1
      isUrban: false,
      consumesMaintenance: true,// 필드 유지비 발생
      description: "엄폐물이 없는 평탄한 지형. 방어 보너스가 없으며 이동 속도가 가장 빠릅니다.",
      colorCode: "#86efac",     // Tailwind emerald-300
    },

    // ------------------------------------------------------------------------
    // 4-2. 방어 타일 - 산/숲 (DEFENSIVE_TERRAIN): 지형 엄폐 및 방어력 증가
    // ------------------------------------------------------------------------
    DEFENSIVE_TERRAIN: {
      id: "DEFENSIVE_TERRAIN",
      name: "방어 타일 - 산/숲 (Defensive Terrain: Mountain/Forest)",
      size: "1x1",
      defenseBonusMin: 0.20,    // 지형에 따른 방어 보너스 +20% ~ +40%
      defenseBonusMax: 0.40,
      apCost: 2,                // 험지 이동 AP 소모량 2
      isUrban: false,
      consumesMaintenance: true,
      description: "산악 및 울창한 수목 지대. 이동에 2 AP가 소모되나 주둔 유닛에게 +20%~+40% 방어력 보너스를 제공합니다. (기사는 지형 페널티로 효과 반감)",
      colorCode: "#15803d",     // Tailwind green-700
      subTypes: {
        FOREST: { name: "깊은 숲", defenseBonus: 0.20, apCost: 2 },
        MOUNTAIN: { name: "험준한 산악", defenseBonus: 0.40, apCost: 2 },
      }
    },

    // ------------------------------------------------------------------------
    // 4-3. 마을 (TOWN): 1x1 소규모 안전 지대 및 호감도 상점
    // ------------------------------------------------------------------------
    TOWN: {
      id: "TOWN",
      name: "마을 / 마름 (Town)",
      size: "1x1",
      defenseBonus: 0.15,
      apCost: 1,
      isUrban: true,
      consumesMaintenance: false, // 마을 내부 주둔 시 유닛 유지비 0골드!
      offlineProtection: {
        autoDefenseExempt: true,   // 오프라인 강제 방어전 면제
        invulnerableState: true,   // 안전 비활성화 무적 상태 돌입
        description: "로그아웃 시 주둔 유닛은 비활성화 무적 상태로 진입하여 오프라인 기습 피해를 입지 않습니다.",
      },
      description: "1x1 크기의 정착지. 주둔 유닛의 턴당 유지비가 0으로 면제되며, 호감도 상승 아이템을 거래할 수 있는 상점이 위치합니다.",
      colorCode: "#38bdf8",       // Tailwind sky-400
      favorabilityShop: {
        name: "마을 잡화상점",
        items: [
          { id: "ITEM_RATION_FEAST", name: "특제 휴대 식량", favorabilityGain: 5, priceGold: 100 },
          { id: "ITEM_VINTAGE_ALE", name: "고급 에일 맥주", favorabilityGain: 12, priceGold: 250 },
          { id: "ITEM_HERO_MEDAL", name: "무공 훈장", favorabilityGain: 30, priceGold: 700 },
        ]
      }
    },

    // ------------------------------------------------------------------------
    // 4-4. 도시 (CITY): 2x2 거대 전략 요새 및 유닛 해체/거래소
    // ------------------------------------------------------------------------
    CITY: {
      id: "CITY",
      name: "대도시 / 거점 요새 (City)",
      size: "2x2",              // 4칸을 점유하는 2x2 메가 타일
      gridSpan: { width: 2, height: 2 },
      defenseBonus: 0.35,       // 강력한 성벽 방어 보너스 +35%
      apCost: 1,
      isUrban: true,
      consumesMaintenance: false, // 대도시 내부 주둔 시 유지비 완전 면제
      offlineProtection: {
        autoDefenseExempt: true,
        invulnerableState: true,
        description: "철통같은 요새 방어로 인해 로그아웃 상태에서 완벽한 안전이 보장됩니다.",
      },
      description: "2x2 크기의 거대 요새 도시. 유지비가 면제되며, 불필요한 유닛을 매각/분해하여 다른 주력 유닛을 레벨업시키는 자금과 경험치 코어를 환급받을 수 있습니다.",
      colorCode: "#f59e0b",     // Tailwind amber-500
      unitMarket: {
        name: "도시 군무국 (Unit Dismantle & Exchange)",
        sellRefundRate: 0.70,   // 유닛 가치의 70% 골드 환급
        expCoreConversion: (unitLevel) => {
          // 레벨에 비례한 경험치 강화 코어 반환 수량 공식
          return {
            coreItem: "ITEM_MILITARY_TACTICS_CORE",
            count: Math.max(1, unitLevel * 2),
            expYieldPerCore: 150,
          };
        }
      }
    },

    // ------------------------------------------------------------------------
    // 4-5. 포위망 / 전선 (BLOCKADE_FRONT): 동맹 포위망 및 방위부대 기제
    // ------------------------------------------------------------------------
    BLOCKADE_FRONT: {
      id: "BLOCKADE_FRONT",
      name: "포위망 / 전선 (Blockade Frontline)",
      size: "DYNAMIC_ZONE",
      defenseBonus: 0.10,
      apCost: 2,
      isUrban: false,
      consumesMaintenance: true,
      description: "플레이어 또는 AI 동맹군이 적 거점을 둘러싸 형성한 포위망 전선. 도시가 포위된 채 일정 시간 방치될 경우 자동 거점 방위부대(Garrison Defense Forces)가 출격합니다.",
      colorCode: "#ef4444",       // Tailwind red-500
      garrisonDefenseSystem: {
        siegeDurationThresholdSec: 1800, // 1800초 (30분) 동안 포위 상태 미해결 시 발동
        triggerCondition: "CITY_BLOCKADED_OVER_DURATION",
        garrisonForcesName: "도시 수비 방위부대 (City Garrison Forces)",
        garrisonSpawnStatsMultiplier: 1.25, // 표준 유닛 대비 125% 강화 수비병력
        noPermanentLossPenalty: true,       // 중요 룰: 방위부대와의 전투에서 패배하더라도 유닛 영구 삭제/소멸 페널티 면제!
        penaltyExemptionRule: "방위부대 격퇴 시 거점 포위가 해제되며, 아군 패배 시에도 영구 유닛 손실 없이 인접 아군 타일로 긴급 후퇴 처리됨."
      }
    }
  },

  // ==========================================================================
  // 5. 종합 전투 및 상태 판정 공식 모음 (Battle & Calculation Engine Helper)
  // ==========================================================================
  Formulas: {
    // ------------------------------------------------------------------------
    // 5-1. 호감도 전투 거부 판정 공식 (Favorability Combat Refusal Check)
    // ------------------------------------------------------------------------
    checkCombatRefusal: (unit, predictedWinRate, commanderSkillsActive = []) => {
      // BERSERK(광폭화) 스킬 활성화 여부 확인
      const hasBerserk = commanderSkillsActive.includes("BERSERK");
      if (hasBerserk) {
        return {
          refusesToFight: false,
          reason: "지휘관 패시브 [광폭화]로 인해 호감도 거부 상태가 강제 해제되었습니다.",
        };
      }

      // 룰: 호감도 <= 30 이고, 승률 < 30%(0.30) 일 때 전투 거부
      const isLowFavorability = unit.favorability <= 30;
      const isLowWinRate = predictedWinRate < 0.30;

      if (isLowFavorability && isLowWinRate) {
        return {
          refusesToFight: true,
          reason: `호감도 저하(현재: ${unit.favorability}/100 <= 30) 및 열세 승률(${Math.round(predictedWinRate * 100)}% < 30%)로 인해 유닛이 출격을 거부합니다!`,
        };
      }

      return {
        refusesToFight: false,
        reason: "유닛이 정상적으로 전투 명령을 수행합니다.",
      };
    },

    // ------------------------------------------------------------------------
    // 5-2. 선제공격 우선권 판정 (First Strike Resolution)
    // ------------------------------------------------------------------------
    calculateFirstStrikePriority: (attackerUnit, defenderUnit, predictedWinRate, commanderSkillsActive = []) => {
      let attackerRank = attackerUnit.promotions.firstStrikeRank || 0;
      let defenderRank = defenderUnit.promotions.firstStrikeRank || 0;

      // 수비의 리더 (DEFENDER_LEADER): 승률 50% 미만 시 선제타격 Rank 2 부여
      if (commanderSkillsActive.includes("DEFENDER_LEADER") && predictedWinRate < 0.50) {
        attackerRank = Math.max(attackerRank, 2);
      }

      const attackerChance = attackerRank > 0 ? (attackerRank * 0.18 + 0.10) : 0;
      const defenderChance = defenderRank > 0 ? (defenderRank * 0.18 + 0.10) : 0;

      return {
        attackerRank,
        defenderRank,
        attackerChance: Math.min(1.0, attackerChance),
        defenderChance: Math.min(1.0, defenderChance),
      };
    },

    // ------------------------------------------------------------------------
    // 5-3. 방탄 및 2차 피해 감소 계산 (Antibullet & Collateral Damage Formula)
    // ------------------------------------------------------------------------
    calculateIncomingDamage: (attacker, defender, rawDamage, isCollateral = false, commanderSkillsActive = []) => {
      let finalDamage = rawDamage;
      const logs = [];

      // 1. 방탄(Antibullet) 기제: 화기(FIREARM) 공격자가 기사(KNIGHT) 또는 방탄 승급자를 타격할 때
      if (attacker.class === "FIREARM") {
        if (defender.class === "KNIGHT" && defender.promotions.antibulletRank >= 1) {
          const reduction = defender.promotions.antibulletRank >= 2 ? 0.45 : 0.25;
          finalDamage *= (1 - reduction);
          logs.push(`방탄 마갑(Antibullet) 발동: 화기 피해 ${Math.round(reduction * 100)}% 삭감`);
        }
      }

      // 2. 2차 피해(Collateral Damage) 및 IRONCLAD(철갑) 스킬 기제
      if (isCollateral) {
        let collateralReduction = 0;
        if (commanderSkillsActive.includes("IRONCLAD")) {
          collateralReduction += 0.30;
          logs.push("지휘관 스킬 [철갑]: 2차 피해 30% 흡수");
        }
        if (defender.promotions.collateralResistRank > 0) {
          const promoBonus = defender.promotions.collateralResistRank * 0.20;
          collateralReduction += promoBonus;
          logs.push(`승급 [방호벽]: 2차 피해 ${Math.round(promoBonus * 100)}% 추가 경감`);
        }
        finalDamage *= (1 - Math.min(0.85, collateralReduction));
      }

      return {
        finalDamage: Math.max(1, Math.round(finalDamage)),
        logs,
      };
    },

    // ------------------------------------------------------------------------
    // 5-4. 유지비 발생 여부 계산 (Maintenance Exemption Check)
    // ------------------------------------------------------------------------
    calculateUnitMaintenance: (unit, currentTile) => {
      // 마을(TOWN) 또는 도시(CITY) 내부 주둔 시 비용 0골드
      if (currentTile.id === "TOWN" || currentTile.id === "CITY") {
        return {
          cost: 0,
          isExempt: true,
          reason: `${currentTile.name} 주둔 중으로 유지비 완전 면제 (0 Gold)`,
        };
      }
      return {
        cost: unit.maintenanceCostPerTurn,
        isExempt: false,
        reason: `야전 필드(${currentTile.name}) 전개 중: 턴당 ${unit.maintenanceCostPerTurn} Gold 소모`,
      };
    }
  }
};

// CommonJS 및 Vanilla HTML/JS 환경에서도 전역 바인딩 가능하도록 처리
if (typeof window !== "undefined") {
  (window as any).GameData = GameData;
}

export default GameData;
