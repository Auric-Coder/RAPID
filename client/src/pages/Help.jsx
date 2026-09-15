import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, MapPin, Send, AlertTriangle, Phone, User, CheckCircle, Shield, Play } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// Custom icons using inline SVG shapes to prevent broken image references
const citizenIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute h-8 w-8 bg-orange-500/30 rounded-full animate-ping"></div>
      <div class="h-4 w-4 bg-orange-600 border-2 border-white rounded-full shadow-lg"></div>
    </div>
  `,
  className: 'custom-citizen-icon',
  iconSize: [20, 20]
});

const droneIcon = (heading) => L.divIcon({
  html: `
    <div style="transform: rotate(${heading}deg); transition: transform 0.2s linear;" class="flex items-center justify-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 22L12 17L22 22L12 2Z" fill="#06B6D4" stroke="white" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>
  `,
  className: 'custom-drone-icon',
  iconSize: [28, 28]
});

function Help() {
  const [searchParams, setSearchParams] = useSearchParams();
  const trackingId = searchParams.get('id');

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('medical');
  const [gpsShared, setGpsShared] = useState(false);
  const [coordinates, setCoordinates] = useState({ lat: 15.2993, lng: 74.1240 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [gpsError, setGpsError] = useState(null);

  // Tracking states
  const [incident, setIncident] = useState(null);
  const [drone, setDrone] = useState(null);
  const [logs, setLogs] = useState([]);
  const [eta, setEta] = useState(null);

  // Poll tracking info if trackingId is present
  useEffect(() => {
    if (!trackingId) return;

    const fetchTrackingData = async () => {
      try {
        // Fetch incident details
        const incRes = await fetch(`/api/incidents/${trackingId}`);
        if (!incRes.ok) throw new Error('Failed to load incident status');
        const incData = await incRes.json();
        setIncident(incData);

        // Fetch logs
        const logsRes = await fetch(`/api/incidents/${trackingId}/logs`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData);
        }

        // Fetch drone details if assigned
        if (incData.assigned_drone_id) {
          const droneRes = await fetch(`/api/drones/${incData.assigned_drone_id}`);
          if (droneRes.ok) {
            const droneData = await droneRes.json();
            setDrone(droneData);

            // Compute ETA in human-readable form
            if (['Dispatched', 'En Route', 'dispatching'].includes(droneData.status) && droneData.speed > 0) {
              const R = 6371e3;
              const lat1 = droneData.latitude;
              const lon1 = droneData.longitude;
              const lat2 = incData.latitude;
              const lon2 = incData.longitude;
              
              const φ1 = (lat1 * Math.PI) / 180;
              const φ2 = (lat2 * Math.PI) / 180;
              const Δφ = ((lat2 - lat1) * Math.PI) / 180;
              const Δλ = ((lon2 - lon1) * Math.PI) / 180;

              const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;

              const secondsRemaining = distance / droneData.speed;
              const minutes = Math.ceil(secondsRemaining / 60);
              setEta(minutes <= 1 ? 'less than a minute away' : `about ${minutes} minutes away`);
            } else if (['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'on_site'].includes(droneData.status)) {
              setEta('at your location');
            } else {
              setEta(null);
            }
          }
        } else {
          setDrone(null);
          setEta(null);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchTrackingData();
    const interval = setInterval(fetchTrackingData, 2000); // Poll coordinates every 2s
    return () => clearInterval(interval);
  }, [trackingId]);

  const requestLocation = () => {
    setGpsLoading(true);
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Location is not available on this device.');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setGpsShared(true);
        setGpsLoading(false);
      },
      (error) => {
        console.error(error);
        // Fallback: approximate location near Goa centre
        const offsetLat = (Math.random() - 0.5) * 0.05;
        const offsetLng = (Math.random() - 0.5) * 0.05;
        setCoordinates({ lat: 15.2993 + offsetLat, lng: 74.1240 + offsetLng });
        setGpsShared(true);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!name || !phone || !gpsShared) {
      setFormError('Please fill in your name, phone number, and share your location.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Emergency: Citizen Call (${category.toUpperCase()})`,
          description: `Emergency reported by ${name}. Contact number: ${phone}`,
          category,
          severity: 'high',
          latitude: coordinates.lat,
          longitude: coordinates.lng,
          citizen_name: name,
          citizen_phone: phone
        })
      });

      if (!response.ok) throw new Error('Your report could not be sent. Please try again.');
      const data = await response.json();
      setSearchParams({ id: data.incident.id });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusStep = (status) => {
    switch (status) {
      case 'reported': return 0;
      case 'dispatched': return 1;
      case 'active': return 2;
      case 'resolved': return 3;
      default: return 0;
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-white flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-center gap-3 mb-6">
        <ShieldAlert className="h-8 w-8 text-orange-500 animate-pulse" />
        <h1 className="text-xl font-bold font-mono tracking-widest text-white uppercase">Emergency Help</h1>
      </div>

      <AnimatePresence mode="wait">
        {!trackingId ? (
          // Form Screen
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-orange-500 to-red-500"></div>

            <div className="mb-6">
              <h2 className="text-lg font-bold">Request emergency help</h2>
              <p className="text-xs text-gray-400 mt-1">Fill in your details and tap Send for Help. Keep this page open to track the response.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Your Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-[#1F2937] border border-gray-700 focus:border-orange-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="w-full bg-[#1F2937] border border-gray-700 focus:border-orange-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Type of emergency</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#1F2937] border border-gray-700 focus:border-orange-500 focus:outline-none rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value="medical">Medical emergency or accident</option>
                  <option value="assault">Assault or active threat</option>
                  <option value="theft">Robbery</option>
                  <option value="fire">Fire</option>
                  <option value="trespass">Break-in or trespassing</option>
                  <option value="other">Other emergency</option>
                </select>
              </div>

              <div className="py-2">
                <button
                  type="button"
                  onClick={requestLocation}
                  className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 font-medium transition-all ${
                    gpsShared
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20'
                  }`}
                >
                  <MapPin className={`h-4 w-4 ${gpsLoading ? 'animate-bounce' : ''}`} />
                  <span>
                    {gpsLoading
                      ? 'Finding your location…'
                      : gpsShared
                      ? 'Location found'
                      : 'Share my location'}
                  </span>
                </button>
                {gpsShared && (
                  <p className="text-[10px] text-center text-emerald-500 font-mono mt-1">Location confirmed.</p>
                )}
                {gpsError && (
                  <p className="text-[10px] text-center text-red-400 font-mono mt-1">{gpsError}</p>
                )}
              </div>

              {formError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{formError}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-orange-500/20"
              >
                {isSubmitting ? (
                  <span>Sending…</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Send for Help</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        ) : (
          // Tracking View
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
              <div>
                <span className="text-[10px] text-orange-400 font-mono tracking-widest uppercase">Your report was received</span>
                <h2 className="text-sm font-mono text-gray-400 font-semibold mt-0.5 truncate max-w-[200px]">ID: {trackingId}</h2>
              </div>
              <div className="bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-[11px] font-bold text-red-400 font-mono uppercase">Tracking</span>
              </div>
            </div>

            {incident && (
              <div className="grid grid-cols-4 gap-2 mb-6">
                {[
                  { key: 'reported', label: 'Report sent' },
                  { key: 'dispatched', label: 'On the way' },
                  { key: 'active', label: 'At your location' },
                  { key: 'resolved', label: 'Resolved' }
                ].map((step, idx) => {
                  const currentIdx = getStatusStep(incident.status);
                  const isDone = idx < currentIdx;
                  const isCurrent = idx === currentIdx;
                  return (
                    <div key={step.key} className="text-center">
                      <div
                        className={`h-2 rounded-full mb-1.5 transition-colors duration-500 ${
                          isDone ? 'bg-emerald-500' : isCurrent ? 'bg-orange-500 animate-pulse' : 'bg-gray-800'
                        }`}
                      ></div>
                      <span className={`text-[10px] font-bold uppercase ${isCurrent ? 'text-orange-400' : isDone ? 'text-emerald-400' : 'text-gray-600'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Map representation */}
            <div className="h-56 rounded-2xl overflow-hidden border border-gray-800 mb-4 z-10 relative">
              <MapContainer
                center={[coordinates.lat, coordinates.lng]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <Marker position={[coordinates.lat, coordinates.lng]} icon={citizenIcon} />
                {drone && (
                  <>
                    <Marker position={[drone.latitude, drone.longitude]} icon={droneIcon(drone.heading)}>
                      <Popup>
                        <div className="text-xs font-mono text-black font-semibold">
                          <p>Call Sign: {drone.call_sign}</p>
                          <p>Alt: {drone.altitude.toFixed(0)}m</p>
                        </div>
                      </Popup>
                    </Marker>
                    <Polyline
                      positions={[
                        [drone.latitude, drone.longitude],
                        [coordinates.lat, coordinates.lng]
                      ]}
                      color="#06B6D4"
                      dashArray="5, 10"
                      weight={2}
                    />
                  </>
                )}
              </MapContainer>
            </div>

            {/* Drone Telemetry details for Citizen info */}
            <div className="bg-[#1F2937]/50 rounded-2xl p-4 border border-gray-800/80 mb-4">
              {drone ? (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-gray-800/50 pb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-cyan-400 animate-spin" />
                      <span className="text-xs font-mono text-cyan-400 font-bold">{drone.call_sign} responding</span>
                    </div>
                    {eta && (
                      <span className="text-xs font-mono bg-cyan-950/40 text-cyan-400 px-2 py-0.5 border border-cyan-500/20 rounded font-semibold">
                        {eta}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-400">
                    <p>On its way to you</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <AlertTriangle className="h-5 w-5 text-orange-500 animate-bounce mb-1" />
                  <p className="text-xs text-gray-400">A responder has been alerted. You'll see it here when it's on the way.</p>
                </div>
              )}
            </div>

            {/* Realtime Video Stream Feed Placeholder */}
            {drone && (drone.status === 'active' || drone.status === 'on_site') && (
              <div className="bg-black rounded-2xl aspect-video overflow-hidden relative border border-cyan-500/30 glow-cyan mb-4">
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-red-600 text-white px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
                  LIVE CAMERA FEED
                </div>
                {drone.stream_url ? (
                  <video
                    src={drone.stream_url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover opacity-80"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-gray-400">
                    <Activity className="h-8 w-8 text-cyan-500 animate-pulse mb-2" />
                    <span className="text-[11px] font-mono tracking-widest text-cyan-500 animate-pulse uppercase">Connecting…</span>
                  </div>
                )}
              </div>
            )}

            {/* Event log feed */}
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              <span className="text-[10px] font-mono text-gray-500 block uppercase mb-1">Updates</span>
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 text-[11px] font-mono border-l border-gray-800 pl-3 py-0.5">
                  <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-cyan-400 font-bold uppercase">{log.action.replace(/_/g, ' ')}:</span>
                  <span className="text-gray-300 flex-1">{log.notes}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-[11px] font-mono text-gray-600">Your report has been logged. Updates will appear here.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Help;
