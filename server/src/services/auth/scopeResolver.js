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

/**
 * @param {{organisationId: string, scopeType: string, scopeId: string|null}} user
 * @returns {Promise<string[]>} base ids this user can see (possibly empty)
 */
async function resolveAllowedBaseIds(user) {
  const allBases = await db.bases.list({});
  const orgBases = allBases.filter(b => b.organisation_id === user.organisationId);

  switch (user.scopeType) {
    case 'national':
      return orgBases.map(b => b.id);
    case 'state':
      return orgBases.filter(b => b.state_id === user.scopeId).map(b => b.id);
    case 'district':
      return orgBases.filter(b => b.district_id === user.scopeId).map(b => b.id);
    case 'base':
      return orgBases.filter(b => b.id === user.scopeId).map(b => b.id);
    default:
      return [];
  }
}

/**
 * @returns {Promise<string[]>} state ids reachable via the user's allowed bases
 */
async function resolveAllowedStateIds(user) {
  const [baseIds, allBases] = await Promise.all([resolveAllowedBaseIds(user), db.bases.list({})]);
  const baseIdSet = new Set(baseIds);
  const stateIds = new Set(allBases.filter(b => baseIdSet.has(b.id)).map(b => b.state_id));
  return [...stateIds];
}

module.exports = { resolveAllowedBaseIds, resolveAllowedStateIds };
