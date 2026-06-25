#!/usr/bin/env node
// BBC News headlines from the `RealTimeData/bbc_news_alltime` dataset on the
// Hugging Face Hub — a ready, monthly-partitioned archive of BBC titles+dates
// covering 2017→present. This is the cheaper, denser route for the modern years:
// run the Wayback RSS harvester for ~2004–2016 and this for 2017→now.
//
// We read rows through the Hugging Face datasets-server REST API (plain JSON, no
// Parquet/deps), keeping ONLY each row's title + published_date + link. The
// dataset also ships a `content` (full body) column — it is never read or
// retained; titles are counted in memory and dropped, exactly as elsewhere, so
// only derived aggregates land on disk (the dataset's licence is unstated, so the
// derived-counts-only posture is the safe footing). The shared builder filters to
// England-&-Wales police headlines and routes them into the facets.
//
// Usage:  node scripts/perception/fetch-bbc-dataset.mjs [--year 2020]
//                                                       [--from 2017 --to 2025]
//                                                       [--delay 250]
// Output: scripts/perception/raw/bbc/<year>.json  → npm run build-perception

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allEntities } from './entities.mjs';
import { buildRawFromHeadlines, isEnglandWalesLink, SOURCE_NAME } from './wayback-bbc.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'scripts/perception/raw/bbc');
const DATASET = 'RealTimeData/bbc_news_alltime';
const SERVER = 'https://datasets-server.huggingface.co';
const PAGE = 100; // datasets-server hard maximum
// Server-side prefilter (DuckDB-backed /filter `where`) — a correct SUPERSET of
// the police-general inclusion terms (police/policing/police force, constabulary,
// law enforcement), so the exact client-side filter still decides inclusion but
// we transfer ~50× fewer rows (e.g. 23 vs 1231 for a month) and never pull the
// bodies of off-topic articles.
const WHERE = `"title" LIKE '%police%' OR "title" LIKE '%constab%' OR "title" LIKE '%law enforcement%'`;
const METHOD = 'bbc-dataset';
const NOTES =
  'BBC News headlines from the RealTimeData/bbc_news_alltime dataset on Hugging Face ' +
  '(monthly partitions, 2017→present). Titles counted in memory, then dropped; the ' +
  'dataset body column is never read or stored — only derived aggregates are kept.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

async function api(path, params, tries = 4) {
  const url = `${SERVER}${path}?${new URLSearchParams(params)}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * (i + 1));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

// The dataset is partitioned one config per month (YYYY-MM); list them once.
async function monthConfigs() {
  const j = await api('/splits', { dataset: DATASET });
  return (j?.splits ?? []).map((s) => s.config).filter((c) => /^\d{4}-\d{2}$/.test(c));
}

// Page a month config (police-prefiltered server-side), yielding only
// {title, link, date}. The body column rides along in the JSON but is dropped
// here and never leaves this scope.
async function* monthRecords(config, delay) {
  const q = (offset) => api('/filter', { dataset: DATASET, config, split: 'train', where: WHERE, offset: String(offset), length: String(PAGE) });
  const first = await q(0);
  const total = first?.num_rows_total ?? 0;
  let offset = 0;
  let page = first;
  while (offset < total) {
    for (const { row } of page?.rows ?? []) {
      // Gate to England-&-Wales desks by URL (drops world/US/Scotland/NI/sport)
      // before the title even reaches the shared police filter.
      if (row?.title && isEnglandWalesLink(row.link || '')) {
        yield { title: row.title, link: row.link || '', date: row.published_date || config };
      }
    }
    offset += PAGE;
    if (offset >= total) break;
    await sleep(delay);
    page = await q(offset);
  }
}

async function main() {
  const only = arg('--year');
  const from = Number(arg('--from', 2017));
  const to = Number(arg('--to', 2025));
  const delay = Number(arg('--delay', 250));
  const wantYear = (y) => (only ? Number(only) === y : y >= from && y <= to);
  const entityDefs = allEntities();

  const configs = (await monthConfigs()).filter((c) => wantYear(Number(c.slice(0, 4))));
  if (!configs.length) {
    // The dataset only covers 2017→present; a year outside that is a no-op, not
    // an error (so a per-year CI matrix can call this for every year harmlessly).
    console.log('No dataset partitions for the requested range (dataset starts 2017) — nothing to do.');
    return;
  }
  // Group month configs by year.
  const byYear = new Map();
  for (const c of configs) {
    const y = Number(c.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(c);
  }

  await mkdir(RAW, { recursive: true });
  for (const [year, months] of [...byYear].sort((a, b) => a[0] - b[0])) {
    process.stdout.write(`${year}: ${months.length} month(s) `);
    const records = [];
    for (const c of months) {
      for await (const rec of monthRecords(c, delay)) records.push(rec);
      process.stdout.write('.');
    }
    const payload = buildRawFromHeadlines(year, records, entityDefs, { method: METHOD, notes: NOTES });
    await writeFile(join(RAW, `${year}.json`), JSON.stringify(payload, null, 2) + '\n');
    const p = payload.provenance;
    console.log(` → ${p.distinctHeadlines} ${SOURCE_NAME} police headlines from ${p.captureItems} rows (itemCount ${p.itemCount})`);
  }
  console.log('\nDone. Now run `npm run build-perception` (with Guardian raw present) to merge.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
