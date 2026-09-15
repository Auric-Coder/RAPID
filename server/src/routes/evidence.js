const express = require('express');
const router = express.Router();
const cameraManager = require('../services/camera/cameraManager');

/**
 * RAPID Evidence Routes
 *
 * Read-only inspection of an incident's evidence hash chains (snapshots
 * + finalized recordings). A `chainValid: false` result means the chain
 * linkage or a payload hash doesn't match — evidence has been altered,
 * deleted, or reordered since it was sealed.
 */

// GET /api/evidence/chain/:incidentId
router.get('/chain/:incidentId', async (req, res) => {
  try {
    res.json(await cameraManager.getEvidenceChain(req.params.incidentId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
