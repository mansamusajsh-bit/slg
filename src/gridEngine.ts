/**
 * ============================================================================
 * [Web-SLG] Core 2D Grid & ZOC Engine with Civilization 4 "Stack of Doom"
 * ============================================================================
 * 
 * 주요 기능:
 * 1. 타일 데이터 구조:
 *    - 각 타일(GridTile)은 `units` 배열을 가지며 최대 100개의 유닛을 중첩(Stack)할 수 있습니다.
 * 2. 맵 렌더링:
 *    - 타일에는 가장 높은 전투력을 가진 대표 유닛 1개의 아이콘과 중첩 유닛 수 카운트 칩(예: x15, x100)을 렌더링합니다.
 * 3. 유닛 선택 및 이동:
 *    - 타일 터치 시 하단에 '부대 목록 (Stack Panel)' 활성화.
 *    - [전체 선택 후 이동] 및 [동일 클래스 선택 후 이동] 기능 제공.
 *    - 이동 시 부대 내 유닛 중 가장 잔여 AP가 적은 유닛의 이동력(minAP)을 기준으로 이동 가능 거리가 제한됩니다.
 *    - 지휘관 스킬 '신속한 진격' 보유 시 이동 AP 소모는 50% 할인됩니다.
 * 4. ZOC (포위망/전선) 알고리즘:
 *    - 적 부대(1개 이상 유닛 보유 타일) 2개 이상이 인접하거나 한 칸 건너 위치할 경우,
 *      형성되는 경계 구역(ZOC) 진입 시 부대 전체의 이동이 즉시 강제 중단됩니다.
 */

export const MAX_STACK_PER_TILE = 100; // 타일당 최대 100개 유닛 중첩

export interface GridUnit {
  id: string;
  name: string;
  owner: 'PLAYER' | 'ENEMY';
  unitClass: 'KNIGHT' | 'MAGE' | 'MELEE' | 'ARCHER' | 'GUNNER';
  baseAP: number;
  currentAP: number;
  x: number;
  y: number;
  isDead: boolean;
  isSafe: boolean;      // 마을/도시 주둔 시 안전 상태
  isDisabled: boolean;  // 유지비 부족 시 비활성화
  upkeepCost: number;   // 턴당 유지비
  hp: number;
  maxHp: number;
  attackPower: number;
  defensePower: number;
  imageUrl: string;
}

export interface GridTile {
  x: number;
  y: number;
  type: 'PLAIN' | 'ROUGH' | 'VILLAGE' | 'CITY';
  name: string;
  baseAPCost: number;
  defenseBonus: number;
  isSafeZone: boolean;
  cityGroupId?: string;
  color?: string;
  units: GridUnit[]; // 문명 4 스타일 Stack of Doom: 최대 100개 유닛 중첩
}

export interface GridCommander {
  skills: {
    rapidAdvance: boolean; // '신속한 진격' 스킬 보유 여부 (이동력 소모 50% 할인)
    [key: string]: any;
  };
  gold: number;
  turn: number;
}

export interface ZOCTileInfo {
  x: number;
  y: number;
  isZOC: boolean;
  enemyTileCoords: { x: number; y: number }[];
  enemyNames: string[];
  reason: string;
}

export interface ZOCResult {
  zocMap: { [key: string]: ZOCTileInfo };
  zocList: ZOCTileInfo[];
}

export interface MovableTileInfo {
  x: number;
  y: number;
  apCost: number;
  path: { x: number; y: number }[];
  isZOC: boolean;
  isEnemyOccupied: boolean;
  targetEnemyCount: number;
  representativeEnemy: GridUnit | null;
}

export interface StackMoveResult {
  success: boolean;
  stoppedByZOC?: boolean;
  zocStopReason?: string;
  combatTriggered?: boolean;
  targetEnemies?: GridUnit[];
  finalX?: number;
  finalY?: number;
  apConsumed?: number;
  remainingMinAP?: number;
  isSafe?: boolean;
  reason?: string;
  logs: string[];
}

export interface TurnEndResult {
  success: boolean;
  newTurn: number;
  remainingGold: number;
  totalUpkeepDeducted: number;
  disabledCount: number;
  logs: string[];
}

export const GRID_COLS = 8;  // 가로 8열 (X: 0 ~ 7)
export const GRID_ROWS = 14; // 세로 14행 (Y: 0 ~ 13) - 9:16 모바일 세로형 규격

