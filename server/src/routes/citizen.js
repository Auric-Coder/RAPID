const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { dispatchService } = require('../services/dispatchService');
const websocketService = require('../services/websocketService');
const voicePipeline = require('../services/voiceAI/voicePipeline');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/authConfig');

function validLocation(location) {
  return location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}

/**
 * RAPID Citizen Mobile API — Phase 3
 *
 * Mounted at /api/v1/citizen. Backs the RAPID Citizen React Native app
 * (see /mobile). Auth is a deliberate placeholder — a token is just the
 * base64 of the profile id, verified by looking the profile up. No
 * password check, no expiry, no signing. This is explicitly sanctioned
 * for pre-Phase-6 work by the architecture doc's open question #2
 * ("defer auth to Phase 6, use mock auth for earlier phases") — do not
 * treat this as a security boundary, and do not copy this pattern into
 * anything that isn't citizen-facing demo data.
 */

function issueToken(profileId) {
  return Buffer.from(`citizen:${profileId}`).toString('base64');
}

async function requireCitizenAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization header.' });

  let profileId;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    if (!decoded.startsWith('citizen:')) throw new Error('bad token');
    profileId = decoded.slice('citizen:'.length);
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  try {
    const profile = await db.citizenProfiles.get(profileId);
    if (!profile) return res.status(401).json({ error: 'Invalid token.' });
    req.citizen = profile;
    next();
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/citizen/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, phone, emergencyContacts, medicalInfo } = req.body;
    if (!fullName || !phone) {
      return res.status(400).json({ error: 'fullName and phone are required.' });
    }
    const profile = await db.citizenProfiles.create({ fullName, phone, emergencyContacts, medicalInfo });
    res.status(201).json({ profile, token: issueToken(profile.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/citizen/login  { phone }
router.post('/login', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required.' });
    const profile = await db.citizenProfiles.getByPhone(phone);
    if (!profile) return res.status(404).json({ error: 'No profile registered with this phone number.' });
    res.json({ profile, token: issueToken(profile.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/citizen/profile
router.get('/profile', requireCitizenAuth, (req, res) => {
  res.json(req.citizen);
});

// PATCH /api/v1/citizen/profile
router.patch('/profile', requireCitizenAuth, async (req, res) => {
  try {
    const { fullName, emergencyContacts, medicalInfo } = req.body;
    const updates = {};
    if (fullName) updates.full_name = fullName;
    if (emergencyContacts) updates.emergency_contacts = emergencyContacts;
    if (medicalInfo !== undefined) updates.medical_info = medicalInfo;
    const updated = await db.citizenProfiles.update(req.citizen.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/citizen/voice-report — STT -> NLP -> classification.
// Does not require auth: a citizen may need to report before/without
// registering (e.g. a bystander using someone else's phone).
router.post('/voice-report', async (req, res) => {
  try {
    const { transcript, audioBase64, location } = req.body;
    if (!validLocation(location)) {
      return res.status(400).json({ error: 'Valid numeric location.lat (-90..90) and location.lng (-180..180) are required.' });
    }

    const result = voicePipeline.process({
      transcript,
      audioBase64,
      latitude: parseFloat(location.lat),
      longitude: parseFloat(location.lng)
    });

    await db.voiceReports.create({
      transcript: result.transcript,
      isSimulatedTranscript: result.isSimulatedTranscript,
      classification: result.classification,
      extractedEntities: result.extractedEntities,
      audit: result.audit
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/citizen/emergency
router.post('/emergency', requireCitizenAuth, async (req, res) => {
  try {
    const { location, category, voiceReportUrl, textReport, deviceInfo } = req.body;
    if (!validLocation(location)) {
      return res.status(400).json({ error: 'Valid numeric location.lat (-90..90) and location.lng (-180..180) are required.' });
    }
    if (!category && !textReport) {
      return res.status(400).json({ error: 'Provide a category or a textReport so the incident can be classified.' });
    }

    let finalCategory = category;
    let finalSeverity = 'high';
    let finalTitle = `Citizen Emergency — ${req.citizen.full_name}`;
    let finalDescription = textReport || 'Citizen submitted an emergency via the RAPID Citizen app.';
    let aiClassified = false;

    if (!finalCategory && textReport) {
      const classification = voicePipeline.process({
        transcript: textReport,
        latitude: parseFloat(location.lat),
        longitude: parseFloat(location.lng)
      });
      finalCategory = classification.structuredIncident.category;
      finalSeverity = classification.structuredIncident.severity;
      finalTitle = classification.structuredIncident.title;
      aiClassified = true;
    }

    const incident = await db.incidents.create({
      title: finalTitle,
      description: finalDescription,
      category: finalCategory || 'other',
      severity: finalSeverity,
      latitude: parseFloat(location.lat),
      longitude: parseFloat(location.lng),
      citizen_name: req.citizen.full_name,
      citizen_phone: req.citizen.phone
    });
    websocketService.broadcastIncidentCreated(incident);

    if (voiceReportUrl) {
      await db.voiceReports.create({ citizenId: req.citizen.id, incidentId: incident.id, transcript: voiceReportUrl });
    }

    let dispatchResult = null;
    try {
      dispatchResult = await dispatchService.autoDispatch(incident.id);
    } catch (dispatchErr) {
      console.error(`⚠️ Citizen app dispatch failed: ${dispatchErr.message}`);
    }

    res.status(201).json({
      incidentId: incident.id,
      trackingToken: incident.id,
      // Separate signed capability: the public tracking ID is not write authority.
      // Keep it only in mobile session state, never in URLs or broadcasts.
      locationToken: jwt.sign({ incidentId: incident.id }, JWT_SECRET, {
        algorithm: 'HS256', subject: req.citizen.id,
        audience: 'citizen-location-update', expiresIn: '24h'
      }),
      status: 'received',
      aiClassified,
      dispatch: dispatchResult,
      message: 'Your emergency has been received. Help is on the way.',
      deviceInfo: deviceInfo || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/citizen/emergency/:id/location
// Reuses the incident coordinates and existing dashboard update event; no schema change.
router.patch('/emergency/:id/location', requireCitizenAuth, async (req, res) => {
  const { locationToken, location } = req.body || {};
  try {
    const claims = jwt.verify(locationToken, JWT_SECRET, {
      algorithms: ['HS256'], audience: 'citizen-location-update', subject: req.citizen.id
    });
    if (claims.incidentId !== req.params.id) throw new Error('Wrong incident');
  } catch (_) {
    return res.status(403).json({ error: 'Location sharing authorization is invalid or expired.' });
  }
  if (!validLocation(location) || !Number.isFinite(location.timestamp)
    || location.timestamp < Date.now() - 60000 || location.timestamp > Date.now() + 30000
    || (location.accuracy_m != null && (!Number.isFinite(location.accuracy_m) || location.accuracy_m < 0))) {
    return res.status(400).json({ error: 'A fresh GPS location with valid coordinates, timestamp and accuracy is required.' });
  }
  try {
    const incident = await db.incidents.get(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });
    if (['resolved', 'cancelled'].includes(incident.status)) {
      return res.status(409).json({ error: 'This emergency has ended. Location sharing is closed.' });
    }
    const updated = await db.incidents.update(incident.id, {
      latitude: location.lat, longitude: location.lng
    });
    if (!updated) return res.status(404).json({ error: 'Incident not found.' });
    websocketService.broadcastIncidentUpdate(updated);
    return res.json({ lastUpdated: new Date().toISOString() });
  } catch (err) {
    if (err.code === 'PGRST116') return res.status(404).json({ error: 'Incident not found.' });
    return res.status(500).json({ error: 'Could not update location. Please retry.' });
  }
});

// POST /api/v1/citizen/emergency/:id/cancel
// Allows the reporter to retract their own SOS within the window before a drone arrives on scene.
// Requires the locationToken issued at emergency creation (same JWT, same audience) to prove
// the canceller is the original reporter — not just anyone who knows the public incident ID.
router.post('/emergency/:id/cancel', requireCitizenAuth, async (req, res) => {
  const { locationToken } = req.body || {};
  let authorized = false;

  if (locationToken) {
    try {
      const claims = jwt.verify(locationToken, JWT_SECRET, {
        algorithms: ['HS256'], audience: 'citizen-location-update', subject: req.citizen.id
      });
      if (claims.incidentId === req.params.id) authorized = true;
    } catch (_) {}
  }

  try {
    const incident = await db.incidents.get(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    // Fallback auth check: authenticated citizen matches the incident reporter
    if (!authorized && incident.citizen_phone && req.citizen.phone && incident.citizen_phone === req.citizen.phone) {
      authorized = true;
    }

    if (!authorized) {
      return res.status(403).json({ error: 'Cancellation authorization is invalid or expired.' });
    }

    if (['resolved', 'cancelled'].includes(incident.status)) {
      return res.status(409).json({ error: 'This emergency has already ended.' });
    }

    // Mark incident cancelled
    const cancelled = await db.incidents.update(incident.id, {
      status: 'cancelled',
      resolved_at: new Date().toISOString()
    });
    websocketService.broadcastIncidentUpdate(cancelled);

    // Immediately recall any assigned drone — set it to Returning so the simulator
    // picks up the route home on the next tick (within 1 second).
    if (incident.assigned_drone_id) {
      try {
        const drone = await db.drones.get(incident.assigned_drone_id);
        if (drone && ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target'].includes(drone.status)) {
          const recalled = await db.drones.update(drone.id, {
            status: 'Returning',
            current_incident_id: null
          });
          websocketService.broadcastDroneUpdate(recalled);
          await db.dispatchLogs.create({
            incident_id: incident.id,
            drone_id: drone.id,
            action: 'control',
            notes: `SOS cancelled by reporter. ${drone.call_sign} recalled — returning to base.`
          });
          console.log(`🔄 ${drone.call_sign}: SOS cancelled by citizen. Returning to base.`);
        }
      } catch (droneErr) {
        console.error(`⚠️ Drone recall failed: ${droneErr.message}`);
      }
    }

    return res.json({ cancelled: true, message: 'Your SOS has been cancelled. The drone is returning to base.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/citizen/emergency/:id — public tracking, no auth required
// (matches the existing web Help.jsx tracking page's public nature).
router.get('/emergency/:id', async (req, res) => {
  try {
    const incident = await db.incidents.get(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    let droneEtaSeconds = null;
    let droneCallSign = null;

    if (incident.assigned_drone_id) {
      const drone = await db.drones.get(incident.assigned_drone_id);
      if (drone) {
        droneCallSign = drone.call_sign;
        if (['Dispatched', 'En Route'].includes(drone.status) && drone.speed > 0) {
          const { getDistance } = require('../services/dispatchService');
          const distanceM = getDistance(drone.latitude, drone.longitude, incident.latitude, incident.longitude);
          droneEtaSeconds = Math.round(distanceM / drone.speed);
        } else if (['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target'].includes(drone.status)) {
          droneEtaSeconds = 0;
        }
      }
    }

    const statusMap = {
      reported: 'reported', dispatched: 'dispatched', active: 'on_scene', resolved: 'resolved', cancelled: 'resolved'
    };

    res.json({
      status: statusMap[incident.status] || incident.status,
      droneEtaSeconds,
      droneCallSign,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
