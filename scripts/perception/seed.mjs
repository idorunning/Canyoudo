#!/usr/bin/env node
// Generate ILLUSTRATIVE, research-grounded sample data for the perception
// analysis — one agent-contract file per year in scripts/perception/raw/ — so
// the article, clouds and explorer are fully functional before anyone sources a
// Guardian key. Every file it writes is flagged `sample: true`, and the UI
// labels it as illustrative (mirroring the police-data `sample` convention).
//
// The shapes and trends encode the verified narrative spine (see the plan):
// confidence/sentiment rising to ~2015–17 then falling; misconduct/race/
// leadership coverage spiking around real events (de Menezes 2005, riots +
// phone-hacking 2011, BLM + Child Q 2020, Everard/Couzens 2021, Casey/Carrick
// 2023); corpus size growing over time (sparse early years). Deterministic —
// the same input always yields the same numbers.
//
// Usage:  node scripts/perception/seed.mjs   →  then  npm run build-perception

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACETS, YEAR_START, YEAR_END, SCHEMA_VERSION, OUTLETS } from './config.mjs';
import { THEME_KEYS } from './lexicons.mjs';
import { allEntities } from './entities.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'scripts/perception/raw/seed');

// --- deterministic PRNG ----------------------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- vocabulary, grouped by theme (lemma forms) ----------------------------
const VOCAB = {
  generic: ['crime', 'investigation', 'court', 'victim', 'arrest', 'custody', 'knife', 'murder', 'violence', 'gang', 'protest', 'london', 'criminal', 'evidence', 'case', 'charge', 'suspect', 'jury', 'sentence'],
  trust: ['confidence', 'trust', 'legitimacy', 'consent', 'faith', 'respect', 'public', 'community', 'reassurance', 'transparency'],
  misconduct: ['misconduct', 'scandal', 'corruption', 'abuse', 'racist', 'misogyny', 'rape', 'assault', 'sacked', 'vetting', 'failing', 'cover', 'disgraced', 'predator', 'shame'],
  reform: ['reform', 'review', 'inquiry', 'recommendation', 'cuts', 'austerity', 'funding', 'recruitment', 'uplift', 'training', 'standard', 'overhaul'],
  race: ['race', 'racism', 'black', 'ethnic', 'disproportionate', 'search', 'stop', 'discrimination', 'macpherson', 'diversity'],
  leadership: ['commissioner', 'chief', 'resign', 'mayor', 'leadership', 'appointed', 'oversight', 'command'],
};

// --- per-year profile ------------------------------------------------------
// Negativity (share of items reading negative) and per-theme emphasis.
const NEG_EVENTS = { 2005: 0.06, 2008: 0.04, 2009: 0.03, 2011: 0.1, 2012: 0.04, 2014: 0.03, 2018: 0.04, 2020: 0.09, 2021: 0.17, 2022: 0.15, 2023: 0.19, 2024: 0.1, 2025: 0.07 };
const POS_EVENTS = { 2012: 0.03, 2013: 0.03, 2015: 0.05, 2016: 0.05, 2017: 0.04, 2019: 0.03 };
const THEME_EVENTS = {
  misconduct: { 2005: 1.6, 2008: 1.3, 2011: 2.0, 2012: 1.5, 2014: 1.4, 2016: 1.3, 2020: 1.8, 2021: 2.6, 2022: 2.4, 2023: 2.9, 2024: 1.9, 2025: 1.6 },
  race: { 2000: 1.5, 2001: 1.3, 2011: 1.6, 2017: 1.3, 2018: 1.8, 2019: 1.4, 2020: 2.3, 2022: 1.5, 2023: 1.7 },
  reform: { 2010: 1.4, 2011: 1.3, 2012: 1.9, 2013: 1.4, 2018: 1.4, 2019: 1.7, 2023: 1.9, 2024: 1.5 },
  trust: { 2015: 1.3, 2016: 1.3, 2021: 1.6, 2022: 1.6, 2023: 1.7, 2024: 1.4 },
  leadership: { 2005: 1.4, 2008: 1.8, 2011: 1.7, 2012: 1.4, 2017: 1.5, 2022: 1.9, 2023: 1.4 },
};

