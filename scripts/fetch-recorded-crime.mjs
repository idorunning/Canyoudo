#!/usr/bin/env node
// Fetch Home Office "Police recorded crime open data" at Police Force Area level
// and aggregate the latest year into src/data/recorded-crime.json — giving the
// dashboard real crime breadth (burglary, violence, vehicle crime, drugs, …)
// force-wide, which data.police.uk can't provide.
//
// The data ships as .ods/.xlsx workbooks (not CSV), discovered via gov.uk's
// content API. Parsed with SheetJS. Verbose logging so CI runs teach us the
// real shape. OGL v3.0. Runs in CI — the dev sandbox can't reach gov.uk.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/recorded-crime.json');
const CONTENT_API =
  'https://www.gov.uk/api/content/government/statistical-data-sets/police-recorded-crime-and-outcomes-open-data-tables';
const UA = 'thinkingaboutpolicing.org snapshot (+https://thinkingaboutpolicing.org)';

async function get(url, kind) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  if (kind === 'buffer') return Buffer.from(await res.arrayBuffer());
  return res.json();
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const yearIn = (s) => Math.max(0, ...(String(s).match(/\b20\d\d\b/g) || []).map(Number));

const ALIASES = { 'metropolitan police': 'metropolitan', 'london, city of': 'city-of-london', 'city of london': 'city-of-london' };
const forceId = (name) => {
  const n = norm(name);
  if (ALIASES[n]) return ALIASES[n];
  return n.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

async function main() {
  const now = new Date().toISOString();
  console.log('Discovering files via gov.uk content API…');
  const content = await get(CONTENT_API);
  const attachments = content?.details?.attachments ?? [];

  // The main recorded-crime-by-PFA workbook: "recorded crime open data", as a
  // spreadsheet, excluding the many sibling tables (outcomes, transferred, fraud,
  // firearms, knives, CSP, VAWG subcodes, geography reference, etc.).
  const EXCLUDE = /(outcome|transferred|cancelled|fraud|firearm|knive|knife|sharp|csp|community safety|vawg|subcode|supplementary|geograph|reference|alternate)/i;
  const isSheet = (a) => /\.(ods|xlsx|xls)(\?|$)/i.test(a.url || '');
  const candidates = attachments.filter(
    (a) => isSheet(a) && /recorded crime/i.test(a.title || '') && !EXCLUDE.test(a.title || '')
  );
  console.log(`\nRecorded-crime workbook candidates (${candidates.length}):`);
  for (const a of candidates) console.log(`  - [yr ${yearIn(a.title)}] ${a.title}  ${a.url}`);

  const pick = candidates.sort((a, b) => yearIn(b.title) - yearIn(a.title))[0];
  if (!pick) {
    console.log('\nNo recorded-crime workbook matched. All sheet attachments:');
    for (const a of attachments.filter(isSheet)) console.log(`  - ${a.title}`);
    throw new Error('No recorded-crime workbook found.');
  }
  console.log(`\nUsing: "${pick.title}"\n  ${pick.url}`);

  const wb = XLSX.read(await get(pick.url, 'buffer'), { type: 'buffer' });
  console.log(`Sheets: ${wb.SheetNames.join(' | ')}`);

  // The workbook has one sheet per financial year — scan them all, collect every
  // row, then keep the latest year. Header has a high-level "Offence Group" column
  // (preferred over the granular offence-description column).
  const detect = (cells) => {
    const iForce = cells.findIndex((c) => c === 'force name' || c === 'force' || c === 'pfa');
    const iGroupStrict = cells.findIndex((c) => c.includes('offence group'));
    const iGroupAny = cells.findIndex((c) => c.includes('offence subgroup') || c.includes('offence description') || c === 'offence');
    const iGroup = iGroupStrict >= 0 ? iGroupStrict : iGroupAny;
    const iCount = cells.findIndex((c) => c.includes('number of offences') || c === 'count');
    const iYear = cells.findIndex((c) => c.includes('financial year') || c.includes('year ending') || c === 'year');
    return iForce >= 0 && iGroup >= 0 && iCount >= 0 ? { iForce, iGroup, iCount, iYear } : null;
  };

  let cols = null;
  const records = [];
  const perSheet = {};
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, blankrows: false });
    let hr = -1, idx = null;
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      idx = detect((rows[r] || []).map(norm));
      if (idx) { hr = r; break; }
    }
    if (hr < 0) continue;
    if (!cols) cols = { ...idx, header: rows[hr], sheet: name };
    let c = 0;
    for (const row of rows.slice(hr + 1)) {
      if (!row[idx.iForce]) continue;
      records.push({
        force: String(row[idx.iForce]).trim(),
        group: String(row[idx.iGroup]).trim(),
        n: Number(String(row[idx.iCount]).replace(/[^0-9.-]/g, '')) || 0,
        year: idx.iYear >= 0 ? String(row[idx.iYear]).trim() : '',
      });
      c++;
    }
    perSheet[name] = c;
  }

  if (!cols) {
    console.log('\nCould not auto-detect the table. First sheet preview:');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, blankrows: false });
    rows.slice(0, 10).forEach((r, i) => console.log(`  [${i}] ${JSON.stringify(r).slice(0, 300)}`));
    throw new Error('Header row not located — adjust column matching.');
  }
  console.log(`\nHeader: ${JSON.stringify(cols.header)}`);
  console.log(`Rows per sheet: ${JSON.stringify(perSheet)}`);

  const years = [...new Set(records.map((r) => r.year).filter(Boolean))];
  const latestYear = years.length ? years.slice().sort((a, b) => yearIn(a) - yearIn(b)).at(-1) : String(yearIn(pick.title));
  console.log(`Years (${years.length}): ${years.join(', ')}; latest: ${latestYear}`);

  // Skip non-territorial aggregate/central rows so the national total is the sum
  // of forces (not double-counted) and fraud-central bodies don't pose as forces.
  const NONFORCE = /^(england and wales|action fraud|cifas|uk finance|fraud)\b/i;

  const forces = {};
  const national = new Map();
  for (const rec of records) {
    if (latestYear && rec.year && rec.year !== latestYear) continue;
    if (NONFORCE.test(rec.force)) continue;
    const id = forceId(rec.force);
    if (!id) continue;
    forces[id] ??= { name: rec.force, total: 0, groups: new Map() };
    forces[id].total += rec.n;
    forces[id].groups.set(rec.group, (forces[id].groups.get(rec.group) ?? 0) + rec.n);
    national.set(rec.group, (national.get(rec.group) ?? 0) + rec.n);
  }

  console.log(`\nForces (${Object.keys(forces).length}): ${Object.keys(forces).sort().join(', ')}`);
  console.log(`Offence groups (${national.size}): ${[...national.keys()].join(' | ')}`);

  const tidy = (m) => [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const out = {
    source: 'Home Office — Police recorded crime open data (Open Government Licence v3.0)',
    period: latestYear,
    fetchedAt: now,
    file: pick.title,
    national: { total: [...national.values()].reduce((a, b) => a + b, 0), byOffenceGroup: tidy(national) },
    forces: Object.fromEntries(
      Object.entries(forces).map(([id, f]) => [id, { name: f.name, total: f.total, byOffenceGroup: tidy(f.groups) }])
    ),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote ${OUT}: ${Object.keys(out.forces).length} forces, period ${latestYear}, national total ${out.national.total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
