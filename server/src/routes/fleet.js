const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { getDistance } = require('../services/dispatchService');
const energyCfg = require('../config/energyConfig');
const { evaluateFleet, generateRecommendation, evaluateReassignment } = require('../services/fleetDecisionEngine');
const websocketService = require('../services/websocketService');
const environment = require('../rl/environment');
const conflictDetector = require('../services/airspace/conflictDetector');
const { resolveAllowedBaseIds } = require('../services/auth/scopeResolver');
const { requireRole } = require('../middleware/auth');

// Roles trusted to override the fleet decision engine's recommendation.
// Matches the architecture's role table (DISPATCHER: "dispatch + override");
// OPERATOR is included too — the seed data doesn't have a dedicated
// DISPATCHER account, and OBSERVER (view-only) is correctly excluded.
const DISPATCH_ROLES = ['NATIONAL_COMMANDER', 'STATE_COMMANDER', 'DISTRICT_COMMANDER', 'BASE_COMMANDER', 'DISPATCHER', 'OPERATOR'];

/**
 * RAPID Fleet Intelligence Routes — Command 3
 *
 * Provides fleet evaluation, energy status, dispatch decisions,
 * and controller override logging.
 *
 * LABEL: "RAPID Fleet Decision Engine"
 * This is deterministic decision-support, NOT reinforcement learning.
 */

// ─────────────────────────────────────────────────────────
// Fleet Status
// ─────────────────────────────────────────────────────────

/**
 * GET /api/fleet/status
 * Returns all drones with live energy/return feasibility status.
 */
