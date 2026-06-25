#!/usr/bin/env node
// Normalise the per-year agent-contract files in scripts/perception/raw/ into the
// committed `perception` collection under src/content/perception/. This is the
// gate that enforces our hard rules and makes the numbers authoritative:
//
//   1. Validate — reject any aggregate that smells like raw article text
//      (an over-long "title", or a stray body/text field). Cap the provenance
//      sample. This is the legal/no-full-text check, in code.
//   2. Recompute ratePer10k from raw counts + corpusTokens so rates are
//      authoritative, never agent-supplied.
//   3. Derive the per-year diversityIndex (normalised entropy of outlet shares)
//      and the `sparse` flag (thin years), so the UI can be honest.
//   4. Write one file per year + an index.json manifest carrying the global
//      maxima used to scale clouds and charts consistently across years.
//
// context.json (the social-media overlay) is hand-curated and left untouched.
//
// Usage:  npm run build-perception

import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FACETS, METHODOLOGY_VERSION, QUOTAS, SCHEMA_VERSION, outletByName } from './perception/config.mjs';
import { THEME_KEYS } from './perception/lexicons.mjs';
import { mergeRaw } from './perception/merge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'scripts/perception/raw');
const OUT = join(ROOT, 'src/content/perception');
const MAX_SOURCES = 12;
const MAX_TITLE_LEN = 200; // a "title" longer than this is body text leaking in
const MAX_FORCE_WORDS = 15; // light per-force vocabulary

const per10k = (count, tokens) => (tokens > 0 ? Math.round((count / tokens) * 10000 * 10) / 10 : 0);

function assertNoBodyText(facet, facetName, year) {
  for (const key of Object.keys(facet)) {
    if (key === 'body' || key === 'bodyText' || key === 'text' || key === 'content') {
      throw new Error(`${year}/${facetName}: forbidden raw-text field "${key}" — only derived aggregates may be stored.`);
    }
  }
}

// Normalised Shannon entropy of the provenance outlet shares (0 = single
// outlet, 1 = perfectly even). Captures the early-years "Guardian-dominant"
// problem honestly rather than hiding it.
function diversityIndex(sources) {
  const counts = new Map();
  for (const s of sources) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
  const k = counts.size;
  if (k <= 1) return k === 1 ? 0 : null;
  const total = sources.length;
  let h = 0;
  for (const n of counts.values()) {
    const p = n / total;
    h -= p * Math.log(p);
  }
  return Math.round((h / Math.log(k)) * 1000) / 1000;
}

function normaliseFacet(facet, facetName, year) {
  assertNoBodyText(facet, facetName, year);
  const tokens = facet.corpusTokens || 0;
  const topWords = (facet.topWords || [])
    .filter((w) => w.term && w.term.length >= 3)
    .map((w) => ({ term: w.term, count: w.count, ratePer10k: per10k(w.count, tokens) }))
    .sort((a, b) => b.count - a.count);
  const lexicons = {};
  for (const key of THEME_KEYS) {
    const lx = facet.lexicons?.[key] ?? { items: 0 };
    lexicons[key] = { items: lx.items || 0, ratePer10k: per10k(lx.items || 0, tokens) };
  }
  const entities = (facet.entities || [])
    .map((e) => ({ name: e.name, type: e.type, count: e.count, ratePer10k: per10k(e.count, tokens) }))
    .sort((a, b) => b.count - a.count);
  const s = facet.sentiment ?? { mean: 0, positive: 0, neutral: 0, negative: 0, gdeltToneMean: null };
  return {
    corpusTokens: tokens,
    topWords,
    sentiment: { mean: s.mean ?? 0, positive: s.positive ?? 0, neutral: s.neutral ?? 0, negative: s.negative ?? 0, gdeltToneMean: s.gdeltToneMean ?? null },
    lexicons,
    entities,
  };
}

// Gather every per-source contract file, grouped by year. Each fetcher writes to
// its own namespace (raw/<source>/<year>.json); a flat raw/<year>.json is still
// honoured for back-compat. Returns Map<year, raw[]> for mergeRaw().
async function collectRawByYear() {
  const byYear = new Map();
  const addFile = async (dir, file) => {
    const m = /^(\d{4})\.json$/.exec(file);
    if (!m) return;
    const raw = JSON.parse(await readFile(join(dir, file), 'utf8'));
    const year = raw.year ?? Number(m[1]);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(raw);
  };
  let entries;
  try {
    entries = await readdir(RAW, { withFileTypes: true });
  } catch {
    return byYear;
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (ent.name === 'forces') continue; // per-force lives in its own dimension (collectForcesByYear)
      const sub = join(RAW, ent.name);
      for (const f of await readdir(sub)) await addFile(sub, f);
    } else if (ent.isFile()) {
      await addFile(RAW, ent.name); // back-compat: flat raw/<year>.json
    }
  }
  return byYear;
}

