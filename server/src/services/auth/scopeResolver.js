/**
 * RAPID Auth — Scope Resolver
 *
 * Turns a JWT payload's {organisationId, scopeType, scopeId} into the
 * concrete set of base ids (and, derived from those, state ids) a user
 * is allowed to see — enforcing both "Organisation A cannot see
 * Organisation B's resources" and the National -> State -> District ->
 * Base scope hierarchy.
 */
const db = require('../../config/database');
const { OPERATING_AREAS } = require('../../config/geoConfig');

/**
 * Shared core: selects the caller's visible base RECORDS from an already
 * fetched list. Kept separate so resolveAllowedBaseIds and
 * resolveAllowedStateIds can each answer from a single db.bases.list()
 * rather than fetching the same table twice per request.
 *
 * Scoping rules are unchanged: organisation isolation first, then the
 * national -> state -> district -> base hierarchy.
 */
function selectAllowedBases(user, allBases) {
  const orgBases = allBases.filter(b => b.organisation_id === user.organisationId);

  switch (user.scopeType) {
    case 'national':
      return orgBases;
    case 'state':
      return orgBases.filter(b => b.state_id === user.scopeId);
    case 'district':
      return orgBases.filter(b => b.district_id === user.scopeId);
    case 'base':
      return orgBases.filter(b => b.id === user.scopeId);
    default:
      return [];
  }
}

/**
 * @param {{organisationId: string, scopeType: string, scopeId: string|null}} user
 * @returns {Promise<string[]>} base ids this user can see (possibly empty)
 */
async function resolveAllowedBaseIds(user) {
  const allBases = await db.bases.list({});
  return selectAllowedBases(user, allBases).map(b => b.id);
}

/**
 * @returns {Promise<string[]>} state ids reachable via the user's allowed bases
 */
async function resolveAllowedStateIds(user) {
  // Previously this called db.bases.list({}) AND resolveAllowedBaseIds(),
  // which calls it again - the same table read twice on every request that
  // resolves scope (/api/drones, /api/incidents, /api/geo/bases). One read
  // now serves both, since the state ids are derivable from the same rows.
  const allBases = await db.bases.list({});
  const stateIds = new Set(selectAllowedBases(user, allBases).map(b => b.state_id));
  return [...stateIds];
}

/**
 * Incidents carry no state_id or base_id. They are scoped by whether their
 * coordinates fall inside one of the caller's allowed states' bounds. It lives
 * here so routes/metrics.js and routes/incidents.js apply identical scoping
 * rather than each keeping its own copy.
 *
 * @returns {Promise<Array<{north,south,east,west}>>} bounds boxes the
 *   caller's allowed states fall within
 */
async function resolveAllowedIncidentBounds(user) {
  // One states.list() instead of one states.get() per allowed state -
  // concurrent reads are still N round trips under Supabase, on endpoints
  // the dashboard polls.
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

module.exports = { resolveAllowedBaseIds, resolveAllowedStateIds, resolveAllowedIncidentBounds, isWithinAnyBounds };
