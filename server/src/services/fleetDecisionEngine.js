/**
 * RAPID Fleet Decision Engine
 * Command 3: Intelligent Dispatch & Dynamic Reassignment
 *
 * LABEL: "RAPID Fleet Decision Engine"
 * This is a deterministic, explainable decision-support system.
 * It is NOT reinforcement learning. It does NOT make autonomous decisions.
 * Every recommendation requires controller approval to execute.
 *
 * Algorithm:
 *   1. Retrieve all Rakshaks
 *   2. Filter: remove drones that cannot physically respond
 *   3. Evaluate: calculate energy feasibility for each viable candidate
 *   4. Score: compute weighted suitability score per candidate
 *   5. Rank: sort by score descending
 *   6. Select: pick top viable candidate
 *   7. Explain: attach human-readable reason to every decision
 *   8. Log: store state/action/decision for future RL training data
 */

const db = require('../config/database');
const { getDistance } = require('../services/dispatchService');
const energy = require('../config/energyConfig');

const CRUISING_SPEED_MPS = 15.0; // must match simulatorService.js

// ============================================================
// Candidate Rejection Logic
// ============================================================

/**
 * Determines whether a drone is eligible to respond to an incident.
 * Returns { eligible: bool, rejectionReason: string|null }
 */
function checkEligibility(drone) {
  if (drone.status === 'maintenance') {
    return { eligible: false, rejectionReason: 'In maintenance — not available for dispatch.' };
  }
  if (drone.status === 'Charging' && drone.battery_level < 30) {
    return { eligible: false, rejectionReason: `Charging — battery too low (${drone.battery_level.toFixed(0)}%).` };
  }
  if (['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller'].includes(drone.status)) {
    return { eligible: false, rejectionReason: `Already on active mission (${drone.status}).` };
  }
  if (drone.battery_level <= energy.SAFETY_RESERVE_PERCENT + 5) {
    return { eligible: false, rejectionReason: `Battery critically low (${drone.battery_level.toFixed(0)}%) — cannot safely complete any mission.` };
  }
  return { eligible: true, rejectionReason: null };
}

/**
 * Check if a Returning drone can be safely redirected to a new incident.
 */
function checkReturningEligibility(drone, incident) {
  if (drone.status !== 'Returning') {
    return { eligible: false, rejectionReason: 'Drone is not in Returning state.' };
  }
  if (drone.battery_level < energy.SAFETY_RESERVE_PERCENT + 15) {
    return { eligible: false, rejectionReason: `Battery too low for reassignment (${drone.battery_level.toFixed(0)}%).` };
  }
  return { eligible: true, rejectionReason: null };
}

// ============================================================
// Candidate Evaluation
// ============================================================

/**
 * Evaluate a single drone against an incident.
 * Returns a full candidate assessment object.
 *
 * @param {object} drone    - Drone record from DB
 * @param {object} incident - Incident record from DB
 * @param {boolean} isReturning - Whether to evaluate as returning candidate
 * @returns {object} Full candidate assessment
 */
