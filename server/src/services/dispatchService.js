const db = require('../config/database');
const websocketService = require('./websocketService');

/**
 * GIS Haversine formula — computes geodesic distance in metres between two lat/lng pairs.
 *
 * @param {number} lat1 - Latitude of point A  (° N, positive north)
 * @param {number} lon1 - Longitude of point A (° E, positive east)
 * @param {number} lat2 - Latitude of point B  (° N, positive north)
 * @param {number} lon2 - Longitude of point B (° E, positive east)
 * @returns {number} Distance in metres
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R  = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
  const dLon    = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let brng = Math.atan2(y, x);
  brng = (brng * 180) / Math.PI;
  return (brng + 360) % 360;
}

const CRUISING_SPEED_MPS = 15.0;

const dispatchService = {
  /**
   * Intelligent auto-dispatch using the RAPID Fleet Decision Engine.
   *
   * Uses full energy-feasibility evaluation and suitability scoring
   * rather than simple nearest-drone selection.
   *
   * Returns the full recommendation object for transparency.
   */
  async autoDispatch(incidentId) {
    const incident = await db.incidents.get(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    if (incident.status !== 'reported') {
      return { success: false, message: 'Incident is already assigned or processed' };
    }

    // Route through the RL environment's safety-checked recommendation
    // (lazy-require to avoid circular deps — environment.js itself
    // requires this file for getDistance). In LIVE mode this resolves to
    // the unmodified fleetDecisionEngine, filtered for no-fly-zone routes.
    const environment = require('../rl/environment');
    const recommendation = await environment.getConstrainedRecommendation(incidentId);

    // Log the full fleet decision for audit / future RL training data
    await db.dispatchLogs.create({
      incident_id: incidentId,
      drone_id:    recommendation.recommendation?.rakshakId || null,
      action:      'fleet_decision',
      notes:       `RAPID Fleet Decision Engine: ${recommendation.decision}. ${recommendation.reason || 'See evaluation data.'}`
    });

    if (recommendation.decision === 'NO_SAFE_RAKSHAK_AVAILABLE') {
      console.log(`Dispatch: No safe Rakshak available for "${incident.title}".`);
      return {
        success:      false,
        message:      recommendation.reason || 'No safe Rakshak available. Insufficient battery or all units active.',
        recommendation
      };
    }

    const best = recommendation.recommendation;
    const drone = await db.drones.get(best.rakshakId);
    if (!drone) {
      return { success: false, message: 'Selected Rakshak not found in database.' };
    }

    const bearing  = getBearing(drone.latitude, drone.longitude, incident.latitude, incident.longitude);
    const etaMin   = Math.floor(best.etaSeconds / 60);
    const etaSec   = best.etaSeconds % 60;

    console.log(`\nRAPID Fleet Decision Engine — Dispatch:`);
    console.log(`   Incident:   "${incident.title}" [${incident.severity.toUpperCase()}]`);
    console.log(`   Location:   [${incident.latitude.toFixed(4)}°N, ${incident.longitude.toFixed(4)}°E]`);
    console.log(`   Rakshak:    ${drone.call_sign} — Score: ${best.score}/100 (${best.suitabilityLabel})`);
    console.log(`   Distance:   ${best.distanceToIncidentKm.toFixed(2)} km`);
    console.log(`   ETA:        ~${etaMin}m ${etaSec}s`);
    console.log(`   Battery:    ${best.battery}% → Required: ${best.totalRequired}% → Surplus: ${best.surplusBattery}%`);
    console.log(`   Reason:     ${recommendation.reason}\n`);

    // Update drone state
    const dispatchedDrone = await db.drones.update(drone.id, {
      status:              'Dispatched',
      current_incident_id: incident.id,
      speed:               CRUISING_SPEED_MPS,
      altitude:            50.0
    });
    websocketService.broadcastDroneUpdate(dispatchedDrone);

    // Update incident state
    const dispatchedIncident = await db.incidents.update(incident.id, {
      status:            'dispatched',
      assigned_drone_id: drone.id
    });
    websocketService.broadcastIncidentUpdate(dispatchedIncident);

    // Open the experience tuple for this mission — closed out once the
    // drone completes its mission (see simulatorService.js).
    await environment.beginExperience(drone.id, {
      incidentId: incident.id,
      action: 'DISPATCH',
      shadowComparison: recommendation.shadowComparison || null
    });

    // Log dispatch with full energy context
    await db.dispatchLogs.create({
      incident_id: incident.id,
      drone_id:    drone.id,
      action:      'launch',
      notes:       `${drone.call_sign} dispatched. Bearing ${bearing.toFixed(0)}°. Distance: ${best.distanceToIncidentKm.toFixed(2)} km. ETA: ~${etaMin}m ${etaSec}s. Battery: ${best.battery}% (required: ${best.totalRequired}%, surplus: ${best.surplusBattery}%).`
    });

    return {
      success:        true,
      drone,
      recommendation,
      distanceMeters: best.distanceToIncidentM,
      bearingDeg:     bearing,
      etaSeconds:     best.etaSeconds
    };
  }
};

module.exports = { dispatchService, getDistance, getBearing };