// Union several per-force raw breakdowns (the parallel batch files for one year)
// into one. Disjoint force sets simply combine; on any overlap the entry with
// data (volume > 0) wins, so a throttled-empty batch never displaces a good one.
// Pure + exported so the batch-merge contract is unit-tested.
export function unionForceRaws(rawList) {
  const forceBreakdown = {};
  let year;
  for (const raw of rawList ?? []) {
    if (!raw) continue;
    if (year === undefined) year = raw.year;
    for (const [id, f] of Object.entries(raw.forceBreakdown ?? {})) {
      const prev = forceBreakdown[id];
      if (!prev || (f.volume ?? 0) > 0 || !((prev.volume ?? 0) > 0)) forceBreakdown[id] = f;
    }
  }
  return { year, forceBreakdown };
}

// Per-force raw → Map<year, rawForceBreakdown>. This is a separate, lighter
// dimension from the thematic facets and may be fetched in its own dispatch, so
// it's collected and attached independently of the facets. Parallel force
// batches write batch-distinct files (raw/forces/<year>.b<N>.json); their force
// sets are unioned per year (see unionForceRaws). A plain <year>.json (unbatched
// run) is honoured too.
async function collectForcesByYear() {
  const filesByYear = new Map();
  let files;
  try {
    files = await readdir(join(RAW, 'forces'));
  } catch {
    return new Map();
  }
  for (const file of files) {
    const m = /^(\d{4})(?:\.b\d+)?\.json$/.exec(file);
    if (!m) continue;
    const raw = JSON.parse(await readFile(join(RAW, 'forces', file), 'utf8'));
    const year = raw.year ?? Number(m[1]);
    if (!filesByYear.has(year)) filesByYear.set(year, []);
    filesByYear.get(year).push(raw);
  }
  const byYear = new Map();
  for (const [year, rawList] of filesByYear) byYear.set(year, unionForceRaws(rawList));
  return byYear;
}

// Read the already-committed year file (the durable base), if any. Used so a
// facet-only or force-only run preserves the other dimension instead of wiping it.
async function readExistingYear(year) {
  try {
    const data = JSON.parse(await readFile(join(OUT, `${year}.json`), 'utf8'));
    return data.kind === 'year' ? data : null;
  } catch {
    return null;
  }
}

