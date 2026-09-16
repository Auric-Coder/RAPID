/**
 * RAPID Camera — Evidence Hasher (Phase 4)
 *
 * SHA-256 hash chain for evidence records (snapshots, mission
 * recordings), per architecture Section 8.1's "STORE -> HASH" step.
 * Each new evidence item for a given incident links to the previous
 * one's hash; deleting, reordering, or altering an entry after the
 * fact breaks the chain, which is what makes it tamper-evident.
 *
 * The exact JSON string that was hashed is stored alongside the hash
 * (`hash_payload`) specifically so verification never has to guess at
 * reconstructing it from a possibly-since-mutated DB row — recordings
 * in particular mutate (finalize) after creation.
 */
const crypto = require('crypto');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function canonicalize(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

/**
 * @param {string|null} previousHash - hash of the prior entry in this
 *   evidence chain, or null for the first entry ("GENESIS").
 * @param {object} payload - the immutable fields being sealed.
 * @returns {{ hash: string, canonicalPayload: string }}
 */
function computeEntryHash(previousHash, payload) {
  const canonicalPayload = canonicalize(payload);
  const hash = sha256Hex(`${previousHash || 'GENESIS'}|${canonicalPayload}`);
  return { hash, canonicalPayload };
}

/**
 * Recomputes an entry's hash from its stored canonical payload and
 * compares it to the stored hash — confirms the payload wasn't altered
 * after sealing and that it's still correctly linked to its predecessor.
 */
function verifyEntry(previousHash, canonicalPayload, entryHash) {
  return sha256Hex(`${previousHash || 'GENESIS'}|${canonicalPayload}`) === entryHash;
}

/**
 * Verifies a full ordered chain (oldest first). Returns the first break
 * found, if any.
 */
function verifyChain(entries) {
  let expectedPrevious = null;
  for (const entry of entries) {
    if ((entry.previous_hash || null) !== expectedPrevious) {
      return { valid: false, brokenAt: entry.id, reason: 'previous_hash does not match prior entry' };
    }
    if (!verifyEntry(entry.previous_hash, entry.hash_payload, entry.entry_hash)) {
      return { valid: false, brokenAt: entry.id, reason: 'entry_hash does not match payload' };
    }
    expectedPrevious = entry.entry_hash;
  }
  return { valid: true, brokenAt: null, reason: null };
}

module.exports = { sha256Hex, computeEntryHash, verifyEntry, verifyChain };
