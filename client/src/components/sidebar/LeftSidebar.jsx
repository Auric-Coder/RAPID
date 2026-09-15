import React from 'react';
import { AlertOctagon, Radio, Battery, MapPinned } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import useRapidStore from '../../store/rapidStore';
import { severityColor, batteryColor, batteryTier } from '../shared/utils';

export default function LeftSidebar() {
  const activeState = useRapidStore(s => s.activeState);
  const states = useRapidStore(s => s.states);
  const setActiveState = useRapidStore(s => s.setActiveState);

  const drones = useRapidStore(useShallow(s => s.getVisibleDrones()));
  const incidents = useRapidStore(useShallow(s => s.getVisibleIncidents()));
  const selectedDroneId = useRapidStore(s => s.selectedDroneId);
  const selectedIncidentId = useRapidStore(s => s.selectedIncidentId);
  const selectDrone = useRapidStore(s => s.selectDrone);
  const selectIncident = useRapidStore(s => s.selectIncident);
  const setShowManualForm = useRapidStore(s => s.setShowManualForm);
  const demoGenerating = useRapidStore(s => s.demoGenerating);
  const demoError = useRapidStore(s => s.demoError);
  const generateSimulatedEmergency = useRapidStore(s => s.generateSimulatedEmergency);

  const activeIncidentsList = incidents.filter(i => ['reported', 'dispatched', 'active', 'resolved'].includes(i.status));

  return (
    <aside className="col-span-3 border-r border-[#1F2E45] bg-[#0A101C]/80 flex flex-col min-h-0 z-20">
      {/* State switcher */}
      {states.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1F2E45] bg-[#0D1626]">
          <MapPinned className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
          <div className="flex flex-1 gap-1.5">
            {states.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveState(s.code)}
                className={`flex-1 text-[9px] font-mono font-bold uppercase tracking-wider py-1.5 rounded-lg border transition-all ${
                  activeState === s.code
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                    : 'bg-slate-900/40 border-slate-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1F2E45]">
        <div className="flex items-center gap-1.5">
          <AlertOctagon className="h-4 w-4 text-red-500 animate-pulse" />
          <h2 className="font-extrabold text-[11px] uppercase tracking-wider text-white">Active Alarm Ingestion</h2>
        </div>
        <button onClick={() => setShowManualForm(true)} className="text-[9px] bg-gray-800 hover:bg-gray-700 text-gray-300 font-mono px-2 py-0.5 border border-gray-700 rounded">+ Ingest</button>
      </div>

      {/* Incidents list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeIncidentsList.map((inc) => {
          const isSelected = selectedIncidentId === inc.id;
          return (
            <div
              key={inc.id}
              onClick={() => selectIncident(inc)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-cyan-950/20 border-cyan-500/50' : 'bg-slate-900/30 border-slate-800/80 hover:border-gray-700'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 border rounded-full ${severityColor(inc.severity)}`}>{inc.severity}</span>
                <span className="text-[9px] text-gray-500 font-mono">{new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <h3 className="text-xs font-bold text-white truncate">{inc.title}</h3>
              <div className="flex justify-between items-center mt-2 text-[9px] font-mono pt-2 border-t border-gray-800/40">
                <span className="text-gray-500">ASSIGNED:</span>
                {inc.assigned_drone_id
                  ? <span className="text-cyan-400 font-extrabold">{drones.find(d => d.id === inc.assigned_drone_id)?.call_sign || 'UAV'}</span>
                  : <span className="text-gray-600 italic">None</span>}
              </div>
            </div>
          );
        })}
        {activeIncidentsList.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
            <Radio className="h-10 w-10 text-cyan-500 animate-pulse mb-2" />
            <p className="text-xs font-mono">STANDBY ACTIVE</p>
          </div>
        )}
      </div>

      {/* Simulation trigger */}
      <div className="p-3 border-t border-[#1F2E45]">
        <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
          <span className="text-[9px] font-mono text-cyan-400 block uppercase tracking-wider mb-2 font-bold">🛠️ Simulation Trigger</span>
          <button
            onClick={generateSimulatedEmergency}
            disabled={demoGenerating}
            className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-90 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md disabled:opacity-60"
          >
            {demoGenerating ? '⏳ Generating...' : '🔥 Simulate Random Emergency'}
          </button>
          {demoError && <div className="mt-2 p-2 bg-red-900/30 border border-red-500/30 rounded-lg text-[9px] font-mono text-red-400">⚠️ {demoError}</div>}
        </div>
      </div>

      {/* Quick Fleet Grid */}
      <div className="p-3 border-t border-[#1F2E45]">
        <span className="text-[9px] font-mono text-gray-400 block uppercase tracking-wider mb-2 font-bold">Rakshak Fleet ({drones.length})</span>
        <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
          {drones.map((d) => {
            const tier = batteryTier(d.battery_level);
            return (
              <button
                key={d.id}
                onClick={() => selectDrone(d)}
                className={`p-2 rounded-xl border text-left flex flex-col gap-1 transition-all ${selectedDroneId === d.id ? 'bg-cyan-950/20 border-cyan-500/50' : 'bg-slate-900/30 border-slate-800 hover:border-gray-700'}`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-bold text-white truncate">{d.call_sign}</span>
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${d.status === 'Standby' ? 'bg-gray-500' : d.status === 'maintenance' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-mono">
                  <Battery className={`h-3 w-3 ${batteryColor(tier)}`} />
                  <span className={batteryColor(tier)}>{d.battery_level.toFixed(0)}%</span>
                </div>
                <span className="text-[8px] font-mono text-gray-500 uppercase truncate">{d.status}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
