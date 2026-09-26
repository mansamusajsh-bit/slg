import React, { useState, useMemo, useEffect } from 'react';
import {
  Player,
  Unit,
  Tile,
  Commander,
  CommanderSkillId,
  CommanderSkillTreeManager,
  process_turn_upkeep,
  sell_unit_in_city,
  handle_offline_attack,
  set_player_offline_state,
  calculate_unit_combat_power,
  createDefaultPlayer,
  createDefaultUnit,
  createDefaultTile,
  createDefaultCommander,
  runPhase4SimulationTests,
  TestResultItem
} from '../phase4Engine';
import {
  Coins,
  Shield,
  Swords,
  Zap,
  Building2,
  Tent,
  Trees,
  Mountain,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Lock,
  Unlock,
  Users,
  ChevronRight,
  HelpCircle,
  Crown,
  Heart,
  Award,
  Layers,
  Flame,
  LifeBuoy,
  Cpu,
  Compass,
  Star
} from 'lucide-react';

export const Phase4Tab: React.FC = () => {
  // ==========================================================================
  // 1. 상태 관리: 플레이어, 타일 맵, 적 플레이어
  // ==========================================================================

  // 타일 맵 정의 (도시 2x2, 마을 1x1, 평원, 숲, 언덕)
  const [tilesMap] = useState<Record<string, Tile>>(() => ({
    '1,1': createDefaultTile({ id: 't_city_11', x: 1, y: 1, type: 'CITY', name: '왕도 카멜롯 (2x2 북서)' }),
    '2,1': createDefaultTile({ id: 't_city_21', x: 2, y: 1, type: 'CITY', name: '왕도 카멜롯 (2x2 북동)' }),
    '1,2': createDefaultTile({ id: 't_city_12', x: 1, y: 2, type: 'CITY', name: '왕도 카멜롯 (2x2 남서)' }),
    '2,2': createDefaultTile({ id: 't_city_22', x: 2, y: 2, type: 'CITY', name: '왕도 카멜롯 (2x2 남동)' }),
    '4,1': createDefaultTile({ id: 't_village_41', x: 4, y: 1, type: 'VILLAGE', name: '브리튼 마을 (1x1)' }),
    '3,3': createDefaultTile({ id: 't_plain_33', x: 3, y: 3, type: 'PLAIN', name: '황무지 평원 (야외)' }),
    '4,4': createDefaultTile({ id: 't_forest_44', x: 4, y: 4, type: 'FOREST', name: '안개 숲 (야외)' }),
    '5,5': createDefaultTile({ id: 't_hill_55', x: 5, y: 5, type: 'HILL', name: '철벽 언덕 (야외)' })
  }));

  // 방어 플레이어 (사용자)
  const [player, setPlayer] = useState<Player>(() => {
    const p = createDefaultPlayer({
      id: 'PLAYER_ARTHUR',
      name: '최고사령관 아르투르',
      gold: 45, // 테스트를 위해 적절한 골드 세팅
      turn: 1
    });

    p.commander.skillPoints = 3;

    // 초기 유닛 4기:
    // U1: 도시 주둔 (유지비 0G)
    // U2: 마을 주둔 (유지비 0G)
    // U3: 평원 주둔 (유지비 15G)
    // U4: 언덕 주둔 (유지비 10G, 최약 유닛)
    p.units = [
      createDefaultUnit({
        id: 'U_KNIGHT_01',
        name: '성기사 롤랑',
        unitClass: 'KNIGHT',
        level: 3,
        favorability: 85,
        attackPower: 95,
        defensePower: 65,
        hp: 180,
        maxHp: 180,
        upkeepCost: 15,
        currentTile: { x: 1, y: 1 }, // 도시
        isSafe: true,
        imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80'
      }),
      createDefaultUnit({
        id: 'U_MAGE_02',
        name: '대마법사 멀린',
        unitClass: 'MAGE',
        level: 2,
        favorability: 70,
        attackPower: 80,
        defensePower: 40,
        hp: 120,
        maxHp: 120,
        upkeepCost: 12,
        currentTile: { x: 4, y: 1 }, // 마을
        isSafe: true,
        imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80'
      }),
      createDefaultUnit({
        id: 'U_ARCHER_03',
        name: '정예 궁수 로빈',
        unitClass: 'ARCHER',
        level: 2,
        favorability: 55,
        attackPower: 60,
        defensePower: 30,
        hp: 100,
        maxHp: 100,
        upkeepCost: 10,
        currentTile: { x: 3, y: 3 }, // 평원
        isSafe: false,
        imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80'
      }),
      createDefaultUnit({
        id: 'U_RECRUIT_04',
        name: '의용 보병 톰',
        unitClass: 'MELEE',
        level: 1,
        favorability: 40,
        attackPower: 35,
        defensePower: 20,
        hp: 80,
        maxHp: 80,
        upkeepCost: 8,
        currentTile: { x: 5, y: 5 }, // 언덕 (최약 유닛)
        isSafe: false,
        imageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80'
      })
    ];

    return p;
  });

  // 공격 플레이어 (오프라인 침공 테스트용 가상 적군)
  const [enemyAttacker, setEnemyAttacker] = useState<Player>(() => {
    const p = createDefaultPlayer({
      id: 'ENEMY_WARLORD',
      name: '약탈 군주 고르그',
      gold: 500
    });
    p.commander.unlockedSkills.STRATEGIC_DOMINANCE = true; // 포섭 유닛 초기 호감도 25 패시브
    return p;
  });

  // 콘솔 및 이벤트 로그
  const [logs, setLogs] = useState<string[]>([
    '🏛️ [Phase 4: 마을/도시 경제, 유지비, 지휘관 스킬 트리 및 비동기 방어] 엔진 로드 완료.',
    '🏰 왕도 카멜롯(2x2) 및 브리튼 마을(1x1)에서는 유지비가 0G로 전액 면제됩니다.',
    '⚠️ 야외 필드 주둔 유닛은 턴 종료 시 유지비를 청구받으며, 골드 부족 시 [비활성화] 상태로 전환됩니다.',
    '🛡️ 로그아웃 시 필드 유닛은 강제 방어 모드로 노출되며, 패배 시 최약체 1기만 수탈되고 1시간 보호막이 전개됩니다.'
  ]);

  const [notification, setNotification] = useState<string | null>(null);

  // 자동 테스트 실행 결과 상태
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: TestResultItem[];
  } | null>(null);

  // 알림 자동 소멸
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // --------------------------------------------------------------------------
  // 1. 유닛 유지비 및 턴 경제 핸들러 (process_turn_upkeep)
  // --------------------------------------------------------------------------
  const handleProcessTurnUpkeep = () => {
    const playerCopy = JSON.parse(JSON.stringify(player)) as Player;
    const result = process_turn_upkeep(playerCopy, tilesMap);

    setPlayer(playerCopy);
    setLogs((prev) => [...result.logs.slice().reverse(), ...prev]);

    if (result.inactivatedCount > 0) {
      setNotification(`⚠️ 유지비 체납! ${result.inactivatedCount}기 유닛이 비활성화(Inactivated)되었습니다.`);
    } else {
      setNotification(`✅ 제 ${playerCopy.turn - 1}턴 유지비 정상 결제 완료 (-${result.goldDeducted}G 차감)`);
    }
  };

  // --------------------------------------------------------------------------
  // 2. 도시 유닛 매각 핸들러 (sell_unit_in_city)
  // --------------------------------------------------------------------------
  const handleSellUnit = (unitId: string) => {
    const targetUnit = player.units.find((u) => u.id === unitId);
    if (!targetUnit) return;

    const tileKey = `${targetUnit.currentTile.x},${targetUnit.currentTile.y}`;
    const tile = tilesMap[tileKey];

    if (!tile) {
      setNotification('해당 위치의 타일 정보를 찾을 수 없습니다.');
      return;
    }

    const playerCopy = JSON.parse(JSON.stringify(player)) as Player;
    const res = sell_unit_in_city(playerCopy, unitId, tile);

    setLogs((prev) => [...res.logs.slice().reverse(), ...prev]);

    if (res.success) {
      setPlayer(playerCopy);
      setNotification(`💰 [${res.unitName}] 매각 완료! +${res.refundGold}G 환급되었습니다.`);
    } else {
      setNotification(`❌ 매각 불가: ${res.reason}`);
    }
  };

  // --------------------------------------------------------------------------
  // 3. 비동기 로그아웃 상태 전환 & 오프라인 침공 시뮬레이션 (handle_offline_attack)
  // --------------------------------------------------------------------------
  const handleToggleOfflineState = () => {
    const playerCopy = JSON.parse(JSON.stringify(player)) as Player;
    const nextOnline = !playerCopy.isOnline;

    if (!nextOnline) {
      const offlineRes = set_player_offline_state(playerCopy, tilesMap);
      setPlayer(playerCopy);
      setLogs((prev) => [...offlineRes.logs.slice().reverse(), ...prev]);
      setNotification(
        offlineRes.mode === 'SAFE_PROTECTED'
          ? '🏰 안전 로그아웃: 공격 불가 보호 상태'
          : `⚠️ 필드 로그아웃: 야외 유닛 ${offlineRes.exposedUnitsCount}기 강제 방어 노출`
      );
    } else {
      playerCopy.isOnline = true;
      playerCopy.units.forEach((u) => {
        u.isOfflineDefenseMode = false;
      });
      setPlayer(playerCopy);
      const msg = '🟢 [온라인 복귀] 플레이어가 정상 접속했습니다.';
      setLogs((prev) => [msg, ...prev]);
      setNotification(msg);
    }
  };

  // 적의 비동기 기습 공격 시뮬레이션
  const handleSimulateEnemyRaid = (defenderWins: boolean) => {
    if (player.isOnline) {
      setNotification('플레이어가 온라인 상태입니다. 먼저 [로그아웃 모드]로 전환하세요.');
      return;
    }

    const playerCopy = JSON.parse(JSON.stringify(player)) as Player;
    const enemyCopy = JSON.parse(JSON.stringify(enemyAttacker)) as Player;

    // 타겟 지형 (야외 언덕 타일 5,5 기준)
    const targetTile = tilesMap['5,5'];
    const currentEpoch = Math.floor(Date.now() / 1000);

    const attackRes = handle_offline_attack(
      playerCopy,
      enemyCopy,
      { defenderWon: defenderWins },
      targetTile,
      currentEpoch
    );

    setPlayer(playerCopy);
    setEnemyAttacker(enemyCopy);
    setLogs((prev) => [...attackRes.logs.slice().reverse(), ...prev]);

    if (defenderWins) {
      setNotification('🎉 방어 성공! 기습해온 적군을 성공적으로 격퇴했습니다.');
    } else {
      if (attackRes.rescuedByTechInnovation) {
        setNotification('🛡️ 기술 혁신(Tech Innovation) 발동! 유닛이 영구 소멸에서 구제되었습니다.');
      } else if (attackRes.lootedUnit) {
        setNotification(`💀 패배! 최약체 [${attackRes.lootedUnit.name}]이(가) 수탈당했습니다. (1시간 보호막 전개)`);
      }
    }
  };

  // --------------------------------------------------------------------------
  // 4. 지휘관 스킬 트리 해금 핸들러 (CommanderSkillTreeManager)
  // --------------------------------------------------------------------------
  const handleUnlockSkill = (skillId: CommanderSkillId) => {
    const playerCopy = JSON.parse(JSON.stringify(player)) as Player;
    const res = CommanderSkillTreeManager.unlockSkill(playerCopy.commander, skillId);

    if (res.success) {
      setPlayer(playerCopy);
      setLogs((prev) => [`✨ ${res.message}`, ...prev]);
      setNotification(res.message);
    } else {
      setLogs((prev) => [`⚠️ 해금 실패: ${res.message}`, ...prev]);
      setNotification(`해금 불가: ${res.message}`);
    }
  };

  // 스킬 포인트 추가 치트/테스트 버튼
  const handleAddSkillPoints = (amount: number) => {
    setPlayer((prev) => ({
      ...prev,
      commander: {
        ...prev.commander,
        skillPoints: prev.commander.skillPoints + amount
      }
    }));
    setNotification(`지휘관 스킬 포인트 +${amount} SP 충전 완료`);
  };

  // 골드 추가 치트 버튼
  const handleAddGold = (amount: number) => {
    setPlayer((prev) => ({
      ...prev,
      gold: prev.gold + amount
    }));
    setNotification(`골드 +${amount}G 충전 완료`);
  };

  // --------------------------------------------------------------------------
  // 5. 전체 시스템 자동 검증 테스트 스위트 실행
  // --------------------------------------------------------------------------
  const handleRunFullTestSuite = () => {
    const suiteResult = runPhase4SimulationTests();
    setTestResults({
      allPassed: suiteResult.allPassed,
      totalTests: suiteResult.totalTests,
      passedTests: suiteResult.passedTests,
      results: suiteResult.results
    });
    setLogs((prev) => [...suiteResult.fullLogs.slice().reverse(), ...prev]);
    setNotification(
      suiteResult.allPassed
        ? `✅ 4단계 코어 테스트 전 항목(${suiteResult.totalTests}개) 완벽 통과!`
        : `⚠️ 테스트 실패 항목 존재 (${suiteResult.passedTests}/${suiteResult.totalTests})`
    );
  };

  // --------------------------------------------------------------------------
  // 유닛 위치 이동(도시 주둔 vs 야외 배치) 시뮬레이션
  // --------------------------------------------------------------------------
  const handleRelocateUnit = (unitId: string, toSafe: boolean) => {
    setPlayer((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as Player;
      const u = copy.units.find((item) => item.id === unitId);
      if (u) {
        if (toSafe) {
          u.currentTile = { x: 1, y: 1 }; // 도시
          u.isSafe = true;
          u.isInactivated = false;
        } else {
          u.currentTile = { x: 3, y: 3 }; // 평원
          u.isSafe = false;
        }
      }
      return copy;
    });
    setNotification(toSafe ? '유닛이 왕도(도시)로 입성하여 안전 상태가 되었습니다.' : '유닛이 야외 평원으로 배치되었습니다.');
  };

  // 스킬 아이콘 매핑
  const skillIcons: Record<CommanderSkillId, any> = {
    BEAR_DOWN: Swords,
    BERSERK: Flame,
    ART_OF_WAR: Award,
    PRECISION_STRIKE: Zap,
    SHIELD_WALL: Shield,
    IRONCLAD: Shield,
    DEFENDER_LEADER: Crown,
    TACTICAL_RETREAT: LifeBuoy,
    TECH_INNOVATION: Cpu,
    RAPID_ADVANCE: Compass,
    COMMANDER_LEADERSHIP: Star,
    STRATEGIC_DOMINANCE: Sparkles
  };

  return (
    <div className="space-y-4">
      {/* ==================================================================== */}
      {/* 1. 상단 글로벌 대시보드: 지휘관 상태, 재화, 방어 모드 요약 */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 지휘관 프로필 */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Crown className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{player.commander.name}</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  제 {player.turn}턴
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${
                    player.isOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : player.offlineStatus.mode === 'SAFE_PROTECTED'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {player.isOnline ? '온라인 작전 중' : player.offlineStatus.mode === 'SAFE_PROTECTED' ? '안전 로그아웃 (보호)' : '오프라인 강제방어 노출'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1 font-mono text-amber-400 font-bold text-sm">
                  <Coins className="w-4 h-4" />
                  {player.gold} G
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono text-purple-300 font-bold text-xs">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  보유 SP: {player.commander.skillPoints}
                </span>
                <span>•</span>
                <span className="text-slate-300">
                  총 보유 유닛: {player.units.length}기
                </span>
              </div>
            </div>
          </div>

          {/* 상단 액션 버튼 그룹 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleAddGold(50)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs font-semibold border border-amber-800/60 transition-all flex items-center gap-1"
            >
              <Coins className="w-3.5 h-3.5" />
              +50G 충전
            </button>
            <button
              onClick={() => handleAddSkillPoints(2)}
              className="px-2.5 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 text-xs font-semibold border border-purple-800/60 transition-all flex items-center gap-1"
            >
              <Zap className="w-3.5 h-3.5" />
              +2 SP 충전
            </button>
            <button
              onClick={handleRunFullTestSuite}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-900/40 transition-all flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              4단계 전 항목 자동 검증 실행
            </button>
          </div>
        </div>

        {/* 안내 알림 배너 */}
        {notification && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-transparent border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">{notification}</span>
          </div>
        )}

        {/* 1시간 피격 패널티 타이머 안내 (활성화 시) */}
        {player.commander.isCommanderDisabled && player.commander.deactivationTimerEndTimestamp && (
          <div className="mt-2 p-2.5 rounded-xl bg-rose-950/70 border border-rose-600/60 text-rose-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400 animate-spin" />
              <span>
                <strong>1시간 비활성화 패널티 발효 중:</strong> 연쇄 약탈 방지 보호막 가동 (만료 시각: {new Date(player.commander.deactivationTimerEndTimestamp * 1000).toLocaleTimeString()})
              </span>
            </div>
            <button
              onClick={() => {
                setPlayer((prev) => ({
                  ...prev,
                  commander: { ...prev.commander, isCommanderDisabled: false, deactivationTimerEndTimestamp: null }
                }));
                setNotification('1시간 패널티가 즉시 해제되었습니다.');
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-rose-800 text-white font-bold hover:bg-rose-700"
            >
              패널티 즉시 해제
            </button>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. 섹션 1 & 2: 턴 경제·유지비 & 도시 유닛 매각 & 오프라인 방어 */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 좌측: 유닛 상태 및 유지비 정산 패널 */}
        <div className="lg:col-span-7 space-y-4">
          {/* 유닛 목록 카드 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  주둔 유닛 목록 및 위치별 유지비 현황
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  도시(2x2)·마을(1x1) 주둔 시 <strong className="text-emerald-400">유지비 0G 완전 면제</strong> • 야외 필드는 정상 청구
                </p>
              </div>

              {/* 턴 종료 (유지비 정산) 버튼 */}
              <button
                id="btn-process-turn-upkeep"
                onClick={handleProcessTurnUpkeep}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4" />
                [턴 종료 (process_turn_upkeep)]
              </button>
            </div>

            {/* 유닛 카드 그리드 */}
            <div className="space-y-2.5">
              {player.units.map((unit) => {
                const tileKey = `${unit.currentTile.x},${unit.currentTile.y}`;
                const currentTile = tilesMap[tileKey];
                const isCityTile = currentTile?.type === 'CITY';
                const combatPower = calculate_unit_combat_power(unit);

                return (
                  <div
                    key={unit.id}
                    className={`p-3 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-3 ${
                      unit.isInactivated
                        ? 'bg-rose-950/20 border-rose-500/40 opacity-75'
                        : unit.isSafe
                        ? 'bg-emerald-950/20 border-emerald-700/50'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    {/* 좌측: 유닛 정보 */}
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-700 shrink-0">
                        <img
                          src={unit.imageUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80'}
                          alt={unit.name}
                          className="w-full h-full object-cover"
                        />
                        {unit.isInactivated && (
                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                            <Lock className="w-4 h-4 text-rose-400" />
                          </div>
                        )}
                        {unit.isSafe && (
                          <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 p-0.5 rounded-bl text-[8px] font-black">
                            안전
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{unit.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                            Lv.{unit.level} {unit.unitClass}
                          </span>
                          {unit.isInactivated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500 font-bold">
                              비활성화(Inactivated)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                          <span>전투력: <strong className="text-amber-400">{combatPower}pt</strong></span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-rose-300">
                            <Heart className="w-3 h-3 text-rose-400" />
                            호감도: {unit.favorability}pt
                          </span>
                          <span>•</span>
                          <span>
                            위치: <strong className={currentTile?.isSafeZone ? 'text-emerald-400' : 'text-amber-400'}>{currentTile?.name}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 우측: 유지비 & 액션 버튼 (매각 및 위치 이동) */}
                    <div className="flex items-center gap-2">
                      <div className="text-right font-mono mr-2">
                        <div className="text-[10px] text-slate-400">턴 유지비</div>
                        <div className={`text-xs font-bold ${unit.isSafe ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {unit.isSafe ? '0 G (면제)' : `${unit.upkeepCost} G`}
                        </div>
                      </div>

                      {/* 위치 변경 (도시 주둔 ↔ 야외 이동) */}
                      {unit.isSafe ? (
                        <button
                          onClick={() => handleRelocateUnit(unit.id, false)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
                        >
                          야외 배치
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRelocateUnit(unit.id, true)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-xs font-medium border border-emerald-800"
                        >
                          도시 입성
                        </button>
                      )}

                      {/* 도시 유닛 매각 버튼 (sell_unit_in_city) */}
                      <button
                        onClick={() => handleSellUnit(unit.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 ${
                          isCityTile
                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        }`}
                        title={isCityTile ? '도시 타일에서 유닛 매각' : '도시 타일에서만 매각 가능'}
                      >
                        <Coins className="w-3.5 h-3.5" />
                        매각
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 우측: 비동기 로그아웃 방어 모드 & 침공 시뮬레이터 카드 */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-sky-400" />
              비동기 로그아웃 방어 &amp; 수탈 시스템
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              플레이어가 접속을 종료할 때, <strong>안전지대(마을/도시)</strong> 주둔 유닛은 공격 불가 보호 상태가 되며, <strong>야외 필드</strong> 주둔 유닛은 '강제 방어 모드'로 노출됩니다.
            </p>

            {/* 온/오프라인 전환 컨트롤 */}
            <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">접속 상태 전환</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  현재 상태: <strong className={player.isOnline ? 'text-emerald-400' : 'text-rose-400'}>{player.isOnline ? '온라인 작전' : '로그아웃 (방어 모드)'}</strong>
                </div>
              </div>
              <button
                onClick={handleToggleOfflineState}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  player.isOnline
                    ? 'bg-slate-800 hover:bg-slate-700 text-rose-300 border-rose-500/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                }`}
              >
                {player.isOnline ? '로그아웃 전환' : '온라인 로그인'}
              </button>
            </div>

            {/* 적 침공 시뮬레이션 버튼 그룹 */}
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-300">비동기 피격 시나리오 테스트:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSimulateEnemyRaid(false)}
                  className="px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-bold border border-rose-700/60 shadow flex flex-col items-center justify-center leading-tight"
                >
                  <span>⚔️ 기습 피격: 패배</span>
                  <span className="text-[10px] font-normal text-rose-400 mt-0.5">최약체 1기 수탈 &amp; 1시간 패널티</span>
                </button>
                <button
                  onClick={() => handleSimulateEnemyRaid(true)}
                  className="px-3 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 text-xs font-bold border border-emerald-700/60 shadow flex flex-col items-center justify-center leading-tight"
                >
                  <span>🛡️ 기습 피격: 방어 성공</span>
                  <span className="text-[10px] font-normal text-emerald-400 mt-0.5">지형 보너스로 적 격퇴</span>
                </button>
              </div>
            </div>

            {/* 적군 전리품 수탈 현황 (약탈자 시점) */}
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-semibold text-white">가상 적군 ({enemyAttacker.name}) 소유 포획 유닛:</span>
                <span className="font-mono text-amber-400 font-bold">{enemyAttacker.units.length}기</span>
              </div>
              {enemyAttacker.units.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {enemyAttacker.units.map((u) => (
                    <div key={u.id} className="text-[11px] text-amber-300 flex items-center justify-between bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      <span>💀 {u.name} (Lv.{u.level} {u.unitClass})</span>
                      <span className="font-mono text-slate-400">호감도: {u.favorability}pt (Strategic Dominance 적용)</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">아직 수탈된 유닛이 없습니다.</div>
              )}
            </div>
          </div>

          {/* 터미널 로그 창 */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Phase 4 엔진 실시간 이벤트 로그
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
      {/* 3. 섹션 3: 지휘관 스킬 트리 매니저 (CommanderSkillTreeManager) */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              지휘관 패시브 스킬 트리 (CommanderSkillTreeManager)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              스킬 포인트를 사용하여 상위 계층의 패시브 스킬을 해금합니다. 선행 스킬(Prerequisite) 요구 조건을 충족해야 합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">잔여 스킬 포인트:</span>
            <span className="text-sm font-mono font-bold text-purple-400">{player.commander.skillPoints} SP</span>
          </div>
        </div>

        {/* 3대 계열 스킬 트리 그리드: 공격형, 방어형, 유틸형 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* A. 공격형 (Offensive) */}
          <div className="bg-slate-950/80 border border-rose-900/40 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 pb-2 border-b border-rose-900/40">
              <Swords className="w-4 h-4" />
              공격형 트리 (Offensive)
            </div>

            {(['BEAR_DOWN', 'BERSERK', 'ART_OF_WAR', 'PRECISION_STRIKE'] as CommanderSkillId[]).map((skillId) => {
              const node = CommanderSkillTreeManager.SKILL_NODES[skillId];
              const isUnlocked = player.commander.unlockedSkills[skillId];
              const check = CommanderSkillTreeManager.canUnlockSkill(player.commander, skillId);
              const IconComp = skillIcons[skillId] || Swords;

              return (
                <div
                  key={skillId}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isUnlocked
                      ? 'bg-rose-950/30 border-rose-500/60 shadow-sm'
                      : check.canUnlock
                      ? 'bg-slate-900 border-slate-700 hover:border-slate-600'
                      : 'bg-slate-900/50 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-lg ${isUnlocked ? 'bg-rose-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{node.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Tier {node.tier} • {node.costSP} SP 소모
                          {node.prerequisite && <span className="ml-1 text-amber-400">(선행: {node.prerequisite})</span>}
                        </div>
                      </div>
                    </div>

                    {isUnlocked ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        해금됨
                      </span>
                    ) : (
                      <button
                        onClick={() => handleUnlockSkill(skillId)}
                        disabled={!check.canUnlock}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          check.canUnlock
                            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        해금하기
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
                    {node.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* B. 방어형 (Defensive) */}
          <div className="bg-slate-950/80 border border-sky-900/40 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 pb-2 border-b border-sky-900/40">
              <Shield className="w-4 h-4" />
              방어형 트리 (Defensive)
            </div>

            {(['SHIELD_WALL', 'IRONCLAD', 'DEFENDER_LEADER', 'TACTICAL_RETREAT'] as CommanderSkillId[]).map((skillId) => {
              const node = CommanderSkillTreeManager.SKILL_NODES[skillId];
              const isUnlocked = player.commander.unlockedSkills[skillId];
              const check = CommanderSkillTreeManager.canUnlockSkill(player.commander, skillId);
              const IconComp = skillIcons[skillId] || Shield;

              return (
                <div
                  key={skillId}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isUnlocked
                      ? 'bg-sky-950/30 border-sky-500/60 shadow-sm'
                      : check.canUnlock
                      ? 'bg-slate-900 border-slate-700 hover:border-slate-600'
                      : 'bg-slate-900/50 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-lg ${isUnlocked ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{node.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Tier {node.tier} • {node.costSP} SP 소모
                          {node.prerequisite && <span className="ml-1 text-amber-400">(선행: {node.prerequisite})</span>}
                        </div>
                      </div>
                    </div>

                    {isUnlocked ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        해금됨
                      </span>
                    ) : (
                      <button
                        onClick={() => handleUnlockSkill(skillId)}
                        disabled={!check.canUnlock}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          check.canUnlock
                            ? 'bg-sky-600 hover:bg-sky-500 text-white shadow'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        해금하기
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
                    {node.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* C. 유틸형 (Utility) */}
          <div className="bg-slate-950/80 border border-purple-900/40 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400 pb-2 border-b border-purple-900/40">
              <Sparkles className="w-4 h-4" />
              유틸형 트리 (Utility)
            </div>

            {(['TECH_INNOVATION', 'RAPID_ADVANCE', 'COMMANDER_LEADERSHIP', 'STRATEGIC_DOMINANCE'] as CommanderSkillId[]).map((skillId) => {
              const node = CommanderSkillTreeManager.SKILL_NODES[skillId];
              const isUnlocked = player.commander.unlockedSkills[skillId];
              const check = CommanderSkillTreeManager.canUnlockSkill(player.commander, skillId);
              const IconComp = skillIcons[skillId] || Sparkles;

              return (
                <div
                  key={skillId}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isUnlocked
                      ? 'bg-purple-950/30 border-purple-500/60 shadow-sm'
                      : check.canUnlock
                      ? 'bg-slate-900 border-slate-700 hover:border-slate-600'
                      : 'bg-slate-900/50 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-lg ${isUnlocked ? 'bg-purple-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{node.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Tier {node.tier} • {node.costSP} SP 소모
                          {node.prerequisite && <span className="ml-1 text-amber-400">(선행: {node.prerequisite})</span>}
                        </div>
                      </div>
                    </div>

                    {isUnlocked ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        해금됨
                      </span>
                    ) : (
                      <button
                        onClick={() => handleUnlockSkill(skillId)}
                        disabled={!check.canUnlock}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          check.canUnlock
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        해금하기
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
                    {node.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. 섹션 4: 자동 시뮬레이션 테스트 결과 카드 */}
      {/* ==================================================================== */}
      {testResults && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              4단계 핵심 요구사항 자동 시뮬레이션 검증 결과
            </h3>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black ${
                testResults.allPassed
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {testResults.passedTests} / {testResults.totalTests} 통과 ({testResults.allPassed ? 'ALL PASS! ✅' : 'FAIL'})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {testResults.results.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5"
              >
                {item.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-bold text-white">{item.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5 leading-relaxed">
                    {item.details}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
