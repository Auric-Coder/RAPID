const db = require('../config/database');
const { getDistance } = require('./dispatchService');
const energyCfg = require('../config/energyConfig');
const websocketService = require('./websocketService');
const rlEnvironment = require('../rl/environment');
const cameraManager = require('./camera/cameraManager');
const surveillanceCoordinator = require('./surveillance/surveillanceCoordinator');

const ACTIVE_STATUSES = ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller', 'Returning', 'Patrolling'];

/**
 * RAPID Telemetry Simulator
 *
 * Simulates drone GPS movement using real geographic mathematics.
 * Each tick (1 second) advances drones toward their target coordinates
 * using Haversine-based stepTowards() — not blind lat/lng increments.
 *
 * Coordinate convention:
 *   latitude  = north/south (Goa is ~15° N)
 *   longitude = east/west   (Goa is ~73–74° E)
 *
 * Battery drain is distance-proportional, using energyConfig constants.
 * Clearly labelled: SIMULATED ENERGY MODEL
 */

// ============================================================
// Simulation Parameters
// ============================================================
const CRUISING_SPEED_MPS  = 15.0;  // Cruising speed: 15 m/s (~54 km/h)
const HOVER_SPEED_MPS     = 0.0;   // Hovering in place
const CRUISING_ALTITUDE_M = 50.0;  // Cruise altitude in metres
const HOVER_ALTITUDE_M    = 20.0;  // Hover altitude in metres

// Arrival threshold: drone is considered "at destination" when within this distance
const ARRIVAL_THRESHOLD_M = 15.0;  // 15 metres

let simIntervalId = null;

// ============================================================
// Geographic Utilities
// ============================================================

/**
 * Calculate compass heading (bearing) in degrees [0–360] from point A to point B.
 */
