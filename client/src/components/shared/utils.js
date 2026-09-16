/**
 * RAPID v1.3 — Shared utility functions and constants for Dashboard components
 */
import L from 'leaflet';

// ── Status Constants ──
export const ACTIVE_STATUSES = ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller', 'Returning', 'Patrolling'];
export const FLYING_STATUSES = ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Returning', 'Patrolling'];

// ── Formatters ──
export const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatEtaShort = (sec) => {
  if (!sec) return '--';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

// ── Color Helpers ──
// Re-pointed at the semantic status tokens (tailwind.config.js -> index.css
// custom properties) instead of raw Tailwind palette colours, so a battery
// tier and an incident severity read as the same "warning" everywhere,
// including under the dark theme.
export const batteryColor = (tier) => {
  if (tier === 'green') return 'text-status-normal';
  if (tier === 'yellow') return 'text-status-warning';
  if (tier === 'orange') return 'text-status-urgent';
  return 'text-status-critical';
};

export const batteryBg = (tier) => {
  if (tier === 'green') return 'bg-status-normal';
  if (tier === 'yellow') return 'bg-status-warning';
  if (tier === 'orange') return 'bg-status-urgent';
  return 'bg-status-critical';
};

export const returnStatusColor = (s) => {
  if (s === 'SAFE') return 'text-status-normal';
  if (s === 'RETURN_RECOMMENDED') return 'text-status-warning';
  return 'text-status-critical';
};

export const severityColor = (s) => {
  if (s === 'critical') return 'text-status-critical border-status-critical/30 bg-status-critical/10 font-bold';
  if (s === 'high') return 'text-status-urgent border-status-urgent/30 bg-status-urgent/10';
  if (s === 'medium') return 'text-status-warning border-status-warning/30 bg-status-warning/10';
  return 'text-status-normal border-status-normal/30 bg-status-normal/10';
};

export const batteryTier = (level) => {
  if (level > 35) return 'green';
  if (level > 27) return 'yellow';
  if (level > 22) return 'orange';
  return 'red';
};

// ── Leaflet Icon Factories ──
export const policeStationIcon = L.divIcon({
  html: `<div class="flex items-center justify-center"><div class="h-6 w-6 bg-blue-600 border-2 border-white rounded-full shadow-md flex items-center justify-center"><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div></div>`,
  className: 'custom-police-icon', iconSize: [26, 26]
});

export const rapidBaseIcon = L.divIcon({
  html: `<div class="flex items-center justify-center"><div class="h-7 w-7 bg-slate-900 border-2 border-accent rounded-full shadow-lg flex items-center justify-center"><div class="h-2 w-2 bg-accent rounded-full"></div></div></div>`,
  className: 'custom-base-icon', iconSize: [28, 28]
});


const droneIconCache = new Map();
const incidentIconCache = new Map();
const HEADING_BUCKET_DEGREES = 15;

export const incidentIcon = (severity) => {
  const key = severity;
  const cached = incidentIconCache.get(key);
  if (cached) return cached;

  const fill = severity === 'critical' ? 'bg-status-critical' : severity === 'high' ? 'bg-status-urgent' : severity === 'medium' ? 'bg-status-warning' : 'bg-status-normal';
  const shape = severity === 'critical' ? 'rounded-sm' : 'rounded-full';
  const icon = L.divIcon({
    html: `<div class="flex items-center justify-center"><div class="h-5 w-5 ${fill} ${shape} border-2 border-white shadow-lg flex items-center justify-center"><span class="text-[9px] font-extrabold text-white">!</span></div></div>`,
    className: 'custom-incident-icon', iconSize: [22, 22]
  });
};

export const droneIcon = (heading, status) => {
  const bucket = Math.round(heading / HEADING_BUCKET_DEGREES) * HEADING_BUCKET_DEGREES % 360;
  const key = `${status}|${bucket}`;
  const cached = droneIconCache.get(key);
  if (cached) return cached;

  const color = status === 'Returning' ? '#A15C00' : status === 'Patrolling' ? '#A855F7' : ['Dispatched', 'En Route'].includes(status) ? '#1E3A8A' : '#2F6B3A';
  const icon = L.divIcon({
    html: `<div style="transform:rotate(${bucket}deg);transition:transform 0.2s linear;" class="flex items-center justify-center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M4 4l16 16M4 20L20 4" stroke="${color}" stroke-width="1.5" opacity="0.6"/><circle cx="4" cy="4" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><circle cx="20" cy="4" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><circle cx="4" cy="20" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><circle cx="20" cy="20" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><path d="M12 3L6 17l6-3.5 6 3.5z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`,
    className: 'custom-drone-icon', iconSize: [34, 34]
  });
};
