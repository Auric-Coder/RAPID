/**
 * RAPID Camera — Camera Manager (Phase 4)
 *
 * Formalizes the recording/snapshot lifecycle that used to be inline
 * in simulatorService.js and drones.js into one service, per
 * architecture Section 8. Behavior is preserved exactly (auto-start on
 * mission start, auto-finalize on mission end, same log messages) —
 * the only new behavior is the evidence hash chain and night-vision
 * tagging layered on top.
 *
 * Chains are scoped per-incident and per-evidence-type (one chain for
 * this incident's snapshots, a separate one for its recordings) rather
 * than one merged timeline — simpler to reason about and verify
 * correctly, at the cost of not proving relative ordering *between*
 * a snapshot and a recording segment. Recordings are only sealed at
 * finalization time, since that's when they become immutable — a
 * "recording" status row has no hash yet by design.
 */
const db = require('../../config/database');
const evidenceHasher = require('./evidenceHasher');
const nightVisionController = require('./nightVisionController');

async function lastSnapshotHash(incidentId) {
  if (!incidentId) return null;
  const snapshots = await db.snapshots.listForIncident(incidentId);
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1].entry_hash || null;
}

async function lastFinalizedRecordingHash(missionId) {
  if (!missionId) return null;
  const recordings = await db.missionRecordings.listForMission(missionId);
  const finalized = recordings.filter(r => r.status === 'finalized' && r.entry_hash);
  if (finalized.length === 0) return null;
  return finalized[finalized.length - 1].entry_hash;
}

/**
 * Creates a snapshot with its evidence hash sealed immediately — a
 * snapshot never mutates after creation, so it can be sealed up front.
 */
async function createEvidenceSnapshot(data, { cameraMode = 'auto' } = {}) {
  const previousHash = await lastSnapshotHash(data.incident_id);
  const nightVisionActive = nightVisionController.isNightVisionActive(cameraMode);

  const payload = {
    incident_id: data.incident_id || null,
    drone_id: data.drone_id,
    label: data.label,
    latitude: data.latitude,
    longitude: data.longitude,
    heading: data.heading ?? null,
    altitude: data.altitude ?? null,
    reason: data.reason || 'manual',
    target: data.target || null,
    night_vision_active: nightVisionActive
  };
  const { hash, canonicalPayload } = evidenceHasher.computeEntryHash(previousHash, payload);

  return db.snapshots.create({
    ...data,
    night_vision_active: nightVisionActive,
    previous_hash: previousHash,
    entry_hash: hash,
    hash_payload: canonicalPayload
  });
}

/**
 * Starts a mission recording — unchanged from the prior inline
 * behavior (no hash yet; sealed at finalizeRecording()).
 */
async function startRecording(data) {
  return db.missionRecordings.create(data);
}

/**
 * Finalizes a recording and seals its evidence hash. `recording` is
 * the existing in-flight record (status: 'recording'); this is the
 * moment it becomes immutable.
 */
async function finalizeRecording(recording, { endTime, durationSec }) {
  const previousHash = await lastFinalizedRecordingHash(recording.mission_id);

  const payload = {
    mission_id: recording.mission_id,
    drone_id: recording.drone_id,
    rakshak_id: recording.rakshak_id,
    status: 'finalized',
    source: recording.source,
    recording_start: recording.recording_start,
    recording_end: endTime,
    duration_seconds: durationSec
  };
  const { hash, canonicalPayload } = evidenceHasher.computeEntryHash(previousHash, payload);

  return db.missionRecordings.update(recording.id, {
    status: 'finalized',
    recording_end: endTime,
    duration_seconds: durationSec,
    previous_hash: previousHash,
    entry_hash: hash,
    hash_payload: canonicalPayload
  });
}

/**
 * GET-style helper for an incident's full evidence chain (both types),
 * each verified independently. Used by routes/evidence.js.
 */
async function getEvidenceChain(incidentId) {
  const [snapshots, recordings] = await Promise.all([
    db.snapshots.listForIncident(incidentId),
    db.missionRecordings.listForMission(incidentId)
  ]);

  const finalizedRecordings = recordings.filter(r => r.status === 'finalized');
  const snapshotChain = evidenceHasher.verifyChain(snapshots);
  const recordingChain = evidenceHasher.verifyChain(finalizedRecordings);

  return {
    incidentId,
    snapshots: { count: snapshots.length, chainValid: snapshotChain.valid, brokenAt: snapshotChain.brokenAt },
    recordings: { count: finalizedRecordings.length, chainValid: recordingChain.valid, brokenAt: recordingChain.brokenAt }
  };
}

module.exports = { createEvidenceSnapshot, startRecording, finalizeRecording, getEvidenceChain };
