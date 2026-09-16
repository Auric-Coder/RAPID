import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, MapPinned, Play, Pause, Square, RefreshCw, Radar } from 'lucide-react';

const PATTERNS = ['circular', 'linear', 'grid', 'random'];

const RESTRICTION_STYLE = {
  absolute: 'text-red-400 border-red-500/30 bg-red-500/10',
  conditional: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  advisory: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
};

const MISSION_STATUS_STYLE = {
  active: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  paused: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  planned: 'text-gray-400 border-gray-600/30 bg-gray-500/10',
  aborted: 'text-red-400 border-red-500/30 bg-red-500/10',
  complete: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
};

function Surveillance() {
  const [states, setStates] = useState([]);
  const [activeState, setActiveState] = useState('GA');
  const [zones, setZones] = useState([]);
  const [missions, setMissions] = useState([]);
  const [drones, setDrones] = useState([]);
  const [bases, setBases] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedDroneId, setSelectedDroneId] = useState('');
  const [pattern, setPattern] = useState('circular');
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [zonesRes, missionsRes, dronesRes, basesRes] = await Promise.all([
        fetch(`/api/airspace/zones?state=${activeState}`),
        fetch(`/api/surveillance/missions?state=${activeState}`),
        fetch('/api/drones'),
        fetch(`/api/geo/bases?state=${activeState}&limit=200`)
      ]);
      if (zonesRes.ok) setZones(await zonesRes.json());
      if (missionsRes.ok) setMissions(await missionsRes.json());
      if (dronesRes.ok) setDrones(await dronesRes.json());
      if (basesRes.ok) setBases((await basesRes.json()).bases || []);
    } catch (err) {
      console.error('Surveillance refresh error:', err);
    }
  }, [activeState]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    fetch('/api/geo/states').then(r => r.ok ? r.json() : []).then(setStates).catch(() => {});
  }, []);

  // Scoped to the active state's own bases — a drone based in another
  // state can't meaningfully patrol this one (matches the same-state
  // rule the server now enforces on both mission start and handoff).
  const baseIdsForState = new Set(bases.map(b => b.id));
  const availableDrones = drones.filter(d => ['Standby', 'Charging'].includes(d.status) && baseIdsForState.has(d.base_id));

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleStartMission = async (e) => {
    e.preventDefault();
    if (!selectedZoneId || !selectedDroneId) {
      showFeedback('error', 'Select both a zone and a drone.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/surveillance/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'patrol', zoneId: selectedZoneId, state: activeState, patrolPattern: pattern, droneId: selectedDroneId })
      });
      const data = await res.json();
      if (!res.ok) { showFeedback('error', data.error || 'Failed to start mission.'); return; }
      showFeedback('ok', 'Patrol mission started.');
      setSelectedZoneId(''); setSelectedDroneId('');
      refresh();
    } catch (err) {
      showFeedback('error', 'Network error — mission not started.');
    } finally {
      setSubmitting(false);
    }
  };

  const missionAction = async (missionId, action) => {
    try {
      const res = await fetch(`/api/surveillance/missions/${missionId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) { showFeedback('error', data.error || `Failed to ${action}.`); return; }
      showFeedback('ok', `Mission ${action} succeeded.`);
      refresh();
    } catch (err) {
      showFeedback('error', 'Network error.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[#1F2E45] pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
            <Radar className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-wide text-white">Border & Protected-Zone Surveillance</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Airspace zones, patrol missions, and autonomous anomaly alerts.</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {states.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveState(s.code)}
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ${
                activeState === s.code ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400' : 'bg-slate-900/40 border-slate-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-xs font-mono font-bold ${feedback.type === 'ok' ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400' : 'bg-red-900/30 border border-red-500/30 text-red-400'}`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Airspace Zones */}
        <div className="cyber-glass rounded-2xl p-5 border border-[#1F2E45]">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">Airspace Zones</h3>
          </div>
          <div className="space-y-2">
            {zones.map(z => (
              <div key={z.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">{z.name}</div>
                  <div className="text-[9px] text-gray-500 font-mono uppercase">{z.type.replace(/_/g, ' ')}</div>
                </div>
                <span className={`text-[9px] font-mono font-bold uppercase px-2 py-1 rounded-full border ${RESTRICTION_STYLE[z.restriction_level] || RESTRICTION_STYLE.advisory}`}>
                  {z.restriction_level}
                </span>
              </div>
            ))}
            {zones.length === 0 && <p className="text-xs text-gray-600 font-mono text-center py-4">No airspace zones for this state.</p>}
          </div>

          {/* Start New Patrol */}
          <form onSubmit={handleStartMission} className="mt-5 pt-5 border-t border-[#1F2E45] space-y-3">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold block">Start New Patrol</span>
            <select value={selectedZoneId} onChange={e => setSelectedZoneId(e.target.value)} className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">Select zone…</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
            <select value={selectedDroneId} onChange={e => setSelectedDroneId(e.target.value)} className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">Select available drone…</option>
              {availableDrones.map(d => <option key={d.id} value={d.id}>{d.call_sign} ({d.battery_level.toFixed(0)}%)</option>)}
            </select>
            <select value={pattern} onChange={e => setPattern(e.target.value)} className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white">
              {PATTERNS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} pattern</option>)}
            </select>
            <button type="submit" disabled={submitting} className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-xs font-bold text-white uppercase tracking-wider disabled:opacity-50">
              {submitting ? 'Starting…' : 'Start Patrol'}
            </button>
          </form>
        </div>

        {/* Missions */}
        <div className="cyber-glass rounded-2xl p-5 border border-[#1F2E45]">
          <div className="flex items-center gap-2 mb-4">
            <MapPinned className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">Patrol Missions</h3>
          </div>
          <div className="space-y-3">
            {missions.map(m => {
              const drone = drones.find(d => d.id === m.current_drone_id);
              return (
                <div key={m.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{drone ? drone.call_sign : 'Unassigned'} · {m.patrol_pattern}</span>
                    <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${MISSION_STATUS_STYLE[m.status] || MISSION_STATUS_STYLE.planned}`}>{m.status}</span>
                  </div>
                  <div className="text-[9px] text-gray-500 font-mono mb-2">Waypoint {m.current_waypoint_index + 1}/{m.waypoints.length} · {m.mission_logs.length} log entries</div>
                  <div className="flex gap-1.5">
                    {m.status === 'active' && (
                      <>
                        <button onClick={() => missionAction(m.id, 'pause')} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[9px] font-bold text-gray-300 uppercase flex items-center justify-center gap-1"><Pause className="h-3 w-3" /> Pause</button>
                        <button onClick={() => missionAction(m.id, 'handoff')} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[9px] font-bold text-gray-300 uppercase flex items-center justify-center gap-1"><RefreshCw className="h-3 w-3" /> Handoff</button>
                      </>
                    )}
                    {m.status === 'paused' && (
                      <button onClick={() => missionAction(m.id, 'resume')} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[9px] font-bold text-gray-300 uppercase flex items-center justify-center gap-1"><Play className="h-3 w-3" /> Resume</button>
                    )}
                    {['active', 'paused'].includes(m.status) && (
                      <button onClick={() => missionAction(m.id, 'abort')} className="flex-1 py-1.5 bg-red-900/40 hover:bg-red-900/60 rounded-lg text-[9px] font-bold text-red-400 uppercase flex items-center justify-center gap-1"><Square className="h-3 w-3" /> Abort</button>
                    )}
                  </div>
                </div>
              );
            })}
            {missions.length === 0 && <p className="text-xs text-gray-600 font-mono text-center py-4">No patrol missions for this state yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Surveillance;
