/**
 * RAPID — Centralized Energy Model Configuration
 *
 * ALL energy constants must be imported from here.
 * DO NOT scatter energy values across route/service files.
 *
 * Clearly labeled: SIMULATED ENERGY MODEL
 * This is a prototype approximation, not measured hardware telemetry.
 *
 * Units:
 *   Energy values  = percent of total battery (%)
 *   Distance       = kilometres (km)
 *   Time           = minutes (min) or seconds (sec) where noted
 */

// ============================================================
// FLIGHT ENERGY CONSUMPTION (SIMULATED)
// ============================================================

/**
 * Battery % consumed per km of cruising flight.
 * Approximation for a ~3kg police surveillance quadcopter at 54 km/h.
 * Real value depends on wind, payload, altitude — this is prototype-only.
 */
const CRUISE_ENERGY_PER_KM = 2.5;  // % per km

/**
 * Battery % consumed per km of return flight.
 * Same as cruise for this prototype — real systems may differ (headwind etc.)
 */
const RETURN_ENERGY_PER_KM = 2.5;  // % per km

/**
 * Battery % consumed per minute while hovering on scene.
 * Lower than cruising — drone maintains altitude with minimal movement.
 */
const HOVER_ENERGY_PER_MIN = 0.8;  // % per minute

/**
 * Expected on-scene surveillance time used for mission viability pre-check.
 * Used only in go/no-go calculation — not a hard limit.
 */
const EXPECTED_ON_SCENE_MIN = 10;  // minutes

/**
 * Minimum battery reserve that must always remain available for safe return.
 * A drone must not accept a mission if it cannot maintain this reserve.
 * This is the hard floor — not a preference.
 */
const SAFETY_RESERVE_PERCENT = 20;  // %

/**
 * Battery level threshold for emitting LOW BATTERY warnings.
 * Below this the system recommends Return Home (controller decides).
 */
const LOW_BATTERY_WARN_PERCENT = 35;  // %

/**
 * Battery level at which an automatic safety return is triggered.
 * This overrides controller hold (critical safety override).
 */
const CRITICAL_BATTERY_PERCENT = 22;  // %

/**
 * Battery % per second drain during cruise flight (used in simulator tick).
 * Derived from CRUISE_ENERGY_PER_KM × CRUISING_SPEED_MPS / 1000
 *   = 2.5 × 15 / 1000 = 0.0375 % per second
 * Rounded to 0.04 for clean simulation.
 */
const CRUISE_DRAIN_PER_SECOND = 0.04;  // %/sec (at 15 m/s)

/**
 * Battery % per second drain while hovering.
 * Derived from HOVER_ENERGY_PER_MIN / 60 = 0.8 / 60 ≈ 0.0133
 */
const HOVER_DRAIN_PER_SECOND = 0.013;  // %/sec

/**
 * Battery % per second drain during return flight.
 * Same speed assumption as cruise.
 */
const RETURN_DRAIN_PER_SECOND = 0.04;  // %/sec

// ============================================================
// FLEET DECISION SCORING WEIGHTS
// ============================================================
// These weights control how the suitability score is composed.
// Total of weights is not required to sum to 1 — scores are normalised.
// Higher weight = that factor has more influence on candidate ranking.

const SCORE_WEIGHTS = {
  responseTime:       0.35,  // Lower ETA → higher score (most important)
  batteryFeasibility: 0.30,  // More surplus after mission → higher score
  returnFeasibility:  0.20,  // Can safely return? (binary with gradient)
  incidentPriority:   0.10,  // Critical > High > Medium > Low
  availability:       0.05   // Standby preferred over Returning
};

// Priority multipliers for incident urgency weighting
const PRIORITY_MULTIPLIERS = {
  critical: 1.00,
  high:     0.75,
  medium:   0.50,
  low:      0.25
};

// ============================================================
// MISSION ENERGY CALCULATOR
// ============================================================

/**
 * Calculate full mission energy requirement for a drone → incident mission.
 *
 * @param {number} distToIncidentKm  - Distance from drone to incident (km)
 * @param {number} distToBaseKm      - Distance from incident to home base (km)
 * @param {number} onSceneMin        - Expected on-scene time (minutes)
 * @returns {{
 *   energyToIncident: number,
 *   energyOnScene: number,
 *   energyToReturn: number,
 *   safetyReserve: number,
 *   totalRequired: number
 * }}
 */
function calculateMissionEnergy(distToIncidentKm, distToBaseKm, onSceneMin = EXPECTED_ON_SCENE_MIN) {
  const energyToIncident = distToIncidentKm * CRUISE_ENERGY_PER_KM;
  const energyOnScene    = onSceneMin * HOVER_ENERGY_PER_MIN;
  const energyToReturn   = distToBaseKm * RETURN_ENERGY_PER_KM;
  const safetyReserve    = SAFETY_RESERVE_PERCENT;
  const totalRequired    = energyToIncident + energyOnScene + energyToReturn + safetyReserve;

  return {
    energyToIncident: parseFloat(energyToIncident.toFixed(1)),
    energyOnScene:    parseFloat(energyOnScene.toFixed(1)),
    energyToReturn:   parseFloat(energyToReturn.toFixed(1)),
    safetyReserve,
    totalRequired:    parseFloat(totalRequired.toFixed(1))
  };
}

/**
 * Calculate live return energy requirement from current position to base.
 * Used in the simulator and UI for real-time "Can it return?" display.
 *
 * @param {number} currentBattery    - Current battery level (%)
 * @param {number} distToBaseKm      - Current drone → base distance (km)
 * @returns {{
 *   returnRequired: number,
 *   projectedRemaining: number,
 *   status: 'SAFE' | 'RETURN_RECOMMENDED' | 'CRITICAL'
 * }}
 */
function calculateReturnFeasibility(currentBattery, distToBaseKm) {
  const returnRequired      = parseFloat((distToBaseKm * RETURN_ENERGY_PER_KM).toFixed(1));
  const projectedRemaining  = parseFloat((currentBattery - returnRequired).toFixed(1));

  let status;
  if (projectedRemaining >= SAFETY_RESERVE_PERCENT) {
    status = 'SAFE';
  } else if (projectedRemaining >= 0) {
    status = 'RETURN_RECOMMENDED';
  } else {
    status = 'CRITICAL';
  }

  return { returnRequired, projectedRemaining, status };
}

/**
 * Determine battery colour tier for UI display.
 * @param {number} battery - Current battery %
 * @returns {'green' | 'yellow' | 'orange' | 'red'}
 */
function batteryTier(battery) {
  if (battery > LOW_BATTERY_WARN_PERCENT)   return 'green';
  if (battery > CRITICAL_BATTERY_PERCENT + 5) return 'yellow';
  if (battery > CRITICAL_BATTERY_PERCENT)   return 'orange';
  return 'red';
}

module.exports = {
  // Constants
  CRUISE_ENERGY_PER_KM,
  RETURN_ENERGY_PER_KM,
  HOVER_ENERGY_PER_MIN,
  EXPECTED_ON_SCENE_MIN,
  SAFETY_RESERVE_PERCENT,
  LOW_BATTERY_WARN_PERCENT,
  CRITICAL_BATTERY_PERCENT,
  CRUISE_DRAIN_PER_SECOND,
  HOVER_DRAIN_PER_SECOND,
  RETURN_DRAIN_PER_SECOND,
  SCORE_WEIGHTS,
  PRIORITY_MULTIPLIERS,
  // Functions
  calculateMissionEnergy,
  calculateReturnFeasibility,
  batteryTier
};
