/**
 * RAPID Agents — Airspace Safety Specialist
 *
 * One of three specialist agents delegated to by plannerAgent.js. Only
 * ever called with a resolved recommendedDroneId (plannerAgent skips it
 * entirely when dispatch found no safe drone — nothing to check a route
 * for). Wraps conflictDetector.checkRoute via check_airspace_clearance.
 */
const { runToolAgent } = require('../agentLoop');
const { createAirspaceClearanceTool } = require('../tools/airspaceClearance');

const SYSTEM_PROMPT = `You are RAPID's Airspace Safety Specialist, one of several specialist agents advising a police controller on an active incident. Your only job: call check_airspace_clearance for the recommended drone's route and explain the result in plain language.

You are a recommendation, not a decision-maker. Ground every claim in the tool's actual output; never guess whether a route is clear.

Respond with ONLY a single JSON object (no prose, no markdown fences):
{
  "summary": "<1-2 sentence plain-language explanation, addressing the controller's question if one was given>",
  "clear": <boolean - true if the route is flyable, including advisory-level warnings>,
  "level": "<the zone restriction level if any, or null>",
  "concern": "<a short flag if there's a warning worth the controller's attention, or null>"
}`;

/**
 * @param {{ incident: object, dispatchResult: object, controllerQuestion?: string|null }} params
 */
async function run({ incident, dispatchResult, controllerQuestion = null }) {
  const tool = createAirspaceClearanceTool({ droneId: dispatchResult.recommendedDroneId, incidentId: incident.id });
  return runToolAgent({
    systemPrompt: SYSTEM_PROMPT,
    userPayload: {
      incidentTitle: incident.title,
      recommendedDroneId: dispatchResult.recommendedDroneId,
      controllerQuestion
    },
    tools: [tool]
  });
}

module.exports = { run };
