/**
 * RAPID Agent Tool — execute_dispatch
 *
 * The one WRITE-capable tool in this codebase. Bound to a single
 * incidentId via closure, same convention as the read-only tools — the
 * model cannot supply a different incident or drone through this tool's
 * parameters (it has none). execute() calls dispatchService.autoDispatch,
 * the same function already used by the citizen /emergency auto-dispatch
 * path, which always dispatches whatever fleetDecisionEngine currently
 * computes as the best energy/airspace-feasible candidate — this tool
 * cannot be used to dispatch an arbitrary or unsafe drone.
 *
 * Only ever handed to dispatchExecutionAgent.js, which is itself only
 * reachable after a human controller has explicitly confirmed a specific
 * dispatch proposal (see plannerAgent.js's confirmDispatch()).
 */
const { dispatchService } = require('../../services/dispatchService');

function createExecuteDispatchTool(incidentId) {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'execute_dispatch',
        description: "Actually dispatch a drone to this incident, using RAPID's deterministic fleet decision engine to pick it. This is a REAL action that launches a (simulated) drone — only call it after your own re-verification confirms the approved recommendation and airspace clearance still hold.",
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    async execute() {
      return dispatchService.autoDispatch(incidentId);
    }
  };
}

module.exports = { createExecuteDispatchTool };
