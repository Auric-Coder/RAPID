/**
 * RAPID RL — MDP Environment (Phase 2)
 *
 * Ties the pieces together: builds the observation state, produces the
 * safety-checked recommendation dispatchService actually executes, and
 * records completed missions into the experience buffer.
 *
 * getState() intentionally omits fields the simulator doesn't model at
 * all (wind, weather) rather than fabricating numbers for them — see
 * inline notes.
 */
const db = require('../config/database');
const { getDistance } = require('../services/dispatchService');
const energyCfg = require('../config/energyConfig');
const actionSpace = require('./actionSpace');
const conflictDetector = require('../services/airspace/conflictDetector');
const rewardCalculator = require('./rewardCalculator');
const modeManager = require('./modeManager');
// Safe as a top-level require: heuristicPolicy only pulls in
// fleetDecisionEngine/dispatchService, neither of which reaches back into
// this file or modeManager, so no cycle (unlike neuralPolicy, which does
// require this file and must lazy-require it — see that file's note).
const heuristicPolicy = require('./policies/heuristicPolicy');

const ACTIVE_STATUSES = ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller', 'Returning', 'Patrolling'];

// Pending (state, action) halves of an experience tuple, keyed by drone
// id, until the mission's outcome is known (see completeExperience()).
const pendingByDrone = new Map();

async function resolveStateCodeForBase(baseId) {
  if (!baseId) return null;
  const base = await db.bases.get(baseId);
  if (!base) return null;
  const state = await db.states.get(base.state_id);
  return state ? state.code : null;
}

/**
 * Phase 5: zones now come from db.airspaceZones (the live, CRUD-able
 * source of truth seeded from geoConfig at startup) rather than
 * reading geoConfig directly — so zones created/edited after startup
 * via routes/airspace.js are actually enforced here, not decorative.
 */
async function activeZonesForStateCode(stateCode) {
  if (!stateCode) return [];
  const state = await db.states.get(stateCode);
  if (!state) return [];
  return db.airspaceZones.list({ stateId: state.id, activeOnly: true });
}

// actionSpace's mask is a simple binary "does this route cross a zone"
// check with no concept of restriction levels — advisory zones must be
// filtered out before reaching it, or they'd incorrectly block dispatch.
function blockingZonesOnly(zones) {
  return zones.filter(z => z.restriction_level !== 'advisory');
}

/**
 * getState() — the MDP observation from architecture Section 11.2,
 * scoped to what's actually computable from the current data model.
 */
async function getState() {
  const [drones, incidents, bases, airspaceZones] = await Promise.all([
    db.drones.list(), db.incidents.list(), db.bases.list(), db.airspaceZones.list({ activeOnly: true })
  ]);

  const fleet = drones.map((d) => {
    const distToBaseKm = getDistance(d.latitude, d.longitude, d.base_latitude, d.base_longitude) / 1000;
    const returnFeasibility = energyCfg.calculateReturnFeasibility(d.battery_level, distToBaseKm);
    return {
      id: d.id,
      position: { lat: d.latitude, lng: d.longitude, alt: d.altitude },
      battery: d.battery_level,
      status: d.status,
      speed: d.speed,
      heading: d.heading,
      currentMissionId: d.current_incident_id,
      baseId: d.base_id,
      basePosition: { lat: d.base_latitude, lng: d.base_longitude },
      distanceToBaseKm: parseFloat(distToBaseKm.toFixed(2)),
      returnFeasibility: returnFeasibility.status,
      cameraActive: ['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target'].includes(d.status)
    };
  });

  const activeIncidents = incidents.filter(i => !['resolved', 'cancelled'].includes(i.status));
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;

  return {
    fleet,
    incidents: activeIncidents.map(i => ({
      id: i.id,
      position: { lat: i.latitude, lng: i.longitude },
      category: i.category,
      severity: i.severity,
      ageSeconds: Math.floor((now - new Date(i.created_at)) / 1000),
      assignedDroneId: i.assigned_drone_id,
      status: i.status
    })),
    airspace: airspaceZones.map(z => ({
      id: z.id, name: z.name, type: z.type, restrictionLevel: z.restriction_level, polygon: z.polygon
    })),
    bases: bases.map(b => ({
      id: b.id,
      position: { lat: b.latitude, lng: b.longitude },
      availableDrones: fleet.filter(f => f.baseId === b.id && ['Standby', 'Charging'].includes(f.status)).length
    })),
    environment: {
      timeOfDay: parseFloat(hour.toFixed(2)),
      visibility: (hour < 6 || hour >= 19) ? 'night' : ((hour < 7 || hour >= 17) ? 'dusk' : 'day'),
      // Not modelled anywhere in this simulator yet — fixed placeholders
      // rather than fabricated readings. Populate for real once a
      // weather/wind source exists.
      weatherIndex: 0,
      windSpeedMps: 0
    },
    context: {
      recentIncidents1h: incidents.filter(i => (now - new Date(i.created_at)) < 3600000).length,
      activeMissions: drones.filter(d => ACTIVE_STATUSES.includes(d.status)).length,
      fleetUtilization: drones.length ? parseFloat((drones.filter(d => ACTIVE_STATUSES.includes(d.status)).length / drones.length).toFixed(2)) : 0,
      averageFleetBattery: drones.length ? parseFloat((drones.reduce((s, d) => s + d.battery_level, 0) / drones.length).toFixed(1)) : 0
    },
    timestamp: now.toISOString()
  };
}

