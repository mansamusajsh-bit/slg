/**
 * ============================================================================
 * [Web-SLG] Phase 4 Core Engine:
 * 마을/도시 경제, 유지비, 지휘관 스킬 트리 및 비동기 로그아웃 방어 시스템
 * ============================================================================
 * 
 * [시스템 메커니즘 및 조건 상세 구현]
 * 1. 유닛 유지비 및 상태 관리 (Turn Economy):
 *    - 턴 종료(process_turn_upkeep): 필드 타일 유닛 유지비(Gold) 차감, 마을(1x1)·도시(2x2) 유지비 0G 면제
 *    - 재화 부족 시 부족분 유닛 '비활성화(isInactivated)' 전환 (전투·이동 불가, 영구 사망 아님)
 *    - 도시 유닛 매각(sell_unit_in_city): 도시 타일 내에서만 호출 가능, 레벨·클래스·호감도 기반 골드 환급 및 영구 삭제
 * 
 * 2. 비동기 로그아웃 방어 모드 (Offline Defense & Loss Handling):
 *    - 안전지대(마을/도시) 로그아웃: 유닛 '공격 불가 보호 상태(SAFE_PROTECTED)'
 *    - 필드(일반 타일) 로그아웃: 해당 위치에서 '강제 방어 모드(OFFLINE_DEFENSE)' 노출
 *    - 비동기 피격 패배 시:
 *      * 지형 방어 보너스 적용
 *      * 전원 영구 사망(Permadeath) 방지
 *      * 수탈 로직: 가장 전투력이 낮은 유닛 1개만 사망 및 공격자에게 소유권 이전(귀속)
 *      * 패널티: 피격 지휘관 부대 1시간(60분=3600초) 비활성화 타이머 부여 (연쇄 약탈 방지)
 *      * 24시간 누적 전멸 시 지휘관 레벨/스킬 제외 초기화
 * 
 * 3. 지휘관 스킬 트리 (CommanderSkillTreeManager):
 *    - 공격형: Bear Down -> Berserk -> Art of War, Precision Strike
 *    - 방어형: Shield Wall -> Ironclad -> Defender's Leader -> Tactical Retreat
 *    - 유틸형: Tech Innovation (100분 쿨타임 사망 1회 구제), Rapid Advance (-50% AP),
 *             Commander's Leadership (+30% EXP/호감도), Strategic Dominance (포섭 유닛 호감도 25 지정)
 */

// ============================================================================
// 1. 데이터 구조 정의 (Data Structures / Interfaces / Types)
// ============================================================================

export type UnitClass = 'KNIGHT' | 'MAGE' | 'MELEE' | 'ARCHER' | 'FIREARM';

export type TileType = 'PLAIN' | 'ROUGH' | 'FOREST' | 'HILL' | 'VILLAGE' | 'CITY';

export interface PromotionsState {
  combatRank: number;         // 0 ~ 4 (전투 숙련)
  firstStrikeRank: number;    // 0 ~ 4 (선제공격)
  withdrawalRank: number;     // 0 ~ 2 (퇴각술)
  antibulletRank: number;     // 0 ~ 2 (방탄 외골격)
  collateralResistRank: number;// 0 ~ 2 (폭압 저항)
}

export interface Tile {
  id: string;
  x: number;
  y: number;
  type: TileType;
  name: string;
  defenseBonus: number;       // 예: PLAIN 0.0, ROUGH 0.15, FOREST 0.25, HILL 0.35, VILLAGE 0.20, CITY 0.40
  isSafeZone: boolean;        // VILLAGE, CITY는 true (유지비 0G 면제, 안전 로그아웃)
  isCity: boolean;            // CITY (2x2) 여부 -> 유닛 매각 가능 여부 결정
  cityGroupId?: string;       // 2x2 도시 클러스터 ID
}

export interface Unit {
  id: string;
  name: string;
  ownerId: string;
  unitClass: UnitClass;
  level: number;
  exp: number;
  maxExp: number;
  favorability: number;       // 0 ~ 100 (호감도)
  promotions: PromotionsState;
  hp: number;
  maxHp: number;
  attackPower: number;
  defensePower: number;
  baseAP: number;
  currentAP: number;
  upkeepCost: number;         // 일반 필드 턴당 유지비 (Gold)
  isInactivated: boolean;     // 유지비 부족 시 비활성화 (전투/이동 불가, 영구 사망 아님)
  isDead: boolean;            // 영구 사망 여부
  isSafe: boolean;            // 마을/도시 주둔 시 안전 상태
  isOfflineDefenseMode: boolean; // 오프라인 필드 강제 방어 모드
  currentTile: { x: number; y: number };
  capturedFromPlayerId?: string; // 수탈당해 이전된 소유권 기록
  imageUrl?: string;
}

// 지휘관 스킬 식별자 열거형
export type CommanderSkillId =
  // 공격형 (Offensive)
  | 'BEAR_DOWN'           // 첫 유닛 공격력 +20%
  | 'BERSERK'             // 호감도 무시 공격
  | 'ART_OF_WAR'          // 모든 유닛 퇴각확률 +5%
  | 'PRECISION_STRIKE'    // 첫 유닛 공격 시 적 지형 방어 보너스 1개 무시
  // 방어형 (Defensive)
  | 'SHIELD_WALL'         // 모든 아군 방어력 +15%
  | 'IRONCLAD'            // 2차 피해 30% 감소
  | 'DEFENDER_LEADER'     // 전투승률 < 50% 유닛에게 선제공격 2회 승급
  | 'TACTICAL_RETREAT'    // 전투승률 < 30% 유닛에게 퇴각확률 20% 부여, 생존 시 HP 50% 회복
  // 유틸형 (Utility)
  | 'TECH_INNOVATION'     // 100분 쿨타임, 패배 시 유닛 영구 삭제 1회 구제
  | 'RAPID_ADVANCE'       // 이동력 소모 -50%
  | 'COMMANDER_LEADERSHIP'// 전투 승리 시 EXP 및 호감도 +30%
  | 'STRATEGIC_DOMINANCE';// 포섭 유닛 초기 호감도 25 지정

export interface SkillNodeInfo {
  id: CommanderSkillId;
  name: string;
  category: 'OFFENSIVE' | 'DEFENSIVE' | 'UTILITY';
  tier: number;
  costSP: number;
  prerequisite?: CommanderSkillId; // 선행 필수 스킬
  description: string;
}

export interface Commander {
  id: string;
  name: string;
  level: number;
  skillPoints: number;
  unlockedSkills: Record<CommanderSkillId, boolean>;
  cooldowns: {
    techInnovationLastUsedTimestamp: number; // 초 단위 (Epoch sec)
  };
  deactivationTimerEndTimestamp: number | null; // 피격 패널티 종료 시각 (Epoch sec)
  isCommanderDisabled: boolean;
}

export interface Player {
  id: string;
  name: string;
  gold: number;
  commander: Commander;
  units: Unit[];
  isOnline: boolean;
  offlineStatus: {
    mode: 'SAFE_PROTECTED' | 'OFFLINE_DEFENSE';
    logoutTimestamp: number;
    lastLootedTimestamp: number | null;
    dailyLootedUnitsCount: number; // 24시간 내 수탈된 유닛 수
  };
  turn: number;
}

// ----------------------------------------------------------------------------
// 결과 반환 인터페이스
// ----------------------------------------------------------------------------
export interface UpkeepProcessResult {
  success: boolean;
  totalUnitsCount: number;
  fieldUnitsCount: number;
  safeUnitsCount: number;
  totalUpkeepNeeded: number;
  goldDeducted: number;
  remainingGold: number;
  activeCount: number;
  inactivatedCount: number;
  newlyInactivatedUnits: Unit[];
  logs: string[];
}

