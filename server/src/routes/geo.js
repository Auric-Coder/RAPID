const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { OPERATING_AREAS } = require('../config/geoConfig');
const { resolveAllowedBaseIds } = require('../services/auth/scopeResolver');
const { cacheGet } = require('../middleware/apiCache');

/**
 * RAPID Geo Routes
 *
 * Serves the nationwide hierarchy (Nation -> State -> District -> Base)
 * plus the per-state map overlays (no-fly zones, reference police
 * station markers). The client fetches this instead of keeping its
 * own duplicate copy of geographic constants.
 *
 * nations/states/districts/map-config are cached in middleware/apiCache.js.
 * None of them depend on req.user and none have a mutation route, so a TTL
 * is a bound rather than a staleness risk. /bases is deliberately not
 * cached: it filters through resolveAllowedBaseIds(req.user), so caching it
 * by URL would hand one organisation another's base list.
 */
const TEN_MINUTES = 10 * 60 * 1000;

// GET /api/geo/nations
router.get('/nations', cacheGet(TEN_MINUTES, () => 'geo:nations'), async (req, res) => {
  try {
    res.json(await db.nations.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geo/states
router.get('/states', cacheGet(TEN_MINUTES, () => 'geo:states'), async (req, res) => {
  try {
    res.json(await db.states.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geo/districts?state=PB
router.get('/districts', cacheGet(TEN_MINUTES, req => `geo:districts:${req.query.state || ''}`), async (req, res) => {
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
// Not cached — see the file-header note: this route's result depends on
// req.user's organisation/scope, so caching it by URL would leak one
// caller's response to a different caller.
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
//
// Short TTL (not TEN_MINUTES): noFlyZones comes from airspace_zones, which
// DOES have live write routes (routes/airspace.js). This is safety-relevant
// data for drone operations, so routes/airspace.js actively invalidates
// this cache on every zone create/update/delete instead of relying on the
// TTL alone — the 60s TTL below is a backstop for any invalidation path
// that misses, not the primary correctness mechanism.
const MAP_CONFIG_TTL = 60 * 1000;
router.get('/map-config', cacheGet(MAP_CONFIG_TTL, req => `geo:map-config:${(req.query.state || 'GA').toUpperCase()}`), async (req, res) => {
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
