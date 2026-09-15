/**
 * RAPID — Client-Side Geographic Utilities
 *
 * v1.3 Phase 1: This file used to duplicate the server's geography
 * (RAPID_BASES, POLICE_STATIONS, NO_FLY_ZONES, MAP_CENTER/ZOOM) —
 * that data is now fetched from /api/geo/* (see store/rapidStore.js
 * `fetchGeoConfig()`), which removed the drift risk between the two
 * copies. Only pure, geometry-only helpers with no state remain here.
 */

// ============================================================
// CLIENT-SIDE HAVERSINE UTILITY
// Calculates geodesic distance in metres between two [lat, lng] points.
// Used for ETA calculation in the Dashboard Mission Control panel.
// ============================================================
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R  = 6371e3; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// FORMAT ETA as "Xm Ys" string from seconds
// ============================================================
export function formatEta(seconds) {
  if (!seconds || seconds <= 0) return '< 1s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}
