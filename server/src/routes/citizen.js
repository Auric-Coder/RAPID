const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { dispatchService } = require('../services/dispatchService');
const websocketService = require('../services/websocketService');
const voicePipeline = require('../services/voiceAI/voicePipeline');

/**
 * RAPID Citizen Mobile API
 *
 * Mounted at /api/v1/citizen. Backs the RAPID Citizen React Native app
 * (see /mobile). Auth is a deliberate placeholder — a token is just the
 * base64 of the profile id, verified by looking the profile up. No
 * password check, no expiry, no signing. Organisation users get real
 * auth (see services/auth/authService.js); this is not that — do not
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

  const profile = await db.citizenProfiles.get(profileId);
  if (!profile) return res.status(401).json({ error: 'Invalid token.' });

  req.citizen = profile;
  next();
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
    if (!location || location.lat == null || location.lng == null) {
      return res.status(400).json({ error: 'location.lat and location.lng are required.' });
    }

    const result = await voicePipeline.process({
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
    if (!location || location.lat == null || location.lng == null) {
      return res.status(400).json({ error: 'location.lat and location.lng are required.' });
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
      const classification = await voicePipeline.process({
        transcript: textReport,
        latitude: parseFloat(location.lat),
        longitude: parseFloat(location.lng),
        citizenMedicalInfo: req.citizen.medical_info || null
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
      console.error(`Citizen app dispatch failed: ${dispatchErr.message}`);
    }

    res.status(201).json({
      incidentId: incident.id,
      trackingToken: incident.id,
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
