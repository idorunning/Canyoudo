#!/usr/bin/env node
// Fetch a monthly snapshot of stop & search from data.police.uk and write it to
// src/content/policedata/ as committed JSON. Run on a schedule by
// .github/workflows/police-data.yml; safe to run locally too.
//
// Why only stop & search: it is the one dataset the API exposes force-wide
// (GET /api/stops-force?force=&date=). Crime is geographic — retrievable only by
// point or polygon — so it lives in the site's client-side area lookup, not here.
//
// The whole job is ~45 small requests once a month, so we keep it simple and
// sequential with a polite delay, well inside the 15 req/sec limit.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://data.police.uk/api';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/content/policedata');
const DELAY_MS = 120; // ~8 req/sec — comfortably under the 15/sec limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'User-Agent': 'thinkingaboutpolicing.org snapshot (+https://thinkingaboutpolicing.org)' },
  });
  if (res.status === 404) return null; // no data for this force/month
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

// data.police.uk uses inconsistent casing/phrasing; fold to readable buckets and
// keep counts ordered, largest first.
function tally(records, key) {
  const map = new Map();
  for (const r of records) {
    const raw = r[key];
    const label = raw == null || raw === '' ? 'Not stated' : String(raw);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// Find rate = share of searches whose outcome was linked to the object of the
// search (outcome_linked_to_object_of_search). Null when the force doesn't
// supply the field.
function findRate(records) {
  const known = records.filter((r) => typeof r.outcome_linked_to_object_of_search === 'boolean');
  if (known.length === 0) return null;
  const hits = known.filter((r) => r.outcome_linked_to_object_of_search).length;
  return Math.round((hits / known.length) * 1000) / 1000;
}

function summarise(records) {
  return {
    total: records.length,
    findRate: findRate(records),
    byOutcome: tally(records, 'outcome'),
    byOfficerEthnicity: tally(records, 'officer_defined_ethnicity'),
    byObjectOfSearch: tally(records, 'object_of_search'),
  };
}

// Merge per-force tallies into a national total.
function mergeTallies(list) {
  const map = new Map();
  for (const { label, count } of list.flat()) map.set(label, (map.get(label) ?? 0) + count);
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

async function main() {
  const now = new Date().toISOString();

  // The month the API was last refreshed for. stops-force accepts YYYY-MM.
  const updated = await api('/crime-last-updated');
  const datasetMonth = (updated?.date ?? '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(datasetMonth)) throw new Error(`Bad dataset month: ${JSON.stringify(updated)}`);
  console.log(`Dataset month: ${datasetMonth}`);

  const forces = await api('/forces');
  await sleep(DELAY_MS);

  await mkdir(join(OUT, 'forces'), { recursive: true });

  const provenance = (sample = false) => ({
    source: 'https://data.police.uk',
    licence: 'Open Government Licence v3.0',
    datasetMonth,
    fetchedAt: now,
    sample,
  });

  const forcesMissing = [];
  const outcomeTallies = [];
  const ethnicityTallies = [];
  const objectTallies = [];
  let nationalTotal = 0;
  let nationalHits = 0;
  let nationalKnown = 0;

  for (const force of forces) {
    const records = await api(`/stops-force?force=${encodeURIComponent(force.id)}&date=${datasetMonth}`);
    await sleep(DELAY_MS);

    const hasData = Array.isArray(records) && records.length > 0;
    if (!hasData) forcesMissing.push(force.id);

    const stopSearch = hasData ? summarise(records) : null;

    if (hasData) {
      outcomeTallies.push(stopSearch.byOutcome);
      ethnicityTallies.push(stopSearch.byOfficerEthnicity);
      objectTallies.push(stopSearch.byObjectOfSearch);
      nationalTotal += stopSearch.total;
      const known = records.filter((r) => typeof r.outcome_linked_to_object_of_search === 'boolean');
      nationalKnown += known.length;
      nationalHits += known.filter((r) => r.outcome_linked_to_object_of_search).length;
    }

    const file = {
      kind: 'force',
      provenance: provenance(),
      id: force.id,
      name: force.name,
      stopSearch,
    };
    await writeFile(join(OUT, 'forces', `${force.id}.json`), JSON.stringify(file, null, 2) + '\n');
    console.log(`  ${force.id}: ${hasData ? stopSearch.total : 'no data'}`);
  }

  const national = {
    kind: 'national',
    provenance: provenance(),
    forcesCount: forces.length,
    forcesMissing,
    stopSearch: {
      total: nationalTotal,
      findRate: nationalKnown ? Math.round((nationalHits / nationalKnown) * 1000) / 1000 : null,
      byOutcome: mergeTallies(outcomeTallies),
      byOfficerEthnicity: mergeTallies(ethnicityTallies),
      byObjectOfSearch: mergeTallies(objectTallies),
    },
  };
  await writeFile(join(OUT, 'national.json'), JSON.stringify(national, null, 2) + '\n');

  console.log(`\nNational total: ${nationalTotal} stops across ${forces.length - forcesMissing.length} forces`);
  if (forcesMissing.length) console.log(`No data for ${datasetMonth}: ${forcesMissing.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
