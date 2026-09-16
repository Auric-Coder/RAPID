const express = require('express');
const router = express.Router();
const db = require('../config/database');
const securityAuditLogger = require('../services/security/securityAuditLogger');
const { requireRole } = require('../middleware/auth');

/**
 * RAPID Security Routes
 *
 * Read surface for the hash-chained security audit log (login attempts,
 * airspace zone writes, RL mode switches, unauthorized role-gated
 * attempts — see services/security/securityAuditLogger.js). Restricted
 * to national/state commanders: the log itself carries cross-agency
 * sensitive detail (usernames, IPs, who tried what without permission).
 */
const AUDIT_READ_ROLES = ['NATIONAL_COMMANDER', 'STATE_COMMANDER'];

// GET /api/security/audit-log?limit=50
router.get('/audit-log', requireRole(...AUDIT_READ_ROLES), async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    res.json(await db.securityAuditLog.list(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/security/audit-log/verify — full hash-chain integrity check,
// mirroring GET /api/evidence/chain/:incidentId's verification pattern.
router.get('/audit-log/verify', requireRole(...AUDIT_READ_ROLES), async (req, res) => {
  try {
    res.json(await securityAuditLogger.verifyChain());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
