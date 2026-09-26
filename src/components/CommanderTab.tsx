import React, { useState } from 'react';
import { 
  Crown, 
  ShieldCheck, 
  Swords, 
  Zap, 
  HeartHandshake, 
  Activity, 
  LifeBuoy, 
  Cpu, 
  Flame, 
  Compass, 
  Award, 
  Star,
  Check,
  Play
} from 'lucide-react';
import { GameData } from '../gameData';

export const CommanderTab: React.FC = () => {
  const { CommanderSkills } = GameData;
  const skillKeys = Object.keys(CommanderSkills) as (keyof typeof CommanderSkills)[];

  // 활성화된 지휘관 스킬 상태 (기본적으로 주요 스킬 활성화)
  const [activeSkills, setActiveSkills] = useState<Record<string, boolean>>({
    BEAR_DOWN: true,
    PRECISION_STRIKE: true,
    BERSERK: true,
    ART_OF_WAR: true,
    SHIELD_WALL: true,
    IRONCLAD: true,
    DEFENDER_LEADER: true,
    TACTICAL_RETREAT: true,
    TECH_INNOVATION: true,
    RAPID_ADVANCE: true,
    COMMANDER_LEADERSHIP: true,
    STRATEGIC_DOMINANCE: true,
  });

  // 실시간 수치 시뮬레이터 파라미터
  const [testWinRate, setTestWinRate] = useState(0.28); // 28% (DEFENDER_LEADER 및 TACTICAL_RETREAT 발동 테스트)
  const [testBaseAtk, setTestBaseAtk] = useState(88);
  const [testBaseDef, setTestBaseDef] = useState(45);
  const [testIncomingCollateral, setTestIncomingCollateral] = useState(120);
  const [testApCost, setTestApCost] = useState(2);
  const [isFirstUnit, setIsFirstUnit] = useState(true);

  const toggleSkill = (key: string) => {
    setActiveSkills((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const selectAll = (val: boolean) => {
    const updated: Record<string, boolean> = {};
    skillKeys.forEach((k) => (updated[k] = val));
    setActiveSkills(updated);
  };

  const skillIcons: Record<string, any> = {
    BEAR_DOWN: Swords,
    PRECISION_STRIKE: Zap,
    BERSERK: Flame,
    ART_OF_WAR: Activity,
    SHIELD_WALL: ShieldCheck,
    IRONCLAD: ShieldCheck,
    DEFENDER_LEADER: Crown,
    TACTICAL_RETREAT: LifeBuoy,
    TECH_INNOVATION: Cpu,
    RAPID_ADVANCE: Compass,
    COMMANDER_LEADERSHIP: Award,
    STRATEGIC_DOMINANCE: Star,
  };

  // 실시간 계산 테스트
  // 1. 공격력 (BEAR_DOWN)
  const effectiveAtk = activeSkills.BEAR_DOWN && isFirstUnit
    ? Math.round(testBaseAtk * 1.20)
    : testBaseAtk;

  // 2. 방어력 (SHIELD_WALL)
  const effectiveDef = activeSkills.SHIELD_WALL
    ? Math.round(testBaseDef * 1.15)
    : testBaseDef;

  // 3. 2차 피해 경감 (IRONCLAD)
  const effectiveCollateral = activeSkills.IRONCLAD
    ? Math.round(testIncomingCollateral * 0.70)
    : testIncomingCollateral;

  // 4. AP 이동비용 (RAPID_ADVANCE)
  const effectiveAp = activeSkills.RAPID_ADVANCE
    ? Math.max(1, Math.round(testApCost * 0.50))
    : testApCost;

  // 5. 수비의 리더 & 전략적 후퇴 트리거 상태
  const isDefenderLeaderTriggered = activeSkills.DEFENDER_LEADER && testWinRate < 0.50;
  const isTacticalRetreatTriggered = activeSkills.TACTICAL_RETREAT && testWinRate < 0.30;

  return (
    <div className="space-y-6 pb-12">
      {/* Intro Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                3. 지휘관 12대 패시브 스킬 트리 (CommanderSkills)
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                보유 유닛이 전멸하여 영지가 리셋되더라도 영구 보존되는 최고위 지휘관 능력치 12종의 기능적 효과 정의 및 동적 계산 로직입니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => selectAll(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
            >
              전체 활성화
            </button>
            <button
              onClick={() => selectAll(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
            >
              전체 해제
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Battle Effect Live Simulator Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-slate-100">
              지휘관 패시브 실시간 수치 적용 검증 (Real-Time Modifier Engine)
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
            Active: {Object.values(activeSkills).filter(Boolean).length} / 12
          </span>
        </div>

        {/* Test Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px] mb-1">교전 승률 (Win Rate):</div>
            <div className="flex items-center justify-between">
              <span className={`font-mono font-bold text-sm ${testWinRate < 0.30 ? 'text-rose-400' : 'text-cyan-400'}`}>
                {Math.round(testWinRate * 100)}%
              </span>
              <input
                type="range"
                min="5"
                max="95"
                value={Math.round(testWinRate * 100)}
                onChange={(e) => setTestWinRate(parseInt(e.target.value) / 100)}
                className="w-20 accent-cyan-500"
              />
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px] mb-1">선두 돌격 유닛 여부:</div>
            <button
              onClick={() => setIsFirstUnit(!isFirstUnit)}
              className={`w-full py-1 rounded text-xs font-bold transition-all ${
                isFirstUnit ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isFirstUnit ? '선두 1번 유닛 (1st)' : '후속 부대'}
            </button>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px] mb-1">유입 2차 피해:</div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-orange-400">{testIncomingCollateral}</span>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={testIncomingCollateral}
                onChange={(e) => setTestIncomingCollateral(parseInt(e.target.value))}
                className="w-20 accent-orange-500"
              />
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px] mb-1">기본 이동 AP 비용:</div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-emerald-400">{testApCost} AP</span>
              <div className="flex gap-1">
                {[1, 2, 3].map((v) => (
                  <button
                    key={v}
                    onClick={() => setTestApCost(v)}
                    className={`w-5 h-5 rounded text-[10px] font-bold ${
                      testApCost === v ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Calculation Results Grid */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs pt-3 border-t border-slate-800">
          <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
            <span className="text-[10px] text-slate-400">공격력 (베어다운)</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {testBaseAtk} &rarr; <span className="text-amber-400">{effectiveAtk}</span>
              {isFirstUnit && activeSkills.BEAR_DOWN && <span className="text-[10px] text-amber-300 ml-1">(+20%)</span>}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
            <span className="text-[10px] text-slate-400">방어력 (방패장벽)</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {testBaseDef} &rarr; <span className="text-blue-400">{effectiveDef}</span>
              {activeSkills.SHIELD_WALL && <span className="text-[10px] text-blue-300 ml-1">(+15%)</span>}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
            <span className="text-[10px] text-slate-400">2차 피해 (철갑)</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {testIncomingCollateral} &rarr; <span className="text-orange-400">{effectiveCollateral}</span>
              {activeSkills.IRONCLAD && <span className="text-[10px] text-orange-300 ml-1">(-30%)</span>}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
            <span className="text-[10px] text-slate-400">이동 비용 (신속진격)</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {testApCost} AP &rarr; <span className="text-emerald-400">{effectiveAp} AP</span>
              {activeSkills.RAPID_ADVANCE && <span className="text-[10px] text-emerald-300 ml-1">(-50%)</span>}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-400">열세 발동 상태</span>
            <div className="text-xs font-bold mt-0.5">
              {isTacticalRetreatTriggered ? (
                <span className="text-rose-400">🚨 후퇴율+20%, HP 50%회복</span>
              ) : isDefenderLeaderTriggered ? (
                <span className="text-cyan-400">⚡ 선제공격 Rank 2 부여</span>
              ) : (
                <span className="text-slate-500">일반 교전 상태</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 12 Skills Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skillKeys.map((key, index) => {
          const skill = CommanderSkills[key];
          const Icon = skillIcons[key] || Crown;
          const isActive = activeSkills[key];

          return (
            <div
              key={key}
              onClick={() => toggleSkill(key)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                isActive
                  ? 'bg-slate-900/90 border-amber-500/50 shadow-lg shadow-amber-500/5 hover:border-amber-400'
                  : 'bg-slate-950/40 border-slate-800/80 opacity-60 hover:opacity-90'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span>{index + 1}. {skill.name.split(' ')[0]}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({skill.name.split(' ')[1] || ''})</span>
                      </div>
                      <span className="text-[10px] text-amber-400/90 font-mono">
                        Tier {skill.tier} • {skill.category}
                      </span>
                    </div>
                  </div>

                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                    isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600 border border-slate-700'
                  }`}>
                    {isActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300 leading-relaxed mt-2">
                  {skill.description}
                </p>
              </div>

              {/* Footer Meta */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Key: {skill.formulaKey}</span>
                <span className={`font-semibold ${isActive ? 'text-amber-400' : 'text-slate-600'}`}>
                  {isActive ? '● 활성화' : '○ 비활성화'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
