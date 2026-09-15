const express = require('express');
const router = express.Router();
const environment = require('../rl/environment');
const modeManager = require('../rl/modeManager');
const neuralPolicy = require('../rl/policies/neuralPolicy');
const trainer = require('../rl/trainer');
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const securityAuditLogger = require('../services/security/securityAuditLogger');

/**
 * RAPID RL Routes — Phase 2
 *
 * Read-mostly inspection surface for the MDP environment, mode manager
 * and experience buffer. Nothing here trains a model — Phase 2
 * deliberately defers that (see rl/modeManager.js) — this exists so the
 * new machinery is genuinely visible/usable rather than orphaned.
 */

// GET /api/rl/mode
router.get('/mode', (req, res) => {
  res.json({
    mode: modeManager.getMode(),
    canModifyPolicy: modeManager.canModifyPolicy(),
    activePolicy: modeManager.getActivePolicy().name,
    history: modeManager.getHistory()
  });
});

// POST /api/rl/mode  { mode, reason } — mode changes are commander-only
// per architecture Section 11.3's mode-manager safety interlock.
router.post('/mode', requireRole('NATIONAL_COMMANDER', 'STATE_COMMANDER'), (req, res) => {
  try {
    const { mode, reason } = req.body;
    const previousMode = modeManager.getMode();
    const result = modeManager.setMode(mode, { reason });
    securityAuditLogger.logEvent({
      action: securityAuditLogger.EVENTS.RL_MODE_CHANGED,
      actor: { userId: req.user.userId, username: req.user.username, role: req.user.role },
      target: { from: previousMode, to: result.mode },
      details: { reason: reason || null }
    }).catch(err => console.error('Security audit log write failed:', err.message));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/rl/state — current MDP observation snapshot
router.get('/state', async (req, res) => {
  try {
    res.json(await environment.getState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rl/valid-actions?droneId=&incidentId=
router.get('/valid-actions', async (req, res) => {
  try {
    const { droneId, incidentId } = req.query;
    res.json(await environment.getValidActions(droneId, incidentId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rl/experience?limit=20
router.get('/experience', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
    res.json(await db.experienceBuffer.list(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rl/training-status — Phase 7: neuralPolicy's live training
// progress (episodes trained, loss trend). Read-only, no role gate.
router.get('/training-status', (req, res) => {
  res.json({
    mode: modeManager.getMode(),
    canTrain: modeManager.canModifyPolicy(),
    neuralPolicy: neuralPolicy.getStatus()
  });
});

// POST /api/rl/train — manually trigger one training pass over the
// experience buffer. Gated by the same safety interlock as any other
// policy mutation (Section 11.3): only usable in TRAINING mode, and
// commander-only like the mode switch itself.
router.post('/train', requireRole('NATIONAL_COMMANDER', 'STATE_COMMANDER'), async (req, res) => {
  if (!modeManager.canModifyPolicy()) {
    return res.status(400).json({ error: 'Switch to TRAINING mode before triggering a training pass.' });
  }
  try {
    res.json(await trainer.runTrainingStep(req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
