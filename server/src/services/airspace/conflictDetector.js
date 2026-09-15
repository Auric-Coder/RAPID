/**
 * RAPID Airspace — Conflict Detector (Phase 5)
 *
 * Restriction-level-aware layer on top of rl/constraintValidator.js's
 * geometry primitives (point-in-polygon, route sampling) — reused
 * rather than duplicated, so there's exactly one implementation of the
 * actual math. This module adds the "what does a hit MEAN" semantics
 * from architecture Section 4.1:
 *   absolute    -> hard block, no override
 *   conditional -> blocked unless a clearance workflow exists (not
 *                  modelled yet — treated as blocked, same as absolute,
 *                  until a real clearance flow is built)
 *   advisory    -> route stays allowed, but a warning is attached
 */
const constraintValidator = require('../../rl/constraintValidator');

/**
 * @param {number} fromLat @param {number} fromLng
 * @param {number} toLat @param {number} toLng
 * @param {object[]} zones - active AirspaceZone records for the relevant state
 * @returns {{ clear: boolean, level: string|null, zone: object|null, reason: string|null }}
 */
function checkRoute(fromLat, fromLng, toLat, toLng, zones) {
  const activeZones = (zones || []).filter(z => z.active);
  if (activeZones.length === 0) return { clear: true, level: null, zone: null, reason: null };

  const hit = constraintValidator.routeIntersectsNoFlyZone(fromLat, fromLng, toLat, toLng, activeZones);
  if (!hit) return { clear: true, level: null, zone: null, reason: null };

  const zone = activeZones.find(z => z.name === hit.name) || hit;

  if (zone.restriction_level === 'advisory') {
    return { clear: true, level: 'advisory', zone, reason: `Advisory: route crosses "${zone.name}".` };
  }
  // 'absolute' and 'conditional' both block until a clearance workflow exists.
  return { clear: false, level: zone.restriction_level, zone, reason: `Route crosses "${zone.name}" (${zone.restriction_level}).` };
}

/**
 * @returns {object|null} the first active zone containing this point, if any.
 */
function findZoneContainingPoint(lat, lng, zones) {
  return (zones || []).filter(z => z.active).find(z => constraintValidator.isPointInPolygon(lat, lng, z.polygon)) || null;
}

module.exports = { checkRoute, findZoneContainingPoint };
