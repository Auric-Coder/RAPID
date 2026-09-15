/**
 * RAPID Agent Tool — lookup_category_guidance
 *
 * RAG-lite: grounds the model's category/severity judgment in RAPID's
 * own incident taxonomy (geoConfig.INCIDENT_TEMPLATES) instead of the
 * model free-associating what "trespass" or "assault" should mean for
 * this system. No vector store needed — the taxonomy is small and
 * static, so a direct lookup is the right-sized retrieval here.
 */
const { INCIDENT_TEMPLATES } = require('../../config/geoConfig');

const definition = {
  type: 'function',
  function: {
    name: 'lookup_category_guidance',
    description: "Get RAPID's reference description and example phrasing for an incident category, to check whether a candidate classification actually matches how this system defines that category. Valid categories: " + Object.keys(INCIDENT_TEMPLATES).join(', ') + '.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: Object.keys(INCIDENT_TEMPLATES) }
      },
      required: ['category']
    }
  }
};

function execute({ category }) {
  const template = INCIDENT_TEMPLATES[category];
  if (!template) return { found: false };
  return {
    found: true,
    category,
    exampleDescriptions: template.descriptions
  };
}

module.exports = { definition, execute };
