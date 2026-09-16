/**
 * RAPID Airspace — Airspace Manager
 *
 * Thin CRUD + lookup wrapper over db.airspaceZones, plus the one
 * helper every caller actually needs: "which zones apply to this
 * drone/state right now." Centralised here so routes/airspace.js,
 * rl/environment.js, routes/fleet.js, and the patrol planner don't
 * each re-derive it.
 */
const db = require('../../config/database');

const VALID_TYPES = ['no_fly', 'restricted', 'temporary_restriction', 'airport_protection', 'military_airspace', 'border_zone', 'protected_area', 'geofence'];
const VALID_LEVELS = ['absolute', 'conditional', 'advisory'];

function validateZoneInput(data) {
  if (!data.name) return 'name is required';
  if (!Array.isArray(data.polygon) || data.polygon.length < 3) return 'polygon must have at least 3 points';
  // Every consumer (isPointInPolygon, the map's Polygon layer) expects
  // {latitude, longitude} objects — not [lat, lng] pairs — per point.
  const badPoint = data.polygon.find(p => typeof p?.latitude !== 'number' || typeof p?.longitude !== 'number');
  if (badPoint) return 'each polygon point must be an object with numeric latitude and longitude';
  if (data.type && !VALID_TYPES.includes(data.type)) return `type must be one of: ${VALID_TYPES.join(', ')}`;
  if (data.restriction_level && !VALID_LEVELS.includes(data.restriction_level)) return `restriction_level must be one of: ${VALID_LEVELS.join(', ')}`;
  return null;
}

async function listZonesForState(stateId, { activeOnly = true } = {}) {
  return db.airspaceZones.list({ stateId, activeOnly });
}

async function createZone(data) {
  const error = validateZoneInput(data);
  if (error) throw new Error(error);
  return db.airspaceZones.create(data);
}

async function updateZone(id, updates) {
  const existing = await db.airspaceZones.get(id);
  if (!existing) throw new Error('Zone not found');
  if (updates.polygon || updates.type || updates.restriction_level) {
    const error = validateZoneInput({ ...existing, ...updates });
    if (error) throw new Error(error);
  }
  return db.airspaceZones.update(id, updates);
}

async function deactivateZone(id) {
  const existing = await db.airspaceZones.get(id);
  if (!existing) throw new Error('Zone not found');
  return db.airspaceZones.update(id, { active: false });
}

module.exports = { VALID_TYPES, VALID_LEVELS, listZonesForState, createZone, updateZone, deactivateZone };
