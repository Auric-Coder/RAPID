/**
 * RAPID Surveillance — Coordinator (Phase 5)
 *
 * Mission lifecycle (create/start/pause/resume/abort), the per-tick
 * patrol movement/anomaly-detection logic simulatorService.js calls
 * for any drone in the 'Patrolling' state, and battery-triggered
 * handoff between drones per architecture Section 5.2.
 */
const db = require('../../config/database');
const websocketService = require('../websocketService');
const energyCfg = require('../../config/energyConfig');
const cameraManager = require('../camera/cameraManager');
const patrolPlanner = require('./patrolPlanner');
const { getDistance } = require('../dispatchService');

const PATROL_SPEED_MPS = 8.0; // slower than a 15 m/s incident-response cruise — this is a loitering sweep, not a race to a scene.
const PATROL_ALTITUDE_M = 60.0;
const ANOMALY_CHANCE_PER_TICK = 0.05;
const INTRUSION_CLASSES = ['Human', 'Vehicle', 'Weapon'];
const DETECTION_CLASSES = ['Human', 'Vehicle', 'Weapon', 'Fire', 'Smoke'];
const DETECTION_IMAGES = {
  Human: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600',
  Vehicle: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=600',
  Weapon: 'https://images.unsplash.com/photo-1595590424283-b8f17842773f?q=80&w=600',
  Fire: 'https://images.unsplash.com/photo-1508873696983-2df519f0397e?q=80&w=600',
  Smoke: 'https://images.unsplash.com/photo-1542332213-9b5a5a3f8c4e?q=80&w=600'
};

async function createMission(data) {
  const zone = data.zone_id ? await db.airspaceZones.get(data.zone_id) : null;
  const waypoints = (data.waypoints && data.waypoints.length > 0)
    ? data.waypoints
    : patrolPlanner.resolveWaypoints({ patrol_pattern: data.patrol_pattern || 'circular', waypoints: [] }, zone ? zone.polygon : null);
  return db.surveillanceMissions.create({ ...data, waypoints });
}

async function startMission(missionId, droneId) {
  const mission = await db.surveillanceMissions.get(missionId);
  if (!mission) throw new Error('Mission not found');
  const drone = await db.drones.get(droneId);
  if (!drone) throw new Error('Drone not found');
  if (!['Standby', 'Charging'].includes(drone.status)) {
    throw new Error(`${drone.call_sign} is not available for patrol (status: ${drone.status})`);
  }
  // Same geographic-plausibility check as attemptHandoff: a drone
  // based in one state can't meaningfully patrol another state's zone.
  if (mission.state_id) {
    const base = drone.base_id ? await db.bases.get(drone.base_id) : null;
    if (!base || base.state_id !== mission.state_id) {
      throw new Error(`${drone.call_sign} is not based in this mission's state — pick a drone based in the same state.`);
    }
  }

  const updatedDrone = await db.drones.update(droneId, { status: 'Patrolling', current_incident_id: null, speed: PATROL_SPEED_MPS, altitude: PATROL_ALTITUDE_M });
  websocketService.broadcastDroneUpdate(updatedDrone);

  const updated = await db.surveillanceMissions.update(missionId, {
    status: 'active',
    current_drone_id: droneId,
    assigned_drone_ids: Array.from(new Set([...(mission.assigned_drone_ids || []), droneId])),
    started_at: new Date().toISOString(),
    current_waypoint_index: 0,
    waypoint_direction: 1
  });
  await db.surveillanceMissions.appendLog(missionId, { event: 'mission_started', droneId, callSign: drone.call_sign });
  return updated;
}

async function pauseMission(missionId) {
  const mission = await db.surveillanceMissions.get(missionId);
  if (!mission) throw new Error('Mission not found');
  if (mission.current_drone_id) {
    const updatedDrone = await db.drones.update(mission.current_drone_id, { status: 'Hovering', speed: 0 });
    websocketService.broadcastDroneUpdate(updatedDrone);
  }
  const updated = await db.surveillanceMissions.update(missionId, { status: 'paused' });
  await db.surveillanceMissions.appendLog(missionId, { event: 'mission_paused' });
  return updated;
}

async function resumeMission(missionId) {
  const mission = await db.surveillanceMissions.get(missionId);
  if (!mission) throw new Error('Mission not found');
  if (mission.current_drone_id) {
    const updatedDrone = await db.drones.update(mission.current_drone_id, { status: 'Patrolling', speed: PATROL_SPEED_MPS });
    websocketService.broadcastDroneUpdate(updatedDrone);
  }
  const updated = await db.surveillanceMissions.update(missionId, { status: 'active' });
  await db.surveillanceMissions.appendLog(missionId, { event: 'mission_resumed' });
  return updated;
}

