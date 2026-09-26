// Auto-generated export for Code Viewer and Sandbox Runner
export const GRID_ENGINE_CODE = `/**
 * ============================================================================
 * [Web-SLG] Civilization 4 Style "Stack of Doom" (부대 중첩) & ZOC Engine
 * ============================================================================
 * 
 * 1. 타일 데이터 구조:
 *    - 각 타일(Tile)은 \`units\` 배열을 가지며 최대 100개의 유닛을 중첩 보관할 수 있습니다.
 * 2. 맵 렌더링:
 *    - 타일에는 가장 높은 전투력을 가진 대표 유닛 1개의 아이콘과 중첩 유닛 수 카운트 칩(예: x15, x100)을 표시합니다.
 * 3. 유닛 선택 및 이동:
 *    - 타일 터치 시 하단에 '부대 목록 (Stack Panel)' 활성화.
 *    - [전체 선택 후 이동] 및 [동일 클래스 선택 후 이동] 기능 제공.
 *    - 이동 시 부대 내 유닛 중 가장 잔여 AP가 적은 유닛의 이동력(minAP)을 기준으로 이동 가능 거리가 제한됩니다.
 *    - 지휘관 스킬 '신속한 진격' 보유 시 이동 AP 소모는 50% 할인됩니다.
 * 4. ZOC (포위망/전선) 알고리즘:
 *    - 적 부대(1개 이상 유닛 보유 타일) 2개 이상이 인접하거나 한 칸 건너 위치할 경우,
 *      형성되는 경계 구역(ZOC) 진입 시 이동이 즉시 중단됩니다.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GridEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) {}
    }
    return JSON.parse(JSON.stringify(obj));
  }

  const MAX_STACK_PER_TILE = 100;
  const GRID_COLS = 8;
  const GRID_ROWS = 14;

  const TILE_TYPES = {
    PLAIN: {
      type: 'PLAIN',
      name: '일반 평지',
      baseAPCost: 1.0,
      defenseBonus: 0.0,
      isSafeZone: false
    },
    ROUGH: {
      type: 'ROUGH',
      name: '험지 (바위언덕)',
      baseAPCost: 2.0,
      defenseBonus: 0.20,
      isSafeZone: false
    },
    VILLAGE: {
      type: 'VILLAGE',
      name: '평화로운 마을 (1x1)',
      baseAPCost: 1.0,
      defenseBonus: 0.10,
      isSafeZone: true
    },
    CITY: {
      type: 'CITY',
      name: '에인헤랴르 요새 도시 (2x2)',
      baseAPCost: 1.0,
      defenseBonus: 0.35,
      isSafeZone: true
    }
  };

  function createDefaultGrid() {
    const grid = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      const row = [];
      for (let x = 0; x < GRID_COLS; x++) {
        let tileData = {
          x: x,
          y: y,
          type: 'PLAIN',
          name: TILE_TYPES.PLAIN.name,
          baseAPCost: TILE_TYPES.PLAIN.baseAPCost,
          defenseBonus: TILE_TYPES.PLAIN.defenseBonus,
          isSafeZone: TILE_TYPES.PLAIN.isSafeZone,
          units: []
        };

        if ((x === 4 || x === 5) && (y === 1 || y === 2)) {
          tileData.type = 'CITY';
          tileData.name = TILE_TYPES.CITY.name;
          tileData.baseAPCost = TILE_TYPES.CITY.baseAPCost;
          tileData.defenseBonus = TILE_TYPES.CITY.defenseBonus;
          tileData.isSafeZone = true;
          tileData.cityGroupId = 'CITY_NORTH';
        } else if (x === 1 && y === 11) {
          tileData.type = 'VILLAGE';
          tileData.name = TILE_TYPES.VILLAGE.name;
          tileData.baseAPCost = TILE_TYPES.VILLAGE.baseAPCost;
          tileData.defenseBonus = TILE_TYPES.VILLAGE.defenseBonus;
          tileData.isSafeZone = true;
        } else if (x === 6 && y === 8) {
          tileData.type = 'VILLAGE';
          tileData.name = '국경 보급 마을 (1x1)';
          tileData.baseAPCost = TILE_TYPES.VILLAGE.baseAPCost;
          tileData.defenseBonus = TILE_TYPES.VILLAGE.defenseBonus;
          tileData.isSafeZone = true;
        } else if (
          (x === 2 && y === 4) || (x === 3 && y === 4) ||
          (x === 0 && y === 6) || (x === 1 && y === 6) ||
          (x === 4 && y === 7) || (x === 5 && y === 7) ||
          (x === 2 && y === 9) || (x === 3 && y === 9) ||
          (x === 6 && y === 12)
        ) {
          tileData.type = 'ROUGH';
          tileData.name = TILE_TYPES.ROUGH.name;
          tileData.baseAPCost = TILE_TYPES.ROUGH.baseAPCost;
          tileData.defenseBonus = TILE_TYPES.ROUGH.defenseBonus;
        }

        row.push(tileData);
      }
      grid.push(row);
    }
    return grid;
  }

  function createDefaultCommander() {
    return {
      skills: {
        rapidAdvance: true
      },
      gold: 300,
      turn: 1
    };
  }

  function getRepresentativeUnit(units) {
    if (!units || units.length === 0) return null;
    const living = units.filter(function (u) { return !u.isDead; });
    if (living.length === 0) return null;

    return living.reduce(function (best, curr) {
      if (curr.attackPower > best.attackPower) return curr;
      if (curr.attackPower === best.attackPower && curr.hp > best.hp) return curr;
      return best;
    }, living[0]);
  }

  function getStackMinAP(units) {
    if (!units || units.length === 0) return 0;
    const activeUnits = units.filter(function (u) { return !u.isDead && !u.isDisabled; });
    if (activeUnits.length === 0) return 0;
    return Math.min.apply(null, activeUnits.map(function (u) { return u.currentAP; }));
  }

  function createDefaultUnitsAndPopulateGrid(grid) {
    const newGrid = deepCopy(grid);
    const allUnits = [];
    const playerStackCoords = { x: 2, y: 11 };

    allUnits.push({
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
    });

    for (let i = 1; i <= 4; i++) {
      allUnits.push({
        id: 'U_PL_KNIGHT_' + i,
        name: '성기사 근위대 0' + i + '호',
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

    for (let i = 1; i <= 3; i++) {
      allUnits.push({
        id: 'U_PL_MAGE_' + i,
        name: '아케인 비전마도사 0' + i + '호',
        owner: 'PLAYER',
        unitClass: 'MAGE',
        baseAP: 3,
        currentAP: 3,
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

    for (let i = 1; i <= 4; i++) {
      allUnits.push({
        id: 'U_PL_ARCHER_' + i,
        name: '엘프 저격궁수 0' + i + '호',
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

    for (let i = 1; i <= 3; i++) {
      allUnits.push({
        id: 'U_PL_MELEE_' + i,
        name: '왕실 철갑보병 0' + i + '호',
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

    for (let i = 1; i <= 4; i++) {
      allUnits.push({
        id: 'U_EN_SHIELD_' + i,
        name: '오크 방패병단 0' + i,
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

    for (let i = 1; i <= 3; i++) {
      allUnits.push({
        id: 'U_EN_SPEAR_' + i,
        name: '오크 정예투창병 0' + i,
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

    allUnits.push({
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
    });

    for (let i = 1; i <= 4; i++) {
      allUnits.push({
        id: 'U_EN_ELITE_' + i,
        name: '군주 직속 흑철경호대 0' + i,
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

    allUnits.forEach(function (u) {
      if (newGrid[u.y] && newGrid[u.y][u.x]) {
        if (newGrid[u.y][u.x].units.length < MAX_STACK_PER_TILE) {
          newGrid[u.y][u.x].units.push(u);
        }
      }
    });

    return { grid: newGrid, allUnits: allUnits };
  }

  function calculateTileCost(tile, commanderSkills) {
    if (!tile) return 1.0;
    const isRapid = commanderSkills && !!commanderSkills.rapidAdvance;
    const discount = isRapid ? 0.5 : 1.0;
    return tile.baseAPCost * discount;
  }

  function calculateZOCZones(grid) {
    const enemyTiles = [];

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const tile = grid[y][x];
        const livingEnemies = tile.units.filter(function (u) { return u.owner === 'ENEMY' && !u.isDead; });
        if (livingEnemies.length > 0) {
          enemyTiles.push({ x: x, y: y, units: livingEnemies, tile: tile });
        }
      }
    }

    const zocMap = {};
    const zocList = [];

    function markZOC(x, y, t1, t2, reason) {
      if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return;
      const key = x + ',' + y;

      const rep1 = getRepresentativeUnit(t1.units)?.name || '적 부대';
      const rep2 = getRepresentativeUnit(t2.units)?.name || '적 부대';

      if (!zocMap[key]) {
        zocMap[key] = {
          x: x,
          y: y,
          isZOC: true,
          enemyTileCoords: [{ x: t1.x, y: t1.y }, { x: t2.x, y: t2.y }],
          enemyNames: [rep1, rep2],
          reason: reason
        };
        zocList.push(zocMap[key]);
      } else {
        const exists1 = zocMap[key].enemyTileCoords.some(function (c) { return c.x === t1.x && c.y === t1.y; });
        if (!exists1) zocMap[key].enemyTileCoords.push({ x: t1.x, y: t1.y });
        const exists2 = zocMap[key].enemyTileCoords.some(function (c) { return c.x === t2.x && c.y === t2.y; });
        if (!exists2) zocMap[key].enemyTileCoords.push({ x: t2.x, y: t2.y });
      }
    }

    for (let i = 0; i < enemyTiles.length; i++) {
      for (let j = i + 1; j < enemyTiles.length; j++) {
        const t1 = enemyTiles[i];
        const t2 = enemyTiles[j];

        const dx = Math.abs(t1.x - t2.x);
        const dy = Math.abs(t1.y - t2.y);

        let isFrontline = false;
        let reason = '';

        if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
          isFrontline = true;
          reason = '적 부대 인접 결착 전선';
        } else if (dx === 2 && dy === 0) {
          isFrontline = true;
          reason = '적 부대 횡방향 포위망 전선';
          const midX = (t1.x + t2.x) / 2;
          markZOC(midX, t1.y, t1, t2, '적군 중앙 통로 관통 포위망 (ZOC)');
        } else if (dx === 0 && dy === 2) {
          isFrontline = true;
          reason = '적 부대 종방향 포위망 전선';
          const midY = (t1.y + t2.y) / 2;
          markZOC(t1.x, midY, t1, t2, '적군 중앙 통로 관통 포위망 (ZOC)');
        } else if ((dx === 2 && dy <= 2) || (dy === 2 && dx <= 2)) {
          isFrontline = true;
          reason = '적 부대 대각 협공 전선';
          const stepX = Math.sign(t2.x - t1.x);
          const stepY = Math.sign(t2.y - t1.y);
          if (stepX !== 0) markZOC(t1.x + stepX, t1.y, t1, t2, '적군 전선 간극 (ZOC)');
          if (stepY !== 0) markZOC(t1.x, t1.y + stepY, t1, t2, '적군 전선 간극 (ZOC)');
        }

        if (isFrontline) {
          const neighbors = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
          ];
          neighbors.forEach(function (n) {
            markZOC(t1.x + n[0], t1.y + n[1], t1, t2, reason + ' 외곽 경계선');
            markZOC(t2.x + n[0], t2.y + n[1], t1, t2, reason + ' 외곽 경계선');
          });
        }
      }
    }

    return { zocMap: zocMap, zocList: zocList };
  }

  function calculateStackMovableTiles(selectedUnits, startTileCoord, grid, commanderSkills, zocMap) {
    if (!selectedUnits || selectedUnits.length === 0) return {};

    const minAP = getStackMinAP(selectedUnits);
    if (minAP <= 0) return {};

    const reachable = {};
    const startKey = startTileCoord.x + ',' + startTileCoord.y;

    const queue = [
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

    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (queue.length > 0) {
      queue.sort(function (a, b) { return a.costSoFar - b.costSoFar; });
      const current = queue.shift();

      const currentKey = current.x + ',' + current.y;

      if (currentKey !== startKey && zocMap && zocMap[currentKey]) {
        continue;
      }

      for (let d = 0; d < directions.length; d++) {
        const nx = current.x + directions[d][0];
        const ny = current.y + directions[d][1];

        if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;

        const nextKey = nx + ',' + ny;
        const nextTile = grid[ny][nx];

        const livingEnemies = nextTile.units.filter(function (u) { return u.owner === 'ENEMY' && !u.isDead; });
        const livingFriendlies = nextTile.units.filter(function (u) { return u.owner === 'PLAYER' && !u.isDead; });

        if (livingFriendlies.length + selectedUnits.length > MAX_STACK_PER_TILE && !(nx === startTileCoord.x && ny === startTileCoord.y)) {
          continue;
        }

        const stepCost = calculateTileCost(nextTile, commanderSkills);
        const totalCost = current.costSoFar + stepCost;

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
            isZOC: isZOC,
            isEnemyOccupied: livingEnemies.length > 0,
            targetEnemyCount: livingEnemies.length,
            representativeEnemy: repEnemy
          };

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

  function executeStackMove(selectedUnits, targetX, targetY, grid, commander, zocMap) {
    if (!selectedUnits || selectedUnits.length === 0) {
      return { success: false, reason: '선택된 유닛이 없습니다.', logs: [] };
    }

    const startX = selectedUnits[0].x;
    const startY = selectedUnits[0].y;
    const commanderSkills = commander ? commander.skills : {};
    const logs = [];

    const reachable = calculateStackMovableTiles(
      selectedUnits,
      { x: startX, y: startY },
      grid,
      commanderSkills,
      zocMap
    );

    const targetKey = targetX + ',' + targetY;
    let routeInfo = reachable[targetKey];
    let path = routeInfo ? routeInfo.path : null;

    if (!path) {
      return {
        success: false,
        reason: '목표 타일(' + targetX + ',' + targetY + ')은 부대 최저 이동력(minAP) 부족 또는 장애물로 도달할 수 없습니다.',
        logs: ['⚠️ 이동 불가: 도달할 수 없는 목표입니다.']
      };
    }

    const minAPBefore = getStackMinAP(selectedUnits);
    const repUnit = getRepresentativeUnit(selectedUnits);
    logs.push('🚀 [부대 진격] ' + selectedUnits.length + '기 부대 (대표: ' + (repUnit ? repUnit.name : '') + ', 기준 minAP: ' + minAPBefore + ') -> (' + targetX + ',' + targetY + ')');

    let stoppedByZOC = false;
    let combatTriggered = false;
    let targetEnemies = [];
    let zocStopReason = '';
    let currentX = startX;
    let currentY = startY;
    let totalAPConsumed = 0;

    for (let step = 1; step < path.length; step++) {
      const nextStep = path[step];
      const stepTile = grid[nextStep.y][nextStep.x];
      const cost = calculateTileCost(stepTile, commanderSkills);

      const enemiesOnTile = stepTile.units.filter(function (u) { return u.owner === 'ENEMY' && !u.isDead; });

      if (enemiesOnTile.length > 0) {
        combatTriggered = true;
        targetEnemies = enemiesOnTile;
        currentX = nextStep.x;
        currentY = nextStep.y;
        totalAPConsumed += cost;

        selectedUnits.forEach(function (u) {
          u.currentAP = Math.max(0, parseFloat((u.currentAP - cost).toFixed(2)));
          u.x = nextStep.x;
          u.y = nextStep.y;
        });

        logs.push('⚔️ [전투 돌입] (' + nextStep.x + ',' + nextStep.y + ') 적 ' + enemiesOnTile.length + '기 부대와 충돌합니다!');
        break;
      }

      currentX = nextStep.x;
      currentY = nextStep.y;
      totalAPConsumed += cost;

      selectedUnits.forEach(function (u) {
        u.currentAP = Math.max(0, parseFloat((u.currentAP - cost).toFixed(2)));
        u.x = nextStep.x;
        u.y = nextStep.y;
      });

      logs.push('   ↳ (' + nextStep.x + ',' + nextStep.y + ') [' + stepTile.name + '] 진입 (소모: ' + cost + 'AP, 잔여 minAP: ' + getStackMinAP(selectedUnits) + ')');

      const stepKey = nextStep.x + ',' + nextStep.y;
      if (zocMap && zocMap[stepKey]) {
        stoppedByZOC = true;
        zocStopReason = zocMap[stepKey].reason || '적군 전선 포위망';
        selectedUnits.forEach(function (u) {
          u.currentAP = 0;
        });
        logs.push('🛑 [ZOC 차단!] ' + zocStopReason + '에 가로막혀 부대 전체의 이동이 즉시 강제 중단되었습니다!');
        break;
      }
    }

    const startTile = grid[startY][startX];
    const finalTile = grid[currentY][currentX];
    const selectedIds = new Set(selectedUnits.map(function (u) { return u.id; }));

    if (startX !== currentX || startY !== currentY) {
      startTile.units = startTile.units.filter(function (u) { return !selectedIds.has(u.id); });
      selectedUnits.forEach(function (u) {
        if (finalTile.units.length < MAX_STACK_PER_TILE && !finalTile.units.some(function (exist) { return exist.id === u.id; })) {
          finalTile.units.push(u);
        }
      });
    }

    if (finalTile.isSafeZone) {
      selectedUnits.forEach(function (u) { u.isSafe = true; });
      logs.push('🏰 [안전지대 입성] ' + finalTile.name + ' 주둔 -> 부대 전체 [안전 상태] 활성화 (유지비 0G)');
    } else {
      selectedUnits.forEach(function (u) { u.isSafe = false; });
    }

    return {
      success: true,
      stoppedByZOC: stoppedByZOC,
      zocStopReason: zocStopReason,
      combatTriggered: combatTriggered,
      targetEnemies: targetEnemies,
      finalX: currentX,
      finalY: currentY,
      apConsumed: totalAPConsumed,
      remainingMinAP: getStackMinAP(selectedUnits),
      isSafe: finalTile.isSafeZone,
      logs: logs
    };
  }

  function updateSafeZonesAndUpkeep(grid, commander) {
    const logs = [];
    logs.push('🌙 [턴 종료 및 유지비 정산] 제 ' + commander.turn + '턴 종료');

    let totalUpkeepDeducted = 0;
    let disabledCount = 0;

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const tile = grid[y][x];
        tile.units.forEach(function (unit) {
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
                logs.push('⚠️ [유지비 체납] 골드 부족으로 ' + unit.name + '이(가) 비활성화되었습니다.');
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
    logs.push('💰 총 유지비 차감: -' + totalUpkeepDeducted + 'G (잔여: ' + commander.gold + 'G)');
    logs.push('✨ 모든 유닛의 AP가 초기화되었습니다. [제 ' + commander.turn + '턴 시작]');

    return {
      success: true,
      newTurn: commander.turn,
      remainingGold: commander.gold,
      totalUpkeepDeducted: totalUpkeepDeducted,
      disabledCount: disabledCount,
      logs: logs
    };
  }

  return {
    MAX_STACK_PER_TILE: MAX_STACK_PER_TILE,
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    TILE_TYPES: TILE_TYPES,
    deepCopy: deepCopy,
    createDefaultGrid: createDefaultGrid,
    createDefaultCommander: createDefaultCommander,
    createDefaultUnitsAndPopulateGrid: createDefaultUnitsAndPopulateGrid,
    getRepresentativeUnit: getRepresentativeUnit,
    getStackMinAP: getStackMinAP,
    calculateTileCost: calculateTileCost,
    calculateZOCZones: calculateZOCZones,
    calculateStackMovableTiles: calculateStackMovableTiles,
    executeStackMove: executeStackMove,
    updateSafeZonesAndUpkeep: updateSafeZonesAndUpkeep
  };
}));
`;
