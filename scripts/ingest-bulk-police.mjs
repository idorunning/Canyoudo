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
//   FULL_DOWNLOAD      set to '1' to force downloading the whole archive instead
//                      of the default per-entry HTTP range reads
//
// Phasing: the bulk archive is multi-GB, so rather than fetch it whole (which
// times out), we read its central directory and then each wanted CSV entry via
// HTTP range requests, and process+upsert ONE MONTH AT A TIME. Each month is an
// independent, idempotent upsert, so a partial run still persists and a re-run
// resumes cleanly. If the host doesn't honour range requests we fall back to a
// single streamed download (see openArchive / FULL_DOWNLOAD).
// Flags: --zip <path>  use a local archive instead of downloading
//        --months a,b   ingest exactly these months (overrides INGEST_MONTHS)
//        --dry-run      parse + summarise, don't write to Supabase

import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PassThrough, Readable } from 'node:stream';
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
// A small fetch wrapper with retry/backoff and a per-request timeout, used for
// the range reads (and the size probe) so a transient blip doesn't fail the run.
async function fetchRetry(url, init = {}, tries = 4, timeoutMs = 120_000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) { await sleep(1000 * (i + 1)); continue; }
      return res;
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error(`fetch failed after ${tries} tries: ${url}`);
}

// An unzipper "custom" source backed by HTTP range requests. unzipper reads the
// zip's central directory from the tail, then pulls each entry on demand — so we
// only ever transfer the bytes we actually parse, in many small requests rather
// than one giant download that times out.
function rangeSource(url) {
  return {
    async size() {
      const head = await fetchRetry(url, { method: 'HEAD' });
      const len = Number(head.headers.get('content-length'));
      if (Number.isFinite(len) && len > 0) return len;
      // Some hosts don't answer HEAD with a length; ask for one byte and read
      // the total out of the Content-Range header instead.
      const probe = await fetchRetry(url, { headers: { Range: 'bytes=0-0' } });
      const total = Number((probe.headers.get('content-range') || '').split('/')[1]);
      if (Number.isFinite(total) && total > 0) return total;
      throw new Error('archive host did not report a size (no Content-Length or Content-Range)');
    },
    // Must return a Node Readable synchronously; fetch is async, so pipe into a
    // PassThrough once the response lands.
    stream(offset, bytes) {
      const end = bytes ? offset + bytes - 1 : '';
      const pass = new PassThrough();
      fetchRetry(url, { headers: { Range: `bytes=${offset}-${end}` } })
        .then((res) => {
          if (res.status !== 206 && res.status !== 200) { pass.destroy(new Error(`range request → ${res.status}`)); return; }
          if (!res.body) { pass.destroy(new Error('range request returned no body')); return; }
          Readable.fromWeb(res.body).pipe(pass);
        })
        .catch((err) => pass.destroy(err));
      return pass;
    },
  };
}

// Returns { files, cleanup }. Default: read via HTTP range (no full download).
// Falls back to a single streamed download if --zip is given, FULL_DOWNLOAD=1,
// or the range read fails (e.g. the host ignores Range headers).
async function openArchive() {
  const unzipper = (await import('unzipper')).default;
  if (ZIP_PATH) {
    console.log(`Opening local archive ${ZIP_PATH}`);
    const d = await unzipper.Open.file(ZIP_PATH);
    return { files: d.files };
  }
  if (process.env.FULL_DOWNLOAD !== '1') {
    try {
      console.log(`Opening ${ARCHIVE_URL} via HTTP range reads …`);
      const d = await unzipper.Open.custom(rangeSource(ARCHIVE_URL));
      if (!d.files?.length) throw new Error('central directory read returned no files');
      console.log(`Central directory read: ${d.files.length} entries.`);
      return { files: d.files };
    } catch (err) {
      console.warn(`Range read unavailable (${err.message}); falling back to full download.`);
    }
  }
  return downloadAndOpen(unzipper);
}

