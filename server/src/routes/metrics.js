const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { resolveAllowedBaseIds, resolveAllowedIncidentBounds, isWithinAnyBounds } = require('../services/auth/scopeResolver');
const { cacheGet } = require('../middleware/apiCache');

// Step 18 (performance): cache key MUST include the caller's full scope
// tuple, not just the route path - these responses are per-organisation
// (and per-state/district/base within it) since the security fix above.
// A cache keyed by URL alone would serve one caller's cached aggregate to
// a different caller with a different scope, exactly the bug just fixed.
function cacheKeyForUser(prefix, user) {
  return `metrics:${prefix}:${user.organisationId}:${user.scopeType}:${user.scopeId || ''}`;
}

// 3s TTL matches Analytics.jsx's own poll interval (Step 13) - this
// doesn't make the dashboard feel less live, it just stops every
// simultaneous poll tick from recomputing the same aggregation from
// scratch. Drone/incident data can change meaningfully within 3s (the
// simulator ticks every 1s), so this is a deliberately short window, not
// a "safe because nothing changes" cache like Steps 5/6's reference data.
const METRICS_TTL_MS = 3000;

// Security fix (Step 18): neither route below applied any scope filtering -
// db.drones.list()/db.incidents.list() were used unfiltered, so any
// authenticated user from any organisation received the entire system's
// aggregate statistics. Measured: aviation.control (a different
// organisation with zero drones) received the identical totalDrones/
// activeIncidents/averageBattery as national.commander. Same class of bug
// as /api/fleet/decisions (fixed earlier in this pass), same fix: filter
// through the same scope helpers /api/drones and /api/incidents already
// use, so a metrics summary always matches what the caller can actually see.
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