export interface UnitSaleResult {
  success: boolean;
  reason?: string;
  refundGold: number;
  unitId?: string;
  unitName?: string;
  remainingGold?: number;
  calculationBreakdown?: {
    baseClassGold: number;
    levelMultiplier: number;
    favorabilityBonus: number;
    promotionsValue: number;
    total: number;
  };
  logs: string[];
}

export interface OfflineAttackResult {
  success: boolean;
  battleResult: 'DEFENDER_WON' | 'ATTACKER_WON';
  defendingPlayerId: string;
  attackingPlayerId: string;
  lootedUnit: Unit | null;
  rescuedByTechInnovation: boolean;
  penaltyDeactivationSeconds: number;
  penaltyTimerEndTimestamp: number | null;
  isTerritoryResetTriggered: boolean;
  logs: string[];
}

// ============================================================================
// 2. 지휘관 스킬 트리 매니저 (CommanderSkillTreeManager)
// ============================================================================

export class CommanderSkillTreeManager {
  // 스킬 트리 정의 메타데이터 (부모 선행 관계 및 SP 비용)
  public static readonly SKILL_NODES: Record<CommanderSkillId, SkillNodeInfo> = {
    // 공격형 (Offensive)
    BEAR_DOWN: {
      id: 'BEAR_DOWN',
      name: '베어 다운 (Bear Down)',
      category: 'OFFENSIVE',
      tier: 1,
      costSP: 1,
      description: '첫 유닛 공격력 +20% 증가'
    },
    BERSERK: {
      id: 'BERSERK',
      name: '광폭화 (Berserk)',
      category: 'OFFENSIVE',
      tier: 2,
      costSP: 1,
      prerequisite: 'BEAR_DOWN',
      description: '호감도 30 이하 및 저승률 상태에서도 전투 거부를 무시하고 강제 공격'
    },
    ART_OF_WAR: {
      id: 'ART_OF_WAR',
      name: '전투의 예술 (Art of War)',
      category: 'OFFENSIVE',
      tier: 3,
      costSP: 1,
      prerequisite: 'BERSERK',
      description: '모든 아군 유닛의 기본 퇴각확률 +5% 증가'
    },
    PRECISION_STRIKE: {
      id: 'PRECISION_STRIKE',
      name: '세밀한 타격 (Precision Strike)',
      category: 'OFFENSIVE',
      tier: 1,
      costSP: 1,
      description: '첫 유닛 공격 시 적 지형 방어 보너스 1개(100%) 무시'
    },

    // 방어형 (Defensive)
    SHIELD_WALL: {
      id: 'SHIELD_WALL',
      name: '방패 장벽 (Shield Wall)',
      category: 'DEFENSIVE',
      tier: 1,
      costSP: 1,
      description: '모든 아군 유닛의 방어력 +15% 증가'
    },
    IRONCLAD: {
      id: 'IRONCLAD',
      name: '철갑 (Ironclad)',
      category: 'DEFENSIVE',
      tier: 2,
      costSP: 1,
      prerequisite: 'SHIELD_WALL',
      description: '유입되는 2차 스플래시 피해(Collateral Damage) 30% 감소'
    },
    DEFENDER_LEADER: {
      id: 'DEFENDER_LEADER',
      name: '수비의 리더 (Defender Leader)',
      category: 'DEFENSIVE',
      tier: 3,
      costSP: 1,
      prerequisite: 'IRONCLAD',
      description: '예상 전투 승률 50% 미만 유닛에게 선제공격 2회(Rank 2) 승급 임시 부여'
    },
    TACTICAL_RETREAT: {
      id: 'TACTICAL_RETREAT',
      name: '전략적 후퇴 (Tactical Retreat)',
      category: 'DEFENSIVE',
      tier: 4,
      costSP: 1,
      prerequisite: 'DEFENDER_LEADER',
      description: '전투 승률 30% 미만 유닛에게 퇴각확률 20% 추가 부여, 생존 시 HP 50% 즉시 회복'
    },

    // 유틸형 (Utility)
    TECH_INNOVATION: {
      id: 'TECH_INNOVATION',
      name: '기술 혁신 (Tech Innovation)',
      category: 'UTILITY',
      tier: 1,
      costSP: 1,
      description: '100분(6000초) 쿨타임, 패배/피격 시 유닛 영구 삭제 1회 긴급 구제'
    },
    RAPID_ADVANCE: {
      id: 'RAPID_ADVANCE',
      name: '신속한 진격 (Rapid Advance)',
      category: 'UTILITY',
      tier: 1,
      costSP: 1,
      description: '지형 이동 시 소모되는 AP 포인트 -50% 할인'
    },
    COMMANDER_LEADERSHIP: {
      id: 'COMMANDER_LEADERSHIP',
      name: '지휘자의 지도력 (Commander Leadership)',
      category: 'UTILITY',
      tier: 2,
      costSP: 1,
      prerequisite: 'RAPID_ADVANCE',
      description: '전투 승리 시 EXP 및 호감도 획득량 +30% 증폭'
    },
    STRATEGIC_DOMINANCE: {
      id: 'STRATEGIC_DOMINANCE',
      name: '전략적 지배 (Strategic Dominance)',
      category: 'UTILITY',
      tier: 3,
      costSP: 1,
      prerequisite: 'COMMANDER_LEADERSHIP',
      description: '포섭/수탈/모집 유닛 초기 호감도를 0이 아닌 25로 고정 지정'
    }
  };

  /**
   * 스킬 해금 가능 여부 사전 검증
   */
  public static canUnlockSkill(
    commander: Commander,
    skillId: CommanderSkillId
  ): { canUnlock: boolean; reason?: string } {
    const node = this.SKILL_NODES[skillId];
    if (!node) {
      return { canUnlock: false, reason: '존재하지 않는 스킬입니다.' };
    }

    // 1. 이미 해금되었는지 체크
    if (commander.unlockedSkills[skillId]) {
      return { canUnlock: false, reason: '이미 해금 완료된 스킬입니다.' };
    }

    // 2. 스킬 포인트 보유 여부 체크
    if (commander.skillPoints < node.costSP) {
      return { canUnlock: false, reason: `스킬 포인트가 부족합니다. (필요: ${node.costSP} SP, 보유: ${commander.skillPoints} SP)` };
    }

    // 3. 선행 필수 스킬(Prerequisite) 해금 체크
    if (node.prerequisite) {
      const parentUnlocked = commander.unlockedSkills[node.prerequisite];
      if (!parentUnlocked) {
        const parentName = this.SKILL_NODES[node.prerequisite].name;
        return {
          canUnlock: false,
          reason: `선행 스킬 [${parentName}]을(를) 먼저 해금해야 합니다.`
        };
      }
    }

    return { canUnlock: true };
  }

  /**
   * 스킬 해금 실행 함수
   */
  public static unlockSkill(
    commander: Commander,
    skillId: CommanderSkillId
  ): { success: boolean; message: string } {
    const check = this.canUnlockSkill(commander, skillId);
    if (!check.canUnlock) {
      return { success: false, message: check.reason || '해금 실패' };
    }

    const node = this.SKILL_NODES[skillId];
    commander.skillPoints -= node.costSP;
    commander.unlockedSkills[skillId] = true;

    return {
      success: true,
      message: `지휘관 패시브 스킬 [${node.name}] 해금 완료! (잔여 SP: ${commander.skillPoints})`
    };
  }

  // --------------------------------------------------------------------------
  // 전투 및 계산 로직 패시브 효과 반영 함수군
  // --------------------------------------------------------------------------

