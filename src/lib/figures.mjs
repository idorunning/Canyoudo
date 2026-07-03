// Figure discipline for the Force Briefing — the numeric sibling of the
// research assistant's citation contract (citations.mjs). The prompt only
// allows figures from the digest; this verifies the output against it, so the
// page can honestly badge how many figures were checked. Pure and import-free
// (shared by Node functions, the browser and tests).
//
// The check is deliberately LENIENT and advisory: a briefing legitimately
// rounds ("about 12,000"), derives ("roughly 4,000 more") and counts in prose
// ("three years of data"), so unmatched numbers are FLAGGED for the reader to
// verify, never stripped. A fabricated headline figure still can't slip
// through unbadged.

/** Walk any JSON value and collect every finite number in it. */
export function collectNumbers(value, out = new Set()) {
  if (typeof value === 'number' && Number.isFinite(value)) out.add(value);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectNumbers(v, out);
  return out;
}

// Rounded/derived variants a briefing may reasonably print for one source
// number: the number itself, integer rounding, one decimal place, and 2–3
// significant figures ("12,345" → "12,000" / "12,300").
function variants(n) {
  const out = new Set([n, Math.abs(n)]);
  const a = Math.abs(n);
  out.add(Math.round(a));
  out.add(Math.round(a * 10) / 10);
  for (const sf of [2, 3]) {
    if (a > 0) {
      const mag = Math.pow(10, Math.floor(Math.log10(a)) - (sf - 1));
      out.add(Math.round(a / mag) * mag);
    }
  }
  return out;
}

/** The allowed-number set for a digest: every number plus tolerant variants. */
export function allowedFigures(digest) {
  const allowed = new Set();
  for (const n of collectNumbers(digest)) for (const v of variants(n)) allowed.add(v);
  return allowed;
}

// Numbers in prose that aren't data claims: small counts ("three of the last
// 12 months"), years, month numbers inside ISO dates (handled by tokenising
// dates out first), and percent-point differences of small size.
const IGNORE_BELOW = 13;
const isYearLike = (n) => Number.isInteger(n) && n >= 1900 && n <= 2100;

/**
 * Check a briefing's numbers against the digest's.
 * @returns {{ checked: number, unmatched: string[] }} counts of numeric tokens
 * examined, and the distinct tokens that couldn't be matched to the digest.
 */
export function verifyFigures(text, digest) {
  const allowed = allowedFigures(digest);
  // Strip ISO dates/months ("2024-03") so their parts don't read as figures.
  const cleaned = String(text ?? '').replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, ' ');
  const tokens = cleaned.match(/-?\d[\d,]*\.?\d*/g) ?? [];
  let checked = 0;
  const unmatched = new Set();
  for (const tok of tokens) {
    const n = Number(tok.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const a = Math.abs(n);
    if (a < IGNORE_BELOW || isYearLike(n)) continue;
    checked += 1;
    if (allowed.has(a) || allowed.has(Math.round(a)) || allowed.has(Math.round(a * 10) / 10)) continue;
    unmatched.add(tok);
  }
  return { checked, unmatched: [...unmatched] };
}
