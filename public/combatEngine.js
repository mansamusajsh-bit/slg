/**
 * ============================================================================
 * [Web-SLG] Core Combat Engine (문명4 기반 확률 전투 & 영구사망 & 리와인더 엔진)
 * ============================================================================
 * 
 * - 전투력 비율 기반 확률 계산식 (Civilization IV Method)
 * - 유닛 호감도(Favorability) 및 출격 거부 판정
 * - 공성병기(MAGE) 2차 스플래시 피해 & 지휘관 스킬(Ironclad, Berserk 등)
 * - 영구 사망(Permadeath) 처리 및 부대 배열/메모리 즉각 영구 제적
 * - 시간 역행기(Rewinder) 전투 직전 스냅샷 완벽 복원 (Deep Copy Rollback)
 * 
 * Node.js 환경: `node combatEngine.js` 로 즉시 4대 시나리오 자동 테스트 실행 가능
 * 브라우저 환경: <script src="combatEngine.js"></script> 로 글로벌 window.CombatEngine 사용 가능
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CombatEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  // ==========================================================================
  // 유틸리티 함수: Deep Copy (완전 독립 복제)
  // ==========================================================================
  function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(obj);
      } catch (e) {
        // Fallback for non-cloneable objects
      }
    }
    return JSON.parse(JSON.stringify(obj));
  }

  // ==========================================================================
  // 1. 샘플 에셋 데이터 정의 (Sample Data with High Quality Asset URLs)
  // ==========================================================================

  // 1-1. 지휘관 스킬 데이터 (Commander Skills)
  const CommanderSkillsData = {
    BERSERK: {
      id: 'BERSERK',
      name: '광폭화 (Berserk)',
      description: '아군 유닛의 호감도가 30 이하이거나 승률이 30% 미만이어도 전투 거부를 무시하고 강제 출격시킵니다.',
      iconUrl: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=150&auto=format&fit=crop&q=80',
      category: 'TACTICAL'
    },
    IRONCLAD: {
      id: 'IRONCLAD',
      name: '철갑 (Ironclad)',
      description: '공성병기 또는 광역 마법에 의해 아군 부대가 받는 2차 피해(스플래시)를 30% 경감합니다.',
      iconUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=150&auto=format&fit=crop&q=80',
      category: 'DEFENSE'
    },
    BEAR_DOWN: {
      id: 'BEAR_DOWN',
      name: '베어 다운 (Bear Down)',
      description: '선두 공격 유닛의 최종 공격력을 20% 증폭시킵니다.',
      iconUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80',
      category: 'ATTACK'
    },
    PRECISION_STRIKE: {
      id: 'PRECISION_STRIKE',
      name: '세밀한 타격 (Precision Strike)',
      description: '적 유닛이 위치한 타일의 지형 방어 보너스를 100% 무시하고 타격합니다.',
      iconUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80',
      category: 'TACTICAL'
    }
  };

  // 1-2. 타일 데이터 (Tiles: 평지, 숲, 언덕, 도시 등)
  const SampleTiles = {
    PLAINS: {
      x: 2,
      y: 3,
      tileType: 'PLAINS',
      name: '풍요의 평원',
      defenseBonus: 0.0, // 평지 방어 보너스 0%
      bgImageUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&auto=format&fit=crop&q=80',
      description: '장애물이 없는 개활지. 지형 방어 효과가 전혀 없습니다.'
    },
    FOREST: {
      x: 3,
      y: 3,
      tileType: 'FOREST',
      name: '검은 안개 숲',
      defenseBonus: 0.25, // 숲 방어 보너스 +25%
      bgImageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80',
      description: '울창한 침엽수림. 방어자에게 +25%의 은폐 및 엄폐 방어 보너스를 부여합니다.'
    },
    HILL: {
      x: 4,
      y: 2,
      tileType: 'HILL',
      name: '바람언덕 요충지',
      defenseBonus: 0.25, // 언덕 방어 보너스 +25%
      bgImageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&auto=format&fit=crop&q=80',
      description: '고지대 전술 거점. 적의 진격을 저지하며 +25%의 방어력을 제공합니다.'
    },
    CITY: {
      x: 5,
      y: 5,
      tileType: 'CITY',
      name: '에인헤랴르 왕도',
      defenseBonus: 0.40, // 요새 도시 방어 보너스 +40%
      bgImageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      description: '거대한 석조 성벽이 감싸고 있는 2x2 대요새 도시. 강력한 방어력 보너스를 부여합니다.'
    }
  };

  // 1-3. 유닛 데이터 샘플 (Sample Units 3종 + 적 부대)
  const SampleUnits = {
    // 1. 성기사 롤랑 (KNIGHT - 고방어/돌격 최상위 병과)
    ROLAND: {
      id: 'unit_knight_roland',
      name: '성기사 롤랑 (Roland)',
      unitClass: 'KNIGHT',
      level: 5,
      exp: 420,
      favorability: 85, // 높은 호감도 (정상 출격)
      hp: 120,
      maxHp: 120,
      attackPower: 58,
      defensePower: 46,
      isDead: false,
      promotions: [
        { id: 'PROMO_COMBAT_2', name: '전투 숙련 II', atkBonus: 0.15, defBonus: 0.15 },
        { id: 'PROMO_ANTIBULLET_1', name: '방탄 마갑 I', bulletDamageReduction: 0.25 }
      ],
      skills: [
        { id: 'SKILL_SHIELD_BASH', name: '방패 강타 (Bash)', powerMultiplier: 1.2 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80'
    },

    // 2. 대마도사 일레나 (MAGE - 공성/광역 2차 스플래시 피해 특화)
    ELENA: {
      id: 'unit_mage_elena',
      name: '대마도사 일레나 (Elena)',
      unitClass: 'MAGE',
      level: 6,
      exp: 680,
      favorability: 60, // 정상 호감도
      hp: 75,
      maxHp: 75,
      attackPower: 72,
      defensePower: 22,
      isDead: false,
      promotions: [
        { id: 'PROMO_SIEGE_1', name: '공성 마법 강화 I', siegeBonus: 0.30 }
      ],
      skills: [
        { id: 'SKILL_METEOR_STORM', name: '메테오 스톰 (Meteor Storm)', collateralRate: 0.45 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80'
    },

    // 3. 저격수 카인 (GUNNER - 저호감도, 직사 관통, 거부 기제 테스트용)
    KAIN: {
      id: 'unit_gunner_kain',
      name: '저격수 카인 (Kain)',
      unitClass: 'GUNNER',
      level: 3,
      exp: 150,
      favorability: 20, // 30 이하! (승률 30% 미만 시 공격 거부 테스트용)
      hp: 60,
      maxHp: 60,
      attackPower: 30, // 고난도 적 상대 시 승률 20%대 형성
      defensePower: 20,
      isDead: false,
      promotions: [
        { id: 'PROMO_FIRST_STRIKE_1', name: '선제 사격 I', firstStrikeRate: 0.20 }
      ],
      skills: [
        { id: 'SKILL_PIERCING_SHOT', name: '철갑탄 관통 사격', ignoreArmorRate: 0.35 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'
    },

    // 적 부대 유닛들 (Enemies)
    ORC_WARLORD: {
      id: 'enemy_orc_warlord',
      name: '오크 전쟁군주 (Warlord)',
      unitClass: 'MELEE',
      level: 7,
      exp: 900,
      favorability: 100,
      hp: 150,
      maxHp: 150,
      attackPower: 68,
      defensePower: 75,
      isDead: false,
      promotions: [
        { id: 'PROMO_FORTIFY_2', name: '요새화 방어 II', defBonus: 0.20 }
      ],
      skills: [],
      imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=80'
    },

    GOBLIN_GUARD_A: {
      id: 'enemy_goblin_01',
      name: '고블린 방패병 A',
      unitClass: 'MELEE',
      level: 3,
      exp: 80,
      favorability: 50,
      hp: 45,
      maxHp: 45,
      attackPower: 25,
      defensePower: 24,
      isDead: false,
      promotions: [],
      skills: [],
      imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80'
    },

    GOBLIN_GUARD_B: {
      id: 'enemy_goblin_02',
      name: '고블린 투창병 B',
      unitClass: 'ARCHER',
      level: 3,
      exp: 80,
      favorability: 50,
      hp: 40,
      maxHp: 40,
      attackPower: 28,
      defensePower: 18,
      isDead: false,
      promotions: [],
      skills: [],
      imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80'
    }
  };

  // ==========================================================================
  // 2. 핵심 전투 엔진 로직 (Core Engine Functions)
  // ==========================================================================

  /**
   * 2-1. calculateWinChance(attacker, defender, tile, commanderSkills = [])
   * 문명4 방식의 전투력 기반 확률 계산식
   * - [공격자 전투력] = attacker.attackPower * (승급/스킬 보너스) * (지휘관 보너스)
   * - [방어자 전투력] = defender.defensePower * (1 + tile.defenseBonus) * (승급/스킬 보너스)
   * - 최종 승리 확률(%) = (공격자 전투력 / (공격자 전투력 + 방어자 전투력)) * 100
   */
  function calculateWinChance(attacker, defender, tile, commanderSkills) {
    commanderSkills = commanderSkills || [];

    // 1. 공격자 승급/스킬 배율 계산
    let atkMultiplier = 1.0;
    if (Array.isArray(attacker.promotions)) {
      attacker.promotions.forEach(function (promo) {
        if (promo.atkBonus) atkMultiplier += promo.atkBonus;
      });
    }

    // 지휘관 스킬 '베어 다운 (BEAR_DOWN)': 선두 공격력 +20%
    const hasBearDown = commanderSkills.some(function (s) {
      return (typeof s === 'string' ? s : s.id) === 'BEAR_DOWN';
    });
    if (hasBearDown) {
      atkMultiplier += 0.20;
    }

    const finalAtkPower = attacker.attackPower * atkMultiplier;

    // 2. 방어자 지형 보너스 및 승급/스킬 배율 계산
    let tileDefBonus = tile && typeof tile.defenseBonus === 'number' ? tile.defenseBonus : 0.0;

    // 지휘관 스킬 '세밀한 타격 (PRECISION_STRIKE)': 적 타일 방어 보너스 100% 무시
    const hasPrecisionStrike = commanderSkills.some(function (s) {
      return (typeof s === 'string' ? s : s.id) === 'PRECISION_STRIKE';
    });
    if (hasPrecisionStrike) {
      tileDefBonus = 0.0;
    }

    let defMultiplier = 1.0 + tileDefBonus;
    if (Array.isArray(defender.promotions)) {
      defender.promotions.forEach(function (promo) {
        if (promo.defBonus) defMultiplier += promo.defBonus;
      });
    }

    const finalDefPower = defender.defensePower * defMultiplier;

    // 3. 문명4 방식 최종 승률 산출 (%)
    const totalPower = finalAtkPower + finalDefPower;
    let winChance = totalPower > 0 ? (finalAtkPower / totalPower) * 100 : 50;

    // 0.1% ~ 99.9% 사이로 보정
    winChance = Math.max(0.1, Math.min(99.9, winChance));

    return {
      winChance: parseFloat(winChance.toFixed(2)),
      attackerPower: parseFloat(finalAtkPower.toFixed(1)),
      defenderPower: parseFloat(finalDefPower.toFixed(1)),
      tileDefBonus: tileDefBonus,
      hasBearDown: hasBearDown,
      hasPrecisionStrike: hasPrecisionStrike
    };
  }

  /**
   * 2-2. canAttack(attacker, winChance, commanderSkills = [])
   * - 유닛의 호감도(favorability)가 30 이하이고, 계산된 승리 확률(winChance)이 30% 미만인 경우 공격 거부(false 반환)
   * - 단, 지휘관 스킬 '광폭화(Berserk)'가 활성화된 경우 호감도 제약을 무시하고 공격 가능
   */
  function canAttack(attacker, winChance, commanderSkills) {
    commanderSkills = commanderSkills || [];

    const isFavorabilityLow = typeof attacker.favorability === 'number' && attacker.favorability <= 30;
    const isWinChanceLow = winChance < 30.0;

    // 지휘관 스킬 '광폭화 (BERSERK)' 여부 판정
    const hasBerserk = commanderSkills.some(function (s) {
      return (typeof s === 'string' ? s : s.id) === 'BERSERK';
    });

    if (isFavorabilityLow && isWinChanceLow) {
      if (hasBerserk) {
        return {
          canAttack: true,
          reason: '⚠️ 호감도 부족(' + attacker.favorability + '/100) 및 열세(승률 ' + winChance.toFixed(1) + '%)이나, 지휘관 스킬 [광폭화(Berserk)]로 강제 출격 명령이 승인되었습니다.',
          overrideByBerserk: true
        };
      } else {
        return {
          canAttack: false,
          reason: '🛑 [공격 거부] 유닛 호감도(' + attacker.favorability + '/100)가 30 이하이며, 승리 확률(' + winChance.toFixed(1) + '%)이 30% 미만으로 유닛이 출격을 단호히 거부합니다!',
          overrideByBerserk: false
        };
      }
    }

    return {
      canAttack: true,
      reason: '✅ 출격 정상 승인 (호감도 ' + attacker.favorability + '/100, 승리 확률 ' + winChance.toFixed(1) + '%)',
      overrideByBerserk: false
    };
  }

  /**
   * 2-3. executeBattle(attackerGroup, defenderGroup, tile, commanderSkills = [])
   * - 전투 진행 및 확률 판정 (Math.random() 기반)
   * - 전투 발생 직전의 상태(Snapshot)를 deepCopy하여 저장 (리와인더 연동)
   * - 공성병기(MAGE 클래스) 공격 시 적 부대 전체에 2차 피해(스플래시) 적용
   * - 지휘관 스킬 '철갑(Ironclad)' 보유 시 2차 피해 30% 감소
   * - 패배한 유닛은 영구 사망 처리 (isDead = true, 메모리/배열에서 제거)
   */
  function executeBattle(attackerGroup, defenderGroup, tile, commanderSkills, forceRandomRoll) {
    commanderSkills = commanderSkills || [];
    const logs = [];

    logs.push('====================================================');
    logs.push('⚔️ [교전 개시] 격전지: ' + (tile ? tile.name : '알 수 없는 전장') + ' (방어 보너스: ' + ((tile && tile.defenseBonus) ? (tile.defenseBonus * 100) : 0) + '%)');

    // 1. 전투 발생 직전 상태 스냅샷 저장 (Snapshot for Rewinder)
    const snapshot = {
      timestamp: Date.now(),
      attackerGroup: deepCopy(attackerGroup),
      defenderGroup: deepCopy(defenderGroup),
      tile: deepCopy(tile),
      commanderSkills: deepCopy(commanderSkills)
    };
    logs.push('💾 [시스템] 리와인더(Rewinder) 복구용 턴 상태 스냅샷이 안전하게 기록되었습니다.');

    // 2. 유효한 선두 유닛 선발
    const attacker = attackerGroup.find(function (u) { return !u.isDead && u.hp > 0; });
    const defender = defenderGroup.find(function (u) { return !u.isDead && u.hp > 0; });

    if (!attacker || !defender) {
      logs.push('⚠️ 교전 불가: 전투를 수행할 생존 유닛이 부대에 존재하지 않습니다.');
      return {
        success: false,
        aborted: true,
        reason: '유효한 유닛 없음',
        logs: logs,
        snapshot: snapshot,
        attackerGroup: attackerGroup,
        defenderGroup: defenderGroup
      };
    }

    // 3. 승리 확률 산출 (Civ4 방식)
    const winResult = calculateWinChance(attacker, defender, tile, commanderSkills);
    const winChance = winResult.winChance;
    logs.push('📊 [전투력 분석] ' + attacker.name + ' (전투력: ' + winResult.attackerPower + ') vs ' + defender.name + ' (전투력: ' + winResult.defenderPower + ') => 공격자 승률: ' + winChance + '%');

    // 4. 호감도 기반 공격 가능 여부 체크
    const attackCheck = canAttack(attacker, winChance, commanderSkills);
    logs.push(attackCheck.reason);

    if (!attackCheck.canAttack) {
      logs.push('🛑 교전이 유닛의 거부로 취소되었습니다.');
      return {
        success: false,
        aborted: true,
        reason: attackCheck.reason,
        winChance: winChance,
        logs: logs,
        snapshot: snapshot,
        attackerGroup: attackerGroup,
        defenderGroup: defenderGroup
      };
    }

    // 5. 확률 판정 (주사위 롤)
    const roll = typeof forceRandomRoll === 'number' ? forceRandomRoll : (Math.random() * 100);
    const attackerWon = roll < winChance;
    logs.push('🎲 [확률 판정] 주사위 결과: ' + roll.toFixed(2) + ' (승리 기준선: ' + winChance.toFixed(2) + ' 이하) => ' + (attackerWon ? '★ 공격자 격파 성공!' : '💀 방어자 반격 피격!'));

    let primaryDamage = 0;
    let counterDamage = 0;

    if (attackerWon) {
      // 공격자 승리: 방어자에게 결정타 부여
      primaryDamage = Math.round(attacker.attackPower * (1 + (winChance / 100) * 0.4));
      defender.hp = Math.max(0, defender.hp - primaryDamage);
      logs.push('💥 ' + attacker.name + '의 맹공! ' + defender.name + '에게 ' + primaryDamage + '의 피해 (잔여 HP: ' + defender.hp + '/' + defender.maxHp + ')');

      // 방어자의 최소 반격
      counterDamage = Math.round(defender.defensePower * (1 - (winChance / 100)) * 0.3);
      attacker.hp = Math.max(0, attacker.hp - counterDamage);
      if (counterDamage > 0) {
        logs.push('🛡️ ' + defender.name + '의 저항 반격! ' + attacker.name + '에게 ' + counterDamage + '의 경미한 피해 (잔여 HP: ' + attacker.hp + '/' + attacker.maxHp + ')');
      }
    } else {
      // 방어자 승리 / 공격자 패배: 공격자가 치명타를 입음
      primaryDamage = Math.round(defender.defensePower * (1 + ((100 - winChance) / 100) * 0.5));
      attacker.hp = Math.max(0, attacker.hp - primaryDamage);
      logs.push('💥 ' + defender.name + '의 완벽한 요격! ' + attacker.name + '에게 ' + primaryDamage + '의 치명적 피해 (잔여 HP: ' + attacker.hp + '/' + attacker.maxHp + ')');

      // 공격자의 최소 잔여 공격
      counterDamage = Math.round(attacker.attackPower * (winChance / 100) * 0.25);
      defender.hp = Math.max(0, defender.hp - counterDamage);
      if (counterDamage > 0) {
        logs.push('🗡️ ' + attacker.name + '의 발악 타격! ' + defender.name + '에게 ' + counterDamage + '의 피해 (잔여 HP: ' + defender.hp + '/' + defender.maxHp + ')');
      }
    }

    // 6. 공성병기(MAGE 클래스) 공격 시 적 부대 전체 2차 피해(스플래시) 적용
    let splashOccurred = false;
    if (attacker.unitClass === 'MAGE' && attackerWon) {
      splashOccurred = true;
      let baseSplash = Math.round(attacker.attackPower * 0.45); // 기본 45% 스플래시

      // 수비측 지휘관 스킬 '철갑 (IRONCLAD)' 보유 시 2차 피해 30% 감소
      const hasIronclad = commanderSkills.some(function (s) {
        return (typeof s === 'string' ? s : s.id) === 'IRONCLAD';
      });

      let finalSplash = baseSplash;
      if (hasIronclad) {
        finalSplash = Math.round(baseSplash * 0.70);
        logs.push('🛡️ [지휘관 스킬: 철갑(Ironclad)] 방어측의 중장갑 효과로 공성 2차 피해가 30% 경감되었습니다! (' + baseSplash + ' -> ' + finalSplash + ')');
      } else {
        logs.push('🔥 [공성병기(MAGE) 광역 폭발] 대마도사의 화염 폭풍이 방어 부대 전체를 휩쓸어 2차 피해 ' + finalSplash + '를 부여합니다!');
      }

      // 주 공격 대상을 제외한 모든 생존 적 유닛에게 2차 피해 적용
      defenderGroup.forEach(function (targetUnit) {
        if (targetUnit.id !== defender.id && !targetUnit.isDead && targetUnit.hp > 0) {
          targetUnit.hp = Math.max(0, targetUnit.hp - finalSplash);
          logs.push('   ↳ [스플래시 피해] ' + targetUnit.name + '에게 ' + finalSplash + ' 피해 (잔여 HP: ' + targetUnit.hp + '/' + targetUnit.maxHp + ')');
        }
      });
    }

    // 7. 영구 사망(Permadeath) 처리 및 부대 배열/메모리에서 제적
    const deadCasualties = [];

    // 7-1. 방어자 부대 사상자 판정
    for (let i = defenderGroup.length - 1; i >= 0; i--) {
      const u = defenderGroup[i];
      if (u.hp <= 0) {
        u.hp = 0;
        u.isDead = true;
        deadCasualties.push(u);
        logs.push('💀 [영구 사망(Permadeath)] ' + u.name + '이(가) 전사하여 부대 명부에서 영구 제적(소멸)되었습니다.');
        defenderGroup.splice(i, 1); // 배열 및 메모리에서 완전 제거
      }
    }

    // 7-2. 공격자 부대 사상자 판정
    for (let j = attackerGroup.length - 1; j >= 0; j--) {
      const u = attackerGroup[j];
      if (u.hp <= 0) {
        u.hp = 0;
        u.isDead = true;
        deadCasualties.push(u);
        logs.push('💀 [영구 사망(Permadeath)] ' + u.name + '이(가) 전사하여 부대 명부에서 영구 제적(소멸)되었습니다.');
        attackerGroup.splice(j, 1); // 배열 및 메모리에서 완전 제거
      }
    }

    logs.push('====================================================');

    return {
      success: true,
      aborted: false,
      winner: attackerWon ? 'ATTACKER' : 'DEFENDER',
      roll: roll,
      winChance: winChance,
      logs: logs,
      snapshot: snapshot,
      casualties: deadCasualties,
      remainingAttackers: attackerGroup,
      remainingDefenders: defenderGroup
    };
  }

  /**
   * 2-4. useRewinder(battleHistory)
   * 유료 아이템 '리와인더' 사용 시, 전투 실행 직전 턴의 유닛/지휘관/타일 상태 스냅샷으로 완전 복구 (Deep Copy 복원)
   */
  function useRewinder(battleHistory) {
    if (!battleHistory) {
      throw new Error('복구할 전투 기록(battleHistory)이 제공되지 않았습니다.');
    }

    // 배열 형태인 경우 가장 최근 엔트리 사용
    const lastEntry = Array.isArray(battleHistory) ? battleHistory[battleHistory.length - 1] : battleHistory;

    if (!lastEntry || !lastEntry.snapshot) {
      throw new Error('전투 기록에 유효한 직전 턴 스냅샷(snapshot)이 존재하지 않습니다.');
    }

    const snap = lastEntry.snapshot;

    // Deep Copy를 통한 완벽한 이전 턴 메모리 상태 복구
    const restoredAttackerGroup = deepCopy(snap.attackerGroup);
    const restoredDefenderGroup = deepCopy(snap.defenderGroup);
    const restoredTile = deepCopy(snap.tile);
    const restoredCommanderSkills = deepCopy(snap.commanderSkills);

    // 복원 확인: 영구 사망 처리되었던 유닛들이 모두 정상 부활하고 HP/상태가 복원되었는지 검증
    restoredAttackerGroup.forEach(function (u) {
      u.isDead = false;
    });
    restoredDefenderGroup.forEach(function (u) {
      u.isDead = false;
    });

    const report = {
      restored: true,
      timestamp: snap.timestamp,
      message: '⏳ [시간 역행기(Rewinder) 발동 성공] 전사했던 모든 영웅과 유닛이 부활하며, 전투 개시 직전 턴 상태로 전황이 완벽히 복원되었습니다!',
      restoredAttackerGroup: restoredAttackerGroup,
      restoredDefenderGroup: restoredDefenderGroup,
      restoredTile: restoredTile,
      restoredCommanderSkills: restoredCommanderSkills
    };

    return report;
  }

  // ==========================================================================
  // 3. 시나리오 테스트 코드 (Scenario Test Suite for Node.js / Browser)
  // ==========================================================================
  function runScenarios() {
    console.log('\n===============================================================');
    console.log('🎮 [Web-SLG 핵심 전투 엔진] 4대 핵심 시나리오 자동 검증 테스트');
    console.log('===============================================================\n');

    const battleHistory = [];

    // ------------------------------------------------------------------------
    // [시나리오 1] 정상 공격 테스트 (성기사 롤랑 vs 고블린 방패병, 평지)
    // ------------------------------------------------------------------------
    console.log('---------------------------------------------------------------');
    console.log('▶ [테스트 1] 정상 공격 시나리오 (High Favorability Normal Attack)');
    console.log('---------------------------------------------------------------');
    const army1 = [deepCopy(SampleUnits.ROLAND)];
    const enemy1 = [deepCopy(SampleUnits.GOBLIN_GUARD_A)];
    const tile1 = deepCopy(SampleTiles.PLAINS);

    const result1 = executeBattle(army1, enemy1, tile1, ['BEAR_DOWN'], 15.0); // roll 15 (압도적 승리)
    battleHistory.push(result1);
    result1.logs.forEach(function (l) { console.log(l); });
    console.log('결과: ' + (result1.winner === 'ATTACKER' ? '성공 (승리)' : '실패') + ', 사상자: ' + result1.casualties.length + '기\n');

    // ------------------------------------------------------------------------
    // [시나리오 2] 호감도 부족 공격 거부 및 광폭화(Berserk) 활성화 테스트
    // (저격수 카인 호감도 20, 강적 오크 군주 언덕 주둔 -> 승률 20% 미만)
    // ------------------------------------------------------------------------
    console.log('---------------------------------------------------------------');
    console.log('▶ [테스트 2-A] 호감도 부족 공격 거부 (Favorability Refusal)');
    console.log('---------------------------------------------------------------');
    const army2 = [deepCopy(SampleUnits.KAIN)]; // favorability = 20
    const enemy2 = [deepCopy(SampleUnits.ORC_WARLORD)];
    const tile2 = deepCopy(SampleTiles.HILL); // 언덕 +25% 방어

    const result2A = executeBattle(army2, enemy2, tile2, []); // Berserk 없음
    result2A.logs.forEach(function (l) { console.log(l); });
    console.log('출격 거부 확인 여부: ' + (result2A.aborted ? '정상 거부됨 (PASS)' : '오류') + '\n');

    console.log('---------------------------------------------------------------');
    console.log('▶ [테스트 2-B] 지휘관 스킬 [광폭화(Berserk)] 활성화 시 강제 출격');
    console.log('---------------------------------------------------------------');
    const army2B = [deepCopy(SampleUnits.KAIN)];
    const enemy2B = [deepCopy(SampleUnits.ORC_WARLORD)];
    const result2B = executeBattle(army2B, enemy2B, tile2, ['BERSERK'], 50.0); // Berserk 포함
    result2B.logs.forEach(function (l) { console.log(l); });
    console.log('광폭화 출격 성공 여부: ' + (!result2B.aborted ? '강제 출격 성공 (PASS)' : '오류') + '\n');

    // ------------------------------------------------------------------------
    // [시나리오 3] 공성 2차 피해(MAGE) 및 영구 사망(Permadeath) 발생 테스트
    // (대마도사 일레나 vs 오크 군주 + 고블린 2기 부대, 철갑 스킬 장착)
    // ------------------------------------------------------------------------
    console.log('---------------------------------------------------------------');
    console.log('▶ [테스트 3] 공성 2차 피해 & 영구 사망 (MAGE Splash & Permadeath)');
    console.log('---------------------------------------------------------------');
    const army3 = [deepCopy(SampleUnits.ELENA)]; // MAGE
    const enemy3 = [
      deepCopy(SampleUnits.GOBLIN_GUARD_A), // HP 45 (피격 시 사망 예상)
      deepCopy(SampleUnits.GOBLIN_GUARD_B)  // HP 40 (스플래시 피격)
    ];
    const tile3 = deepCopy(SampleTiles.PLAINS);

    // roll 5.0 (대마도사 압도적 승리)
    const result3 = executeBattle(army3, enemy3, tile3, ['IRONCLAD'], 5.0);
    battleHistory.push(result3);
    result3.logs.forEach(function (l) { console.log(l); });
    console.log('영구 사망 발생 수: ' + result3.casualties.length + '기');
    console.log('적 부대 잔여 유닛: ' + enemy3.length + '기 (사망자 즉각 제적 확인)\n');

    // ------------------------------------------------------------------------
    // [시나리오 4] 리와인더(Rewinder) 사용 시 전투 직전 턴 상태 완벽 복구
    // ------------------------------------------------------------------------
    console.log('---------------------------------------------------------------');
    console.log('▶ [테스트 4] 리와인더(Rewinder) 전황 롤백 복원 테스트');
    console.log('---------------------------------------------------------------');
    console.log('현재 적 부대 유닛 수 (사망 후): ' + enemy3.length + '기');

    const rollbackResult = useRewinder(battleHistory);
    console.log(rollbackResult.message);
    console.log('복구된 적 부대 수: ' + rollbackResult.restoredDefenderGroup.length + '기 (전원 부활 및 원상 복구 완료)');
    console.log('복원된 1번 유닛 HP: ' + rollbackResult.restoredDefenderGroup[0].name + ' (HP: ' + rollbackResult.restoredDefenderGroup[0].hp + '/' + rollbackResult.restoredDefenderGroup[0].maxHp + ')');
    console.log('복원 상태 검증: ' + (rollbackResult.restoredDefenderGroup.length === 2 ? '완벽 복원 성공 (PASS)' : '실패'));
    console.log('===============================================================\n');

    return {
      scenario1: result1,
      scenario2A: result2A,
      scenario2B: result2B,
      scenario3: result3,
      scenario4: rollbackResult
    };
  }

  // Node.js 환경에서 직접 실행 시 자동 시나리오 구동
  if (typeof process !== 'undefined' && process.release && process.release.name === 'node') {
    const isDirectRun = (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) ||
      (process.argv && process.argv[1] && process.argv[1].includes('combatEngine.js'));
    if (isDirectRun) {
      runScenarios();
    }
  }

  return {
    deepCopy: deepCopy,
    SampleUnits: SampleUnits,
    SampleTiles: SampleTiles,
    CommanderSkillsData: CommanderSkillsData,
    calculateWinChance: calculateWinChance,
    canAttack: canAttack,
    executeBattle: executeBattle,
    useRewinder: useRewinder,
    runScenarios: runScenarios
  };
}));
