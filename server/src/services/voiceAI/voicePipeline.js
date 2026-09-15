/**
 * RAPID Voice AI — Pipeline Orchestrator (Phase 3, agentic upgrade)
 *
 * Voice Input -> STT -> Classification -> Structured Incident, matching
 * architecture Section 7.1/7.2. AI classification is always a
 * recommendation — the caller decides whether to act on it; the
 * controller remains the final authority per R14.
 *
 * Classification now prefers the real LLM-driven citizenIntakeAgent
 * (see agents/citizenIntakeAgent.js) when Azure OpenAI is configured
 * (config/aiConfig.js), and falls back to the original deterministic
 * nlpClassifier/entityExtractor stub otherwise — or if the agent call
 * fails for any reason (no network, bad response, etc.), so a citizen
 * report is never lost to an AI outage. Which path actually ran is
 * always recorded in `audit.aiEngine`.
 *
 * Raw transcript/audio are hashed for the audit trail rather than the
 * raw audio itself (which this stub never actually stores).
 */
const crypto = require('crypto');
const sttService = require('./sttService');
const nlpClassifier = require('./nlpClassifier');
const entityExtractor = require('./entityExtractor');
const aiConfig = require('../../config/aiConfig');
const citizenIntakeAgent = require('../../agents/citizenIntakeAgent');
const { findOperatingArea } = require('../../config/geoConfig');

function sha256(text) {
  return `sha256:${crypto.createHash('sha256').update(text || '').digest('hex')}`;
}

/**
 * @param {object} input
 * @param {string|null} input.transcript
 * @param {string|null} input.audioBase64
 * @param {number} input.latitude
 * @param {number} input.longitude
 * @param {string|null} input.citizenMedicalInfo - Optional, from the
 *   caller's already-authenticated citizen profile. Only meaningful on
 *   the agent path; the deterministic fallback has no use for it.
 * @returns {Promise<object>} VoiceClassificationResult (architecture Section 7.2)
 */
async function process({ transcript = null, audioBase64 = null, latitude, longitude, citizenMedicalInfo = null } = {}) {
  const startedAt = Date.now();

  const sttResult = sttService.transcribe({ transcript, audioBase64 });

  let classification = null;
  let entities = null;
  let aiEngine = 'deterministic-fallback';
  let locationMentionCoordinates = null;

  if (aiConfig.isConfigured) {
    try {
      const area = (latitude != null && longitude != null) ? findOperatingArea(latitude, longitude) : null;
      const agentResult = await citizenIntakeAgent.classify(sttResult.transcript, {
        stateCode: area ? area.stateCode : null,
        citizenMedicalInfo
      });

      classification = {
        category: agentResult.category,
        categoryConfidence: agentResult.categoryConfidence,
        severity: agentResult.severity,
        severityConfidence: agentResult.severityConfidence,
        secondaryCategory: agentResult.secondaryCategory,
        secondaryConfidence: agentResult.secondaryConfidence
      };
      entities = {
        locationMention: agentResult.locationMention,
        personsMentioned: agentResult.personsMentioned,
        weaponsMentioned: agentResult.weaponsMentioned,
        vehiclesMentioned: agentResult.vehiclesMentioned
      };
      locationMentionCoordinates = agentResult.resolvedCoordinates;
      aiEngine = 'azure-openai-agent';
    } catch (err) {
      console.error('🤖 Citizen intake agent failed, falling back to deterministic classifier:', err.message);
    }
  }

  if (!classification) {
    classification = nlpClassifier.classify(sttResult.transcript);
    entities = entityExtractor.extract(sttResult.transcript);
  }

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
      locationMentionCoordinates,
      personsMentioned: entities.personsMentioned,
      weaponsMentioned: entities.weaponsMentioned,
      vehiclesMentioned: entities.vehiclesMentioned
    },
    structuredIncident,
    audit: {
      audioHash: audioBase64 ? sha256(audioBase64) : null,
      transcriptHash: sha256(sttResult.transcript),
      modelVersion: aiEngine === 'azure-openai-agent' ? `azure-openai:${aiConfig.AZURE_OPENAI_DEPLOYMENT}` : `${sttResult.modelVersion} + rapid-nlp-keyword-v1`,
      aiEngine,
      processingTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = { process };
