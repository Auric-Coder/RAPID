const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { dispatchService } = require('../services/dispatchService');
const websocketService = require('../services/websocketService');
const {
  OPERATING_AREAS,
  INCIDENT_TEMPLATES,
  SEVERITY_POOL,
  isWithinAnyOperatingArea
} = require('../config/geoConfig');

/**
 * POST /api/demo/generate
 *
 * Generates a randomized incident inside one of the active operating
 * areas (?state=GA|PB, or a random area if omitted) and triggers the
 * real RAPID dispatch pipeline.
 *
 * This endpoint calls the same db.incidents.create() and dispatchService.autoDispatch()
 * used by normal incident creation — no duplicate dispatch logic.
 *
 * Pipeline:
 *   Generate Random Emergency
 *   → Select random demo location (from the chosen area's curated list)
 *   → Select random category + severity + description
 *   → POST incident to database
 *   → Run autoDispatch (selects closest available Rakshak)
 *   → Simulator picks up new mission on next tick
 *   → Telemetry updates flow to frontend in real-time
 */
router.post('/generate', async (req, res) => {
  try {
    // --------------------------------------------------------
    // 1. Pick an operating area (?state=PB to target one; otherwise
    //    a random one) and a random demo location within it.
    // --------------------------------------------------------
    const requestedState = req.query.state ? String(req.query.state).toUpperCase() : null;
    const area = requestedState
      ? OPERATING_AREAS.find(a => a.stateCode === requestedState)
      : OPERATING_AREAS[Math.floor(Math.random() * OPERATING_AREAS.length)];

    if (!area) {
      return res.status(400).json({ error: `Unknown state code "${requestedState}"` });
    }

    const location = area.demoLocations[Math.floor(Math.random() * area.demoLocations.length)];

    // Safety guard: verify the selected location is within the chosen area's bounds
    if (!isWithinAnyOperatingArea(location.latitude, location.longitude)) {
      console.error(`❌ Demo Generate: Location "${location.name}" is outside all operating areas! Aborting.`);
      return res.status(500).json({ error: 'Generated location is outside all operating areas.' });
    }

    // --------------------------------------------------------
    // 2. Pick a random incident category
    // --------------------------------------------------------
    const categories = Object.keys(INCIDENT_TEMPLATES);
    const category = categories[Math.floor(Math.random() * categories.length)];

    // --------------------------------------------------------
    // 3. Pick a random severity (weighted toward medium/high)
    // --------------------------------------------------------
    const severity = SEVERITY_POOL[Math.floor(Math.random() * SEVERITY_POOL.length)];

    // --------------------------------------------------------
    // 4. Pick a random title + description for the category
    // --------------------------------------------------------
    const template = INCIDENT_TEMPLATES[category];
    const titleTemplate = template.titles[Math.floor(Math.random() * template.titles.length)];
    const description   = template.descriptions[Math.floor(Math.random() * template.descriptions.length)];

    // Inject location name into title
    const title = titleTemplate.replace('{location}', location.name);

    // --------------------------------------------------------
    // 5. Create the incident in the database
    // --------------------------------------------------------
    const incident = await db.incidents.create({
      title,
      description,
      category,
      severity,
      // latitude  = north/south (Goa is ~15° N)
      // longitude = east/west   (Goa is ~73–74° E)
      latitude:  location.latitude,
      longitude: location.longitude,
      status: 'reported'
    });

    console.log(`\n🎲 Demo Incident Generated:`);
    console.log(`   Title:     ${incident.title}`);
    console.log(`   Category:  ${category} | Severity: ${severity}`);
    console.log(`   Location:  ${location.name}`);
    console.log(`   GPS:       [${incident.latitude.toFixed(4)}°N, ${incident.longitude.toFixed(4)}°E]`);
    console.log(`   ID:        ${incident.id}`);
    websocketService.broadcastIncidentCreated(incident);

    // --------------------------------------------------------
    // 6. Trigger the real dispatch pipeline
    // --------------------------------------------------------
    let dispatchResult = null;
    let dispatchError  = null;

    try {
      dispatchResult = await dispatchService.autoDispatch(incident.id);

      if (dispatchResult.success) {
        const { drone, distanceMeters } = dispatchResult;
        console.log(`🚀 Auto-Dispatch:`);
        console.log(`   Rakshak:   ${drone.call_sign}`);
        console.log(`   From:      [${drone.latitude.toFixed(4)}°N, ${drone.longitude.toFixed(4)}°E]`);
        console.log(`   To:        [${incident.latitude.toFixed(4)}°N, ${incident.longitude.toFixed(4)}°E]`);
        console.log(`   Distance:  ${(distanceMeters / 1000).toFixed(2)} km`);
        console.log(`   Est. ETA:  ${Math.round(distanceMeters / 15)}s at 15 m/s cruising speed\n`);
      } else {
        console.log(`⚠️  Auto-Dispatch skipped: ${dispatchResult.message}`);
        console.log(`   Incident "${incident.title}" is waiting for an available Rakshak.\n`);
      }
    } catch (dispatchErr) {
      dispatchError = dispatchErr.message;
      console.error(`❌ Dispatch Error: ${dispatchErr.message}`);
    }

    // --------------------------------------------------------
    // 7. Return the incident + dispatch result to the frontend
    // --------------------------------------------------------
    return res.status(201).json({
      message: 'Demo incident generated successfully',
      incident,
      dispatch: dispatchResult,
      dispatchError: dispatchError || null,
      generatedLocation: location.name
    });

  } catch (err) {
    console.error('❌ Demo Generate Error:', err.message);
    return res.status(500).json({ error: `Failed to generate demo incident: ${err.message}` });
  }
});

module.exports = router;
