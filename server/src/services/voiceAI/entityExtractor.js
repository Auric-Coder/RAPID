/**
 * RAPID Voice AI — Entity Extraction (stub)
 *
 * Regex/keyword-based extraction — an explainable stub, not a trained
 * NER model, same philosophy as nlpClassifier.js.
 */

const WEAPON_KEYWORDS = ['gun', 'knife', 'pistol', 'rifle', 'weapon', 'blade'];
const VEHICLE_KEYWORDS = ['car', 'bike', 'motorcycle', 'truck', 'van', 'vehicle', 'scooter'];
const PERSON_WORDS = ['person', 'people', 'man', 'woman', 'men', 'women', 'child', 'someone', 'individual', 'individuals'];

const LOCATION_PATTERN = /\b(?:near|at|in|outside|behind)\s+(?:the\s+)?([A-Z][A-Za-z0-9'\s]{2,40}?)(?:[.,!]|\s+(?:and|with|where)\b|$)/;

function countPersonMentions(textLower) {
  // Explicit "N people/person" wins if present.
  const numberMatch = textLower.match(/\b(\d+)\s+(people|persons|individuals|men|women)\b/);
  if (numberMatch) return parseInt(numberMatch[1], 10);
  const hits = PERSON_WORDS.filter(w => textLower.includes(w)).length;
  return hits > 0 ? 1 : 0; // at least one person mentioned, exact count unknown
}

/**
 * @param {string} transcript
 * @returns {{
 *   locationMention: string|null,
 *   personsMentioned: number,
 *   weaponsMentioned: boolean,
 *   vehiclesMentioned: boolean
 * }}
 */
function extract(transcript) {
  const text = transcript || '';
  const textLower = text.toLowerCase();

  const locationMatch = text.match(LOCATION_PATTERN);

  return {
    locationMention: locationMatch ? locationMatch[1].trim() : null,
    personsMentioned: countPersonMentions(textLower),
    weaponsMentioned: WEAPON_KEYWORDS.some(k => textLower.includes(k)),
    vehiclesMentioned: VEHICLE_KEYWORDS.some(k => textLower.includes(k))
  };
}

module.exports = { extract };
