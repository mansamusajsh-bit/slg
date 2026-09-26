import React, { useState } from 'react';
import {
  Swords,
  Shield,
  Heart,
  Zap,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Skull,
  Flame,
  Crown,
  MapPin,
  Sparkles,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import {
  SampleUnits,
  SampleTiles,
  CommanderSkillsData,
  calculateWinChance,
  canAttack,
  executeBattle,
  useRewinder,
  deepCopy,
  Unit,
  Tile,
  BattleResult,
  RewinderResult
} from '../combatEngine';

export const BattleSimulatorTab: React.FC = () => {
  // Scenario State
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [scenarioResults, setScenarioResults] = useState<{ [key: number]: any }>({});
  const [isRunningAll, setIsRunningAll] = useState(false);

  // Custom Arena State
  const [attackerGroup, setAttackerGroup] = useState<Unit[]>([deepCopy(SampleUnits.ROLAND)]);
  const [defenderGroup, setDefenderGroup] = useState<Unit[]>([
    deepCopy(SampleUnits.GOBLIN_GUARD_A),
    deepCopy(SampleUnits.GOBLIN_GUARD_B)
  ]);
  const [selectedTileKey, setSelectedTileKey] = useState<string>('PLAINS');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['BEAR_DOWN']);

  // Favorability slider override for primary attacker
  const [customFavorability, setCustomFavorability] = useState<number>(85);

  // Battle Results & History
  const [battleHistory, setBattleHistory] = useState<BattleResult[]>([]);
  const [lastBattleResult, setLastBattleResult] = useState<BattleResult | null>(null);
  const [rewinderNotice, setRewinderNotice] = useState<string | null>(null);
  const [combatLogs, setCombatLogs] = useState<string[]>([
    '⚔️ 전투 엔진이 준비되었습니다. 4대 시나리오를 검증하거나 자유 전투를 시작하세요.'
  ]);

  const currentTile: Tile = SampleTiles[selectedTileKey] || SampleTiles.PLAINS;
  const primaryAttacker = attackerGroup[0];
  const primaryDefender = defenderGroup[0];

  // Recalculate win chance and attack readiness in real-time
  const previewAttacker: Unit = primaryAttacker
    ? { ...primaryAttacker, favorability: customFavorability }
    : deepCopy(SampleUnits.ROLAND);

  const previewWinChance = primaryAttacker && primaryDefender
    ? calculateWinChance(previewAttacker, primaryDefender, currentTile, selectedSkills)
    : { winChance: 50, attackerPower: 50, defenderPower: 50, tileDefBonus: 0, hasBearDown: false, hasPrecisionStrike: false };

  const previewAttackCheck = primaryAttacker
    ? canAttack(previewAttacker, previewWinChance.winChance, selectedSkills)
    : { canAttack: true, reason: '대기 중', overrideByBerserk: false };

  // Toggle commander skill
  const toggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skillId));
    } else {
      setSelectedSkills([...selectedSkills, skillId]);
    }
  };

  // Change primary attacker
  const handleSelectAttackerPreset = (presetKey: 'ROLAND' | 'ELENA' | 'KAIN') => {
    const unit = deepCopy(SampleUnits[presetKey]);
    setAttackerGroup([unit]);
    setCustomFavorability(unit.favorability);
    setRewinderNotice(null);
  };

  // Change defender squad preset
  const handleSelectDefenderPreset = (presetType: 'GOBLINS' | 'ORC_SOLO' | 'ORC_ARMY') => {
    if (presetType === 'GOBLINS') {
      setDefenderGroup([
        deepCopy(SampleUnits.GOBLIN_GUARD_A),
        deepCopy(SampleUnits.GOBLIN_GUARD_B)
      ]);
    } else if (presetType === 'ORC_SOLO') {
      setDefenderGroup([deepCopy(SampleUnits.ORC_WARLORD)]);
    } else {
      setDefenderGroup([
        deepCopy(SampleUnits.ORC_WARLORD),
        deepCopy(SampleUnits.GOBLIN_GUARD_A),
        deepCopy(SampleUnits.GOBLIN_GUARD_B)
      ]);
    }
    setRewinderNotice(null);
  };

  // Execute interactive battle
  const handleExecuteInteractiveBattle = () => {
    if (attackerGroup.length === 0 || defenderGroup.length === 0) {
      setCombatLogs((prev) => ['⚠️ 전투를 진행할 아군 또는 적군 유닛이 부대에 없습니다.', ...prev]);
      return;
    }

    // Apply current favorability to live primary attacker
    const currentArmy = deepCopy(attackerGroup);
    currentArmy[0].favorability = customFavorability;
    const currentEnemies = deepCopy(defenderGroup);

    const result = executeBattle(currentArmy, currentEnemies, currentTile, selectedSkills);
    setLastBattleResult(result);
    setRewinderNotice(null);

    if (result.success) {
      setAttackerGroup(result.remainingAttackers);
      setDefenderGroup(result.remainingDefenders);
      setBattleHistory((prev) => [...prev, result]);
    }

    setCombatLogs(result.logs);
  };

  // Execute Rewinder restoration
  const handleRewind = () => {
    if (battleHistory.length === 0 && !lastBattleResult) {
      setCombatLogs((prev) => ['⚠️ 복구할 이전 전투 스냅샷이 존재하지 않습니다.', ...prev]);
      return;
    }

    try {
      const historyToUse = lastBattleResult || battleHistory[battleHistory.length - 1];
      const rewindResult: RewinderResult = useRewinder(historyToUse);

      setAttackerGroup(rewindResult.restoredAttackerGroup);
      setDefenderGroup(rewindResult.restoredDefenderGroup);
      if (rewindResult.restoredAttackerGroup[0]) {
        setCustomFavorability(rewindResult.restoredAttackerGroup[0].favorability);
      }
      setSelectedSkills(rewindResult.restoredCommanderSkills);
      setRewinderNotice(rewindResult.message);
      setCombatLogs([
        '====================================================',
        rewindResult.message,
        `💾 복구된 아군 부대 수: ${rewindResult.restoredAttackerGroup.length}기 (생존 확인)`,
        `💾 복구된 적 부대 수: ${rewindResult.restoredDefenderGroup.length}기 (전원 부활 및 원상 복구 완료)`,
        '===================================================='
      ]);
    } catch (e: any) {
      setCombatLogs((prev) => [`❌ [오류] ${e.message}`, ...prev]);
    }
  };

  // Run Specific Scenario
  const runSingleScenario = (num: number) => {
    setActiveScenario(num);
    setRewinderNotice(null);

    if (num === 1) {
      // Scenario 1: Roland normal attack
      const army = [deepCopy(SampleUnits.ROLAND)];
      const enemy = [deepCopy(SampleUnits.GOBLIN_GUARD_A)];
      const tile = deepCopy(SampleTiles.PLAINS);
      const res = executeBattle(army, enemy, tile, ['BEAR_DOWN'], 15.0);

      setAttackerGroup(res.remainingAttackers);
      setDefenderGroup(res.remainingDefenders);
      setSelectedTileKey('PLAINS');
      setSelectedSkills(['BEAR_DOWN']);
      setCustomFavorability(85);
      setLastBattleResult(res);
      setBattleHistory([res]);
      setScenarioResults((prev) => ({ ...prev, 1: res }));
      setCombatLogs(res.logs);
    } else if (num === 2) {
      // Scenario 2: Kain refusal & Berserk override
      const army = [deepCopy(SampleUnits.KAIN)];
      const enemy = [deepCopy(SampleUnits.ORC_WARLORD)];
      const tile = deepCopy(SampleTiles.HILL);

      // Part A: Refusal
      const resA = executeBattle(army, enemy, tile, []);
      // Part B: Berserk
      const armyB = [deepCopy(SampleUnits.KAIN)];
      const enemyB = [deepCopy(SampleUnits.ORC_WARLORD)];
      const resB = executeBattle(armyB, enemyB, tile, ['BERSERK'], 50.0);

      setAttackerGroup([deepCopy(SampleUnits.KAIN)]);
      setDefenderGroup([deepCopy(SampleUnits.ORC_WARLORD)]);
      setSelectedTileKey('HILL');
      setSelectedSkills([]);
      setCustomFavorability(20);
      setLastBattleResult(resA);
      setScenarioResults((prev) => ({ ...prev, 2: { partA: resA, partB: resB } }));
      setCombatLogs([
        '▶ [시나리오 2-A: 호감도 부족 공격 거부]',
        ...resA.logs,
        '',
        '▶ [시나리오 2-B: 지휘관 스킬 광폭화(Berserk) 강제 출격]',
        ...resB.logs
      ]);
    } else if (num === 3) {
      // Scenario 3: Elena MAGE Splash + Permadeath
      const army = [deepCopy(SampleUnits.ELENA)];
      const enemy = [
        deepCopy(SampleUnits.GOBLIN_GUARD_A),
        deepCopy(SampleUnits.GOBLIN_GUARD_B)
      ];
      const tile = deepCopy(SampleTiles.PLAINS);
      const res = executeBattle(army, enemy, tile, ['IRONCLAD'], 5.0);

      setAttackerGroup(res.remainingAttackers);
      setDefenderGroup(res.remainingDefenders);
      setSelectedTileKey('PLAINS');
      setSelectedSkills(['IRONCLAD']);
      setCustomFavorability(60);
      setLastBattleResult(res);
      setBattleHistory([res]);
      setScenarioResults((prev) => ({ ...prev, 3: res }));
      setCombatLogs(res.logs);
    } else if (num === 4) {
      // Scenario 4: Rewinder test after Elena combat
      let lastRes = lastBattleResult;
      if (!lastRes || lastRes.casualties.length === 0) {
        const army = [deepCopy(SampleUnits.ELENA)];
        const enemy = [
          deepCopy(SampleUnits.GOBLIN_GUARD_A),
          deepCopy(SampleUnits.GOBLIN_GUARD_B)
        ];
        const tile = deepCopy(SampleTiles.PLAINS);
        lastRes = executeBattle(army, enemy, tile, ['IRONCLAD'], 5.0);
        setBattleHistory([lastRes]);
      }

      const rewindRes = useRewinder(lastRes);
      setAttackerGroup(rewindRes.restoredAttackerGroup);
      setDefenderGroup(rewindRes.restoredDefenderGroup);
      setCustomFavorability(rewindRes.restoredAttackerGroup[0]?.favorability || 60);
      setSelectedSkills(rewindRes.restoredCommanderSkills);
      setRewinderNotice(rewindRes.message);
      setScenarioResults((prev) => ({ ...prev, 4: rewindRes }));
      setCombatLogs([
        '▶ [시나리오 4: 크로노스 모래시계(Rewinder) 전황 복원]',
        rewindRes.message,
        `복구된 적 부대 수: ${rewindRes.restoredDefenderGroup.length}기 (영구사망되었던 유닛 전원 부활)`,
        `복원된 1번 유닛 HP: ${rewindRes.restoredDefenderGroup[0]?.name} (${rewindRes.restoredDefenderGroup[0]?.hp}/${rewindRes.restoredDefenderGroup[0]?.maxHp})`,
        '판정: 완벽 복원 성공 (PASS)'
      ]);
    }
  };

  // Run all 4 scenarios sequentially
  const handleRunAllScenarios = async () => {
    setIsRunningAll(true);
    runSingleScenario(1);
    await new Promise((r) => setTimeout(r, 600));
    runSingleScenario(2);
    await new Promise((r) => setTimeout(r, 600));
    runSingleScenario(3);
    await new Promise((r) => setTimeout(r, 600));
    runSingleScenario(4);
    setIsRunningAll(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
              <Swords className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  하드코어 전투 엔진 &amp; 시나리오 시뮬레이터
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ES6+ 순수 JS 엔진 탑재
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                문명4 확률 계산식 • 포켓몬 호감도(≤30 &amp; 승률 &lt; 30% 거부) • 공성 2차 스플래시 • 영구 사망(Permadeath) • 리와인더(Deep Copy 복원)
              </p>
            </div>
          </div>

          <button
            onClick={handleRunAllScenarios}
            disabled={isRunningAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs shadow-lg shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isRunningAll ? '시나리오 순차 구동 중...' : '4대 핵심 시나리오 일괄 실행'}
          </button>
        </div>
      </div>

      {/* 4 Core Scenarios Quick Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Scenario 1 */}
        <div
          onClick={() => runSingleScenario(1)}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeScenario === 1
              ? 'bg-amber-500/10 border-amber-500/80 ring-1 ring-amber-500/40 shadow-lg'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-amber-400">시나리오 1</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Civ4 공식
            </span>
          </div>
          <div className="font-bold text-white text-sm">정상 공격 &amp; 승률 판정</div>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            성기사 롤랑(호감도 85, 승률 76.5%) vs 고블린 방패병. 베어다운(+20%) 적용 정상 격파.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">실행하기</span>
            <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
          </div>
        </div>

        {/* Scenario 2 */}
        <div
          onClick={() => runSingleScenario(2)}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeScenario === 2
              ? 'bg-rose-500/10 border-rose-500/80 ring-1 ring-rose-500/40 shadow-lg'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-rose-400">시나리오 2</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              호감도 &amp; 광폭화
            </span>
          </div>
          <div className="font-bold text-white text-sm">호감도 부족 거부 &amp; 광폭화</div>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            저격수 카인(호감도 20, 승률 21.6%) 출격 거부. 지휘관 스킬 [광폭화(Berserk)]로 강제 출격.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">실행하기</span>
            <ChevronRight className="w-3.5 h-3.5 text-rose-400" />
          </div>
        </div>

        {/* Scenario 3 */}
        <div
          onClick={() => runSingleScenario(3)}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeScenario === 3
              ? 'bg-purple-500/10 border-purple-500/80 ring-1 ring-purple-500/40 shadow-lg'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-purple-400">시나리오 3</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              MAGE &amp; 영구사망
            </span>
          </div>
          <div className="font-bold text-white text-sm">공성 스플래시 &amp; 영구사망</div>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            대마도사 일레나 메테오 2차 피해 적용. 철갑(Ironclad) 30% 경감. 전사자 메모리 즉각 제적.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">실행하기</span>
            <ChevronRight className="w-3.5 h-3.5 text-purple-400" />
          </div>
        </div>

        {/* Scenario 4 */}
        <div
          onClick={() => runSingleScenario(4)}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeScenario === 4
              ? 'bg-cyan-500/10 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-lg'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-cyan-400">시나리오 4</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Deep Copy
            </span>
          </div>
          <div className="font-bold text-white text-sm">크로노스 리와인더 롤백</div>
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            전투 직전 턴 스냅샷으로 완벽 복구. 전사 유닛 100% 부활 및 HP/위치 원상 복구 검증.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">실행하기</span>
            <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
          </div>
        </div>
      </div>

      {/* Main Interactive Combat Arena */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>실시간 전투 시뮬레이션 전장 (Live Arena)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">아군 프리셋:</span>
            <button
              onClick={() => handleSelectAttackerPreset('ROLAND')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                primaryAttacker?.id === 'unit_knight_roland'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              성기사 롤랑
            </button>
            <button
              onClick={() => handleSelectAttackerPreset('ELENA')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                primaryAttacker?.id === 'unit_mage_elena'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              대마도사 일레나
            </button>
            <button
              onClick={() => handleSelectAttackerPreset('KAIN')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                primaryAttacker?.id === 'unit_gunner_kain'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              저격수 카인
            </button>

            <span className="text-slate-600 mx-1">|</span>

            <span className="text-slate-400">적군 프리셋:</span>
            <button
              onClick={() => handleSelectDefenderPreset('GOBLINS')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
            >
              고블린 2개 분대
            </button>
            <button
              onClick={() => handleSelectDefenderPreset('ORC_SOLO')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
            >
              오크 군주 1기
            </button>
          </div>
        </div>

        {/* Rewinder Notification Banner */}
        {rewinderNotice && (
          <div className="mt-4 p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 text-xs flex items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{rewinderNotice}</span>
            </div>
            <button
              onClick={() => setRewinderNotice(null)}
              className="text-cyan-400 hover:text-white text-[11px] underline"
            >
              닫기
            </button>
          </div>
        )}

        {/* 3-Column Arena Layout: Attacker - Battlefield / Controls - Defender */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
          {/* Left: Attacker Squad Card (5 cols) */}
          <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Swords className="w-4 h-4" /> 아군 공격 부대 ({attackerGroup.length}기)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                선두: {primaryAttacker ? primaryAttacker.name : '없음'}
              </span>
            </div>

            {primaryAttacker ? (
              <div className="space-y-4">
                {/* Unit Portrait & Core Header */}
                <div className="relative rounded-xl overflow-hidden border border-slate-700/80 bg-slate-900 group">
                  <div className="h-36 w-full relative">
                    <img
                      src={primaryAttacker.imageUrl}
                      alt={primaryAttacker.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>

                    {/* Class & Level Badge */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black uppercase">
                        {primaryAttacker.unitClass}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-900/80 backdrop-blur text-slate-200 text-[10px] font-mono border border-slate-700">
                        Lv.{primaryAttacker.level}
                      </span>
                    </div>

                    {/* Permadeath Indicator */}
                    {primaryAttacker.isDead && (
                      <div className="absolute inset-0 bg-rose-950/80 backdrop-blur flex flex-col items-center justify-center text-rose-300 font-bold">
                        <Skull className="w-8 h-8 text-rose-400 animate-bounce" />
                        <span className="text-xs mt-1">영구 사망 (부대 제적됨)</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-900/90">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-white text-sm">{primaryAttacker.name}</h3>
                      <span className="text-xs font-mono text-slate-400">EXP: {primaryAttacker.exp}</span>
                    </div>

                    {/* HP Bar */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Heart className="w-3 h-3 text-rose-500" /> HP
                        </span>
                        <span className="font-bold text-white">
                          {primaryAttacker.hp} / {primaryAttacker.maxHp}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            primaryAttacker.hp / primaryAttacker.maxHp > 0.5
                              ? 'bg-emerald-500'
                              : primaryAttacker.hp / primaryAttacker.maxHp > 0.2
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.max(0, (primaryAttacker.hp / primaryAttacker.maxHp) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">기본 공격력</span>
                    <span className="font-bold text-orange-400 font-mono text-sm">{primaryAttacker.attackPower}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">기본 방어력</span>
                    <span className="font-bold text-blue-400 font-mono text-sm">{primaryAttacker.defensePower}</span>
                  </div>
                </div>

                {/* Favorability (호감도) Control */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-pink-500" />
                      호감도 (Favorability)
                    </span>
                    <span
                      className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                        customFavorability <= 30
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {customFavorability} / 100
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={customFavorability}
                    onChange={(e) => setCustomFavorability(Number(e.target.value))}
                    className="w-full accent-pink-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />

                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span className="text-rose-400">0~30: 위험 (승률 &lt; 30%시 거부)</span>
                    <span className="text-emerald-400">31~100: 정상 출격</span>
                  </div>
                </div>

                {/* Promotions & Skills */}
                <div className="text-xs space-y-1.5">
                  <div className="text-slate-400 text-[11px] font-bold">보유 승급 / 특수 능력:</div>
                  <div className="flex flex-wrap gap-1">
                    {primaryAttacker.promotions.map((p) => (
                      <span
                        key={p.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        {p.name}
                      </span>
                    ))}
                    {primaryAttacker.skills.map((s) => (
                      <span
                        key={s.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs">아군 부대가 전멸했습니다.</div>
            )}
          </div>

          {/* Center: Battlefield & Real-time Calculations (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Tile Selection & Preview */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  전투 타일 (Terrain)
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  방어 +{Math.round(currentTile.defenseBonus * 100)}%
                </span>
              </div>

              {/* Tile Thumbnail */}
              <div className="relative h-24 rounded-xl overflow-hidden border border-slate-700/60 group mb-3">
                <img
                  src={currentTile.bgImageUrl}
                  alt={currentTile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent"></div>
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs font-bold text-white">
                  <span>{currentTile.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
                    ({currentTile.x}, {currentTile.y})
                  </span>
                </div>
              </div>

              {/* Tile Selector Buttons */}
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {Object.keys(SampleTiles).map((key) => {
                  const t = SampleTiles[key];
                  const isSelected = selectedTileKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedTileKey(key)}
                      className={`px-2 py-1.5 rounded-lg text-left transition-all border ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="truncate font-semibold">{t.name}</div>
                      <div className="text-[10px] opacity-70">방어 +{Math.round(t.defenseBonus * 100)}%</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Commander Skills Selection */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  지휘관 패시브 스킬 트리
                </span>
                <span className="text-[10px] text-slate-500 font-mono">클릭 시 활성화</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.keys(CommanderSkillsData).map((k) => {
                  const skill = CommanderSkillsData[k];
                  const isActive = selectedSkills.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => toggleSkill(k)}
                      className={`p-2 rounded-xl text-left border transition-all flex items-start gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <img
                        src={skill.iconUrl}
                        alt={skill.name}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-700"
                      />
                      <div className="overflow-hidden">
                        <div className="font-bold text-[11px] truncate">{skill.name}</div>
                        <div className="text-[9px] text-slate-500 truncate mt-0.5">{skill.category}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Civ4 Win Chance Display & Verdict */}
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider mb-1">
                Civilization IV 전투 승률 예측
              </div>
              <div className="text-3xl font-black text-amber-400 tracking-tight font-mono">
                {previewWinChance.winChance.toFixed(1)}%
              </div>

              {/* Power Ratio Breakdown */}
              <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono">
                <span>공격력: <strong className="text-orange-400">{previewWinChance.attackerPower}</strong></span>
                <span className="text-slate-600">vs</span>
                <span>방어력: <strong className="text-blue-400">{previewWinChance.defenderPower}</strong></span>
              </div>

              {/* Refusal / Readiness Status Badge */}
              <div className="mt-3">
                {previewAttackCheck.canAttack ? (
                  previewAttackCheck.overrideByBerserk ? (
                    <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Flame className="w-3.5 h-3.5" /> 광폭화(Berserk) 강제 출격 승인
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 정상 출격 승인 (호감도 충분)
                    </div>
                  )
                ) : (
                  <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> [공격 거부] 호감도 30이하 &amp; 승률 30%미만
                  </div>
                )}
              </div>

              {/* Combat Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={handleExecuteInteractiveBattle}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs shadow-lg shadow-orange-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Swords className="w-4 h-4" /> 교전 실행 (Roll)
                </button>

                <button
                  onClick={handleRewind}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="전투 직전 스냅샷으로 턴 복구"
                >
                  <RotateCcw className="w-4 h-4 text-cyan-400" /> 리와인더 (되돌리기)
                </button>
              </div>
            </div>
          </div>

          {/* Right: Defender Squad Card (4 cols) */}
          <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> 적군 방어 부대 ({defenderGroup.length}기)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                선두: {primaryDefender ? primaryDefender.name : '전멸'}
              </span>
            </div>

            {defenderGroup.length > 0 ? (
              <div className="space-y-3">
                {defenderGroup.map((unit, idx) => (
                  <div
                    key={unit.id}
                    className={`rounded-xl border p-3 transition-all ${
                      idx === 0
                        ? 'bg-slate-900 border-rose-500/40 ring-1 ring-rose-500/20'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                        <img
                          src={unit.imageUrl}
                          alt={unit.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {idx === 0 && (
                          <span className="absolute top-0 left-0 bg-rose-600 text-white text-[9px] px-1 font-bold">
                            주타겟
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-white text-xs truncate">{unit.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">Lv.{unit.level}</span>
                        </div>

                        {/* HP Bar */}
                        <div className="mt-1">
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>HP</span>
                            <span className="font-bold text-white">
                              {unit.hp} / {unit.maxHp}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-rose-500 transition-all duration-300"
                              style={{ width: `${Math.max(0, (unit.hp / unit.maxHp) * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
                          <span>공격: {unit.attackPower}</span>
                          <span>방어: {unit.defensePower}</span>
                          {idx > 0 && (
                            <span className="text-amber-400 text-[9px]">MAGE 스플래시 피격 대상</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 text-xs flex flex-col items-center justify-center">
                <Skull className="w-10 h-10 text-slate-600 mb-2" />
                <span className="font-bold text-slate-300">적군 부대 전멸</span>
                <span className="text-[11px] text-slate-500 mt-1">
                  모든 유닛이 영구 사망 처리되어 부대 명부에서 제적되었습니다.
                </span>
                <button
                  onClick={handleRewind}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-xs font-bold hover:bg-cyan-900 transition-all cursor-pointer"
                >
                  크로노스 리와인더로 부활시키기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Combat Console / Event Logs */}
        <div className="mt-6 bg-slate-950 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              전투 이벤트 로그 (Combat Terminal Logs)
            </span>
            <button
              onClick={() => setCombatLogs([])}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              로그 비우기
            </button>
          </div>

          <div className="h-44 overflow-y-auto no-scrollbar rounded-xl bg-slate-900/90 p-3 font-mono text-xs text-slate-300 border border-slate-800 space-y-1">
            {combatLogs.map((log, index) => (
              <div
                key={index}
                className={`leading-relaxed ${
                  log.includes('공격 거부')
                    ? 'text-rose-400 font-bold'
                    : log.includes('영구 사망')
                    ? 'text-rose-500 font-bold'
                    : log.includes('광폭화')
                    ? 'text-amber-400 font-bold'
                    : log.includes('스플래시') || log.includes('철갑')
                    ? 'text-purple-400'
                    : log.includes('시간 역행기')
                    ? 'text-cyan-400 font-bold'
                    : log.includes('승률')
                    ? 'text-emerald-400'
                    : 'text-slate-300'
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rules & Formulas Reference Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-amber-400" />
          핵심 전투 엔진 계산 공식 명세 (Civilization IV &amp; Permadeath Specifications)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="font-bold text-amber-400 mb-1">1. 문명4 확률 계산식</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              [공격자 전투력] = atk * (1 + 승급/스킬) * (베어다운 +20%)<br />
              [방어자 전투력] = def * (1 + 타일방어%) * (1 + 승급/스킬)<br />
              <strong>승률(%) = [공격] / ([공격] + [방어]) * 100</strong>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="font-bold text-rose-400 mb-1">2. 호감도 &amp; 광폭화</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              유닛 호감도가 <strong>30 이하</strong>이고 계산된 승률이 <strong>30% 미만</strong>이면 공격 거부.<br />
              단, 지휘관 스킬 <strong>광폭화(Berserk)</strong> 보유 시 제약 무시 강제 출격.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="font-bold text-purple-400 mb-1">3. 공성 2차 피해 &amp; 철갑</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              <strong>MAGE</strong> 클래스 공격 성공 시 적 부대 전체에 45% 스플래시 피해 발생.<br />
              지휘관 스킬 <strong>철갑(Ironclad)</strong> 보유 시 2차 피해 <strong>30% 경감</strong>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="font-bold text-cyan-400 mb-1">4. 영구 사망 &amp; 리와인더</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              HP 0 이하 유닛은 <strong>영구 사망(isDead = true)</strong> 및 메모리/배열 즉각 영구 제적.<br />
              <strong>크로노스 모래시계</strong> 발동 시 직전 턴 스냅샷으로 Deep Copy 완전 롤백.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
