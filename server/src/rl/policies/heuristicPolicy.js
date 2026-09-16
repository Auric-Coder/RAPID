/**
 * RAPID RL — Heuristic Policy (Phase 2)
 *
 * Wraps the existing, unmodified RAPID Fleet Decision Engine as the
 * frozen LIVE policy. R19 (Code Preservation): fleetDecisionEngine.js
 * itself is untouched — this is purely an adapter so the dispatch path
 * can go through the policy interface instead of calling the engine
 * directly, without changing what it actually decides.
 */
const PolicyInterface = require('./policyInterface');
const { generateRecommendation } = require('../../services/fleetDecisionEngine');

class HeuristicPolicy extends PolicyInterface {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    return 'heuristic-v1';
  }

  // eslint-disable-next-line class-methods-use-this
  async recommend(incidentId) {
    const recommendation = await generateRecommendation(incidentId);
    return { ...recommendation, policy: this.name };
  }
}

module.exports = new HeuristicPolicy();
