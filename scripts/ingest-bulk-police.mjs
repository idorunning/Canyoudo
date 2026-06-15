#!/usr/bin/env node
// Ingest data.police.uk into the Supabase police database (see
// supabase/migrations/0001_police_database.sql and docs/police-database.md).
//
// Two sources:
//   1. The bulk CSV archive (crime, outcomes, stop & search) → rollup tables.
//   2. The JSON API (forces, senior officers, neighbourhoods, priorities) → metadata.
//
// The dev sandbox can't reach data.police.uk, so this runs on a GitHub runner
// (.github/workflows/police-database.yml). All parsing/rollup logic lives in
// scripts/lib/police-csv.mjs and is unit-tested; this file is the I/O orchestration.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   required (writes bypass RLS)
//   ARCHIVE_URL        default https://data.police.uk/data/archive/latest.zip
//   INGEST_MONTHS      how many recent months of rollups to keep (default 36)
//   INGEST_LSOA_MONTHS how many recent months of LSOA map data (default 12)
//   SKIP_BULK / SKIP_API   set to '1' to run only one half
// Flags: --zip <path>  use a local archive instead of downloading
//        --months a,b   ingest exactly these months (overrides INGEST_MONTHS)
//        --dry-run      parse + summarise, don't write to Supabase

import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import {
  parseCsv,
  parseArchivePath,
  rollupStreetByCategory,
  rollupStreetByLsoa,
  rollupOutcomes,
  rollupStops,
  mergeCounts,
} from './lib/police-csv.mjs';

const API = 'https://data.police.uk/api';
const ARCHIVE_URL = process.env.ARCHIVE_URL || 'https://data.police.uk/data/archive/latest.zip';
const UA = 'thinkingaboutpolicing.org ingest (+https://thinkingaboutpolicing.org)';
const ALL = '_all'; // sentinel force id for national aggregates

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const DRY = flag('--dry-run');
const ZIP_PATH = opt('--zip');
const MONTHS_OPT = opt('--months');
const KEEP_MONTHS = Number(process.env.INGEST_MONTHS ?? 36);
const LSOA_MONTHS = Number(process.env.INGEST_LSOA_MONTHS ?? 12);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => createHash('md5').update(s).digest('hex');

// --- Supabase ----------------------------------------------------------------
async function getSupabase() {
  if (DRY) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function upsert(sb, table, rows, onConflict) {
  if (!rows.length) return 0;
  if (DRY || !sb) return rows.length;
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000);
    const { error } = await sb.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
  return rows.length;
}

