import React, { useState, useEffect } from 'react';
import {
  FileText, Search, Filter, Shield, Clock, Phone, User, Calendar, Info, X,
  Video, Music, Image as ImageIcon, MapPin, Cpu, Download, List, AlertTriangle
} from 'lucide-react';
import { SkeletonBlock, SkeletonRow } from '../components/shared/Skeleton';

// A table-row-shaped skeleton, local to this file since this is the only table
// layout among the pages that needed one.
function SkeletonTableRow() {
  return (
    <tr>
      <td className="p-4"><SkeletonBlock className="h-4 w-40 mb-1.5" /><SkeletonBlock className="h-2.5 w-24" /></td>
      <td className="p-4"><SkeletonBlock className="h-3 w-16" /></td>
      <td className="p-4"><SkeletonBlock className="h-4 w-14 rounded-full" /></td>
      <td className="p-4"><SkeletonBlock className="h-3 w-24" /></td>
      <td className="p-4"><SkeletonBlock className="h-3 w-16" /></td>
      <td className="p-4 text-center"><SkeletonBlock className="h-6 w-24 mx-auto" /></td>
    </tr>
  );
}

function Incidents() {
  const [incidents, setIncidents] = useState([]);
  // Without this, "No incident logs found matches filters" showed during the
  // initial fetch too, indistinguishable from a genuinely empty registry.
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  // Inspection panel modal
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [incidentSnapshots, setIncidentSnapshots] = useState([]);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'media', 'snapshots', 'timeline', 'ai'
  // The dossier's Timeline Log tab has the same problem during
  // fetchDossierData(), so the modal gets its own flag.
  const [dossierLoading, setDossierLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    const fetchIncidents = async () => {
      try {
        const res = await fetch('/api/incidents');
        if (res.ok) {
          const data = await res.json();
          if (!ignore) setIncidents(data);
        }
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchIncidents();
    return () => { ignore = true; };
  }, []);

  // Fetch audit logs & snapshots when selecting an incident
  useEffect(() => {
    if (!selectedIncident) return;

    const fetchDossierData = async () => {
      setDossierLoading(true);
      try {
        const logRes = await fetch(`/api/incidents/${selectedIncident.id}/logs`);
        if (logRes.ok) {
          const logData = await logRes.json();
          setAuditLogs(logData);
        }

        const snapRes = await fetch(`/api/incidents/${selectedIncident.id}/snapshots`);
        if (snapRes.ok) {
          const snapData = await snapRes.json();
          setIncidentSnapshots(snapData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setDossierLoading(false);
      }
    };
    fetchDossierData();
  }, [selectedIncident]);

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch = inc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (inc.citizen_name && inc.citizen_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          inc.id.includes(searchQuery);
    const matchesCategory = filterCategory === 'all' || inc.category === filterCategory;
    const matchesSeverity = filterSeverity === 'all' || inc.severity === filterSeverity;
    
    return matchesSearch && matchesCategory && matchesSeverity;
  });

  // Mock download of the entire evidence package zip file
  const handleDownloadEvidenceZip = () => {
    if (!selectedIncident) return;
    const link = document.createElement('a');
    link.href = 'https://file-examples.com/wp-content/uploads/2017/02/zip_2MB.zip'; // placeholder public zip
    link.setAttribute('download', `RAPID_EVIDENCE_CASE_${selectedIncident.id.slice(0, 8)}.zip`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#1F2E45] pb-4">
        <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
          <FileText className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-wide text-white">Emergency Incident Registry</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">Audit log archive for drone dispatches, citizen alerts, and case resolutions.</p>
        </div>
      </div>

      {/* Filter controllers bar */}
      <div className="cyber-glass rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by ID, title, caller..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1F2937]/50 border border-gray-800 focus:border-cyan-500 focus:outline-none rounded-xl pl-10 pr-4 py-2 text-xs text-white"
          />
        </div>

        {/* Filters Grid */}
        <div className="flex flex-wrap gap-3 w-full md:w-auto items-center justify-end">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-gray-500" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-[#1F2937]/50 border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="trespass">Trespass</option>
              <option value="fire">Fire Outbreaks</option>
              <option value="theft">Theft</option>
              <option value="assault">Assault</option>
              <option value="traffic">Traffic Collisions</option>
              <option value="medical">Medical Distress</option>
              <option value="other">Other</option>
            </select>
          </div>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-[#1F2937]/50 border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Audit Registry Table */}
      <div className="cyber-glass rounded-2xl overflow-hidden border border-[#1F2E45]">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-900/60 border-b border-[#1F2E45] font-mono text-gray-400 uppercase tracking-wider">
              <th className="p-4">Incident Details</th>
              <th className="p-4">Category</th>
              <th className="p-4">Priority</th>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-center">Evidence Dossier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {loading ? (
              [0, 1, 2, 3, 4].map(i => <SkeletonTableRow key={i} />)
            ) : filteredIncidents.map((inc) => {
              const severityStyles = inc.severity === 'critical' 
                ? 'text-red-400 bg-red-500/10 border-red-500/20' 
                : inc.severity === 'high' 
                ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' 
                : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';

              return (
                <tr key={inc.id} className="hover:bg-gray-900/20 transition-all">
                  <td className="p-4">
                    <div className="font-bold text-white text-sm">{inc.title}</div>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-[260px]">ID: {inc.id}</div>
                  </td>
                  <td className="p-4 font-mono uppercase text-gray-400">{inc.category}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 border rounded-full font-mono text-[9px] uppercase font-bold ${severityStyles}`}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-gray-500">
                    {new Date(inc.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="p-4">
                    <span className={`font-mono text-[10px] uppercase font-bold ${
                      inc.status === 'resolved' 
                        ? 'text-emerald-400' 
                        : inc.status === 'cancelled' 
                        ? 'text-gray-500' 
                        : 'text-orange-400 animate-pulse'
                    }`}>
                      {inc.status}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => { setSelectedIncident(inc); setActiveTab('overview'); }}
                      className="p-2 bg-slate-900 border border-slate-800 hover:border-cyan-400 hover:text-white rounded-lg transition-all flex items-center gap-1 mx-auto"
                      title="Inspect Evidence Package"
                    >
                      <Info className="h-4 w-4 text-cyan-400" />
                      <span className="text-[10px] font-mono text-gray-300">Open Dossier</span>
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && filteredIncidents.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500 italic">
                  No incident logs found matches filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Case Details Audit Trail / Evidence Package Dossier Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0D1626] border border-[#1F2E45] rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4 border-b border-[#1F2E45] pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-cyan-400 animate-pulse" />
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">
                    POLICE EVIDENCE DOSSIER
                  </h3>
                  <p className="text-[9px] text-cyan-400 font-mono">CASE ID: {selectedIncident.id.toUpperCase()}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedIncident(null)} 
                className="text-gray-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* TAB SELECTORS */}
            <nav className="flex border-b border-gray-800 mb-4 text-xs font-mono text-gray-400 select-none">
              {[
                { id: 'overview', label: 'Summary', icon: FileText },
                { id: 'media', label: 'Video/Audio', icon: Video },
                { id: 'snapshots', label: `Snapshots (${incidentSnapshots.length})`, icon: ImageIcon },
                { id: 'timeline', label: 'Timeline log', icon: List },
                { id: 'ai', label: 'AI Advice', icon: Cpu }
              ].map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 border-b-2 font-bold uppercase transition-all -mb-[2px] ${
                      activeTab === t.id 
                        ? 'border-cyan-400 text-cyan-400' 
                        : 'border-transparent hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* TAB CONTENTS */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              
              {/* Tab: Overview Dossier */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
                    <h4 className="font-bold text-white text-base mb-1">{selectedIncident.title}</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">{selectedIncident.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-2xl space-y-2">
                      <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold mb-1.5">
                        Citizen Alert Details
                      </span>
                      <div className="space-y-1 text-xs text-gray-400 font-mono">
                        <p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-gray-600" /> Date: <span className="text-white">{new Date(selectedIncident.created_at).toLocaleDateString()}</span></p>
                        <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-gray-600" /> Ingestion Time: <span className="text-white">{new Date(selectedIncident.created_at).toLocaleTimeString()}</span></p>
                        <p className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-gray-600" /> Reporter: <span className="text-white">{selectedIncident.citizen_name || 'N/A'}</span></p>
                        <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-600" /> Contact Number: <span className="text-white">{selectedIncident.citizen_phone || 'N/A'}</span></p>
                      </div>
                    </div>

                    <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-2xl space-y-2">
                      <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold mb-1.5">
                        Telemetry coordinates
                      </span>
                      <div className="space-y-1 text-xs text-gray-400 font-mono">
                        <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-600" /> Incident Lat: <span className="text-white">{selectedIncident.latitude.toFixed(6)}</span></p>
                        <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-600" /> Incident Lng: <span className="text-white">{selectedIncident.longitude.toFixed(6)}</span></p>
                        <p className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-gray-600" /> Resolution: <span className="text-emerald-400 font-bold uppercase">{selectedIncident.status}</span></p>
                        <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-gray-600" /> Finalized Time: <span className="text-white">{selectedIncident.resolved_at ? new Date(selectedIncident.resolved_at).toLocaleTimeString() : 'Awaiting controller'}</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Video & Audio Recordings */}
              {activeTab === 'media' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    
                    {/* Mission Video */}
                    <div className="space-y-2 bg-[#060B12] p-3 rounded-2xl border border-gray-800">
                      <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-1">
                        📹 Drone Camera Footage (HEVC H.265)
                      </span>
                      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black relative flex items-center justify-center">
                        <video 
                          src="https://www.w3.org/2010/05/video/media/movie_300.mp4" 
                          controls 
                          className="w-full h-full object-cover filter contrast-1.1 sepia(0.1) saturate(1.1) brightness(0.95)"
                        />
                      </div>
                      <div className="text-[9px] font-mono text-gray-500 flex justify-between">
                        <span>FPS: 30 | BITRATE: 6.2Mbps</span>
                        <span className="text-emerald-400 font-bold">DIGITAL WATERMARK VALID</span>
                      </div>
                    </div>

                    {/* Mission Audio */}
                    <div className="space-y-2 bg-[#060B12] p-3 rounded-2xl border border-gray-800 flex flex-col">
                      <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold block mb-1">
                        🎙️ Cockpit Voice Transmission
                      </span>
                      <div className="flex-1 flex flex-col justify-center items-center py-6 bg-black rounded-xl">
                        
                        {/* Audio visual mock waveform */}
                        <div className="flex items-end justify-center gap-1 h-12 mb-4">
                          {[30, 80, 50, 90, 40, 70, 20, 60, 80, 40, 90, 50, 70, 30].map((h, i) => (
                            <div 
                              key={i} 
                              style={{ height: `${h}%` }} 
                              className="w-1.5 bg-cyan-400 rounded-full opacity-60"
                            ></div>
                          ))}
                        </div>

                        <audio 
                          src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
                          controls
                          className="w-full max-w-[200px] h-8 scale-90"
                        />
                      </div>
                      <div className="text-[9px] font-mono text-gray-500 flex justify-between">
                        <span>FORMAT: 64kbps Opus Mono</span>
                        <span className="text-emerald-400 font-bold">TRANSCRIPT ARCHIVED</span>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Tab: Evidence Snapshots */}
              {activeTab === 'snapshots' && (
                <div className="space-y-4">
                  {dossierLoading ? (
                    <div className="grid grid-cols-2 gap-4">
                      <SkeletonBlock className="h-40 w-full" />
                      <SkeletonBlock className="h-40 w-full" />
                    </div>
                  ) : incidentSnapshots.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                      {incidentSnapshots.map((snap) => (
                        <div 
                          key={snap.id} 
                          className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
                        >
                          <div className="aspect-video w-full overflow-hidden bg-black relative">
                            {/* This grid holds up to 200 snapshots inside a
                                scrollable modal, so the images load lazily. */}
                            <img
                              src={snap.image_url}
                              loading="lazy"
                              className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-all"
                              alt={snap.label} 
                            />
                            <div className="absolute top-2 left-2 bg-black/60 border border-cyan-400/30 px-2 py-0.5 rounded text-[8px] font-mono text-cyan-400 font-bold uppercase">
                              AI: {snap.label}
                            </div>
                          </div>
                          
                          <div className="p-3 text-[10px] font-mono text-gray-400 space-y-1 border-t border-gray-800/40">
                            <div className="flex justify-between"><span>Timestamp:</span><span className="text-white">{new Date(snap.timestamp).toLocaleTimeString()}</span></div>
                            <div className="flex justify-between"><span>GPS Coordinate:</span><span className="text-cyan-400 font-bold">{snap.latitude.toFixed(5)}, {snap.longitude.toFixed(5)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-gray-500 italic flex flex-col items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-cyan-500 mb-2 opacity-50" />
                      <p className="text-xs font-mono">No AI snapshots saved for this case ID.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Timeline log */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {dossierLoading ? (
                      [0, 1, 2].map(i => <SkeletonRow key={i} />)
                    ) : auditLogs.map((log) => (
                      <div key={log.id} className="relative pl-5 border-l border-cyan-500/20 py-1">
                        <div className="absolute -left-[4px] top-2.5 h-2 w-2 bg-cyan-400 rounded-full glow-cyan"></div>
                        <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                          <span className="text-cyan-400 font-bold uppercase tracking-wider">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-200 mt-1 font-sans leading-relaxed">{log.notes}</p>
                      </div>
                    ))}

                    {!dossierLoading && auditLogs.length === 0 && (
                      <p className="text-xs text-gray-500 italic py-6 text-center">No timeline records found.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: AI Recommendations & Advice Dossier */}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  <div className="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl flex gap-3">
                    <Cpu className="h-6 w-6 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-mono text-xs text-cyan-400 font-bold uppercase tracking-wider mb-2">
                        AI Target Profiling & Flight Assessment
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed font-mono">
                        Flight assessment parameters completed with nominal energy efficiency index (74.2% operational ratio). 
                        No-fly boundaries respected during all flight segments. 
                        Target classification confidence factors:
                        <br />
                        - Human tracking target detection: 94.2% accuracy.
                        <br />
                        - Fire hazard detection classification: 98.7% accuracy.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-2xl space-y-2 text-xs font-mono">
                    <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider block font-bold mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Command Advice & Actions Dossier
                    </span>
                    <p className="text-gray-300 leading-relaxed">
                      Incident logs suggest suspect fled to nearby Candolim secondary intersections. 
                      Recommend dispatching sector 4 ground vehicles to set perimeter barriers. 
                      UAV camera feed recording package compiled successfully and marked for police evidence submission.
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer / Download Button */}
            <div className="mt-6 border-t border-[#1F2E45] pt-4 flex justify-between items-center">
              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">
                RAPID EVIDENCE PROTECTION COMPLIANT
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="px-4 py-2 border border-gray-700 hover:text-white rounded-xl text-xs font-mono text-gray-400 transition-all"
                >
                  Close Dossier
                </button>
                <button
                  onClick={handleDownloadEvidenceZip}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 hover:opacity-90 shadow-md transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Evidence Package
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default Incidents;