export const TILE_TYPES: { [key: string]: Omit<GridTile, 'x' | 'y' | 'units'> } = {
  PLAIN: {
    type: 'PLAIN',
    name: '일반 평지',
    baseAPCost: 1.0,
    defenseBonus: 0.0,
    isSafeZone: false,
    color: '#1e293b'
  },
  ROUGH: {
    type: 'ROUGH',
    name: '험지 (바위언덕)',
    baseAPCost: 2.0,
    defenseBonus: 0.20, // 방어 보너스 +20%
    isSafeZone: false,
    color: '#334155'
  },
  VILLAGE: {
    type: 'VILLAGE',
    name: '평화로운 마을 (1x1)',
    baseAPCost: 1.0,
    defenseBonus: 0.10,
    isSafeZone: true,   // 안전지대 (유지비 면제)
    color: '#064e3b'
  },
  CITY: {
    type: 'CITY',
    name: '에인헤랴르 요새 도시 (2x2)',
    baseAPCost: 1.0,
    defenseBonus: 0.35,
    isSafeZone: true,   // 안전지대 (유지비 면제)
    color: '#1e3a8a'
  }
};

export function deepCopy<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch (e) {
      // Fallback
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 타일 내 살아있는 유닛 중 최고 전투력(attackPower)을 가진 대표 유닛 반환
 */
export function getRepresentativeUnit(units: GridUnit[]): GridUnit | null {
  if (!units || units.length === 0) return null;
  const living = units.filter((u) => !u.isDead);
  if (living.length === 0) return null;

  return living.reduce((best, curr) => {
    if (curr.attackPower > best.attackPower) return curr;
    if (curr.attackPower === best.attackPower && curr.hp > best.hp) return curr;
    return best;
  }, living[0]);
}

/**
 * 선택된 부대 내 살아있는 유닛 중 '가장 잔여 AP가 적은 유닛의 이동력(minAP)' 계산
 */
export function getStackMinAP(units: GridUnit[]): number {
  if (!units || units.length === 0) return 0;
  const activeUnits = units.filter((u) => !u.isDead && !u.isDisabled);
  if (activeUnits.length === 0) return 0;
  return Math.min(...activeUnits.map((u) => u.currentAP));
}

/**
 * 8x14 기본 그리드 맵 생성 (각 타일 units: [] 포함)
 */
export function createDefaultGrid(): GridTile[][] {
  const grid: GridTile[][] = [];

  for (let y = 0; y < GRID_ROWS; y++) {
    const row: GridTile[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      let tileData: GridTile = {
        x: x,
        y: y,
        type: 'PLAIN',
        name: TILE_TYPES.PLAIN.name,
        baseAPCost: TILE_TYPES.PLAIN.baseAPCost,
        defenseBonus: TILE_TYPES.PLAIN.defenseBonus,
        isSafeZone: TILE_TYPES.PLAIN.isSafeZone,
        units: []
      };

      // 1. 도시 타일 (2x2 Cell): x: 4~5, y: 1~2 (우상단 요새 도시)
      if ((x === 4 || x === 5) && (y === 1 || y === 2)) {
        tileData = {
          x: x,
          y: y,
          type: 'CITY',
          name: TILE_TYPES.CITY.name,
          baseAPCost: TILE_TYPES.CITY.baseAPCost,
          defenseBonus: TILE_TYPES.CITY.defenseBonus,
          isSafeZone: TILE_TYPES.CITY.isSafeZone,
          cityGroupId: 'CITY_NORTH',
          units: []
        };
      }
      // 2. 마을 타일 (1x1 Cell): x: 1, y: 11 (아군 본진 근처 마을)
      else if (x === 1 && y === 11) {
        tileData = {
          x: x,
          y: y,
          type: 'VILLAGE',
          name: TILE_TYPES.VILLAGE.name,
          baseAPCost: TILE_TYPES.VILLAGE.baseAPCost,
          defenseBonus: TILE_TYPES.VILLAGE.defenseBonus,
          isSafeZone: TILE_TYPES.VILLAGE.isSafeZone,
          units: []
        };
      }
      // 3. 중립 마을 타일 (1x1 Cell): x: 6, y: 8 (중앙 협곡 통로 마을)
      else if (x === 6 && y === 8) {
        tileData = {
          x: x,
          y: y,
          type: 'VILLAGE',
          name: '국경 보급 마을 (1x1)',
          baseAPCost: TILE_TYPES.VILLAGE.baseAPCost,
          defenseBonus: TILE_TYPES.VILLAGE.defenseBonus,
          isSafeZone: TILE_TYPES.VILLAGE.isSafeZone,
          units: []
        };
      }
      // 4. 험지 타일 (Rough): 전술적 요충지와 통로
      else if (
        (x === 2 && y === 4) || (x === 3 && y === 4) ||
        (x === 0 && y === 6) || (x === 1 && y === 6) ||
        (x === 4 && y === 7) || (x === 5 && y === 7) ||
        (x === 2 && y === 9) || (x === 3 && y === 9) ||
        (x === 6 && y === 12)
      ) {
        tileData = {
          x: x,
          y: y,
          type: 'ROUGH',
          name: TILE_TYPES.ROUGH.name,
          baseAPCost: TILE_TYPES.ROUGH.baseAPCost,
          defenseBonus: TILE_TYPES.ROUGH.defenseBonus,
          isSafeZone: TILE_TYPES.ROUGH.isSafeZone,
          units: []
        };
      }

      row.push(tileData);
    }
    grid.push(row);
  }

  return grid;
}

export function createDefaultCommander(): GridCommander {
  return {
    skills: {
      rapidAdvance: true // '신속한 진격' 스킬 기본 보유 (타일 이동 소모 50% 할인)
    },
    gold: 300,
    turn: 1
  };
}

/**
 * 초기 테스트 유닛 생성 및 타일 배치 (한 타일에 10개 이상의 유닛 중첩 배치 구현)
 * - 아군 본진 타일 (2, 11)에 총 15개의 유닛(Stack of Doom x15) 초기 배치!
 * - 적군 전선 타일 (2, 6)에 오크 방패병 4기(x4)
 * - 적군 전선 타일 (4, 6)에 오크 투창병 3기(x3)
 * - 적군 도시 타일 (4, 2)에 전쟁군주 군단 5기(x5)
 */
export function createDefaultUnitsAndPopulateGrid(grid: GridTile[][]): { grid: GridTile[][]; allUnits: GridUnit[] } {
  const newGrid = deepCopy(grid);
  const allUnits: GridUnit[] = [];

  // 1. 아군 15기 중첩 부대 생성 (위치: x: 2, y: 11)
  const playerStackCoords = { x: 2, y: 11 };

  // 1-1. 대표 유닛: 성기사 롤랑 (최고 공격력 58, AP 4)
  const roland: GridUnit = {
    id: 'U_PL_01_ROLAND',
    name: '성기사 롤랑 (총사령관)',
    owner: 'PLAYER',
    unitClass: 'KNIGHT',
    baseAP: 4,
    currentAP: 4,
    x: playerStackCoords.x,
    y: playerStackCoords.y,
    isDead: false,
    isSafe: false,
    isDisabled: false,
    upkeepCost: 10,
    hp: 140,
    maxHp: 140,
    attackPower: 58,
    defensePower: 45,
    imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80'
  };
  allUnits.push(roland);

  // 1-2. 성기사 호위 기병 4기 (AP 4)
  for (let i = 1; i <= 4; i++) {
    allUnits.push({
      id: `U_PL_KNIGHT_${i}`,
      name: `성기사 근위대 0${i}호`,
      owner: 'PLAYER',
      unitClass: 'KNIGHT',
      baseAP: 4,
      currentAP: 4,
      x: playerStackCoords.x,
      y: playerStackCoords.y,
      isDead: false,
      isSafe: false,
      isDisabled: false,
      upkeepCost: 8,
      hp: 110,
      maxHp: 110,
      attackPower: 50,
      defensePower: 40,
      imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 1-3. 아케인 마법사 3기 (공격력 높지만 AP 3으로 낮음 -> 부대 전체 이동력 제약 검증용)
  for (let i = 1; i <= 3; i++) {
    allUnits.push({
      id: `U_PL_MAGE_${i}`,
      name: `아케인 비전마도사 0${i}호`,
      owner: 'PLAYER',
      unitClass: 'MAGE',
      baseAP: 3,
      currentAP: 3, // AP 3 (기사보다 느림)
      x: playerStackCoords.x,
      y: playerStackCoords.y,
      isDead: false,
      isSafe: false,
      isDisabled: false,
      upkeepCost: 12,
      hp: 75,
      maxHp: 75,
      attackPower: 55,
      defensePower: 20,
      imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 1-4. 엘프 궁병 4기 (AP 3)
  for (let i = 1; i <= 4; i++) {
    allUnits.push({
      id: `U_PL_ARCHER_${i}`,
      name: `엘프 저격궁수 0${i}호`,
      owner: 'PLAYER',
      unitClass: 'ARCHER',
      baseAP: 3,
      currentAP: 3,
      x: playerStackCoords.x,
      y: playerStackCoords.y,
      isDead: false,
      isSafe: false,
      isDisabled: false,
      upkeepCost: 7,
      hp: 80,
      maxHp: 80,
      attackPower: 44,
      defensePower: 25,
      imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 1-5. 왕실 중장보병 3기 (AP 3) -> 총 1 + 4 + 3 + 4 + 3 = 15기 중첩!
  for (let i = 1; i <= 3; i++) {
    allUnits.push({
      id: `U_PL_MELEE_${i}`,
      name: `왕실 철갑보병 0${i}호`,
      owner: 'PLAYER',
      unitClass: 'MELEE',
      baseAP: 3,
      currentAP: 3,
      x: playerStackCoords.x,
      y: playerStackCoords.y,
      isDead: false,
      isSafe: false,
      isDisabled: false,
      upkeepCost: 6,
      hp: 100,
      maxHp: 100,
      attackPower: 38,
      defensePower: 35,
      imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 2. 적군 부대 배치
  // 2-1. 적군 전선 A: 오크 방패병 4기 (위치: x: 2, y: 6) -> Stack x4
  for (let i = 1; i <= 4; i++) {
    allUnits.push({
      id: `U_EN_SHIELD_${i}`,
      name: `오크 방패병단 0${i}`,
      owner: 'ENEMY',
      unitClass: 'MELEE',
      baseAP: 3,
      currentAP: 3,
      x: 2,
      y: 6,
      isDead: false,
      isSafe: false,
      isDisabled: false,
      upkeepCost: 8,
      hp: 70,
      maxHp: 70,
      attackPower: 36,
      defensePower: 40,
      imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 2-2. 적군 전선 B: 오크 투창병 3기 (위치: x: 4, y: 6) -> Stack x3 (A와 가로 1칸 간격 전선 형성!)
  for (let i = 1; i <= 3; i++) {
    allUnits.push({
      id: `U_EN_SPEAR_${i}`,
      name: `오크 정예투창병 0${i}`,
      owner: 'ENEMY',
      unitClass: 'ARCHER',
      baseAP: 3,
      currentAP: 3,
      x: 4,
      y: 6,
      isDead: false,
      isSafe: false,
      isDisabled: false,
      upkeepCost: 8,
      hp: 55,
      maxHp: 55,
      attackPower: 42,
      defensePower: 22,
      imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 2-3. 적군 북부 요새 도시 주둔군: 오크 전쟁군주 1기 + 엘리트 4기 (위치: x: 4, y: 2) -> Stack x5
  const warlord: GridUnit = {
    id: 'U_EN_WARLORD_BOSS',
    name: '오크 대군주 그롬 (Boss)',
    owner: 'ENEMY',
    unitClass: 'MELEE',
    baseAP: 3,
    currentAP: 3,
    x: 4,
    y: 2,
    isDead: false,
    isSafe: true,
    isDisabled: false,
    upkeepCost: 25,
    hp: 160,
    maxHp: 160,
    attackPower: 70,
    defensePower: 50,
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80'
  };
  allUnits.push(warlord);

  for (let i = 1; i <= 4; i++) {
    allUnits.push({
      id: `U_EN_ELITE_${i}`,
      name: `군주 직속 흑철경호대 0${i}`,
      owner: 'ENEMY',
      unitClass: 'MELEE',
      baseAP: 3,
      currentAP: 3,
      x: 4,
      y: 2,
      isDead: false,
      isSafe: true,
      isDisabled: false,
      upkeepCost: 15,
      hp: 90,
      maxHp: 90,
      attackPower: 48,
      defensePower: 38,
      imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80'
    });
  }

  // 생성된 유닛들을 각 타일의 units 배열에 분배 적재
  allUnits.forEach((u) => {
    if (newGrid[u.y] && newGrid[u.y][u.x]) {
      if (newGrid[u.y][u.x].units.length < MAX_STACK_PER_TILE) {
        newGrid[u.y][u.x].units.push(u);
      }
    }
  });

  return { grid: newGrid, allUnits };
}

/**
 * [이동 비용 계산 함수]
 * commanderSkills.rapidAdvance === true 일 경우 타일 이동 소모 AP 50% 할인
 */
export function calculateTileCost(tile: GridTile, commanderSkills?: { rapidAdvance?: boolean }): number {
  if (!tile) return 1.0;
  const isRapid = commanderSkills && !!commanderSkills.rapidAdvance;
  const discount = isRapid ? 0.5 : 1.0;
  return tile.baseAPCost * discount;
}

/**
 * [ZOC 판정 알고리즘 - Stack of Doom 지원]
 * 적 부대(1개 이상 유닛 보유 타일) 2개 이상이 인접하거나 한 칸 건너 위치할 경우,
 * 형성되는 경계 구역(ZOC) 정의
 */
export function calculateZOCZones(grid: GridTile[][]): ZOCResult {
  // 1. 살아있는 적 유닛이 1기 이상 주둔한 타일 목록 수집
  const enemyTiles: { x: number; y: number; units: GridUnit[]; tile: GridTile }[] = [];

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const tile = grid[y][x];
      const livingEnemies = tile.units.filter((u) => u.owner === 'ENEMY' && !u.isDead);
      if (livingEnemies.length > 0) {
        enemyTiles.push({ x, y, units: livingEnemies, tile });
      }
    }
  }

  const zocMap: { [key: string]: ZOCTileInfo } = {};
  const zocList: ZOCTileInfo[] = [];

  function markZOC(x: number, y: number, t1: typeof enemyTiles[0], t2: typeof enemyTiles[0], reason: string) {
    if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return;
    const key = `${x},${y}`;

    const rep1 = getRepresentativeUnit(t1.units)?.name || '적 부대';
    const rep2 = getRepresentativeUnit(t2.units)?.name || '적 부대';

    if (!zocMap[key]) {
      zocMap[key] = {
        x,
        y,
        isZOC: true,
        enemyTileCoords: [{ x: t1.x, y: t1.y }, { x: t2.x, y: t2.y }],
        enemyNames: [rep1, rep2],
        reason
      };
      zocList.push(zocMap[key]);
    } else {
      const exists1 = zocMap[key].enemyTileCoords.some(c => c.x === t1.x && c.y === t1.y);
      if (!exists1) zocMap[key].enemyTileCoords.push({ x: t1.x, y: t1.y });
      const exists2 = zocMap[key].enemyTileCoords.some(c => c.x === t2.x && c.y === t2.y);
      if (!exists2) zocMap[key].enemyTileCoords.push({ x: t2.x, y: t2.y });
    }
  }

  // 2. 적 부대 타일 간의 거리 검사
  for (let i = 0; i < enemyTiles.length; i++) {
    for (let j = i + 1; j < enemyTiles.length; j++) {
      const t1 = enemyTiles[i];
      const t2 = enemyTiles[j];

      const dx = Math.abs(t1.x - t2.x);
      const dy = Math.abs(t1.y - t2.y);

      let isFrontline = false;
      let reason = '';

      // Case A: 인접 타일 결착 전선 (dx<=1, dy<=1)
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        isFrontline = true;
        reason = `적군 인접 밀집 결착 전선 (${t1.x},${t1.y})~(${t2.x},${t2.y})`;
      }
      // Case B: 가로 1타일 건너뛴 전선 (dx === 2, dy === 0)
      else if (dx === 2 && dy === 0) {
        isFrontline = true;
        reason = `적군 횡방향 포위망 전선 (${t1.x},${t1.y})~(${t2.x},${t2.y})`;
        const midX = (t1.x + t2.x) / 2;
        markZOC(midX, t1.y, t1, t2, '적군 중앙 통로 관통 포위망 (ZOC)');
      }
      // Case C: 세로 1타일 건너뛴 전선 (dx === 0, dy === 2)
      else if (dx === 0 && dy === 2) {
        isFrontline = true;
        reason = `적군 종방향 포위망 전선 (${t1.x},${t1.y})~(${t2.x},${t2.y})`;
        const midY = (t1.y + t2.y) / 2;
        markZOC(t1.x, midY, t1, t2, '적군 중앙 통로 관통 포위망 (ZOC)');
      }
      // Case D: 대각선 1타일 건너뛴 전선 (dx<=2, dy<=2)
      else if ((dx === 2 && dy <= 2) || (dy === 2 && dx <= 2)) {
        isFrontline = true;
        reason = `적군 대각선 협공 방어선 (${t1.x},${t1.y})~(${t2.x},${t2.y})`;
        const stepX = Math.sign(t2.x - t1.x);
        const stepY = Math.sign(t2.y - t1.y);
        if (stepX !== 0) markZOC(t1.x + stepX, t1.y, t1, t2, '적군 전선 간극 타일 (ZOC)');
        if (stepY !== 0) markZOC(t1.x, t1.y + stepY, t1, t2, '적군 전선 간극 타일 (ZOC)');
      }

      if (isFrontline) {
        const neighbors = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];

        neighbors.forEach((n) => {
          markZOC(t1.x + n[0], t1.y + n[1], t1, t2, `${reason} 외곽 경계선`);
          markZOC(t2.x + n[0], t2.y + n[1], t1, t2, `${reason} 외곽 경계선`);
        });
      }
    }
  }

  return { zocMap, zocList };
}

/**
 * [부대 중첩 이동 가능 타일 및 경로 계산 함수]
 * - 이동 시 부대 내 유닛 중 '가장 잔여 AP가 적은 유닛의 이동력(minAP)'을 기준으로 이동 가능 거리가 제한됩니다.
 * - 지휘관 스킬 '신속한 진격' 보유 시 이동 AP 소모는 50% 할인됩니다.
 * - 타일 수용 한도 (최대 100개) 초과 시 이동 불가.
 */
export function calculateStackMovableTiles(
  selectedUnits: GridUnit[],
  startTileCoord: { x: number; y: number },
  grid: GridTile[][],
  commanderSkills?: { rapidAdvance?: boolean },
  zocMap?: { [key: string]: ZOCTileInfo } | null
): { [key: string]: MovableTileInfo } {
  if (!selectedUnits || selectedUnits.length === 0) return {};

  const minAP = getStackMinAP(selectedUnits);
  if (minAP <= 0) return {};

  const reachable: { [key: string]: MovableTileInfo } = {};
  const startKey = `${startTileCoord.x},${startTileCoord.y}`;

  const queue: { x: number; y: number; costSoFar: number; path: { x: number; y: number }[] }[] = [
    { x: startTileCoord.x, y: startTileCoord.y, costSoFar: 0, path: [{ x: startTileCoord.x, y: startTileCoord.y }] }
  ];

  reachable[startKey] = {
    x: startTileCoord.x,
    y: startTileCoord.y,
    apCost: 0,
    path: [{ x: startTileCoord.x, y: startTileCoord.y }],
    isZOC: false,
    isEnemyOccupied: false,
    targetEnemyCount: 0,
    representativeEnemy: null
  };

  const directions = [
    [0, -1], [0, 1], [-1, 0], [1, 0]
  ];

  while (queue.length > 0) {
    queue.sort((a, b) => a.costSoFar - b.costSoFar);
    const current = queue.shift()!;

    const currentKey = `${current.x},${current.y}`;

    // ZOC 타일에 진입한 경우 그 너머로 추가 이동 탐색 불가 (즉시 중단)
    if (currentKey !== startKey && zocMap && zocMap[currentKey]) {
      continue;
    }

    for (let d = 0; d < directions.length; d++) {
      const nx = current.x + directions[d][0];
      const ny = current.y + directions[d][1];

      if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;

      const nextKey = `${nx},${ny}`;
      const nextTile = grid[ny][nx];

      // 타일 내 살아있는 적군 및 아군 유닛 확인
      const livingEnemies = nextTile.units.filter((u) => u.owner === 'ENEMY' && !u.isDead);
      const livingFriendlies = nextTile.units.filter((u) => u.owner === 'PLAYER' && !u.isDead);

      // 최대 100개 중첩 한도 검사 (도착 타일에 남은 수용 공간 검사)
      const incomingCount = selectedUnits.length;
      if (livingFriendlies.length + incomingCount > MAX_STACK_PER_TILE && !(nx === startTileCoord.x && ny === startTileCoord.y)) {
        continue; // 100개 초과 시 진입 불가
      }

      const stepCost = calculateTileCost(nextTile, commanderSkills);
      const totalCost = current.costSoFar + stepCost;

      // 부대 최저 AP를 초과하면 진입 불가!
      if (totalCost > minAP) continue;

      const isZOC = !!(zocMap && zocMap[nextKey]);
      const repEnemy = livingEnemies.length > 0 ? getRepresentativeUnit(livingEnemies) : null;

      if (!reachable[nextKey] || totalCost < reachable[nextKey].apCost) {
        const nextPath = current.path.concat([{ x: nx, y: ny }]);
        reachable[nextKey] = {
          x: nx,
          y: ny,
          apCost: parseFloat(totalCost.toFixed(2)),
          path: nextPath,
          isZOC,
          isEnemyOccupied: livingEnemies.length > 0,
          targetEnemyCount: livingEnemies.length,
          representativeEnemy: repEnemy
        };

        // 적 유닛이 있는 타일은 전투 목적지이므로 통과하여 지나갈 수는 없음
        if (livingEnemies.length === 0) {
          queue.push({
            x: nx,
            y: ny,
            costSoFar: totalCost,
            path: nextPath
          });
        }
      }
    }
  }

  return reachable;
}

/**
 * [Stack of Doom 다중 유닛 동시 이동 및 ZOC 즉시 정지 실행 함수]
 */
export function executeStackMove(
  selectedUnits: GridUnit[],
  targetX: number,
  targetY: number,
  grid: GridTile[][],
  commander: GridCommander,
  zocMap: { [key: string]: ZOCTileInfo }
): StackMoveResult {
  if (!selectedUnits || selectedUnits.length === 0) {
    return { success: false, reason: '선택된 유닛이 없습니다.', logs: [] };
  }

  const startX = selectedUnits[0].x;
  const startY = selectedUnits[0].y;
  const commanderSkills = commander ? commander.skills : {};
  const logs: string[] = [];

  const reachable = calculateStackMovableTiles(
    selectedUnits,
    { x: startX, y: startY },
    grid,
    commanderSkills,
    zocMap
  );

  const targetKey = `${targetX},${targetY}`;
  let routeInfo = reachable[targetKey];
  let path = routeInfo ? routeInfo.path : null;

  // 만약 목표 타일이 ZOC 너머에 있어 직접 도달할 수 없는 경우,
  // 목표 방향 경로 상에서 가장 먼저 마주치는 ZOC 차단 타일까지의 진격을 지원
  if (!path) {
    const rawReachable = calculateStackMovableTiles(
      selectedUnits,
      { x: startX, y: startY },
      grid,
      commanderSkills,
      null
    );
    const rawRoute = rawReachable[targetKey];
    if (rawRoute && rawRoute.path) {
      let firstZOCIndex = -1;
      for (let i = 1; i < rawRoute.path.length; i++) {
        const pt = rawRoute.path[i];
        if (zocMap && zocMap[`${pt.x},${pt.y}`]) {
          firstZOCIndex = i;
          break;
        }
      }
      if (firstZOCIndex !== -1) {
        const zocPt = rawRoute.path[firstZOCIndex];
        const zocKey = `${zocPt.x},${zocPt.y}`;
        if (reachable[zocKey]) {
          path = reachable[zocKey].path;
          logs.push(`🧭 [전선 감지] (${targetX},${targetY}) 진격 중 ZOC 차단 지점(${zocPt.x},${zocPt.y})으로 이동합니다.`);
        }
      }
    }
  }

  if (!path) {
    return {
      success: false,
      reason: `목표 타일(${targetX},${targetY})은 부대 최저 이동력(minAP) 부족 또는 ZOC/장애물로 도달할 수 없습니다.`,
      logs: ['⚠️ 이동 불가: 도달할 수 없는 목표입니다.']
    };
  }

  const minAPBefore = getStackMinAP(selectedUnits);
  const repUnit = getRepresentativeUnit(selectedUnits);
  logs.push(`🚀 [부대 진격 개시] ${selectedUnits.length}기 부대 (대표: ${repUnit?.name}, 기준 AP: ${minAPBefore}) -> 목표(${targetX},${targetY})`);

  let stoppedByZOC = false;
  let combatTriggered = false;
  let targetEnemies: GridUnit[] = [];
  let zocStopReason = '';
  let currentX = startX;
  let currentY = startY;
  let totalAPConsumed = 0;

  for (let step = 1; step < path.length; step++) {
    const nextStep = path[step];
    const stepTile = grid[nextStep.y][nextStep.x];
    const cost = calculateTileCost(stepTile, commanderSkills);

    const enemiesOnTile = stepTile.units.filter((u) => u.owner === 'ENEMY' && !u.isDead);

    // 적 부대가 주둔한 타일 진입 시: 전투 돌입(Combat Trigger)
    if (enemiesOnTile.length > 0) {
      combatTriggered = true;
      targetEnemies = enemiesOnTile;
      currentX = nextStep.x;
      currentY = nextStep.y;
      totalAPConsumed += cost;

      selectedUnits.forEach((u) => {
        u.currentAP = Math.max(0, parseFloat((u.currentAP - cost).toFixed(2)));
        u.x = nextStep.x;
        u.y = nextStep.y;
      });

      logs.push(`⚔️ [전투 돌입 (Combat Trigger)] 타일(${nextStep.x},${nextStep.y})에 주둔한 적 ${enemiesOnTile.length}기 부대와 충돌합니다!`);
      break;
    }

    currentX = nextStep.x;
    currentY = nextStep.y;
    totalAPConsumed += cost;

    selectedUnits.forEach((u) => {
      u.currentAP = Math.max(0, parseFloat((u.currentAP - cost).toFixed(2)));
      u.x = nextStep.x;
      u.y = nextStep.y;
    });

    logs.push(`   ↳ (${nextStep.x},${nextStep.y}) [${stepTile.name}] 통과 (소모 AP: ${cost}, 부대 잔여 minAP: ${getStackMinAP(selectedUnits)})`);

    // ZOC 타일 진입 시: 부대 전체 이동 즉시 강제 중단!
    const stepKey = `${nextStep.x},${nextStep.y}`;
    if (zocMap && zocMap[stepKey]) {
      stoppedByZOC = true;
      zocStopReason = zocMap[stepKey].reason || '적군 전선 포위망';
      // 진입과 동시에 잔여 이동력 소진 처리
      selectedUnits.forEach((u) => {
        u.currentAP = 0;
      });
      logs.push(`🛑 [ZOC 차단!] ${zocStopReason}에 가로막혀 부대 전체의 이동이 즉시 강제 중단(Stop)되었습니다!`);
      break;
    }
  }

  // 타일 단위 units 배열 갱신 (출발 타일에서 제거 -> 도착 타일에 삽입)
  const selectedIds = new Set(selectedUnits.map((u) => u.id));
  const startTile = grid[startY][startX];
  const finalTile = grid[currentY][currentX];

  if (startX !== currentX || startY !== currentY) {
    // 출발지에서 유닛 제거
    startTile.units = startTile.units.filter((u) => !selectedIds.has(u.id));

    // 도착지에 유닛 추가 (최대 100개 한도 엄수)
    selectedUnits.forEach((u) => {
      if (finalTile.units.length < MAX_STACK_PER_TILE && !finalTile.units.some(exist => exist.id === u.id)) {
        finalTile.units.push(u);
      }
    });
  }

  // 안전지대(Safe Zone) 여부 갱신
  if (finalTile.isSafeZone) {
    selectedUnits.forEach((u) => {
      u.isSafe = true;
    });
    logs.push(`🏰 [안전지대 입성] ${finalTile.name}에 주둔하여 부대 전체의 [안전 상태(Safe)]가 활성화되었습니다. (유지비 0G 면제)`);
  } else {
    selectedUnits.forEach((u) => {
      u.isSafe = false;
    });
  }

  const remainingMinAP = getStackMinAP(selectedUnits);

  return {
    success: true,
    stoppedByZOC,
    zocStopReason,
    combatTriggered,
    targetEnemies,
    finalX: currentX,
    finalY: currentY,
    apConsumed: totalAPConsumed,
    remainingMinAP,
    isSafe: finalTile.isSafeZone,
    logs
  };
}

/**
 * [턴 종료 및 유지비 정산 함수]
 */
export function updateSafeZonesAndUpkeep(
  grid: GridTile[][],
  commander: GridCommander
): TurnEndResult {
  const logs: string[] = [];
  logs.push('====================================================');
  logs.push(`🌙 [턴 종료 및 유지비 정산] 제 ${commander.turn}턴 종료`);

  let totalUpkeepDeducted = 0;
  let disabledCount = 0;

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const tile = grid[y][x];

      tile.units.forEach((unit) => {
        if (unit.isDead) return;

        if (tile.isSafeZone) {
          unit.isSafe = true;
          unit.isDisabled = false;
        } else {
          unit.isSafe = false;

          if (unit.owner === 'PLAYER') {
            const cost = unit.upkeepCost || 8;

            if (commander.gold >= cost) {
              commander.gold -= cost;
              totalUpkeepDeducted += cost;
              unit.isDisabled = false;
            } else {
              unit.isDisabled = true;
              disabledCount++;
              logs.push(`⚠️ [유지비 체납] 골드 부족으로 ${unit.name}이(가) 비활성화(Disabled)되었습니다.`);
            }
          }
        }

        if (unit.isDisabled) {
          unit.currentAP = 0;
        } else {
          unit.currentAP = unit.baseAP;
        }
      });
    }
  }

  commander.turn += 1;
  logs.push(`💰 총 유지비 차감: -${totalUpkeepDeducted}G (잔여 골드: ${commander.gold}G)`);
  if (disabledCount > 0) {
    logs.push(`⚠️ 골드 부족으로 총 ${disabledCount}개 유닛이 비활성화되었습니다.`);
  }
  logs.push(`✨ 모든 정상 유닛의 이동력(AP)이 초기화되었습니다. [제 ${commander.turn}턴 시작]`);
  logs.push('====================================================');

  return {
    success: true,
    newTurn: commander.turn,
    remainingGold: commander.gold,
    totalUpkeepDeducted,
    disabledCount,
    logs
  };
}

/**
 * 그리드 내의 모든 유닛을 평탄화 배열로 반환
 */
export function getAllUnitsFromGrid(grid: GridTile[][]): GridUnit[] {
  const units: GridUnit[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      units.push(...grid[y][x].units);
    }
  }
  return units;
}
