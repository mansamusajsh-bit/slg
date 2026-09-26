/**
 * Pure JavaScript / Node.js & Browser compliant Phase 4 Engine Code string
 * Contains:
 * - Data structures: Player, Unit, Tile, Commander
 * - Turn Economy: process_turn_upkeep
 * - City Unit Sale: sell_unit_in_city
 * - Offline Defense & Looting: handle_offline_attack
 * - CommanderSkillTreeManager: Skill Tree dependency validation & passive combat stat modifiers
 * - Full Simulation Test Suite: runPhase4SimulationTests
 */
export const PHASE_4_ENGINE_CODE = `
/**
 * ============================================================================
 * [Web-SLG] Phase 4 Core Engine (Pure JavaScript Production Edition)
 * 마을/도시 경제, 유지비, 지휘관 스킬 트리 및 비동기 로그아웃 방어 시스템
 * ============================================================================
 */

(function (global) {
  'use strict';

  // 1. 지휘관 스킬 트리 매니저 (CommanderSkillTreeManager)
  const CommanderSkillTreeManager = {
    SKILL_NODES: {
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
        description: '유입되는 2차 스플래시 피해 30% 감소'
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
    },

    canUnlockSkill: function (commander, skillId) {
      var node = this.SKILL_NODES[skillId];
      if (!node) return { canUnlock: false, reason: '존재하지 않는 스킬입니다.' };
      if (commander.unlockedSkills[skillId]) return { canUnlock: false, reason: '이미 해금 완료된 스킬입니다.' };
      if (commander.skillPoints < node.costSP) return { canUnlock: false, reason: '스킬 포인트가 부족합니다.' };
      if (node.prerequisite && !commander.unlockedSkills[node.prerequisite]) {
        return { canUnlock: false, reason: '선행 스킬 [' + this.SKILL_NODES[node.prerequisite].name + '] 필요' };
      }
      return { canUnlock: true };
    },

    unlockSkill: function (commander, skillId) {
      var check = this.canUnlockSkill(commander, skillId);
      if (!check.canUnlock) return { success: false, message: check.reason };
      var node = this.SKILL_NODES[skillId];
      commander.skillPoints -= node.costSP;
      commander.unlockedSkills[skillId] = true;
      return { success: true, message: '지휘관 패시브 스킬 [' + node.name + '] 해금 완료!' };
    },

    applyOffensiveSkills: function (commander, attackerUnit, isFirstUnit, targetTileDefBonus) {
      var finalAtk = attackerUnit.attackPower;
      var finalTileDef = targetTileDefBonus;
      if (commander.unlockedSkills.BEAR_DOWN && isFirstUnit) {
        finalAtk += Math.round(attackerUnit.attackPower * 0.20);
      }
      if (commander.unlockedSkills.PRECISION_STRIKE && isFirstUnit && targetTileDefBonus > 0) {
        finalTileDef = 0;
      }
      return { attackPower: finalAtk, effectiveTileDefBonus: finalTileDef };
    },

    applyDefensiveSkills: function (commander, defenderUnit, estimatedWinRate, incomingCollateral) {
      var finalDef = defenderUnit.defensePower;
      var finalCollateral = incomingCollateral || 0;
      var grantedFS = (defenderUnit.promotions && defenderUnit.promotions.firstStrikeRank) || 0;
      var extraRetreat = 0;
      var canHeal = false;

      if (commander.unlockedSkills.SHIELD_WALL) {
        finalDef += Math.round(defenderUnit.defensePower * 0.15);
      }
      if (commander.unlockedSkills.IRONCLAD && finalCollateral > 0) {
        finalCollateral = Math.round(finalCollateral * 0.70);
      }
      if (commander.unlockedSkills.DEFENDER_LEADER && estimatedWinRate < 0.50) {
        grantedFS = Math.max(grantedFS, 2);
      }
      if (commander.unlockedSkills.TACTICAL_RETREAT && estimatedWinRate < 0.30) {
        extraRetreat = 0.20;
        canHeal = true;
      }

      return {
        defensePower: finalDef,
        reducedCollateralDamage: finalCollateral,
        grantedFirstStrikeRank: grantedFS,
        tacticalWithdrawalBonus: extraRetreat,
        canHealOnWithdrawal: canHeal
      };
    },

    tryRescueFromPermadeath: function (commander, currentTimestampSec) {
      if (!commander.unlockedSkills.TECH_INNOVATION) return { rescued: false };
      var elapsed = currentTimestampSec - (commander.cooldowns.techInnovationLastUsedTimestamp || 0);
      var cooldownPeriodSec = 100 * 60; // 100분 = 6000초
      if (elapsed >= cooldownPeriodSec) {
        commander.cooldowns.techInnovationLastUsedTimestamp = currentTimestampSec;
        return { rescued: true, log: '[Tech Innovation] 100분 주기 긴급 양자 구조망 발동으로 유닛 영구 소멸 1회 구제!' };
      }
      return { rescued: false, log: '[Tech Innovation] 쿨타임 대기 중' };
    }
  };

  // 2. 유닛 종합 전투력 계산
  function calculate_unit_combat_power(unit) {
    if (unit.isDead) return -1;
    var statScore = unit.attackPower * 1.5 + unit.defensePower * 1.2 + unit.hp * 0.5;
    var rankScore = ((unit.promotions && (
      (unit.promotions.combatRank || 0) +
      (unit.promotions.firstStrikeRank || 0) +
      (unit.promotions.withdrawalRank || 0) +
      (unit.promotions.antibulletRank || 0) +
      (unit.promotions.collateralResistRank || 0)
    )) || 0) * 20;
    var levelScore = (unit.level || 1) * 30;
    return Math.round(statScore + rankScore + levelScore);
  }

  // 3. 턴 유지비 정산 함수 (process_turn_upkeep)
  function process_turn_upkeep(player, tilesMap) {
    var logs = [];
    logs.push('=== [제 ' + player.turn + '턴 유지비 정산] (보유 골드: ' + player.gold + 'G) ===');
    var livingUnits = player.units.filter(function (u) { return !u.isDead; });
    var totalUpkeepNeeded = 0;
    var fieldUnits = [];
    var safeUnitsCount = 0;

    for (var i = 0; i < livingUnits.length; i++) {
      var unit = livingUnits[i];
      var key = unit.currentTile.x + ',' + unit.currentTile.y;
      var tile = tilesMap ? tilesMap[key] : null;
      var isSafe = tile ? tile.isSafeZone : unit.isSafe;

      if (isSafe) {
        unit.isSafe = true;
        unit.isInactivated = false;
        safeUnitsCount++;
      } else {
        unit.isSafe = false;
        totalUpkeepNeeded += unit.upkeepCost;
        fieldUnits.push(unit);
      }
    }

    logs.push('총 유닛: ' + livingUnits.length + '기 (안전지대 면제: ' + safeUnitsCount + '기, 필드 청구: ' + fieldUnits.length + '기, 청구액: ' + totalUpkeepNeeded + 'G)');

    var newlyInactivated = [];
    var goldDeducted = 0;

    if (player.gold >= totalUpkeepNeeded) {
      player.gold -= totalUpkeepNeeded;
      goldDeducted = totalUpkeepNeeded;
      fieldUnits.forEach(function (u) { u.isInactivated = false; });
      logs.push('✅ 유지비 ' + totalUpkeepNeeded + 'G 전액 결제 완료. (잔여: ' + player.gold + 'G)');
    } else {
      logs.push('⚠️ 골드 부족 경보! (청구: ' + totalUpkeepNeeded + 'G > 보유: ' + player.gold + 'G)');
      fieldUnits.sort(function (a, b) { return b.level - a.level; });
      var availableGold = player.gold;
      for (var j = 0; j < fieldUnits.length; j++) {
        var u = fieldUnits[j];
        if (availableGold >= u.upkeepCost) {
          availableGold -= u.upkeepCost;
          goldDeducted += u.upkeepCost;
          u.isInactivated = false;
        } else {
          u.isInactivated = true;
          newlyInactivated.push(u);
          logs.push('❌ [체납 비활성화] ' + u.name + ' (Lv.' + u.level + ') -> 작전 정지!');
        }
      }
      player.gold = availableGold;
    }

    livingUnits.forEach(function (u) {
      u.currentAP = u.isInactivated ? 0 : u.baseAP;
    });

    player.turn += 1;

    return {
      success: true,
      totalUnitsCount: livingUnits.length,
      fieldUnitsCount: fieldUnits.length,
      safeUnitsCount: safeUnitsCount,
      totalUpkeepNeeded: totalUpkeepNeeded,
      goldDeducted: goldDeducted,
      remainingGold: player.gold,
      inactivatedCount: newlyInactivated.length,
      newlyInactivatedUnits: newlyInactivated,
      logs: logs
    };
  }

  // 4. 도시 유닛 매각 함수 (sell_unit_in_city)
  function sell_unit_in_city(player, unitId, tile) {
    var logs = [];
    if (tile.type !== 'CITY' && !tile.isCity) {
      return { success: false, reason: '도시(2x2) 타일 내에서만 매각 가능합니다.', logs: ['❌ 매각 실패: 도시 타일 필수'] };
    }
    var unitIndex = -1;
    for (var i = 0; i < player.units.length; i++) {
      if (player.units[i].id === unitId && !player.units[i].isDead) {
        unitIndex = i;
        break;
      }
    }
    if (unitIndex === -1) return { success: false, reason: '유닛을 찾을 수 없습니다.', logs: ['❌ 매각 실패: 유닛 부재'] };
    var unit = player.units[unitIndex];

    var baseClassGoldMap = { KNIGHT: 300, MAGE: 250, FIREARM: 220, ARCHER: 180, MELEE: 150 };
    var baseGold = baseClassGoldMap[unit.unitClass] || 150;
    var levelMultiplier = 1 + (unit.level - 1) * 0.35;
    var favorabilityBonus = Math.round(unit.favorability * 2.5);
    var promotionsValue = 0;
    if (unit.promotions) {
      promotionsValue = ((unit.promotions.combatRank || 0) +
        (unit.promotions.firstStrikeRank || 0) +
        (unit.promotions.withdrawalRank || 0) +
        (unit.promotions.antibulletRank || 0) +
        (unit.promotions.collateralResistRank || 0)) * 50;
    }

    var totalRefund = Math.round(baseGold * levelMultiplier + favorabilityBonus + promotionsValue);
    player.units.splice(unitIndex, 1);
    player.gold += totalRefund;

    logs.push('🏛️ [도시 유닛 매각 완료] ' + unit.name + ' (Lv.' + unit.level + ') -> +' + totalRefund + 'G 환급 (보유: ' + player.gold + 'G)');

    return {
      success: true,
      refundGold: totalRefund,
      unitName: unit.name,
      remainingGold: player.gold,
      logs: logs
    };
  }

  // 5. 비동기 로그아웃 방어 및 수탈 함수 (handle_offline_attack)
  function handle_offline_attack(defending_player, attacking_player, attack_result, target_tile, current_timestamp) {
    var timestamp = current_timestamp || Math.floor(Date.now() / 1000);
    var logs = [];
    logs.push('⚔️ [비동기 오프라인 침공] 방어: ' + defending_player.name + ' vs 공격: ' + attacking_player.name);

    if (attack_result.defenderWon) {
      logs.push('🎉 [수비 성공] 방어자가 기습을 격퇴했습니다!');
      return { success: true, battleResult: 'DEFENDER_WON', lootedUnit: null, logs: logs };
    }

    logs.push('💥 [수비 패배] 방어선 돌파! 수탈 로직 가동');
    var livingUnits = defending_player.units.filter(function (u) { return !u.isDead; });
    if (livingUnits.length === 0) {
      return { success: true, battleResult: 'ATTACKER_WON', lootedUnit: null, logs: logs };
    }

    // 최약체 유닛 선별
    var weakest = livingUnits[0];
    var minPower = calculate_unit_combat_power(weakest);
    for (var i = 1; i < livingUnits.length; i++) {
      var p = calculate_unit_combat_power(livingUnits[i]);
      if (p < minPower) {
        minPower = p;
        weakest = livingUnits[i];
      }
    }

    // Tech Innovation 구제 검증
    var rescue = CommanderSkillTreeManager.tryRescueFromPermadeath(defending_player.commander, timestamp);
    var looted = null;

    if (rescue.rescued) {
      logs.push(rescue.log);
    } else {
      var idx = defending_player.units.indexOf(weakest);
      if (idx !== -1) defending_player.units.splice(idx, 1);

      looted = Object.assign({}, weakest, {
        ownerId: attacking_player.id,
        capturedFromPlayerId: defending_player.id,
        favorability: attacking_player.commander.unlockedSkills.STRATEGIC_DOMINANCE ? 25 : Math.max(10, weakest.favorability - 20)
      });
      attacking_player.units.push(looted);
      logs.push('💀 [수탈 완료] 최약체 [' + weakest.name + ']이(가) 공격자에게 귀속되었습니다!');
    }

    // 1시간(3600초) 비활성화 패널티 부여
    var penaltyTimer = timestamp + 3600;
    defending_player.commander.deactivationTimerEndTimestamp = penaltyTimer;
    defending_player.commander.isCommanderDisabled = true;
    defending_player.units.forEach(function (u) {
      u.isInactivated = true;
      u.isOfflineDefenseMode = false;
    });
    logs.push('⏱️ [1시간 비활성화 패널티] 피격 부대 전체가 60분간 보호막 및 비활성화 상태로 전환');

    return {
      success: true,
      battleResult: 'ATTACKER_WON',
      lootedUnit: looted,
      rescuedByTechInnovation: rescue.rescued,
      penaltyTimerEndTimestamp: penaltyTimer,
      logs: logs
    };
  }

  // 글로벌 노출 객체
  var Phase4Engine = {
    CommanderSkillTreeManager: CommanderSkillTreeManager,
    calculate_unit_combat_power: calculate_unit_combat_power,
    process_turn_upkeep: process_turn_upkeep,
    sell_unit_in_city: sell_unit_in_city,
    handle_offline_attack: handle_offline_attack
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Phase4Engine;
  } else {
    global.Phase4Engine = Phase4Engine;
  }
})(typeof window !== 'undefined' ? window : global);
`;
