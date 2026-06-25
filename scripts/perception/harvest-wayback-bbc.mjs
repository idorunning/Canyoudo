#!/usr/bin/env node
// OFFLINE harvester: BBC News headlines from archived RSS feeds via the Internet
// Archive, reduced to the same derived per-year aggregates as every other source.
//
// ── Run this OFFLINE, never in the scheduled build CI ──────────────────────────
// The Internet Archive rate-limits hard (≈60 req/min, then a shared-IP firewall
// ban) and blocks datacenter IPs, so polling it from CI is exactly the failure
// mode this project already hit. Instead run this once on a workstation (or a
// permissive, well-behaved one-off job), commit the rebuilt src/content/perception
// output, and let CI stay offline — it only ever consumes the committed numbers.
//
// What it does, per year:
//   1. For each BBC feed live that year, ask the CDX index for one capture/month.
//   2. Fetch each capture's raw RSS (the `id_` playback = no archive banner).
//   3. Parse <title>s, filter to E&W police headlines, dedup across captures,
//      route into facets, and reduce to derived counts (scripts/perception/wayback-bbc.mjs).
//   4. Write scripts/perception/raw/bbc/<year>.json (agent-contract shape).
// Then run `npm run build-perception` (with the Guardian raw also present) to
// merge BBC + Guardian into src/content/perception/.
//
// For 2017→present the Hugging Face dataset (fetch-bbc-dataset.mjs) is denser and
// cheaper, so the usual split is: this harvester for ~2004–2016 (`--to 2016`) and
// the dataset fetcher for 2017→now. Both write raw/bbc/<year>.json (same outlet),
// so run them over non-overlapping year ranges.
//
// Usage:  node scripts/perception/harvest-wayback-bbc.mjs [--year 2008]
//                                                          [--from 2004 --to 2016]
//                                                          [--collapse 6] [--delay 1500]
//                                                          [--feeds legacy-uk,news-uk]

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YEAR_END } from './config.mjs';
import { allEntities } from './entities.mjs';
import {
  BBC_FEEDS, feedsForYear, cdxUrl, playbackUrl, parseCdx, parseRssItems, buildRawFromHeadlines,
} from './wayback-bbc.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'scripts/perception/raw/bbc');
const UA = 'police-perception-research/1.0 (+https://github.com/idorunning/thinkingaboutpolicing; non-commercial research)';
const RSS_START = 2004; // earliest BBC RSS captures; pre-2004 would need HTML scraping

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

// Polite fetch with backoff. The IA returns 429 when over its per-minute budget
// and 5xx under load; we retry with growing delays and honour Retry-After.
async function politeFetch(url, { tries = 4, timeout = 30000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * (i + 1));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
  return '';
}

async function harvestYear(year, { feeds, collapse, delay, entityDefs }) {
  const records = [];
  let captures = 0;
  for (const feed of feeds) {
    let rows;
    try {
      rows = parseCdx(await politeFetch(cdxUrl(feed.url, year, { collapse })));
    } catch (err) {
      console.warn(`    ${feed.id}: CDX failed (${err.message}) — skipping feed`);
      continue;
    }
    process.stdout.write(`    ${feed.id}: ${rows.length} monthly captures `);
    let got = 0;
    for (const { timestamp, original } of rows) {
      await sleep(delay);
      let xml;
      try {
        xml = await politeFetch(playbackUrl(timestamp, original));
      } catch (err) {
        process.stdout.write('x');
        continue;
      }
      const items = parseRssItems(xml);
      // Legacy RSS 0.91 has no per-item date — stamp the capture month so the
      // monthly-coverage count is meaningful.
      const month = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}`;
      for (const it of items) records.push({ ...it, date: it.date || month });
      captures++;
      got += items.length;
      process.stdout.write('.');
    }
    console.log(` ${got} items`);
  }
  const payload = buildRawFromHeadlines(year, records, entityDefs);
  payload.provenance.capturesFetched = captures;
  return payload;
}

async function main() {
  const only = arg('--year');
  const from = Number(arg('--from', RSS_START));
  const to = Number(arg('--to', YEAR_END));
  const collapse = Number(arg('--collapse', 6));
  const delay = Number(arg('--delay', 1500));
  const feedFilter = arg('--feeds');
  const feedIds = feedFilter ? new Set(feedFilter.split(',')) : null;
  const years = only ? [Number(only)] : Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const entityDefs = allEntities();

  await mkdir(RAW, { recursive: true });
  for (const year of years) {
    let feeds = feedsForYear(year, BBC_FEEDS);
    if (feedIds) feeds = feeds.filter((f) => feedIds.has(f.id));
    if (!feeds.length) {
      console.log(`${year}: no feeds for this year — skipped`);
      continue;
    }
    console.log(`${year}: harvesting ${feeds.length} feed(s)…`);
    const payload = await harvestYear(year, { feeds, collapse, delay, entityDefs });
    await writeFile(join(RAW, `${year}.json`), JSON.stringify(payload, null, 2) + '\n');
    const p = payload.provenance;
    console.log(`  → ${p.distinctHeadlines} police headlines across ${p.monthsCovered} months (itemCount ${p.itemCount})\n`);
  }
  console.log('Done. Now run `npm run build-perception` (with Guardian raw present) to merge.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
