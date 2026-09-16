/**
 * RAPID Security — Audit Logger
 *
 * SHA-256 hash-chained log of security-relevant events: login attempts,
 * airspace zone writes, RL mode switches, and unauthorized (role-gated)
 * attempts. Reuses camera/evidenceHasher.js's chaining logic unchanged
 * rather than re-deriving a second hash-chain implementation.
 *
 * One global chain (not per-incident like evidence) — every event links
 * to the previous security event regardless of type, so the log's own
 * ordering and completeness is itself verifiable, not just each entry's
 * payload.
 */
const evidenceHasher = require('../camera/evidenceHasher');
const db = require('../../config/database');

const EVENTS = Object.freeze({
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGIN_RATE_LIMITED: 'login_rate_limited',
  LOGOUT: 'logout',
  ZONE_CREATED: 'zone_created',
  ZONE_UPDATED: 'zone_updated',
  ZONE_DELETED: 'zone_deleted',
  RL_MODE_CHANGED: 'rl_mode_changed',
  UNAUTHORIZED_ATTEMPT: 'unauthorized_attempt',
  AI_BRIEFING_GENERATED: 'ai_briefing_generated',
  AI_DISPATCH_CONFIRMED: 'ai_dispatch_confirmed'
});

/**
 * @param {string} action - one of EVENTS
 * @param {object|null} actor - { userId, username, role } or null (e.g. an
 *   unauthenticated login failure has a username but no verified identity)
 * @param {object|null} target - what the action was performed on
 * @param {object} details - free-form, event-specific context
 */
async function logEvent({ action, actor = null, target = null, details = {} }) {
  const previous = await db.securityAuditLog.list(1);
  const previousHash = previous.length ? previous[0].entry_hash : null;

  const payload = { action, actor, target, details, timestamp: new Date().toISOString() };
  const { hash, canonicalPayload } = evidenceHasher.computeEntryHash(previousHash, payload);

  return db.securityAuditLog.create({
    ...payload,
    previousHash,
    entryHash: hash,
    hashPayload: canonicalPayload
  });
}

/**
 * Verifies the full chain (oldest first — db.securityAuditLog.list()
 * returns most-recent-first, so this reverses before checking).
 */
async function verifyChain() {
  const entries = await db.securityAuditLog.list(5000);
  return evidenceHasher.verifyChain([...entries].reverse());
}

module.exports = { EVENTS, logEvent, verifyChain };
