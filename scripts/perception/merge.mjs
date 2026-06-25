// Cross-source merge for the perception pipeline. Each fetcher writes one
// agent-contract file per (source × year) under scripts/perception/raw/<source>/.
// Before normalising, scripts/build-perception.mjs combines every source's file
// for a given year into ONE contract object with mergeRaw() — so the corpus is
// no longer Guardian-only and the per-year diversity index reflects real spread.
//
// The merge runs on already-finalised aggregates (see analyse.mjs finalise()):
// we sum counts, recompute means by weight, and union provenance. Rates are left
// at 0 here — build-perception recomputes ratePer10k authoritatively from the
// merged counts + corpusTokens, so this stays the single place rates live.

import { FACETS, SCHEMA_VERSION } from './config.mjs';
import { THEME_KEYS } from './lexicons.mjs';

const TOPWORDS_CAP = 80; // bound merged word lists (build/clouds use top slices)
const ENTITY_CAP = 15;
const SOURCES_CAP = 24; // build re-caps provenance sample to 12

const round3 = (n) => Math.round(n * 1000) / 1000;

// Round-robin the per-source provenance samples so the capped list keeps a
// spread of outlets rather than all-of-source-A-then-all-of-source-B.
function interleave(lists) {
  const out = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

// Merge the same facet across sources. `facets` is an array (entries may be
// undefined when a source doesn't populate that facet, e.g. Wayback).
export function mergeFacet(facets) {
  let corpusTokens = 0;
  const words = new Map();
  const lex = Object.fromEntries(THEME_KEYS.map((k) => [k, 0]));
  const ents = new Map();
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let meanWeighted = 0;
  let meanWeight = 0;
  const tones = [];

  for (const f of facets) {
    if (!f) continue;
    corpusTokens += f.corpusTokens || 0;
    for (const w of f.topWords || []) {
      if (!w?.term) continue;
      words.set(w.term, (words.get(w.term) || 0) + (w.count || 0));
    }
    for (const k of THEME_KEYS) lex[k] += f.lexicons?.[k]?.items || 0;
    for (const e of f.entities || []) {
      if (!e?.name) continue;
      const cur = ents.get(e.name) || { name: e.name, type: e.type, count: 0 };
      cur.count += e.count || 0;
      if (!cur.type && e.type) cur.type = e.type;
      ents.set(e.name, cur);
    }
    const s = f.sentiment || {};
    positive += s.positive || 0;
    neutral += s.neutral || 0;
    negative += s.negative || 0;
    const items = (s.positive || 0) + (s.neutral || 0) + (s.negative || 0);
    if (items > 0 && typeof s.mean === 'number') {
      meanWeighted += s.mean * items;
      meanWeight += items;
    }
    if (s.gdeltToneMean != null) tones.push(s.gdeltToneMean);
  }

  const topWords = [...words.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOPWORDS_CAP)
    .map(([term, count]) => ({ term, count, ratePer10k: 0 }));
  const lexicons = Object.fromEntries(THEME_KEYS.map((k) => [k, { items: lex[k], ratePer10k: 0 }]));
  const entities = [...ents.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, ENTITY_CAP)
    .map((e) => ({ ...e, ratePer10k: 0 }));
  const mean = meanWeight > 0 ? round3(meanWeighted / meanWeight) : 0;
  const gdeltToneMean = tones.length ? round3(tones.reduce((a, b) => a + b, 0) / tones.length) : null;

  return { corpusTokens, topWords, sentiment: { mean, positive, neutral, negative, gdeltToneMean }, lexicons, entities };
}

// Combine all source files for one year into a single contract object. Returns
// the lone object unchanged when there's only one source; null for an empty list.
export function mergeRaw(rawList) {
  const list = (rawList || []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  const facets = {};
  for (const facet of FACETS) facets[facet] = mergeFacet(list.map((r) => r.facets?.[facet]));

  const sourcesUsed = [...new Set(list.flatMap((r) => r.provenance?.sourcesUsed || []))];
  const methods = [...new Set(list.map((r) => r.provenance?.method).filter(Boolean))];
  const itemCount = list.reduce((n, r) => n + (r.provenance?.itemCount || 0), 0);
  const sample = list.every((r) => r.provenance?.sample);
  const extraNotes = [...new Set(list.map((r) => r.provenance?.notes).filter(Boolean))];
  const sources = interleave(list.map((r) => r.sources || [])).slice(0, SOURCES_CAP);

  return {
    schemaVersion: list[0].schemaVersion ?? SCHEMA_VERSION,
    year: list[0].year,
    provenance: {
      generatedAt: new Date().toISOString(),
      method: methods.length > 1 ? 'hybrid' : methods[0] ?? 'unknown',
      sourcesUsed,
      itemCount,
      sparse: false, // build-perception sets this from the merged itemCount
      sample, // true only if every contributing source is sample data
      notes: `Merged from ${list.length} sources (${methods.join(', ')}).${extraNotes.length ? ' ' + extraNotes.join(' ') : ''}`,
    },
    sources,
    facets,
  };
}
