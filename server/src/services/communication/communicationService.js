/**
 * RAPID Communication Service (Phase 4)
 *
 * Formalizes two-way PTT communication as server-side state, per
 * architecture Section 9.2's CommunicationSession model — previously
 * this lived only in the Dashboard's Zustand store (mic/speaker/volume
 * reset on every page reload, and had no server audit trail beyond a
 * generic controller-action log entry).
 *
 * Session state itself is in-memory (mirrors rl/modeManager.js's
 * approach) — it's live operational state, not a business record — but
 * every PTT start/end is also written to dispatchLogs so it survives
 * in the durable per-incident audit trail.
 */
const db = require('../../config/database');

const sessions = new Map(); // droneId -> CommunicationSession

function getOrCreateSession(droneId) {
  if (!sessions.has(droneId)) {
    sessions.set(droneId, {
      drone_id: droneId,
      status: 'idle', // idle | transmitting | receiving | error
      channel_quality: 'good',
      mic_active: true,
      speaker_active: true,
      speaker_volume: 70,
      ptt_log: []
    });
  }
  return sessions.get(droneId);
}

function pushPttEvent(session, event) {
  session.ptt_log = [event, ...session.ptt_log].slice(0, 20);
}

async function startPtt(droneId, { missionId = null, controllerId = 'operator' } = {}) {
  const session = getOrCreateSession(droneId);
  session.status = 'transmitting';
  pushPttEvent(session, { event: 'ptt_start', timestamp: new Date().toISOString(), controllerId });

  await db.dispatchLogs.create({
    incident_id: missionId,
    drone_id: droneId,
    action: 'control',
    notes: 'Push-to-talk transmission started by controller.'
  });

  return { ...session };
}

async function endPtt(droneId, { missionId = null, controllerId = 'operator', durationMs = null } = {}) {
  const session = getOrCreateSession(droneId);
  session.status = 'idle';
  pushPttEvent(session, { event: 'ptt_end', timestamp: new Date().toISOString(), controllerId, durationMs });

  await db.dispatchLogs.create({
    incident_id: missionId,
    drone_id: droneId,
    action: 'control',
    notes: `Push-to-talk transmission ended.${durationMs ? ` Duration: ${(durationMs / 1000).toFixed(1)}s.` : ''}`
  });

  return { ...session };
}

function updateSettings(droneId, { micActive, speakerActive, speakerVolume } = {}) {
  const session = getOrCreateSession(droneId);
  if (micActive !== undefined) session.mic_active = !!micActive;
  if (speakerActive !== undefined) session.speaker_active = !!speakerActive;
  if (speakerVolume !== undefined) session.speaker_volume = Math.max(0, Math.min(100, parseInt(speakerVolume, 10)));
  return { ...session };
}

function getSession(droneId) {
  return { ...getOrCreateSession(droneId) };
}

module.exports = { getSession, startPtt, endPtt, updateSettings };
