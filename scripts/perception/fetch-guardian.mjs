#!/usr/bin/env node
// Reproducible corpus builder for the perception analysis, using the Guardian
// Open Platform API — a free source with UK news headlines back to 1999, so it
// carries the early years no aggregator can reach.
//
// Scope is kept UK-and-police-tight at the source: every query is constrained to
// the UK production office, and the police-general facet selects by the Guardian's
// editorial `uk/police` tag rather than a free-text match — so US/Australia police
// stories never enter the corpus. We page in date order at the API's 200-per-page
// maximum to sweep each year comprehensively.
//
// We count HEADLINES only (not bodies): a headline about the police is reliably
// ABOUT the police, whereas whole bodies drag in tangential vocabulary (US
// politics, etc.) and skew the word analysis off-topic. Each headline is
// tokenised and counted IN MEMORY, then discarded — only derived aggregates
// (word counts, sentiment, lexicon and entity tallies) plus provenance
// (headline, source, link, date) are written to disk, well inside the Guardian's
// terms and our own no-full-text rule (see src/content/config.ts).
//
// Usage:  GUARDIAN_API_KEY=xxxx node scripts/perception/fetch-guardian.mjs [--year 2014] [--from 2000] [--to 2025]
// Output: scripts/perception/raw/<year>.json  (agent-contract shape)
//         then run `npm run build-perception` to normalise into src/content/.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACETS, FACET_QUERIES, GUARDIAN_FACET_TAGS, YEAR_START, YEAR_END, SCHEMA_VERSION, outletByName } from './config.mjs';
import { newAccumulator, accumulate, finalise } from './analyse.mjs';
import { allEntities } from './entities.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'scripts/perception/raw/guardian');
const KEY = process.env.GUARDIAN_API_KEY;
const ENDPOINT = 'https://content.guardianapis.com/search';
const PAGE_SIZE = 200; // Guardian's hard maximum — 4× fewer requests than the old 50
const MAX_PAGES_PER_FACET = 25; // safety cap; the loop normally stops at `pages` first
const DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

async function guardian(params, tries = 4) {
  const url = `${ENDPOINT}?${new URLSearchParams({ 'api-key': KEY, ...params })}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return (await res.json()).response;
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
}

async function fetchYearFacet(year, facet, entityDefs) {
  const acc = newAccumulator();
  const sources = [];
  // Select by the editorial `uk/police` tag where one is defined (police-general),
  // else by the OR'd phrase query. Either way, constrain to the UK production
  // office so US/Australia police stories don't pollute the corpus, and sweep the
  // whole year in date order (deterministic, no relevance-shuffle gaps).
  const tag = GUARDIAN_FACET_TAGS[facet];
  const select = tag ? { tag } : { q: FACET_QUERIES[facet].map((q) => `"${q}"`).join(' OR ') };
  let page = 1;
  let pages = 1;
  while (page <= Math.min(pages, MAX_PAGES_PER_FACET)) {
    const resp = await guardian({
      ...select,
      'from-date': `${year}-01-01`,
      'to-date': `${year}-12-31`,
      'production-office': 'uk',
      'page-size': String(PAGE_SIZE),
      page: String(page),
      'show-fields': 'headline',
      'order-by': 'newest',
      lang: 'en',
    });
    if (!resp) break;
    pages = resp.pages ?? 1;
    for (const r of resp.results ?? []) {
      const headline = r.fields?.headline ?? r.webTitle ?? '';
      if (!headline.trim()) continue;
      accumulate(acc, headline, entityDefs); // headline only — counted, then dropped
      // Keep a small provenance sample (headline + link only), capped.
      if (sources.length < 8) {
        sources.push({
          title: headline,
          source: 'The Guardian',
          url: r.webUrl,
          date: (r.webPublicationDate ?? '').slice(0, 10),
          outletType: outletByName('The Guardian').type,
        });
      }
    }
    page++;
    await sleep(DELAY_MS);
  }
  return { facetData: finalise(acc), sources, itemCount: acc.sentiment.positive + acc.sentiment.neutral + acc.sentiment.negative };
}

async function buildYear(year, entityDefs) {
  const facets = {};
  let itemCount = 0;
  let sources = [];
  for (const facet of FACETS) {
    const { facetData, sources: s, itemCount: n } = await fetchYearFacet(year, facet, entityDefs);
    facets[facet] = facetData;
    itemCount += n;
    sources = sources.concat(s);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    year,
    provenance: {
      generatedAt: new Date().toISOString(),
      method: 'guardian',
      sourcesUsed: ['The Guardian'],
      itemCount,
      sparse: false,
      sample: false,
      notes: 'Built from Guardian Open Platform HEADLINES only (titles counted, then dropped) — keeps the word analysis on-topic rather than counting whole bodies.',
    },
    sources: sources.slice(0, 12),
    facets,
  };
}

async function main() {
  if (!KEY) {
    console.error('GUARDIAN_API_KEY is not set. Get a free key at https://open-platform.theguardian.com/access/');
    console.error('Without a key, run `npm run seed-perception` to generate illustrative sample data instead.');
    process.exit(1);
  }
  const entityDefs = allEntities();
  const only = arg('--year');
  const from = Number(arg('--from', YEAR_START));
  const to = Number(arg('--to', YEAR_END));
  const years = only ? [Number(only)] : Array.from({ length: to - from + 1 }, (_, i) => from + i);

  await mkdir(RAW, { recursive: true });
  for (const year of years) {
    process.stdout.write(`Fetching ${year}… `);
    const payload = await buildYear(year, entityDefs);
    await writeFile(join(RAW, `${year}.json`), JSON.stringify(payload, null, 2) + '\n');
    console.log(`${payload.provenance.itemCount} items`);
  }
  console.log(`\nDone. Now run: npm run build-perception`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
