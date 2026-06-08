#!/usr/bin/env node
// Bundle the committed police-data snapshot (national + every force) into a
// single JSON the interpret Netlify function can import directly — no runtime
// filesystem juggling. Runs in `prebuild`, so it's always fresh at deploy time.

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/content/policedata');
const OUT = join(ROOT, 'src/lib/policedata-bundle.json');

const readJSON = async (p) => JSON.parse(await readFile(join(SRC, p), 'utf8'));

const national = await readJSON('national.json');
const forceFiles = (await readdir(join(SRC, 'forces'))).filter((f) => f.endsWith('.json'));

const forces = {};
for (const f of forceFiles) {
  const d = await readJSON(`forces/${f}`);
  forces[d.id] = { id: d.id, name: d.name, stopSearch: d.stopSearch };
}

const bundle = {
  datasetMonth: national.provenance.datasetMonth,
  fetchedAt: national.provenance.fetchedAt,
  windowMonths: national.provenance.windowMonths,
  national: {
    forcesCount: national.forcesCount,
    forcesMissing: national.forcesMissing,
    stopSearch: national.stopSearch,
  },
  forces,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(bundle) + '\n');
console.log(`bundle-policedata: ${Object.keys(forces).length} forces, month ${bundle.datasetMonth}`);
