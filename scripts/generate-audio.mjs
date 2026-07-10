// Narrated audio editions, generated at build time with OpenAI TTS.
//
// For every published article this script:
//   1. extracts a "podcast edit" narration script — title, standfirst and the
//      main body prose only, stripped of markdown/MDX syntax, code, tables,
//      footnote plumbing, image captions, pull quotes/blockquotes and the
//      trailing references/sources list;
//   2. hashes it, and looks for a cached MP3 in node_modules/.cache/tap-audio
//      (Netlify persists node_modules between builds, so an up-to-date
//      article is only ever synthesised ONCE — a rebuild costs nothing);
//   3. copies whatever's available to public/audio/<slug>.mp3 (gitignored;
//      shipped in dist) and records it in src/lib/audio-manifest.json, which
//      AudioEdition.astro reads to decide between the narrated player and the
//      on-device voice.
//
// THE BREAKER — no OpenAI call happens unless you explicitly say so
// -------------------------------------------------------------------------
// New narration (a brand-new article, or an existing one whose text changed
// since it was last recorded — a spelling fix, a rewritten paragraph) is
// NEVER synthesised automatically. Every normal build — content edits, news
// refreshes, unrelated code changes — just republishes whatever's already
// cached: unchanged articles keep their audio, an edited article keeps
// serving its last-recorded (now slightly stale) narration rather than
// silently spending money or dropping to the on-device voice.
//
// To approve a synthesis run: set AUDIO_ALLOW_SYNTHESIS=true (Netlify env
// vars, or locally in .env) for the build where you want it, then unset it
// (or set it back to false) afterwards so the NEXT build doesn't also
// synthesise. Every build prints how many articles are pending a refresh —
// check the build log if you're not sure whether anything needs approving.
//
// TIME-BUDGETED, CONCURRENT SYNTHESIS
// -------------------------------------------------------------------------
// A first-ever approved run has to narrate every article at once, and a
// sequential one-request-at-a-time loop over ~30 articles can outrun a
// platform build-time ceiling — the build gets killed mid-flight, nothing
// finishes, and whatever was already billed is lost. So an approved run:
//   - synthesises several articles concurrently (AUDIO_CONCURRENCY), and
//   - stops STARTING new work once AUDIO_TIME_BUDGET_MS has elapsed, then
//     finishes writing out whatever completed and returns control to the
//     rest of the build. Anything left over just stays "pending" — as
//     always, safe to publish now and pick up on the next approved run.
// A per-request timeout (AUDIO_REQUEST_TIMEOUT_MS) stops one hung call from
// tying up a whole concurrency slot for the entire budget.
//
// Configuration:
//   OPENAI_API_KEY        — required to synthesise at all.
//   AUDIO_ALLOW_SYNTHESIS — must be exactly 'true' to synthesise anything new
//                           this build. Unset/false = republish cache only.
//   AUDIO_TTS_MODEL       — default 'gpt-4o-mini-tts' (fall back to 'tts-1').
//   AUDIO_TTS_VOICE       — default 'fable' (the British-leaning OpenAI voice).
//   AUDIO_MAX_NEW         — cap on newly synthesised articles per approved
//                           run (default 50) — a count-based cost brake.
//   AUDIO_CONCURRENCY     — parallel synthesis workers (default 6).
//   AUDIO_TIME_BUDGET_MS  — wall-clock budget for starting new synthesis
//                           before yielding to the rest of the build
//                           (default 8 minutes).
//   AUDIO_REQUEST_TIMEOUT_MS — per HTTP request timeout (default 45s).
//
// The build NEVER fails because of this script: any error skips that article
// and the reader gets the on-device voice instead.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ARTICLES_DIR = join(ROOT, 'src/content/articles');
const CACHE_DIR = join(ROOT, 'node_modules/.cache/tap-audio');
const OUT_DIR = join(ROOT, 'public/audio');
const MANIFEST = join(ROOT, 'src/lib/audio-manifest.json');

