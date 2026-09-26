import React, { useState, useMemo, useEffect } from 'react';
import {
  GridTile,
  GridUnit,
  GridCommander,
  ZOCTileInfo,
  createDefaultGrid,
  createDefaultCommander,
  createDefaultUnitsAndPopulateGrid,
  calculateTileCost,
  calculateZOCZones,
  calculateStackMovableTiles,
  executeStackMove,
  updateSafeZonesAndUpkeep,
  getRepresentativeUnit,
  getStackMinAP,
  getAllUnitsFromGrid,
  GRID_COLS,
  GRID_ROWS,
  MAX_STACK_PER_TILE,
  TILE_TYPES,
  deepCopy
} from '../gridEngine';
import {
  Shield,
  Zap,
  Footprints,
  AlertTriangle,
  Building2,
  Tent,
  Crown,
  Play,
  RotateCcw,
  Coins,
  Swords,
  CheckCircle2,
  Info,
  Sparkles,
  Lock,
  Layers,
  Users,
  Filter,
  CheckSquare,
  Square,
  ArrowRight
} from 'lucide-react';

export const GridMapTab: React.FC = () => {
  // 1. 그리드 및 게임 상태 초기화 (10개 이상의 유닛이 한 타일에 중첩된 상태)
  const [grid, setGrid] = useState<GridTile[][]>(() => {
    const baseGrid = createDefaultGrid();
    const { grid: populatedGrid } = createDefaultUnitsAndPopulateGrid(baseGrid);
    return populatedGrid;
  });

  const [commander, setCommander] = useState<GridCommander>(() => createDefaultCommander());

  // 현재 선택된 타일 좌표 (기본값: 15기 아군 부대가 주둔한 (2, 11))
  const [selectedTileCoord, setSelectedTileCoord] = useState<{ x: number; y: number }>({ x: 2, y: 11 });

  // 선택된 타일 내에서 이동에 참여할 유닛 ID 집합
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  // 클래스별 일괄 선택 필터 상태 ('ALL' | 'KNIGHT' | 'MAGE' | 'ARCHER' | 'MELEE')
  const [classFilter, setClassFilter] = useState<string>('ALL');

  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  const [logs, setLogs] = useState<string[]>([
    '🏛️ [Stack of Doom] 문명 4 스타일 부대 중첩 시스템이 활성화되었습니다.',
    '🏰 (2, 11) 타일에 아군 15기 중첩 부대(x15)가 집결해 있습니다. (대표 유닛: 성기사 롤랑)',
    '⚡ 지휘관 스킬 [신속한 진격] 활성화: 모든 타일 이동 AP 소모 50% 할인 중.',
    '⚠️ 적 오크 방패병(x4)과 투창병(x3)이 6번 라인에서 [ZOC 전선 포위망]을 형성하고 있습니다.'
  ]);

  const [bannerNotice, setBannerNotice] = useState<string | null>(
    '부대 중첩(x15) 타일을 터치하고, 하단 부대 목록에서 [전체 선택 후 이동] 또는 [동일 클래스 선택]을 눌러보세요!'
  );

  // 알림 배너 자동 소멸 타이머
  useEffect(() => {
    if (bannerNotice) {
      const timer = setTimeout(() => setBannerNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [bannerNotice]);

  // 현재 선택된 타일 객체
  const activeTile = useMemo(() => {
    if (!selectedTileCoord) return null;
    return grid[selectedTileCoord.y]?.[selectedTileCoord.x] || null;
  }, [grid, selectedTileCoord]);

  // 현재 선택된 타일에 주둔 중인 살아있는 아군 유닛 목록
  const activeTileFriendlies = useMemo(() => {
    if (!activeTile) return [];
    return activeTile.units.filter((u) => u.owner === 'PLAYER' && !u.isDead);
  }, [activeTile]);

  // 현재 선택된 타일에 주둔 중인 적군 유닛 목록
  const activeTileEnemies = useMemo(() => {
    if (!activeTile) return [];
    return activeTile.units.filter((u) => u.owner === 'ENEMY' && !u.isDead);
  }, [activeTile]);

  // 타일 선택 시 기본적으로 모든 유닛 선택 상태로 동기화
  useEffect(() => {
    if (activeTileFriendlies.length > 0) {
      setSelectedUnitIds(activeTileFriendlies.map((u) => u.id));
      setClassFilter('ALL');
    } else {
      setSelectedUnitIds([]);
    }
  }, [selectedTileCoord.x, selectedTileCoord.y, activeTileFriendlies.length]);

  // 실제 이동을 위해 선택된 유닛 객체 목록
  const selectedUnitsToMove = useMemo(() => {
    if (!activeTile) return [];
    const idSet = new Set(selectedUnitIds);
    return activeTile.units.filter((u) => idSet.has(u.id) && !u.isDead && !u.isDisabled);
  }, [activeTile, selectedUnitIds]);

  // 선택된 부대 중 '가장 잔여 AP가 적은 유닛의 이동력' (부대 이동 제약 기준)
  const stackMinAP = useMemo(() => {
    return getStackMinAP(selectedUnitsToMove);
  }, [selectedUnitsToMove]);

  // ZOC 전선 계산 (적 부대 2개 이상이 인접 또는 1칸 간격 위치 시 ZOC 형성)
  const zocData = useMemo(() => {
    return calculateZOCZones(grid);
  }, [grid]);

  // 부대 최저 AP 기준 Dijkstra 이동 가능 범위 계산
  const movableTiles = useMemo(() => {
    if (!selectedUnitsToMove || selectedUnitsToMove.length === 0 || !selectedTileCoord) {
      return {};
    }
    return calculateStackMovableTiles(
      selectedUnitsToMove,
      selectedTileCoord,
      grid,
      commander.skills,
      zocData.zocMap
    );
  }, [selectedUnitsToMove, selectedTileCoord, grid, commander.skills, zocData.zocMap]);

  // --------------------------------------------------------------------------
  // 타일 클릭 핸들러 (부대 선택 or 이동 명령)
  // --------------------------------------------------------------------------
  const handleTileClick = (x: number, y: number) => {
    const targetTile = grid[y][x];
    const isMovable = !!movableTiles[`${x},${y}`];

    // Case 1: 이미 부대가 선택되어 있고, 클릭한 타일이 유효한 이동 가능 목적지인 경우 -> 부대 이동 실행!
    if (isMovable && selectedUnitsToMove.length > 0 && (x !== selectedTileCoord.x || y !== selectedTileCoord.y)) {
      const gridCopy = deepCopy(grid);
      const movingUnits = selectedUnitsToMove.map(u => deepCopy(u));

      const moveRes = executeStackMove(
        movingUnits,
        x,
        y,
        gridCopy,
        commander,
        zocData.zocMap
      );

      if (!moveRes.success) {
        setBannerNotice(moveRes.reason || '이동할 수 없습니다.');
        setLogs((prev) => [moveRes.reason || '⚠️ 이동 불가', ...prev]);
        return;
      }

      // 적 부대와 전투 충돌 시 시뮬레이션
      if (moveRes.combatTriggered && moveRes.targetEnemies && moveRes.targetEnemies.length > 0) {
        const destTile = gridCopy[moveRes.finalY!][moveRes.finalX!];
        const livingTargetEnemies = destTile.units.filter(u => u.owner === 'ENEMY' && !u.isDead);

        // 대표 공격 유닛과 대표 방어 유닛의 교전
        const repAttacker = getRepresentativeUnit(movingUnits);
        const repDefender = getRepresentativeUnit(livingTargetEnemies);

        if (repAttacker && repDefender) {
          const damage = Math.round(repAttacker.attackPower * 0.75);
          repDefender.hp = Math.max(0, repDefender.hp - damage);
          moveRes.logs.push(`💥 [교전 발생] ${repAttacker.name}의 돌격! 적 대표 ${repDefender.name}에게 ${damage} 피해 (잔여 HP: ${repDefender.hp}/${repDefender.maxHp})`);
          if (repDefender.hp === 0) {
            repDefender.isDead = true;
            destTile.units = destTile.units.filter(u => u.id !== repDefender.id);
            moveRes.logs.push(`💀 [적 격파] 적군 대표 ${repDefender.name}이(가) 전사했습니다!`);
          }
        }
      }

      setGrid(gridCopy);
      setSelectedTileCoord({ x: moveRes.finalX!, y: moveRes.finalY! });
      setSelectedUnitIds(movingUnits.map(u => u.id));
      setLogs((prev) => [...moveRes.logs.slice().reverse(), ...prev]);

      if (moveRes.stoppedByZOC) {
        setBannerNotice(`🛑 [ZOC 차단!] ${moveRes.zocStopReason}에 가로막혀 부대 전체 이동이 즉시 강제 중단되었습니다!`);
      } else if (moveRes.combatTriggered) {
        setBannerNotice(`⚔️ 전투 돌입! 적 ${moveRes.targetEnemies?.length}기 부대와 충돌했습니다.`);
      } else if (moveRes.isSafe) {
        setBannerNotice(`🏰 안전지대(마을/도시) 진입! 부대 전체 [안전 상태] 활성화 (유지비 0G)`);
      } else {
        setBannerNotice(`부대 ${movingUnits.length}기 이동 완료 (${moveRes.finalX}, ${moveRes.finalY}) - 잔여 minAP: ${moveRes.remainingMinAP}`);
      }
      return;
    }

    // Case 2: 다른 타일을 클릭하여 해당 타일 선택 및 하단 부대 목록(Stack Panel) 활성화
    setSelectedTileCoord({ x, y });

    const livingFriendlies = targetTile.units.filter(u => u.owner === 'PLAYER' && !u.isDead);
    const livingEnemies = targetTile.units.filter(u => u.owner === 'ENEMY' && !u.isDead);

    if (livingFriendlies.length > 0) {
      setSelectedUnitIds(livingFriendlies.map(u => u.id));
      setClassFilter('ALL');
      const rep = getRepresentativeUnit(livingFriendlies);
      setBannerNotice(`타일 (${x}, ${y}) 선택: 아군 ${livingFriendlies.length}기 중첩 (대표: ${rep?.name}, 이동력: ${getStackMinAP(livingFriendlies)} AP)`);
    } else if (livingEnemies.length > 0) {
      setSelectedUnitIds([]);
      const rep = getRepresentativeUnit(livingEnemies);
      setBannerNotice(`타일 (${x}, ${y}) 적 부대: ${livingEnemies.length}기 중첩 (대표: ${rep?.name})`);
    } else {
      setSelectedUnitIds([]);
      setBannerNotice(`타일 (${x}, ${y}) [${targetTile.name}] 선택`);
    }
  };

  // --------------------------------------------------------------------------
  // 부대 목록 조작 기능: [전체 선택 후 이동] & [동일 클래스 선택 후 이동]
  // --------------------------------------------------------------------------

  // A. [전체 선택 후 이동]
  const handleSelectAllUnits = () => {
    if (!activeTileFriendlies.length) return;
    setSelectedUnitIds(activeTileFriendlies.map(u => u.id));
    setClassFilter('ALL');
    setBannerNotice(`[전체 선택]: 타일의 모든 아군 유닛 ${activeTileFriendlies.length}기가 이동 부대로 선택되었습니다.`);
  };

  // B. [동일 클래스 선택 후 이동]
  const handleSelectSameClass = (targetClass: string) => {
    if (!activeTileFriendlies.length) return;
    const filtered = activeTileFriendlies.filter(u => u.unitClass === targetClass);
    if (filtered.length === 0) {
      setBannerNotice(`해당 타일에 [${targetClass}] 클래스 유닛이 없습니다.`);
      return;
    }
    setSelectedUnitIds(filtered.map(u => u.id));
    setClassFilter(targetClass);
    const minAP = getStackMinAP(filtered);
    setBannerNotice(`[동일 클래스 선택]: ${targetClass} 클래스 ${filtered.length}기 선택 완료! (부대 이동력: ${minAP} AP)`);
  };

  // C. 개별 유닛 선택 토글
  const handleToggleUnitSelect = (unitId: string) => {
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return Array.from(next);
    });
  };

  // --------------------------------------------------------------------------
  // 하단 3대 필수 버튼 조작: [지휘관 스킬 토글], [마을/도시 입장], [턴 종료]
  // --------------------------------------------------------------------------

  // 1. [지휘관 스킬 토글] (신속한 진격: 50% AP 할인)
  const handleToggleRapidAdvance = () => {
    const current = commander.skills.rapidAdvance;
    const nextVal = !current;
    setCommander((prev) => ({
      ...prev,
      skills: {
        ...prev.skills,
        rapidAdvance: nextVal
      }
    }));
    const notice = nextVal
      ? '⚡ 지휘관 스킬 [신속한 진격] 활성화! 모든 타일 이동 AP가 50% 할인됩니다.'
      : '지휘관 스킬 [신속한 진격] 비활성화. 기본 정상 AP가 소모됩니다.';
    setBannerNotice(notice);
    setLogs((prev) => [notice, ...prev]);
  };

  // 2. [마을/도시 입장] (신속 귀환 및 안전 상태 전환)
  const handleEnterSafeZone = () => {
    if (!selectedUnitsToMove.length || !selectedTileCoord) {
      setBannerNotice('안전지대로 입장시킬 아군 부대를 먼저 선택하세요.');
      return;
    }

    // 본진 마을 타일 (1, 11)로 부대 대피
    const safeTarget = { x: 1, y: 11 };
    const gridCopy = deepCopy(grid);

    const sourceTile = gridCopy[selectedTileCoord.y][selectedTileCoord.x];
    const destTile = gridCopy[safeTarget.y][safeTarget.x];
    const selectedIds = new Set(selectedUnitsToMove.map(u => u.id));

    const movingUnits = sourceTile.units.filter(u => selectedIds.has(u.id));
    sourceTile.units = sourceTile.units.filter(u => !selectedIds.has(u.id));

    movingUnits.forEach(u => {
      u.x = safeTarget.x;
      u.y = safeTarget.y;
      u.isSafe = true;
      u.isDisabled = false;
      if (destTile.units.length < MAX_STACK_PER_TILE) {
        destTile.units.push(u);
      }
    });

    setGrid(gridCopy);
    setSelectedTileCoord(safeTarget);
    setSelectedUnitIds(movingUnits.map(u => u.id));

    const msg = `🏰 [마을/도시 입장] 부대 ${movingUnits.length}기가 평화로운 마을(1, 11)로 주둔하여 [안전 상태]가 되었습니다. (유지비 0G 면제)`;
    setBannerNotice(msg);
    setLogs((prev) => [msg, ...prev]);
  };

  // 3. [턴 종료] (유지비 차감 및 AP 충전)
  const handleTurnEnd = () => {
    const gridCopy = deepCopy(grid);
    const commanderCopy = deepCopy(commander);

    const result = updateSafeZonesAndUpkeep(gridCopy, commanderCopy);

    setGrid(gridCopy);
    setCommander(commanderCopy);
    setLogs((prev) => [...result.logs.slice().reverse(), ...prev]);

    let summary = `🌙 제 ${commander.turn}턴 종료 ➔ 제 ${result.newTurn}턴 시작! (유지비 차감: -${result.totalUpkeepDeducted}G)`;
    if (result.disabledCount > 0) {
      summary += ` ⚠️ ${result.disabledCount}개 유닛이 골드 부족으로 비활성화되었습니다!`;
    }
    setBannerNotice(summary);
  };

  // 4. 리셋 기능
  const handleResetGame = () => {
    const baseGrid = createDefaultGrid();
    const { grid: populatedGrid } = createDefaultUnitsAndPopulateGrid(baseGrid);
    setGrid(populatedGrid);
    setCommander(createDefaultCommander());
    setSelectedTileCoord({ x: 2, y: 11 });
    const living = populatedGrid[11][2].units.filter(u => u.owner === 'PLAYER');
    setSelectedUnitIds(living.map(u => u.id));
    setClassFilter('ALL');
    setLogs([
      '🔄 전술 맵과 부대 중첩 배치가 초기 상태로 재설정되었습니다.',
      '🏰 (2, 11) 타일에 15기 아군 부대가 집결해 있습니다.',
      '⚡ 지휘관 스킬 [신속한 진격] 활성화 상태입니다.'
    ]);
    setBannerNotice('게임이 초기 상태로 재설정되었습니다.');
  };

  // 5. 자동 검증 시나리오 데모
  const handleRunDemoScenario = (scenarioIdx: number) => {
    if (scenarioIdx === 1) {
      // 시나리오 1: 15기 전체 선택 후 이동
      handleSelectAllUnits();
      setBannerNotice(`테스트 1: 15기 대부대 전체 선택! 부대 내 가장 느린 마법사/궁수/보병의 AP(3)에 맞춰 이동 거리가 제한됩니다.`);
    } else if (scenarioIdx === 2) {
      // 시나리오 2: 기사 5기만 동일 클래스 선택 후 고속 기동
      handleSelectSameClass('KNIGHT');
      setBannerNotice(`테스트 2: 성기사 5기 선별! 기사 전용 AP(4)를 온전히 활용하여 더 먼 거리를 신속 기동할 수 있습니다.`);
    } else if (scenarioIdx === 3) {
      // 시나리오 3: ZOC 전선 돌파 차단 테스트
      // (3, 8) 지점으로 이동시킨 후 (3, 5)로 직진하여 ZOC 차단 트리거
      const gridCopy = deepCopy(grid);
      const startTile = gridCopy[11][2];
      const knights = startTile.units.filter(u => u.unitClass === 'KNIGHT').slice(0, 3);
      startTile.units = startTile.units.filter(u => !knights.some(k => k.id === u.id));
      knights.forEach(k => { k.x = 3; k.y = 8; k.currentAP = 4; });
      gridCopy[8][3].units.push(...knights);
      setGrid(gridCopy);
      setSelectedTileCoord({ x: 3, y: 8 });
      setSelectedUnitIds(knights.map(k => k.id));

      setTimeout(() => {
        handleTileClick(3, 5); // 3,6의 ZOC 관통로로 진입 시 즉시 강제 중단!
      }, 200);
    }
  };

  // 마우스 오버 타일 정보
  const activeHoveredTile = useMemo(() => {
    if (!hoveredTile) return null;
    const tile = grid[hoveredTile.y]?.[hoveredTile.x];
    if (!tile) return null;
    const isZOC = !!zocData.zocMap[`${hoveredTile.x},${hoveredTile.y}`];
    const zocInfo = zocData.zocMap[`${hoveredTile.x},${hoveredTile.y}`];
    const isReachable = !!movableTiles[`${hoveredTile.x},${hoveredTile.y}`];
    const reachInfo = movableTiles[`${hoveredTile.x},${hoveredTile.y}`];

    return {
      tile,
      isZOC,
      zocInfo,
      isReachable,
      reachInfo
    };
  }, [hoveredTile, grid, zocData.zocMap, movableTiles]);

  return (
    <div className="space-y-4">
      {/* ==================================================================== */}
      {/* 1. 상단: 지휘관 스킬 상태 및 보유 이동 포인트(AP), 자원 대시보드 */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 지휘관 프로필 & 턴 */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Crown className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">최고사령관 아르투르</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  제 {commander.turn} 턴
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Stack of Doom (최대 100중첩)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1 font-mono text-amber-400 font-semibold">
                  <Coins className="w-3.5 h-3.5" />
                  {commander.gold} G
                </span>
                <span>•</span>
                <span className="text-slate-300">
                  야외 유지비: 6~12G / 턴 (마을·도시는 0G 면제)
                </span>
              </div>
            </div>
          </div>

          {/* 핵심 스킬 및 선택된 부대 AP 제약 표시 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* '신속한 진격' 스킬 상태 배지 */}
            <div
              className={`px-3 py-2 rounded-xl border flex items-center gap-2 transition-all ${
                commander.skills.rapidAdvance
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400'
              }`}
            >
              <Zap className={`w-4 h-4 ${commander.skills.rapidAdvance ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
              <div className="text-left leading-tight">
                <div className="text-[10px] uppercase font-semibold text-slate-400">지휘관 패시브</div>
                <div className="text-xs font-bold">
                  {commander.skills.rapidAdvance ? '신속한 진격 [ON]' : '신속한 진격 [OFF]'}
                  <span className="text-[10px] font-normal ml-1 text-slate-300">
                    {commander.skills.rapidAdvance ? '(AP -50% 소모)' : '(일반 소모)'}
                  </span>
                </div>
              </div>
            </div>

            {/* 현재 선택된 부대의 최저 이동력 (Stack minAP) */}
            <div className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-2.5">
              <Footprints className="w-4 h-4 text-emerald-400" />
              <div className="text-left leading-tight">
                <div className="text-[10px] uppercase font-semibold text-slate-400">
                  선택 부대 이동력 (최저 AP 기준)
                </div>
                <div className="text-xs font-bold flex items-center gap-1.5 font-mono">
                  {selectedUnitsToMove.length > 0 ? (
                    <>
                      <span className={stackMinAP > 0 ? 'text-emerald-400 text-sm font-bold' : 'text-rose-400 text-sm font-bold'}>
                        {stackMinAP} AP
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-amber-300 text-xs">{selectedUnitsToMove.length}기 부대</span>
                    </>
                  ) : (
                    <span className="text-slate-500">이동할 유닛 미선택</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 안내 알림 배너 */}
        {bannerNotice && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-transparent border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">{bannerNotice}</span>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. 중앙: 8x14 세로형 9:16 그리드 맵 & 정보 패널 */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* 그리드 맵 뷰포트 (세로형 8열 x 14행, 모바일 9:16 최적화) */}
        <div className="lg:col-span-7 xl:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col items-center">
          {/* 그리드 헤더 바 */}
          <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2.5 px-1">
            <div className="flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-white">8x14 2D 세로형 전술 맵 (Stack of Doom)</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500 inline-block"></span>
                ZOC 전선
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500/30 border border-emerald-400 inline-block"></span>
                이동 가능
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="px-1 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[9px]">x15</span>
                중첩 칩
              </span>
            </div>
          </div>

          {/* 8x14 그리드 캔버스 보드 */}
          <div className="w-full max-w-[480px] aspect-[9/16] max-h-[660px] bg-slate-950 rounded-xl p-1.5 border-2 border-slate-800 shadow-inner flex flex-col justify-between select-none">
            <div className="grid grid-cols-8 grid-rows-14 gap-1 w-full h-full">
              {grid.map((row, y) =>
                row.map((tile, x) => {
                  const key = `${x},${y}`;
                  const isZOC = !!zocData.zocMap[key];
                  const isMovable = !!movableTiles[key];
                  const moveCost = movableTiles[key]?.apCost;
                  const isSelected = selectedTileCoord.x === x && selectedTileCoord.y === y;
                  const isHovered = hoveredTile && hoveredTile.x === x && hoveredTile.y === y;

                  // 타일 내 유닛 통계
                  const livingUnits = tile.units.filter((u) => !u.isDead);
                  const stackCount = livingUnits.length;
                  const repUnit = getRepresentativeUnit(livingUnits);
                  const hasPlayer = livingUnits.some((u) => u.owner === 'PLAYER');
                  const hasEnemy = livingUnits.some((u) => u.owner === 'ENEMY');

                  // 타일 배경 스타일링
                  let tileBgClass = 'bg-slate-900 border-slate-800/80';
                  if (tile.type === 'ROUGH') {
                    tileBgClass = 'bg-stone-900 border-stone-700/80';
                  } else if (tile.type === 'VILLAGE') {
                    tileBgClass = 'bg-emerald-950/80 border-emerald-700/80';
                  } else if (tile.type === 'CITY') {
                    tileBgClass = 'bg-indigo-950/80 border-indigo-700/80';
                  }

                  return (
                    <button
                      key={key}
                      id={`tile-${x}-${y}`}
                      onClick={() => handleTileClick(x, y)}
                      onMouseEnter={() => setHoveredTile({ x, y })}
                      onMouseLeave={() => setHoveredTile(null)}
                      className={`relative rounded-md border text-[9px] flex flex-col items-center justify-between p-0.5 transition-all overflow-hidden ${tileBgClass} ${
                        isSelected ? 'ring-2 ring-amber-400 z-20 shadow-lg' : ''
                      } ${
                        isMovable
                          ? 'ring-1 ring-emerald-400 bg-emerald-950/40 hover:bg-emerald-800/50 cursor-pointer shadow-sm'
                          : ''
                      } ${
                        isZOC ? 'border-rose-500/80 shadow-[inset_0_0_8px_rgba(244,63,94,0.35)]' : ''
                      } ${isHovered ? 'brightness-125' : ''}`}
                    >
                      {/* ZOC 경계망 펄스 레이저 효과 */}
                      {isZOC && (
                        <div className="absolute inset-0 bg-rose-500/15 pointer-events-none flex items-center justify-center">
                          <span className="text-[7px] font-black tracking-tighter text-rose-400/80 uppercase">
                            ZOC
                          </span>
                        </div>
                      )}

                      {/* 상단: 좌표 및 지형 표시 */}
                      <div className="w-full flex items-center justify-between text-[7px] text-slate-400 font-mono leading-none z-10">
                        <span className="opacity-70">{x},{y}</span>
                        {tile.type === 'ROUGH' && (
                          <span className="text-amber-400 font-bold">2AP</span>
                        )}
                        {tile.type === 'VILLAGE' && (
                          <span className="text-emerald-400 font-bold">1x1</span>
                        )}
                        {tile.type === 'CITY' && (
                          <span className="text-indigo-400 font-bold">2x2</span>
                        )}
                      </div>

                      {/* 중앙: 유닛 렌더링 (대표 유닛 1개 + 중첩 유닛 카운트 칩 배지) */}
                      <div className="flex-1 flex items-center justify-center w-full z-10 relative">
                        {repUnit ? (
                          <div className="relative flex flex-col items-center">
                            {/* 대표 유닛 아바타 서클 */}
                            <div
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden border-2 shadow-md relative ${
                                hasPlayer
                                  ? 'border-amber-400 ring-2 ring-amber-400/40'
                                  : 'border-rose-500 ring-2 ring-rose-500/40'
                              } ${repUnit.isDisabled ? 'grayscale brightness-75' : ''}`}
                            >
                              <img
                                src={repUnit.imageUrl}
                                alt={repUnit.name}
                                className="w-full h-full object-cover"
                              />

                              {repUnit.isSafe && (
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-slate-900 flex items-center justify-center">
                                  <Shield className="w-1.5 h-1.5 text-white" />
                                </div>
                              )}
                              {repUnit.isDisabled && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <Lock className="w-2.5 h-2.5 text-rose-400" />
                                </div>
                              )}
                            </div>

                            {/* [핵심 사양] 중첩 유닛 수 카운트 칩 (예: x15, x4, x3) */}
                            {stackCount > 1 && (
                              <div
                                className={`absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full text-[8px] font-black border shadow-md leading-none ${
                                  hasPlayer
                                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300'
                                    : 'bg-gradient-to-r from-rose-600 to-rose-700 text-white border-rose-400'
                                }`}
                              >
                                x{stackCount}
                              </div>
                            )}

                            {/* 대표 유닛 HP 게이지 */}
                            <div className="w-6 sm:w-7 h-1 bg-slate-800 rounded-full mt-0.5 overflow-hidden border border-slate-700">
                              <div
                                className={`h-full ${
                                  hasPlayer ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${(repUnit.hp / repUnit.maxHp) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : tile.type === 'VILLAGE' ? (
                          <Tent className="w-3.5 h-3.5 text-emerald-400 opacity-70" />
                        ) : tile.type === 'CITY' ? (
                          <Building2 className="w-4 h-4 text-indigo-400 opacity-75" />
                        ) : null}
                      </div>

                      {/* 하단: 이동 AP 비용 표시 (Dijkstra) */}
                      <div className="w-full text-center z-10 leading-none">
                        {isMovable && stackCount === 0 && (
                          <span className="text-[8px] font-mono font-bold text-emerald-300 bg-emerald-950/90 px-1 py-0.2 rounded border border-emerald-600/40">
                            -{moveCost}AP
                          </span>
                        )}
                        {isMovable && hasPlayer && (
                          <span className="text-[7px] font-bold text-amber-300 bg-amber-950/80 px-1 py-0.2 rounded border border-amber-500">
                            합류
                          </span>
                        )}
                        {isMovable && hasEnemy && (
                          <span className="text-[7px] font-bold text-rose-300 bg-rose-950 px-1 py-0.2 rounded border border-rose-500 animate-pulse">
                            ⚔️돌격
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 우측 상단 정보 패널: 선택 타일 상세 & 실시간 전투 로그 */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* 타일 지형 및 ZOC 분석 카드 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-white font-bold">
                <Layers className="w-4 h-4 text-amber-400" />
                선택 타일 지형 및 전술 분석
              </span>
              <span className="text-[11px] font-mono text-amber-400 font-bold">
                ({selectedTileCoord.x}, {selectedTileCoord.y})
              </span>
            </h3>

            {activeTile && (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">지형 명칭:</span>
                  <span className="font-bold text-white">{activeTile.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">기본 이동 소모 (AP):</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {calculateTileCost(activeTile, commander.skills)} AP
                    {commander.skills.rapidAdvance && (
                      <span className="text-[10px] text-slate-400 font-normal ml-1">
                        (50% 할인)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">지형 방어 보너스:</span>
                  <span className="font-mono text-sky-400 font-bold">
                    +{Math.round(activeTile.defenseBonus * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">타일 주둔 유닛 수:</span>
                  <span className="font-bold text-emerald-400">
                    {activeTile.units.length} / {MAX_STACK_PER_TILE} 유닛
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">안전지대 여부:</span>
                  <span className={activeTile.isSafeZone ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {activeTile.isSafeZone ? '🏰 안전지대 (유지비 0G 면제)' : '야외 일반 구역'}
                  </span>
                </div>

                {zocData.zocMap[`${selectedTileCoord.x},${selectedTileCoord.y}`] && (
                  <div className="mt-2 p-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200">
                    <div className="flex items-center gap-1.5 font-bold text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      ZOC (포위망/전선) 경계 구역!
                    </div>
                    <p className="text-[11px] text-rose-300/90 mt-1 leading-snug">
                      {zocData.zocMap[`${selectedTileCoord.x},${selectedTileCoord.y}`].reason}
                    </p>
                    <p className="text-[10px] text-rose-400 mt-1">
                      ⚠️ 아군 유닛 진입 시 잔여 AP와 관계없이 이동이 즉시 강제 중단(Stop)됩니다.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 실시간 전술 터미널 로그 */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                전술 실행 로그
              </span>
              <button
                onClick={() => setLogs(['로그가 초기화되었습니다.'])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                비우기
              </button>
            </div>
            <div className="h-44 overflow-y-auto font-mono text-[11px] space-y-1 text-slate-300 pr-1 no-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="leading-snug">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. 핵심 사양: 하단 '부대 목록 (Stack Panel)' 및 이동 제약 컨트롤 */}
      {/*    - 타일 터치 시 하단에 '부대 목록(Stack Panel)'이 활성화된다. */}
      {/*    - [전체 선택 후 이동] 및 [동일 클래스 선택 후 이동] 기능 제공. */}
      {/*    - 이동 시 부대 내 유닛 중 가장 잔여 AP가 적은 유닛의 이동력을 기준으로 제한. */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-4 shadow-2xl">
        {/* 헤더 및 전체 선택 / 클래스 필터 버튼 바 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                부대 목록 (Stack Panel)
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                  좌표: ({selectedTileCoord.x}, {selectedTileCoord.y}) • 총 {activeTile?.units.length || 0}기
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                선택된 부대({selectedUnitsToMove.length}기)의 최저 이동력 기준: <strong className="text-emerald-400 font-mono">{stackMinAP} AP</strong>
              </p>
            </div>
          </div>

          {/* 선택 조작 버튼 그룹: [전체 선택 후 이동], [동일 클래스 선택 후 이동] */}
          {activeTileFriendlies.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* [전체 선택 후 이동] 버튼 */}
              <button
                onClick={handleSelectAllUnits}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                  classFilter === 'ALL' && selectedUnitsToMove.length === activeTileFriendlies.length
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                [전체 선택 후 이동 ({activeTileFriendlies.length}기)]
              </button>

              {/* [동일 클래스 선택 후 이동] 탭/필터 버튼들 */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1 text-xs">
                <span className="text-[10px] text-slate-400 font-semibold px-1.5">동일 클래스:</span>
                {['KNIGHT', 'MAGE', 'ARCHER', 'MELEE'].map((cls) => {
                  const count = activeTileFriendlies.filter(u => u.unitClass === cls).length;
                  if (count === 0) return null;
                  const labelMap: Record<string, string> = {
                    KNIGHT: '기사',
                    MAGE: '마법사',
                    ARCHER: '궁수',
                    MELEE: '보병'
                  };
                  return (
                    <button
                      key={cls}
                      onClick={() => handleSelectSameClass(cls)}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                        classFilter === cls
                          ? 'bg-amber-500 text-slate-950 font-bold shadow'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {labelMap[cls]} x{count}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 부대 유닛 카드 가로 스크롤 / 그리드 리스트 */}
        <div className="mt-3">
          {activeTile && activeTile.units.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
              {activeTile.units.map((unit) => {
                const isSelected = selectedUnitIds.includes(unit.id);
                const isRep = getRepresentativeUnit(activeTile.units)?.id === unit.id;

                return (
                  <div
                    key={unit.id}
                    onClick={() => {
                      if (unit.owner === 'PLAYER') {
                        handleToggleUnitSelect(unit.id);
                      }
                    }}
                    className={`p-2.5 rounded-xl border transition-all flex items-center gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-400/80 shadow-sm'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    } ${unit.isDisabled ? 'opacity-60' : ''}`}
                  >
                    {/* 선택 체크박스 */}
                    {unit.owner === 'PLAYER' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleUnitSelect(unit.id);
                        }}
                        className="text-amber-400 shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 fill-amber-400/20 text-amber-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </button>
                    )}

                    {/* 유닛 아바타 */}
                    <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                      <img
                        src={unit.imageUrl}
                        alt={unit.name}
                        className="w-full h-full object-cover"
                      />
                      {isRep && (
                        <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 p-0.5 rounded-bl text-[8px] font-black">
                          👑
                        </div>
                      )}
                    </div>

                    {/* 유닛 상세 스탯 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white truncate">
                          {unit.name}
                        </span>
                        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                          {unit.unitClass}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                        <span>공격 <strong className="text-amber-400">{unit.attackPower}</strong></span>
                        <span>•</span>
                        <span>방어 <strong className="text-sky-400">{unit.defensePower}</strong></span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] mt-1 font-mono">
                        <span className="text-slate-400">
                          HP {unit.hp}/{unit.maxHp}
                        </span>
                        <span className={`font-bold ${unit.currentAP > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {unit.currentAP}/{unit.baseAP} AP
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500 text-xs">
              선택된 타일에는 주둔 중인 부대가 없습니다. 맵 상의 다른 타일을 클릭해보세요.
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. 하단 필수 조작부: [턴 종료], [마을/도시 입장], [지휘관 스킬 토글] */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 자동 시나리오 검증 데모 버튼 그룹 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1 mr-1">
              <Play className="w-3.5 h-3.5 text-amber-400" />
              부대 중첩 검증 시나리오:
            </span>
            <button
              onClick={() => handleRunDemoScenario(1)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
            >
              1. 15기 전체 선택 (AP 3 제약)
            </button>
            <button
              onClick={() => handleRunDemoScenario(2)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs font-medium border border-amber-800/80"
            >
              2. 기사 5기 선별 (고속 AP 4)
            </button>
            <button
              onClick={() => handleRunDemoScenario(3)}
              className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs font-medium border border-rose-800/80"
            >
              3. ZOC 차단 돌격
            </button>
            <button
              onClick={handleResetGame}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs border border-slate-700 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              초기화
            </button>
          </div>

          {/* 시스템 명세 핵심 필수 3대 버튼 */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* 1. 지휘관 스킬 토글 */}
            <button
              id="btn-toggle-commander-skill"
              onClick={handleToggleRapidAdvance}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 border ${
                commander.skills.rapidAdvance
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Zap className="w-4 h-4" />
              [지휘관 스킬 토글]
            </button>

            {/* 2. 마을/도시 입장 */}
            <button
              id="btn-enter-safezone"
              onClick={handleEnterSafeZone}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md flex items-center justify-center gap-2 border border-emerald-500"
            >
              <Building2 className="w-4 h-4" />
              [마을/도시 입장]
            </button>

            {/* 3. 턴 종료 */}
            <button
              id="btn-turn-end"
              onClick={handleTurnEnd}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 border border-orange-400"
            >
              <RotateCcw className="w-4 h-4" />
              [턴 종료]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
