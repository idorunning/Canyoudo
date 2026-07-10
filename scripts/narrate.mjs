// Author tooling — NOT part of the deploy build.
//
// On-demand narration: see which published articles have no up-to-date audio,
// and (with --sync) regenerate just those, without the Netlify env-var dance.
//
// WHY THIS EXISTS
// -------------------------------------------------------------------------
// The build-time script (generate-audio.mjs) only ever synthesises when
// AUDIO_ALLOW_SYNTHESIS=true. Refreshing narration after an edit therefore
// normally means: set that var in Netlify, redeploy, then REMEMBER to unset it
// (or the next routine build silently bills more synthesis). This tool removes
// that friction:
//
//   npm run narrate            → status only. Lists which articles are
//                                up to date / serving stale audio (text changed
//                                since they were recorded) / never narrated.
//                                No API key needed, no cost, changes nothing.
//
//   npm run narrate -- --sync  → regenerate the pending ones now. Runs the
//                                real build-time synthesiser with the breaker
//                                flipped ON *only for that child process*, so
//                                the approval can never leak into a later build.
//                                Requires OPENAI_API_KEY and installed deps.
//
// Staleness is read from the same hash-named cache the build uses
// (node_modules/.cache/tap-audio/<slug>-<hash>.mp3), via the shared narration
// lib — so this tool and the build always agree on what needs doing.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { spawn } from 'node:child_process';
import {
  parseFrontmatter,
  toNarration,
  narrationHash,
  MIN_NARRATION_CHARS,
  DEFAULT_VOICE,
} from './lib/narration.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ARTICLES_DIR = join(ROOT, 'src/content/articles');
const CACHE_DIR = join(ROOT, 'node_modules/.cache/tap-audio');
const GENERATE_AUDIO = join(ROOT, 'scripts/generate-audio.mjs');

const VOICE = process.env.AUDIO_TTS_VOICE || DEFAULT_VOICE;

const args = new Set(process.argv.slice(2));
const SYNC = args.has('--sync') || args.has('--write');
const JSON_OUT = args.has('--json');
const HELP = args.has('--help') || args.has('-h');

if (HELP) {
  console.log(`Usage: npm run narrate [-- --sync] [--json]

  (no flags)   Report which published articles need narration. Read-only.
  --sync       Regenerate the pending articles now (needs OPENAI_API_KEY).
  --json       Machine-readable status (implies read-only).

Voice is read from AUDIO_TTS_VOICE (default "${DEFAULT_VOICE}"); it must match the
build's voice or every article will look stale. See scripts/generate-audio.mjs
for the AUDIO_* synthesis knobs, which --sync passes straight through.`);
  process.exit(0);
}

// Map each slug to the set of content hashes already cached for it (any past
// version of its text). Missing cache dir → no audio yet anywhere.
async function cachedHashesBySlug() {
  const bySlug = new Map();
  let entries;
  try {
    entries = await readdir(CACHE_DIR);
  } catch {
    return { bySlug, cachePresent: false };
  }
  for (const name of entries) {
    const m = name.match(/^(.*)-([0-9a-f]{16})\.mp3$/);
    if (!m) continue;
    const set = bySlug.get(m[1]) ?? new Set();
    set.add(m[2]);
    bySlug.set(m[1], set);
  }
  return { bySlug, cachePresent: true };
}

async function classify() {
  const { bySlug, cachePresent } = await cachedHashesBySlug();
  const files = (await readdir(ARTICLES_DIR)).filter((f) => /\.(md|mdx)$/.test(f));
  const rows = [];
  for (const file of files.sort()) {
    const slug = basename(file, extname(file));
    let src;
    try {
      src = await readFile(join(ARTICLES_DIR, file), 'utf8');
    } catch {
      continue;
    }
    const { data, body } = parseFrontmatter(src);
    if (String(data.draft) === 'true') continue; // drafts aren't published, aren't narrated
    const narration = toNarration(data.title ?? slug, data.description ?? '', body);
    if (narration.length < MIN_NARRATION_CHARS) continue; // nothing worth narrating
    const hash = narrationHash(VOICE, narration);
    const cached = bySlug.get(slug);
    const status = cached?.has(hash) ? 'up-to-date' : cached?.size ? 'stale' : 'never';
    rows.push({ slug, status, chars: narration.length });
  }
  return { rows, cachePresent };
}

async function runSync(pending) {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'narrate --sync: OPENAI_API_KEY is not set, so nothing can be synthesised.\n' +
        '  Set it in your environment (see .env.example) and try again, or run without\n' +
        '  --sync for a read-only status.'
    );
    process.exit(1);
  }
  console.log(`narrate: regenerating ${pending.length} article(s) via generate-audio.mjs (breaker ON for this run only)…\n`);
  // Reuse the real, battle-tested synthesiser (time budget, concurrency, model
  // fallback, graceful failure). AUDIO_ALLOW_SYNTHESIS is set for THIS child
  // only — it never touches the caller's shell or any future build.
  const child = spawn(process.execPath, [GENERATE_AUDIO], {
    stdio: 'inherit',
    env: { ...process.env, AUDIO_ALLOW_SYNTHESIS: 'true' },
  });
  await new Promise((resolve) => child.on('exit', resolve)).then((code) => {
    if (code) process.exit(code);
  });
}

async function main() {
  const { rows, cachePresent } = await classify();
  const pending = rows.filter((r) => r.status !== 'up-to-date');

  if (JSON_OUT) {
    console.log(JSON.stringify({ voice: VOICE, cachePresent, articles: rows }, null, 2));
    return;
  }

  const counts = { 'up-to-date': 0, stale: 0, never: 0 };
  for (const r of rows) counts[r.status]++;

  if (!cachePresent) {
    console.log(
      `narrate: no narration cache found at node_modules/.cache/tap-audio.\n` +
        `  Every article below shows as "never" because this environment has no\n` +
        `  cached audio (a fresh clone, or deps not yet built). Run in your dev or\n` +
        `  deploy environment for a true staleness picture.\n`
    );
  }

  console.log(`Narration status — voice "${VOICE}", ${rows.length} published article(s):\n`);
  for (const r of pending) {
    const label = r.status === 'stale' ? 'STALE  (text changed since recording)' : 'NEVER  (no audio yet)';
    console.log(`  ${label}  ${r.slug}`);
  }
  if (!pending.length) {
    console.log('  ✓ every published article has up-to-date narration.\n');
  } else {
    console.log(
      `\n  ${counts['up-to-date']} up to date · ${counts.stale} stale · ${counts.never} never narrated` +
        `  (${pending.length} pending)\n`
    );
  }

  if (SYNC) {
    if (!pending.length) {
      console.log('narrate --sync: nothing to do.');
      return;
    }
    await runSync(pending);
  } else if (pending.length) {
    console.log('Run  npm run narrate -- --sync  to regenerate the pending article(s) (needs OPENAI_API_KEY).');
  }
}

main().catch((err) => {
  console.error(`narrate: ${err?.message ?? err}`);
  process.exit(1);
});
