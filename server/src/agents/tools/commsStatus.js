/**
 * RAPID Agent Tool — get_comms_status
 *
 * Wraps communication/communicationService.getSession(droneId) — the
 * existing in-memory PTT session state — bound via closure for the same
 * reason as the other specialist tools.
 */
const communicationService = require('../../services/communication/communicationService');

function createCommsStatusTool(droneId) {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'get_comms_status',
        description: 'Get the current push-to-talk / communication link status for the recommended drone.',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    async execute() {
      return communicationService.getSession(droneId);
    }
  };
}

module.exports = { createCommsStatusTool };
