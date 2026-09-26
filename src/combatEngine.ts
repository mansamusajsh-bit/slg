/**
 * Web-SLG Core Combat Engine (TypeScript Implementation)
 * Mirrors public/combatEngine.js for interactive UI usage
 */

export interface Promotion {
  id: string;
  name: string;
  atkBonus?: number;
  defBonus?: number;
  bulletDamageReduction?: number;
  siegeBonus?: number;
  firstStrikeRate?: number;
}

export interface UnitSkill {
  id: string;
  name: string;
  powerMultiplier?: number;
  collateralRate?: number;
  ignoreArmorRate?: number;
}

export type UnitClassType = 'KNIGHT' | 'MAGE' | 'MELEE' | 'ARCHER' | 'GUNNER';

export interface Unit {
  id: string;
  name: string;
  unitClass: UnitClassType;
  level: number;
  exp: number;
  favorability: number; // 0 ~ 100
  hp: number;
  maxHp: number;
  attackPower: number;
  defensePower: number;
  promotions: Promotion[];
  skills: UnitSkill[];
  imageUrl: string;
  isDead: boolean;
}

export type TileType = 'PLAINS' | 'FOREST' | 'HILL' | 'MOUNTAIN' | 'CITY';

export interface Tile {
  x: number;
  y: number;
  tileType: TileType;
  name: string;
  defenseBonus: number; // e.g. 0.0, 0.25, 0.40
  bgImageUrl: string;
  description: string;
}

export interface CommanderSkill {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category: 'TACTICAL' | 'DEFENSE' | 'ATTACK';
}

export interface WinChanceResult {
  winChance: number;
  attackerPower: number;
  defenderPower: number;
  tileDefBonus: number;
  hasBearDown: boolean;
  hasPrecisionStrike: boolean;
}

export interface CanAttackResult {
  canAttack: boolean;
  reason: string;
  overrideByBerserk: boolean;
}

export interface BattleSnapshot {
  timestamp: number;
  attackerGroup: Unit[];
  defenderGroup: Unit[];
  tile: Tile;
  commanderSkills: string[];
}

export interface BattleResult {
  success: boolean;
  aborted: boolean;
  reason?: string;
  winner?: 'ATTACKER' | 'DEFENDER';
  roll?: number;
  winChance: number;
  logs: string[];
  snapshot: BattleSnapshot;
  casualties: Unit[];
  remainingAttackers: Unit[];
  remainingDefenders: Unit[];
}

export interface RewinderResult {
  restored: boolean;
  timestamp: number;
  message: string;
  restoredAttackerGroup: Unit[];
  restoredDefenderGroup: Unit[];
  restoredTile: Tile;
  restoredCommanderSkills: string[];
}

// Deep Copy Helper
export function deepCopy<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // fallback
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

