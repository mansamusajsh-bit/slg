import React, { useState, useEffect } from 'react';
import { Clock, RotateCcw, ShieldAlert, AlertTriangle, CheckCircle2, Lock, Flame, Info } from 'lucide-react';
import { GameData } from '../gameData';

export const RulesTab: React.FC = () => {
  const { turnTimeLimit, rewinder, logoutPenalty } = GameData.GameRules;

  // 턴 타이머 시뮬레이션 상태
  const [timerSeconds, setTimerSeconds] = useState(turnTimeLimit.baseDurationSec);
  const [isRunning, setIsRunning] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);

  // 시간 역행기 시뮬레이션 상태
  const [rewindCount, setRewindCount] = useState(rewinder.currentCount);
  const [rewindCooldown, setRewindCooldown] = useState(0);
  const [dailyRewindsUsed, setDailyRewindsUsed] = useState(1);

  // 24시간 손실 유닛 시뮬레이션 상태
  const [dailyUnitLoss, setDailyUnitLoss] = useState(6);
  const [totalUnitsRemaining, setTotalUnitsRemaining] = useState(8);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [currentStation, setCurrentStation] = useState<'FIELD' | 'TOWN' | 'CITY'>('FIELD');

  // 턴 타이머 인터벌
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const resetTimer = (fast: boolean = isFastMode) => {
    setIsRunning(false);
    setTimerSeconds(fast ? turnTimeLimit.fastModeDurationSec : turnTimeLimit.baseDurationSec);
  };

  const handleUseRewinder = () => {
    if (rewindCount <= 0) return;
    if (dailyRewindsUsed >= rewinder.maxDailyRewinds) return;
    setRewindCount((prev) => prev - 1);
    setDailyRewindsUsed((prev) => prev + 1);
    setRewindCooldown(rewinder.cooldownTurns);
  };

  const isWarningTime = timerSeconds <= turnTimeLimit.warningThresholdSec && timerSeconds > 0;
  const isLossCapReached = dailyUnitLoss >= logoutPenalty.maxDailyUnitLoss;
  const isAllUnitsLost = totalUnitsRemaining <= 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Overview Intro Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              1. 게임 시스템 코어 룰 데이터 (GameRules)
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              모바일 세로형 SLG의 긴장감 있는 턴 진행, 유료 아이템(시간 역행기)의 엄격한 자원 관리,
              그리고 오프라인 로그아웃 시 발생하는 기습 방어전 및 전멸 리셋 조건을 표준화한 코어 데이터입니다.
            </p>
          </div>
        </div>
      </div>

      {/* Grid Cards for 3 Core Systems */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Card 1: 턴 시간 제한 설정 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <h3 className="font-semibold text-sm text-slate-100">1-1. 턴 시간 제한 (Turn Limit)</h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                turnTimeLimit
              </span>
            </div>

            {/* Interactive Timer Mockup */}
            <div className={`p-4 rounded-xl text-center border transition-all ${
              timerSeconds === 0
                ? 'bg-rose-950/40 border-rose-600/50'
                : isWarningTime
                ? 'bg-amber-950/40 border-amber-500/60 animate-pulse'
                : 'bg-slate-950/70 border-slate-800'
            }`}>
              <div className="text-xs text-slate-400 uppercase tracking-widest font-mono mb-1">
                {timerSeconds === 0 ? '턴 시간 만료 (TIMEOUT)' : isWarningTime ? '⚠️ 긴급 경고 임박!' : '현재 남은 턴 시간'}
              </div>
              <div className={`font-mono font-black text-4xl tracking-tight ${
                timerSeconds === 0 ? 'text-rose-500' : isWarningTime ? 'text-amber-400' : 'text-slate-100'
              }`}>
                00:{timerSeconds < 10 ? `0${timerSeconds}` : timerSeconds}
              </div>
              <div className="text-[11px] text-slate-400 mt-2 flex justify-center gap-3">
                <span>기본: {turnTimeLimit.baseDurationSec}초</span>
                <span>경고: {turnTimeLimit.warningThresholdSec}초</span>
                <span>버퍼: +{turnTimeLimit.overtimeBufferSec}초</span>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setIsRunning(!isRunning)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  isRunning
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20'
                }`}
              >
                {isRunning ? '일시 정지' : '턴 타이머 가동'}
              </button>
              <button
                onClick={() => resetTimer()}
                className="py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                초기화
              </button>
              <button
                onClick={() => {
                  const nextMode = !isFastMode;
                  setIsFastMode(nextMode);
                  resetTimer(nextMode);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                  isFastMode
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {isFastMode ? '고속 30초 ON' : '고속 모드 OFF'}
              </button>
            </div>

            {/* Spec breakdown table */}
            <div className="mt-4 space-y-2 text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400 font-mono">autoEndOnTimeout:</span>
                <span className="font-semibold text-emerald-400">true (강제 자동 턴 종료)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400 font-mono">timeoutPenalty.skipAction:</span>
                <span className="font-semibold text-amber-400">행동 미지정 유닛 강제 패스</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400 font-mono">timeoutPenalty.moraleDeduction:</span>
                <span className="font-semibold text-rose-400">-2 사기/호감도 감소</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: 크로노스의 모래시계 (시간 역행기) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <h3 className="font-semibold text-sm text-slate-100">1-2. 시간 역행기 (Rewinder)</h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                rewinder
              </span>
            </div>

            {/* Inventory Display */}
            <div className="p-4 rounded-xl bg-gradient-to-b from-cyan-950/30 to-slate-950/60 border border-cyan-900/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white">{rewinder.name}</div>
                    <div className="text-[11px] text-cyan-400 font-mono">{rewinder.itemId}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-cyan-300">
                    {rewindCount} <span className="text-xs font-normal text-slate-400">/ {rewinder.maxCapacity}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">보유 수량</div>
                </div>
              </div>

              {/* Progress bars for daily limits and cooldown */}
              <div className="mt-3 space-y-2 pt-3 border-t border-cyan-900/30 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">당일 사용 한도 (24시간)</span>
                    <span className="font-mono text-cyan-300 font-semibold">{dailyRewindsUsed} / {rewinder.maxDailyRewinds}회</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full"
                      style={{ width: `${(dailyRewindsUsed / rewinder.maxDailyRewinds) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {rewindCooldown > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-amber-400 bg-amber-950/40 px-2 py-1 rounded">
                    <span>쿨다운 대기 중:</span>
                    <span className="font-mono font-bold">{rewindCooldown}턴 남음</span>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Use Button */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleUseRewinder}
                disabled={rewindCount <= 0 || dailyRewindsUsed >= rewinder.maxDailyRewinds}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  rewindCount <= 0 || dailyRewindsUsed >= rewinder.maxDailyRewinds
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>1턴 전으로 시간 역행 (-1 소모)</span>
              </button>
              <button
                onClick={() => {
                  setRewindCount((p) => Math.min(rewinder.maxCapacity, p + 1));
                  setRewindCooldown(0);
                }}
                className="py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                +1 충전
              </button>
            </div>

            {/* Policy Parameters */}
            <div className="mt-4 space-y-1.5 text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400 font-mono">자연 무료 충전:</span>
                <span className="font-semibold text-cyan-400">8시간당 1개 (최대 3개)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400 font-mono">유료 즉시 구매:</span>
                <span className="font-semibold text-amber-400">150 보석 (Gem)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400 font-mono">PvP 사용 정책:</span>
                <span className="font-semibold text-rose-400">사용 불가 (공정성 보장)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: 오프라인 로그아웃 페널티 & 전멸 리셋 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <h3 className="font-semibold text-sm text-slate-100">1-3. 로그아웃 페널티 & 전멸 룰</h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-rose-400 border border-slate-700">
                logoutPenalty
              </span>
            </div>

            {/* Offline Auto Defense Station Status */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">주둔 타일 위치:</span>
                <div className="flex gap-1">
                  {(['FIELD', 'TOWN', 'CITY'] as const).map((loc) => (
                    <button
                      key={loc}
                      onClick={() => setCurrentStation(loc)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        currentStation === loc
                          ? loc === 'FIELD'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {loc === 'FIELD' ? '야전 필드' : loc === 'TOWN' ? '마을 (1x1)' : '도시 (2x2)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status banner */}
              <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                currentStation === 'FIELD'
                  ? 'bg-rose-950/40 text-rose-300 border border-rose-900/50'
                  : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50'
              }`}>
                {currentStation === 'FIELD' ? (
                  <>
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <span className="font-bold">야전 전개 중 (autoDefenseMode = true)</span>
                      <p className="text-[11px] text-rose-300/80 mt-0.5">
                        로그아웃 시 적의 야습 대상이 됩니다. 패배 시 3600초(1시간) 동안 비활성화 보호 상태로 진입합니다.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                    <div>
                      <span className="font-bold">안전 주둔 (오프라인 무적 상태)</span>
                      <p className="text-[11px] text-emerald-300/80 mt-0.5">
                        마을 및 도시에 주둔한 유닛은 오프라인 수비전이 강제되지 않으며 유지비 0골드로 안전 보호됩니다.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* 24h Unit Loss Slider */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">24시간 내 유닛 손실 카운트:</span>
                  <span className={`font-mono font-bold ${isLossCapReached ? 'text-rose-400' : 'text-slate-200'}`}>
                    {dailyUnitLoss} / {logoutPenalty.maxDailyUnitLoss} 기
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={dailyUnitLoss}
                  onChange={(e) => setDailyUnitLoss(parseInt(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
                {isLossCapReached && (
                  <div className="mt-1 text-[11px] text-amber-300 bg-amber-950/50 px-2 py-1 rounded flex items-center gap-1.5 border border-amber-900/50">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>24시간 최대 손실(24기) 한도 도달! 추가 야습 면역 강제 쉴드 발동</span>
                  </div>
                )}
              </div>
            </div>

            {/* Zero Units Wipeout Reset Specification */}
            <div className="mt-4 p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span>전멸 리셋 조건 (resetCondition)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">유닛 수 0 도달 시</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-rose-400">
                  <span>❌</span>
                  <span>영지 점령 진행도 및 필드 자원 창고: 0으로 초기화</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span>✅</span>
                  <span>지휘관 레벨 및 지휘관 스킬(12종): 영구 보존 유지!</span>
                </div>
                <div className="flex items-center gap-1.5 text-cyan-400">
                  <span>✅</span>
                  <span>구매한 프리미엄 스킨 및 보상 팩(보병 2기, 궁수 1기) 무상 지급</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
