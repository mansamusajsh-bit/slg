import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { RulesTab } from './components/RulesTab';
import { UnitsTab } from './components/UnitsTab';
import { CommanderTab } from './components/CommanderTab';
import { TilesTab } from './components/TilesTab';
import { BattleSimulatorTab } from './components/BattleSimulatorTab';
import { GridMapTab } from './components/GridMapTab';
import { Phase4Tab } from './components/Phase4Tab';
import { CodeViewTab } from './components/CodeViewTab';
import { Smartphone, Sparkles, Shield, Battery, Wifi } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('phase4');
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Global Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isPhoneFrame={isPhoneFrame}
        setIsPhoneFrame={setIsPhoneFrame}
      />

      {/* Main Content Area */}
      <main className="flex-1 py-6 px-4 sm:px-6">
        {isPhoneFrame ? (
          /* Phone Mockup Frame (Vertical Mobile SLG Simulation) */
          <div className="max-w-[420px] mx-auto">
            {/* Phone Bezel */}
            <div className="rounded-[40px] border-[8px] border-slate-800 bg-slate-950 shadow-2xl overflow-hidden ring-1 ring-slate-700/50 relative">
              {/* Dynamic Island / Camera Notch */}
              <div className="bg-slate-900 px-6 py-2 flex items-center justify-between text-[11px] text-slate-400 font-mono border-b border-slate-800">
                <span>09:41</span>
                <div className="w-20 h-4 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wifi className="w-3 h-3" />
                  <Battery className="w-3 h-3" />
                </div>
              </div>

              {/* In-Phone Screen Container */}
              <div className="p-4 max-h-[800px] overflow-y-auto no-scrollbar">
                {activeTab === 'phase4' && <Phase4Tab />}
                {activeTab === 'gridMap' && <GridMapTab />}
                {activeTab === 'rules' && <RulesTab />}
                {activeTab === 'units' && <UnitsTab />}
                {activeTab === 'commander' && <CommanderTab />}
                {activeTab === 'tiles' && <TilesTab />}
                {activeTab === 'simulator' && <BattleSimulatorTab />}
                {activeTab === 'code' && <CodeViewTab />}
              </div>

              {/* Bottom Home Bar */}
              <div className="bg-slate-900 py-2 flex justify-center border-t border-slate-800">
                <div className="w-28 h-1 bg-slate-700 rounded-full"></div>
              </div>
            </div>

            <div className="text-center mt-3 text-xs text-slate-500">
              세로형 모바일 SLG 뷰포트 시뮬레이션 (상단 '와이드 데크 ON'으로 전체화면 전환 가능)
            </div>
          </div>
        ) : (
          /* Fullscreen Deck Responsive Container */
          <div className="max-w-7xl mx-auto">
            {activeTab === 'phase4' && <Phase4Tab />}
            {activeTab === 'gridMap' && <GridMapTab />}
            {activeTab === 'rules' && <RulesTab />}
            {activeTab === 'units' && <UnitsTab />}
            {activeTab === 'commander' && <CommanderTab />}
            {activeTab === 'tiles' && <TilesTab />}
            {activeTab === 'simulator' && <BattleSimulatorTab />}
            {activeTab === 'code' && <CodeViewTab />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Turn-Based Mobile Web-SLG Data Engine • Step 1: Data Definitions</span>
          </div>
          <div className="text-slate-400 font-mono text-[11px]">
            Single-file Pure JavaScript Architecture (Zero external runtime dependencies)
          </div>
        </div>
      </footer>
    </div>
  );
}
