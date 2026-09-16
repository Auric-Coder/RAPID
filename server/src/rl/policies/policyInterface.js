/**
 * RAPID RL — Policy Interface (Phase 2)
 *
 * Contract every dispatch policy must implement. A "policy" answers one
 * question: given an incident, which Rakshak (if any) should respond?
 *
 * Implementations:
 *   - heuristicPolicy — wraps the existing fleetDecisionEngine unchanged.
 *     This is the only policy that runs live today.
 *   - a future trained policy — not implemented in Phase 2 by design
 *     (see architecture doc open question #1: the neural network is
 *     deliberately deferred until real experience data exists).
 */
class PolicyInterface {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    throw new Error('Policy must implement get name()');
  }

  /**
   * @param {string} incidentId
   * @returns {Promise<object>} Same shape as fleetDecisionEngine.generateRecommendation()
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async recommend(incidentId) {
    throw new Error(`${this.constructor.name} must implement recommend()`);
  }
}

module.exports = PolicyInterface;