  /**
   * 공격 시 지휘관 스킬 반영 (공격력 및 적 지형 보너스 무시)
   */
  public static applyOffensiveSkills(
    commander: Commander,
    attackerUnit: Unit,
    isFirstUnit: boolean,
    targetTileDefBonus: number
  ): {
    attackPower: number;
    effectiveTileDefBonus: number;
    bonusLogs: string[];
  } {
    let finalAtk = attackerUnit.attackPower;
    let finalTileDef = targetTileDefBonus;
    const bonusLogs: string[] = [];

    // 1. Bear Down (첫 유닛 공격력 +20%)
    if (commander.unlockedSkills.BEAR_DOWN && isFirstUnit) {
      const bonus = Math.round(attackerUnit.attackPower * 0.20);
      finalAtk += bonus;
      bonusLogs.push(`[Bear Down] 선두 유닛 공격력 +20% 적용 (+${bonus} ATK)`);
    }

    // 2. Precision Strike (첫 유닛 공격 시 적 지형 방어 보너스 1개 무시)
    if (commander.unlockedSkills.PRECISION_STRIKE && isFirstUnit && targetTileDefBonus > 0) {
      finalTileDef = 0;
      bonusLogs.push(`[Precision Strike] 적 지형 방어 보너스(${Math.round(targetTileDefBonus * 100)}%)를 100% 무력화!`);
    }

    return { attackPower: finalAtk, effectiveTileDefBonus: finalTileDef, bonusLogs };
  }

  /**
   * 방어 시 지휘관 스킬 반영 (방어력, 2차 피해 감소, 선제공격 및 퇴각율 증폭)
   */
  public static applyDefensiveSkills(
    commander: Commander,
    defenderUnit: Unit,
    estimatedWinRate: number,
    incomingCollateralDamage: number = 0
  ): {
    defensePower: number;
    reducedCollateralDamage: number;
    grantedFirstStrikeRank: number;
    tacticalWithdrawalBonus: number;
    canHealOnWithdrawal: boolean;
    bonusLogs: string[];
  } {
    let finalDef = defenderUnit.defensePower;
    let finalCollateral = incomingCollateralDamage;
    let grantedFS = defenderUnit.promotions.firstStrikeRank;
    let extraRetreatRate = 0;
    let canHeal = false;
    const bonusLogs: string[] = [];

    // 1. Shield Wall (모든 아군 방어력 +15%)
    if (commander.unlockedSkills.SHIELD_WALL) {
      const bonus = Math.round(defenderUnit.defensePower * 0.15);
      finalDef += bonus;
      bonusLogs.push(`[Shield Wall] 모든 아군 방어력 +15% 적용 (+${bonus} DEF)`);
    }

    // 2. Ironclad (2차 피해 30% 감소)
    if (commander.unlockedSkills.IRONCLAD && incomingCollateralDamage > 0) {
      finalCollateral = Math.round(incomingCollateralDamage * 0.70);
      bonusLogs.push(`[Ironclad] 스플래시 2차 피해 30% 흡수 경감 (${incomingCollateralDamage} -> ${finalCollateral})`);
    }

    // 3. Defender's Leader (전투승률 < 50% 유닛에게 선제공격 2회 승급)
    if (commander.unlockedSkills.DEFENDER_LEADER && estimatedWinRate < 0.50) {
      grantedFS = Math.max(grantedFS, 2);
      bonusLogs.push(`[Defender's Leader] 예상 승률 열세(${Math.round(estimatedWinRate * 100)}% < 50%)로 선제공격 Rank 2(2회) 임시 부여!`);
    }

    // 4. Tactical Retreat (전투승률 < 30% 유닛에게 퇴각확률 20% 부여, 생존 시 HP 50% 회복)
    if (commander.unlockedSkills.TACTICAL_RETREAT && estimatedWinRate < 0.30) {
      extraRetreatRate = 0.20;
      canHeal = true;
      bonusLogs.push(`[Tactical Retreat] 극단적 열세(${Math.round(estimatedWinRate * 100)}% < 30%)로 퇴각률 +20% 추가 및 생존 시 HP 50% 복구 권한 활성화`);
    }

    return {
      defensePower: finalDef,
      reducedCollateralDamage: finalCollateral,
      grantedFirstStrikeRank: grantedFS,
      tacticalWithdrawalBonus: extraRetreatRate,
      canHealOnWithdrawal: canHeal,
      bonusLogs
    };
  }

  /**
   * 기술 혁신 (Tech Innovation) 100분 쿨타임 사망 구제 판정
   */
  public static tryRescueFromPermadeath(
    commander: Commander,
    currentTimestampSec: number
  ): { rescued: boolean; log?: string } {
    if (!commander.unlockedSkills.TECH_INNOVATION) {
      return { rescued: false };
    }

    const elapsed = currentTimestampSec - commander.cooldowns.techInnovationLastUsedTimestamp;
    const cooldownPeriodSec = 100 * 60; // 100분 = 6000초

    if (elapsed >= cooldownPeriodSec) {
      // 쿨타임 충족 -> 구제 성공
      commander.cooldowns.techInnovationLastUsedTimestamp = currentTimestampSec;
      return {
        rescued: true,
        log: `[Tech Innovation] 지휘관 기술 혁신 발동! 100분 주기 긴급 양자 구조망으로 유닛의 영구 사망/삭제를 1회 완벽 구제했습니다.`
      };
    }

    const remainingMin = Math.ceil((cooldownPeriodSec - elapsed) / 60);
    return {
      rescued: false,
      log: `[Tech Innovation] 재사용 대기 중 (${remainingMin}분 남음). 구제 불가.`
    };
  }
}

// ============================================================================
// 3. 유닛 유지비 및 상태 관리 함수 구현 (Turn Economy)
// ============================================================================

/**
 * 1. process_turn_upkeep(player, tilesMap)
 * 턴 종료 시 타일 위치를 판별하여 유지비를 차감하고, 골드 부족 시 유닛을 '비활성화' 상태로 전환합니다.
 * 
 * 조건:
 * - 필드(일반 타일)에 위치한 모든 유닛은 턴 종료 시 일정 유지비(Gold)를 소모.
 * - 마을(1x1) 및 도시(2x2) 타일에 위치한 유닛은 유지비 소모량 0 (완전 면제).
 * - 보유 재화 부족 시 부족한 만큼의 유닛이 '비활성화(isInactivated)' 상태로 전환 (전투/이동 불가, 영구 사망 아님).
 */
