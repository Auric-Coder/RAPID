import React from 'react';
import { Shield } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import useRapidStore from '../../store/rapidStore';

export default function TopCommandBar() {
  const stats = useRapidStore(useShallow(s => s.getVisibleStats()));
  const currentTime = useRapidStore(s => s.currentTime);
  const wsConnected = useRapidStore(s => s.wsConnected);
  const activeState = useRapidStore(s => s.activeState);
  const states = useRapidStore(s => s.states);
  const activeStateName = states.find(s => s.code === activeState)?.name || 'GOA';

  return (
    <header className="h-16 bg-[#0D1626] border-b border-[#1F2E45] px-6 flex items-center justify-between select-none relative z-50 flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30 glow-cyan">
          <Shield className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold tracking-wider text-white text-md">RAPID</h1>
            <span className="text-[9px] font-mono border border-cyan-500/30 px-1.5 py-0.5 rounded text-cyan-400 bg-cyan-950/20 uppercase tracking-widest">GCS v2.0</span>
          </div>
          <p className="text-[10px] text-gray-400 font-mono tracking-wider uppercase font-semibold">Real-time Autonomous Police &amp; Incident Drone Network</p>
        </div>
      </div>

      <div className="hidden lg:flex flex-col items-center">
        <span className="text-xs font-mono font-bold uppercase tracking-[0.25em] text-white">Emergency Command &amp; Control System</span>
        <span className="text-[9px] font-mono text-cyan-400 tracking-wider font-bold">{activeStateName.toUpperCase()} POLICE HQ — RAPID FLEET DECISION ENGINE</span>
      </div>

      <div className="flex items-center gap-5 font-mono text-xs text-gray-400">
        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase text-gray-500 font-bold">Active Missions</span>
          <span className="text-white font-extrabold flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${stats.activeMissions > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`}></span>
            {stats.activeMissions} UAVs
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase text-gray-500 font-bold">Available</span>
          <span className="text-cyan-400 font-extrabold">{stats.availableFleet} Standby</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase text-gray-500 font-bold">Link</span>
          <span className={`font-semibold text-[10px] ${wsConnected ? 'text-emerald-400' : 'text-yellow-400'}`}>{wsConnected ? 'WS LIVE' : 'HTTP POLL'}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase text-gray-500 font-bold">Health</span>
          <span className={`font-extrabold uppercase ${stats.healthStatus === 'NOMINAL' ? 'text-emerald-400' : 'text-red-500 animate-pulse'}`}>{stats.healthStatus}</span>
        </div>
        <div className="border-l border-[#1F2E45] pl-4 flex flex-col items-end">
          <span className="text-[8px] uppercase text-gray-500 font-bold">Current Time</span>
          <span className="text-white font-black tracking-widest text-[12px]">
            {(currentTime instanceof Date ? currentTime : new Date(currentTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        </div>
      </div>
    </header>
  );
}