// Leaders/figures active window → { peakYears:[...], range:[a,b] }.
const FIGURE_YEARS = {
  'John Stevens': [2000, 2005],
  'Ian Blair': [2003, 2008],
  'Paul Stephenson': [2009, 2011],
  'Bernard Hogan-Howe': [2011, 2017],
  'Cressida Dick': [2017, 2022],
  'Mark Rowley': [2022, 2025],
  'Wayne Couzens': [2021, 2022],
  'David Carrick': [2023, 2023],
  'Baroness Casey': [2022, 2023],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function yearProfile(year) {
  const t = year - YEAR_START;
  const corpus = Math.round(30000 * Math.pow(1.115, t)); // grows ~510k by 2025
  let neg = 0.33 + t * 0.004 + (NEG_EVENTS[year] ?? 0) - (POS_EVENTS[year] ?? 0);
  neg = clamp(neg, 0.2, 0.78);
  const neutral = 0.3;
  const pos = clamp(1 - neg - neutral, 0.04, 0.6);
  const themeMul = Object.fromEntries(THEME_KEYS.map((k) => [k, THEME_EVENTS[k]?.[year] ?? 1]));
  // Trust vocabulary discussion rises but trust *sentiment* falls — captured via neg.
  return { corpus, neg, neutral, pos, themeMul };
}

function makeFacet(year, facet, prof) {
  const r = rng(`${year}:${facet}`);
  const facetScale = facet === 'police-general' ? 1 : facet === 'forces' ? 0.55 : 0.42;
  const corpusTokens = Math.round(prof.corpus * facetScale);

  // Build weighted word list.
  const words = new Map();
  const add = (term, weight) => words.set(term, (words.get(term) ?? 0) + weight * (0.6 + r() * 0.8));
  for (const w of VOCAB.generic) add(w, 1);
  for (const key of THEME_KEYS) {
    const mul = prof.themeMul[key];
    for (const w of VOCAB[key]) add(w, 0.7 * mul);
  }
  if (facet === 'leaders-officers-staff') for (const w of VOCAB.leadership) add(w, 1.4);
  if (facet === 'forces') add('metropolitan', 2.2);

  const topWords = [...words.entries()]
    .map(([term, wgt]) => ({ term, count: Math.max(1, Math.round((wgt * corpusTokens) / 4500)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 45)
    .map((w) => ({ ...w, ratePer10k: 0 })); // build step recomputes rate

  // Sentiment doc split from the year profile.
  const items = Math.max(40, Math.round(corpusTokens / 320));
  const negative = Math.round(items * prof.neg);
  const neutral = Math.round(items * prof.neutral);
  const positive = Math.max(0, items - negative - neutral);
  const denom = positive + negative || 1;
  const mean = Math.round(((positive - negative) / denom) * 1000) / 1000;

  // Themed lexicons — items mentioning each theme.
  const lexicons = {};
  for (const key of THEME_KEYS) {
    const base = key === 'misconduct' ? 0.22 : key === 'race' ? 0.16 : key === 'reform' ? 0.18 : key === 'trust' ? 0.14 : 0.2;
    const share = clamp(base * prof.themeMul[key] * (0.85 + r() * 0.3), 0.02, 0.9);
    lexicons[key] = { items: Math.round(items * share), ratePer10k: 0 };
  }

  // Entities for this facet/year.
  const entities = [];
  if (facet === 'forces' || facet === 'police-general') {
    entities.push({ name: 'Metropolitan Police', type: 'force', count: Math.round(items * (0.5 + r() * 0.2)), ratePer10k: 0 });
    for (const nm of ['Greater Manchester Police', 'West Midlands Police', 'Merseyside Police', 'South Yorkshire Police']) {
      entities.push({ name: nm, type: 'force', count: Math.round(items * (0.05 + r() * 0.12)), ratePer10k: 0 });
    }
  }
  if (facet === 'leaders-officers-staff' || facet === 'police-general') {
    for (const def of allEntities().filter((e) => e.type !== 'force')) {
      const fy = FIGURE_YEARS[def.name];
      if (fy) {
        if (year < fy[0] || year > fy[1]) continue;
        entities.push({ name: def.name, type: def.type, count: Math.round(items * (0.12 + r() * 0.35)), ratePer10k: 0 });
      } else if (r() > 0.4) {
        entities.push({ name: def.name, type: def.type, count: Math.round(items * (0.05 + r() * 0.15)), ratePer10k: 0 });
      }
    }
  }
  entities.sort((a, b) => b.count - a.count);

  return { corpusTokens, topWords, sentiment: { mean, positive, neutral, negative, gdeltToneMean: null }, lexicons, entities: entities.slice(0, 12) };
}

function sampleSources(year, r) {
  // A small, plausible provenance sample (headline-style only — no body text).
  // Before ~2008 the free corpus is Guardian-dominant, so the sample (and the
  // diversity index derived from it) honestly reflects that single-source skew;
  // breadth widens from 2008 and again from 2017.
  const pool = OUTLETS.filter((o) => o.type !== 'official');
  const guardian = { title: `Policing coverage, ${year}`, source: 'The Guardian', url: '', date: `${year}-06-15`, outletType: 'broadsheet' };
  const picks = [guardian];
  const breadth = year < 2008 ? 0 : year < 2017 ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
  for (let i = 0; i < breadth; i++) {
    const o = pool[Math.floor(r() * pool.length)];
    picks.push({ title: `Policing coverage, ${year}`, source: o.name, url: '', date: `${year}-06-15`, outletType: o.type });
  }
  return picks;
}

async function main() {
  await mkdir(RAW, { recursive: true });
  for (let year = YEAR_START; year <= YEAR_END; year++) {
    const prof = yearProfile(year);
    const r = rng(`prov:${year}`);
    const facets = {};
    let itemCount = 0;
    for (const facet of FACETS) {
      facets[facet] = makeFacet(year, facet, prof);
      itemCount += facets[facet].sentiment.positive + facets[facet].sentiment.neutral + facets[facet].sentiment.negative;
    }
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      year,
      provenance: {
        generatedAt: new Date().toISOString(),
        method: 'seed',
        sourcesUsed: ['illustrative'],
        itemCount,
        sparse: false,
        sample: true,
        notes: 'Illustrative sample data, grounded in the research narrative. Replace with a real fetch (npm run fetch-perception).',
      },
      sources: sampleSources(year, r),
      facets,
    };
    await writeFile(join(RAW, `${year}.json`), JSON.stringify(payload, null, 2) + '\n');
  }
  console.log(`Seeded ${YEAR_END - YEAR_START + 1} years → scripts/perception/raw/. Now run: npm run build-perception`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
