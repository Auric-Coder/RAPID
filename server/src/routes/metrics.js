const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { resolveAllowedBaseIds, resolveAllowedIncidentBounds, isWithinAnyBounds } = require('../services/auth/scopeResolver');
const { cacheGet } = require('../middleware/apiCache');

// The cache key includes the caller's full scope tuple, not just the route
// path: these responses are per-organisation, and per state, district or base
// within it. Keyed by URL alone, one caller's aggregate reaches another.
function cacheKeyForUser(prefix, user) {
  return `metrics:${prefix}:${user.organisationId}:${user.scopeType}:${user.scopeId || ''}`;
}

// The 3s TTL matches Analytics.jsx's poll interval. It stops simultaneous
// polls recomputing the same aggregation without making the dashboard feel
// less live. Drone and incident data does change within 3s, since the simulator
// ticks every second, so this is a short window rather than a reference-data
// cache.
const METRICS_TTL_MS = 3000;

// Both routes below filter through the same scope helpers /api/drones and
// /api/incidents use, so a metrics summary matches what the caller can see.
// Unfiltered, db.drones.list() and db.incidents.list() handed every
// organisation's aggregates to any authenticated caller: aviation.control, an
// organisation with zero drones, saw national.commander's totals.
async function scopedDronesAndIncidents(user) {
  const [drones, incidents, allowedBaseIds, boundsList] = await Promise.all([
    db.drones.list(),
    db.incidents.list(),
    resolveAllowedBaseIds(user),
    resolveAllowedIncidentBounds(user)
  ]);
  const allowedBases = new Set(allowedBaseIds);
  return {
    drones: drones.filter(d => allowedBases.has(d.base_id)),
    incidents: incidents.filter(i => isWithinAnyBounds(i.latitude, i.longitude, boundsList))
  };
}

// GET /api/metrics/summary - General overview analytics
router.get('/summary', cacheGet(METRICS_TTL_MS, req => cacheKeyForUser('summary', req.user)), async (req, res) => {
  try {
    const { drones, incidents } = await scopedDronesAndIncidents(req.user);

    const activeDronesCount = drones.filter(d => ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Returning', 'Awaiting Controller'].includes(d.status)).length;
    const maintenanceDronesCount = drones.filter(d => d.status === 'maintenance').length;
    const idleDronesCount = drones.filter(d => ['Standby', 'Charging', 'Mission Complete'].includes(d.status)).length;
    
    const activeIncidents = incidents.filter(i => ['reported', 'dispatched', 'active'].includes(i.status)).length;
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved').length;
    
    // Average battery
    const totalBattery = drones.reduce((sum, d) => sum + d.battery_level, 0);
    const avgBattery = drones.length ? Math.round(totalBattery / drones.length) : 100;

    res.json({
      totalDrones: drones.length,
      activeDrones: activeDronesCount,
      maintenanceDrones: maintenanceDronesCount,
      idleDrones: idleDronesCount,
      activeIncidents,
      resolvedIncidents,
      totalIncidents: incidents.length,
      averageBattery: avgBattery
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/historical - Historical trends for charts
router.get('/historical', cacheGet(METRICS_TTL_MS, req => cacheKeyForUser('historical', req.user)), async (req, res) => {
  try {
    const { drones, incidents } = await scopedDronesAndIncidents(req.user);

    // 1. Group incidents by category
    const categoryCounts = {};
    incidents.forEach(inc => {
      categoryCounts[inc.category] = (categoryCounts[inc.category] || 0) + 1;
    });

    const categoryChartData = Object.keys(categoryCounts).map(cat => ({
      name: cat.toUpperCase(),
      value: categoryCounts[cat]
    }));

    // 2. Mock daily incidents count over last 7 days (including real counts from DB)
    const dailyCounts = [
      { day: 'Mon', count: 3 },
      { day: 'Tue', count: 5 },
      { day: 'Wed', count: 2 },
      { day: 'Thu', count: 6 },
      { day: 'Fri', count: 8 },
      { day: 'Sat', count: 4 },
      { day: 'Sun', count: incidents.length || 3 }
    ];

    // 3. Drone utilization statistics
    const droneUsage = drones.map(d => ({
      name: d.call_sign,
      battery: Math.round(d.battery_level),
      status: d.status
    }));

    res.json({
      categories: categoryChartData,
      dailyTrends: dailyCounts,
      droneUsage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
