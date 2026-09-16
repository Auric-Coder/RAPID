/**
 * RAPID Voice AI — Speech-to-Text (Phase 3, STUB)
 *
 * No STT provider is configured in this project (no API keys anywhere in
 * the repo) — per the architecture doc's open question #4, this is the
 * "stub/mock pipeline" path, not a real integration. Swapping in Whisper
 * or Google Cloud STT later means replacing only `transcribe()` below;
 * everything downstream (classification, entity extraction) already
 * consumes plain transcript text and doesn't need to change.
 *
 * To keep the rest of the pipeline genuinely exercisable without a real
 * STT backend, `transcribe()` accepts an already-written transcript as a
 * passthrough (simulating "audio was transcribed to this text") — this
 * is what the mobile app's demo voice recorder actually sends today.
 * When only raw audio is provided with no transcript, a clearly-labelled
 * placeholder is returned instead of fabricating a plausible-sounding
 * fake transcription.
 */

const MODEL_VERSION = 'stub-stt-v0 (no provider configured)';

/**
 * @param {object} input
 * @param {string|null} input.transcript - Pre-written text simulating a
 *   transcription (what the RN app's recorder currently sends).
 * @param {string|null} input.audioBase64 - Raw audio, if ever sent without
 *   a transcript. Not actually decoded/transcribed by this stub.
 * @returns {{ transcript: string, isSimulated: boolean, modelVersion: string }}
 */
function transcribe({ transcript = null, audioBase64 = null } = {}) {
  if (transcript && transcript.trim().length > 0) {
    return { transcript: transcript.trim(), isSimulated: false, modelVersion: MODEL_VERSION };
  }
  if (audioBase64) {
    return {
      transcript: '[SIMULATED TRANSCRIPT — no STT provider configured. See architecture doc Section 7 for the intended Whisper/Google STT integration point.]',
      isSimulated: true,
      modelVersion: MODEL_VERSION
    };
  }
  return { transcript: '', isSimulated: true, modelVersion: MODEL_VERSION };
}

module.exports = { transcribe, MODEL_VERSION };
