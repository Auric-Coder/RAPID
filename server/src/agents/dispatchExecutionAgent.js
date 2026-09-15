/**
 * RAPID Agents — Dispatch Execution Agent
 *
 * The one agent in this codebase with a real actuator. Only ever invoked
 * after a human controller has explicitly confirmed a specific dispatch
 * proposal — see plannerAgent.js's confirmDispatch(), the only caller of
 * this module. Never reachable from citizen input, never run
 * autonomously, never given an incidentId the human didn't already see
 * in a briefing.
 *
 * Two-factor safety: (1) a human already explicitly approved this exact
 * incident/drone pairing, AND (2) this agent re-verifies the
 * recommendation and airspace clearance are still valid *right now*
 * (world state may have changed since the briefing was generated) before
 * calling execute_dispatch. If either re-check fails, it refuses to act
 * and explains why, instead of blindly executing a stale approval.
 */
const { runToolAgent } = require('./agentLoop');
const { createDispatchRecommendationTool } = require('./tools/dispatchRecommendation');
const { createAirspaceClearanceTool } = require('./tools/airspaceClearance');
const { createExecuteDispatchTool } = require('./tools/executeDispatch');

const SYSTEM_PROMPT = `You are RAPID's Dispatch Execution Agent. A human controller has already explicitly reviewed and approved dispatching a specific drone to a specific incident. Your job is NOT to decide whether to dispatch — that decision is already made — it is to be the final automated safety check before executing it.

Before calling execute_dispatch:
1. Call get_dispatch_recommendation to re-verify the currently recommended drone still matches the approved drone.
2. Call check_airspace_clearance to re-verify the route is still clear.

If either check shows something has materially changed since the controller's approval — a different drone is now recommended, the approved drone is no longer eligible, or the airspace is no longer clear — DO NOT call execute_dispatch. Instead, explain what changed and that the controller should review the situation again before retrying.

If both checks confirm the approval still holds, call execute_dispatch to actually launch the drone.

Note: execute_dispatch can itself report failure (e.g. { success: false, message: "..." }) even when you call it correctly — the underlying dispatch system does its own final checks. Report that honestly; calling the tool is not the same as the dispatch having actually succeeded.

After you are done calling tools, respond with ONLY a single JSON object (no prose, no markdown fences):
{
  "executed": <boolean - true only if you called execute_dispatch AND its result showed success>,
  "summary": "<1-3 sentence explanation of what happened, or why you refused to call it>",
  "dispatchResult": <the execute_dispatch tool's result if you called it, otherwise null>
}`;

/**
 * @param {{ incidentId: string, approvedDroneId: string }} params
 * @returns {Promise<{ executed: boolean, summary: string, dispatchResult: object|null }>}
 */
async function confirmAndExecute({ incidentId, approvedDroneId }) {
  const tools = [
    createDispatchRecommendationTool(incidentId),
    createAirspaceClearanceTool({ droneId: approvedDroneId, incidentId }),
    createExecuteDispatchTool(incidentId)
  ];

  const outcome = await runToolAgent({
    systemPrompt: SYSTEM_PROMPT,
    userPayload: { incidentId, approvedDroneId },
    tools
  });

  // Don't trust the model's self-reported `executed` — derive it from the
  // tool's actual result, which is ground truth. A model that calls the
  // tool but misreports the outcome should never look like a real success.
  return {
    ...outcome,
    executed: !!(outcome.dispatchResult && outcome.dispatchResult.success)
  };
}

module.exports = { confirmAndExecute };
