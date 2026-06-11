// Citation-marker validation for the assistant's evidence answers — pure and
// unit-tested (tests/citations.test.mjs). The model only ever emits bracketed
// indices like [3] pointing at the numbered studies it was given; the
// reference list itself is built from the real retrieved works, so a made-up
// reference is structurally impossible. This module handles the one failure
// the contract leaves open: an index pointing at a study that doesn't exist.

/**
 * Strip out-of-range citation markers from the model's text and collect the
 * valid ones. `max` is the number of studies the model was actually shown.
 * Returns { text, used } where `used` is the sorted list of distinct valid
 * indices — an empty list means the answer is unusable (nothing is cited).
 */
export function sanitizeCitations(text, max) {
  const used = new Set();
  const out = String(text ?? '').replace(/\[(\d{1,3})\]/g, (marker, digits) => {
    const n = Number(digits);
    if (Number.isInteger(n) && n >= 1 && n <= max) {
      used.add(n);
      return marker;
    }
    return '';
  });
  return {
    // Tidy the holes stripped markers leave behind ("word  ." → "word.").
    text: out.replace(/[ \t]+([.,;:])/g, '$1').replace(/ {2,}/g, ' ').trim(),
    used: [...used].sort((a, b) => a - b),
  };
}