router.get('/status', async (req, res) => {
  try {
    const allDrones = await db.drones.list();
    const allowedBaseIds = new Set(await resolveAllowedBaseIds(req.user));
    const drones = allDrones.filter(d => allowedBaseIds.has(d.base_id));
    const statusList = drones.map(drone => {
      const distToBaseKm = getDistance(
        drone.latitude, drone.longitude,
        drone.base_latitude, drone.base_longitude
      ) / 1000;

      const returnFeasibility = energyCfg.calculateReturnFeasibility(
        drone.battery_level, distToBaseKm
      );

      return {
        id:            drone.id,
        callSign:      drone.call_sign,
        model:         drone.model,
        status:        drone.status,
        battery:       parseFloat(drone.battery_level.toFixed(1)),
        batteryTier:   energyCfg.batteryTier(drone.battery_level),
        latitude:      drone.latitude,
        longitude:     drone.longitude,
        altitude:      drone.altitude,
        speed:         drone.speed,
        heading:       drone.heading,
        currentMissionId: drone.current_incident_id,
        distToBaseKm:  parseFloat(distToBaseKm.toFixed(2)),
        returnRequired:    returnFeasibility.returnRequired,
        projectedAfterReturn: returnFeasibility.projectedRemaining,
        returnStatus:  returnFeasibility.status,
        safetyReserve: energyCfg.SAFETY_RESERVE_PERCENT
      };
    });

    res.json(statusList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// Fleet Evaluation for an Incident
// ─────────────────────────────────────────────────────────

/**
 * GET /api/fleet/evaluation/:incidentId
 * Returns a full fleet candidate ranking for a specific incident.
 * Shows WHY each Rakshak was selected or rejected.
 */
router.get('/evaluation/:incidentId', async (req, res) => {
  try {
    const incident = await db.incidents.get(req.params.incidentId);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const result = await evaluateFleet(req.params.incidentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fleet/recommendation/:incidentId
 * Returns a complete dispatch recommendation object for an incident.
 */
router.get('/recommendation/:incidentId', async (req, res) => {
  try {
    const incident = await db.incidents.get(req.params.incidentId);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const recommendation = await generateRecommendation(req.params.incidentId);
    res.json(recommendation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// Controller Override
// ─────────────────────────────────────────────────────────

/**
 * POST /api/fleet/override
 * Logs a controller override of the fleet recommendation.
 *
 * Body: {
 *   incidentId, recommendedRakshakId, selectedRakshakId,
 *   reason, force (bool — for unsafe overrides)
 * }
 */
router.post('/override', requireRole(...DISPATCH_ROLES), async (req, res) => {
  try {
    const { incidentId, recommendedRakshakId, selectedRakshakId, reason, force } = req.body;

    if (!incidentId || !selectedRakshakId) {
      return res.status(400).json({ error: 'incidentId and selectedRakshakId are required.' });
    }

    const incident = await db.incidents.get(incidentId);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const selectedDrone = await db.drones.get(selectedRakshakId);
    if (!selectedDrone) return res.status(404).json({ error: 'Selected Rakshak not found' });

    // Check if the selected drone is viable
    const fleetResult = await evaluateFleet(incidentId);
    const selectedCandidate = fleetResult.ranked.find(c => c.droneId === selectedRakshakId);

    if (!selectedCandidate) {
      return res.status(400).json({ error: 'Selected Rakshak not found in fleet evaluation.' });
    }

    // Phase 5: airspace is a hard constraint (absolute/conditional
    // zones) — unlike the battery check below, no force flag can
    // bypass a blocked route. Zones come from db.airspaceZones (Phase
    // 5's live source of truth), not static config.
    const droneStateCode = await environment.resolveStateCodeForBase(selectedDrone.base_id);
    const droneState = droneStateCode ? await db.states.get(droneStateCode) : null;
    const droneZones = droneState ? await db.airspaceZones.list({ stateId: droneState.id, activeOnly: true }) : [];
    const airspaceCheck = conflictDetector.checkRoute(
      selectedDrone.latitude, selectedDrone.longitude, incident.latitude, incident.longitude, droneZones
    );
    if (!airspaceCheck.clear) {
      return res.status(409).json({
        blocked: true,
        message: `BLOCKED: ${airspaceCheck.reason} This is a hard safety constraint and cannot be overridden.`,
        zone: airspaceCheck.zone?.name || null
      });
    }

    // Warn if unsafe — allow only with force flag
    if (!selectedCandidate.canComplete && !force) {
      return res.status(409).json({
        warning: true,
        message: `WARNING: ${selectedDrone.call_sign} cannot safely complete this mission. Estimated energy insufficient for safe return.`,
        candidate: selectedCandidate,
        requiresForce: true
      });
    }

    // Log controller override
    await db.controllerActions.create({
      mission_id:  incidentId,
      drone_id:    selectedRakshakId,
      rakshak_id:  selectedDrone.call_sign,
      action:      'controller_override',
      parameters: {
        recommendedRakshakId,
        selectedRakshakId,
        incidentId,
        force: !!force,
        safeOverride: selectedCandidate.canComplete
      },
      result: force && !selectedCandidate.canComplete ? 'forced_unsafe' : 'ok'
    });

    await db.dispatchLogs.create({
      incident_id: incidentId,
      drone_id:    selectedRakshakId,
      action:      'control',
      notes: `Controller override: ${selectedDrone.call_sign} manually selected${force && !selectedCandidate.canComplete ? ' (FORCED — energy insufficient)' : ''}. Recommended was ${recommendedRakshakId || 'N/A'}. Reason: ${reason || 'Manual selection'}.`
    });

    // Execute the override dispatch
    const overriddenDrone = await db.drones.update(selectedRakshakId, {
      status:              'Dispatched',
      current_incident_id: incidentId,
      speed:               15.0,
      altitude:            50.0
    });
    websocketService.broadcastDroneUpdate(overriddenDrone);

    const overriddenIncident = await db.incidents.update(incidentId, {
      status:            'dispatched',
      assigned_drone_id: selectedRakshakId
    });
    websocketService.broadcastIncidentUpdate(overriddenIncident);

    await environment.beginExperience(selectedRakshakId, { incidentId, action: 'DISPATCH', wasOverride: true });

    res.json({
      message:    'Controller override applied. Rakshak dispatched.',
      drone:      selectedDrone,
      candidate:  selectedCandidate,
      unsafe:     !selectedCandidate.canComplete,
      forced:     !!force
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// Dynamic Reassignment
// ─────────────────────────────────────────────────────────

/**
 * GET /api/fleet/reassignment-check/:droneId/:incidentId
 * Evaluates whether a returning drone can be redirected to a new incident.
 */
router.get('/reassignment-check/:droneId/:incidentId', async (req, res) => {
  try {
    const drone = await db.drones.get(req.params.droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const incident = await db.incidents.get(req.params.incidentId);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const result = evaluateReassignment(drone, incident);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fleet/reassign
 * Controller-approved reassignment of a returning drone to a new incident.
 *
 * Body: { droneId, newIncidentId }
 */
router.post('/reassign', requireRole(...DISPATCH_ROLES), async (req, res) => {
  try {
    const { droneId, newIncidentId } = req.body;
    if (!droneId || !newIncidentId) {
      return res.status(400).json({ error: 'droneId and newIncidentId are required.' });
    }

    const drone = await db.drones.get(droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const incident = await db.incidents.get(newIncidentId);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const reassignCheck = evaluateReassignment(drone, incident);

    if (!reassignCheck.viable) {
      return res.status(409).json({
        viable:  false,
        message: reassignCheck.reason,
        evaluation: reassignCheck.evaluation
      });
    }

    // Execute reassignment: update drone target and status
    const oldIncidentId = drone.current_incident_id;
    const reassignedDrone = await db.drones.update(droneId, {
      status:              'Dispatched',
      current_incident_id: newIncidentId
    });
    websocketService.broadcastDroneUpdate(reassignedDrone);

    const reassignedIncident = await db.incidents.update(newIncidentId, {
      status:            'dispatched',
      assigned_drone_id: droneId
    });
    websocketService.broadcastIncidentUpdate(reassignedIncident);

    // Phase 2: the drone's original mission never reached a clean outcome
    // (it was redirected mid-flight) — this replaces that pending tuple
    // with a fresh one for the new mission rather than trying to salvage it.
    await environment.beginExperience(droneId, { incidentId: newIncidentId, action: 'REASSIGN' });

    // Log reassignment event
    await db.dispatchLogs.create({
      incident_id: newIncidentId,
      drone_id:    droneId,
      action:      'launch',
      notes:       `Controller-approved reassignment: ${drone.call_sign} redirected from return path (prev incident: ${oldIncidentId?.slice(0, 8) || 'N/A'}) to new incident. Battery: ${drone.battery_level.toFixed(1)}%.`
    });

    await db.controllerActions.create({
      mission_id:  newIncidentId,
      drone_id:    droneId,
      rakshak_id:  drone.call_sign,
      action:      'reassignment_approved',
      parameters:  { oldIncidentId, newIncidentId },
      result:      'ok'
    });

    res.json({
      message:    'Reassignment approved and executed.',
      drone,
      newIncident: incident,
      evaluation:  reassignCheck.evaluation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// Fleet Decision History
// ─────────────────────────────────────────────────────────

/**
 * GET /api/fleet/decisions
 * Returns recent fleet/controller decisions from the log.
 */
router.get('/decisions', async (req, res) => {
  try {
    const drones = await db.drones.list();
    const allActions = [];

    for (const drone of drones) {
      const actions = await db.controllerActions.listForDrone(drone.id, 20);
      allActions.push(...actions);
    }

    // Sort by timestamp descending
    allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(allActions.slice(0, 100));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fleet/battery-status/:droneId
 * Returns live return-energy feasibility for a specific drone.
 */
router.get('/battery-status/:droneId', async (req, res) => {
  try {
    const drone = await db.drones.get(req.params.droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const distToBaseKm = getDistance(
      drone.latitude, drone.longitude,
      drone.base_latitude, drone.base_longitude
    ) / 1000;

    const returnFeasibility = energyCfg.calculateReturnFeasibility(drone.battery_level, distToBaseKm);

    let missionEnergy = null;
    if (drone.current_incident_id) {
      const incident = await db.incidents.get(drone.current_incident_id);
      if (incident) {
        const distToIncidentKm = getDistance(
          drone.latitude, drone.longitude,
          incident.latitude, incident.longitude
        ) / 1000;
        missionEnergy = energyCfg.calculateMissionEnergy(distToIncidentKm, distToBaseKm);
      }
    }

    res.json({
      droneId:         drone.id,
      callSign:        drone.call_sign,
      battery:         parseFloat(drone.battery_level.toFixed(1)),
      batteryTier:     energyCfg.batteryTier(drone.battery_level),
      distToBaseKm:    parseFloat(distToBaseKm.toFixed(2)),
      returnRequired:  returnFeasibility.returnRequired,
      projectedAfterReturn: returnFeasibility.projectedRemaining,
      returnStatus:    returnFeasibility.status,
      safetyReserve:   energyCfg.SAFETY_RESERVE_PERCENT,
      missionEnergy,
      energyModel:     'SIMULATED_ENERGY_MODEL'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
