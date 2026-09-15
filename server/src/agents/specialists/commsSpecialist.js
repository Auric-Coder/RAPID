/**
 * RAPID Agents — Communications Specialist
 *
 * One of three specialist agents delegated to by plannerAgent.js. Only
 * ever called with a resolved recommendedDroneId (see airspaceSpecialist.js's
 * note — same reasoning). Wraps communicationService.getSession via
 * get_comms_status.
 */
const { runToolAgent } = require('../agentLoop');
const { createCommsStatusTool } = require('../tools/commsStatus');

const SYSTEM_PROMPT = `You are RAPID's Communications Specialist, one of several specialist agents advising a police controller on an active incident. Your only job: call get_comms_status for the recommended drone and explain the result in plain language.

You are a recommendation, not a decision-maker. Ground every claim in the tool's actual output.

Respond with ONLY a single JSON object (no prose, no markdown fences):
{
  "summary": "<1-2 sentence plain-language explanation, addressing the controller's question if one was given>",
  "ready": <boolean - true if a comms link exists and mic/speaker are active>
}`;

/**
 * @param {{ incident: object, dispatchResult: object, controllerQuestion?: string|null }} params
 */
async function run({ incident, dispatchResult, controllerQuestion = null }) {
  const tool = createCommsStatusTool(dispatchResult.recommendedDroneId);
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
