const express = require('express');
const router = express.Router();
const communicationService = require('../services/communication/communicationService');

/**
 * RAPID Communication Routes
 * Mounted at /api/communication. See services/communication/communicationService.js.
 */

// GET /api/communication/:droneId
router.get('/:droneId', (req, res) => {
  res.json(communicationService.getSession(req.params.droneId));
});

// POST /api/communication/:droneId/ptt/start  { missionId }
router.post('/:droneId/ptt/start', async (req, res) => {
  try {
    const { missionId } = req.body;
    res.json(await communicationService.startPtt(req.params.droneId, { missionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/communication/:droneId/ptt/end  { missionId, durationMs }
router.post('/:droneId/ptt/end', async (req, res) => {
  try {
    const { missionId, durationMs } = req.body;
    res.json(await communicationService.endPtt(req.params.droneId, { missionId, durationMs }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/communication/:droneId/settings  { micActive, speakerActive, speakerVolume }
router.patch('/:droneId/settings', (req, res) => {
  try {
    const { micActive, speakerActive, speakerVolume } = req.body;
    res.json(communicationService.updateSettings(req.params.droneId, { micActive, speakerActive, speakerVolume }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
