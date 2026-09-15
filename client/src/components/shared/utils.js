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
export const batteryColor = (tier) => {
  if (tier === 'green') return 'text-emerald-400';
  if (tier === 'yellow') return 'text-yellow-400';
  if (tier === 'orange') return 'text-orange-400';
  return 'text-red-500';
};

export const batteryBg = (tier) => {
  if (tier === 'green') return 'bg-emerald-500';
  if (tier === 'yellow') return 'bg-yellow-500';
  if (tier === 'orange') return 'bg-orange-500';
  return 'bg-red-500';
};

export const returnStatusColor = (s) => {
  if (s === 'SAFE') return 'text-emerald-400';
  if (s === 'RETURN_RECOMMENDED') return 'text-yellow-400';
  return 'text-red-500 animate-pulse';
};

export const severityColor = (s) => {
  if (s === 'critical') return 'text-red-400 border-red-500/30 bg-red-500/10';
  if (s === 'high') return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
  if (s === 'medium') return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
  return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
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
  html: `<div class="flex items-center justify-center"><div class="h-7 w-7 bg-slate-900 border-2 border-cyan-400 rounded-full shadow-lg flex items-center justify-center relative"><div class="h-2 w-2 bg-cyan-400 rounded-full animate-ping"></div><div class="absolute h-1 w-1 bg-cyan-400 rounded-full"></div></div></div>`,
  className: 'custom-base-icon', iconSize: [28, 28]
});

// Both factories below build a brand-new L.divIcon() object every call, and
// were previously called directly from JSX on every render of RapidMap (one
// call per marker, per render) - a new icon identity makes react-leaflet
// tear down and rebuild that marker's DOM node, even when nothing about the
// marker actually changed. Measured: ~20 icon rebuilds/sec for 5 drones,
// ~67/sec for incidents, tracking the map's render rate rather than how
// often a drone's heading or an incident's severity actually changes.
//
// Fix: cache the constructed L.divIcon by its visual inputs. Icons are
// small, finite in variety (a handful of statuses/severities x heading
// buckets), and Leaflet icons are safe to reuse across multiple markers.
//
// Heading is continuous (0-359.99...), so caching by the exact float would
// never hit - two ticks are never bit-for-bit equal. It's rounded to the
// nearest 15 degrees (24 buckets) before use as a cache key. At 34px on
// screen a 15-degree difference in a static arrow icon is not visually
// distinguishable, so this changes no pixel a user would notice; it only
// stops rebuilding the icon for a heading change nobody can see.
const droneIconCache = new Map();
const incidentIconCache = new Map();
const HEADING_BUCKET_DEGREES = 15;

export const incidentIcon = (severity) => {
  const key = severity;
  const cached = incidentIconCache.get(key);
  if (cached) return cached;

  const color = severity === 'critical' ? 'bg-red-500 animate-pulse' : severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500';
  const ring = severity === 'critical' ? 'border-red-500' : severity === 'high' ? 'border-orange-500' : 'border-yellow-500';
  const icon = L.divIcon({
    html: `<div class="relative flex items-center justify-center"><div class="absolute h-8 w-8 ${ring} border rounded-full animate-ping opacity-60"></div><div class="h-5 w-5 ${color} border-2 border-white rounded-full shadow-lg flex items-center justify-center"><span class="text-[9px] font-extrabold text-white">!</span></div></div>`,
    className: 'custom-incident-icon', iconSize: [22, 22]
  });
  incidentIconCache.set(key, icon);
  return icon;
};

export const droneIcon = (heading, status) => {
  const bucket = Math.round(heading / HEADING_BUCKET_DEGREES) * HEADING_BUCKET_DEGREES % 360;
  const key = `${status}|${bucket}`;
  const cached = droneIconCache.get(key);
  if (cached) return cached;

  const color = status === 'Returning' ? '#F59E0B' : status === 'Patrolling' ? '#A855F7' : ['Dispatched', 'En Route'].includes(status) ? '#06B6D4' : '#10B981';
  const icon = L.divIcon({
    html: `<div style="transform:rotate(${bucket}deg);transition:transform 0.2s linear;" class="flex items-center justify-center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M4 4l16 16M4 20L20 4" stroke="${color}" stroke-width="1.5" opacity="0.6"/><circle cx="4" cy="4" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><circle cx="20" cy="4" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><circle cx="4" cy="20" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><circle cx="20" cy="20" r="2.5" fill="${color}" stroke="white" stroke-width="1"/><path d="M12 3L6 17l6-3.5 6 3.5z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`,
    className: 'custom-drone-icon', iconSize: [34, 34]
  });
  droneIconCache.set(key, icon);
  return icon;
};