export function process_turn_upkeep(
  player: Player,
  tilesMap?: Record<string, Tile>
): UpkeepProcessResult {
  const logs: string[] = [];
  logs.push(`=== [제 ${player.turn}턴 유지비 정산 시작] (보유 골드: ${player.gold}G) ===`);

  const livingUnits = player.units.filter((u) => !u.isDead);
  let totalUpkeepNeeded = 0;
  let fieldUnitsCount = 0;
  let safeUnitsCount = 0;

  // 1. 각 유닛의 현재 타일 위치 확인 및 안전 상태 갱신
  const fieldUnits: Unit[] = [];

  for (const unit of livingUnits) {
    const tileKey = `${unit.currentTile.x},${unit.currentTile.y}`;
    const tile = tilesMap ? tilesMap[tileKey] : null;

    // 타일이 마을(VILLAGE) 또는 도시(CITY)인 경우 안전지대 판정
    const isSafe = tile ? tile.isSafeZone : unit.isSafe;

    if (isSafe) {
      unit.isSafe = true;
      unit.isInactivated = false; // 안전지대 입성 시 비활성화 해제 복구
      safeUnitsCount++;
      // 마을/도시 유닛은 유지비 0
    } else {
      unit.isSafe = false;
      fieldUnitsCount++;
      totalUpkeepNeeded += unit.upkeepCost;
      fieldUnits.push(unit);
    }
  }

  logs.push(`총 주둔 유닛: ${livingUnits.length}기 (안전지대: ${safeUnitsCount}기, 야외 필드: ${fieldUnitsCount}기)`);
  logs.push(`필드 유닛 유지비 총 청구액: ${totalUpkeepNeeded}G`);

  const newlyInactivatedUnits: Unit[] = [];
  let goldDeducted = 0;

  // 2. 골드 지불 가능 여부 판정
  if (player.gold >= totalUpkeepNeeded) {
    // 골드 전액 납부 가능
    player.gold -= totalUpkeepNeeded;
    goldDeducted = totalUpkeepNeeded;
    fieldUnits.forEach((u) => {
      u.isInactivated = false; // 정상 유지
    });
    logs.push(`✅ 유지비 ${totalUpkeepNeeded}G 전액 결제 완료. 모든 유닛이 정상 작전 가능 상태를 유지합니다. (잔여 골드: ${player.gold}G)`);
  } else {
    // 골드 부족: 부족한 만큼의 유닛을 비활성화(isInactivated = true) 전환
    logs.push(`⚠️ 골드 부족 경보! (청구: ${totalUpkeepNeeded}G > 보유: ${player.gold}G)`);

    // 보유 골드로 감당 가능한 유닛 수 계산 (우선순위: 레벨이 높은 정예 유닛 우선 유지)
    fieldUnits.sort((a, b) => b.level - a.level); // 높은 레벨부터 정렬

    let availableGold = player.gold;
    let paidCount = 0;

    for (const unit of fieldUnits) {
      if (availableGold >= unit.upkeepCost) {
        availableGold -= unit.upkeepCost;
        goldDeducted += unit.upkeepCost;
        unit.isInactivated = false;
        paidCount++;
      } else {
        // 골드가 부족하여 유지비를 내지 못함 -> 비활성화 전환
        unit.isInactivated = true;
        newlyInactivatedUnits.push(unit);
        logs.push(`❌ [유지비 체납 비활성화] ${unit.name} (Lv.${unit.level} ${unit.unitClass}) -> 전투 및 이동 정지!`);
      }
    }

    player.gold = availableGold;
    logs.push(`결제 완료 유닛: ${paidCount}기 (${goldDeducted}G 차감), 체납 비활성화: ${newlyInactivatedUnits.length}기 (잔여 골드: ${player.gold}G)`);
  }

  // 턴 종료 후 AP 재충전 (비활성화 유닛은 AP 0)
  for (const unit of livingUnits) {
    if (unit.isInactivated) {
      unit.currentAP = 0;
    } else {
      unit.currentAP = unit.baseAP;
    }
  }

  player.turn += 1;

  return {
    success: true,
    totalUnitsCount: livingUnits.length,
    fieldUnitsCount,
    safeUnitsCount,
    totalUpkeepNeeded,
    goldDeducted,
    remainingGold: player.gold,
    activeCount: livingUnits.length - newlyInactivatedUnits.length,
    inactivatedCount: newlyInactivatedUnits.length,
    newlyInactivatedUnits,
    logs
  };
}

/**
 * 2. sell_unit_in_city(player, unit_id, tile)
 * 도시 타일 내에서 유닛을 매각하여 레벨, 클래스, 호감도를 계산해 골드를 환급하고 영구 삭제합니다.
 * 
 * 조건:
 * - 도시(2x2) 타일 내에서만 호출 가능.
 * - 유닛의 레벨, 클래스, 호감도를 정밀 계산하여 환급 골드 산출.
 * - 매각 완료 시 유닛 데이터에서 영구 삭제.
 */
export function sell_unit_in_city(
  player: Player,
  unit_id: string,
  tile: Tile
): UnitSaleResult {
  const logs: string[] = [];

  // 검증 1: 타일이 도시(CITY)인지 확인
  if (tile.type !== 'CITY' && !tile.isCity) {
    const errorMsg = `도시 타일이 아닌 [${tile.name}]에서는 유닛을 매각할 수 없습니다. (도시 2x2 타일 필수)`;
    logs.push(`❌ 매각 실패: ${errorMsg}`);
    return {
      success: false,
      reason: errorMsg,
      refundGold: 0,
      logs
    };
  }

  // 검증 2: 유닛 검색
  const unitIndex = player.units.findIndex((u) => u.id === unit_id && !u.isDead);
  if (unitIndex === -1) {
    const errorMsg = `해당 유닛(ID: ${unit_id})을 플레이어 부대 목록에서 찾을 수 없습니다.`;
    logs.push(`❌ 매각 실패: ${errorMsg}`);
    return {
      success: false,
      reason: errorMsg,
      refundGold: 0,
      logs
    };
  }

  const unit = player.units[unitIndex];

  // 검증 3: 유닛이 실제 해당 도시 타일에 주둔해 있는지 확인
  if (unit.currentTile.x !== tile.x || unit.currentTile.y !== tile.y) {
    const errorMsg = `유닛 [${unit.name}]이(가) 현재 도시 (${tile.x}, ${tile.y})에 위치하지 않습니다.`;
    logs.push(`❌ 매각 실패: ${errorMsg}`);
    return {
      success: false,
      reason: errorMsg,
      refundGold: 0,
      logs
    };
  }

  // --------------------------------------------------------------------------
  // 환급 재화(Gold) 산출 공식:
  // 1. 기본 클래스 베이스 가격
  //    - KNIGHT: 300G, MAGE: 250G, FIREARM: 220G, ARCHER: 180G, MELEE: 150G
  // 2. 레벨 배율 (Level Multiplier): 1 + (level - 1) * 0.35
  // 3. 호감도 보너스 (Favorability): favorability * 2.5 (충성도가 높을수록 고액 퇴역금/위로금 환원)
  // 4. 승급 가산치 (Promotions): 각 랭크당 50G
  // --------------------------------------------------------------------------
  const baseClassGoldMap: Record<UnitClass, number> = {
    KNIGHT: 300,
    MAGE: 250,
    FIREARM: 220,
    ARCHER: 180,
    MELEE: 150
  };

  const baseClassGold = baseClassGoldMap[unit.unitClass] || 150;
  const levelMultiplier = 1 + (unit.level - 1) * 0.35;
  const favorabilityBonus = Math.round(unit.favorability * 2.5);

  const totalPromotionRanks =
    unit.promotions.combatRank +
    unit.promotions.firstStrikeRank +
    unit.promotions.withdrawalRank +
    unit.promotions.antibulletRank +
    unit.promotions.collateralResistRank;
  const promotionsValue = totalPromotionRanks * 50;

  const totalRefund = Math.round(baseClassGold * levelMultiplier + favorabilityBonus + promotionsValue);

  // 유닛 데이터에서 영구 삭제
  player.units.splice(unitIndex, 1);

  // 골드 지급
  player.gold += totalRefund;

  logs.push(`🏛️ [도시 유닛 매각 완료] ${unit.name} (Lv.${unit.level} ${unit.unitClass})`);
  logs.push(`   - 기본 병과 가치: ${baseClassGold}G (레벨 배율: x${levelMultiplier.toFixed(2)})`);
  logs.push(`   - 호감도 환산 보너스: +${favorabilityBonus}G (호감도: ${unit.favorability}pt)`);
  logs.push(`   - 승급 랭크 누적 보너스: +${promotionsValue}G (${totalPromotionRanks}단계)`);
  logs.push(`💰 총 환급 골드: +${totalRefund}G 획득! (현재 총 골드: ${player.gold}G)`);

  return {
    success: true,
    refundGold: totalRefund,
    unitId: unit.id,
    unitName: unit.name,
    remainingGold: player.gold,
    calculationBreakdown: {
      baseClassGold,
      levelMultiplier,
      favorabilityBonus,
      promotionsValue,
      total: totalRefund
    },
    logs
  };
}

// ============================================================================
// 4. 비동기 로그아웃 방어 모드 및 수탈 로직 구현 (Offline Defense)
// ============================================================================

/**
 * 유닛의 종합 전투력(Combat Power) 산출 함수
 * - 공격력, 방어력, HP, 레벨, 승급 수치를 종합하여 최약 유닛 선별에 활용
 */
