/**
 * RAPID Agent Tool — get_dispatch_recommendation
 *
 * Wraps fleetDecisionEngine.generateRecommendation(incidentId) — the
 * existing deterministic, explainable dispatch engine (see
 * services/fleetDecisionEngine.js) — unchanged. incidentId is bound via
 * closure when the tool is created, not exposed as a model-chosen
 * argument: the specialist that uses this tool already knows which
 * incident it's briefing on, so there's no reason to let the model
 * supply (and potentially invent) a different one.
 */
const fleetDecisionEngine = require('../../services/fleetDecisionEngine');

function createDispatchRecommendationTool(incidentId) {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'get_dispatch_recommendation',
        description: "Get RAPID's deterministic fleet decision engine's ranked drone candidates and top recommendation for this incident. This is the authoritative source for which drone (if any) should respond — never invent or guess a drone.",
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    async execute() {
      return fleetDecisionEngine.generateRecommendation(incidentId);
    }
  };
}

module.exports = { createDispatchRecommendationTool };