// 1-1. 지휘관 스킬 데이터
export const CommanderSkillsData: Record<string, CommanderSkill> = {
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

// 1-2. 타일 데이터 샘플
export const SampleTiles: Record<string, Tile> = {
  PLAINS: {
    x: 2,
    y: 3,
    tileType: 'PLAINS',
    name: '풍요의 평원',
    defenseBonus: 0.0,
    bgImageUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&auto=format&fit=crop&q=80',
    description: '장애물이 없는 개활지. 지형 방어 효과가 전혀 없습니다.'
  },
  FOREST: {
    x: 3,
    y: 3,
    tileType: 'FOREST',
    name: '검은 안개 숲',
    defenseBonus: 0.25,
    bgImageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80',
    description: '울창한 침엽수림. 방어자에게 +25%의 은폐 및 엄폐 방어 보너스를 부여합니다.'
  },
  HILL: {
    x: 4,
    y: 2,
    tileType: 'HILL',
    name: '바람언덕 요충지',
    defenseBonus: 0.25,
    bgImageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&auto=format&fit=crop&q=80',
    description: '고지대 전술 거점. 적의 진격을 저지하며 +25%의 방어력을 제공합니다.'
  },
  CITY: {
    x: 5,
    y: 5,
    tileType: 'CITY',
    name: '에인헤랴르 왕도',
    defenseBonus: 0.40,
    bgImageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    description: '거대한 석조 성벽이 감싸고 있는 2x2 대요새 도시. 강력한 방어력 보너스를 부여합니다.'
  }
};

// 1-3. 유닛 데이터 샘플
export const SampleUnits: Record<string, Unit> = {
  // 1. 성기사 롤랑 (KNIGHT)
  ROLAND: {
    id: 'unit_knight_roland',
    name: '성기사 롤랑 (Roland)',
    unitClass: 'KNIGHT',
    level: 5,
    exp: 420,
    favorability: 85,
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

  // 2. 대마도사 일레나 (MAGE)
  ELENA: {
    id: 'unit_mage_elena',
    name: '대마도사 일레나 (Elena)',
    unitClass: 'MAGE',
    level: 6,
    exp: 680,
    favorability: 60,
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

  // 3. 저격수 카인 (GUNNER)
  KAIN: {
    id: 'unit_gunner_kain',
    name: '저격수 카인 (Kain)',
    unitClass: 'GUNNER',
    level: 3,
    exp: 150,
    favorability: 20, // 30 이하! (거부 판정 테스트용)
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

  // 적 유닛
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

/**
 * 2-1. calculateWinChance(attacker, defender, tile, commanderSkills = [])
 */
export function calculateWinChance(
  attacker: Unit,
  defender: Unit,
  tile: Tile,
  commanderSkills: string[] = []
): WinChanceResult {
  // 1. 공격자 승급/스킬 배율 계산
  let atkMultiplier = 1.0;
  if (Array.isArray(attacker.promotions)) {
    attacker.promotions.forEach((promo) => {
      if (promo.atkBonus) atkMultiplier += promo.atkBonus;
    });
  }

  // 지휘관 스킬 '베어 다운 (BEAR_DOWN)': 선두 공격력 +20%
  const hasBearDown = commanderSkills.includes('BEAR_DOWN');
  if (hasBearDown) {
    atkMultiplier += 0.20;
  }

  const finalAtkPower = attacker.attackPower * atkMultiplier;

  // 2. 방어자 지형 보너스 및 승급/스킬 배율 계산
  let tileDefBonus = tile && typeof tile.defenseBonus === 'number' ? tile.defenseBonus : 0.0;

  // 지휘관 스킬 '세밀한 타격 (PRECISION_STRIKE)': 적 타일 방어 보너스 100% 무시
  const hasPrecisionStrike = commanderSkills.includes('PRECISION_STRIKE');
  if (hasPrecisionStrike) {
    tileDefBonus = 0.0;
  }

  let defMultiplier = 1.0 + tileDefBonus;
  if (Array.isArray(defender.promotions)) {
    defender.promotions.forEach((promo) => {
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
 */
export function canAttack(
  attacker: Unit,
  winChance: number,
  commanderSkills: string[] = []
): CanAttackResult {
  const isFavorabilityLow = typeof attacker.favorability === 'number' && attacker.favorability <= 30;
  const isWinChanceLow = winChance < 30.0;

  const hasBerserk = commanderSkills.includes('BERSERK');

  if (isFavorabilityLow && isWinChanceLow) {
    if (hasBerserk) {
      return {
        canAttack: true,
        reason: `⚠️ 호감도 부족(${attacker.favorability}/100) 및 열세(승률 ${winChance.toFixed(1)}%)이나, 지휘관 스킬 [광폭화(Berserk)]로 강제 출격 명령이 승인되었습니다.`,
        overrideByBerserk: true
      };
    } else {
      return {
        canAttack: false,
        reason: `🛑 [공격 거부] 유닛 호감도(${attacker.favorability}/100)가 30 이하이며, 승리 확률(${winChance.toFixed(1)}%)이 30% 미만으로 유닛이 출격을 단호히 거부합니다!`,
        overrideByBerserk: false
      };
    }
  }

  return {
    canAttack: true,
    reason: `✅ 출격 정상 승인 (호감도 ${attacker.favorability}/100, 승리 확률 ${winChance.toFixed(1)}%)`,
    overrideByBerserk: false
  };
}

/**
 * 2-3. executeBattle(attackerGroup, defenderGroup, tile, commanderSkills = [], forceRandomRoll?)
 */
export function executeBattle(
  attackerGroup: Unit[],
  defenderGroup: Unit[],
  tile: Tile,
  commanderSkills: string[] = [],
  forceRandomRoll?: number
): BattleResult {
  const logs: string[] = [];

  logs.push('====================================================');
  logs.push(`⚔️ [교전 개시] 격전지: ${tile ? tile.name : '알 수 없는 전장'} (방어 보너스: ${tile ? tile.defenseBonus * 100 : 0}%)`);

  // 1. 전투 발생 직전 상태 스냅샷 저장
  const snapshot: BattleSnapshot = {
    timestamp: Date.now(),
    attackerGroup: deepCopy(attackerGroup),
    defenderGroup: deepCopy(defenderGroup),
    tile: deepCopy(tile),
    commanderSkills: deepCopy(commanderSkills)
  };
  logs.push('💾 [시스템] 리와인더(Rewinder) 복구용 턴 상태 스냅샷이 안전하게 기록되었습니다.');

  // 2. 유효한 선두 유닛 선발
  const attacker = attackerGroup.find((u) => !u.isDead && u.hp > 0);
  const defender = defenderGroup.find((u) => !u.isDead && u.hp > 0);

  if (!attacker || !defender) {
    logs.push('⚠️ 교전 불가: 전투를 수행할 생존 유닛이 부대에 존재하지 않습니다.');
    return {
      success: false,
      aborted: true,
      reason: '유효한 유닛 없음',
      winChance: 0,
      logs,
      snapshot,
      casualties: [],
      remainingAttackers: attackerGroup,
      remainingDefenders: defenderGroup
    };
  }

  // 3. 승리 확률 산출
  const winResult = calculateWinChance(attacker, defender, tile, commanderSkills);
  const winChance = winResult.winChance;
  logs.push(`📊 [전투력 분석] ${attacker.name} (전투력: ${winResult.attackerPower}) vs ${defender.name} (전투력: ${winResult.defenderPower}) => 공격자 승률: ${winChance}%`);

  // 4. 호감도 기반 공격 가능 여부 체크
  const attackCheck = canAttack(attacker, winChance, commanderSkills);
  logs.push(attackCheck.reason);

  if (!attackCheck.canAttack) {
    logs.push('🛑 교전이 유닛의 거부로 취소되었습니다.');
    return {
      success: false,
      aborted: true,
      reason: attackCheck.reason,
      winChance,
      logs,
      snapshot,
      casualties: [],
      remainingAttackers: attackerGroup,
      remainingDefenders: defenderGroup
    };
  }

  // 5. 확률 판정 (주사위 롤)
  const roll = typeof forceRandomRoll === 'number' ? forceRandomRoll : Math.random() * 100;
  const attackerWon = roll < winChance;
  logs.push(`🎲 [확률 판정] 주사위 결과: ${roll.toFixed(2)} (승리 기준선: ${winChance.toFixed(2)} 이하) => ${attackerWon ? '★ 공격자 격파 성공!' : '💀 방어자 반격 피격!'}`);

  let primaryDamage = 0;
  let counterDamage = 0;

  if (attackerWon) {
    // 공격자 승리
    primaryDamage = Math.round(attacker.attackPower * (1 + (winChance / 100) * 0.4));
    defender.hp = Math.max(0, defender.hp - primaryDamage);
    logs.push(`💥 ${attacker.name}의 맹공! ${defender.name}에게 ${primaryDamage}의 피해 (잔여 HP: ${defender.hp}/${defender.maxHp})`);

    // 방어자 경미한 반격
    counterDamage = Math.round(defender.defensePower * (1 - (winChance / 100)) * 0.3);
    attacker.hp = Math.max(0, attacker.hp - counterDamage);
    if (counterDamage > 0) {
      logs.push(`🛡️ ${defender.name}의 저항 반격! ${attacker.name}에게 ${counterDamage}의 경미한 피해 (잔여 HP: ${attacker.hp}/${attacker.maxHp})`);
    }
  } else {
    // 방어자 승리
    primaryDamage = Math.round(defender.defensePower * (1 + ((100 - winChance) / 100) * 0.5));
    attacker.hp = Math.max(0, attacker.hp - primaryDamage);
    logs.push(`💥 ${defender.name}의 완벽한 요격! ${attacker.name}에게 ${primaryDamage}의 치명적 피해 (잔여 HP: ${attacker.hp}/${attacker.maxHp})`);

    // 공격자 경미한 발악
    counterDamage = Math.round(attacker.attackPower * (winChance / 100) * 0.25);
    defender.hp = Math.max(0, defender.hp - counterDamage);
    if (counterDamage > 0) {
      logs.push(`🗡️ ${attacker.name}의 발악 타격! ${defender.name}에게 ${counterDamage}의 피해 (잔여 HP: ${defender.hp}/${defender.maxHp})`);
    }
  }

  // 6. 공성병기(MAGE 클래스) 공격 시 적 부대 전체 2차 피해(스플래시) 적용
  if (attacker.unitClass === 'MAGE' && attackerWon) {
    const baseSplash = Math.round(attacker.attackPower * 0.45);
    const hasIronclad = commanderSkills.includes('IRONCLAD');

    let finalSplash = baseSplash;
    if (hasIronclad) {
      finalSplash = Math.round(baseSplash * 0.70);
      logs.push(`🛡️ [지휘관 스킬: 철갑(Ironclad)] 방어측의 중장갑 효과로 공성 2차 피해가 30% 경감되었습니다! (${baseSplash} -> ${finalSplash})`);
    } else {
      logs.push(`🔥 [공성병기(MAGE) 광역 폭발] 대마도사의 화염 폭풍이 방어 부대 전체를 휩쓸어 2차 피해 ${finalSplash}를 부여합니다!`);
    }

    defenderGroup.forEach((targetUnit) => {
      if (targetUnit.id !== defender.id && !targetUnit.isDead && targetUnit.hp > 0) {
        targetUnit.hp = Math.max(0, targetUnit.hp - finalSplash);
        logs.push(`   ↳ [스플래시 피해] ${targetUnit.name}에게 ${finalSplash} 피해 (잔여 HP: ${targetUnit.hp}/${targetUnit.maxHp})`);
      }
    });
  }

  // 7. 영구 사망(Permadeath) 처리 및 부대 배열/메모리에서 제적
  const deadCasualties: Unit[] = [];

  for (let i = defenderGroup.length - 1; i >= 0; i--) {
    const u = defenderGroup[i];
    if (u.hp <= 0) {
      u.hp = 0;
      u.isDead = true;
      deadCasualties.push(u);
      logs.push(`💀 [영구 사망(Permadeath)] ${u.name}이(가) 전사하여 부대 명부에서 영구 제적(소멸)되었습니다.`);
      defenderGroup.splice(i, 1);
    }
  }

  for (let j = attackerGroup.length - 1; j >= 0; j--) {
    const u = attackerGroup[j];
    if (u.hp <= 0) {
      u.hp = 0;
      u.isDead = true;
      deadCasualties.push(u);
      logs.push(`💀 [영구 사망(Permadeath)] ${u.name}이(가) 전사하여 부대 명부에서 영구 제적(소멸)되었습니다.`);
      attackerGroup.splice(j, 1);
    }
  }

  logs.push('====================================================');

  return {
    success: true,
    aborted: false,
    winner: attackerWon ? 'ATTACKER' : 'DEFENDER',
    roll,
    winChance,
    logs,
    snapshot,
    casualties: deadCasualties,
    remainingAttackers: attackerGroup,
    remainingDefenders: defenderGroup
  };
}

/**
 * 2-4. useRewinder(battleHistory)
 */
export function useRewinder(battleHistory: BattleResult[] | BattleResult): RewinderResult {
  if (!battleHistory) {
    throw new Error('복구할 전투 기록(battleHistory)이 제공되지 않았습니다.');
  }

  const lastEntry = Array.isArray(battleHistory) ? battleHistory[battleHistory.length - 1] : battleHistory;

  if (!lastEntry || !lastEntry.snapshot) {
    throw new Error('전투 기록에 유효한 직전 턴 스냅샷(snapshot)이 존재하지 않습니다.');
  }

  const snap = lastEntry.snapshot;

  const restoredAttackerGroup = deepCopy(snap.attackerGroup);
  const restoredDefenderGroup = deepCopy(snap.defenderGroup);
  const restoredTile = deepCopy(snap.tile);
  const restoredCommanderSkills = deepCopy(snap.commanderSkills);

  restoredAttackerGroup.forEach((u) => {
    u.isDead = false;
  });
  restoredDefenderGroup.forEach((u) => {
    u.isDead = false;
  });

  return {
    restored: true,
    timestamp: snap.timestamp,
    message: '⏳ [시간 역행기(Rewinder) 발동 성공] 전사했던 모든 영웅과 유닛이 부활하며, 전투 개시 직전 턴 상태로 전황이 완벽히 복원되었습니다!',
    restoredAttackerGroup,
    restoredDefenderGroup,
    restoredTile,
    restoredCommanderSkills
  };
}