function calculateHeading(lat1, lon1, lat2, lon2) {
  const dLon     = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad  = (lat1 * Math.PI) / 180;
  const lat2Rad  = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let brng = Math.atan2(y, x);
  brng = (brng * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Advance the drone one step from current position toward target position.
 */
function stepTowards(currLat, currLng, targetLat, targetLng, stepMeters) {
  const distance = getDistance(currLat, currLng, targetLat, targetLng);
  const heading  = calculateHeading(currLat, currLng, targetLat, targetLng);

  if (distance <= ARRIVAL_THRESHOLD_M) {
    return { lat: targetLat, lng: targetLng, reached: true, heading, distanceM: 0 };
  }

  const ratio  = stepMeters / distance;
  const dLat   = targetLat - currLat;
  const dLng   = targetLng - currLng;

  const nextLat = currLat + dLat * ratio;
  const nextLng = currLng + dLng * ratio;

  return { lat: nextLat, lng: nextLng, reached: false, heading, distanceM: distance };
}

function isValidCoord(value) {
  return typeof value === 'number' && isFinite(value);
}

/**
 * SIMULATED ENERGY MODEL
 * Calculate distance-proportional battery drain for one simulation tick.
 * Step = metres advanced this tick → convert to km → multiply by energy rate.
 */
function calcCruiseDrain(stepMeters) {
  // Distance this tick in km
  const stepKm = Math.min(stepMeters, CRUISING_SPEED_MPS) / 1000;
  return stepKm * energyCfg.CRUISE_ENERGY_PER_KM;
}

function calcReturnDrain(stepMeters) {
  const stepKm = Math.min(stepMeters, CRUISING_SPEED_MPS) / 1000;
  return stepKm * energyCfg.RETURN_ENERGY_PER_KM;
}

// ============================================================
// Simulator Main Loop
// ============================================================

const simulatorService = {
  start() {
    if (simIntervalId) return;

    console.log('Telemetry Simulator: starting (1 tick/second).');
    console.log(`   Energy model: ${energyCfg.CRUISE_ENERGY_PER_KM}%/km cruise | ${energyCfg.HOVER_DRAIN_PER_SECOND * 60}%/min hover | ${energyCfg.SAFETY_RESERVE_PERCENT}% reserve`);

    let historyWriteCounter = 0;

    simIntervalId = setInterval(async () => {
      try {
        historyWriteCounter++;
        const drones = await db.drones.list();

        for (const drone of drones) {
          if (drone.is_hardware_active) continue;

          if (!isValidCoord(drone.latitude) || !isValidCoord(drone.longitude)) {
            console.error(`Simulator: drone ${drone.call_sign} has invalid coordinates. Skipping.`);
            continue;
          }

          let updatedFields  = {};
          let stateChanged   = false;
          const mustLogHistory = (historyWriteCounter % 5 === 0);

          // ----------------------------------------------------------
          // STATE: Dispatched / En Route — fly toward incident
          // ----------------------------------------------------------
          if ((drone.status === 'Dispatched' || drone.status === 'En Route') && drone.current_incident_id) {
            const incident = await db.incidents.get(drone.current_incident_id);

            if (incident) {
              if (!isValidCoord(incident.latitude) || !isValidCoord(incident.longitude)) {
                console.error(`Simulator: incident ${incident.id} has invalid coordinates. Recalling drone.`);
                updatedFields.status = 'Returning';
                stateChanged = true;
              } else {
                const stepResult = stepTowards(
                  drone.latitude, drone.longitude,
                  incident.latitude, incident.longitude,
                  CRUISING_SPEED_MPS
                );

                const distRemaining = getDistance(drone.latitude, drone.longitude, incident.latitude, incident.longitude);

                // SIMULATED ENERGY MODEL — distance-proportional drain
                const drain = calcCruiseDrain(CRUISING_SPEED_MPS);

                updatedFields = {
                  latitude:      stepResult.lat,
                  longitude:     stepResult.lng,
                  heading:       stepResult.heading,
                  speed:         CRUISING_SPEED_MPS,
                  altitude:      CRUISING_ALTITUDE_M,
                  battery_level: Math.round(Math.max(0, drone.battery_level - drain))
                };

                // Dispatched → En Route on first tick
                if (drone.status === 'Dispatched') {
                  updatedFields.status = 'En Route';
                  stateChanged = true;
                  console.log(`${drone.call_sign}: En Route to "${incident.title}" | Distance: ${(distRemaining / 1000).toFixed(2)} km`);

                  // Start recording when dispatch begins.
                  try {
                    const existingRec = await db.missionRecordings.getForDrone(drone.id);
                    if (!existingRec || existingRec.status !== 'recording') {
                      await cameraManager.startRecording({
                        mission_id:      drone.current_incident_id,
                        drone_id:        drone.id,
                        rakshak_id:      drone.call_sign,
                        status:          'recording',
                        source:          'DEMO_SIMULATION',
                        recording_start: new Date().toISOString(),
                        stream_url:      drone.stream_url || null
                      });
                      await db.dispatchLogs.create({
                        incident_id: drone.current_incident_id,
                        drone_id:    drone.id,
                        action:      'control',
                        notes:       `[DEMO] Recording automatically started for ${drone.call_sign}. Source: DEMO_SIMULATION.`
                      });
                      console.log(`${drone.call_sign}: Recording started (DEMO_SIMULATION).`);
                    }
                  } catch (recErr) {
                    console.error(`Recording auto-start error: ${recErr.message}`);
                  }
                }

                // Arrived at incident site
                if (stepResult.reached) {
                  updatedFields.status   = 'On Scene';
                  updatedFields.speed    = HOVER_SPEED_MPS;
                  updatedFields.altitude = HOVER_ALTITUDE_M;
                  stateChanged = true;

                  console.log(`${drone.call_sign}: arrived at "${incident.title}" | GPS [${stepResult.lat.toFixed(4)}°N, ${stepResult.lng.toFixed(4)}°E].`);
                  console.log(`   Status → On Scene. Awaiting controller command.`);

                  const activeIncident = await db.incidents.update(incident.id, { status: 'active' });
                  websocketService.broadcastIncidentUpdate(activeIncident);

                  await db.dispatchLogs.create({
                    incident_id: incident.id,
                    drone_id:    drone.id,
                    action:      'arrival',
                    notes:       `${drone.call_sign} arrived on scene at GPS [${stepResult.lat.toFixed(4)}°N, ${stepResult.lng.toFixed(4)}°E]. Surveillance active.`
                  });
                }
              }
            } else {
              console.log(`${drone.call_sign}: assigned incident not found. Recalling.`);
              updatedFields.status = 'Returning';
              stateChanged = true;
            }
          }

          // ----------------------------------------------------------
          // STATE: On Scene / AI Monitoring / Hovering / Orbiting / Following
          // SIMULATED ENERGY MODEL: hover drain per second
          // ----------------------------------------------------------
          else if (
            ['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller'].includes(drone.status) &&
            drone.current_incident_id
          ) {
            const incident = await db.incidents.get(drone.current_incident_id);

            if (incident) {
              // SIMULATED ENERGY MODEL — hover drain per second
              updatedFields = {
                battery_level: Math.round(Math.max(0, drone.battery_level - energyCfg.HOVER_DRAIN_PER_SECOND))
              };

              if (drone.status === 'Orbiting') {
                const angle  = (Date.now() / 6000) % (2 * Math.PI);
                const radius = 0.0006;
                updatedFields.latitude  = incident.latitude  + Math.sin(angle) * radius;
                updatedFields.longitude = incident.longitude + Math.cos(angle) * radius;
                updatedFields.heading   = (angle * 180 / Math.PI + 90) % 360;
                updatedFields.speed     = 5.0;
                updatedFields.altitude  = HOVER_ALTITUDE_M;
              } else if (drone.status === 'Following Target') {
                if (!drone.target_lat || !isValidCoord(drone.target_lat)) {
                  drone.target_lat = incident.latitude;
                  drone.target_lng = incident.longitude;
                }
                drone.target_lat += (Math.random() - 0.5) * 0.00015;
                drone.target_lng += (Math.random() - 0.5) * 0.00015;

                const stepResult = stepTowards(
                  drone.latitude, drone.longitude,
                  drone.target_lat, drone.target_lng,
                  5.0
                );

                updatedFields.latitude  = stepResult.lat;
                updatedFields.longitude = stepResult.lng;
                updatedFields.heading   = stepResult.heading;
                updatedFields.speed     = 5.0;
                updatedFields.altitude  = HOVER_ALTITUDE_M;
              } else {
                updatedFields.speed    = HOVER_SPEED_MPS;
                updatedFields.altitude = HOVER_ALTITUDE_M;
              }

              // Live return-energy check — warn if margin is critical
              const currentBattery = updatedFields.battery_level ?? drone.battery_level;
              const distToBaseM = getDistance(
                updatedFields.latitude ?? drone.latitude,
                updatedFields.longitude ?? drone.longitude,
                drone.base_latitude, drone.base_longitude
              );
              const returnCheck = energyCfg.calculateReturnFeasibility(currentBattery, distToBaseM / 1000);

              if (returnCheck.status === 'CRITICAL' && !['Returning', 'Mission Complete'].includes(drone.status)) {
                updatedFields.status = 'Returning';
                stateChanged = true;
                console.log(`${drone.call_sign}: CRITICAL BATTERY (${currentBattery.toFixed(1)}%). Auto-return triggered.`);
                await db.dispatchLogs.create({
                  incident_id: drone.current_incident_id,
                  drone_id:    drone.id,
                  action:      'control',
                  notes:       `⚠️ SAFETY AUTO-RETURN: ${drone.call_sign} battery critical (${currentBattery.toFixed(1)}%). Auto-returning. Return required: ${returnCheck.returnRequired}%.`
                });
              }

              // AI evidence capture simulation (~8% per tick)
              if (Math.random() < 0.08) {
                const detectionClasses = ['Human', 'Vehicle', 'Weapon', 'Fire', 'Smoke', 'Running Person', 'Entering Building', 'Leaving Building'];
                const selectedClass    = detectionClasses[Math.floor(Math.random() * detectionClasses.length)];

                const imagesMap = {
                  'Human':            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600',
                  'Vehicle':          'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=600',
                  'Weapon':           'https://images.unsplash.com/photo-1595590424283-b8f17842773f?q=80&w=600',
                  'Fire':             'https://images.unsplash.com/photo-1508873696983-2df519f0397e?q=80&w=600',
                  'Smoke':            'https://images.unsplash.com/photo-1542332213-9b5a5a3f8c4e?q=80&w=600',
                  'Running Person':   'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?q=80&w=600',
                  'Entering Building':'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=600',
                  'Leaving Building': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=600'
                };

                const currentLat = isValidCoord(updatedFields.latitude)  ? updatedFields.latitude  : drone.latitude;
                const currentLng = isValidCoord(updatedFields.longitude) ? updatedFields.longitude : drone.longitude;

                await cameraManager.createEvidenceSnapshot({
                  incident_id: incident.id,
                  drone_id:    drone.id,
                  label:       selectedClass,
                  latitude:    currentLat,
                  longitude:   currentLng,
                  image_url:   imagesMap[selectedClass],
                  heading:     drone.heading || 0,
                  altitude:    drone.altitude || HOVER_ALTITUDE_M,
                  reason:      'ai_detection',
                  target:      selectedClass
                }, { cameraMode: drone.camera_mode || 'auto' });

                await db.dispatchLogs.create({
                  incident_id: incident.id,
                  drone_id:    drone.id,
                  action:      'control',
                  notes:       `AI detection: "${selectedClass}" identified on scene. Snapshot saved. GPS [${currentLat.toFixed(4)}°N, ${currentLng.toFixed(4)}°E].`
                });

                if (drone.status === 'On Scene') {
                  updatedFields.status = 'AI Monitoring';
                  stateChanged = true;
                }
              }
            } else {
              console.log(`${drone.call_sign}: incident resolved or deleted. Recalling.`);
              updatedFields.status = 'Returning';
              stateChanged = true;
            }
          }

          // ----------------------------------------------------------
          // STATE: Returning — fly back to home base
          // SIMULATED ENERGY MODEL: distance-proportional return drain
          // ----------------------------------------------------------
          else if (drone.status === 'Returning') {
            if (!isValidCoord(drone.base_latitude) || !isValidCoord(drone.base_longitude)) {
              console.error(`Simulator: ${drone.call_sign} has invalid base coordinates. Cannot return.`);
              continue;
            }

            const stepResult = stepTowards(
              drone.latitude, drone.longitude,
              drone.base_latitude, drone.base_longitude,
              CRUISING_SPEED_MPS
            );

            // SIMULATED ENERGY MODEL — return flight drain
            const drain = calcReturnDrain(CRUISING_SPEED_MPS);

            updatedFields = {
              latitude:      stepResult.lat,
              longitude:     stepResult.lng,
              heading:       stepResult.heading,
              speed:         CRUISING_SPEED_MPS,
              altitude:      CRUISING_ALTITUDE_M,
              battery_level: Math.round(Math.max(0, drone.battery_level - drain))
            };

            if (stepResult.reached) {
              updatedFields.status    = 'Mission Complete';
              updatedFields.speed     = 0.0;
              updatedFields.altitude  = 0.0;
              updatedFields.heading   = 0.0;
              stateChanged = true;

              console.log(`${drone.call_sign}: returned to base. Recharging.`);

              if (drone.current_incident_id) {
                await db.dispatchLogs.create({
                  incident_id: drone.current_incident_id,
                  drone_id:    drone.id,
                  action:      'arrival',
                  notes:       `${drone.call_sign} landed at home base. Recharging initiated.`
                });
              }
            }
          }

          // ----------------------------------------------------------
          // STATE: Mission Complete — finalize recording + transition
          // ----------------------------------------------------------
          else if (drone.status === 'Mission Complete') {
            try {
              const activeRec = await db.missionRecordings.getForDrone(drone.id);
              if (activeRec && activeRec.status === 'recording') {
                const endTime = new Date().toISOString();
                const durationSec = Math.round(
                  (new Date(endTime) - new Date(activeRec.recording_start)) / 1000
                );
                await cameraManager.finalizeRecording(activeRec, { endTime, durationSec });
                if (activeRec.mission_id) {
                  await db.dispatchLogs.create({
                    incident_id: activeRec.mission_id,
                    drone_id:    drone.id,
                    action:      'control',
                    notes:       `[DEMO] Recording finalized. Duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s. Source: DEMO_SIMULATION.`
                  });
                }
                console.log(`${drone.call_sign}: Recording finalised (${Math.floor(durationSec / 60)}m ${durationSec % 60}s).`);
              }
            } catch (recErr) {
              console.error(`Recording finalise error: ${recErr.message}`);
            }

            // Close the RL experience tuple opened at dispatch time, now that the mission outcome is known.
            try {
              const missionId = drone.current_incident_id;
              if (missionId) {
                const [missionLogs, incidentRecord, allIncidents, allDrones] = await Promise.all([
                  db.dispatchLogs.listForIncident(missionId),
                  db.incidents.get(missionId),
                  db.incidents.list(),
                  db.drones.list()
                ]);

                const launchLog = missionLogs.find(l => l.action === 'launch');
                const responseTimeSec = launchLog && incidentRecord
                  ? Math.max(0, Math.round((new Date(launchLog.timestamp) - new Date(incidentRecord.created_at)) / 1000))
                  : null;
                const safetyViolations = missionLogs.some(l => l.notes && l.notes.includes('SAFETY AUTO-RETURN')) ? 1 : 0;
                const controllerOverrode = missionLogs.some(l => l.notes && l.notes.includes('Controller override'));
                const unservedCriticalIncidents = allIncidents.filter(i =>
                  i.severity === 'critical' && !i.assigned_drone_id && !['resolved', 'cancelled'].includes(i.status)
                ).length;
                const baseFleet = allDrones.filter(d2 => d2.base_id === drone.base_id);
                const fleetCoverageRatio = baseFleet.length
                  ? baseFleet.filter(d2 => ['Standby', 'Charging'].includes(d2.status)).length / baseFleet.length
                  : 1;

                await rlEnvironment.completeExperience(drone.id, {
                  responseTimeSec,
                  missionCompleted: true,
                  incidentResolved: incidentRecord ? incidentRecord.status === 'resolved' : false,
                  safetyViolations,
                  batterySurplus: Math.max(0, drone.battery_level - energyCfg.SAFETY_RESERVE_PERCENT),
                  fleetCoverageRatio: parseFloat(fleetCoverageRatio.toFixed(2)),
                  returnedSafely: true,
                  wasUnnecessary: false,
                  missionFailed: false,
                  unservedCriticalIncidents,
                  wasUnnecessaryReassignment: false,
                  controllerOverrode
                });
              }
            } catch (rlErr) {
              console.error(`RL experience recording error: ${rlErr.message}`);
            }

            updatedFields.status              = drone.battery_level < 100 ? 'Charging' : 'Standby';
            updatedFields.current_incident_id = null;
            stateChanged = true;
            console.log(`${drone.call_sign}: mission complete. Status → ${updatedFields.status}.`);
          }

          // ----------------------------------------------------------
          // STATE: Patrolling — border/protected-zone surveillance
          // ----------------------------------------------------------
          else if (drone.status === 'Patrolling') {
            try {
              updatedFields = await surveillanceCoordinator.tickPatrol(drone);
              if (updatedFields.status === 'Returning') stateChanged = true;
            } catch (patrolErr) {
              console.error(`Patrol tick error for ${drone.call_sign}: ${patrolErr.message}`);
            }
          }

          // ----------------------------------------------------------
          // STATE: Standby / Charging — recharge battery
          // ----------------------------------------------------------
          else if (['Standby', 'Charging', 'maintenance'].includes(drone.status)) {
            if (drone.battery_level < 100) {
              updatedFields = {
                battery_level: Math.round(Math.min(100, drone.battery_level + 0.5))
              };
              if (updatedFields.battery_level >= 100 && drone.status === 'Charging') {
                updatedFields.status = 'Standby';
                stateChanged = true;
              }
            } else if (drone.status === 'Charging') {
              updatedFields.status = 'Standby';
              stateChanged = true;
            }
          }

          // ----------------------------------------------------------
          // Commit updates to database
          // ----------------------------------------------------------
          if (Object.keys(updatedFields).length > 0) {
            const updatedDrone = await db.drones.update(drone.id, updatedFields);
            websocketService.broadcastDroneUpdate(updatedDrone);

            const flyingStatuses = ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Returning', 'Patrolling'];
            if (mustLogHistory && flyingStatuses.includes(drone.status)) {
              const logLat = isValidCoord(updatedFields.latitude)  ? updatedFields.latitude  : drone.latitude;
              const logLng = isValidCoord(updatedFields.longitude) ? updatedFields.longitude : drone.longitude;

              await db.telemetry.create({
                drone_id:      drone.id,
                latitude:      logLat,
                longitude:     logLng,
                altitude:      updatedFields.altitude  || drone.altitude  || 0,
                speed:         updatedFields.speed     || drone.speed     || 0,
                heading:       updatedFields.heading   || drone.heading   || 0,
                battery_level: Math.round(updatedFields.battery_level || drone.battery_level)
              });
            }
          }
        }

        const available = drones.filter(d => ['Standby', 'Charging'].includes(d.status)).length;
        const active = drones.filter(d => ACTIVE_STATUSES.includes(d.status)).length;
        websocketService.broadcastStats({
          availableFleet: available,
          activeMissions: active,
          healthStatus: drones.some(d => d.battery_level < 20) ? 'WARNING' : 'NOMINAL',
          aiStatus: active > 0 ? 'ONLINE / TRACKING' : 'ONLINE / IDLE'
        });
      } catch (err) {
        console.error('Telemetry Simulator loop error:', err.message);
      }
    }, 1000);
  },

  stop() {
    if (simIntervalId) {
      clearInterval(simIntervalId);
      simIntervalId = null;
      console.log('Telemetry Simulator: stopped.');
    }
  }
};

module.exports = simulatorService;
