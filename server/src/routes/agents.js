const express = require('express');
const router = express.Router();
const plannerAgent = require('../agents/plannerAgent');

/**
 * RAPID Agents — Multi-Agent Incident Briefing (Phase: agentic AI)
 *
 * Delegates to three specialist agents (dispatch, airspace, comms — see
 * agents/plannerAgent.js) wrapping the existing deterministic services as
 * tools, then synthesizes one controller-facing briefing. No extra role
 * gate beyond the global requireAuth already mounted on /api — read-only
 * advisory endpoint, same convention as GET /api/fleet/recommendation/:id.
 */

// POST /api/agents/incident-briefing  { incidentId, question? }
router.post('/incident-briefing', async (req, res) => {
  try {
    const { incidentId, question } = req.body;
    if (!incidentId) {
      return res.status(400).json({ error: 'incidentId is required.' });
    }

    const result = await plannerAgent.generateBriefing({
      incidentId,
      controllerQuestion: question || null,
      actor: { userId: req.user.userId, username: req.user.username, role: req.user.role }
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/agents/incident-briefing/confirm  { incidentId }
//
// The only endpoint that can actually dispatch a drone via an agent — see
// plannerAgent.js's confirmDispatch() and dispatchExecutionAgent.js's doc
// comments for the two-factor safety design (prior human-reviewed
// proposal + the agent's own re-verification before it acts). Body only
// ever needs incidentId; the drone comes from the server's own stored
// proposal from the last /incident-briefing call, never from client input.
router.post('/incident-briefing/confirm', async (req, res) => {
  try {
    const { incidentId } = req.body;
    if (!incidentId) {
      return res.status(400).json({ error: 'incidentId is required.' });
    }

    const result = await plannerAgent.confirmDispatch({
      incidentId,
      actor: { userId: req.user.userId, username: req.user.username, role: req.user.role }
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
