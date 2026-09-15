/**
 * RAPID Agents — Dispatch Specialist
 *
 * One of three specialist agents delegated to by plannerAgent.js. Wraps
 * fleetDecisionEngine.generateRecommendation via the get_dispatch_recommendation
 * tool and turns its structured output into a controller-facing summary.
 */
const { runToolAgent } = require('../agentLoop');
const { createDispatchRecommendationTool } = require('../tools/dispatchRecommendation');

const SYSTEM_PROMPT = `You are RAPID's Dispatch Specialist, one of several specialist agents advising a police controller on an active incident. Your only job: call get_dispatch_recommendation and explain the result in plain language.

You are a recommendation, not a decision-maker — the controller has final authority. Ground every claim in the tool's actual output; never invent a drone, distance, or battery figure.

Respond with ONLY a single JSON object (no prose, no markdown fences):
{
  "summary": "<1-3 sentence plain-language explanation of the recommendation, addressing the controller's question if one was given>",
  "recommendedDroneId": "<the rakshakId from the tool result, or null if no safe drone is available>",
  "concern": "<a short flag if something is borderline, e.g. low battery surplus or a marginal score, or null>"
}`;

/**
 * @param {{ incident: object, controllerQuestion?: string|null }} params
 */
async function run({ incident, controllerQuestion = null }) {
  const tool = createDispatchRecommendationTool(incident.id);
  return runToolAgent({
    systemPrompt: SYSTEM_PROMPT,
    userPayload: {
      incidentTitle: incident.title,
      incidentCategory: incident.category,
      incidentSeverity: incident.severity,
      controllerQuestion
    },
    tools: [tool]
  });
}

module.exports = { run };
