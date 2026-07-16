#!/usr/bin/env node
// Build the population seed CSVs for scripts/seed-population.mjs from live
// open APIs — no hand-downloading, no invented numbers:
//
//   data/seeds/pfa-ethnicity-census2021.csv   Census 2021 TS021 (NOMIS,
//       keyless) at local-authority grain, the five BROAD group codes only,
//       aggregated to police force areas via the ONS LAD→CSP→PFA lookup.
//       Seeds force_population_ethnicity → unlocks the stop & search
//       disparity ratios.
//   data/seeds/pfa-population-<year>.csv      ONS mid-year population
//       estimates (NOMIS NM_2002) at current local authorities, aggregated
//       the same way. Seeds force_population → unlocks per-1,000 rates.
//
// The two datasets sit on different local-authority vintages (census 2021 on
// 2022 LADs; mid-year estimates on the current map, reorganised in 2023), so
// each is matched against the lookup year that actually covers its codes —
// a vintage mismatch fails loudly rather than silently dropping Cumbria.
//
// Headers are exactly what seed-population.mjs's column regexes expect
// ("police force area" → /force/, "ethnic group" → /ethnic/, "population").
// Sources: ONS/NOMIS, Open Government Licence v3.0.
//
// Usage: node scripts/fetch-census-ethnicity.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  forceId, TERRITORIAL_FORCES, broadGroupOf, ladToPfa, aggregateToPfa, toCsv, assertPfaCoverage,
} from './lib/census-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/seeds');
const UA = 'thinkingaboutpolicing.org seeds (+https://thinkingaboutpolicing.org)';

const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset';
// TS021 broad ethnic-group codes — the five top-level categories only (the 19
// detailed labels are ambiguous under regex folding; census-lib rejects them).
// Fetched one code per request: NOMIS 503s the combined query.
const TS021_CODES = [1001, 1002, 1003, 1004, 1005];
const ts021Url = (code) =>
  `${NOMIS}/NM_2041_1.data.csv?date=latest&geography=TYPE154&c2021_eth_20=${code}&measures=20100&select=GEOGRAPHY_CODE,GEOGRAPHY_NAME,C2021_ETH_20_NAME,OBS_VALUE`;
// TYPE424 = the current local-authority map. Older-vintage types return
// OBS_VALUE 0 for districts abolished in the 2023 reorganisation (Cumbria,
// North Yorkshire, Somerset) rather than omitting them — so the fetch runs on
// the current map and any zero row is treated as a data error, never as an
// empty district.
const MIDYEAR = `${NOMIS}/NM_2002_1.data.csv?date=latest&geography=TYPE424&gender=0&c_age=200&measures=20100&select=GEOGRAPHY_CODE,GEOGRAPHY_NAME,DATE_NAME,OBS_VALUE`;

const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';
// Tried newest-first until one covers every England & Wales LAD code present
// in the data being aggregated.
const LOOKUPS = ['LAD24_CSP24_PFA24_EW_LU', 'LAD23_CSP23_PFA23_EW_LU', 'LAD25_CSP25_PFA25_EW_LU', 'LAD22_CSP22_PFA22_EW_LU'];

async function get(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) {
    if (attempt < 3 && (res.status === 503 || res.status === 429)) {
      console.log(`  ${res.status} from upstream — retrying in ${attempt * 5}s…`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
      return get(url, attempt + 1);
    }
    throw new Error(`${url} → ${res.status} ${res.statusText}`);
  }
  return res;
}