// Normalise a year's raw per-force breakdown: recompute each force's word rates
// from its own corpusTokens (authoritative, never fetcher-supplied) and cap the
// word list. Drops the per-force corpusTokens from the stored shape.
function normaliseForces(raw) {
  const out = {};
  for (const [id, f] of Object.entries(raw.forceBreakdown ?? {})) {
    const tokens = f.corpusTokens || 0;
    const topWords = (f.topWords || [])
      .filter((w) => w.term && w.term.length >= 3)
      .map((w) => ({ term: w.term, count: w.count, ratePer10k: per10k(w.count, tokens) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_FORCE_WORDS);
    const s = f.sentiment ?? { mean: 0, positive: 0, neutral: 0, negative: 0 };
    out[id] = {
      name: f.name ?? id,
      volume: f.volume ?? 0,
      tone: f.tone ?? null,
      sentiment: { mean: s.mean ?? 0, positive: s.positive ?? 0, neutral: s.neutral ?? 0, negative: s.negative ?? 0 },
      topWords,
    };
  }
  return out;
}

// Fold per-force word rates into the shared maxima so the client scales per-force
// clouds consistently with everything else.
function foldForceMaxima(maxima, forceBreakdown) {
  for (const f of Object.values(forceBreakdown ?? {})) {
    for (const w of f.topWords ?? []) maxima.forceWordRate = Math.max(maxima.forceWordRate, w.ratePer10k ?? 0);
  }
}

// Fold a year's normalised facets into the running global maxima used to scale
// clouds/charts consistently. Works for both freshly-built years and the
// already-committed year files we read back off disk.
function foldMaxima(maxima, facets) {
  for (const facet of FACETS) {
    const nf = facets?.[facet];
    if (!nf) continue;
    for (const w of nf.topWords ?? []) maxima.wordRate = Math.max(maxima.wordRate, w.ratePer10k ?? 0);
    for (const key of THEME_KEYS) maxima.lexRate = Math.max(maxima.lexRate, nf.lexicons?.[key]?.ratePer10k ?? 0);
    for (const e of nf.entities ?? []) maxima.entityRate = Math.max(maxima.entityRate, e.ratePer10k ?? 0);
  }
}

async function main() {
  const byYear = await collectRawByYear(); // thematic facet raw
  const forcesByYear = await collectForcesByYear(); // per-force raw
  if (byYear.size === 0 && forcesByYear.size === 0) {
    console.error('No raw year files found. Run `npm run seed-perception` or a fetcher (e.g. `npm run fetch-perception`) first.');
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  // Years touched by THIS run (thematic and/or per-force). A run only rebuilds
  // the dimension(s) it fetched and preserves the other from the committed file;
  // the rest of the corpus is folded into the manifest below.
  const builtYears = new Set();
  const maxima = { wordRate: 0, lexRate: 0, entityRate: 0, forceWordRate: 0 };
  let anySample = false;

  const targetYears = new Set([...byYear.keys(), ...forcesByYear.keys()]);
  for (const year of [...targetYears].sort((a, b) => a - b)) {
    const existing = await readExistingYear(year);
    let out = existing ? { ...existing } : null;

    // Thematic facets: rebuild from this run's raw, else keep the committed ones.
    if (byYear.has(year)) {
      const raw = mergeRaw(byYear.get(year));
      if (raw.provenance?.sample) anySample = true;

      const facets = {};
      let itemCount = 0;
      for (const facet of FACETS) {
        const nf = normaliseFacet(raw.facets[facet] ?? {}, facet, year);
        facets[facet] = nf;
        itemCount += nf.sentiment.positive + nf.sentiment.neutral + nf.sentiment.negative;
      }
      const sources = (raw.sources || []).slice(0, MAX_SOURCES).map((s) => {
        const title = String(s.title ?? '').slice(0, MAX_TITLE_LEN);
        return { title, source: s.source ?? 'Unknown', url: s.url ?? '', date: s.date ?? '', outletType: s.outletType ?? outletByName(s.source).type };
      });
      out = {
        ...(out ?? {}),
        kind: 'year',
        schemaVersion: SCHEMA_VERSION,
        year,
        provenance: {
          generatedAt: raw.provenance?.generatedAt ?? new Date().toISOString(),
          method: raw.provenance?.method ?? 'unknown',
          sourcesUsed: raw.provenance?.sourcesUsed ?? [],
          itemCount,
          diversityIndex: diversityIndex(sources),
          sparse: itemCount < QUOTAS.sparseItemThreshold,
          sample: Boolean(raw.provenance?.sample),
          notes: raw.provenance?.notes ?? '',
        },
        sources,
        facets,
      };
    }

    // Per-force: merge this run's breakdown INTO the committed one. A force is
    // updated only when the new pull has data (volume > 0); a throttled/empty
    // result never overwrites a force we already have — so repeated runs
    // accumulate coverage across all forces instead of clobbering it.
    if (forcesByYear.has(year)) {
      const fresh = normaliseForces(forcesByYear.get(year));
      const merged = { ...((out && out.forceBreakdown) || {}) };
      for (const [id, f] of Object.entries(fresh)) {
        if (f.volume > 0 || !(merged[id] && merged[id].volume > 0)) merged[id] = f;
      }
      out = { ...(out ?? { kind: 'year', schemaVersion: SCHEMA_VERSION, year }), forceBreakdown: merged };
    }

    if (!out || !out.facets) {
      // A force-only run for a year that has no committed facets yet — nothing to
      // anchor it to. Skip (rare; the thematic pass should land first).
      console.warn(`  ${year}: per-force data but no committed facets — skipped (run the thematic fetch first).`);
      continue;
    }

    builtYears.add(year);
    if (out.provenance?.sample) anySample = true;
    foldMaxima(maxima, out.facets);
    foldForceMaxima(maxima, out.forceBreakdown);
    await writeFile(join(OUT, `${year}.json`), JSON.stringify(out, null, 2) + '\n');
    const nForces = Object.keys(out.forceBreakdown ?? {}).length;
    console.log(`  ${year}: ${out.provenance?.itemCount ?? 0} items${out.provenance?.sparse ? ' (sparse)' : ''}, diversity ${out.provenance?.diversityIndex ?? '—'}${nForces ? `, ${nForces} forces` : ''}`);
  }

  // Fold the years already committed on disk that THIS run did not rebuild, so a
  // single-dimension refresh keeps the manifest listing the full corpus and the
  // shared maxima stay scaled across every year (git is the durable store).
  const allYears = new Set(builtYears);
  for (const file of await readdir(OUT)) {
    const m = /^(\d{4})\.json$/.exec(file);
    if (!m) continue;
    const year = Number(m[1]);
    if (builtYears.has(year)) continue; // already counted from this run's raw
    const prior = JSON.parse(await readFile(join(OUT, file), 'utf8'));
    if (prior.kind !== 'year') continue;
    allYears.add(year);
    if (prior.provenance?.sample) anySample = true;
    foldMaxima(maxima, prior.facets);
    foldForceMaxima(maxima, prior.forceBreakdown);
  }
  const years = [...allYears].sort((a, b) => a - b);

  const index = {
    kind: 'index',
    schemaVersion: SCHEMA_VERSION,
    years,
    methodologyVersion: METHODOLOGY_VERSION,
    maxima: {
      wordRate: Math.ceil(maxima.wordRate),
      lexRate: Math.ceil(maxima.lexRate),
      entityRate: Math.ceil(maxima.entityRate),
      forceWordRate: Math.ceil(maxima.forceWordRate),
    },
    builtAt: new Date().toISOString(),
    sample: anySample,
  };
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`\nWrote ${builtYears.size} year(s) this run; manifest lists ${years.length} years → src/content/perception/  (maxima: word ${index.maxima.wordRate}, lex ${index.maxima.lexRate}, entity ${index.maxima.entityRate}, force ${index.maxima.forceWordRate})${anySample ? '  [sample data]' : ''}`);
}

// Run only when invoked directly (`node scripts/build-perception.mjs`), so the
// module can be imported by tests without executing the build.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
