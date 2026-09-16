/**
 * RAPID RL — Mode Manager (Phase 2, trainable policy added Phase 7)
 *
 * LIVE / TRAINING / EVALUATION state machine with the safety interlock
 * from the v1.3 architecture (Section 11.3): the production (LIVE)
 * policy is frozen — LIVE always maps to the untouched heuristicPolicy,
 * never to anything trainable — and nothing can modify a policy's
 * weights outside TRAINING mode.
 *
 * Phase 2 left TRAINING/EVALUATION permanently refused because no
 * trainable/candidate policy existed yet. Phase 7 resolves that: both
 * modes now run neuralPolicy (a real TensorFlow.js model — see
 * policies/neuralPolicy.js). TRAINING additionally drives a background
 * loop that trains it from the experience buffer; EVALUATION runs it
 * read-only for live comparison against the frozen heuristic (see
 * environment.js's shadowComparison).
 */
const heuristicPolicy = require('./policies/heuristicPolicy');
const neuralPolicy = require('./policies/neuralPolicy');
const trainer = require('./trainer');

const MODES = Object.freeze({ LIVE: 'LIVE', TRAINING: 'TRAINING', EVALUATION: 'EVALUATION' });

const REGISTERED_POLICIES = {
  [MODES.LIVE]: heuristicPolicy,
  [MODES.TRAINING]: neuralPolicy,
  [MODES.EVALUATION]: neuralPolicy
};

let currentMode = MODES.LIVE;
let modeHistory = [{
  mode: MODES.LIVE,
  timestamp: new Date().toISOString(),
  reason: 'System startup — LIVE is always the default.'
}];

function getMode() {
  return currentMode;
}

function canModifyPolicy() {
  return currentMode === MODES.TRAINING;
}

function getActivePolicy() {
  return REGISTERED_POLICIES[currentMode] || heuristicPolicy;
}

function setMode(mode, { reason = null } = {}) {
  if (!Object.values(MODES).includes(mode)) {
    throw new Error(`Unknown mode "${mode}". Valid modes: ${Object.values(MODES).join(', ')}`);
  }
  if (!REGISTERED_POLICIES[mode]) {
    throw new Error(`Cannot switch to ${mode}: no policy is registered for it.`);
  }
  currentMode = mode;
  modeHistory = [{ mode, timestamp: new Date().toISOString(), reason }, ...modeHistory].slice(0, 50);
  return { mode: currentMode };
}

function getHistory() {
  return [...modeHistory];
}

// Background training loop (Phase 7): ticks every 8s but is a cheap
// no-op unless the safety interlock is actually open (mode === TRAINING).
// Flipping back to LIVE/EVALUATION stops training on the very next tick —
// `canModifyPolicy()` is re-checked every time, not cached at loop start.
const TRAINING_TICK_MS = 8000;
let trainingInFlight = false;

function startBackgroundTrainingLoop() {
  const timer = setInterval(async () => {
    if (!canModifyPolicy() || trainingInFlight) return;
    trainingInFlight = true;
    try {
      await trainer.runTrainingStep();
    } catch (err) {
      console.error('RL background training step failed:', err.message);
    } finally {
      trainingInFlight = false;
    }
  }, TRAINING_TICK_MS);
  timer.unref?.(); // purely a background convenience — never block process exit on it
  return timer;
}

startBackgroundTrainingLoop();

module.exports = { MODES, getMode, setMode, canModifyPolicy, getActivePolicy, getHistory };