function parseCsv(text) {
  // NOMIS CSV: all fields quoted, no embedded newlines observed — but parse
  // defensively anyway (same minimal state machine as seed-population.mjs).
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

const isEwLad = (code) => /^[EW]0[6-9]/.test(code);

async function fetchLookup(name) {
  const yr = name.slice(3, 5);
  const rows = [];
  let offset = 0;
  for (;;) {
    const res = await get(`${ONS}/${name}/FeatureServer/0/query?where=1%3D1&outFields=LAD${yr}CD,LAD${yr}NM,PFA${yr}CD,PFA${yr}NM&returnGeometry=false&resultOffset=${offset}&resultRecordCount=1000&f=json`);
    const body = await res.json();
    if (body.error) throw new Error(`${name}: ${JSON.stringify(body.error)}`);
    const feats = body.features ?? [];
    for (const f of feats) {
      rows.push({
        ladCode: f.attributes[`LAD${yr}CD`], pfaCode: f.attributes[`PFA${yr}CD`], pfaName: f.attributes[`PFA${yr}NM`],
      });
    }
    offset += feats.length;
    if (!feats.length || !body.exceededTransferLimit) break;
  }
  return ladToPfa(rows);
}

// Find the lookup vintage that covers every LAD code in `codes`.
async function matchedLookup(codes) {
  const wanted = [...new Set(codes)].filter(isEwLad);
  for (const name of LOOKUPS) {
    const lookup = await fetchLookup(name);
    const missing = wanted.filter((c) => !lookup.has(c));
    if (!missing.length) {
      console.log(`  lookup ${name}: covers all ${wanted.length} LADs`);
      return lookup;
    }
    console.log(`  lookup ${name}: ${missing.length} LADs uncovered (${missing.slice(0, 4).join(', ')}…) — trying next vintage`);
  }
  throw new Error('No LAD→PFA lookup vintage covers this dataset — check the reorganisation trap.');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // --- ethnicity (census 2021) -----------------------------------------------
  console.log('Census 2021 TS021 ethnic group (NOMIS, broad codes only)…');
  const ebody = [];
  for (const code of TS021_CODES) {
    const [eh, ...rows] = parseCsv(await (await get(ts021Url(code))).text());
    if (eh.join(',') !== 'GEOGRAPHY_CODE,GEOGRAPHY_NAME,C2021_ETH_20_NAME,OBS_VALUE') {
      throw new Error(`TS021 header surprise for code ${code}: ${eh.join(',')}`);
    }
    console.log(`  code ${code}: ${rows.length} rows (${rows[0]?.[2] ?? '?'})`);
    ebody.push(...rows);
  }
  const ethObs = ebody
    .filter((r) => isEwLad(r[0]))
    .map((r) => ({ ladCode: r[0], ladName: r[1], group: broadGroupOf(r[2]), value: Number(r[3]) }));
  if (ethObs.some((o) => !Number.isFinite(o.value))) throw new Error('TS021: non-numeric observation');
  const ladCount = new Set(ethObs.map((o) => o.ladCode)).size;
  console.log(`  ${ethObs.length} observations across ${ladCount} LADs`);
  if (ladCount < 320 || ladCount > 345) throw new Error(`TS021 LAD count ${ladCount} outside expectation`);

  const ethLookup = await matchedLookup(ethObs.map((o) => o.ladCode));
  const eth = aggregateToPfa(ethObs, ethLookup);
  if (eth.orphans.length) throw new Error(`TS021 LADs with no PFA: ${eth.orphans.join(', ')}`);
  const pfaNames = new Set([...eth.sums.keys()].map((k) => k.split('|')[0]));
  assertPfaCoverage(pfaNames);
  const grand = [...eth.sums.values()].reduce((s, v) => s + v, 0);
  console.log(`  ${pfaNames.size} PFAs, E&W total ${grand.toLocaleString('en-GB')}`);
  if (grand < 58_000_000 || grand > 61_500_000) throw new Error(`E&W census total ${grand} implausible`);

  const ethCsv = toCsv(
    ['police force area', 'ethnic group', 'population'],
    [...eth.sums].map(([key, v]) => { const [pfa, group] = key.split('|'); return [pfa, group, v]; })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])))
  );
  const ethPath = join(OUT_DIR, 'pfa-ethnicity-census2021.csv');
  await writeFile(ethPath, ethCsv);

  // --- mid-year totals ---------------------------------------------------------
  console.log('ONS mid-year population estimates (NOMIS NM_2002)…');
  const popRows = parseCsv(await (await get(MIDYEAR)).text());
  const [ph, ...pbody] = popRows;
  if (ph.join(',') !== 'GEOGRAPHY_CODE,GEOGRAPHY_NAME,DATE_NAME,OBS_VALUE') {
    throw new Error(`NM_2002 header surprise: ${ph.join(',')}`);
  }
  const year = pbody[0]?.[2];
  const popObs = pbody
    .filter((r) => isEwLad(r[0]))
    .map((r) => ({ ladCode: r[0], ladName: r[1], value: Number(r[3]) }));
  console.log(`  ${popObs.length} E&W LADs, year ${year}`);
  if (popObs.length < 290 || popObs.length > 345) throw new Error(`NM_2002 LAD count ${popObs.length} outside expectation`);
  const zeros = popObs.filter((o) => !(o.value > 0));
  if (zeros.length) throw new Error(`NM_2002 zero/blank populations (geography-vintage trap): ${zeros.slice(0, 5).map((o) => o.ladName).join(', ')}`);

  const popLookup = await matchedLookup(popObs.map((o) => o.ladCode));
  const pop = aggregateToPfa(popObs, popLookup);
  if (pop.orphans.length) throw new Error(`NM_2002 LADs with no PFA: ${pop.orphans.join(', ')}`);
  const popNames = new Set([...pop.sums.keys()].map((k) => k.split('|')[0]));
  assertPfaCoverage(popNames);
  const popGrand = [...pop.sums.values()].reduce((s, v) => s + v, 0);
  console.log(`  ${popNames.size} PFAs, E&W total ${popGrand.toLocaleString('en-GB')}`);
  if (popGrand < 59_000_000 || popGrand > 64_000_000) throw new Error(`E&W mid-year total ${popGrand} implausible`);

  const popCsv = toCsv(
    ['police force area', 'population'],
    [...pop.sums].map(([key, v]) => [key.split('|')[0], v]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
  const popPath = join(OUT_DIR, `pfa-population-mid-${year}.csv`);
  await writeFile(popPath, popCsv);

  await writeFile(join(OUT_DIR, 'README.md'), `# Population seed CSVs

Generated by \`scripts/fetch-census-ethnicity.mjs\` on ${fetchedAt}. Sources
(Open Government Licence v3.0): Census 2021 TS021 ethnic group (ONS via the
NOMIS API, five broad categories, local-authority grain) and ONS mid-year
population estimates (${year}), both aggregated to police force areas with the
ONS LAD→CSP→PFA lookup, vintage-matched to each dataset's local-authority map.

Load into Supabase with:

    node scripts/seed-population.mjs --ethnicity data/seeds/pfa-ethnicity-census2021.csv
    node scripts/seed-population.mjs --totals data/seeds/pfa-population-mid-${year}.csv --year mid-${year}

(or dispatch the seed-population job in .github/workflows/police-database.yml).
`);

  console.log(`\nWrote:\n  ${ethPath}\n  ${popPath}\n  ${join(OUT_DIR, 'README.md')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
