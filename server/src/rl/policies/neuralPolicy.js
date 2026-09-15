/**
 * RAPID RL — Neural Policy (Phase 7)
 *
 * Resolves the Phase 2 deferral: a real, trainable TensorFlow.js model
 * (pure-JS CPU backend — no native build step, matches this project's
 * existing avoid-native-deps pattern for bcryptjs on Windows).
 *
 * This is a learned *scorer*, not a full re-implementation of dispatch
 * logic: candidate discovery, eligibility, and energy-feasibility all
 * still come from the untouched fleetDecisionEngine.evaluateFleet() (R19
 * — code preservation), exactly like heuristicPolicy does. The only
 * thing this policy does differently is rank the already-feasible
 * candidates by a learned Q-value instead of the fixed weighted-sum
 * score, so it can never propose a candidate the safety/energy checks
 * would have rejected.
 *
 * Model weights live in memory only — consistent with the rest of this
 * prototype (in-memory DB, JWT secret regenerated per process): training
 * progress resets on server restart. `getStatus()` exposes enough to see
 * that honestly rather than hide it.
 */
const tf = require('@tensorflow/tfjs');
const PolicyInterface = require('./policyInterface');
const db = require('../../config/database');
const fleetDecisionEngine = require('../../services/fleetDecisionEngine');
const featureEncoder = require('../featureEncoder');

const MAX_LOSS_HISTORY = 100;

function buildModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [featureEncoder.FEATURE_NAMES.length], units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 })); // linear — predicts expected reward (Q-value) for this candidate
  model.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError' });
  return model;
}

class NeuralPolicy extends PolicyInterface {
  constructor() {
    super();
    this.model = buildModel();
    this.episodesTrained = 0;
    this.trainSteps = 0;
    this.lossHistory = [];
  }

  // eslint-disable-next-line class-methods-use-this
  get name() {
    return 'neural-dqn-v1';
  }

  predict(features) {
    return tf.tidy(() => this.model.predict(tf.tensor2d([features])).dataSync()[0]);
  }

  async recommend(incidentId) {
    const incident = await db.incidents.get(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    const { ranked } = await fleetDecisionEngine.evaluateFleet(incidentId);
    const viable = ranked.filter(c => c.canComplete);

    if (viable.length === 0) {
      return {
        decision: 'NO_SAFE_RAKSHAK_AVAILABLE',
        reason: 'All energy-feasible Rakshaks are unavailable (neural policy found no viable candidate).',
        recommendation: null,
        allCandidates: ranked,
        incidentId,
        timestamp: new Date().toISOString(),
        policy: this.name
      };
    }

    // Lazy require: environment.js requires modeManager.js, which
    // requires this file (to register it for TRAINING/EVALUATION) — a
    // top-level require here would deadlock that cycle. Same pattern
    // dispatchService.js already uses for the same reason.
    const environment = require('../environment');
    const state = await environment.getState();
    const context = {
      fleetUtilization: state.context.fleetUtilization,
      averageFleetBattery: state.context.averageFleetBattery,
      timeOfDay: state.environment.timeOfDay,
      visibility: state.environment.visibility,
      recentIncidents1h: state.context.recentIncidents1h
    };

    const scored = viable.map(candidate => ({
      candidate,
      qValue: this.predict(featureEncoder.encodeCandidate(candidate, {
        incidentSeverity: incident.severity,
        context,
        isReturning: candidate.isReturningCandidate
      }))
    }));
    scored.sort((a, b) => b.qValue - a.qValue);
    const best = scored[0];
    const c = best.candidate;

    const etaMin = Math.floor(c.etaSeconds / 60);
    const etaSec = c.etaSeconds % 60;
    const reason = [
      `${c.callSign} selected by the trained neural policy (Q=${best.qValue.toFixed(3)}).`,
      `Distance: ${c.distanceToIncidentKm.toFixed(1)} km. ETA: ${etaMin}m ${etaSec}s.`,
      `Battery: ${c.battery}% -> surplus ${c.surplusBattery}%.`,
      `Heuristic suitability for comparison: ${c.score}/100 (${c.suitabilityLabel}).`
    ].join(' ');

    return {
      decision: 'RECOMMENDED',
      recommendation: {
        rakshakId: c.droneId,
        callSign: c.callSign,
        distanceToIncidentM: c.distanceToIncidentM,
        distanceToIncidentKm: c.distanceToIncidentKm,
        etaSeconds: c.etaSeconds,
        battery: c.battery,
        energyToIncident: c.energyToIncident,
        energyOnScene: c.energyOnScene,
        energyToReturn: c.energyToReturn,
        safetyReserve: c.safetyReserve,
        totalRequired: c.totalRequired,
        surplusBattery: c.surplusBattery,
        returnFeasibility: c.returnFeasibility,
        score: c.score,
        suitabilityLabel: c.suitabilityLabel,
        qValue: parseFloat(best.qValue.toFixed(4))
      },
      reason,
      allCandidates: ranked,
      incidentId,
      timestamp: new Date().toISOString(),
      policy: this.name
    };
  }

  /**
   * One gradient-descent pass over a sampled batch of (features, reward)
   * pairs — called by trainer.js, either from the TRAINING-mode
   * background loop or a manual POST /api/rl/train.
   */
  async trainOnBatch(features, targets) {
    const xs = tf.tensor2d(features);
    const ys = tf.tensor2d(targets.map(v => [v]));
    let loss;
    try {
      const history = await this.model.fit(xs, ys, { epochs: 1, verbose: 0 });
      loss = history.history.loss[0];
    } finally {
      xs.dispose();
      ys.dispose();
    }
    this.episodesTrained += features.length;
    this.trainSteps += 1;
    this.lossHistory.push({ step: this.trainSteps, loss, samples: features.length, timestamp: new Date().toISOString() });
    if (this.lossHistory.length > MAX_LOSS_HISTORY) this.lossHistory.shift();
    return { loss, episodesTrained: this.episodesTrained };
  }

  getStatus() {
    return {
      name: this.name,
      episodesTrained: this.episodesTrained,
      trainSteps: this.trainSteps,
      lastLoss: this.lossHistory.length ? this.lossHistory[this.lossHistory.length - 1].loss : null,
      lossHistory: [...this.lossHistory]
    };
  }
}

module.exports = new NeuralPolicy();
