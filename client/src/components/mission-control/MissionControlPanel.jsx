import React from 'react';
import {
  Activity, Camera, Clock, BarChart2, Sliders, X, Sun, Moon,
  Maximize2, Mic, Volume2, Battery
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import useRapidStore from '../../store/rapidStore';
import { haversineDistance } from '../../config/geoConfig';
import {
  ACTIVE_STATUSES, FLYING_STATUSES,
  formatDuration, formatEtaShort, batteryColor, batteryBg, batteryTier
} from '../shared/utils';

export default function MissionControlPanel() {
  const selectedDrone = useRapidStore(s => s.getSelectedDrone());
  const selectedIncident = useRapidStore(s => s.getSelectedIncident());
  const incidents = useRapidStore(s => s.incidents);
  const drones = useRapidStore(useShallow(s => s.getVisibleDrones()));
  const mcTab = useRapidStore(s => s.mcTab);
  const setMcTab = useRapidStore(s => s.setMcTab);
  const cmdFeedback = useRapidStore(s => s.cmdFeedback);
  const selectDrone = useRapidStore(s => s.selectDrone);

  // Telemetry tab data
  const batteryStatus = useRapidStore(s => s.batteryStatus);
  const flightTimeSec = useRapidStore(s => s.flightTimeSec);
  const recording = useRapidStore(s => s.recording);
  const recordingTick = useRapidStore(s => s.recordingTick);

  // Camera
  const cameraMode = useRapidStore(s => s.cameraMode);
  const handleCameraMode = useRapidStore(s => s.handleCameraMode);
  const toggleFullscreen = useRapidStore(s => s.toggleFullscreen);
  const isNightVisionActive = useRapidStore(s => s.isNightVisionActive);
  const handleSnapshot = useRapidStore(s => s.handleSnapshot);

  // PTT
  const pttActive = useRapidStore(s => s.pttActive);
  const pttLog = useRapidStore(s => s.pttLog);
  const micActive = useRapidStore(s => s.micActive);
  const speakerActive = useRapidStore(s => s.speakerActive);
  const speakerVol = useRapidStore(s => s.speakerVol);
  const handlePttDown = useRapidStore(s => s.handlePttDown);
  const handlePttUp = useRapidStore(s => s.handlePttUp);
  const setMicActive = useRapidStore(s => s.setMicActive);
  const setSpeakerActive = useRapidStore(s => s.setSpeakerActive);
  const setSpeakerVol = useRapidStore(s => s.setSpeakerVol);

  // Flight ops
  const handleUavCommand = useRapidStore(s => s.handleUavCommand);

  // Fleet eval
  const fleetEval = useRapidStore(s => s.fleetEval);
  const handleManualDispatch = useRapidStore(s => s.handleManualDispatch);

  // Evidence
  const snapshots = useRapidStore(s => s.snapshots);
  const evidenceChain = useRapidStore(s => s.evidenceChain);
  const droneHistory = useRapidStore(s => s.droneHistory);

  // Log
  const incidentLogs = useRapidStore(s => s.incidentLogs);
  const controllerActions = useRapidStore(s => s.controllerActions);

  return (
    <aside className="col-span-3 bg-[#0A101C]/80 flex flex-col min-h-0 z-20">

      {/* Selected Rakshak Header */}
      <div className="px-4 py-3 border-b border-[#1F2E45] flex-shrink-0">
        {selectedDrone ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] font-mono text-cyan-400 uppercase tracking-widest font-bold">SELECTED RAKSHAK</div>
              <div className="text-sm font-black text-white">{selectedDrone.call_sign}</div>
              <div className="text-[9px] text-gray-500 font-mono">{selectedDrone.model}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {recording?.status === 'recording' && (
                <div className="flex items-center gap-1 bg-red-600/20 border border-red-500/40 px-2 py-0.5 rounded font-mono text-[9px] text-red-400 font-bold">
                  <span className="h-1.5 w-1.5 bg-red-400 rounded-full animate-pulse"></span>
                  REC {formatDuration(recordingTick)}
                </div>
              )}
              {recording?.status === 'finalized' && (
                <div className="text-[8px] font-mono text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">REC FINALIZED</div>
              )}
              <button onClick={() => selectDrone(null)} className="text-gray-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h2 className="font-extrabold text-[11px] uppercase tracking-wider text-white">Mission Control</h2>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      {selectedDrone && (
        <div className="flex border-b border-[#1F2E45] flex-shrink-0">
          {[
            { id: 'telemetry', label: 'Telemetry', icon: Activity },
            { id: 'fleet', label: 'Fleet', icon: BarChart2 },
            { id: 'evidence', label: 'Evidence', icon: Camera },
            { id: 'log', label: 'Log', icon: Clock }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMcTab(id)}
              className={`flex-1 py-2 text-[9px] font-mono font-bold uppercase tracking-wider flex flex-col items-center gap-0.5 transition-all ${mcTab === id ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Command Feedback */}
      {cmdFeedback && (
        <div className={`mx-3 mt-2 p-2 rounded-lg text-[10px] font-mono font-bold flex-shrink-0 ${cmdFeedback.type === 'ok' ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400' : cmdFeedback.type === 'warn' ? 'bg-yellow-900/30 border border-yellow-500/30 text-yellow-400' : 'bg-red-900/30 border border-red-500/30 text-red-400'}`}>
          {cmdFeedback.msg}
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedDrone && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
            <Sliders className="h-10 w-10 text-cyan-500 animate-pulse mb-3" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-white">No Selected UAV</h3>
            <p className="text-[10px] text-gray-400 mt-1 font-mono max-w-[180px]">Select an active Rakshak from the map or fleet grid below.</p>
          </div>
        )}

        {/* ─── TELEMETRY TAB ─────────────────────── */}
        {selectedDrone && mcTab === 'telemetry' && (
          <div className="p-3 space-y-3">
            {/* Core Telemetry */}
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <span className="text-[9px] font-mono text-cyan-400 block uppercase tracking-wider mb-2 font-bold">📡 Live Telemetry</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono text-gray-400">
                <div>STATUS: <span className="text-cyan-400 font-extrabold">{selectedDrone.status}</span></div>
                <div>INC ID: <span className="text-white">{selectedDrone.current_incident_id?.slice(0, 8).toUpperCase() || 'N/A'}</span></div>
                <div>GPS LAT: <span className="text-white">{selectedDrone.latitude.toFixed(4)}°N</span></div>
                <div>GPS LNG: <span className="text-white">{selectedDrone.longitude.toFixed(4)}°E</span></div>
                <div>ALT: <span className="text-white">{selectedDrone.altitude.toFixed(0)}m</span></div>
                <div>SPEED: <span className="text-white">{selectedDrone.speed.toFixed(0)} m/s</span></div>
                <div>HDG: <span className="text-white">{selectedDrone.heading.toFixed(0)}°</span></div>
                <div>DURATION: <span className="text-white font-bold">{formatDuration(flightTimeSec)}</span></div>
                <div className="col-span-2">ETA: <span className="text-white font-bold">{(() => {
                  if (['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller'].includes(selectedDrone.status)) return 'ON SCENE';
                  if (['Dispatched', 'En Route'].includes(selectedDrone.status) && selectedDrone.current_incident_id) {
                    const inc = incidents.find(i => i.id === selectedDrone.current_incident_id);
                    if (inc && selectedDrone.speed > 0) return formatEtaShort(Math.round(haversineDistance(selectedDrone.latitude, selectedDrone.longitude, inc.latitude, inc.longitude) / selectedDrone.speed));
                    return 'Calculating...';
                  }
                  if (selectedDrone.status === 'Returning' && selectedDrone.speed > 0) {
                    return formatEtaShort(Math.round(haversineDistance(selectedDrone.latitude, selectedDrone.longitude, selectedDrone.base_latitude, selectedDrone.base_longitude) / selectedDrone.speed));
                  }
                  return 'STANDBY';
                })()}</span></div>
              </div>
            </div>

            {/* Battery & Energy Panel */}
            {batteryStatus && (
              <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold">⚡ Energy Status</span>
                  <span className="text-[8px] font-mono text-gray-600 uppercase">SIMULATED MODEL</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span className="text-gray-400">BATTERY</span>
                      <span className={`font-bold ${batteryColor(batteryStatus.batteryTier)}`}>{batteryStatus.battery}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${batteryBg(batteryStatus.batteryTier)}`} style={{ width: `${batteryStatus.battery}%` }}></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-mono">
                    <div className="text-gray-400">RETURN NEEDED: <span className="text-white font-bold">{batteryStatus.returnRequired}%</span></div>
                    <div className="text-gray-400">AFTER RETURN: <span className={`font-bold ${batteryStatus.projectedAfterReturn >= 20 ? 'text-emerald-400' : 'text-red-400'}`}>{batteryStatus.projectedAfterReturn}%</span></div>
                    <div className="text-gray-400">DIST TO BASE: <span className="text-white">{batteryStatus.distToBaseKm} km</span></div>
                    <div className="text-gray-400">RESERVE: <span className="text-white">{batteryStatus.safetyReserve}%</span></div>
                  </div>
                  <div className={`text-center font-mono font-bold text-[10px] py-1.5 rounded-lg ${batteryStatus.returnStatus === 'SAFE' ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400' : batteryStatus.returnStatus === 'RETURN_RECOMMENDED' ? 'bg-yellow-900/30 border border-yellow-500/30 text-yellow-400 animate-pulse' : 'bg-red-900/30 border border-red-500/30 text-red-400 animate-pulse'}`}>
                    {batteryStatus.returnStatus === 'SAFE' ? '✓ MISSION SAFE' : batteryStatus.returnStatus === 'RETURN_RECOMMENDED' ? '⚠ RETURN RECOMMENDED' : '🚨 CRITICAL — AUTO RETURNING'}
                  </div>
                </div>
              </div>
            )}

            {/* Live Feed */}
            <div className="bg-black border border-[#1F2E45] rounded-2xl overflow-hidden relative">
              <div className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-black/80 border border-gray-700 px-2 py-0.5 rounded font-mono text-[8px] text-gray-400">
                <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-pulse"></span>
                LIVE · DEMO FEED · {selectedDrone.call_sign}
              </div>

              <div className="absolute top-2 right-2 z-30 flex gap-1">
                <div className="flex bg-black/60 border border-gray-700/60 rounded px-1 py-0.5 gap-1.5 text-[9px] font-mono">
                  {[['auto', 'AUTO'], ['day', 'DAY'], ['night', 'NV']].map(([mode, label]) => (
                    <button key={mode} onClick={() => handleCameraMode(mode)} title={mode}
                      className={`px-1 rounded transition-all ${cameraMode === mode ? 'text-cyan-400 font-bold bg-cyan-950/40' : 'text-gray-500 hover:text-white'}`}>
                      {mode === 'day' ? <Sun className="h-3 w-3 inline" /> : mode === 'night' ? <Moon className="h-3 w-3 inline" /> : label}
                    </button>
                  ))}
                </div>
                <button onClick={toggleFullscreen} className="p-1 bg-black/60 border border-gray-700/60 rounded text-gray-400 hover:text-white">
                  <Maximize2 className="h-3 w-3" />
                </button>
              </div>

              <div className={`aspect-video w-full overflow-hidden relative bg-slate-950 flex flex-col items-center justify-center ${isNightVisionActive() ? 'night-vision-feed' : ''}`}>
                {selectedDrone.stream_url && FLYING_STATUSES.includes(selectedDrone.status) ? (
                  <video src={selectedDrone.stream_url} autoPlay muted loop playsInline className="w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="text-center p-4">
                    <Sliders className="h-7 w-7 text-cyan-400 animate-pulse mx-auto mb-1.5" />
                    <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase">
                      {selectedDrone.status === 'Standby' ? 'UAV DOCKED / FEED STANDBY' : 'FEED UNAVAILABLE'}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-[#0E1624] border-t border-[#1F2E45] px-3 py-1.5 flex items-center justify-between text-[9px] font-mono">
                <span className="text-gray-500">CAMERA: <span className="text-white font-bold uppercase">{cameraMode === 'night' ? 'NIGHT VISION [PROTOTYPE]' : cameraMode === 'day' ? 'DAY MODE' : 'AUTO MODE'}</span></span>
                <button onClick={handleSnapshot} className="flex items-center gap-1 text-cyan-400 hover:text-white transition-all font-bold">
                  <Camera className="h-3 w-3" /> SNAP
                </button>
              </div>
            </div>

            {/* PTT Panel */}
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold">🎙️ Radio COMM</span>
                <span className="text-[8px] bg-cyan-950 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded font-mono uppercase font-bold">DEMO SIMULATION</span>
              </div>

              <button
                onMouseDown={handlePttDown}
                onMouseUp={handlePttUp}
                onMouseLeave={handlePttUp}
                onTouchStart={handlePttDown}
                onTouchEnd={handlePttUp}
                className={`w-full py-3 rounded-xl border font-bold uppercase transition-all tracking-wider text-[11px] flex items-center justify-center gap-2 mb-2 ${
                  pttActive
                    ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/30 ptt-transmitting'
                    : 'bg-slate-900 border-slate-700 text-gray-400 hover:border-cyan-500/50 hover:text-white'
                }`}
              >
                <Mic className="h-4 w-4" />
                {pttActive ? `TRANSMITTING → ${selectedDrone.call_sign}` : '🎙 PUSH TO TALK'}
              </button>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <button onClick={() => setMicActive(!micActive)} className={`p-2 rounded-xl border flex items-center justify-between ${micActive ? 'bg-[#182C25] border-emerald-500/40 text-emerald-400' : 'bg-[#291717] border-red-500/40 text-red-400'}`}>
                  <span>MIC:</span><span className="font-bold">{micActive ? 'ACTIVE' : 'MUTED'}</span>
                </button>
                <button onClick={() => setSpeakerActive(!speakerActive)} className={`p-2 rounded-xl border flex items-center justify-between ${speakerActive ? 'bg-[#182C25] border-emerald-500/40 text-emerald-400' : 'bg-[#291717] border-red-500/40 text-red-400'}`}>
                  <span>SPK:</span><span className="font-bold">{speakerActive ? 'ACTIVE' : 'MUTED'}</span>
                </button>
                <div className="col-span-2 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-gray-500" />
                  <input type="range" min="0" max="100" value={speakerVol} onChange={e => setSpeakerVol(e.target.value)} className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                  <span className="text-[9px] w-6">{speakerVol}%</span>
                </div>
              </div>

              {pttLog.length > 0 && (
                <div className="mt-2 space-y-0.5 max-h-16 overflow-y-auto">
                  {pttLog.slice(0, 4).map((entry, i) => (
                    <div key={i} className="text-[8px] font-mono text-gray-600 flex gap-2">
                      <span className="text-cyan-700">{entry.time}</span>
                      <span>{entry.event}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Flight Ops Controller */}
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <span className="text-[9px] font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-bold">🎮 Flight Operations</span>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <button onClick={() => handleUavCommand('follow')} disabled={!ACTIVE_STATUSES.includes(selectedDrone.status)} className="py-2.5 bg-slate-900 border border-slate-700 hover:border-cyan-400 hover:text-white rounded-xl text-gray-400 font-bold uppercase tracking-wider disabled:opacity-40 transition-all">🎯 Follow</button>
                <button onClick={() => handleUavCommand('orbit')} disabled={!ACTIVE_STATUSES.includes(selectedDrone.status)} className="py-2.5 bg-slate-900 border border-slate-700 hover:border-cyan-400 hover:text-white rounded-xl text-gray-400 font-bold uppercase tracking-wider disabled:opacity-40 transition-all">🔄 Orbit</button>
                <button onClick={() => handleUavCommand('hover')} disabled={!ACTIVE_STATUSES.includes(selectedDrone.status)} className="py-2.5 bg-slate-900 border border-slate-700 hover:border-cyan-400 hover:text-white rounded-xl text-gray-400 font-bold uppercase tracking-wider disabled:opacity-40 transition-all">🛑 Hover</button>
                <button onClick={() => handleUavCommand('dispatch')} disabled={selectedDrone.status !== 'Standby'} className="py-2.5 bg-cyan-600 text-white rounded-xl hover:bg-cyan-500 font-bold uppercase tracking-wider disabled:opacity-40 transition-all">🚀 Dispatch</button>
                <button onClick={() => handleUavCommand('return_home')} disabled={['Standby', 'Charging', 'maintenance', 'Returning'].includes(selectedDrone.status)} className="py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-500 font-bold uppercase tracking-wider col-span-2 disabled:opacity-40 transition-all">🏠 Return Home</button>
                <button onClick={() => handleUavCommand('emergency_land')} disabled={['Standby', 'Charging', 'maintenance'].includes(selectedDrone.status)} className="py-2.5 bg-red-700 text-white rounded-xl hover:bg-red-600 font-bold uppercase tracking-wider col-span-2 disabled:opacity-40 transition-all">🚨 Emergency Land</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── FLEET TAB ─────────────────────────── */}
        {selectedDrone && mcTab === 'fleet' && (
          <div className="p-3 space-y-3">
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold">🔍 Fleet Response Analysis</span>
                <span className="text-[8px] font-mono text-gray-600">RAPID FLEET DECISION ENGINE</span>
              </div>
              {selectedIncident ? (
                fleetEval ? (
                  <div className="space-y-2">
                    {fleetEval.best && (
                      <div className="p-2 bg-cyan-900/20 border border-cyan-500/30 rounded-xl text-[9px] font-mono">
                        <div className="text-cyan-400 font-bold uppercase mb-1">✓ RECOMMENDED</div>
                        <div className="text-white font-bold">{fleetEval.best.callSign}</div>
                        <div className="text-gray-400 mt-0.5">Score: {fleetEval.best.score}/100 ({fleetEval.best.suitabilityLabel})</div>
                        <div className="text-gray-400">ETA: {formatEtaShort(fleetEval.best.etaSeconds)} · Battery surplus: {fleetEval.best.surplusBattery}%</div>
                      </div>
                    )}
                    {!fleetEval.best && (
                      <div className="p-2 bg-red-900/20 border border-red-500/30 rounded-xl text-[10px] font-mono text-red-400 font-bold text-center">
                        ⛔ NO SAFE RAKSHAK AVAILABLE
                      </div>
                    )}

                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {fleetEval.ranked.map((c) => (
                        <div key={c.droneId} className={`p-2 rounded-xl border text-[9px] font-mono ${c.canComplete ? 'border-emerald-500/20 bg-emerald-900/10' : 'border-gray-700/40 bg-gray-900/20'}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-white font-bold">{c.callSign}</span>
                            <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[8px] border ${c.canComplete ? 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' : 'text-red-400 border-red-500/20 bg-red-900/10'}`}>
                              {c.canComplete ? c.suitabilityLabel : 'REJECTED'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-gray-400">
                            <span>Dist: {c.distanceToIncidentKm?.toFixed(1) ?? '--'} km</span>
                            <span>Battery: <span className={batteryColor(c.batteryTier)}>{c.battery}%</span></span>
                            <span>Required: {c.totalRequired ?? '--'}%</span>
                            <span>ETA: {c.etaSeconds ? formatEtaShort(c.etaSeconds) : '--'}</span>
                            <span className="col-span-2 text-[8px] text-gray-500">{c.canComplete ? `Return: ${c.returnFeasibility}` : c.rejectionReason}</span>
                          </div>
                          {c.canComplete && c.droneId !== selectedDrone?.id && (
                            <button
                              onClick={() => selectedIncident && handleManualDispatch(c, selectedIncident)}
                              className="mt-1.5 w-full py-1 bg-slate-800 border border-slate-600 hover:border-cyan-400 hover:text-white text-gray-400 rounded font-bold uppercase text-[8px] transition-all"
                            >
                              Select {c.callSign}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 text-[10px] font-mono py-4">Loading fleet evaluation…</div>
                )
              ) : (
                <div className="text-center text-gray-600 text-[10px] font-mono py-4">Select an incident to view fleet analysis.</div>
              )}
            </div>

            {/* All drone energy status */}
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">⚡ Fleet Energy Status</span>
              <div className="space-y-2">
                {drones.map(d => {
                  const tier = batteryTier(d.battery_level);
                  return (
                    <div key={d.id} className="flex items-center gap-2 text-[9px] font-mono">
                      <span className="text-white font-bold w-24 truncate">{d.call_sign}</span>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${batteryBg(tier)}`} style={{ width: `${d.battery_level}%` }}></div>
                      </div>
                      <span className={`w-10 text-right ${batteryColor(tier)} font-bold`}>{d.battery_level.toFixed(0)}%</span>
                      <span className="text-gray-600 w-12 truncate uppercase">{d.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── EVIDENCE TAB ──────────────────────── */}
        {selectedDrone && mcTab === 'evidence' && (
          <div className="p-3 space-y-3">
            {/* Recording status */}
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">🎬 Mission Recording</span>
              {recording && recording.status !== 'none' ? (
                <div className="space-y-1.5 text-[9px] font-mono">
                  <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${recording.status === 'recording' ? 'bg-red-900/20 border border-red-500/30' : 'bg-gray-800/30 border border-gray-700'}`}>
                    <span className={`h-2 w-2 rounded-full ${recording.status === 'recording' ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`}></span>
                    <span className={`font-bold uppercase ${recording.status === 'recording' ? 'text-red-400' : 'text-gray-400'}`}>
                      {recording.status === 'recording' ? `REC ${formatDuration(recordingTick)}` : 'FINALIZED'}
                    </span>
                    <span className="text-gray-600 ml-auto">{recording.source}</span>
                  </div>
                  <div className="text-gray-500">Rakshak: <span className="text-white">{recording.rakshak_id}</span></div>
                  <div className="text-gray-500">Started: <span className="text-white">{new Date(recording.recording_start).toLocaleTimeString([], { hour12: false })}</span></div>
                  {recording.status === 'finalized' && recording.duration_seconds && (
                    <div className="text-gray-500">Duration: <span className="text-white">{formatDuration(recording.duration_seconds)}</span></div>
                  )}
                  <div className="mt-1 p-1.5 bg-yellow-900/20 border border-yellow-500/20 rounded text-yellow-600 text-[8px]">
                    ⚠ DEMO SIMULATION — No actual video file produced. Architecture ready for real stream recording.
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-600 text-[10px] font-mono py-3">No recording active. Recording starts automatically when mission begins.</div>
              )}
            </div>

            {/* Evidence Integrity (Phase 4 hash chain) */}
            {evidenceChain && (evidenceChain.snapshots.count > 0 || evidenceChain.recordings.count > 0) && (
              <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">🔒 Evidence Integrity</span>
                <div className="space-y-1.5 text-[9px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Snapshot chain ({evidenceChain.snapshots.count})</span>
                    <span className={`font-bold uppercase px-1.5 py-0.5 rounded border ${evidenceChain.snapshots.chainValid ? 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' : 'text-red-400 border-red-500/30 bg-red-900/20'}`}>
                      {evidenceChain.snapshots.chainValid ? '✓ Verified' : '⚠ Broken'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Recording chain ({evidenceChain.recordings.count})</span>
                    <span className={`font-bold uppercase px-1.5 py-0.5 rounded border ${evidenceChain.recordings.chainValid ? 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' : 'text-red-400 border-red-500/30 bg-red-900/20'}`}>
                      {evidenceChain.recordings.chainValid ? '✓ Verified' : '⚠ Broken'}
                    </span>
                  </div>
                  <div className="text-[8px] text-gray-600 mt-1">SHA-256 hash chain — each entry links to the previous, so any tampering after capture breaks verification.</div>
                </div>
              </div>
            )}

            {/* Snapshots */}
            {snapshots.length > 0 && (
              <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">📸 Evidence Snapshots ({snapshots.length})</span>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="relative rounded-xl overflow-hidden border border-gray-800 group cursor-zoom-in">
                      {/* This grid holds up to 200 snapshots. Without
                          loading="lazy" every one starts downloading the
                          moment the panel renders. */}
                      <img src={snap.image_url} loading="lazy" className="w-full aspect-video object-cover opacity-70 group-hover:opacity-100 transition-all" alt={snap.label} />
                      <div className="absolute bottom-0 left-0 w-full bg-black/80 px-1.5 py-1">
                        <div className="text-[8px] text-white font-mono font-bold uppercase truncate">{snap.label}</div>
                        {snap.heading != null && (
                          <div className="text-[7px] text-gray-400 font-mono">Hdg:{snap.heading?.toFixed(0)}° Alt:{snap.altitude?.toFixed(0)}m · {snap.reason}</div>
                        )}
                        <div className="text-[7px] text-gray-500 font-mono">{new Date(snap.timestamp).toLocaleTimeString([], { hour12: false })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GPS Trail */}
            {droneHistory.length > 0 && (
              <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">🗺 GPS Trail ({droneHistory.length} pts)</span>
                <div className="max-h-28 overflow-y-auto space-y-0.5">
                  {droneHistory.slice(0, 10).map((h, i) => (
                    <div key={h.id} className="text-[8px] font-mono text-gray-500 flex gap-2">
                      <span className="text-cyan-700 w-5">{i + 1}</span>
                      <span>{h.latitude.toFixed(4)}°N, {h.longitude.toFixed(4)}°E</span>
                      <span className="ml-auto">{h.altitude?.toFixed(0)}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── LOG TAB ──────────────────────────── */}
        {selectedDrone && mcTab === 'log' && (
          <div className="p-3 space-y-3">
            {incidentLogs.length > 0 && (
              <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">📋 Mission Timeline</span>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {incidentLogs.map((log) => (
                    <div key={log.id} className="relative pl-4 border-l border-gray-800 text-[10px] font-mono py-0.5">
                      <div className="absolute -left-[3.5px] top-1.5 h-1.5 w-1.5 bg-cyan-400 rounded-full"></div>
                      <div className="flex justify-between items-center text-gray-500 text-[9px]">
                        <span className={`font-bold uppercase ${log.action === 'launch' ? 'text-cyan-400' : log.action === 'arrival' ? 'text-emerald-400' : log.action === 'snapshot' ? 'text-yellow-400' : 'text-gray-400'}`}>{log.action}</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                      </div>
                      <p className="text-gray-300 mt-0.5 text-[9px] leading-relaxed">{log.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Controller Action Log */}
            <div className="bg-[#121A28] border border-[#1F2E45] p-3 rounded-2xl">
              <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-2">🎮 Controller Action Log</span>
              {controllerActions.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {controllerActions.slice(0, 20).map((act) => (
                    <div key={act.id} className="text-[9px] font-mono border-l-2 border-cyan-800 pl-2">
                      <div className="flex justify-between">
                        <span className="text-cyan-400 font-bold uppercase">{act.action.replace(/_/g, ' ')}</span>
                        <span className="text-gray-600">{new Date(act.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                      </div>
                      <div className="text-gray-500">{act.rakshak_id} · {act.result}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-600 text-[10px] font-mono py-3">No controller actions logged yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
