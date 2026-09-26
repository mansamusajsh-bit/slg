import React from 'react';
import { Shield, Sparkles, Smartphone, Monitor, Copy, Check, Swords, Download } from 'lucide-react';
import { combatEngineSourceCode } from '../combatEngineCode';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isPhoneFrame: boolean;
  setIsPhoneFrame: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isPhoneFrame,
  setIsPhoneFrame,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(combatEngineSourceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const tabs = [
    { id: 'phase4', label: '4단계: 경제·로그아웃방어·스킬트리', icon: '🏛️' },
    { id: 'gridMap', label: '8x14 그리드 맵 & ZOC', icon: '🗺️' },
    { id: 'simulator', label: 'Civ4 전투 엔진 & 시나리오', icon: '⚔️' },
    { id: 'units', label: '유닛 & 병과 에셋', icon: '🛡️' },
    { id: 'tiles', label: '타일 & 전술 지형', icon: '⛰️' },
    { id: 'commander', label: '지휘관 패시브 트리', icon: '👑' },
    { id: 'rules', label: '시스템 코어 룰', icon: '⏱️' },
    { id: 'code', label: '순수 JS 코드 및 다운로드', icon: '📜' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Logo & App Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white font-black text-xl">
            <Swords className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white">
                Web-SLG Combat Engine
              </h1>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Civ4 &amp; Permadeath
              </span>
            </div>
            <p className="text-xs text-slate-400">
              세로형 턴제 모바일 전략 게임 핵심 전투 엔진 • 문명4 확률식 • 호감도 출격 • 리와인더
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPhoneFrame(!isPhoneFrame)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isPhoneFrame
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
            title="세로형 모바일 프레임뷰 / 전체화면 뷰 토글"
          >
            {isPhoneFrame ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            {isPhoneFrame ? '모바일 프레임 ON' : '와이드 데크 ON'}
          </button>

          <button
            onClick={handleCopyCode}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all ${
              copied
                ? 'bg-emerald-600 text-white shadow-emerald-500/30'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-orange-500/25'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'GameData JS 복사완료!' : '순수 JS 코드 복사'}
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="max-w-7xl mx-auto px-4 overflow-x-auto no-scrollbar flex items-center gap-1 border-t border-slate-800/80 pt-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                isActive
                  ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-md font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-t-md'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
