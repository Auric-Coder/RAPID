/**
 * RAPID RL — Action Space
 *
 * The 9-action space for the RL dispatch policy.
 */

const constraintValidator = require('./constraintValidator');

const ACTIONS = Object.freeze({
  DISPATCH: 'DISPATCH',
  REASSIGN: 'REASSIGN',
  TRACK: 'TRACK',
  RETURN: 'RETURN',
  HOLD: 'HOLD',
  PATROL: 'PATROL',
  HANDOFF: 'HANDOFF',
  MISSION_END: 'MISSION_END',
  NO_ACTION: 'NO_ACTION'
});

// Nothing left permanently unimplemented — kept as an empty set (rather
// than removed) so future actions have an obvious place to be masked
// off while they're being built.
const NOT_YET_IMPLEMENTED = new Set([]);

const TRACKABLE_STATUSES = ['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target'];
const RETURN_INELIGIBLE_STATUSES = ['Standby', 'Charging', 'maintenance', 'Returning'];
const PATROL_ELIGIBLE_STATUSES = ['Standby', 'Charging'];

/**
 * Build the action mask for one (drone, incident) candidate pair.
 *
 * @param {object} params
 * @param {object|null} params.drone
 * @param {object|null} params.incident
 * @param {object[]} params.noFlyZones - zones active in the drone's state
 * @returns {Record<string, boolean> & { _airspaceRejection?: string }}
 */
function getValidActions({ drone, incident, noFlyZones = [] } = {}) {
  const mask = {};
  for (const action of Object.values(ACTIONS)) {
    mask[action] = !NOT_YET_IMPLEMENTED.has(action);
  }

  if (drone) {
    mask.DISPATCH = mask.DISPATCH && constraintValidator.canDispatch(drone).allowed;
    mask.REASSIGN = mask.REASSIGN && drone.status === 'Returning';
    mask.TRACK = mask.TRACK && TRACKABLE_STATUSES.includes(drone.status);
    mask.RETURN = mask.RETURN && !RETURN_INELIGIBLE_STATUSES.includes(drone.status);
    mask.MISSION_END = mask.MISSION_END && drone.status === 'Mission Complete';
    mask.HOLD = mask.HOLD && drone.status !== 'Standby' && drone.status !== 'Charging';
    // A Standby/Charging drone can be assigned a new patrol mission;
    // a drone already Patrolling can be the *subject* of a handoff
    // (i.e. it's the one being relieved), not the target of PATROL again.
    mask.PATROL = mask.PATROL && PATROL_ELIGIBLE_STATUSES.includes(drone.status) && constraintValidator.canDispatch(drone).allowed;
    mask.HANDOFF = mask.HANDOFF && drone.status === 'Patrolling';
  } else {
    // No specific drone in context — only NO_ACTION is meaningful.
    mask.DISPATCH = mask.REASSIGN = mask.TRACK = mask.RETURN = mask.HOLD = mask.MISSION_END = mask.PATROL = mask.HANDOFF = false;
  }

  if (drone && incident && mask.DISPATCH) {
    const airspace = constraintValidator.checkRouteAirspace(
      drone.latitude, drone.longitude, incident.latitude, incident.longitude, noFlyZones
    );
    if (!airspace.allowed) {
      mask.DISPATCH = false;
      mask._airspaceRejection = airspace.reason;
    }
  }

  return mask;
}

module.exports = { ACTIONS, NOT_YET_IMPLEMENTED, getValidActions };
