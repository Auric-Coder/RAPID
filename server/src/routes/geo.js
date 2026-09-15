const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { OPERATING_AREAS } = require('../config/geoConfig');
const { resolveAllowedBaseIds } = require('../services/auth/scopeResolver');

/**
 * RAPID Geo Routes
 *
 * Serves the nationwide hierarchy (Nation -> State -> District -> Base)
 * plus the per-state map overlays (no-fly zones, reference police
 * station markers). The client fetches this instead of keeping its
 * own duplicate copy of geographic constants.
 */

// GET /api/geo/nations
router.get('/nations', async (req, res) => {
  try {
    res.json(await db.nations.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geo/states
router.get('/states', async (req, res) => {
  try {
    res.json(await db.states.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geo/districts?state=PB
router.get('/districts', async (req, res) => {
  try {
    const { state } = req.query;
    let stateId;
    if (state) {
      const stateRecord = await db.states.get(state);
      if (!stateRecord) return res.status(404).json({ error: 'State not found' });
      stateId = stateRecord.id;
    }
    res.json(await db.districts.list({ stateId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geo/bases?state=PB&district=<districtId>&page=1&limit=50
router.get('/bases', async (req, res) => {
  try {
    const { state, district, page = 1, limit = 50 } = req.query;
    let stateId;
    if (state) {
      const stateRecord = await db.states.get(state);
      if (!stateRecord) return res.status(404).json({ error: 'State not found' });
      stateId = stateRecord.id;
    }

    const stateScoped = await db.bases.list({ stateId, districtId: district });
    const allowedBaseIds = new Set(await resolveAllowedBaseIds(req.user));
    const all = stateScoped.filter(b => allowedBaseIds.has(b.id));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const start = (pageNum - 1) * limitNum;
    const paged = all.slice(start, start + limitNum);

    res.json({ total: all.length, page: pageNum, limit: limitNum, bases: paged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geo/map-config?state=PB — overlays + camera defaults for one state
router.get('/map-config', async (req, res) => {
  try {
    const stateCode = (req.query.state || 'GA').toUpperCase();
    const area = OPERATING_AREAS.find(a => a.stateCode === stateCode);
    if (!area) return res.status(404).json({ error: `Unknown state code "${stateCode}"` });

    // Zones come from db.airspaceZones (the live, CRUD-able source of
    // truth) rather than geoConfig directly, so the map reflects zones
    // created/edited after startup via routes/airspace.js.
    const stateRecord = await db.states.get(stateCode);
    const zones = stateRecord ? await db.airspaceZones.list({ stateId: stateRecord.id, activeOnly: true }) : [];

    res.json({
      stateCode: area.stateCode,
      stateName: area.stateName,
      mapCenter: area.mapCenter,
      mapZoom: area.mapZoom,
      bounds: area.bounds,
      policeStations: area.policeStations,
      noFlyZones: zones.map(z => ({
        id: z.id, name: z.name, type: z.type, restrictionLevel: z.restriction_level, polygon: z.polygon
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