export function calculate_unit_combat_power(unit: Unit): number {
  if (unit.isDead) return -1;
  const statScore = unit.attackPower * 1.5 + unit.defensePower * 1.2 + unit.hp * 0.5;
  const rankScore =
    (unit.promotions.combatRank +
      unit.promotions.firstStrikeRank +
      unit.promotions.withdrawalRank +
      unit.promotions.antibulletRank +
      unit.promotions.collateralResistRank) * 20;
  const levelScore = unit.level * 30;

  return Math.round(statScore + rankScore + levelScore);
}

/**
 * 플레이어 로그아웃 시 방어 상태 설정
 * - 안전지대(마을/도시) 유닛: '공격 불가 보호 상태' (SAFE_PROTECTED)
 * - 필드 유닛: '강제 방어 모드' (OFFLINE_DEFENSE) 노출
 */
export function set_player_offline_state(
  player: Player,
  tilesMap?: Record<string, Tile>,
  currentTimestampSec: number = Math.floor(Date.now() / 1000)
): { mode: 'SAFE_PROTECTED' | 'OFFLINE_DEFENSE'; exposedUnitsCount: number; logs: string[] } {
  player.isOnline = false;
  player.offlineStatus.logoutTimestamp = currentTimestampSec;

  const logs: string[] = [];
  let exposedUnitsCount = 0;

  for (const unit of player.units.filter((u) => !u.isDead)) {
    const tileKey = `${unit.currentTile.x},${unit.currentTile.y}`;
    const tile = tilesMap ? tilesMap[tileKey] : null;
    const isSafe = tile ? tile.isSafeZone : unit.isSafe;

    if (isSafe) {
      unit.isSafe = true;
      unit.isOfflineDefenseMode = false;
    } else {
      unit.isSafe = false;
      unit.isOfflineDefenseMode = true;
      exposedUnitsCount++;
    }
  }

  if (exposedUnitsCount === 0) {
    player.offlineStatus.mode = 'SAFE_PROTECTED';
    logs.push(`🏰 [안전 로그아웃] 모든 유닛이 마을/도시에 주둔 중입니다. 공격 불가 보호 상태(SAFE_PROTECTED) 활성화.`);
  } else {
    player.offlineStatus.mode = 'OFFLINE_DEFENSE';
    logs.push(`⚠️ [필드 로그아웃] 야외에 노출된 ${exposedUnitsCount}기의 유닛이 강제 방어 모드(OFFLINE_DEFENSE)로 전환되어 기습에 노출됩니다.`);
  }

  return { mode: player.offlineStatus.mode, exposedUnitsCount, logs };
}

/**
 * 3. handle_offline_attack(defending_player, attacking_player, attack_result, target_tile, current_timestamp)
 * 비동기 공격 피격 시 패배 판정 및 최약 유닛 1개 수탈, 지휘관 부대 1시간 비활성화 패널티 수행
 * 
 * 조건:
 * - 지형 방어 보너스가 수비 측에 적용됨.
 * - 전투에서 패배하더라도 수비측 유닛 전체가 영구 사망(Permadeath)하지 않음.
 * - 수탈 로직: 수비 플레이어의 유닛 중 '가장 전투력이 낮은 유닛 1개'만 사망 처리 및 공격 플레이어에게 소유권 이전(귀속).
 * - 패널티: 수탈당한 지휘관 부대는 1시간(60분=3600초) 동안 '비활성화 및 공격 불가 상태'로 변경됨.
 * - 24시간 동안 지속 공격받아 전멸 시 지휘관 레벨/스킬 제외 초기화.
 */
