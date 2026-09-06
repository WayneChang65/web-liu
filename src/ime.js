// --- Boshiamy IME core logic (pure functions, no DOM) ---
// These are the testable heart of the input engine: dictionary lookup,
// digit selection, and the space-key commit rules (v/r/s/f selectors).

/**
 * Look up the candidate characters for a boshiamy code.
 *
 * Returns an array of candidate characters (whole Unicode code points, so
 * rare CJK Extension-B characters are NOT split into surrogate halves).
 * Returns [] when the code is unknown or the entry is malformed.
 *
 * Uses Object.hasOwn so that prototype keys can never leak through: a naive
 * `data[code]` lookup for the typeable code "constructor" would return
 * Object.prototype.constructor (a function) and crash the editor.
 */
export function lookupCandidates(data, code) {
 if (typeof code !== "string" || code.length === 0) return [];
 if (!Object.hasOwn(data, code)) return [];
 const value = data[code];
 return typeof value === "string" ? Array.from(value) : [];
}

/** Space-selector keys (classic boshiamy) → 0-based candidate index. */
export const SPACE_SELECTOR_MAP = {
 v: 1, // 2nd candidate
 r: 2, // 3rd candidate
 s: 3, // 4th candidate
 f: 4, // 5th candidate
};

/**
 * Pick the candidate for a digit keypress (0–9) on the given page.
 * Returns the character to commit, or null when the index is out of range.
 */
export function selectByDigit(candidates, page, pageSize, digit) {
 const index = page * pageSize + digit;
 return index < candidates.length ? candidates[index] : null;
}

/**
 * Resolve what a space keypress should commit, given the current buffer.
 *
 * - "<root><selector>" where the last char is v/r/s/f and the full buffer is
 *   NOT a valid code: commit the selector's index from the root's candidates.
 * - Otherwise: commit the first candidate of the full buffer.
 *
 * Returns the character to commit, or null (→ the caller clears IME state).
 */
export function resolveSpaceCommit(data, buffer) {
 if (typeof buffer !== "string" || buffer.length === 0) return null;

 const lastChar = buffer.slice(-1);
 if (buffer.length > 1 && Object.hasOwn(SPACE_SELECTOR_MAP, lastChar)) {
  if (!Object.hasOwn(data, buffer)) {
   // The buffer itself is not a valid code → treat lastChar as selector.
   const rootCandidates = lookupCandidates(data, buffer.slice(0, -1));
   const index = SPACE_SELECTOR_MAP[lastChar];
   return index < rootCandidates.length ? rootCandidates[index] : null;
  }
  // The buffer IS a valid code → fall through to its first candidate.
 }

 const candidates = lookupCandidates(data, buffer);
 return candidates.length > 0 ? candidates[0] : null;
}