// Fallback: stream the whole archive to disk, then open it locally.
async function downloadAndOpen(unzipper) {
  const dir = await mkdtemp(join(tmpdir(), 'police-archive-'));
  const zipPath = join(dir, 'archive.zip');
  console.log(`Downloading ${ARCHIVE_URL} …`);
  const res = await fetch(ARCHIVE_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(50 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`archive download → ${res.status}`);
  await pipeline(res.body, createWriteStream(zipPath));
  const d = await unzipper.Open.file(zipPath);
  return { files: d.files, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

// Read one entry's bytes, retrying transient range-read failures.
async function entryBuffer(f, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { return await f.buffer(); }
    catch (err) { if (i === tries - 1) throw err; await sleep(1000 * (i + 1)); }
  }
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

    // Group the wanted entries by month so each month is processed and written
    // as one independent, idempotent phase.
    const byMonthEntries = new Map();
    for (const e of parsed) {
      if (!wanted.has(e.meta.month)) continue;
      if (!byMonthEntries.has(e.meta.month)) byMonthEntries.set(e.meta.month, []);
      byMonthEntries.get(e.meta.month).push(e);
    }

    let total = 0;
    const orderedMonths = [...wanted].sort();
    for (const month of orderedMonths) {
      const monthEntries = byMonthEntries.get(month) || [];
      if (!monthEntries.length) continue;
      const monthStart = new Date().toISOString();

      // Per-force accumulators for this month only ('_all' derived below).
      const crimeCat = []; // {force_id, month, category, count}
      const outcomes = []; // {force_id, month, outcome_category, count}
      const ssForce = []; // {force_id, month, total, find_count, find_known}
      const ssDim = []; // {force_id, month, dimension, value, count, find_count}
      const lsoaMap = new Map(); // `${code}|${month}` → {lsoa_code, lsoa_name, month, count}

      for (const { f, meta } of monthEntries) {
        const text = (await entryBuffer(f)).toString('utf8');
        const records = parseCsv(text);
        if (meta.kind === 'street') {
          for (const c of rollupStreetByCategory(records)) crimeCat.push({ force_id: meta.force, month, ...c });
          if (lsoaWanted.has(month)) {
            for (const l of rollupStreetByLsoa(records)) {
              const k = `${l.lsoa_code}|${month}`;
              const e = lsoaMap.get(k);
              if (e) e.count += l.count;
              else lsoaMap.set(k, { lsoa_code: l.lsoa_code, lsoa_name: l.lsoa_name, month, count: l.count });
            }
          }
        } else if (meta.kind === 'outcomes') {
          for (const o of rollupOutcomes(records)) outcomes.push({ force_id: meta.force, month, ...o });
        } else if (meta.kind === 'stop-and-search') {
          const r = rollupStops(records);
          ssForce.push({ force_id: meta.force, month, total: r.total, find_count: r.find_count, find_known: r.find_known });
          for (const d of r.dims) ssDim.push({ force_id: meta.force, month, ...d });
        }
      }

      // Derive this month's '_all' national aggregates by summing across forces.
      const allCrime = byMonth(crimeCat, ['month', 'category'], ['count']);
      const allOutcome = byMonth(outcomes, ['month', 'outcome_category'], ['count']);
      const allSsForce = byMonth(ssForce, ['month'], ['total', 'find_count', 'find_known']);
      const allSsDim = byMonth(ssDim, ['month', 'dimension', 'value'], ['count', 'find_count']);

      let n = 0;
      n += await upsert(sb, 'crime_force_month', [...crimeCat, ...allCrime], 'force_id,month,category');
      n += await upsert(sb, 'outcome_force_month', [...outcomes, ...allOutcome], 'force_id,month,outcome_category');
      n += await upsert(sb, 'ss_force_month', [...ssForce, ...allSsForce], 'force_id,month');
      n += await upsert(sb, 'ss_dim', [...ssDim, ...allSsDim], 'force_id,month,dimension,value');
      n += await upsert(sb, 'crime_lsoa_month', [...lsoaMap.values()], 'lsoa_code,month');
      total += n;
      console.log(`  ${month}: ${monthEntries.length} files → ${n} rollup rows (${DRY ? 'dry-run' : 'upserted'}).`);

      // Per-month provenance so phased progress is visible in ingest_runs.
      if (sb) await sb.from('ingest_runs').insert({ kind: 'bulk', dataset_month: month, rows_upserted: n, ok: true, notes: `${monthEntries.length} files`, started_at: monthStart, finished_at: new Date().toISOString() }).then(() => {}, () => {});
    }

    runNotes.push(`bulk: ${wanted.size} months, ${total} rollup rows`);
    console.log(`Bulk done: ${total} rollup rows across ${wanted.size} months (${DRY ? 'dry-run, not written' : 'upserted'}).`);
    return total;
  } finally {
    await archive.cleanup?.();
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
