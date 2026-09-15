const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || null;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || null;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || null;

const isConfigured = !!(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY && AZURE_OPENAI_DEPLOYMENT);

if (isConfigured) {
  console.log(`AI: Azure OpenAI configured (deployment "${AZURE_OPENAI_DEPLOYMENT}") — agentic citizen intake active.`);
} else {
  console.log('AI: No AZURE_OPENAI_* env vars set — citizen intake will use the deterministic fallback classifier.');
}

function normalizeV1Endpoint(raw) {
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.endsWith('/openai/v1') ? trimmed : `${trimmed}/openai/v1`;
}

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
