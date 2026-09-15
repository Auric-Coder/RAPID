/**
 * RAPID Agent Tool — check_airspace_clearance
 *
 * Wraps airspace/conflictDetector.checkRoute — the existing deterministic
 * no-fly-zone check — for one specific drone/incident pair, bound via
 * closure for the same reason as dispatchRecommendation.js. Reuses
 * rl/environment.js's resolveStateCodeForBase/activeZonesForStateCode
 * (the same zone-resolution logic getConstrainedRecommendation() already
 * uses) rather than re-deriving it.
 */
const environment = require('../../rl/environment');
const conflictDetector = require('../../services/airspace/conflictDetector');
const db = require('../../config/database');

function createAirspaceClearanceTool({ droneId, incidentId }) {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'check_airspace_clearance',
        description: "Check whether the route from the recommended drone's current position to the incident crosses any active no-fly zone. This is the authoritative airspace safety check — never guess whether a route is clear.",
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    async execute() {
      const [drone, incident] = await Promise.all([db.drones.get(droneId), db.incidents.get(incidentId)]);
      if (!drone || !incident) return { error: 'Drone or incident not found for airspace check.' };

      const stateCode = await environment.resolveStateCodeForBase(drone.base_id);
      const zones = await environment.activeZonesForStateCode(stateCode);
      return conflictDetector.checkRoute(drone.latitude, drone.longitude, incident.latitude, incident.longitude, zones);
    }
  };
}

module.exports = { createAirspaceClearanceTool };
