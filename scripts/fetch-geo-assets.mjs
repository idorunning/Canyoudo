#!/usr/bin/env node
// Fetch and commit the static geography the Crime Map needs:
//
//   src/data/force-centroids.json     one label point per force (tiny, inlined
//                                     into /data at build time — tier 1 dots)
//   public/geo/pfa-boundaries.json    ultra-generalised PFA polygons (hover
//                                     outlines; lazy-loaded, progressive)
//   public/geo/lsoa-centroids.json    LSOA population-weighted centroids
//                                     (tier 2 hotspot dots; lazy-loaded)
//
// Sources: ONS Open Geography Portal ArcGIS services, OGL v3.0. Police force
// boundaries are unchanged since 2017, so the Dec-2017 ultra-generalised
// (BUC 500m) file is current and ~15× smaller than the Dec-2023 generalised
// one. LSOA centroids merge the 2021 set with any 2011-only codes, since
// LSOA codes are stable across vintages except where areas split/merged —
// the union resolves whichever vintage the crime rollup carries.
//
// Verbose logging so runs teach us the real shape; loud failure on any
// surprise (size budgets, row counts, force-id mismatches). Run manually or
// from CI; outputs are committed.

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'thinkingaboutpolicing.org geo assets (+https://thinkingaboutpolicing.org)';
const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';

const PFA_SERVICE = `${ONS}/Police_Force_Areas_Dec_2017_EW_BUC_500_2022/FeatureServer/0/query`;
const LSOA_SERVICES = [
  { name: 'LSOA 2021 PWC', url: `${ONS}/LSOA_PopCentroids_EW_2021_V4/FeatureServer/0/query`, codeField: 'LSOA21CD' },
  { name: 'LSOA 2011 PWC', url: `${ONS}/LSOA_Dec_2011_PWC_in_England_and_Wales_2022/FeatureServer/0/query`, codeField: 'lsoa11cd' },
];

const OUT_CENTROIDS = join(ROOT, 'src/data/force-centroids.json');
const OUT_BOUNDARIES = join(ROOT, 'public/geo/pfa-boundaries.json');
const OUT_LSOA = join(ROOT, 'public/geo/lsoa-centroids.json');

const BOUNDARY_BUDGET = 600 * 1024; // bytes — fail loudly rather than ship a heavy map
const LSOA_MIN = 34000, LSOA_MAX = 39000; // 2021 set is 35,672; union adds a little

// PSNI is in data.police.uk but not in the ONS England & Wales file.
const EXTRA_CENTROIDS = { 'northern-ireland': { lat: 54.61, lng: -6.62, name: 'Police Service of Northern Ireland' } };

// Where a polygon's area centroid would put the dot somewhere unhelpful,
// pin a hand-tuned label point instead (checked by eye on the rendered map).
const CENTROID_OVERRIDES = {
  'devon-and-cornwall': { lat: 50.65, lng: -4.1 }, // pull off the Bodmin/It's-all-sea skew toward the spine of the peninsula
  'metropolitan': { lat: 51.44, lng: -0.05 },      // nudge south-east so the City of London dot stays legible beside it
};

// Same slug rules as scripts/fetch-recorded-crime.mjs — one way to name a force.
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const ALIASES = { 'metropolitan police': 'metropolitan', 'london, city of': 'city-of-london', 'city of london': 'city-of-london' };
const forceId = (name) => {
  const n = norm(name);
  if (ALIASES[n]) return ALIASES[n];
  return n.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body?.error) throw new Error(`${url} → ArcGIS error: ${JSON.stringify(body.error)}`);
  return body;
}

const q = (params) => new URLSearchParams({ where: '1=1', f: 'geojson', outSR: '4326', ...params }).toString();

// Area-weighted centroid (shoelace) of a polygon's largest ring — good enough
// for a label point on lat/lng at this scale; overrides handle the exceptions.
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    a += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
  }
  if (a === 0) return { lat: ring[0][1], lng: ring[0][0] };
  return { lng: cx / (3 * a), lat: cy / (3 * a) };
}
function largestRing(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let best = null, bestAbs = -1;
  for (const rings of polys) {
    const outer = rings[0];
    let a = 0;
    for (let i = 0; i < outer.length - 1; i++) a += outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
    if (Math.abs(a) > bestAbs) { bestAbs = Math.abs(a); best = outer; }
  }
  return best;
}

async function fetchBoundaries() {
  console.log('PFA boundaries (BUC 500m, Dec 2017)…');
  const fc = await getJson(`${PFA_SERVICE}?${q({ outFields: 'pfa17cd,pfa17nm', geometryPrecision: '3' })}`);
  if (fc.properties?.exceededTransferLimit) throw new Error('PFA query exceeded transfer limit — add pagination.');
  const features = fc.features ?? [];
  console.log(`  ${features.length} features`);
  if (features.length !== 43) throw new Error(`Expected 43 territorial EW forces, got ${features.length}.`);

  for (const f of features) {
    const name = f.properties.pfa17nm;
    f.properties = { id: forceId(name), name, code: f.properties.pfa17cd };
  }
  return { type: 'FeatureCollection', features };
}