// --- JSON API ----------------------------------------------------------------
async function api(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${API}${path}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(1000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`${path} → ${res.status}`);
      return res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

// --- bulk archive ------------------------------------------------------------
async function openArchive() {
  const unzipper = (await import('unzipper')).default;
  if (ZIP_PATH) {
    console.log(`Opening local archive ${ZIP_PATH}`);
    return unzipper.Open.file(ZIP_PATH);
  }
  const dir = await mkdtemp(join(tmpdir(), 'police-archive-'));
  const zipPath = join(dir, 'archive.zip');
  console.log(`Downloading ${ARCHIVE_URL} …`);
  const res = await fetch(ARCHIVE_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`archive download → ${res.status}`);
  await pipeline(res.body, createWriteStream(zipPath));
  const archive = await unzipper.Open.file(zipPath);
  archive._cleanup = () => rm(dir, { recursive: true, force: true });
  return archive;
}

// Decide which months to ingest from the months present in the archive.
function chooseMonths(present) {
  const sorted = [...present].sort();
  if (MONTHS_OPT) return MONTHS_OPT.split(',').map((s) => s.trim()).filter(Boolean);
  return sorted.slice(-KEEP_MONTHS);
}

async function ingestBulk(sb, runNotes) {
  const archive = await openArchive();
  try {
    const entries = archive.files.filter((f) => f.type === 'File' && /\.csv$/i.test(f.path));
    const parsed = entries.map((f) => ({ f, meta: parseArchivePath(f.path) })).filter((e) => e.meta);
    const monthsPresent = new Set(parsed.map((e) => e.meta.month));
    const wanted = new Set(chooseMonths(monthsPresent));
    const lsoaWanted = new Set([...wanted].sort().slice(-LSOA_MONTHS));
    console.log(`Archive: ${parsed.length} CSVs, ${monthsPresent.size} months present; ingesting ${wanted.size} months (LSOA: ${lsoaWanted.size}).`);

    // Per-force accumulators (force_id kept on each row; '_all' derived at the end).
    const crimeCat = []; // {force_id, month, category, count}
    const outcomes = []; // {force_id, month, outcome_category, count}
    const ssForce = []; // {force_id, month, total, find_count, find_known}
    const ssDim = []; // {force_id, month, dimension, value, count, find_count}
    const lsoaMap = new Map(); // `${code}|${month}` → {lsoa_code, lsoa_name, month, count}

    let done = 0;
    for (const { f, meta } of parsed) {
      if (!wanted.has(meta.month)) continue;
      const text = (await f.buffer()).toString('utf8');
      const records = parseCsv(text);
      if (meta.kind === 'street') {
        for (const c of rollupStreetByCategory(records)) crimeCat.push({ force_id: meta.force, month: meta.month, ...c });
        if (lsoaWanted.has(meta.month)) {
          for (const l of rollupStreetByLsoa(records)) {
            const k = `${l.lsoa_code}|${meta.month}`;
            const e = lsoaMap.get(k);
            if (e) e.count += l.count;
            else lsoaMap.set(k, { lsoa_code: l.lsoa_code, lsoa_name: l.lsoa_name, month: meta.month, count: l.count });
          }
        }
      } else if (meta.kind === 'outcomes') {
        for (const o of rollupOutcomes(records)) outcomes.push({ force_id: meta.force, month: meta.month, ...o });
      } else if (meta.kind === 'stop-and-search') {
        const r = rollupStops(records);
        ssForce.push({ force_id: meta.force, month: meta.month, total: r.total, find_count: r.find_count, find_known: r.find_known });
        for (const d of r.dims) ssDim.push({ force_id: meta.force, month: meta.month, ...d });
      }
      if (++done % 200 === 0) console.log(`  …${done} files`);
    }

    // Derive '_all' national aggregates by summing across forces, per month.
    const allCrime = byMonth(crimeCat, ['month', 'category'], ['count']);
    const allOutcome = byMonth(outcomes, ['month', 'outcome_category'], ['count']);
    const allSsForce = byMonth(ssForce, ['month'], ['total', 'find_count', 'find_known']);
    const allSsDim = byMonth(ssDim, ['month', 'dimension', 'value'], ['count', 'find_count']);

    const lsoaRows = [...lsoaMap.values()];
    let n = 0;
    n += await upsert(sb, 'crime_force_month', [...crimeCat, ...allCrime], 'force_id,month,category');
    n += await upsert(sb, 'outcome_force_month', [...outcomes, ...allOutcome], 'force_id,month,outcome_category');
    n += await upsert(sb, 'ss_force_month', [...ssForce, ...allSsForce], 'force_id,month');
    n += await upsert(sb, 'ss_dim', [...ssDim, ...allSsDim], 'force_id,month,dimension,value');
    n += await upsert(sb, 'crime_lsoa_month', lsoaRows, 'lsoa_code,month');
    runNotes.push(`bulk: ${wanted.size} months, ${n} rollup rows`);
    console.log(`Bulk done: ${n} rollup rows (${DRY ? 'dry-run, not written' : 'upserted'}).`);
    return n;
  } finally {
    await archive._cleanup?.();
  }
}

// Sum per-force rows into '_all' rows for one month grouping.
function byMonth(rows, keyFields, sumFields) {
  const merged = mergeCounts([rows], keyFields, sumFields);
  return merged.map((r) => ({ ...r, force_id: ALL }));
}

// --- JSON API metadata -------------------------------------------------------
async function ingestApi(sb, runNotes) {
  const forces = (await api('/forces')) || [];
  const forceRows = [];
  const peopleRows = [];
  const hoodRows = [];
  const prioRows = [];

  for (const f of forces) {
    const detail = await api(`/forces/${f.id}`);
    forceRows.push({
      id: f.id,
      name: f.name,
      description: detail?.description ?? null,
      url: detail?.url ?? null,
      telephone: detail?.telephone ?? null,
      engagement_methods: detail?.engagement_methods ?? null,
      updated_at: new Date().toISOString(),
    });
    const people = (await api(`/forces/${f.id}/people`)) || [];
    for (const p of people) if (p?.name) peopleRows.push({ force_id: f.id, name: p.name, rank: p.rank ?? null, bio: p.bio ?? null });

    const hoods = (await api(`/${f.id}/neighbourhoods`)) || [];
    for (const h of hoods) {
      const d = await api(`/${f.id}/${encodeURIComponent(h.id)}`);
      const centre = d?.centre || {};
      hoodRows.push({
        force_id: f.id, id: h.id, name: h.name ?? d?.name ?? null,
        centre_lat: centre.latitude ? Number(centre.latitude) : null,
        centre_lng: centre.longitude ? Number(centre.longitude) : null,
        url: d?.url_force ?? null, updated_at: new Date().toISOString(),
      });
      const prios = (await api(`/${f.id}/${encodeURIComponent(h.id)}/priorities`)) || [];
      for (const pr of prios) {
        const issue = stripHtml(pr.issue), action = stripHtml(pr.action);
        if (!issue && !action) continue;
        prioRows.push({
          force_id: f.id, neighbourhood_id: h.id, key: md5(`${issue}|${action}`),
          issue, action, issued_on: pr['issue-date'] ?? pr.issue_date ?? null,
        });
      }
      await sleep(60);
    }
    console.log(`  api: ${f.id} — ${hoods.length} neighbourhoods`);
    await sleep(60);
  }

  let n = 0;
  n += await upsert(sb, 'police_forces', forceRows, 'id');
  n += await upsert(sb, 'police_force_people', peopleRows, 'force_id,name');
  n += await upsert(sb, 'neighbourhoods', hoodRows, 'force_id,id');
  n += await upsert(sb, 'neighbourhood_priorities', dedupe(prioRows, (r) => `${r.force_id}|${r.neighbourhood_id}|${r.key}`), 'force_id,neighbourhood_id,key');
  runNotes.push(`api: ${forceRows.length} forces, ${hoodRows.length} neighbourhoods, ${prioRows.length} priorities`);
  console.log(`API done: ${n} metadata rows (${DRY ? 'dry-run' : 'upserted'}).`);
  return n;
}

const stripHtml = (s) => (s ? String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : null);
const dedupe = (rows, keyFn) => { const m = new Map(); for (const r of rows) m.set(keyFn(r), r); return [...m.values()]; };

// --- main --------------------------------------------------------------------
async function main() {
  const sb = await getSupabase();
  const startedAt = new Date().toISOString();
  const runNotes = [];
  let total = 0;
  try {
    if (process.env.SKIP_BULK !== '1') total += await ingestBulk(sb, runNotes);
    if (process.env.SKIP_API !== '1') total += await ingestApi(sb, runNotes);
    if (sb) await sb.from('ingest_runs').insert({ kind: 'bulk+api', rows_upserted: total, ok: true, notes: runNotes.join('; '), started_at: startedAt, finished_at: new Date().toISOString() });
    console.log(`\nDone. ${total} rows total. ${runNotes.join('; ')}`);
  } catch (err) {
    if (sb) await sb.from('ingest_runs').insert({ kind: 'bulk+api', rows_upserted: total, ok: false, notes: `${runNotes.join('; ')} | ERROR: ${err.message}`, started_at: startedAt, finished_at: new Date().toISOString() }).then(() => {}, () => {});
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
