import React, { useState, useEffect } from 'react';
import { Layers, Battery, Compass, CheckCircle, AlertTriangle, ShieldCheck, PenTool, Link2, Eye, Cpu, Radio, User } from 'lucide-react';
import { SkeletonCard } from '../components/shared/Skeleton';

function Fleet() {
  const [drones, setDrones] = useState([]);
  const [editingDrone, setEditingDrone] = useState(null);
  const [streamUrl, setStreamUrl] = useState('');
  // Without this, an empty `drones` array during the initial fetch rendered a
  // blank grid with no sign anything was loading. Set false only after the
  // mount effect resolves, not inside fetchDrones(): that also runs from
  // toggleMaintenance and handleUpdateStream, and must not flash the skeleton
  // back over already-loaded cards.
  const [loading, setLoading] = useState(true);

  const fetchDrones = async () => {
    try {
      const res = await fetch('/api/fleet/status');
      if (res.ok) {
        const data = await res.json();
        // Map field names if needed or use enriched fleet status
        setDrones(data.map(d => ({
          ...d,
          call_sign: d.callSign || d.call_sign,
          battery_level: d.battery !== undefined ? d.battery : d.battery_level,
          current_incident_id: d.currentMissionId !== undefined ? d.currentMissionId : d.current_incident_id
        })));
      } else {
        const fallbackRes = await fetch('/api/drones');
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          setDrones(fallbackData);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let ignore = false;
    const sync = async () => { if (!ignore) await fetchDrones(); };
    sync().finally(() => { if (!ignore) setLoading(false); });
    const interval = setInterval(sync, 2000);
    return () => { ignore = true; clearInterval(interval); };
  }, []);

  const toggleMaintenance = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'maintenance' ? 'idle' : 'maintenance';
    // Map idle back to Standby in next status if resolving
    const mappedStatus = nextStatus === 'idle' ? 'Standby' : 'maintenance';
    try {
      const res = await fetch(`/api/drones/${id}/maintenance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: mappedStatus })
      });
      if (res.ok) fetchDrones();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStream = async (e) => {
    e.preventDefault();
    if (!editingDrone) return;

    try {
      const res = await fetch(`/api/drones/${editingDrone.id}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: streamUrl })
      });
      if (res.ok) {
        setEditingDrone(null);
        setStreamUrl('');
        fetchDrones();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 border-b border-[#1F2E45] pb-4">
        <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
          <Layers className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-wide text-white">RAPID Operations Fleet</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">Control live fleet hardware states, diagnostic streams, and maintenance logs.</p>
        </div>
      </div>

      {/* Main Drones Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)
        ) : drones.map((drone) => {

          const batteryBar = drone.battery_level > 60
            ? 'bg-emerald-500'
            : drone.battery_level > 20
            ? 'bg-amber-500'
            : 'bg-red-500';

          // Determine health status
          const healthStatus = drone.status === 'maintenance'
            ? 'Maintenance'
            : drone.battery_level < 20
            ? 'Warning (Low Bat)'
            : 'Nominal';

          const healthColor = healthStatus === 'Nominal'
            ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
            : healthStatus === 'Maintenance'
            ? 'text-red-400 border-red-500/20 bg-red-500/5'
            : 'text-amber-400 border-amber-500/20 bg-amber-500/5 animate-pulse';

          // Camera vision description
          const cameraModeStr = !['Standby', 'Charging', 'maintenance'].includes(drone.status)
            ? (drone.camera_mode || 'Auto (Day/Night)')
            : 'Standby / Lens Docked';

          return (
            <div
              key={drone.id}
              className={`cyber-glass rounded-2xl p-5 border transition-all duration-300 relative overflow-hidden ${
                drone.status === 'maintenance'
                  ? 'border-red-500/20 bg-red-950/5'
                  : 'border-[#1F2E45] hover:border-cyan-500/40'
              }`}
            >
              {/* Card Status Indicator */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-extrabold text-base text-white tracking-wide">{drone.call_sign}</h3>
                  <span className="text-[10px] font-mono text-gray-500">{drone.model}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border rounded-full uppercase ${
                    drone.status === 'Standby'
                      ? 'text-gray-400 bg-gray-800/40 border-gray-700'
                      : drone.status === 'maintenance'
                      ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20 animate-pulse'
                  }`}>
                    {drone.status}
                  </span>
                  {drone.is_hardware_active && (
                    <span className="text-[8px] font-mono text-emerald-400 mt-1 uppercase font-bold tracking-widest animate-pulse">
                      📡 Live HW Link
                    </span>
                  )}
                </div>
              </div>

              {/* Battery Indicator */}
              <div className="mb-4">
                <div className="flex justify-between text-xs font-mono mb-1 text-gray-400">
                  <span>Battery Reserve:</span>
                  <span className="font-bold">{drone.battery_level.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div style={{ width: `${drone.battery_level}%` }} className={`h-full ${batteryBar} transition-all duration-500`}></div>
                </div>
              </div>

              {/* Detailed Diagnostics Info */}
              <div className="space-y-2 text-xs font-mono text-gray-400 border-t border-gray-800/60 pt-3 mb-4">
                
                {/* Health Status */}
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-gray-500" /> System Health:</span>
                  <span className={`text-[10px] font-bold border rounded-full px-2 py-0.2 uppercase ${healthColor}`}>
                    {healthStatus}
                  </span>
                </div>

                {/* Active Mission */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Radio className="h-3.5 w-3.5 text-gray-500" /> Active Mission:</span>
                  <span className="text-white text-[11px] font-bold">
                    {drone.current_incident_id ? 'DISPATCHED ALARM' : 'STANDBY (BASE)'}
                  </span>
                </div>

                {/* Flight Time Duration */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-gray-500" /> Flight Time:</span>
                  <span className="text-white text-[11px]">
                    {!['Standby', 'Charging', 'maintenance'].includes(drone.status) ? '03m 42s (Active)' : '00m 00s (Grounded)'}
                  </span>
                </div>

                {/* Camera Status */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-gray-500" /> Camera Status:</span>
                  <span className="text-white text-[11px]" title={drone.stream_url || 'Unlinked'}>
                    {drone.stream_url ? `Online (${cameraModeStr})` : 'Offline / Unlinked'}
                  </span>
                </div>

                {/* GPS Status */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-gray-500" /> GPS Lock Status:</span>
                  <span className="text-cyan-400 text-[11px] font-bold">
                    LOCKED (14 SATs)
                  </span>
                </div>

                {/* GPS Locked coordinates */}
                <div className="flex justify-between pl-4 text-[10px] text-gray-500">
                  <span>Coordinates:</span>
                  <span>{drone.latitude.toFixed(4)}, {drone.longitude.toFixed(4)}</span>
                </div>

                {/* Return Feasibility (Command 3) */}
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1"><Battery className="h-3.5 w-3.5 text-gray-500" /> Return Feasibility:</span>
                  <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 uppercase ${
                    drone.returnStatus === 'SAFE'
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : drone.returnStatus === 'RETURN_RECOMMENDED'
                      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      : 'text-red-400 border-red-500/30 bg-red-500/10 animate-pulse'
                  }`}>
                    {drone.returnStatus || (drone.battery_level > 30 ? 'SAFE' : 'CRITICAL')}
                  </span>
                </div>

                {/* Distance to Base */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-gray-500" /> Distance from Base:</span>
                  <span className="text-white text-[11px] font-mono">
                    {drone.distToBaseKm !== undefined ? `${drone.distToBaseKm} km` : '0.00 km (At Base)'}
                  </span>
                </div>

                {/* AI Status */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5 text-gray-500" /> AI Classification:</span>
                  <span className="text-white text-[11px]">
                    {!['Standby', 'Charging', 'maintenance'].includes(drone.status) ? 'Monitoring / Tracking' : 'Standby / Idle'}
                  </span>
                </div>

                {/* Operator/Controller */}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-gray-500" /> Controller Unit:</span>
                  <span className="text-white text-[11px]">
                    Officer Ananya Fernandes
                  </span>
                </div>

                {/* Hardware specifications */}
                <div className="flex justify-between text-[10px] pt-1 text-gray-600 border-t border-gray-800/40">
                  <span>ESP32 Hardware ID:</span>
                  <span className="font-mono">{drone.hardware_id || 'N/A'}</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-800/40">
                <button
                  onClick={() => toggleMaintenance(drone.id, drone.status)}
                  disabled={!['Standby', 'maintenance'].includes(drone.status)}
                  className={`py-2 border rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
                    drone.status === 'maintenance'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:hover:bg-transparent'
                  }`}
                >
                  <PenTool className="h-3.5 w-3.5" />
                  <span>{drone.status === 'maintenance' ? 'Resolve Ready' : 'Maintenance'}</span>
                </button>
                <button
                  onClick={() => {
                    setEditingDrone(drone);
                    setStreamUrl(drone.stream_url || '');
                  }}
                  className="py-2 bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5"
                >
                  <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Mount Stream</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mount Stream Overlay Modal */}
      {editingDrone && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#161F30] border border-[#1F2E45] rounded-3xl p-6 shadow-2xl">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-white border-b border-[#1F2E45] pb-3 mb-4">
              Mount Livestream Feed on {editingDrone.call_sign}
            </h3>
            
            <form onSubmit={handleUpdateStream} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Livestream Feed URL (HLS / WebRTC signaller)</label>
                <input
                  type="url"
                  required
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="e.g. https://domain.com/live/master.m3u8"
                  className="w-full bg-[#1F2E45] border border-gray-700 focus:border-cyan-500 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDrone(null)}
                  className="px-4 py-2 border border-gray-700 text-gray-400 hover:text-white rounded-xl text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl text-xs font-mono uppercase tracking-wider"
                >
                  Mount Stream Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Fleet;
