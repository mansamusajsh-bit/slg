import React, { useState } from 'react';
import { 
  Sword, 
  Sparkles, 
  Shield, 
  Target, 
  Crosshair, 
  Zap, 
  Heart, 
  ArrowUpRight, 
  Eye, 
  EyeOff, 
  Coins, 
  Footprints, 
  AlertOctagon,
  Flame,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { GameData } from '../gameData';

export const UnitsTab: React.FC = () => {
  const { UnitClasses, Promotions, Formulas } = GameData;
  const classKeys = Object.keys(UnitClasses) as (keyof typeof UnitClasses)[];

  const [selectedClassKey, setSelectedClassKey] = useState<keyof typeof UnitClasses>('KNIGHT');
  const [unitLevel, setUnitLevel] = useState(3);
  const [favorability, setFavorability] = useState(25); // 기본 25로 설정하여 거부 기제 테스트 용이
  const [predictedWinRate, setPredictedWinRate] = useState(0.24); // 24% 승률 (거부 발동 조건)
  const [berserkActive, setBerserkActive] = useState(false); // 지휘관 스킬 광폭화 토글
  const [matureSkinFilter, setMatureSkinFilter] = useState(true); // 검열 필터

  // 승급 랭크 상태 시뮬레이션
  const [combatRank, setCombatRank] = useState(2);
  const [firstStrikeRank, setFirstStrikeRank] = useState(1);
  const [withdrawalRank, setWithdrawalRank] = useState(1);
  const [antibulletRank, setAntibulletRank] = useState(selectedClassKey === 'KNIGHT' ? 2 : 0);
  const [collateralResistRank, setCollateralResistRank] = useState(1);

  const selectedClass = UnitClasses[selectedClassKey];

  // 레벨에 따른 스탯 계산
  const currentHp = Math.round(selectedClass.baseStats.hp + selectedClass.growthPerLevel.hp * (unitLevel - 1));
  const currentAtk = Math.round(selectedClass.baseStats.attack + selectedClass.growthPerLevel.attack * (unitLevel - 1));
  const currentDef = Math.round(selectedClass.baseStats.defense + selectedClass.growthPerLevel.defense * (unitLevel - 1));

  // 호감도 전투 거부 판정 테스트
  const mockUnitInstance = {
    favorability,
    promotions: {
      combatRank,
      firstStrikeRank,
      withdrawalRank,
      antibulletRank,
      collateralResistRank,
    },
  };

  const activeSkillsList = berserkActive ? ['BERSERK'] : [];
  const refusalCheck = Formulas.checkCombatRefusal(mockUnitInstance, predictedWinRate, activeSkillsList);

  const classIcons: Record<string, any> = {
    KNIGHT: Sword,
    MAGE: Sparkles,
    MELEE: Shield,
    ARCHER: Target,
    FIREARM: Crosshair,
  };

  const CurrentIcon = classIcons[selectedClassKey];

  return (
    <div className="space-y-6 pb-12">
      {/* Tab Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
            <CurrentIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              2. 5대 병과 스탯 & 개별 유닛 추적 스키마 (UnitClasses & Instance)
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              기사(보스 파밍 전용/방탄), 마법사(공성/2차 피해), 근접(탱커/반격), 궁수(곡사), 화기(고화력 직사 관통)로 이루어진 
              5대 병과와 라그나로크풍 스킬 트리, 승급 사다리, 그리고 호감도 30 이하 시 승률 30% 미만 교전 거부 로직을 완벽 검증합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Class Selector Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
        {classKeys.map((key) => {
          const item = UnitClasses[key];
          const Icon = classIcons[key];
          const isSelected = selectedClassKey === key;
          return (
            <button
              key={key}
              onClick={() => {
                setSelectedClassKey(key);
                if (key === 'KNIGHT') setAntibulletRank(2);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.name.split(' ')[0]}</span>
              {item.tier === 'TOP_TIER' && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-950/80 text-red-300 border border-red-800">
                  TOP
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Class Card & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Unit Card, Stats & Passives (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            {/* Top Bar with Tier Badge */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                  <CurrentIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{selectedClass.name}</h3>
                  <span className="text-xs text-amber-400 font-medium">{selectedClass.role}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border font-bold ${
                  selectedClass.tier === 'TOP_TIER'
                    ? 'bg-rose-950/60 text-rose-300 border-rose-700/60'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {selectedClass.tier === 'TOP_TIER' ? '★ 최상위 TOP TIER' : '표준 병과'}
                </span>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                  파밍: {selectedClass.acquisitionSource === 'FIELD_BOSS_ONLY' ? '⚔️ 필드 보스 전용' : '병영 생산 가능'}
                </div>
              </div>
            </div>

            {/* Level Selector */}
            <div className="mt-4 flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-xs text-slate-400">유닛 성장 레벨:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUnitLevel((l) => Math.max(1, l - 1))}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  -
                </button>
                <span className="font-mono text-base font-bold text-amber-400 px-2">Lv.{unitLevel}</span>
                <button
                  onClick={() => setUnitLevel((l) => Math.min(20, l + 1))}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Combat Stats Grid */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  <span>생명력 (HP)</span>
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {currentHp} <span className="text-[10px] text-slate-500">(+{selectedClass.growthPerLevel.hp}/Lv)</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>공격력 (Attack)</span>
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {currentAtk} <span className="text-[10px] text-slate-500">(+{selectedClass.growthPerLevel.attack}/Lv)</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                  <span>방어력 (Defense)</span>
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {currentDef} <span className="text-[10px] text-slate-500">(+{selectedClass.growthPerLevel.defense}/Lv)</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                  <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                  <span>이동력 (Mobility)</span>
                </div>
                <div className="text-base font-mono font-bold text-emerald-400">
                  {selectedClass.baseStats.mobility} 타일/AP
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                  <Crosshair className="w-3.5 h-3.5 text-purple-400" />
                  <span>사거리 (Range)</span>
                </div>
                <div className="text-base font-mono font-bold text-purple-400">
                  {selectedClass.baseStats.range.min === selectedClass.baseStats.range.max
                    ? `${selectedClass.baseStats.range.min} 타일 (근접)`
                    : `${selectedClass.baseStats.range.min}~${selectedClass.baseStats.range.max} 타일`}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span>2차 피해 (Collateral)</span>
                </div>
                <div className="text-base font-mono font-bold text-orange-400">
                  {Math.round(selectedClass.baseStats.collateralDamage * 100)}% 스플래시
                </div>
              </div>
            </div>

            {/* Special Class Mechanics Callout */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-2">
              <div className="font-bold text-slate-200">고유 병과 특성 및 패시브:</div>
              {selectedClass.innatePassives.map((p, idx) => (
                <div key={idx} className="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800/80">
                  <span className="font-bold text-amber-300">[{p.name}] </span>
                  {p.description}
                </div>
              ))}
              {selectedClass.id === 'KNIGHT' && (
                <div className="text-[11px] text-rose-300/90 bg-rose-950/30 p-2 rounded border border-rose-900/40">
                  ⚠️ <span className="font-bold">기마 지형 페널티:</span> 산악/숲 등 험지 타일 방어 보너스 50% 삭감 적용.
                </div>
              )}
              {selectedClass.id === 'MAGE' && (
                <div className="text-[11px] text-indigo-300 bg-indigo-950/30 p-2 rounded border border-indigo-900/40">
                  🏰 <span className="font-bold">공성 특화:</span> 방벽 및 도시 구조물 공격 시 +60% 추가 피해 부여.
                </div>
              )}
              {selectedClass.id === 'FIREARM' && (
                <div className="text-[11px] text-cyan-300 bg-cyan-950/30 p-2 rounded border border-cyan-900/40">
                  🎯 <span className="font-bold">직사 탄도 & 관통:</span> 방어력 35% 관통하나, 기사의 방탄 마갑(Rank 2)에 40% 대미지 경감 카운터 받음.
                </div>
              )}
            </div>

            {/* Maintenance Cost & Skin Preview */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-slate-400">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>야전 유지비: <strong className="text-white font-mono">{selectedClass.baseMaintenanceCost}G</strong> /턴</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMatureSkinFilter(!matureSkinFilter)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700"
                  title="성인/성숙 코스메틱 스킨 검열 필터"
                >
                  {matureSkinFilter ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-rose-400" />}
                  <span>스킨 검열 {matureSkinFilter ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Favorability Battle Refusal Simulator & Skills & Promotions (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Box 1: 호감도 30 이하 & 승률 30% 미만 전투 거부 기제 실시간 시뮬레이터 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <h3 className="font-semibold text-sm text-slate-100">
                  호감도 전투 거부 시뮬레이터 (Favorability Refusal Rule)
                </h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-rose-300 border border-slate-700">
                Formula: &lt;= 30 &amp;&amp; winRate &lt; 0.30
              </span>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between mb-1.5">
                  <span className="text-slate-400">유닛 현재 호감도 (favorability):</span>
                  <span className={`font-mono font-bold ${favorability <= 30 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {favorability} / 100
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={favorability}
                  onChange={(e) => setFavorability(parseInt(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                  <span>0 (극도의 불신)</span>
                  <span className="text-rose-400 font-bold">30 (임계선)</span>
                  <span>100 (절대 충성)</span>
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between mb-1.5">
                  <span className="text-slate-400">교전 예상 승률 (predictedWinRate):</span>
                  <span className={`font-mono font-bold ${predictedWinRate < 0.30 ? 'text-rose-400' : 'text-cyan-400'}`}>
                    {Math.round(predictedWinRate * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={Math.round(predictedWinRate * 100)}
                  onChange={(e) => setPredictedWinRate(parseInt(e.target.value) / 100)}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                  <span>5% (전멸 위기)</span>
                  <span className="text-rose-400 font-bold">30% (위험선)</span>
                  <span>95% (압도적 우세)</span>
                </div>
              </div>
            </div>

            {/* BERSERK Override Switch */}
            <div className="mt-3 flex items-center justify-between bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>지휘관 스킬 [BERSERK (광폭화)] 가동:</span>
              </div>
              <button
                onClick={() => setBerserkActive(!berserkActive)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                  berserkActive
                    ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {berserkActive ? '광폭화 강제 출격 ON' : '광폭화 OFF'}
              </button>
            </div>

            {/* Dynamic Result Banner */}
            <div className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              refusalCheck.refusesToFight
                ? 'bg-rose-950/60 border-rose-600/70 text-rose-200 animate-pulse'
                : 'bg-emerald-950/50 border-emerald-600/60 text-emerald-200'
            }`}>
              {refusalCheck.refusesToFight ? (
                <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {refusalCheck.refusesToFight ? '🛑 출격 거부! (Command Refused)' : '⚔️ 전투 명령 정상 승인 (Ready to Engage)'}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90">{refusalCheck.reason}</div>
              </div>
            </div>
          </div>

          {/* Box 2: 라그나로크풍 스킬 트리 (선제 필드 시전 Pre-collision Phase) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-sm text-slate-100">
                  라그나로크 모티브 스킬 트리 (Pre-Collision Field Cast)
                </h3>
              </div>
              <span className="text-[10px] text-amber-400/90 font-mono bg-amber-950/50 px-2 py-0.5 rounded border border-amber-900/50">
                선제 시전(Pre-collision) 가능
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {selectedClass.skillTree.map((skill: any) => (
                <div
                  key={skill.id}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-100 text-xs">{skill.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        skill.type === 'ACTIVE'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : skill.type === 'BUFF'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {skill.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{skill.description}</p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>AP: <strong className="text-amber-300">{skill.apCost}</strong></span>
                    <span>쿨다운: <strong className="text-cyan-300">{skill.cooldownTurns}턴</strong></span>
                    {skill.range && <span>사거리: {skill.range}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Box 3: 승급 사다리 (Promotions) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-slate-100">유닛 승급 사다리 (Promotions Ladder)</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">골드로 승급 해금</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {/* Combat */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">전투 숙련</span>
                  <span className="font-mono text-emerald-400 font-bold">Rank {combatRank}/4</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {[1, 2, 3, 4].map((r) => (
                    <button
                      key={r}
                      onClick={() => setCombatRank(r)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        combatRank >= r ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* First Strike */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">선제공격</span>
                  <span className="font-mono text-cyan-400 font-bold">Rank {firstStrikeRank}/4</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {[1, 2, 3, 4].map((r) => (
                    <button
                      key={r}
                      onClick={() => setFirstStrikeRank(r)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        firstStrikeRank >= r ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Withdrawal */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">퇴각술</span>
                  <span className="font-mono text-amber-400 font-bold">Rank {withdrawalRank}/2</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {[1, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => setWithdrawalRank(r)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        withdrawalRank >= r ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Antibullet */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">방탄 (기사특화)</span>
                  <span className="font-mono text-purple-400 font-bold">Rank {antibulletRank}/2</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {[1, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => setAntibulletRank(r)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        antibulletRank >= r ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collateral Resist */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">폭압 저항</span>
                  <span className="font-mono text-rose-400 font-bold">Rank {collateralResistRank}/2</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {[1, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => setCollateralResistRank(r)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        collateralResistRank >= r ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
