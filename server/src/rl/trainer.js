/**
 * RAPID RL — Trainer (Phase 7)
 *
 * Samples the experience buffer (real completed-mission outcomes, not
 * synthetic data) and runs one gradient-descent pass on neuralPolicy.
 * Called from two places: modeManager's TRAINING-mode background loop,
 * and a manual POST /api/rl/train for demoing/testing on demand.
 */
const db = require('../config/database');
const featureEncoder = require('./featureEncoder');
const neuralPolicy = require('./policies/neuralPolicy');

const MIN_USABLE_EXPERIENCES = 4;
const DEFAULT_BATCH_SIZE = 32;

async function runTrainingStep({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const experiences = await db.experienceBuffer.list(500);
  const usable = experiences
    .map(e => ({ features: featureEncoder.encodeFromExperience(e), reward: e.reward }))
    .filter(e => e.features && Number.isFinite(e.reward));

  if (usable.length < MIN_USABLE_EXPERIENCES) {
    return {
      trained: false,
      reason: `Not enough completed-mission experience yet (${usable.length}/${MIN_USABLE_EXPERIENCES} usable tuples). Dispatch and complete a few more missions first.`
    };
  }

  // Sample with replacement rather than always training on the whole
  // buffer — keeps each call cheap and gives natural stochasticity even
  // with only a handful of real experiences so far.
  const batch = [];
  const sampleCount = Math.min(batchSize, Math.max(usable.length, MIN_USABLE_EXPERIENCES));
  for (let i = 0; i < sampleCount; i++) {
    batch.push(usable[Math.floor(Math.random() * usable.length)]);
  }

  const result = await neuralPolicy.trainOnBatch(batch.map(b => b.features), batch.map(b => b.reward));
  return { trained: true, batchSize: batch.length, bufferSize: usable.length, ...result };
}

module.exports = { runTrainingStep, MIN_USABLE_EXPERIENCES };
