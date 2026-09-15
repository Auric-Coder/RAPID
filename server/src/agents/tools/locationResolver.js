/**
 * RAPID Agent Tool — resolve_location
 *
 * Grounds a free-text location mention (e.g. "near the market") against
 * the app's real geography instead of letting the model guess
 * coordinates. Reuses geoConfig's existing OPERATING_AREAS data — the
 * same demoLocations/bases the web dashboard and simulator already use —
 * rather than introducing a second source of truth.
 */
const geoConfig = require('../../config/geoConfig');

function normalize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function wordOverlapScore(a, b) {
  const wordsA = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalize(b).split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let hits = 0;
  for (const w of wordsA) {
    if (w.length < 3) continue; // skip stopword-length noise
    if (wordsB.has(w)) hits++;
  }
  return hits / Math.max(wordsA.size, wordsB.size);
}

function candidatesForArea(area) {
  const candidates = [];
  for (const loc of area.demoLocations || []) {
    candidates.push({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, sourceType: 'demoLocation' });
  }
  for (const district of area.districts || []) {
    for (const base of district.bases || []) {
      candidates.push({ name: base.name, latitude: base.latitude, longitude: base.longitude, sourceType: 'base' });
    }
  }
  for (const ps of area.policeStations || []) {
    candidates.push({ name: ps.name, latitude: ps.latitude, longitude: ps.longitude, sourceType: 'policeStation' });
  }
  return candidates;
}

const definition = {
  type: 'function',
  function: {
    name: 'resolve_location',
    description: "Look up a place name mentioned by the citizen (e.g. 'near the market', 'Calangute Beach') against RAPID's known locations for the relevant state, to get approximate coordinates. Returns null if no confident match is found — do not guess coordinates yourself.",
    parameters: {
      type: 'object',
      properties: {
        mention: { type: 'string', description: 'The location phrase mentioned in the transcript.' },
        stateCode: { type: 'string', description: "Operating area state code, e.g. 'GA' or 'PB'. Omit to search all operating areas." }
      },
      required: ['mention']
    }
  }
};

function execute({ mention, stateCode }) {
  if (!mention || !mention.trim()) return { match: null };

  const areas = stateCode ? [geoConfig.getOperatingArea(stateCode)].filter(Boolean) : geoConfig.OPERATING_AREAS;
  let best = null;
  let bestScore = 0;

  for (const area of areas) {
    for (const candidate of candidatesForArea(area)) {
      const score = wordOverlapScore(mention, candidate.name);
      if (score > bestScore) {
        bestScore = score;
        best = { ...candidate, stateCode: area.stateCode, matchConfidence: parseFloat(score.toFixed(2)) };
      }
    }
  }

  // Require at least one real word to overlap — otherwise it's noise, not a match.
  if (!best || bestScore < 0.34) return { match: null };
  return { match: best };
}

module.exports = { definition, execute };