export function handle_offline_attack(
  defending_player: Player,
  attacking_player: Player,
  attack_result: { defenderWon: boolean; damageDealtToDefender?: number },
  target_tile?: Tile,
  current_timestamp: number = Math.floor(Date.now() / 1000)
): OfflineAttackResult {
  const logs: string[] = [];
  logs.push(`⚔️ [비동기 오프라인 침공 발생] 방어자: ${defending_player.name} vs 공격자: ${attacking_player.name}`);

  // 1. 방어자 지형 보너스 기록
  const tileBonus = target_tile ? target_tile.defenseBonus : 0;
  if (tileBonus > 0) {
    logs.push(`🛡️ 수비측 지형 방어 보너스 +${Math.round(tileBonus * 100)}% 적용 완료 (${target_tile?.name})`);
  }

  // Case A: 수비 플레이어가 방어에 성공한 경우
  if (attack_result.defenderWon) {
    logs.push(`🎉 [수비 성공!] 방어자 ${defending_player.name}의 요새화된 진형이 공격자의 기습을 격퇴했습니다! 유닛 손실 없음.`);
    return {
      success: true,
      battleResult: 'DEFENDER_WON',
      defendingPlayerId: defending_player.id,
      attackingPlayerId: attacking_player.id,
      lootedUnit: null,
      rescuedByTechInnovation: false,
      penaltyDeactivationSeconds: 0,
      penaltyTimerEndTimestamp: null,
      isTerritoryResetTriggered: false,
      logs
    };
  }

  // Case B: 수비 플레이어가 패배한 경우 (Looting & 1-Hour Penalty Trigger)
  logs.push(`💥 [수비 패배] 공격자 ${attacking_player.name}의 돌파로 방어선이 무너졌습니다!`);

  const livingDefenderUnits = defending_player.units.filter((u) => !u.isDead);

  // 전멸 상태 확인
  if (livingDefenderUnits.length === 0) {
    logs.push(`⚠️ 수비측에 이미 생존 유닛이 없습니다.`);
    return {
      success: true,
      battleResult: 'ATTACKER_WON',
      defendingPlayerId: defending_player.id,
      attackingPlayerId: attacking_player.id,
      lootedUnit: null,
      rescuedByTechInnovation: false,
      penaltyDeactivationSeconds: 0,
      penaltyTimerEndTimestamp: null,
      isTerritoryResetTriggered: false,
      logs
    };
  }

  // 2. 수탈 대상 선별: '가장 전투력이 낮은 유닛 1개' (Lowest Combat Power)
  let weakestUnit = livingDefenderUnits[0];
  let lowestPower = calculate_unit_combat_power(weakestUnit);

  for (let i = 1; i < livingDefenderUnits.length; i++) {
    const power = calculate_unit_combat_power(livingDefenderUnits[i]);
    if (power < lowestPower) {
      lowestPower = power;
      weakestUnit = livingDefenderUnits[i];
    }
  }

  logs.push(`🔍 수비 부대 전투력 분석: 최약체 유닛 선별 -> [${weakestUnit.name}] (전투력: ${lowestPower}pt, Lv.${weakestUnit.level} ${weakestUnit.unitClass})`);

  // 3. 지휘관 스킬 '기술 혁신(Tech Innovation)' 영구 소멸 1회 구제 검증
  const rescueCheck = CommanderSkillTreeManager.tryRescueFromPermadeath(
    defending_player.commander,
    current_timestamp
  );

  let lootedUnit: Unit | null = null;
  let rescuedByTechInnovation = false;

  if (rescueCheck.rescued) {
    rescuedByTechInnovation = true;
    logs.push(`🛡️ ${rescueCheck.log}`);
    logs.push(`✨ 최약 유닛 [${weakestUnit.name}]이(가) 수탈 및 사망에서 기적적으로 구제되었습니다!`);
  } else {
    // 4. 수탈 로직 실행: 수비측에서 제거 -> 공격자 부대에 귀속(소유권 이전)
    const unitIdx = defending_player.units.findIndex((u) => u.id === weakestUnit.id);
    if (unitIdx !== -1) {
      defending_player.units.splice(unitIdx, 1);
    }

    // 소유권 이전 객체 복사
    lootedUnit = {
      ...weakestUnit,
      ownerId: attacking_player.id,
      capturedFromPlayerId: defending_player.id,
      hp: Math.max(1, Math.round(weakestUnit.maxHp * 0.3)), // 포획 상태로 30% HP 유지
      isInactivated: false,
      isOfflineDefenseMode: false,
      // 공격자 스킬 'Strategic Dominance' 보유 시 초기 호감도 25 고정
      favorability: attacking_player.commander.unlockedSkills.STRATEGIC_DOMINANCE
        ? 25
        : Math.max(10, weakestUnit.favorability - 20)
    };

    attacking_player.units.push(lootedUnit);
    logs.push(`💀 [수탈 완료] 최약체 유닛 [${weakestUnit.name}]이(가) 전리품으로 포획되어 공격자 ${attacking_player.name}에게 영구 귀속되었습니다!`);
    if (attacking_player.commander.unlockedSkills.STRATEGIC_DOMINANCE) {
      logs.push(`⭐ [Strategic Dominance] 포획된 유닛의 초기 호감도가 25pt로 즉시 세팅되었습니다.`);
    }
  }

  // 5. 패널티 부여: 수탈당한 지휘관 부대는 1시간(60분 = 3600초) 동안 '비활성화 및 공격 불가 상태'로 변경됨
  const penaltyDurationSec = 3600; // 1시간 = 3600초
  const timerEndTimestamp = current_timestamp + penaltyDurationSec;

  defending_player.commander.deactivationTimerEndTimestamp = timerEndTimestamp;
  defending_player.commander.isCommanderDisabled = true;
  defending_player.offlineStatus.lastLootedTimestamp = current_timestamp;
  defending_player.offlineStatus.dailyLootedUnitsCount += 1;

  // 지휘관 산하 부대 전체 1시간 비활성화 및 무적 보호막 처리
  for (const unit of defending_player.units.filter((u) => !u.isDead)) {
    unit.isInactivated = true;
    unit.isOfflineDefenseMode = false; // 추가 약탈 방지 보호막
  }

  logs.push(`⏱️ [1시간 비활성화 패널티 발효] 피격 지휘관 부대 전체가 60분(3600초) 동안 비활성화 및 보호 상태로 전환됩니다. (연쇄 기습 약탈 차단)`);
  logs.push(`   - 패널티 만료 시각: ${new Date(timerEndTimestamp * 1000).toLocaleTimeString()}`);

  // 6. 24시간 동안 지속 공격받아 전멸 시 리셋 조건 검증
  // "24시간 동안 지속 공격받아 전멸 시 지휘관 레벨/스킬 제외 초기화"
  let isTerritoryResetTriggered = false;
  const remainingDefenderLivingUnits = defending_player.units.filter((u) => !u.isDead);

  if (remainingDefenderLivingUnits.length === 0) {
    isTerritoryResetTriggered = true;
    logs.push(`🚨 [24시간 전멸 리셋 발동] 보유 유닛이 0기에 도달하여 플레이어 영지 점령 진행도가 초기화됩니다!`);
    logs.push(`👑 [영구 보존] 최고사령관 ${defending_player.commander.name}의 레벨(Lv.${defending_player.commander.level}) 및 해금된 스킬 트리는 영구 보존됩니다.`);

    // 기본 구제 스타터 유닛 2기 자동 보급
    defending_player.units.push(
      createDefaultUnit({
        id: `rescue_melee_${Date.now()}`,
        name: '의용 보병 1번대',
        ownerId: defending_player.id,
        unitClass: 'MELEE',
        level: 1,
        hp: 100,
        maxHp: 100,
        attackPower: 35,
        defensePower: 25,
        currentTile: { x: 1, y: 1 } // 안전지대 리스폰
      }),
      createDefaultUnit({
        id: `rescue_archer_${Date.now()}`,
        name: '초보 궁수 1번대',
        ownerId: defending_player.id,
        unitClass: 'ARCHER',
        level: 1,
        hp: 80,
        maxHp: 80,
        attackPower: 45,
        defensePower: 15,
        currentTile: { x: 1, y: 1 }
      })
    );
    logs.push(`🎁 기본 스타터 유닛(의용 보병 1기, 초보 궁수 1기)이 마을(1, 1)에 긴급 재배치되었습니다.`);
  }

  return {
    success: true,
    battleResult: 'ATTACKER_WON',
    defendingPlayerId: defending_player.id,
    attackingPlayerId: attacking_player.id,
    lootedUnit,
    rescuedByTechInnovation,
    penaltyDeactivationSeconds: penaltyDurationSec,
    penaltyTimerEndTimestamp: timerEndTimestamp,
    isTerritoryResetTriggered,
    logs
  };
}

// ============================================================================
// 5. 팩토리 헬퍼 함수 (Factory Utilities)
// ============================================================================

export function createDefaultCommander(custom: Partial<Commander> = {}): Commander {
  return {
    id: custom.id || 'CMD_ARTHUR_01',
    name: custom.name || '최고사령관 아르투르',
    level: custom.level || 5,
    skillPoints: custom.skillPoints !== undefined ? custom.skillPoints : 3,
    unlockedSkills: {
      BEAR_DOWN: true,
      BERSERK: false,
      ART_OF_WAR: false,
      PRECISION_STRIKE: true,
      SHIELD_WALL: true,
      IRONCLAD: false,
      DEFENDER_LEADER: false,
      TACTICAL_RETREAT: false,
      TECH_INNOVATION: true,
      RAPID_ADVANCE: true,
      COMMANDER_LEADERSHIP: false,
      STRATEGIC_DOMINANCE: false,
      ...custom.unlockedSkills
    },
    cooldowns: {
      techInnovationLastUsedTimestamp: custom.cooldowns?.techInnovationLastUsedTimestamp || 0
    },
    deactivationTimerEndTimestamp: custom.deactivationTimerEndTimestamp || null,
    isCommanderDisabled: custom.isCommanderDisabled || false
  };
}

export function createDefaultUnit(custom: Partial<Unit> = {}): Unit {
  return {
    id: custom.id || `unit_${Math.random().toString(36).substring(2, 9)}`,
    name: custom.name || '정예 기사 1번대',
    ownerId: custom.ownerId || 'PLAYER',
    unitClass: custom.unitClass || 'KNIGHT',
    level: custom.level || 1,
    exp: custom.exp || 0,
    maxExp: (custom.level || 1) * 100,
    favorability: custom.favorability !== undefined ? custom.favorability : 60,
    promotions: {
      combatRank: custom.promotions?.combatRank || 0,
      firstStrikeRank: custom.promotions?.firstStrikeRank || 0,
      withdrawalRank: custom.promotions?.withdrawalRank || 0,
      antibulletRank: custom.promotions?.antibulletRank || 0,
      collateralResistRank: custom.promotions?.collateralResistRank || 0
    },
    hp: custom.hp || 140,
    maxHp: custom.maxHp || 140,
    attackPower: custom.attackPower || 85,
    defensePower: custom.defensePower || 45,
    baseAP: custom.baseAP || 4,
    currentAP: custom.currentAP || 4,
    upkeepCost: custom.upkeepCost !== undefined ? custom.upkeepCost : 10,
    isInactivated: custom.isInactivated || false,
    isDead: custom.isDead || false,
    isSafe: custom.isSafe || false,
    isOfflineDefenseMode: custom.isOfflineDefenseMode || false,
    currentTile: custom.currentTile || { x: 0, y: 0 },
    imageUrl: custom.imageUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80'
  };
}

export function createDefaultPlayer(custom: Partial<Player> = {}): Player {
  return {
    id: custom.id || 'PLAYER_01',
    name: custom.name || '아서 왕',
    gold: custom.gold !== undefined ? custom.gold : 100,
    commander: custom.commander || createDefaultCommander(),
    units: custom.units || [],
    isOnline: custom.isOnline !== undefined ? custom.isOnline : true,
    offlineStatus: {
      mode: 'SAFE_PROTECTED',
      logoutTimestamp: 0,
      lastLootedTimestamp: null,
      dailyLootedUnitsCount: 0,
      ...custom.offlineStatus
    },
    turn: custom.turn || 1
  };
}