function evaluateCandidate(drone, incident, isReturning = false) {
  // Geographic distances (metres → km)
  const distToIncidentM = getDistance(drone.latitude, drone.longitude, incident.latitude, incident.longitude);
  const distToBaseM     = getDistance(incident.latitude, incident.longitude, drone.base_latitude, drone.base_longitude);
  const distToIncidentKm = distToIncidentM / 1000;
  const distToBaseKm     = distToBaseM / 1000;

  // Time estimates
  const etaSeconds = Math.round(distToIncidentM / CRUISING_SPEED_MPS);

  // Energy model
  const missionEnergy = energy.calculateMissionEnergy(distToIncidentKm, distToBaseKm);
  const batteryFeasible = drone.battery_level >= missionEnergy.totalRequired;
  const surplusBattery  = parseFloat((drone.battery_level - missionEnergy.totalRequired).toFixed(1));

  // Return feasibility (from incident back to base)
  const returnFeasibility = energy.calculateReturnFeasibility(
    drone.battery_level - missionEnergy.energyToIncident - missionEnergy.energyOnScene,
    distToBaseKm
  );

  // Eligibility
  const { eligible, rejectionReason } = isReturning
    ? checkReturningEligibility(drone, incident)
    : checkEligibility(drone);

  const canComplete = eligible && batteryFeasible;

  // Suitability score (0–100, weighted, deterministic)
  let score = 0;
  if (canComplete) {
    // Response time component (faster = higher, normalised to 0–1 over 0–20min range)
    const etaNorm = Math.max(0, 1 - etaSeconds / 1200);
    // Battery surplus component (more surplus = higher)
    const battNorm = Math.min(1, Math.max(0, surplusBattery / 60));
    // Return feasibility component
    const returnNorm = returnFeasibility.status === 'SAFE' ? 1.0 : returnFeasibility.status === 'RETURN_RECOMMENDED' ? 0.4 : 0;
    // Incident priority component
    const priorityMult = energy.PRIORITY_MULTIPLIERS[incident.severity] || 0.5;
    // Availability component (Standby is best, Returning is secondary)
    const availNorm = isReturning ? 0.5 : 1.0;

    score = (
      etaNorm     * energy.SCORE_WEIGHTS.responseTime       * 100 +
      battNorm    * energy.SCORE_WEIGHTS.batteryFeasibility * 100 +
      returnNorm  * energy.SCORE_WEIGHTS.returnFeasibility  * 100 +
      priorityMult * energy.SCORE_WEIGHTS.incidentPriority  * 100 +
      availNorm   * energy.SCORE_WEIGHTS.availability       * 100
    );
    score = parseFloat(score.toFixed(1));
  }

  // Human-readable suitability label
  let suitabilityLabel = 'REJECTED';
  if (canComplete) {
    if (score >= 70) suitabilityLabel = 'HIGH';
    else if (score >= 45) suitabilityLabel = 'MEDIUM';
    else suitabilityLabel = 'LOW';
  }

  return {
    droneId:            drone.id,
    callSign:           drone.call_sign,
    model:              drone.model,
    status:             drone.status,
    battery:            parseFloat(drone.battery_level.toFixed(1)),
    distanceToIncidentM: parseFloat(distToIncidentM.toFixed(0)),
    distanceToIncidentKm: parseFloat(distToIncidentKm.toFixed(2)),
    distToBaseKm:       parseFloat(distToBaseKm.toFixed(2)),
    etaSeconds,
    energyToIncident:   missionEnergy.energyToIncident,
    energyOnScene:      missionEnergy.energyOnScene,
    energyToReturn:     missionEnergy.energyToReturn,
    safetyReserve:      missionEnergy.safetyReserve,
    totalRequired:      missionEnergy.totalRequired,
    surplusBattery,
    batteryFeasible,
    returnFeasibility:  returnFeasibility.status,
    returnRequired:     returnFeasibility.returnRequired,
    eligible,
    canComplete,
    rejectionReason,
    score,
    suitabilityLabel,
    isReturningCandidate: isReturning,
    batteryTier:        energy.batteryTier(drone.battery_level)
  };
}

// ============================================================
// Full Fleet Evaluation
// ============================================================

/**
 * Evaluate all Rakshaks against an incident, returning a ranked list.
 *
 * @param {string} incidentId
 * @returns {Promise<{ ranked: array, best: object|null, incidentId: string }>}
 */
async function evaluateFleet(incidentId) {
  const incident = await db.incidents.get(incidentId);
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const allDrones = await db.drones.list();
  const candidates = [];

  for (const drone of allDrones) {
    // Evaluate Standby/Charging candidates normally
    if (['Standby', 'Charging'].includes(drone.status)) {
      const eval_ = evaluateCandidate(drone, incident, false);
      candidates.push(eval_);
    }
    // Evaluate Returning drones as secondary candidates
    else if (drone.status === 'Returning') {
      const eval_ = evaluateCandidate(drone, incident, true);
      candidates.push(eval_);
    }
    // Active mission drones — mark as rejected (not preempted per spec)
    else {
      candidates.push({
        droneId:       drone.id,
        callSign:      drone.call_sign,
        model:         drone.model,
        status:        drone.status,
        battery:       parseFloat(drone.battery_level.toFixed(1)),
        eligible:      false,
        canComplete:   false,
        rejectionReason: `On active mission (${drone.status}) — not available.`,
        score:         0,
        suitabilityLabel: 'REJECTED',
        batteryTier:   energy.batteryTier(drone.battery_level),
        distanceToIncidentM: parseFloat(getDistance(drone.latitude, drone.longitude, incident.latitude, incident.longitude).toFixed(0)),
        distanceToIncidentKm: parseFloat((getDistance(drone.latitude, drone.longitude, incident.latitude, incident.longitude) / 1000).toFixed(2)),
        etaSeconds: null,
        isReturningCandidate: false
      });
    }
  }

  // Sort: viable first (by score desc), then rejected (by distance asc)
  const viable  = candidates.filter(c => c.canComplete).sort((a, b) => b.score - a.score);
  const rejected = candidates.filter(c => !c.canComplete).sort((a, b) => (a.distanceToIncidentM || 9e9) - (b.distanceToIncidentM || 9e9));
  const ranked  = [...viable, ...rejected];

  const best = viable.length > 0 ? viable[0] : null;

  return { ranked, best, incidentId, incidentSeverity: incident.severity };
}

