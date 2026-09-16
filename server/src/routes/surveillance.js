const express = require('express');
const router = express.Router();
const db = require('../config/database');
const surveillanceCoordinator = require('../services/surveillance/surveillanceCoordinator');

/**
 * RAPID Surveillance Routes
 * Mounted at /api/surveillance. See services/surveillance/.
 */

// GET /api/surveillance/missions?state=GA&status=active
router.get('/missions', async (req, res) => {
  try {
    const { state, status } = req.query;
    let stateId;
    if (state) {
      const stateRecord = await db.states.get(state);
      if (!stateRecord) return res.status(404).json({ error: 'State not found' });
      stateId = stateRecord.id;
    }
    res.json(await db.surveillanceMissions.list({ stateId, status }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/surveillance/missions/:id
router.get('/missions/:id', async (req, res) => {
  try {
    const mission = await db.surveillanceMissions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    res.json(mission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/surveillance/missions
 * { type, zoneId, state (code), waypoints?, patrolPattern, droneId,
 *   handoffStrategy, repeat, anomalyDetectionEnabled }
 * Creates the mission and immediately starts it against `droneId` if
 * provided (the common case) — mirrors dispatch's "create = act" flow.
 */
router.post('/missions', async (req, res) => {
  try {
    const { type, zoneId, state, waypoints, patrolPattern, droneId, handoffStrategy, repeat, anomalyDetectionEnabled } = req.body;

    let stateId;
    if (state) {
      const stateRecord = await db.states.get(state);
      if (!stateRecord) return res.status(404).json({ error: 'State not found' });
      stateId = stateRecord.id;
    }
    if (zoneId) {
      const zone = await db.airspaceZones.get(zoneId);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });
    }

    const mission = await surveillanceCoordinator.createMission({
      type: type || 'patrol',
      zone_id: zoneId || null,
      state_id: stateId,
      waypoints: waypoints || [],
      patrol_pattern: patrolPattern || 'circular',
      handoff_strategy: handoffStrategy || 'sequential',
      repeat: !!repeat,
      anomaly_detection_enabled: anomalyDetectionEnabled !== false
    });

    if (droneId) {
      const started = await surveillanceCoordinator.startMission(mission.id, droneId);
      return res.status(201).json(started);
    }
    res.status(201).json(mission);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/surveillance/missions/:id/start  { droneId }
router.post('/missions/:id/start', async (req, res) => {
  try {
    res.json(await surveillanceCoordinator.startMission(req.params.id, req.body.droneId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/surveillance/missions/:id/pause
router.post('/missions/:id/pause', async (req, res) => {
  try {
    res.json(await surveillanceCoordinator.pauseMission(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/surveillance/missions/:id/resume
router.post('/missions/:id/resume', async (req, res) => {
  try {
    res.json(await surveillanceCoordinator.resumeMission(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/surveillance/missions/:id/abort  { reason }
router.post('/missions/:id/abort', async (req, res) => {
  try {
    res.json(await surveillanceCoordinator.abortMission(req.params.id, req.body.reason));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/surveillance/missions/:id/handoff — manual handoff trigger
router.post('/missions/:id/handoff', async (req, res) => {
  try {
    const result = await surveillanceCoordinator.attemptHandoff(req.params.id);
    if (!result) return res.status(409).json({ error: 'Handoff not possible right now (no replacement drone or mission not active).' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/surveillance/missions/:id/logs
router.get('/missions/:id/logs', async (req, res) => {
  try {
    const mission = await db.surveillanceMissions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    res.json(mission.mission_logs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
