#!/usr/bin/env node
// Fetch a deep snapshot of data.police.uk and write it to src/content/policedata/
// as committed JSON. Run on a schedule by .github/workflows/police-data.yml, or
// on demand. The dev sandbox can't reach data.police.uk, so this is designed to
// run on a GitHub runner (or any machine with open internet).
//
// What it pulls:
//   • Stop & search — the one dataset exposed force-wide — for the last 12
//     months, for all 44 forces, aggregated into per-month series plus a
//     12-month window and the latest month in full. (GET /stops-force)
//   • Crime & outcomes — inherently geographic — for a curated set of major
//     city-centre points, last 12 months. Each street-crime record carries its
//     own category and latest outcome, so one call per point/month yields both.
//     (GET /crimes-street/all-crime)
//
// ~700 small requests once a month, throttled well under the 15 req/sec limit.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://data.police.uk/api';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/content/policedata');
const MONTHS = 12; // stop & search window (small per-request, all forces)
const CITY_MONTHS = 6; // crime window per city (large downloads — keep it lighter)
const DELAY_MS = 110;

// England & Wales city-centre points (Scotland and NI don't publish here).
const CITIES = [
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Birmingham', lat: 52.4796, lng: -1.9026 },
  { name: 'Manchester', lat: 53.4808, lng: -2.2426 },
  { name: 'Leeds', lat: 53.8008, lng: -1.5491 },
  { name: 'Liverpool', lat: 53.4084, lng: -2.9916 },
  { name: 'Sheffield', lat: 53.3811, lng: -1.4701 },
  { name: 'Bristol', lat: 51.4545, lng: -2.5879 },
  { name: 'Newcastle', lat: 54.9783, lng: -1.6178 },
  { name: 'Nottingham', lat: 52.9548, lng: -1.1581 },
  { name: 'Leicester', lat: 52.6369, lng: -1.1398 },
  { name: 'Cardiff', lat: 51.4816, lng: -3.1791 },
  { name: 'Coventry', lat: 52.4068, lng: -1.5197 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, tries = 5) {
  for (let i = 0; i < tries; i++) {
    let res;
    try {
      // Hard per-request timeout: Node's fetch has none, so one stalled
      // connection would otherwise hang the whole job indefinitely. Big forces
      // (Met, Merseyside) return large monthly responses, so allow 45s.
      res = await fetch(`${API}${path}`, {
        headers: { 'User-Agent': 'thinkingaboutpolicing.org snapshot (+https://thinkingaboutpolicing.org)' },
        signal: AbortSignal.timeout(45000),
      });
    } catch (err) {
      // Timeouts (AbortError) and network blips are retryable.
      if (i === tries - 1) throw err;
      await sleep(1000 * (i + 1));
      continue;
    }
    if (res.status === 404) return null; // no data for this force/point/month
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
    return res.json();
  }
  throw new Error(`${path} → exhausted retries`);
}

// Like api(), but degrades to null on persistent failure instead of throwing —
// so one stubborn force/point/month leaves a gap rather than failing the whole
// snapshot. Bootstrap calls (forces list, last-updated) still use api() so a
// genuine outage fails loudly.
async function safeApi(path) {
  try {
    return await api(path);
  } catch (err) {
    console.warn(`  ! skipped ${path}: ${err.message}`);
    return null;
  }
}

const titleCase = (s) => String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The last MONTHS month strings (YYYY-MM), oldest first, ending at `latest`.
function monthRange(latest, n) {
  const [y, m] = latest.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function tally(records, pick) {
  const map = new Map();
  for (const r of records) {
    const raw = pick(r);
    const label = raw == null || raw === '' ? 'Not stated' : titleCase(raw);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function mergeTallies(list) {
  const map = new Map();
  for (const { label, count } of list.flat()) map.set(label, (map.get(label) ?? 0) + count);
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// Find rate = share of searches whose outcome was linked to the object sought.
function findRate(records) {
  const known = records.filter((r) => typeof r.outcome_linked_to_object_of_search === 'boolean');
  if (!known.length) return null;
  return Math.round((known.filter((r) => r.outcome_linked_to_object_of_search).length / known.length) * 1000) / 1000;
}

function summariseStops(records) {
  return {
    total: records.length,
    findRate: findRate(records),
    byOutcome: tally(records, (r) => r.outcome),
    byOfficerEthnicity: tally(records, (r) => r.officer_defined_ethnicity),
    byObjectOfSearch: tally(records, (r) => r.object_of_search),
  };
}

async function main() {
  const now = new Date().toISOString();
  const updated = await api('/crime-last-updated');
  const latest = (updated?.date ?? '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(latest)) throw new Error(`Bad dataset month: ${JSON.stringify(updated)}`);
  const months = monthRange(latest, MONTHS);
  console.log(`Latest month: ${latest}; window: ${months[0]}..${latest}`);

  const provenance = { source: 'https://data.police.uk', licence: 'Open Government Licence v3.0', datasetMonth: latest, fetchedAt: now, windowMonths: MONTHS, sample: false };

  // Clean and recreate the forces dir so dropped forces don't linger.
  await rm(join(OUT, 'forces'), { recursive: true, force: true });
  await mkdir(join(OUT, 'forces'), { recursive: true });

  const forces = await api('/forces');
  await sleep(DELAY_MS);

  // --- Stop & search, per force, 12 months -------------------------------
  const nat = { series: months.map((m) => ({ month: m, total: 0, hits: 0, known: 0 })), windowOutcome: [], windowEth: [], windowObj: [] };
  const forcesMissingLatest = [];

  for (const force of forces) {
    const series = [];
    const windowRecordsSummaries = [];
    let latestSummary = null;

    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const records = (await safeApi(`/stops-force?force=${encodeURIComponent(force.id)}&date=${month}`)) || [];
      await sleep(DELAY_MS);
      const known = records.filter((r) => typeof r.outcome_linked_to_object_of_search === 'boolean');
      const hits = known.filter((r) => r.outcome_linked_to_object_of_search).length;
      series.push({ month, total: records.length, findRate: known.length ? Math.round((hits / known.length) * 1000) / 1000 : null });

      // National per-month accumulation.
      nat.series[i].total += records.length;
      nat.series[i].known += known.length;
      nat.series[i].hits += hits;

      if (records.length) {
        const s = summariseStops(records);
        windowRecordsSummaries.push(s);
        nat.windowOutcome.push(s.byOutcome);
        nat.windowEth.push(s.byOfficerEthnicity);
        nat.windowObj.push(s.byObjectOfSearch);
      }
      if (month === latest) latestSummary = records.length ? summariseStops(records) : null;
    }

    if (!latestSummary) forcesMissingLatest.push(force.id);

    const windowTotal = series.reduce((s, m) => s + m.total, 0);
    const win = windowTotal
      ? {
          total: windowTotal,
          byOutcome: mergeTallies(windowRecordsSummaries.map((s) => s.byOutcome)),
          byOfficerEthnicity: mergeTallies(windowRecordsSummaries.map((s) => s.byOfficerEthnicity)),
          byObjectOfSearch: mergeTallies(windowRecordsSummaries.map((s) => s.byObjectOfSearch)),
        }
      : null;

    await writeFile(
      join(OUT, 'forces', `${force.id}.json`),
      JSON.stringify({ kind: 'force', provenance, id: force.id, name: force.name, stopSearch: { latest: latestSummary, series, window: win } }, null, 2) + '\n'
    );
    console.log(`  ${force.id}: latest ${latestSummary ? latestSummary.total : '—'}, 12mo ${windowTotal}`);
  }

  const national = {
    kind: 'national',
    provenance,
    forcesCount: forces.length,
    forcesMissing: forcesMissingLatest,
    stopSearch: {
      latest: {
        total: nat.series[nat.series.length - 1].total,
        findRate: nat.series[nat.series.length - 1].known ? Math.round((nat.series[nat.series.length - 1].hits / nat.series[nat.series.length - 1].known) * 1000) / 1000 : null,
      },
      series: nat.series.map((m) => ({ month: m.month, total: m.total, findRate: m.known ? Math.round((m.hits / m.known) * 1000) / 1000 : null })),
      window: {
        total: nat.series.reduce((s, m) => s + m.total, 0),
        byOutcome: mergeTallies(nat.windowOutcome),
        byOfficerEthnicity: mergeTallies(nat.windowEth),
        byObjectOfSearch: mergeTallies(nat.windowObj),
      },
    },
  };
  await writeFile(join(OUT, 'national.json'), JSON.stringify(national, null, 2) + '\n');

  // --- Crime & outcomes, per city, recent months -------------------------
  const cityMonths = months.slice(-CITY_MONTHS);
  const places = [];
  for (const city of CITIES) {
    const series = [];
    let latestByCategory = [];
    let latestByOutcome = [];
    let latestTotal = 0;
    for (const month of cityMonths) {
      const crimes = (await safeApi(`/crimes-street/all-crime?lat=${city.lat}&lng=${city.lng}&date=${month}`)) || [];
      await sleep(DELAY_MS);
      series.push({ month, total: crimes.length });
      if (month === latest) {
        latestTotal = crimes.length;
        latestByCategory = tally(crimes, (c) => c.category);
        latestByOutcome = tally(crimes, (c) => (c.outcome_status ? c.outcome_status.category : 'Awaiting / under investigation'));
      }
    }
    places.push({ name: city.name, lat: city.lat, lng: city.lng, latestMonth: latest, latestTotal, byCategory: latestByCategory, byOutcome: latestByOutcome, series });
    console.log(`  ${city.name}: latest ${latestTotal} crimes`);
  }
  await writeFile(join(OUT, 'crime.json'), JSON.stringify({ kind: 'crime', provenance, places }, null, 2) + '\n');

  console.log(`\nDone. National latest ${national.stopSearch.latest.total}, 12mo ${national.stopSearch.window.total}. Missing latest: ${forcesMissingLatest.length} forces.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
