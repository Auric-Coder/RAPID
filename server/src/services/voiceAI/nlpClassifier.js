/**
 * RAPID Voice AI — NLP Classification (Phase 3, STUB)
 *
 * Deterministic keyword-based category + severity classifier — same
 * "explainable, deterministic, NOT a trained model" labelling philosophy
 * as fleetDecisionEngine.js. This is what "stub pipeline" means per the
 * architecture doc's open question #4: real intent/sentiment ML is a
 * later swap-in, this makes the pipeline shape real today.
 */

const CATEGORY_KEYWORDS = {
  fire: ['fire', 'smoke', 'burning', 'flames', 'blaze'],
  medical: ['unconscious', 'medical', 'ambulance', 'heart attack', 'cardiac', 'bleeding', 'injured', 'breathing', 'collapsed'],
  assault: ['attack', 'assault', 'fight', 'stabbed', 'beaten', 'gun', 'knife', 'weapon', 'shooting', 'threat'],
  theft: ['theft', 'stolen', 'robbery', 'robbed', 'snatched', 'burglar', 'pickpocket'],
  traffic: ['accident', 'collision', 'crash', 'hit and run', 'overturned', 'traffic'],
  trespass: ['trespass', 'break-in', 'breaking in', 'intruder', 'suspicious person', 'prowler'],
  other: []
};

const CRITICAL_KEYWORDS = ['dying', 'unconscious', 'gun', 'pistol', 'rifle', 'weapon', 'shooting', 'stabbed', 'knife', 'not breathing', 'trapped', 'fire spreading'];
const HIGH_KEYWORDS = ['injured', 'bleeding', 'attack', 'assault', 'accident', 'theft', 'robbery', 'threat', 'threatening'];
const LOW_KEYWORDS = ['minor', 'small', 'already left', 'no injury', 'false alarm'];

function scoreCategory(textLower) {
  const scores = {};
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = keywords.filter(k => textLower.includes(k)).length;
  }
  return scores;
}

function pickTop(scores) {
  const entries = Object.entries(scores).filter(([cat]) => cat !== 'other');
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length === 0 || entries[0][1] === 0) return { category: 'other', matches: 0 };
  return { category: entries[0][0], matches: entries[0][1] };
}

function classifySeverity(textLower) {
  const criticalHits = CRITICAL_KEYWORDS.filter(k => textLower.includes(k)).length;
  const highHits = HIGH_KEYWORDS.filter(k => textLower.includes(k)).length;
  const lowHits = LOW_KEYWORDS.filter(k => textLower.includes(k)).length;

  if (criticalHits > 0) return { severity: 'critical', confidence: Math.min(0.95, 0.6 + criticalHits * 0.15) };
  if (lowHits > 0 && highHits === 0) return { severity: 'low', confidence: Math.min(0.9, 0.5 + lowHits * 0.15) };
  if (highHits > 0) return { severity: 'high', confidence: Math.min(0.9, 0.5 + highHits * 0.15) };
  return { severity: 'medium', confidence: 0.4 };
}

/**
 * @param {string} transcript
 * @returns {{
 *   category: string, categoryConfidence: number,
 *   severity: string, severityConfidence: number,
 *   secondaryCategory: string|null, secondaryConfidence: number
 * }}
 */
function classify(transcript) {
  const textLower = (transcript || '').toLowerCase();
  const scores = scoreCategory(textLower);
  const { category, matches } = pickTop(scores);
  const categoryConfidence = matches === 0 ? 0.2 : Math.min(0.95, 0.5 + matches * 0.15);

  const remaining = { ...scores };
  delete remaining[category];
  const { category: secondaryCategory, matches: secondaryMatches } = pickTop(remaining);
  const hasSecondary = secondaryMatches > 0;

  const { severity, confidence: severityConfidence } = classifySeverity(textLower);

  return {
    category,
    categoryConfidence: parseFloat(categoryConfidence.toFixed(2)),
    severity,
    severityConfidence: parseFloat(severityConfidence.toFixed(2)),
    secondaryCategory: hasSecondary ? secondaryCategory : null,
    secondaryConfidence: hasSecondary ? parseFloat(Math.min(0.9, 0.4 + secondaryMatches * 0.15).toFixed(2)) : null
  };
}

module.exports = { classify };