// ============================================================
// Full Dispatch Recommendation
// ============================================================

/**
 * Generate a full recommendation object for the dispatcher/controller.
 *
 * @param {string} incidentId
 * @returns {Promise<object>} Recommendation with explanation
 */
async function generateRecommendation(incidentId) {
  const incident = await db.incidents.get(incidentId);
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const { ranked, best } = await evaluateFleet(incidentId);

  if (!best) {
    return {
      decision:     'NO_SAFE_RAKSHAK_AVAILABLE',
      reason:       'All Rakshaks are either on active missions, in maintenance, or lack sufficient battery for a safe return.',
      recommendation: null,
      allCandidates: ranked,
      incidentId,
      timestamp:    new Date().toISOString()
    };
  }

  // Build human-readable reason
  const etaMin = Math.floor(best.etaSeconds / 60);
  const etaSec = best.etaSeconds % 60;
  const reason = [
    `${best.callSign} is the best available energy-adjusted response option.`,
    `Distance: ${best.distanceToIncidentKm.toFixed(1)} km.`,
    `ETA: ${etaMin}m ${etaSec}s at 15 m/s.`,
    `Battery: ${best.battery}% → Required: ${best.totalRequired}% → Surplus: ${best.surplusBattery}%.`,
    `Return feasibility: ${best.returnFeasibility}.`,
    `Suitability score: ${best.score}/100 (${best.suitabilityLabel}).`
  ].join(' ');

  return {
    decision:     'RECOMMENDED',
    recommendation: {
      rakshakId:              best.droneId,
      callSign:               best.callSign,
      distanceToIncidentM:    best.distanceToIncidentM,
      distanceToIncidentKm:   best.distanceToIncidentKm,
      etaSeconds:             best.etaSeconds,
      battery:                best.battery,
      energyToIncident:       best.energyToIncident,
      energyOnScene:          best.energyOnScene,
      energyToReturn:         best.energyToReturn,
      safetyReserve:          best.safetyReserve,
      totalRequired:          best.totalRequired,
      surplusBattery:         best.surplusBattery,
      returnFeasibility:      best.returnFeasibility,
      score:                  best.score,
      suitabilityLabel:       best.suitabilityLabel
    },
    reason,
    allCandidates: ranked,
    incidentId,
    timestamp: new Date().toISOString()
  };
}

// ============================================================
// Dynamic Reassignment Evaluation
// ============================================================

/**
 * Evaluate whether a returning drone can be safely redirected to a new incident.
 * Used when a new incident appears and all Standby drones are unavailable.
 *
 * @param {object} drone    - The returning drone
 * @param {object} incident - The new incident
 * @returns {object} Reassignment evaluation
 */
function evaluateReassignment(drone, incident) {
  if (drone.status !== 'Returning') {
    return { viable: false, reason: 'Drone is not currently returning.' };
  }

  const eval_ = evaluateCandidate(drone, incident, true);

  if (!eval_.canComplete) {
    return {
      viable: false,
      reason: eval_.rejectionReason || 'Insufficient energy for safe reassignment.',
      evaluation: eval_
    };
  }

  const etaMin = Math.floor(eval_.etaSeconds / 60);
  const etaSec = eval_.etaSeconds % 60;

  return {
    viable: true,
    reason: `${drone.call_sign} can be safely redirected. ETA: ${etaMin}m ${etaSec}s. Battery surplus: ${eval_.surplusBattery}%.`,
    evaluation: eval_
  };
}

module.exports = {
  evaluateFleet,
  generateRecommendation,
  evaluateCandidate,
  evaluateReassignment,
  checkEligibility
};
