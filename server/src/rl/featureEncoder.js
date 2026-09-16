/**
 * RAPID RL — Feature Encoder (Phase 7)
 *
 * Single source of truth for the fixed-size numeric feature vector the
 * neural policy trains and predicts on. Used from two places that must
 * stay on identical footing or the model learns garbage:
 *   - policies/neuralPolicy.js  (live inference, from a fleetDecisionEngine
 *     candidate object)
 *   - trainer.js (training, reconstructed from a stored experience-buffer
 *     state snapshot, which only has raw position/battery fields — not
 *     the derived distance/eta/energy fields a live candidate has)
 *
 * Both paths recompute the same formulas fleetDecisionEngine.evaluateCandidate
 * uses (getDistance + energyConfig), so the encoding is consistent whether
 * it's built from a live candidate or a replayed snapshot.
 */
const { getDistance } = require('../services/dispatchService');
const energyCfg = require('../config/energyConfig');

const CRUISING_SPEED_MPS = 15.0; // must match fleetDecisionEngine.js / simulatorService.js

const FEATURE_NAMES = [
  'etaNorm', 'battSurplusNorm', 'returnFeasibilityNorm', 'incidentPriorityNorm',
  'availabilityNorm', 'distanceKmNorm', 'droneBatteryNorm', 'fleetUtilization',
  'avgFleetBatteryNorm', 'timeOfDaySin', 'timeOfDayCos', 'isNight', 'recentIncidentsNorm'
];

const RETURN_FEASIBILITY_NORM = { SAFE: 1.0, RETURN_RECOMMENDED: 0.4 };

/**
 * @param {object} candidate - has etaSeconds, surplusBattery, returnFeasibility,
 *   distanceToIncidentKm, battery (same fields fleetDecisionEngine.evaluateCandidate returns)
 * @param {object} ctx
 * @param {string} ctx.incidentSeverity
 * @param {object} ctx.context - { fleetUtilization, averageFleetBattery, timeOfDay, visibility, recentIncidents1h }
 * @param {boolean} [ctx.isReturning]
 * @returns {number[]} feature vector, order matches FEATURE_NAMES
 */
function encodeCandidate(candidate, { incidentSeverity, context, isReturning = false }) {
  return [
    Math.max(0, 1 - (candidate.etaSeconds ?? 1200) / 1200),
    Math.min(1, Math.max(0, (candidate.surplusBattery ?? 0) / 60)),
    RETURN_FEASIBILITY_NORM[candidate.returnFeasibility] ?? 0,
    energyCfg.PRIORITY_MULTIPLIERS[incidentSeverity] ?? 0.5,
    isReturning ? 0.5 : 1.0,
    Math.min(1, (candidate.distanceToIncidentKm ?? 50) / 50),
    (candidate.battery ?? 0) / 100,
    context.fleetUtilization ?? 0,
    (context.averageFleetBattery ?? 0) / 100,
    Math.sin((2 * Math.PI * (context.timeOfDay ?? 12)) / 24),
    Math.cos((2 * Math.PI * (context.timeOfDay ?? 12)) / 24),
    context.visibility === 'night' ? 1 : 0,
    Math.min(1, (context.recentIncidents1h ?? 0) / 10)
  ];
}

/**
 * Reconstruct the feature vector for a stored experience-buffer entry
 * (an environment.getState() snapshot taken at dispatch time). Returns
 * null if the dispatched drone/incident aren't present in the snapshot
 * (shouldn't happen for a well-formed entry, but training data from an
 * evolving prototype is worth guarding defensively rather than crashing
 * a whole training pass over one bad row).
 */
function encodeFromExperience(entry) {
  const { state, action } = entry || {};
  if (!state || !action) return null;

  const drone = state.fleet?.find(f => f.id === action.droneId);
  const incident = state.incidents?.find(i => i.id === action.incidentId);
  if (!drone || !incident) return null;

  const distToIncidentM = getDistance(drone.position.lat, drone.position.lng, incident.position.lat, incident.position.lng);
  const distToIncidentKm = distToIncidentM / 1000;
  const etaSeconds = distToIncidentM / CRUISING_SPEED_MPS;
  const missionEnergy = energyCfg.calculateMissionEnergy(distToIncidentKm, drone.distanceToBaseKm);
  const surplusBattery = drone.battery - missionEnergy.totalRequired;

  const context = {
    fleetUtilization: state.context?.fleetUtilization,
    averageFleetBattery: state.context?.averageFleetBattery,
    timeOfDay: state.environment?.timeOfDay,
    visibility: state.environment?.visibility,
    recentIncidents1h: state.context?.recentIncidents1h
  };

  const candidate = {
    etaSeconds,
    surplusBattery,
    distanceToIncidentKm: distToIncidentKm,
    battery: drone.battery,
    returnFeasibility: drone.returnFeasibility
  };

  return encodeCandidate(candidate, { incidentSeverity: incident.severity, context });
}

module.exports = { FEATURE_NAMES, encodeCandidate, encodeFromExperience };
