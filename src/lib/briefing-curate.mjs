// Curate one briefing's evidence base from the per-angle search results —
// pure and unit-tested (tests/briefing-curate.test.mjs), like research-merge.mjs.
//
// The briefing pipeline searches ~3 distinct angles of a problem, each already
// merged/deduped within itself (mergeWorks on the "All sources" search). This
// module folds those lists into ONE deduplicated, coverage-balanced, ranked
// set of at most `limit` studies — the single numbered list the model is shown
// and the source of the client-built reference list.
//
// Why interleave rather than a single global ranking: a briefing covers
// several facets, and a heavily-cited facet would otherwise crowd the others
// out. We round-robin across the angles so each contributes, while reusing
// mergeWorks' field-enrichment and corroboration so a study found via two
// angles still surfaces with the richest record.
//
// Design seam: this is the one place the 12–15 selection happens, so a cheap
// model re-rank could slot in here later if real misses show up (mirroring the
// relevanceFilter seam noted in docs/research-assistant-v2.md). Deterministic
// is the right default for Standard depth — free, instant, already tested.

import { mergeWorks, workMergeKey } from './research-merge.mjs';

export const CURATE_LIMIT = 15;

/**
 * @param {Array<Array<object>>} perAngleLists one Work[] per search angle,
 *   each in upstream relevance order.
 * @param {number} limit the most studies to keep (default 15).
 * @returns {Array<object>} deduplicated, coverage-balanced, field-enriched Work[].
 */
export function curate(perAngleLists, limit = CURATE_LIMIT) {
  const lists = (perAngleLists ?? []).map((l) => (Array.isArray(l) ? l : []));

  // One enriched, deduped record per identity — keeps the richest fields and
  // records cross-angle corroboration in `sources`.
  const enriched = new Map();
  for (const w of mergeWorks(lists)) {
    const key = workMergeKey(w);
    if (key) enriched.set(key, w);
  }

  // Round-robin across angles for topical coverage; take each angle's next
  // not-yet-picked study in turn, looking up its enriched record.
  const picked = [];
  const seen = new Set();
  const cursors = lists.map(() => 0);
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (let i = 0; i < lists.length && picked.length < limit; i++) {
      const list = lists[i];
      while (cursors[i] < list.length) {
        const w = list[cursors[i]++];
        const key = workMergeKey(w);
        if (!key || seen.has(key)) continue; // keyless or already taken
        seen.add(key);
        picked.push(enriched.get(key) ?? { ...w, sources: [w.source] });
        progressed = true;
        break;
      }
    }
  }
  return picked;
}
