#!/usr/bin/env node
// Bundle the committed police-data snapshot (stop & search) plus the Home Office
// recorded-crime snapshot into a single JSON the interpret Netlify function can
// import directly. Runs in `prebuild`, so it's always fresh at deploy time.

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/content/policedata');
const OUT = join(ROOT, 'src/lib/policedata-bundle.json');

const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));
const top = (arr, n = 12) => (arr || []).slice(0, n);

const national = await readJSON(join(SRC, 'national.json'));
const forceFiles = (await readdir(join(SRC, 'forces'))).filter((f) => f.endsWith('.json'));

// Optional: Home Office recorded crime (force-level offence mix). May be absent
// on a fresh checkout before the first fetch.
const recorded = await readJSON(join(ROOT, 'src/data/recorded-crime.json')).catch(() => null);
const rcForce = (id) => {
  const f = recorded?.forces?.[id];
  return f ? { period: recorded.period, total: f.total, byOffenceGroup: top(f.byOffenceGroup) } : null;
};

const forces = {};
for (const f of forceFiles) {
  const d = await readJSON(join(SRC, 'forces', f));
  forces[d.id] = { id: d.id, name: d.name, stopSearch: d.stopSearch, recordedCrime: rcForce(d.id) };
}

const bundle = {
  datasetMonth: national.provenance.datasetMonth,
  fetchedAt: national.provenance.fetchedAt,
  windowMonths: national.provenance.windowMonths,
  national: {
    forcesCount: national.forcesCount,
    forcesMissing: national.forcesMissing,
    stopSearch: national.stopSearch,
    recordedCrime: recorded
      ? { period: recorded.period, total: recorded.national.total, byOffenceGroup: top(recorded.national.byOffenceGroup) }
      : null,
  },
  forces,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(bundle) + '\n');
console.log(
  `bundle-policedata: ${Object.keys(forces).length} forces, month ${bundle.datasetMonth}` +
    (recorded ? `, recorded crime ${recorded.period}` : ', no recorded crime')
);