async function abortMission(missionId, reason) {
  const mission = await db.surveillanceMissions.get(missionId);
  if (!mission) throw new Error('Mission not found');
  if (mission.current_drone_id) {
    const updatedDrone = await db.drones.update(mission.current_drone_id, { status: 'Returning', speed: 15.0, altitude: 50.0 });
    websocketService.broadcastDroneUpdate(updatedDrone);
  }
  const updated = await db.surveillanceMissions.update(missionId, { status: 'aborted', completed_at: new Date().toISOString(), current_drone_id: null });
  await db.surveillanceMissions.appendLog(missionId, { event: 'mission_aborted', reason: reason || null });
  return updated;
}

/**
 * Battery-triggered handoff (architecture Section 5.2): the current
 * patrol drone can't safely continue. Find a fresh Standby/Charging
 * drone and switch the mission to it; the outgoing drone heads home.
 * The incoming drone resumes patrol from *its own* current position —
 * no position teleport — so it naturally flies toward the mission's
 * current waypoint on its own next ticks.
 *
 * Candidates are restricted to the mission's own state (via base
 * state_id) — an earlier version searched the whole fleet and could
 * "succeed" by handing a Punjab border patrol off to a drone based in
 * Goa, 1700+ km away, which is operationally meaningless even though
 * the drone was technically Standby with battery to spare. Among
 * same-state candidates, the closest one to the outgoing drone's last
 * position is preferred.
 */
async function attemptHandoff(missionId) {
  const mission = await db.surveillanceMissions.get(missionId);
  if (!mission || mission.status !== 'active') return null;

  const outgoingDrone = mission.current_drone_id ? await db.drones.get(mission.current_drone_id) : null;
  const allDrones = await db.drones.list();
  const allBases = await db.bases.list({});
  const baseStateById = new Map(allBases.map(b => [b.id, b.state_id]));

  const candidates = allDrones.filter(d =>
    d.id !== mission.current_drone_id &&
    ['Standby', 'Charging'].includes(d.status) &&
    d.battery_level > 50 &&
    (!mission.state_id || baseStateById.get(d.base_id) === mission.state_id)
  );

  const referenceLat = outgoingDrone ? outgoingDrone.latitude : null;
  const referenceLng = outgoingDrone ? outgoingDrone.longitude : null;
  if (referenceLat != null) {
    candidates.sort((a, b) => getDistance(referenceLat, referenceLng, a.latitude, a.longitude) - getDistance(referenceLat, referenceLng, b.latitude, b.longitude));
  }
  const replacement = candidates[0];

  if (!replacement) {
    await db.surveillanceMissions.appendLog(missionId, {
      event: 'handoff_failed',
      reason: 'No same-state replacement drone available — patrol coverage gap until one frees up.'
    });
    return null;
  }

  if (outgoingDrone) {
    const updatedOutgoing = await db.drones.update(outgoingDrone.id, { status: 'Returning', speed: 15.0, altitude: 50.0, current_incident_id: null });
    websocketService.broadcastDroneUpdate(updatedOutgoing);
  }
  const updatedReplacement = await db.drones.update(replacement.id, { status: 'Patrolling', speed: PATROL_SPEED_MPS, altitude: PATROL_ALTITUDE_M });
  websocketService.broadcastDroneUpdate(updatedReplacement);

  const updated = await db.surveillanceMissions.update(missionId, {
    current_drone_id: replacement.id,
    assigned_drone_ids: Array.from(new Set([...(mission.assigned_drone_ids || []), replacement.id]))
  });
  await db.surveillanceMissions.appendLog(missionId, {
    event: 'handoff',
    outgoingDroneId: outgoingDrone?.id || null, outgoingCallSign: outgoingDrone?.call_sign || null,
    incomingDroneId: replacement.id, incomingCallSign: replacement.call_sign
  });
  websocketService.broadcast('surveillance_handoff', { missionId, outgoing: outgoingDrone?.call_sign || null, incoming: replacement.call_sign });
  return updated;
}

