import React, { useState } from 'react';
import { 
  MapPin, 
  Trees, 
  Mountain, 
  Home, 
  Building2, 
  ShieldAlert, 
  Coins, 
  Footprints, 
  ShoppingBag, 
  Recycle, 
  ShieldCheck, 
  Timer,
  Info
} from 'lucide-react';
import { GameData } from '../gameData';

export const TilesTab: React.FC = () => {
  const { TileTypes, Formulas } = GameData;
  const tileKeys = Object.keys(TileTypes) as (keyof typeof TileTypes)[];

  const [selectedTileKey, setSelectedTileKey] = useState<keyof typeof TileTypes>('TOWN');
  const [siegeElapsedSec, setSiegeElapsedSec] = useState(1420); // 1420 / 1800s
  const [unitCountOnTile, setUnitCountOnTile] = useState(3);
  const [dismantleUnitLevel, setDismantleUnitLevel] = useState(4);

  const selectedTile = TileTypes[selectedTileKey];

  // 5x5 미니 맵 시뮬레이션 그리드
  const miniGrid = [
    ['PLAIN', 'PLAIN', 'DEFENSIVE_TERRAIN', 'PLAIN', 'PLAIN'],
    ['PLAIN', 'TOWN', 'PLAIN', 'BLOCKADE_FRONT', 'BLOCKADE_FRONT'],
    ['DEFENSIVE_TERRAIN', 'PLAIN', 'CITY', 'CITY', 'BLOCKADE_FRONT'],
    ['PLAIN', 'PLAIN', 'CITY', 'CITY', 'PLAIN'],
    ['PLAIN', 'DEFENSIVE_TERRAIN', 'PLAIN', 'PLAIN', 'PLAIN'],
  ];

  const tileColors: Record<string, string> = {
    PLAIN: 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60',
    DEFENSIVE_TERRAIN: 'bg-green-950/80 border-green-600 text-green-300 hover:bg-green-900/80',
    TOWN: 'bg-sky-950/80 border-sky-500 text-sky-300 hover:bg-sky-900/80',
    CITY: 'bg-amber-950/80 border-amber-500 text-amber-300 hover:bg-amber-900/80',
    BLOCKADE_FRONT: 'bg-rose-950/80 border-rose-600 text-rose-300 hover:bg-rose-900/80 animate-pulse',
  };

  const tileLabels: Record<string, string> = {
    PLAIN: '평지',
    DEFENSIVE_TERRAIN: '산/숲',
    TOWN: '마을',
    CITY: '도시',
    BLOCKADE_FRONT: '전선',
  };

  // 유지비 계산
  const sampleUnit = { maintenanceCostPerTurn: 15 };
  const maintenanceResult = Formulas.calculateUnitMaintenance(sampleUnit, selectedTile);
  const totalTurnCost = maintenanceResult.cost * unitCountOnTile;

  // 도시 유닛 분해 코어 계산
  const cityExpCore = (selectedTile as any).unitMarket?.expCoreConversion(dismantleUnitLevel);

  return (
    <div className="space-y-6 pb-12">
      {/* Tab Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              4. 타일 시스템 & 거점 기제 (TileTypes & Strongholds)
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              기본 평지(AP 1), 방어 산/숲(AP 2, 방어+20%~40%), 1x1 마을(유지비 0, 호감도 상점), 
              2x2 거대 요새 도시(유지비 0, 유닛 분해/매각 시장), 그리고 1800초 후 방위부대를 소환하는 포위망 전선 시스템입니다.
            </p>
          </div>
        </div>
      </div>

      {/* Grid Map Preview & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: 5x5 Mini Tactical Map Grid (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                <h3 className="font-semibold text-sm text-slate-100">전술 그리드 맵 (Interactive Map)</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">타일 클릭 시 상세 조회</span>
            </div>

            {/* 5x5 Grid Board */}
            <div className="grid grid-cols-5 gap-1.5 p-3 rounded-2xl bg-slate-950 border border-slate-800/80 aspect-square max-w-[340px] mx-auto w-full">
              {miniGrid.map((row, rIdx) =>
                row.map((tileType, cIdx) => {
                  const isSelected = selectedTileKey === tileType;
                  return (
                    <button
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => setSelectedTileKey(tileType as any)}
                      className={`rounded-xl border flex flex-col items-center justify-center text-[10px] font-bold transition-all relative ${
                        tileColors[tileType]
                      } ${isSelected ? 'ring-2 ring-white scale-95 shadow-lg' : ''}`}
                    >
                      <span>{tileLabels[tileType]}</span>
                      {tileType === 'CITY' && <span className="text-[8px] text-amber-300/80 font-mono">2x2</span>}
                      {tileType === 'TOWN' && <span className="text-[8px] text-sky-300/80 font-mono">1x1</span>}
                      {tileType === 'BLOCKADE_FRONT' && <span className="text-[8px] text-rose-300/80 font-mono">전선</span>}
                    </button>
                  );
                })
              )}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-2 justify-center text-[11px]">
              {tileKeys.map((k) => (
                <button
                  key={k}
                  onClick={() => setSelectedTileKey(k)}
                  className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all ${
                    selectedTileKey === k
                      ? 'bg-slate-700 text-white border-slate-400'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    k === 'PLAIN' ? 'bg-emerald-400' :
                    k === 'DEFENSIVE_TERRAIN' ? 'bg-green-600' :
                    k === 'TOWN' ? 'bg-sky-400' :
                    k === 'CITY' ? 'bg-amber-400' : 'bg-rose-500'
                  }`}></span>
                  <span>{TileTypes[k].name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Maintenance Calculator for current station */}
          <div className="mt-5 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>주둔 유지비 판정기 (Maintenance)</span>
              </span>
              <span className={`font-bold font-mono px-2 py-0.5 rounded text-[10px] ${
                maintenanceResult.isExempt ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                {maintenanceResult.isExempt ? '유지비 0G 완전면제' : '유지비 발생'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{maintenanceResult.reason}</p>
            <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center text-slate-300">
              <span>주둔 유닛 3기 기준 턴당 비용:</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {totalTurnCost} Gold / 턴
              </span>
            </div>
          </div>
        </div>

        {/* Right: Selected Tile Details & Unique Stronghold Mechanics (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Main Selected Tile Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  selectedTileKey === 'PLAIN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                  selectedTileKey === 'DEFENSIVE_TERRAIN' ? 'bg-green-500/20 text-green-400 border border-green-500/40' :
                  selectedTileKey === 'TOWN' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' :
                  selectedTileKey === 'CITY' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                  'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                }`}>
                  {selectedTileKey === 'PLAIN' && <MapPin className="w-5 h-5" />}
                  {selectedTileKey === 'DEFENSIVE_TERRAIN' && <Mountain className="w-5 h-5" />}
                  {selectedTileKey === 'TOWN' && <Home className="w-5 h-5" />}
                  {selectedTileKey === 'CITY' && <Building2 className="w-5 h-5" />}
                  {selectedTileKey === 'BLOCKADE_FRONT' && <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{selectedTile.name}</h3>
                  <span className="text-xs text-slate-400 font-mono">크기: {selectedTile.size}</span>
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="font-mono text-slate-300">
                  이동 비용: <strong className="text-emerald-400">{selectedTile.apCost} AP</strong>
                </div>
                <div className="font-mono text-slate-300 mt-0.5">
                  방어 보너스: <strong className="text-cyan-400">
                    {selectedTile.defenseBonus !== undefined
                      ? `+${Math.round(selectedTile.defenseBonus * 100)}%`
                      : `+${Math.round((selectedTile as any).defenseBonusMin * 100)}% ~ +${Math.round((selectedTile as any).defenseBonusMax * 100)}%`}
                  </strong>
                </div>
              </div>
            </div>

            {/* Tile Description */}
            <p className="text-xs text-slate-300 mt-3 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
              {selectedTile.description}
            </p>

            {/* Offline Safe State Check for Urban settlements */}
            {(selectedTileKey === 'TOWN' || selectedTileKey === 'CITY') && (
              <div className="mt-4 p-3 rounded-xl bg-sky-950/40 border border-sky-800/50 text-xs">
                <div className="flex items-center gap-2 font-bold text-sky-300 mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>로그아웃 안전 비활성화 (Offline Protection)</span>
                </div>
                <p className="text-[11px] text-sky-200/90 leading-relaxed">
                  {(selectedTile as any).offlineProtection?.description}
                </p>
              </div>
            )}
          </div>

          {/* Special Feature Sub-Cards depending on selected tile */}
          {selectedTileKey === 'TOWN' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-sky-400" />
                  <h4 className="font-bold text-sm text-white">마을 잡화상점 (Favorability Items)</h4>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">1x1 정착지 전용 기능</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {(selectedTile as any).favorabilityShop?.items.map((item: any) => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-slate-100">{item.name}</div>
                      <div className="text-[11px] text-pink-400 font-semibold mt-1">
                        호감도 +{item.favorabilityGain} 상승
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] font-mono text-amber-400 font-bold">
                      {item.priceGold} Gold
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedTileKey === 'CITY' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <Recycle className="w-4 h-4 text-amber-400" />
                  <h4 className="font-bold text-sm text-white">도시 군무국 (Unit Dismantle &amp; Core Exchange)</h4>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">2x2 거대 요새 전용</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                불필요한 저레벨 유닛을 해체하여 주력 유닛 육성용 전략 코어(Tactics Core) 및 자금으로 70% 환급합니다.
              </p>
              
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-slate-400">해체 대상 유닛 레벨:</span>
                  <div className="flex items-center gap-2 mt-1">
                    {[1, 2, 4, 8, 10].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setDismantleUnitLevel(lvl)}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          dismantleUnitLevel === lvl ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        Lv.{lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-slate-400 text-[11px]">환급 경험치 코어:</div>
                  <div className="text-sm font-mono font-bold text-amber-400">
                    전술 코어 {cityExpCore?.count}개 <span className="text-xs text-slate-400">(+{cityExpCore?.count * cityExpCore?.expYieldPerCore} EXP)</span>
                  </div>
                  <div className="text-[10px] text-slate-500">골드 환급률: 70%</div>
                </div>
              </div>
            </div>
          )}

          {selectedTileKey === 'BLOCKADE_FRONT' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-rose-400" />
                  <h4 className="font-bold text-sm text-white">포위망 방위부대 기제 (Garrison Defense System)</h4>
                </div>
                <span className="text-[10px] text-rose-400 font-mono bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/50">
                  임계시간: 1800초 (30분)
                </span>
              </div>

              {/* Siege countdown progress */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                <div className="flex justify-between mb-1.5">
                  <span className="text-slate-300">도시 포위 지속 시간:</span>
                  <span className="font-mono font-bold text-rose-400">{siegeElapsedSec} / 1800초</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (siegeElapsedSec / 1800) * 100)}%` }}
                  ></div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setSiegeElapsedSec((s) => Math.min(1800, s + 300))}
                    className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    +300초 경과
                  </button>
                  <button
                    onClick={() => setSiegeElapsedSec(1800)}
                    className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold"
                  >
                    1800초 임계 도달 (방위부대 출격!)
                  </button>
                  <button
                    onClick={() => setSiegeElapsedSec(0)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 text-xs"
                  >
                    포위 해제
                  </button>
                </div>
              </div>

              {/* Crucial Rule Notification: No permanent deletion penalty! */}
              <div className="mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-xs flex items-start gap-2 text-amber-200">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">중요 기획 룰: 방위부대 패배 시 유닛 영구 삭제 없음!</span>
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
                    {(selectedTile as any).garrisonDefenseSystem?.penaltyExemptionRule}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
