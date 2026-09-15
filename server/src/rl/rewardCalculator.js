/**
 * RAPID RL — Reward Calculator
 *
 * 13-component composite reward. Deliberately NOT "controller approved
 * = +1, overrode = -1" — most of the signal comes from measurable
 * operational outcomes; controller feedback is one component among many
 * (5% weight).
 *
 * Computed and stored with every experience tuple; trainer.js samples
 * these to update the neural policy's weights.
 */

const WEIGHTS = Object.freeze({
  responseTime: 0.20,
  missionCompletion: 0.15,
  incidentServiced: 0.15,
  safeOperation: 0.15,
  batteryEfficiency: 0.05,
  fleetCoverage: 0.10,
  successfulReturn: 0.05,
  unnecessaryDispatch: 0.05,
  missionFailure: 0.10,
  unsafeState: 0.10,
  coverageGap: 0.05,
  unnecessaryReassignment: 0.03,
  controllerCorrection: 0.05
});

/**
 * @param {object} outcome
 * @param {number|null} outcome.responseTimeSec
 * @param {boolean} outcome.missionCompleted
 * @param {boolean} outcome.incidentResolved
 * @param {number} outcome.safetyViolations
 * @param {number} outcome.batterySurplus
 * @param {number} outcome.fleetCoverageRatio - 0..1
 * @param {boolean} outcome.returnedSafely
 * @param {boolean} outcome.wasUnnecessary
 * @param {boolean} outcome.missionFailed
 * @param {number} outcome.unservedCriticalIncidents
 * @param {boolean} outcome.wasUnnecessaryReassignment
 * @param {boolean} outcome.controllerOverrode
 * @returns {{ total: number, components: Record<string, number> }}
 */
function compute(outcome = {}) {
  const components = {
    responseTime: WEIGHTS.responseTime * Math.max(0, 1 - (outcome.responseTimeSec ?? 1200) / 1200),
    missionCompletion: WEIGHTS.missionCompletion * (outcome.missionCompleted ? 1 : 0),
    incidentServiced: WEIGHTS.incidentServiced * (outcome.incidentResolved ? 1 : 0),
    safeOperation: WEIGHTS.safeOperation * ((outcome.safetyViolations ?? 0) === 0 ? 1 : 0),
    batteryEfficiency: WEIGHTS.batteryEfficiency * Math.max(0, (outcome.batterySurplus ?? 0) / 50),
    fleetCoverage: WEIGHTS.fleetCoverage * (outcome.fleetCoverageRatio ?? 0),
    successfulReturn: WEIGHTS.successfulReturn * (outcome.returnedSafely ? 1 : 0),
    unnecessaryDispatch: -WEIGHTS.unnecessaryDispatch * (outcome.wasUnnecessary ? 1 : 0),
    missionFailure: -WEIGHTS.missionFailure * (outcome.missionFailed ? 2 : 0),
    unsafeState: -WEIGHTS.unsafeState * (outcome.safetyViolations ?? 0),
    coverageGap: -WEIGHTS.coverageGap * (outcome.unservedCriticalIncidents ?? 0),
    unnecessaryReassignment: -WEIGHTS.unnecessaryReassignment * (outcome.wasUnnecessaryReassignment ? 0.5 : 0),
    controllerCorrection: -WEIGHTS.controllerCorrection * (outcome.controllerOverrode ? 0.3 : 0)
  };

  const total = Object.values(components).reduce((sum, v) => sum + v, 0);

  Object.keys(components).forEach(k => { components[k] = parseFloat(components[k].toFixed(4)); });

  return { total: parseFloat(total.toFixed(4)), components };
}

module.exports = { WEIGHTS, compute };
