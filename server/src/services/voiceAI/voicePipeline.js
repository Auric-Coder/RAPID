/**
 * RAPID Voice AI — Pipeline Orchestrator (Phase 3)
 *
 * Voice Input -> STT -> NLP Classification -> Entity Extraction ->
 * Structured Incident, matching architecture Section 7.1/7.2. AI
 * classification is always a recommendation — the caller decides
 * whether to act on it; the controller remains the final authority
 * per R14. Raw transcript/audio are hashed for the audit trail rather
 * than the raw audio itself (which this stub never actually stores).
 */
const crypto = require('crypto');
const sttService = require('./sttService');
const nlpClassifier = require('./nlpClassifier');
const entityExtractor = require('./entityExtractor');

function sha256(text) {
  return `sha256:${crypto.createHash('sha256').update(text || '').digest('hex')}`;
}

/**
 * @param {object} input
 * @param {string|null} input.transcript
 * @param {string|null} input.audioBase64
 * @param {number} input.latitude
 * @param {number} input.longitude
 * @returns {object} VoiceClassificationResult (architecture Section 7.2)
 */
function process({ transcript = null, audioBase64 = null, latitude, longitude } = {}) {
  const startedAt = Date.now();

  const sttResult = sttService.transcribe({ transcript, audioBase64 });
  const classification = nlpClassifier.classify(sttResult.transcript);
  const entities = entityExtractor.extract(sttResult.transcript);

  const locationPhrase = entities.locationMention ? ` near ${entities.locationMention}` : '';
  const title = `${classification.category === 'other' ? 'Emergency' : classification.category.charAt(0).toUpperCase() + classification.category.slice(1)} Reported${locationPhrase}`;

  const structuredIncident = {
    title,
    description: sttResult.isSimulated
      ? 'Citizen submitted a voice report. Transcription unavailable (no STT provider configured) — description is the raw classification only.'
      : `Citizen voice report: "${sttResult.transcript}"`,
    category: classification.category,
    severity: classification.severity,
    latitude,
    longitude,
    source: 'voice_report',
    ai_classified: true,
    requires_controller_review: true
  };

  return {
    transcript: sttResult.transcript,
    isSimulatedTranscript: sttResult.isSimulated,
    classification: {
      category: classification.category,
      categoryConfidence: classification.categoryConfidence,
      severity: classification.severity,
      severityConfidence: classification.severityConfidence,
      secondaryCategory: classification.secondaryCategory,
      secondaryConfidence: classification.secondaryConfidence
    },
    extractedEntities: {
      locationMention: entities.locationMention,
      resolvedCoordinates: (latitude != null && longitude != null) ? { lat: latitude, lng: longitude } : null,
      personsMentioned: entities.personsMentioned,
      weaponsMentioned: entities.weaponsMentioned,
      vehiclesMentioned: entities.vehiclesMentioned
    },
    structuredIncident,
    audit: {
      audioHash: audioBase64 ? sha256(audioBase64) : null,
      transcriptHash: sha256(sttResult.transcript),
      modelVersion: `${sttResult.modelVersion} + rapid-nlp-keyword-v1`,
      processingTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = { process };