const API_KEY = process.env.OPENAI_API_KEY;
const SYNTHESIS_APPROVED = process.env.AUDIO_ALLOW_SYNTHESIS === 'true';
const MODEL = process.env.AUDIO_TTS_MODEL || 'gpt-4o-mini-tts';
const FALLBACK_MODEL = 'tts-1';
const VOICE = process.env.AUDIO_TTS_VOICE || 'fable';
const MAX_NEW = Number(process.env.AUDIO_MAX_NEW || 50);
const CONCURRENCY = Math.max(1, Number(process.env.AUDIO_CONCURRENCY || 6));
const TIME_BUDGET_MS = Number(process.env.AUDIO_TIME_BUDGET_MS || 8 * 60 * 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.AUDIO_REQUEST_TIMEOUT_MS || 45_000);
const CHUNK_CHARS = 3500;

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: m[2] };
}

function toNarration(title, description, body) {
  let t = body;
  t = t.replace(/^#{1,6}\s*(?:references|sources(?: and further reading)?|further reading|bibliography)\s*$[\s\S]*/im, ''); // trailing citations — not part of the read article
  t = t.replace(/```[\s\S]*?```/g, ' ');                    // code fences
  t = t.replace(/^(import|export)\s.*$/gm, ' ');            // MDX plumbing
  t = t.replace(/<PullQuote\b[^>]*>[\s\S]*?<\/PullQuote>/gi, ' '); // pull quotes (restate prose already narrated)
  t = t.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, ' '); // photo captions/credits
  t = t.replace(/<[A-Za-z][^<>]*\/>/gs, ' ');               // self-closing components
  t = t.replace(/<\/?[A-Za-z][^<>]*>/g, ' ');               // tag lines (inner prose kept)
  t = t.replace(/^\s*\|.*\|\s*$/gm, ' ');                   // table rows
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');              // images, including captions in the alt text
  t = t.replace(/\[\^[^\]]+\]:\s?.*$/gm, ' ');              // footnote definitions
  t = t.replace(/\[\^[^\]]+\]/g, '');                       // footnote refs
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');            // links → text
  t = t.replace(/^#{1,6}\s*(.+)$/gm, (_, h) => `${h.replace(/[.:]\s*$/, '')}. `); // headings
  t = t.replace(/^>.*$/gm, ' ');                            // blockquotes & pulled-out quote boxes
  t = t.replace(/==([^=]+)==/g, '$1');                      // highlights
  t = t.replace(/[*_`]/g, '');                              // emphasis/code marks
  t = t.replace(/^\s*[-*+]\s+/gm, '');                      // list bullets
  t = t.replace(/^\s*\d+\.\s+/gm, '');                      // ordered bullets
  t = t.replace(/^-{3,}\s*$/gm, ' ');                       // hr
  t = t.replace(/\s+/g, ' ').trim();
  const head = `${title}. ${description ? description + ' ' : ''}`;
  return (head + t).trim();
}

function chunkText(text) {
  const sentences = text.match(/[^.!?]+[.!?]+[\s"']*|[^.!?]+$/g) ?? [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > CHUNK_CHARS && cur) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function synthesiseChunk(input, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, voice: VOICE, input, response_format: 'mp3' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`TTS ${res.status} (${model}): ${detail.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function synthesise(chunks) {
  const parts = [];
  let model = MODEL;
  for (const chunk of chunks) {
    try {
      parts.push(await synthesiseChunk(chunk, model));
    } catch (err) {
      // Unknown-model errors: retry the whole run on the stable fallback once.
      if (model !== FALLBACK_MODEL && /model|404/i.test(String(err))) {
        model = FALLBACK_MODEL;
        parts.push(await synthesiseChunk(chunk, model));
      } else {
        throw err;
      }
    }
  }
  return { buffer: Buffer.concat(parts), model };
}

/** Every cached MP3 for `slug` (any content hash, i.e. any past version of
 *  its text), newest first — so a changed article can keep serving its last
 *  recorded narration until a refresh is explicitly approved. */
function cachedVersionsBySlug(cacheFiles) {
  const bySlug = new Map();
  for (const f of cacheFiles) {
    const m = f.name.match(/^(.*)-[0-9a-f]{16}\.mp3$/);
    if (!m) continue;
    const list = bySlug.get(m[1]) ?? [];
    list.push({ file: f.name, mtimeMs: f.mtimeMs });
    bySlug.set(m[1], list);
  }
  for (const list of bySlug.values()) list.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return bySlug;
}

/** Bounded-concurrency worker pool: runs `worker` over `items` with at most
 *  `concurrency` in flight, stopping the START of new work once `deadline`
 *  (Date.now() ms) has passed — in-flight work still finishes, but nothing
 *  new begins, so the caller reliably gets control back near the budget. */
async function runPool(items, concurrency, deadline, worker) {
  let index = 0;
  let deadlineHit = false;
  async function lane() {
    while (index < items.length) {
      if (Date.now() >= deadline) {
        deadlineHit = true;
        return;
      }
      const item = items[index++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return { deadlineHit };
}

async function main() {
  const start = Date.now();
  const deadline = start + TIME_BUDGET_MS;
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const cacheEntries = await readdir(CACHE_DIR, { withFileTypes: true });
  const cacheStats = await Promise.all(
    cacheEntries
      .filter((e) => e.isFile() && e.name.endsWith('.mp3'))
      .map(async (e) => ({ name: e.name, mtimeMs: (await stat(join(CACHE_DIR, e.name))).mtimeMs }))
  );
  const versionsBySlug = cachedVersionsBySlug(cacheStats);

  const files = (await readdir(ARTICLES_DIR)).filter((f) => /\.(md|mdx)$/.test(f));

  // Phase 1 — classify every article (fast, sequential, no network): what it
  // needs, and what's available right now if nothing gets synthesised.
  const items = [];
  for (const file of files) {
    const slug = basename(file, extname(file));
    try {
      const src = await readFile(join(ARTICLES_DIR, file), 'utf8');
      const { data, body } = parseFrontmatter(src);
      if (String(data.draft) === 'true') continue;

      const narration = toNarration(data.title ?? slug, data.description ?? '', body);
      if (narration.length < 400) continue; // nothing worth narrating

      const hash = createHash('sha256').update(`${VOICE}|${narration}`).digest('hex').slice(0, 16);
      const currentCacheFile = join(CACHE_DIR, `${slug}-${hash}.mp3`);

      let exactMatch = false;
      try {
        await stat(currentCacheFile);
        exactMatch = true;
      } catch {}

      const prior = versionsBySlug.get(slug)?.[0] ?? null;
      items.push({ slug, narration, currentCacheFile, exactMatch, prior, model: MODEL, generated: false });
    } catch (err) {
      console.warn(`generate-audio: skipping ${slug} — ${err.message ?? err}`);
    }
  }

  // Phase 2 — synthesise approved, changed/new items concurrently, within
  // budget. Untouched if the breaker is off, or there's nothing to do.
  const needsSynthesis = items.filter((i) => !i.exactMatch);
  let deadlineHit = false;
  if (SYNTHESIS_APPROVED && API_KEY && needsSynthesis.length) {
    const queue = needsSynthesis.slice(0, MAX_NEW);
    if (needsSynthesis.length > MAX_NEW) {
      console.log(`generate-audio: AUDIO_MAX_NEW (${MAX_NEW}) caps this run to ${MAX_NEW} of ${needsSynthesis.length} pending`);
    }
    console.log(`generate-audio: synthesising up to ${queue.length} article(s), ${CONCURRENCY} at a time, within a ${Math.round(TIME_BUDGET_MS / 1000)}s budget`);
    const result = await runPool(queue, CONCURRENCY, deadline, async (item) => {
      try {
        console.log(`generate-audio: → ${item.slug} (${item.narration.length.toLocaleString()} chars)`);
        const { buffer, model } = await synthesise(chunkText(item.narration));
        await writeFile(item.currentCacheFile, buffer);
        item.generated = true;
        item.model = model;
      } catch (err) {
        console.warn(`generate-audio: synthesis failed for ${item.slug} — ${err.message ?? err}`);
      }
    });
    deadlineHit = result.deadlineHit;
  }

  // Phase 3 — publish whatever's available for each article.
  const manifest = {};
  let fresh = 0;
  let generated = 0;
  let stale = 0;
  let pendingNew = 0;
  let skipped = 0;
  const pending = [];

  for (const item of items) {
    try {
      let sourceFile = null;
      let isStale = false;

      if (item.exactMatch) {
        sourceFile = item.currentCacheFile;
        fresh++;
      } else if (item.generated) {
        sourceFile = item.currentCacheFile;
        generated++;
      } else if (item.prior) {
        sourceFile = join(CACHE_DIR, item.prior.file);
        isStale = true;
        stale++;
        pending.push({ slug: item.slug, reason: 'stale' });
      } else {
        pendingNew++;
        pending.push({ slug: item.slug, reason: 'new' });
        continue;
      }

      const outFile = join(OUT_DIR, `${item.slug}.mp3`);
      await copyFile(sourceFile, outFile);
      const { size } = await stat(outFile);
      manifest[item.slug] = {
        voice: VOICE,
        model: item.model,
        chars: item.narration.length,
        bytes: size,
        ...(isStale ? { stale: true } : {}),
      };
    } catch (err) {
      console.warn(`generate-audio: skipping ${item.slug} — ${err.message ?? err}`);
      skipped++;
    }
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log(
    `generate-audio: ${Object.keys(manifest).length} published ` +
      `(${fresh} up to date, ${generated} newly synthesised, ${stale} serving stale audio, ${pendingNew} never narrated, ${skipped} errored) ` +
      `in ${Math.round((Date.now() - start) / 1000)}s`
  );

  if (deadlineHit) {
    console.log(
      `generate-audio: ⏱ time budget (${Math.round(TIME_BUDGET_MS / 1000)}s) reached before all approved articles finished — ` +
        `the rest stay pending for the next approved run (nothing was cut off mid-file; this is a clean stop).`
    );
  }

  if (!API_KEY) {
    console.log('generate-audio: OPENAI_API_KEY not set — narration is cache-only.');
  } else if (!SYNTHESIS_APPROVED && pending.length) {
    console.log(
      `generate-audio: ⏸ THE BREAKER IS OFF — ${pending.length} article(s) have no up-to-date narration ` +
        `and were left as-is. Set AUDIO_ALLOW_SYNTHESIS=true and redeploy to approve a refresh, then unset ` +
        `it again afterwards so future edits don't auto-trigger synthesis:`
    );
    for (const p of pending.slice(0, 20)) {
      console.log(`    - ${p.slug} (${p.reason === 'new' ? 'never narrated — on-device voice for now' : 'text changed since last recording — serving prior audio'})`);
    }
    if (pending.length > 20) console.log(`    ...and ${pending.length - 20} more`);
  } else if (SYNTHESIS_APPROVED) {
    if (pending.length) {
      console.log(`generate-audio: ${pending.length} article(s) still pending — rerun with AUDIO_ALLOW_SYNTHESIS=true again to continue.`);
    } else {
      console.log(`generate-audio: all articles narrated. Remember to unset AUDIO_ALLOW_SYNTHESIS now so future edits don't auto-trigger synthesis.`);
    }
  }
}

main().catch((err) => {
  // Never fail the build over narration; the on-device voice covers the gap.
  console.warn(`generate-audio: giving up gracefully — ${err.message ?? err}`);
  // Guarantee the manifest exists even if main() threw before writing it —
  // AudioEdition.astro imports this file at build time.
  return writeFile(MANIFEST, '{}\n').catch(() => {});
});