function buildCentroids(boundaries) {
  const forces = {};
  for (const f of boundaries.features) {
    const { id, name } = f.properties;
    const c = CENTROID_OVERRIDES[id] ?? ringCentroid(largestRing(f.geometry));
    forces[id] = { lat: Math.round(c.lat * 1e4) / 1e4, lng: Math.round(c.lng * 1e4) / 1e4, name };
  }
  for (const [id, v] of Object.entries(EXTRA_CENTROIDS)) forces[id] = v;
  return forces;
}

async function fetchLsoaCentroids() {
  const c = {};
  for (const svc of LSOA_SERVICES) {
    let offset = 0, added = 0, seen = 0;
    for (;;) {
      const fc = await getJson(`${svc.url}?${q({
        outFields: svc.codeField, geometryPrecision: '4',
        resultOffset: String(offset), resultRecordCount: '2000',
      })}`);
      const feats = fc.features ?? [];
      let valid = 0;
      for (const f of feats) {
        seen++;
        const code = f.properties[svc.codeField];
        if (!code) continue;
        valid++;
        if (code in c) continue;
        const [lng, lat] = f.geometry.coordinates;
        c[code] = [lat, lng];
        added++;
      }
      // A page of rows with no readable codes means the field name is wrong —
      // fail loudly instead of quietly writing an empty/partial lookup.
      if (feats.length && !valid) throw new Error(`${svc.name}: no "${svc.codeField}" values in page at offset ${offset}.`);
      offset += feats.length;
      if (!feats.length || !fc.properties?.exceededTransferLimit) break;
      process.stdout.write(`\r  ${svc.name}: ${offset}…`);
    }
    console.log(`\r  ${svc.name}: ${seen} rows, ${added} new codes (total ${Object.keys(c).length})`);
  }
  return c;
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const committedIds = (await readdir(join(ROOT, 'src/content/policedata/forces')))
    .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  console.log(`Committed force ids (${committedIds.length}): ${committedIds.join(', ')}\n`);

  const boundaries = await fetchBoundaries();
  const forces = buildCentroids(boundaries);

  // The correctness pin: centroid ids must exactly equal the committed force
  // list. Anything extra or missing means the name→slug mapping drifted.
  const centroidIds = Object.keys(forces).sort();
  const missing = committedIds.filter((id) => !centroidIds.includes(id));
  const extra = centroidIds.filter((id) => !committedIds.includes(id));
  if (missing.length || extra.length) {
    throw new Error(`Force id mismatch — missing: [${missing.join(', ')}], extra: [${extra.join(', ')}]`);
  }
  for (const [id, v] of Object.entries(forces)) {
    if (v.lat < 49 || v.lat > 61 || v.lng < -8.7 || v.lng > 2) throw new Error(`Centroid for ${id} out of bounds: ${v.lat},${v.lng}`);
  }
  console.log(`  centroids OK — ${centroidIds.length} ids match committed forces\n`);

  const lsoa = await fetchLsoaCentroids();
  const lsoaCount = Object.keys(lsoa).length;
  if (lsoaCount < LSOA_MIN || lsoaCount > LSOA_MAX) throw new Error(`LSOA centroid count ${lsoaCount} outside [${LSOA_MIN}, ${LSOA_MAX}].`);

  const source = 'ONS Open Geography Portal (Open Government Licence v3.0)';
  await mkdir(dirname(OUT_BOUNDARIES), { recursive: true });

  const boundaryJson = JSON.stringify({ source, fetchedAt, ...boundaries });
  if (Buffer.byteLength(boundaryJson) > BOUNDARY_BUDGET) {
    throw new Error(`pfa-boundaries.json is ${Buffer.byteLength(boundaryJson)} bytes — over the ${BOUNDARY_BUDGET} budget. Lower geometryPrecision or switch service.`);
  }
  await writeFile(OUT_BOUNDARIES, boundaryJson + '\n');
  await writeFile(OUT_CENTROIDS, JSON.stringify({ source, fetchedAt, forces }, null, 2) + '\n');
  await writeFile(OUT_LSOA, JSON.stringify({ v: 1, source, fetchedAt, count: lsoaCount, c: lsoa }) + '\n');

  const kb = (p) => `${Math.round(Buffer.byteLength(p) / 1024)} KB`;
  console.log(`\nWrote:`);
  console.log(`  ${OUT_CENTROIDS} (${Object.keys(forces).length} forces)`);
  console.log(`  ${OUT_BOUNDARIES} (${kb(boundaryJson)})`);
  console.log(`  ${OUT_LSOA} (${lsoaCount} LSOAs, ${kb(JSON.stringify(lsoa))})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
