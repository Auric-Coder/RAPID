const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * RAPID Mission Routes — Command 2
 *
 * Handles recording lifecycle, controller action logging,
 * and mission evidence retrieval.
 *
 * Architecture designed so:
 *   - DEMO_SIMULATION recording can later be replaced by
 *     real WebRTC/HLS/RTSP stream recording
 *   - Controller actions become the AI/RL feedback foundation
 */

// ─────────────────────────────────────────────────────────
// Recording Endpoints
// ─────────────────────────────────────────────────────────

/**
 * GET /api/missions/:droneId/recording
 * Returns the current recording state for the drone's active mission.
 */
router.get('/:droneId/recording', async (req, res) => {
  try {
    const drone = await db.drones.get(req.params.droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const recording = await db.missionRecordings.getForDrone(req.params.droneId);
    res.json(recording || { status: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/missions/:droneId/recording/start
 * Automatically starts a recording when a mission begins.
 * Called by the simulator when a drone transitions to En Route.
 *
 * NOTE: This is DEMO_SIMULATION recording — not physical drone recording.
 * The architecture allows real stream recording to be connected later.
 */
router.post('/:droneId/recording/start', async (req, res) => {
  try {
    const droneId = req.params.droneId;
    const drone = await db.drones.get(droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    // Prevent duplicate recording for the same mission
    const existing = await db.missionRecordings.getForDrone(droneId);
    if (existing && existing.status === 'recording' && existing.mission_id === drone.current_incident_id) {
      return res.json({ message: 'Recording already active', recording: existing });
    }

    const recording = await db.missionRecordings.create({
      mission_id: drone.current_incident_id,
      drone_id: droneId,
      rakshak_id: drone.call_sign,
      status: 'recording',
      source: 'DEMO_SIMULATION',
      recording_start: new Date().toISOString(),
      stream_url: drone.stream_url || null
    });

    // Log the recording start event to dispatch logs
    if (drone.current_incident_id) {
      await db.dispatchLogs.create({
        incident_id: drone.current_incident_id,
        drone_id: droneId,
        action: 'control',
        notes: `[DEMO] Recording automatically started for ${drone.call_sign}. Source: DEMO_SIMULATION. Recording ID: ${recording.id.slice(0, 8)}.`
      });
    }

    console.log(`🎬 Recording started: ${drone.call_sign} | Mission: ${drone.current_incident_id?.slice(0, 8)} | Source: DEMO_SIMULATION`);
    res.json({ message: 'Recording started', recording });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/missions/:droneId/recording/end
 * Finalizes the recording when a mission completes.
 * Recording ends ONLY when mission is complete/terminated — NOT on arrival.
 *
 * NOTE: DEMO_SIMULATION recording — no actual video file is produced.
 */
router.post('/:droneId/recording/end', async (req, res) => {
  try {
    const droneId = req.params.droneId;
    const drone = await db.drones.get(droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const recording = await db.missionRecordings.getForDrone(droneId);
    if (!recording || recording.status !== 'recording') {
      return res.json({ message: 'No active recording to finalize', recording: null });
    }

    const endTime = new Date().toISOString();
    const durationSeconds = Math.round(
      (new Date(endTime) - new Date(recording.recording_start)) / 1000
    );

    const finalized = await db.missionRecordings.update(recording.id, {
      status: 'finalized',
      recording_end: endTime,
      duration_seconds: durationSeconds
    });

    // Log finalization event
    if (recording.mission_id) {
      await db.dispatchLogs.create({
        incident_id: recording.mission_id,
        drone_id: droneId,
        action: 'control',
        notes: `[DEMO] Recording finalized. Duration: ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s. Source: DEMO_SIMULATION.`
      });
    }

    console.log(`✅ Recording finalized: ${drone.call_sign} | Duration: ${durationSeconds}s`);
    res.json({ message: 'Recording finalized', recording: finalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// Controller Action Log Endpoints
// ─────────────────────────────────────────────────────────

/**
 * GET /api/missions/:droneId/controller-actions
 * Returns controller action log for a drone.
 */
router.get('/:droneId/controller-actions', async (req, res) => {
  try {
    const droneId = req.params.droneId;
    const drone = await db.drones.get(droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const actions = await db.controllerActions.listForDrone(droneId, 100);
    res.json(actions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/missions/:droneId/controller-actions
 * Logs a controller action to the audit trail.
 *
 * Body: { action, parameters, result, error_message, mission_id }
 */
router.post('/:droneId/controller-actions', async (req, res) => {
  try {
    const droneId = req.params.droneId;
    const drone = await db.drones.get(droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const { action, parameters, result, error_message, mission_id } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });

    const logged = await db.controllerActions.create({
      mission_id: mission_id || drone.current_incident_id || null,
      drone_id: droneId,
      rakshak_id: drone.call_sign,
      action,
      parameters: parameters || {},
      result: result || 'ok',
      error_message: error_message || null
    });

    res.json(logged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/missions/:droneId/evidence
 * Aggregated evidence for a mission: recording + snapshots + actions
 */
router.get('/:droneId/evidence', async (req, res) => {
  try {
    const droneId = req.params.droneId;
    const drone = await db.drones.get(droneId);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    const missionId = req.query.mission_id || drone.current_incident_id;

    const [recording, snapshots, actions, logs] = await Promise.all([
      missionId ? db.missionRecordings.getForMission(missionId) : Promise.resolve(null),
      missionId ? db.snapshots.listForIncident(missionId) : Promise.resolve([]),
      db.controllerActions.listForDrone(droneId, 100),
      missionId ? db.dispatchLogs.listForIncident(missionId) : Promise.resolve([])
    ]);

    res.json({ recording, snapshots, controllerActions: actions, missionLogs: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