export function createDefaultTile(custom: Partial<Tile> = {}): Tile {
  const type = custom.type || 'PLAIN';
  const isCity = type === 'CITY';
  const isSafeZone = type === 'VILLAGE' || type === 'CITY';

  const defaultDefenseBonusMap: Record<TileType, number> = {
    PLAIN: 0.0,
    ROUGH: 0.15,
    FOREST: 0.25,
    HILL: 0.35,
    VILLAGE: 0.20,
    CITY: 0.40
  };

  return {
    id: custom.id || `tile_${custom.x || 0}_${custom.y || 0}`,
    x: custom.x || 0,
    y: custom.y || 0,
    type,
    name: custom.name || (type === 'CITY' ? '왕도 카멜롯' : type === 'VILLAGE' ? '평화로운 마을' : '황무지 평원'),
    defenseBonus: custom.defenseBonus !== undefined ? custom.defenseBonus : defaultDefenseBonusMap[type],
    isSafeZone: custom.isSafeZone !== undefined ? custom.isSafeZone : isSafeZone,
    isCity: custom.isCity !== undefined ? custom.isCity : isCity,
    cityGroupId: custom.cityGroupId
  };
}

// ============================================================================
// 6. 시뮬레이션 테스트 케이스 실행 스위트 (Self-Executing Test Runner)
// ============================================================================

