#!/usr/bin/env node
// Seed the population denominators for the crime dashboard from ONS data:
//
//   force_population            total residents per police force area
//                               (unlocks per-1,000 rates and force comparison)
//   force_population_ethnicity  residents by broad ethnic group per force area
//                               (unlocks the stop & search disparity ratio —
//                               the table 0001 created but nothing seeded)
//
// The ONS tables ship as CSV downloads (population estimates for police force
// areas; census 2021 ethnic group by PFA). This script deliberately reads a
// LOCAL CSV you download from ons.gov.uk rather than scraping their API — the
// files are small, change once a year, and a human choosing the right table
// beats a parser guessing. Real numbers only: nothing here invents data.
//
// Usage:
//   node scripts/seed-population.mjs --totals path/to/pfa-population.csv --year mid-2023
//   node scripts/seed-population.mjs --ethnicity path/to/pfa-ethnicity.csv
//   ... --dry-run          parse and report, no database writes
//
// Column matching is by header name, case-insensitive: the force column is the
// first header containing "force" or "area name"; the population column the
// first containing "population" or "estimate" or "observation"; the ethnicity
// column (ethnicity mode) the first containing "ethnic". Rows that aren't a
// police force area (national/regional totals) are skipped by force-id lookup.
// An '_all' aggregate row is written as the sum of the 43 territorial forces
// (BTP has no resident population).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same as the ingest).

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const ALIASES = {
  'metropolitan police': 'metropolitan',
  'london, city of': 'city-of-london',
  'city of london': 'city-of-london',
  'devon and cornwall': 'devon-and-cornwall',
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const forceId = (name) => {
  const n = norm(name);
  if (ALIASES[n]) return ALIASES[n];
  return n.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

// The 43 territorial forces of England & Wales, as data.police.uk ids — the
// allowlist that separates PFA rows from national/regional totals in the CSV.
const TERRITORIAL_FORCES = new Set([
  'avon-and-somerset', 'bedfordshire', 'cambridgeshire', 'cheshire', 'city-of-london',
  'cleveland', 'cumbria', 'derbyshire', 'devon-and-cornwall', 'dorset', 'durham',
  'dyfed-powys', 'essex', 'gloucestershire', 'greater-manchester', 'gwent', 'hampshire',
  'hertfordshire', 'humberside', 'kent', 'lancashire', 'leicestershire', 'lincolnshire',
  'merseyside', 'metropolitan', 'norfolk', 'north-wales', 'north-yorkshire',
  'northamptonshire', 'northumbria', 'nottinghamshire', 'south-wales', 'south-yorkshire',
  'staffordshire', 'suffolk', 'surrey', 'sussex', 'thames-valley', 'warwickshire',
  'west-mercia', 'west-midlands', 'west-yorkshire', 'wiltshire',
]);

// Census ethnic-group labels → the broad groups ss_dim uses.
const BROAD_ETHNICITY = [
  [/asian/i, 'Asian'],
  [/black/i, 'Black'],
  [/mixed|multiple/i, 'Mixed'],
  [/white/i, 'White'],
  [/other/i, 'Other'],
];

// Minimal CSV parser (quoted fields, embedded commas/newlines) — same
// constraints as scripts/lib/police-csv.mjs, kept local to stay dependency-free.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
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

const findCol = (headers, patterns) =>
  headers.findIndex((h) => patterns.some((p) => p.test(h)));

function readTotals(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const headers = rows[0].map(norm);
  const fCol = findCol(headers, [/force/, /area name/]);
  const pCol = findCol(headers, [/population/, /estimate/, /observation/]);
  if (fCol === -1 || pCol === -1) {
    throw new Error(`Couldn't find force/population columns in headers: ${headers.join(' | ')}`);
  }
  const byForce = new Map();
  for (const r of rows.slice(1)) {
    const id = forceId(r[fCol]);
    const population = Math.round(Number(String(r[pCol]).replace(/,/g, '')));
    if (!TERRITORIAL_FORCES.has(id) || !Number.isFinite(population) || population <= 0) continue;
    byForce.set(id, (byForce.get(id) ?? 0) + population);
  }
  return byForce;
}

function readEthnicity(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const headers = rows[0].map(norm);
  const fCol = findCol(headers, [/force/, /area name/]);
  const eCol = findCol(headers, [/ethnic/]);
  const pCol = findCol(headers, [/population/, /estimate/, /observation/, /count/]);
  if (fCol === -1 || eCol === -1 || pCol === -1) {
    throw new Error(`Couldn't find force/ethnicity/population columns in headers: ${headers.join(' | ')}`);
  }
  const byKey = new Map(); // `${force}|${broad}` → count
  for (const r of rows.slice(1)) {
    const id = forceId(r[fCol]);
    if (!TERRITORIAL_FORCES.has(id)) continue;
    const label = String(r[eCol]);
    if (/total|all\b/i.test(label)) continue; // skip "All usual residents" style rows
    const broad = BROAD_ETHNICITY.find(([re]) => re.test(label))?.[1];
    const population = Math.round(Number(String(r[pCol]).replace(/,/g, '')));
    if (!broad || !Number.isFinite(population) || population <= 0) continue;
    const key = `${id}|${broad}`;
    byKey.set(key, (byKey.get(key) ?? 0) + population);
  }
  return byKey;
}

async function upsert(table, rows, conflict) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      totals: { type: 'string' },
      ethnicity: { type: 'string' },
      year: { type: 'string', default: 'mid-2023' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.totals && !values.ethnicity) {
    console.error('Nothing to do: pass --totals <csv> and/or --ethnicity <csv>. See the header comment.');
    process.exit(1);
  }
  const dry = values['dry-run'];
  if (!dry && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or use --dry-run).');
    process.exit(1);
  }

  if (values.totals) {
    const byForce = readTotals(values.totals);
    const missing = [...TERRITORIAL_FORCES].filter((id) => !byForce.has(id));
    const all = [...byForce.values()].reduce((s, v) => s + v, 0);
    const rows = [
      ...[...byForce].map(([force_id, population]) => ({ force_id, population, year: values.year })),
      // England & Wales aggregate — only meaningful when every force parsed.
      ...(missing.length === 0 ? [{ force_id: '_all', population: all, year: values.year }] : []),
    ];
    console.log(`totals: ${byForce.size}/43 forces parsed, sum ${all.toLocaleString('en-GB')}${missing.length ? `, missing: ${missing.join(', ')}` : ''}`);
    if (missing.length) console.warn('  (the _all aggregate is skipped until every force parses)');
    if (!dry) await upsert('force_population', rows, 'force_id');
  }

  if (values.ethnicity) {
    const byKey = readEthnicity(values.ethnicity);
    const rows = [...byKey].map(([key, population]) => {
      const [force_id, ethnicity] = key.split('|');
      return { force_id, ethnicity, population };
    });
    const forces = new Set(rows.map((r) => r.force_id));
    console.log(`ethnicity: ${rows.length} rows across ${forces.size}/43 forces`);
    if (!dry) await upsert('force_population_ethnicity', rows, 'force_id,ethnicity');
  }

  console.log(dry ? 'Dry run — nothing written.' : 'Done.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
