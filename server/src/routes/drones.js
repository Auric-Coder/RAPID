const express = require('express');
const router = express.Router();
const db = require('../config/database');
const telemetryGateway = require('../services/telemetry/telemetryGateway');
const videoStreamer = require('../services/telemetry/videoStreamer');
const websocketService = require('../services/websocketService');
const cameraManager = require('../services/camera/cameraManager');
const { resolveAllowedBaseIds } = require('../services/auth/scopeResolver');

// GET /api/drones - List all drones within the caller's organisation + scope
router.get('/', async (req, res) => {
  try {
    const list = await db.drones.list();
    const allowedBaseIds = new Set(await resolveAllowedBaseIds(req.user));
    res.json(list.filter(d => allowedBaseIds.has(d.base_id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drones/:id - Get drone telemetry status
router.get('/:id', async (req, res) => {
  try {
    const drone = await db.drones.get(req.params.id);
    if (!drone) {
      return res.status(404).json({ error: 'Drone not found' });
    }
    res.json(drone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drones/:id/recall - Recall active drone back to base (manual override)
router.post('/:id/recall', async (req, res) => {
  try {
    const droneId = req.params.id;
    const drone = await db.drones.get(droneId);
    
    if (!drone) {
      return res.status(404).json({ error: 'Drone not found' });
    }

    if (['Standby', 'Charging', 'Mission Complete', 'maintenance'].includes(drone.status)) {
      return res.status(400).json({ error: 'Drone is not currently on a mission' });
    }

    console.log(`🚨 Manual Override: Recalling drone ${drone.call_sign}`);

    // Update drone state — 'Returning' (capital R) matches simulator state machine
    const updated = await db.drones.update(droneId, {
      status: 'Returning',
      speed: 15.0,
      altitude: 50.0
    });
    websocketService.broadcastDroneUpdate(updated);

    // Record log
    if (drone.current_incident_id) {
      await db.dispatchLogs.create({
        incident_id: drone.current_incident_id,
        drone_id: drone.id,
        action: 'abort',
        notes: 'Manual abort command sent by operator. Drone returning to base.'
      });

      // Release incident assignment so another drone can pick it up if needed
      const releasedIncident = await db.incidents.update(drone.current_incident_id, {
        status: 'reported',
        assigned_drone_id: null
      });
      websocketService.broadcastIncidentUpdate(releasedIncident);
    }

    res.json({ message: 'Recall command sent successfully', drone: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/drones/:id/maintenance - Toggle maintenance mode
router.patch('/:id/maintenance', async (req, res) => {
  try {
    const droneId = req.params.id;
    const { status } = req.body; // 'maintenance' or 'idle'

    const drone = await db.drones.get(droneId);
    if (!drone) {
      return res.status(404).json({ error: 'Drone not found' });
    }

    if (!['maintenance', 'Standby'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "maintenance" or "Standby"' });
    }

    if (!['Standby', 'Charging', 'maintenance'].includes(drone.status)) {
      return res.status(400).json({ error: 'Cannot change maintenance state while drone is in flight' });
    }

    const updated = await db.drones.update(droneId, { status });
    websocketService.broadcastDroneUpdate(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drones/:id/history - Get flight path coordinate tracks
router.get('/:id/history', async (req, res) => {
  try {
    const history = await db.telemetry.getHistory(req.params.id);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/telemetry/ingest - Telemetry ingress gateway
router.post('/telemetry/ingest', async (req, res) => {
  try {
    const { source, payload } = req.body;
    if (!source || !payload) {
      return res.status(400).json({ error: 'Missing source type or payload data' });
    }

    const result = await telemetryGateway.handleIngest(source, payload);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/drones/:id/stream - Config live RTSP/HLS stream url
router.post('/:id/stream', async (req, res) => {
  try {
    const { url } = req.body;
    const result = await videoStreamer.mountStream(req.params.id, url);
    res.json({ message: 'Stream URL updated', drone: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drones/:id/webrtc - WebRTC signal proxy routing
router.post('/:id/webrtc', (req, res) => {
  try {
    const { offer } = req.body;
    const result = videoStreamer.handleSignaling(req.params.id, offer);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drones/:id/command - Issue command to drone
router.post('/:id/command', async (req, res) => {
  try {
    const droneId = req.params.id;
    const { command, value } = req.body;
    const drone = await db.drones.get(droneId);
    if (!drone) {
      return res.status(404).json({ error: 'Drone not found' });
    }

    let updates = {};
    let logAction = 'control';
    let logNotes = `Command ${command} sent to drone.`;

    switch (command) {
      case 'dispatch':
        updates.status = 'Dispatched';
        logAction = 'launch';
        logNotes = `Drone manually dispatched to incident.`;
        break;
      case 'follow':
        updates.status = 'Following Target';
        logNotes = `Operator ordered drone to follow fleeing target.`;
        break;
      case 'hover':
        updates.status = 'Hovering';
        updates.speed = 0.0;
        logNotes = `Operator ordered drone to hover on scene.`;
        break;
      case 'orbit':
        updates.status = 'Orbiting';
        logNotes = `Operator ordered drone to orbit the target area.`;
        break;
      case 'return_home':
        updates.status = 'Returning';
        updates.speed = 15.0;
        updates.altitude = 50.0;
        logAction = 'return_to_base';
        logNotes = `Operator ordered drone to Return Home.`;
        break;
      case 'emergency_land':
        updates.status = 'Awaiting Controller';
        updates.speed = 0.0;
        updates.altitude = 0.0;
        logNotes = `🚨 EMERGENCY LAND COMMAND ISSUED. Drone landed at current coordinates.`;
        break;
      case 'camera_mode':
        updates.camera_mode = value;
        logNotes = `Camera mode updated to ${value}.`;
        break;
      case 'ptt':
        logNotes = `Operator activated Push-To-Talk transmission.`;
        break;
      default:
        return res.status(400).json({ error: `Unknown command ${command}` });
    }

    const updated = await db.drones.update(droneId, updates);
    websocketService.broadcastDroneUpdate(updated);

    // Create a log in dispatchLogs if there's an incident associated
    if (drone.current_incident_id) {
      await db.dispatchLogs.create({
        incident_id: drone.current_incident_id,
        drone_id: drone.id,
        action: logAction,
        notes: logNotes
      });
    }

    res.json({ message: 'Command processed successfully', drone: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drones/:id/snapshot - Capture manual evidence snapshot (Command 2)
router.post('/:id/snapshot', async (req, res) => {
  try {
    const droneId = req.params.id;
    const drone = await db.drones.get(droneId);
    if (!drone) {
      return res.status(404).json({ error: 'Drone not found' });
    }

    const { label, target, reason } = req.body;

    const snapshot = await cameraManager.createEvidenceSnapshot({
      incident_id: drone.current_incident_id || null,
      drone_id:    drone.id,
      label:       label || 'Manual Capture',
      latitude:    drone.latitude,
      longitude:   drone.longitude,
      image_url:   `https://images.unsplash.com/photo-1508962914676-134849a727f0?q=80&w=600`,
      // Command 2 extended metadata
      heading:     drone.heading || null,
      altitude:    drone.altitude || null,
      reason:      reason || 'manual',
      target:      target || null
    }, { cameraMode: drone.camera_mode || 'auto' });

    if (drone.current_incident_id) {
      await db.dispatchLogs.create({
        incident_id: drone.current_incident_id,
        drone_id:    drone.id,
        action:      'snapshot',
        notes:       `Manual snapshot captured by operator at GPS [${drone.latitude.toFixed(4)}, ${drone.longitude.toFixed(4)}]. Heading: ${(drone.heading || 0).toFixed(0)}°. Alt: ${(drone.altitude || 0).toFixed(0)}m.`
      });
    }

    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drones/:id/battery-status - Live return-energy feasibility (Command 3)
router.get('/:id/battery-status', async (req, res) => {
  try {
    const drone = await db.drones.get(req.params.id);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    // Forward to fleet/battery-status
    const energyCfg = require('../config/energyConfig');
    const { getDistance } = require('../services/dispatchService');

    const distToBaseKm = getDistance(
      drone.latitude, drone.longitude,
      drone.base_latitude, drone.base_longitude
    ) / 1000;

    const returnFeasibility = energyCfg.calculateReturnFeasibility(drone.battery_level, distToBaseKm);

    res.json({
      droneId:              drone.id,
      callSign:             drone.call_sign,
      battery:              parseFloat(drone.battery_level.toFixed(1)),
      batteryTier:          energyCfg.batteryTier(drone.battery_level),
      distToBaseKm:         parseFloat(distToBaseKm.toFixed(2)),
      returnRequired:       returnFeasibility.returnRequired,
      projectedAfterReturn: returnFeasibility.projectedRemaining,
      returnStatus:         returnFeasibility.status,
      safetyReserve:        energyCfg.SAFETY_RESERVE_PERCENT,
      energyModel:          'SIMULATED_ENERGY_MODEL'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