export interface TestResultItem {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export function runPhase4SimulationTests(): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResultItem[];
  fullLogs: string[];
} {
  const results: TestResultItem[] = [];
  const fullLogs: string[] = [];

  const log = (msg: string) => fullLogs.push(msg);

  log('🧪 [Phase 4 Core Simulation Test Suite] 검증 시작...');

  // --------------------------------------------------------------------------
  // 테스트 케이스 1: 필드 및 도시 유닛의 유지비 차감 & 골드 부족 시 비활성화 전환 검증
  // --------------------------------------------------------------------------
  {
    log('\n--- [테스트 1]: 필드 및 도시 유닛 유지비 차감 & 골드 부족 시 비활성화 검증 ---');
    const player = createDefaultPlayer({ gold: 15 }); // 골드 15G 보유

    const cityTile = createDefaultTile({ x: 1, y: 1, type: 'CITY', name: '왕도' });
    const villageTile = createDefaultTile({ x: 2, y: 1, type: 'VILLAGE', name: '마을' });
    const fieldTile = createDefaultTile({ x: 3, y: 3, type: 'PLAIN', name: '평원' });

    const tilesMap: Record<string, Tile> = {
      '1,1': cityTile,
      '2,1': villageTile,
      '3,3': fieldTile
    };

    // 유닛 3기 생성:
    // U1: 도시 주둔 (유지비 0G)
    // U2: 평원 주둔 (유지비 10G)
    // U3: 평원 주둔 (유지비 10G)
    const u1City = createDefaultUnit({ id: 'u1', name: '도시 기사', upkeepCost: 10, currentTile: { x: 1, y: 1 } });
    const u2Field = createDefaultUnit({ id: 'u2', name: '필드 보병 A', upkeepCost: 10, level: 2, currentTile: { x: 3, y: 3 } });
    const u3Field = createDefaultUnit({ id: 'u3', name: '필드 보병 B', upkeepCost: 10, level: 1, currentTile: { x: 3, y: 3 } });

    player.units = [u1City, u2Field, u3Field];

    // 필드 총 요구 유지비: 10G + 10G = 20G. 플레이어는 15G 보유.
    // 결과: 1기(u2Field, 레벨 높음)는 10G 결제 활성, 1기(u3Field)는 골드 부족으로 비활성화(isInactivated=true)
    const res = process_turn_upkeep(player, tilesMap);
    res.logs.forEach(l => log(l));

    const checkSafe = u1City.isSafe === true && !u1City.isInactivated;
    const checkPaid = u2Field.isInactivated === false;
    const checkInactivated = u3Field.isInactivated === true;
    const checkGold = player.gold === 5; // 15G - 10G = 5G

    const passed = checkSafe && checkPaid && checkInactivated && checkGold;
    results.push({
      id: 'TEST_01_UPKEEP_AND_INACTIVATION',
      name: '턴 유지비 정산 및 골드 부족 시 비활성화 검증',
      passed,
      details: `도시 유닛 안전=${checkSafe}, 고레벨 필드유닛 결제=${checkPaid}, 저레벨 필드유닛 비활성화=${checkInactivated}, 잔여골드(${player.gold}G)=${checkGold}`
    });
  }

  // --------------------------------------------------------------------------
  // 테스트 케이스 2: 도시 유닛 매각 및 환급 골드 검증
  // --------------------------------------------------------------------------
  {
    log('\n--- [테스트 2]: 도시 유닛 매각 및 재화 환원 검증 ---');
    const player = createDefaultPlayer({ gold: 100 });
    const cityTile = createDefaultTile({ x: 5, y: 5, type: 'CITY', name: '상업 도시' });
    const plainTile = createDefaultTile({ x: 2, y: 2, type: 'PLAIN', name: '외곽 평지' });

    const unitInCity = createDefaultUnit({
      id: 'sell_target',
      name: '퇴역 예정 기사',
      unitClass: 'KNIGHT',
      level: 3,
      favorability: 80,
      currentTile: { x: 5, y: 5 }
    });
    player.units = [unitInCity];

    // 2-A. 평지 타일에서 매각 시도 -> 실패해야 함
    const failRes = sell_unit_in_city(player, 'sell_target', plainTile);
    const failCheck = !failRes.success;

    // 2-B. 도시 타일에서 매각 시도 -> 성공 및 골드 환급, 영구 삭제
    const successRes = sell_unit_in_city(player, 'sell_target', cityTile);
    successRes.logs.forEach(l => log(l));

    const deletedCheck = player.units.length === 0;
    const goldCheck = successRes.refundGold > 500 && player.gold > 600;

    const passed = failCheck && successRes.success && deletedCheck && goldCheck;
    results.push({
      id: 'TEST_02_SELL_UNIT_IN_CITY',
      name: '도시 유닛 매각 & 환급 골드 및 영구 삭제 검증',
      passed,
      details: `비도시 매각 차단=${failCheck}, 도시 매각 성공=${successRes.success}, 유닛 영구삭제=${deletedCheck}, 환급골드(+${successRes.refundGold}G)=${goldCheck}`
    });
  }

  // --------------------------------------------------------------------------
  // 테스트 케이스 3: 오프라인 방어 패배 시 최약 유닛 1개 수탈 & 1시간 비활성화 타이머 검증
  // --------------------------------------------------------------------------
  {
    log('\n--- [테스트 3]: 비동기 공격 패배 시 최약 유닛 1개 수탈 & 1시간 비활성화 타이머 검증 ---');
    const defender = createDefaultPlayer({ id: 'DEF_01', name: '수비자 수호군단' });
    const attacker = createDefaultPlayer({ id: 'ATK_01', name: '공격자 오크 약탈군' });

    // 수비측 유닛 3기 생성 (전투력 차등화)
    const strongKnight = createDefaultUnit({
      id: 'unit_strong',
      name: '최정예 성기사',
      unitClass: 'KNIGHT',
      level: 4,
      attackPower: 95,
      defensePower: 60,
      hp: 160,
      currentTile: { x: 3, y: 4 }
    });
    const midArcher = createDefaultUnit({
      id: 'unit_mid',
      name: '베테랑 명사수',
      unitClass: 'ARCHER',
      level: 2,
      attackPower: 55,
      defensePower: 25,
      hp: 100,
      currentTile: { x: 3, y: 4 }
    });
    const weakRecruit = createDefaultUnit({
      id: 'unit_weak',
      name: '신병 보병',
      unitClass: 'MELEE',
      level: 1,
      attackPower: 25,
      defensePower: 15,
      hp: 60,
      currentTile: { x: 3, y: 4 }
    });

    defender.units = [strongKnight, midArcher, weakRecruit];
    // 기술 혁신 쿨타임 중으로 설정하여 수탈 발동 유도
    defender.commander.unlockedSkills.TECH_INNOVATION = false;

    const currentEpoch = 1700000000;
    const hillTile = createDefaultTile({ x: 3, y: 4, type: 'HILL', defenseBonus: 0.35 });

    // 수비 패배 시뮬레이션
    const attackRes = handle_offline_attack(
      defender,
      attacker,
      { defenderWon: false },
      hillTile,
      currentEpoch
    );
    attackRes.logs.forEach(l => log(l));

    // 검증 1: 최약 유닛(신병 보병)만 정확히 수탈되었는가?
    const weakUnitStolen = attackRes.lootedUnit?.id === 'unit_weak';
    const defenderLostWeak = !defender.units.some(u => u.id === 'unit_weak');
    const defenderRetainedOthers = defender.units.length === 2 && defender.units.some(u => u.id === 'unit_strong');
    const attackerAcquired = attacker.units.some(u => u.id === 'unit_weak' && u.ownerId === attacker.id);

    // 검증 2: 수비측에 1시간(3600초) 비활성화 타이머가 정확히 설정되었는가?
    const timerExpected = currentEpoch + 3600;
    const timerMatches = defender.commander.deactivationTimerEndTimestamp === timerExpected;
    const isDefenderDisabled = defender.commander.isCommanderDisabled === true;
    const allDefenderUnitsInactivated = defender.units.every(u => u.isInactivated === true);

    const passed =
      weakUnitStolen &&
      defenderLostWeak &&
      defenderRetainedOthers &&
      attackerAcquired &&
      timerMatches &&
      isDefenderDisabled &&
      allDefenderUnitsInactivated;

    results.push({
      id: 'TEST_03_OFFLINE_LOOT_AND_1HR_PENALTY',
      name: '최약 유닛 1개 수탈 및 지휘관 부대 1시간 비활성화 타이머 검증',
      passed,
      details: `최약유닛(unit_weak)선별=${weakUnitStolen}, 수비자목록제거=${defenderLostWeak}, 강유닛보존=${defenderRetainedOthers}, 공격자귀속=${attackerAcquired}, 1시간타이머(${timerExpected})=${timerMatches}, 부대비활성화=${allDefenderUnitsInactivated}`
    });
  }

  // --------------------------------------------------------------------------
  // 테스트 케이스 4: 지휘관 스킬 트리 해금 검증 (부모 의존성 및 SP 차감)
  // --------------------------------------------------------------------------
  {
    log('\n--- [테스트 4]: 지휘관 스킬 트리 해금 검증 (부모 의존성 & SP 차감) ---');
    const cmd = createDefaultCommander({
      skillPoints: 2,
      unlockedSkills: {
        BEAR_DOWN: false,
        BERSERK: false,
        ART_OF_WAR: false,
        PRECISION_STRIKE: false,
        SHIELD_WALL: false,
        IRONCLAD: false,
        DEFENDER_LEADER: false,
        TACTICAL_RETREAT: false,
        TECH_INNOVATION: false,
        RAPID_ADVANCE: false,
        COMMANDER_LEADERSHIP: false,
        STRATEGIC_DOMINANCE: false
      }
    });

    // 1. 선행 스킬인 BEAR_DOWN 없이 2티어 BERSERK 해금 시도 -> 실패해야 함
    const failCheck = CommanderSkillTreeManager.canUnlockSkill(cmd, 'BERSERK');
    const failOk = !failCheck.canUnlock;

    // 2. BEAR_DOWN 해금 (1 SP 차감) -> 성공해야 함
    const unlockParent = CommanderSkillTreeManager.unlockSkill(cmd, 'BEAR_DOWN');
    const parentOk = unlockParent.success && cmd.unlockedSkills.BEAR_DOWN && cmd.skillPoints === 1;

    // 3. 이제 선행 스킬이 해금되었으므로 BERSERK 해금 가능 (1 SP 차감 -> 0 SP 남음)
    const unlockChild = CommanderSkillTreeManager.unlockSkill(cmd, 'BERSERK');
    const childOk = unlockChild.success && cmd.unlockedSkills.BERSERK && cmd.skillPoints === 0;

    // 4. SP가 0이므로 ART_OF_WAR 해금 시도 -> SP 부족으로 실패해야 함
    const spCheck = CommanderSkillTreeManager.canUnlockSkill(cmd, 'ART_OF_WAR');
    const spFailOk = !spCheck.canUnlock;

    const passed = failOk && parentOk && childOk && spFailOk;
    results.push({
      id: 'TEST_04_SKILL_TREE_DEPENDENCY',
      name: '지휘관 스킬 트리 계층 의존성 및 SP 차감 검증',
      passed,
      details: `선행스킬 미보유 차단=${failOk}, 1티어 해금=${parentOk}, 2티어 후속해금=${childOk}, SP고갈 차단=${spFailOk}`
    });
  }

  // --------------------------------------------------------------------------
  // 테스트 케이스 5: 기술 혁신 (Tech Innovation) 100분 쿨타임 사망 1회 구제 검증
  // --------------------------------------------------------------------------
  {
    log('\n--- [테스트 5]: 기술 혁신(Tech Innovation) 100분 쿨타임 사망 1회 구제 검증 ---');
    const defender = createDefaultPlayer({ id: 'DEF_TECH', name: '과학주의 수비자' });
    const attacker = createDefaultPlayer({ id: 'ATK_TECH', name: '약탈자' });

    defender.commander.unlockedSkills.TECH_INNOVATION = true;
    defender.commander.cooldowns.techInnovationLastUsedTimestamp = 0; // 쿨타임 완료 상태

    const weakUnit = createDefaultUnit({ id: 'u_tech_weak', name: '연구원 호위병' });
    defender.units = [weakUnit];

    const currentEpoch = 1700005000;

    // 첫 번째 피격 패배 -> Tech Innovation 발동으로 구제되어야 함!
    const res1 = handle_offline_attack(defender, attacker, { defenderWon: false }, undefined, currentEpoch);
    const rescuedOk = res1.rescuedByTechInnovation === true && res1.lootedUnit === null && defender.units.length === 1;

    // 10분 후(600초 경과) 재공격 -> 100분 미경과로 쿨타임 중이므로 이번엔 구제 실패하고 수탈되어야 함!
    const res2 = handle_offline_attack(defender, attacker, { defenderWon: false }, undefined, currentEpoch + 600);
    const lootedOk = res2.rescuedByTechInnovation === false && res2.lootedUnit?.id === 'u_tech_weak';

    const passed = rescuedOk && lootedOk;
    results.push({
      id: 'TEST_05_TECH_INNOVATION_COOLDOWN',
      name: '기술 혁신(Tech Innovation) 100분 쿨타임 사망 구제 검증',
      passed,
      details: `첫 패배 긴급구제=${rescuedOk}, 10분 내 재공격 쿨타임 미충족 수탈=${lootedOk}`
    });
  }

  const passedTests = results.filter(r => r.passed).length;
  const allPassed = passedTests === results.length;

  log(`\n🏁 [Phase 4 테스트 결과 요약]: 총 ${results.length}개 테스트 중 ${passedTests}개 통과 (${allPassed ? 'ALL PASS! ✅' : 'FAIL ❌'})`);

  return {
    allPassed,
    totalTests: results.length,
    passedTests,
    results,
    fullLogs
  };
}
