const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/metrics/summary - General overview analytics
router.get('/summary', async (req, res) => {
  try {
    const drones = await db.drones.list();
    const incidents = await db.incidents.list();

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
router.get('/historical', async (req, res) => {
  try {
    const incidents = await db.incidents.list();
    
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
    const drones = await db.drones.list();
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
