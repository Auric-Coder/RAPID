const express = require('express');
const router = express.Router();
const db = require('../config/database');
const airspaceManager = require('../services/airspace/airspaceManager');
const { requireRole } = require('../middleware/auth');
const securityAuditLogger = require('../services/security/securityAuditLogger');

function auditLog(event) {
  securityAuditLogger.logEvent(event).catch(err => console.error('Security audit log write failed:', err.message));
}

function actorFrom(req) {
  return { userId: req.user.userId, username: req.user.username, role: req.user.role };
}

/**
 * RAPID Airspace Routes
 * Mounted at /api/airspace. See services/airspace/airspaceManager.js.
 */

// Aviation Control can issue airspace restrictions visible to ALL
// organisations. Commanders can too, for their own organisation's
// operating area (e.g. a state police commander declaring a temporary
// restriction around an incident).
const ZONE_WRITE_ROLES = ['AIRSPACE_AUTHORITY', 'NATIONAL_COMMANDER', 'STATE_COMMANDER'];

// GET /api/airspace/zones?state=GA&activeOnly=true
router.get('/zones', async (req, res) => {
  try {
    const { state, activeOnly } = req.query;
    let stateId;
    if (state) {
      const stateRecord = await db.states.get(state);
      if (!stateRecord) return res.status(404).json({ error: 'State not found' });
      stateId = stateRecord.id;
    }
    res.json(await airspaceManager.listZonesForState(stateId, { activeOnly: activeOnly !== 'false' }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/airspace/zones/:id
router.get('/zones/:id', async (req, res) => {
  try {
    const zone = await db.airspaceZones.get(req.params.id);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });
    res.json(zone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/airspace/zones  { name, type, state (code), polygon, restriction_level, ... }
router.post('/zones', requireRole(...ZONE_WRITE_ROLES), async (req, res) => {
  try {
    const { state, ...rest } = req.body;
    let stateId = rest.state_id;
    if (state) {
      const stateRecord = await db.states.get(state);
      if (!stateRecord) return res.status(404).json({ error: 'State not found' });
      stateId = stateRecord.id;
    }
    if (!stateId) return res.status(400).json({ error: 'state (code) or state_id is required' });
    const zone = await airspaceManager.createZone({ ...rest, state_id: stateId });
    auditLog({ action: securityAuditLogger.EVENTS.ZONE_CREATED, actor: actorFrom(req), target: { zoneId: zone.id, name: zone.name } });
    res.status(201).json(zone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/airspace/zones/:id
router.patch('/zones/:id', requireRole(...ZONE_WRITE_ROLES), async (req, res) => {
  try {
    const zone = await airspaceManager.updateZone(req.params.id, req.body);
    auditLog({ action: securityAuditLogger.EVENTS.ZONE_UPDATED, actor: actorFrom(req), target: { zoneId: zone.id, name: zone.name }, details: { fields: Object.keys(req.body || {}) } });
    res.json(zone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/airspace/zones/:id — soft delete (sets active: false)
router.delete('/zones/:id', requireRole(...ZONE_WRITE_ROLES), async (req, res) => {
  try {
    const zone = await airspaceManager.deactivateZone(req.params.id);
    auditLog({ action: securityAuditLogger.EVENTS.ZONE_DELETED, actor: actorFrom(req), target: { zoneId: zone.id, name: zone.name } });
    res.json(zone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
