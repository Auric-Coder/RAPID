/**
 * RAPID RL — Safety / Constraint Validator
 *
 * These checks sit OUTSIDE any policy (heuristic today, learned later).
 * No policy — human-designed or trained — can recommend around them; the
 * dispatch path calls this directly and the mask it produces is the only
 * thing that decides whether an action is even offered as a candidate.
 *
 * Airspace geometry here is intentionally simple (point-in-polygon +
 * straight-line sampling) — just enough to make "cannot route through a
 * no-fly zone" a real, enforced constraint rather than a documented
 * intention. Full zone types, temporal validity and clearance workflows
 * live in Airspace Management.
 */

const energyCfg = require('../config/energyConfig');

const NON_DISPATCHABLE_STATUSES = [
  'maintenance', 'Dispatched', 'En Route', 'On Scene', 'AI Monitoring',
  'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller'
];

/**
 * Ray-casting point-in-polygon test.
 * @param {number} lat
 * @param {number} lng
 * @param {{latitude:number, longitude:number}[]} polygon
 */
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude, yi = polygon[i].latitude;
    const xj = polygon[j].longitude, yj = polygon[j].latitude;
    const intersect = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Approximates route-vs-polygon intersection by sampling points along the
 * straight-line path. Sufficient for the small demo NFZ polygons in this
 * prototype; a proper segment-polygon intersection is future work.
 */
function routeIntersectsNoFlyZone(fromLat, fromLng, toLat, toLng, noFlyZones) {
  const SAMPLES = 20;
  for (let s = 0; s <= SAMPLES; s++) {
    const t = s / SAMPLES;
    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;
    for (const zone of noFlyZones) {
      if (isPointInPolygon(lat, lng, zone.polygon)) return zone;
    }
  }
  return null;
}

/**
 * Can this drone be dispatched at all, independent of which incident?
 * Mirrors fleetDecisionEngine's checkEligibility battery/status floor —
 * duplicated intentionally rather than imported, so this validator has
 * no dependency on any specific policy's internals.
 */
function canDispatch(drone) {
  if (NON_DISPATCHABLE_STATUSES.includes(drone.status)) {
    return { allowed: false, reason: `${drone.status} — not dispatchable.` };
  }
  if (drone.battery_level <= energyCfg.SAFETY_RESERVE_PERCENT + 5) {
    return { allowed: false, reason: `Battery at or below safety floor (${drone.battery_level.toFixed(0)}%).` };
  }
  return { allowed: true, reason: null };
}

/**
 * Would the direct route from `drone` to `incident` cross an active
 * no-fly zone in the given list?
 */
function checkRouteAirspace(fromLat, fromLng, toLat, toLng, noFlyZones) {
  if (!noFlyZones || noFlyZones.length === 0) return { allowed: true, reason: null, zone: null };
  const zone = routeIntersectsNoFlyZone(fromLat, fromLng, toLat, toLng, noFlyZones);
  if (zone) return { allowed: false, reason: `Route crosses "${zone.name}" — absolute no-fly zone.`, zone };
  return { allowed: true, reason: null, zone: null };
}

module.exports = {
  NON_DISPATCHABLE_STATUSES,
  isPointInPolygon,
  routeIntersectsNoFlyZone,
  canDispatch,
  checkRouteAirspace
};
