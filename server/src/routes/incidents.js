const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { dispatchService } = require('../services/dispatchService');
const websocketService = require('../services/websocketService');
const { resolveAllowedStateIds } = require('../services/auth/scopeResolver');
const { OPERATING_AREAS } = require('../config/geoConfig');

// Incidents don't carry a state_id — they're scoped by whether their
// coordinates fall inside one of the caller's allowed states' bounds.
async function boundsForAllowedStates(user) {
  // One states.list() instead of one states.get() per allowed state. The
  // previous Promise.all made those reads concurrent but not fewer - still
  // N round trips under Supabase, on an endpoint the dashboard polls.
  const [stateIds, allStates] = await Promise.all([
    resolveAllowedStateIds(user),
    db.states.list({})
  ]);
  const allowed = new Set(stateIds);
  return allStates
    .filter(s => allowed.has(s.id))
    .map(s => OPERATING_AREAS.find(a => a.stateCode === s.code))
    .filter(Boolean)
    .map(a => a.bounds);
}

function isWithinAnyBounds(lat, lng, boundsList) {
  return boundsList.some(b => lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east);
}

// GET /api/incidents - List incidents within the caller's organisation + scope
router.get('/', async (req, res) => {
  try {
    const list = await db.incidents.list();
    const boundsList = await boundsForAllowedStates(req.user);
    res.json(list.filter(i => isWithinAnyBounds(i.latitude, i.longitude, boundsList)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/incidents - Create a new incident (supports dispatcher and citizen inputs)
router.post('/', async (req, res) => {
  try {
    const { title, description, category, severity, latitude, longitude, citizen_name, citizen_phone } = req.body;

    if (!title || !category || !latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required parameters: title, category, latitude, longitude' });
    }

    // 1. Create incident in DB
    const incident = await db.incidents.create({
      title,
      description,
      category,
      severity: severity || 'medium',
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      citizen_name,
      citizen_phone
    });

    console.log(`🚨 Incident Created: ${incident.title} [ID: ${incident.id}]`);
    websocketService.broadcastIncidentCreated(incident);

    // 2. Trigger auto-dispatch algorithm
    let dispatchResult = null;
    try {
      dispatchResult = await dispatchService.autoDispatch(incident.id);
    } catch (dispatchErr) {
      console.error(`⚠️ Dispatch failed: ${dispatchErr.message}`);
    }

    res.status(201).json({
      message: 'Incident reported successfully',
      incident,
      dispatch: dispatchResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/:id - Fetch single incident
router.get('/:id', async (req, res) => {
  try {
    const incident = await db.incidents.get(req.params.id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/incidents/:id - Update incident details / resolve / cancel
router.patch('/:id', async (req, res) => {
  try {
    const { status, description, severity } = req.body;
    const incidentId = req.params.id;

    const currentIncident = await db.incidents.get(incidentId);
    if (!currentIncident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (description) updates.description = description;
    if (severity) updates.severity = severity;

    if (status === 'resolved' || status === 'cancelled') {
      updates.resolved_at = new Date().toISOString();
    }

    const updated = await db.incidents.update(incidentId, updates);
    websocketService.broadcastIncidentUpdate(updated);

    // If incident resolved/cancelled, let drone await manual return home as per requirements
    if ((status === 'resolved' || status === 'cancelled') && currentIncident.assigned_drone_id) {
      const drone = await db.drones.get(currentIncident.assigned_drone_id);
      if (drone && drone.status !== 'Standby' && drone.status !== 'Returning') {
        console.log(`ℹ️ Incident Resolved: Drone ${drone.call_sign} on scene. Awaiting manual Return Home command.`);

        const updatedDrone = await db.drones.update(drone.id, {
          status: 'Awaiting Controller'
        });
        websocketService.broadcastDroneUpdate(updatedDrone);

        await db.dispatchLogs.create({
          incident_id: incidentId,
          drone_id: drone.id,
          action: 'control',
          notes: `Incident marked as ${status}. Drone transitioned to Awaiting Controller. Operator command required to Return Home.`
        });
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/:id/logs - Get log trails
router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await db.dispatchLogs.listForIncident(req.params.id);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/:id/snapshots - Get captured evidence snapshots
router.get('/:id/snapshots', async (req, res) => {
  try {
    const snapshots = await db.snapshots.listForIncident(req.params.id);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
