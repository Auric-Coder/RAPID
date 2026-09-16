/**
 * RAPID RL — Policy Interface
 *
 * Contract every dispatch policy must implement. A "policy" answers one
 * question: given an incident, which Rakshak (if any) should respond?
 *
 * Implementations:
 *   - heuristicPolicy — wraps the existing fleetDecisionEngine unchanged.
 *     This is the only policy that runs in LIVE mode.
 *   - neuralPolicy — a trainable TensorFlow.js model used in TRAINING
 *     and EVALUATION modes.
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