async function handleAnomalyDetection(mission, drone, position) {
  const selectedClass = DETECTION_CLASSES[Math.floor(Math.random() * DETECTION_CLASSES.length)];

  await cameraManager.createEvidenceSnapshot({
    incident_id: null,
    drone_id: drone.id,
    label: selectedClass,
    latitude: position.lat,
    longitude: position.lng,
    image_url: DETECTION_IMAGES[selectedClass],
    heading: position.heading ?? drone.heading,
    altitude: PATROL_ALTITUDE_M,
    reason: 'patrol_anomaly',
    target: selectedClass
  }, { cameraMode: drone.camera_mode || 'auto' });

  await db.surveillanceMissions.appendLog(mission.id, { event: 'anomaly_detected', label: selectedClass, lat: position.lat, lng: position.lng });

  if (mission.anomaly_detection_enabled !== false && INTRUSION_CLASSES.includes(selectedClass)) {
    const incident = await db.incidents.create({
      title: `Intrusion Alert — ${selectedClass} Detected in Patrol Zone`,
      description: `Autonomous patrol drone ${drone.call_sign} detected a possible intrusion (${selectedClass}) during surveillance. Requires controller review.`,
      category: 'trespass',
      severity: 'high',
      latitude: position.lat,
      longitude: position.lng
    });
    websocketService.broadcastIncidentCreated(incident);
    await db.surveillanceMissions.appendLog(mission.id, { event: 'intrusion_alert', incidentId: incident.id, label: selectedClass });
  }
}

/**
 * Called once per simulator tick for any drone whose status is
 * 'Patrolling'. Returns the field updates simulatorService.js should
 * merge into its own updatedFields object for this drone.
 */
async function tickPatrol(drone) {
  const missions = await db.surveillanceMissions.list({});
  const mission = missions.find(m => m.current_drone_id === drone.id && m.status === 'active');
  if (!mission) {
    // Orphaned patrol state (mission was deleted/aborted out from under
    // this drone) — bring it home safely rather than loitering forever.
    return { status: 'Returning', speed: 15.0, altitude: 50.0 };
  }

  const zone = mission.zone_id ? await db.airspaceZones.get(mission.zone_id) : null;
  const waypoints = (mission.waypoints && mission.waypoints.length > 0)
    ? mission.waypoints
    : patrolPlanner.resolveWaypoints(mission, zone ? zone.polygon : null);

  if (waypoints.length === 0) {
    await db.surveillanceMissions.appendLog(mission.id, { event: 'mission_aborted', reason: 'No waypoints resolvable — zone missing or empty.' });
    await db.surveillanceMissions.update(mission.id, { status: 'aborted', completed_at: new Date().toISOString(), current_drone_id: null });
    return { status: 'Returning', speed: 15.0, altitude: 50.0 };
  }

  const idx = Math.min(mission.current_waypoint_index || 0, waypoints.length - 1);
  const target = waypoints[idx];
  const stepResult = patrolPlanner.stepTowards(drone.latitude, drone.longitude, target.latitude, target.longitude, PATROL_SPEED_MPS);
  const drain = (Math.min(PATROL_SPEED_MPS, PATROL_SPEED_MPS) / 1000) * energyCfg.CRUISE_ENERGY_PER_KM;

  const updatedFields = {
    latitude: stepResult.lat,
    longitude: stepResult.lng,
    heading: stepResult.heading,
    speed: PATROL_SPEED_MPS,
    altitude: target.altitude || PATROL_ALTITUDE_M,
    battery_level: Math.max(0, drone.battery_level - drain)
  };

  if (stepResult.reached) {
    if (mission.patrol_pattern === 'random' && zone) {
      await db.surveillanceMissions.update(mission.id, { waypoints: [patrolPlanner.randomPointInPolygon(zone.polygon)], current_waypoint_index: 0, waypoint_direction: 1 });
    } else {
      const { index, direction } = patrolPlanner.advanceIndex(mission, waypoints.length);
      await db.surveillanceMissions.update(mission.id, { current_waypoint_index: index, waypoint_direction: direction });
    }
    await db.surveillanceMissions.appendLog(mission.id, { event: 'waypoint_reached', waypointIndex: idx, lat: stepResult.lat, lng: stepResult.lng });
  }

  if (mission.anomaly_detection_enabled !== false && Math.random() < ANOMALY_CHANCE_PER_TICK) {
    await handleAnomalyDetection(mission, drone, { lat: updatedFields.latitude, lng: updatedFields.longitude, heading: updatedFields.heading });
  }

  const distToBaseKm = getDistance(updatedFields.latitude, updatedFields.longitude, drone.base_latitude, drone.base_longitude) / 1000;
  const returnCheck = energyCfg.calculateReturnFeasibility(updatedFields.battery_level, distToBaseKm);
  if (returnCheck.status !== 'SAFE') {
    await attemptHandoff(mission.id);
    updatedFields.status = 'Returning';
    updatedFields.speed = 15.0;
    updatedFields.altitude = 50.0;
  }

  return updatedFields;
}

module.exports = { createMission, startMission, pauseMission, resumeMission, abortMission, attemptHandoff, tickPatrol };
