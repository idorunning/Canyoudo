// The single definition of how a police outcome category is classified for the
// "justice gap" — the share of cases ending in a charge or other sanction vs
// the share closed with no suspect identified.
//
// This used to live as two separately-maintained regexes (police-db.mts for the
// charts, db-interpret.mts for the AI reading) and they drifted: one counted
// out-of-court disposals as a sanction, the other didn't, so the chart and the
// reading above it could quietly disagree. One classifier, imported by both,
// makes that impossible. Pure and import-free so it also loads under Deno
// (edge functions) unmodified.

export const CHARGED_RE =
  /charged|caution|community resolution|penalty notice|summons|out-of-court/i;
export const NO_SUSPECT_RE = /no suspect identified/i;

/**
 * Classify one outcome category label.
 * @param {string} category e.g. "Suspect charged", "Investigation complete; no suspect identified"
 * @returns {'charged' | 'noSuspect' | 'other'}
 */
export function classifyOutcome(category) {
  const s = String(category ?? '');
  if (CHARGED_RE.test(s)) return 'charged';
  if (NO_SUSPECT_RE.test(s)) return 'noSuspect';
  return 'other';
}