/**
 * getValidActions(droneId, incidentId) — action mask for one candidate
 * pair. The actual safety math lives in actionSpace/constraintValidator;
 * this just resolves the drone's state so the right no-fly zones apply.
 */
async function getValidActions(droneId, incidentId) {
  const drone = droneId ? await db.drones.get(droneId) : null;
  const incident = incidentId ? await db.incidents.get(incidentId) : null;
  const stateCode = drone ? await resolveStateCodeForBase(drone.base_id) : null;
  const zones = await activeZonesForStateCode(stateCode);
  return actionSpace.getValidActions({ drone, incident, noFlyZones: blockingZonesOnly(zones) });
}

/**
 * getConstrainedRecommendation() — what dispatchService actually calls.
 * Runs the active policy (heuristic today), then applies the airspace
 * mask on top: if the top pick's route crosses a no-fly zone, the next
 * energy-feasible candidate is tried instead of grounding the fleet.
 */
async function getConstrainedRecommendation(incidentId) {
  const policy = modeManager.getActivePolicy();
  const recommendation = await policy.recommend(incidentId);

  // Phase 7: in EVALUATION mode the candidate policy (neural) is what
  // actually drives the recommendation, but we also compute what the
  // frozen heuristic would have picked — purely for comparison, never
  // to change the outcome. Mutated in place so it survives both the
  // early-return below and the reroute branch further down (which
  // spreads `...recommendation`).
  if (modeManager.getMode() === modeManager.MODES.EVALUATION && policy.name !== heuristicPolicy.name) {
    try {
      const shadow = await heuristicPolicy.recommend(incidentId);
      recommendation.shadowComparison = {
        heuristicRakshakId: shadow.recommendation?.rakshakId || null,
        heuristicCallSign: shadow.recommendation?.callSign || null,
        candidateRakshakId: recommendation.recommendation?.rakshakId || null,
        candidateCallSign: recommendation.recommendation?.callSign || null,
        agree: (shadow.recommendation?.rakshakId || null) === (recommendation.recommendation?.rakshakId || null)
      };
    } catch (err) {
      console.error('RL shadow comparison failed:', err.message);
    }
  }

  if (recommendation.decision !== 'RECOMMENDED') return recommendation;

  const incident = await db.incidents.get(incidentId);
  const viableCandidates = (recommendation.allCandidates || []).filter(c => c.canComplete);

  for (const candidate of viableCandidates) {
    const drone = await db.drones.get(candidate.droneId);
    if (!drone) continue;
    const stateCode = await resolveStateCodeForBase(drone.base_id);
    const zones = await activeZonesForStateCode(stateCode);
    const airspace = conflictDetector.checkRoute(
      drone.latitude, drone.longitude, incident.latitude, incident.longitude, zones
    );
    if (!airspace.clear) continue;

    if (candidate.droneId === recommendation.recommendation.rakshakId) {
      return recommendation; // fast path — top pick already clears
    }

    return {
      ...recommendation,
      recommendation: {
        rakshakId: candidate.droneId,
        callSign: candidate.callSign,
        distanceToIncidentM: candidate.distanceToIncidentM,
        distanceToIncidentKm: candidate.distanceToIncidentKm,
        etaSeconds: candidate.etaSeconds,
        battery: candidate.battery,
        energyToIncident: candidate.energyToIncident,
        energyOnScene: candidate.energyOnScene,
        energyToReturn: candidate.energyToReturn,
        safetyReserve: candidate.safetyReserve,
        totalRequired: candidate.totalRequired,
        surplusBattery: candidate.surplusBattery,
        returnFeasibility: candidate.returnFeasibility,
        score: candidate.score,
        suitabilityLabel: candidate.suitabilityLabel
      },
      reason: `${candidate.callSign} selected instead — the original top pick's route crossed a no-fly zone. ${recommendation.reason}`,
      airspaceRerouted: true
    };
  }

  return {
    decision: 'NO_SAFE_RAKSHAK_AVAILABLE',
    reason: 'All energy-feasible Rakshaks have routes that cross an active no-fly zone.',
    recommendation: null,
    allCandidates: recommendation.allCandidates,
    incidentId,
    timestamp: new Date().toISOString()
  };
}

/**
 * beginExperience() — call right after a drone is actually dispatched.
 * Snapshots the pre-mission state; the tuple is completed later once
 * the mission's outcome is known (see completeExperience()).
 */
async function beginExperience(droneId, { incidentId, action, wasOverride = false, shadowComparison = null }) {
  const state = await getState();
  pendingByDrone.set(droneId, { incidentId, action, wasOverride, shadowComparison, state, startedAt: Date.now() });
}

/**
 * completeExperience() — call once a mission's outcome is fully known
 * (simulatorService's Mission Complete handler). No-ops if no
 * beginExperience() was ever recorded for this drone (e.g. server
 * restarted mid-mission).
 */
async function completeExperience(droneId, outcome) {
  const pending = pendingByDrone.get(droneId);
  if (!pending) return null;
  pendingByDrone.delete(droneId);

  const nextState = await getState();
  const reward = rewardCalculator.compute(outcome);

  return db.experienceBuffer.create({
    state: pending.state,
    action: { type: pending.action, droneId, incidentId: pending.incidentId },
    reward: reward.total,
    rewardComponents: reward.components,
    outcome,
    nextState,
    controllerFeedback: pending.wasOverride ? { overrode: true } : null,
    shadowComparison: pending.shadowComparison || null
  });
}

module.exports = {
  getState,
  getValidActions,
  getConstrainedRecommendation,
  beginExperience,
  completeExperience,
  resolveStateCodeForBase
};
