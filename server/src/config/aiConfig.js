/**
 * RAPID AI — Azure OpenAI Configuration
 *
 * Same self-describing, fail-soft philosophy as authConfig.js: if
 * AZURE_OPENAI_* isn't set, `isConfigured` is false and callers (see
 * voiceAI/voicePipeline.js) fall back to the deterministic classifier
 * instead of crashing. Nothing in this file throws on missing config —
 * that decision belongs to the caller.
 *
 * Targets Azure AI Foundry's unified `/openai/v1` API surface (what the
 * Foundry portal hands you today as the resource endpoint) rather than
 * the older per-deployment `AzureOpenAI` client shape — per Microsoft's
 * current guidance, the v1 API uses the plain `OpenAI` client pointed at
 * `{endpoint}/openai/v1` and drops the separate api-version requirement;
 * the deployment name is passed as `model` on each request instead (see
 * agents/citizenIntakeAgent.js).
 */
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || null;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || null;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || null;

const isConfigured = !!(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY && AZURE_OPENAI_DEPLOYMENT);

if (isConfigured) {
  console.log(`🤖 AI: Azure OpenAI configured (deployment "${AZURE_OPENAI_DEPLOYMENT}") — agentic citizen intake is active.`);
} else {
  console.log('🤖 AI: No AZURE_OPENAI_* env vars set — citizen intake will use the deterministic fallback classifier.');
}

function normalizeV1Endpoint(raw) {
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.endsWith('/openai/v1') ? trimmed : `${trimmed}/openai/v1`;
}

// Lazily constructed so requiring this module never fails even if the
// `openai` package or credentials aren't present — only agents that
// actually run get the cost of constructing a client.
let _client = null;
function getClient() {
  if (!isConfigured) {
    throw new Error('Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT).');
  }
  if (!_client) {
    const { OpenAI } = require('openai');
    _client = new OpenAI({
      baseURL: normalizeV1Endpoint(AZURE_OPENAI_ENDPOINT),
      apiKey: AZURE_OPENAI_API_KEY
    });
  }
  return _client;
}

module.exports = {
  isConfigured,
  getClient,
  AZURE_OPENAI_DEPLOYMENT
};
