/**
 * RAPID Surveillance — Patrol Planner (Phase 5)
 *
 * Waypoint sequencing for the four patrol patterns from architecture
 * Section 5.1. Missions without explicit waypoints get them generated
 * from their zone's polygon: `grid` sweeps the zone's bounding box in
 * a boustrophedon (back-and-forth row) pattern filtered to points
 * actually inside the polygon; `linear`/`circular` walk the polygon's
 * own vertices as a perimeter route; `random` picks a single fresh
 * random in-polygon point each time the drone arrives at its target.
 *
 * No @turf/turf dependency — the point-in-polygon test already exists
 * in rl/constraintValidator.js (ray casting) and that's all this needs;
 * a bounding-box + filter is enough for a boustrophedon sweep without
 * pulling in a geometry library.
 */
const constraintValidator = require('../../rl/constraintValidator');
const { getDistance, getBearing } = require('../dispatchService');

const ARRIVAL_THRESHOLD_M = 15;

function boundingBox(polygon) {
  const lats = polygon.map(p => p.latitude);
  const lngs = polygon.map(p => p.longitude);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

function generateGridWaypoints(polygon, rows = 3, cols = 3) {
  const { minLat, maxLat, minLng, maxLng } = boundingBox(polygon);
  const points = [];
  for (let r = 0; r < rows; r++) {
    const lat = minLat + ((r + 0.5) / rows) * (maxLat - minLat);
    const colOrder = r % 2 === 0 ? [...Array(cols).keys()] : [...Array(cols).keys()].reverse(); // boustrophedon
    for (const c of colOrder) {
      const lng = minLng + ((c + 0.5) / cols) * (maxLng - minLng);
      if (constraintValidator.isPointInPolygon(lat, lng, polygon)) {
        points.push({ latitude: lat, longitude: lng, altitude: 60, loiter_time_s: 10 });
      }
    }
  }
  if (points.length > 0) return points;
  return [{ latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, altitude: 60, loiter_time_s: 10 }];
}

function randomPointInPolygon(polygon) {
  const { minLat, maxLat, minLng, maxLng } = boundingBox(polygon);
  for (let attempt = 0; attempt < 20; attempt++) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    if (constraintValidator.isPointInPolygon(lat, lng, polygon)) {
      return { latitude: lat, longitude: lng, altitude: 60, loiter_time_s: 8 };
    }
  }
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, altitude: 60, loiter_time_s: 8 };
}

/**
 * Resolves the waypoint list a mission should actually fly, generating
 * one from the zone polygon if the mission wasn't given explicit
 * waypoints at creation time.
 */
function resolveWaypoints(mission, zonePolygon) {
  if (mission.waypoints && mission.waypoints.length > 0) return mission.waypoints;
  if (!zonePolygon) return [];
  if (mission.patrol_pattern === 'grid') return generateGridWaypoints(zonePolygon);
  if (mission.patrol_pattern === 'random') return [randomPointInPolygon(zonePolygon)];
  // linear / circular with no explicit waypoints: patrol the zone's own perimeter.
  return zonePolygon.map(p => ({ latitude: p.latitude, longitude: p.longitude, altitude: 60, loiter_time_s: 5 }));
}

/**
 * Given a mission that just reached its current target, compute the
 * next {index, direction} per its pattern. 'random' always resolves to
 * a single-element waypoint list, so its "next index" is trivially 0 —
 * the caller regenerates the actual point via randomPointInPolygon().
 */
function advanceIndex(mission, waypointCount) {
  const idx = mission.current_waypoint_index || 0;
  const dir = mission.waypoint_direction || 1;
  if (waypointCount <= 1) return { index: 0, direction: 1 };

  if (mission.patrol_pattern === 'linear') {
    let next = idx + dir;
    let nextDir = dir;
    if (next >= waypointCount) { next = waypointCount - 2 >= 0 ? waypointCount - 2 : 0; nextDir = -1; }
    else if (next < 0) { next = Math.min(1, waypointCount - 1); nextDir = 1; }
    return { index: next, direction: nextDir };
  }
  // 'circular' and 'grid' both walk their (already-ordered) waypoint
  // list in a loop; 'random' ignores the returned index.
  return { index: (idx + 1) % waypointCount, direction: dir };
}

/** Advance one simulation step toward a target point. Mirrors simulatorService.js's stepTowards. */
function stepTowards(currLat, currLng, targetLat, targetLng, stepMeters) {
  const distance = getDistance(currLat, currLng, targetLat, targetLng);
  const heading = getBearing(currLat, currLng, targetLat, targetLng);
  if (distance <= ARRIVAL_THRESHOLD_M) {
    return { lat: targetLat, lng: targetLng, reached: true, heading };
  }
  const ratio = stepMeters / distance;
  return { lat: currLat + (targetLat - currLat) * ratio, lng: currLng + (targetLng - currLng) * ratio, reached: false, heading };
}

module.exports = { generateGridWaypoints, randomPointInPolygon, resolveWaypoints, advanceIndex, stepTowards };
