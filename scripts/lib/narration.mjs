// Shared narration-extraction and hashing for the audio pipeline.
//
// generate-audio.mjs (the build-time synthesiser) and narrate.mjs (the
// on-demand author tool) BOTH import these. That is the whole point: the
// cache key is sha256(voice | narrationText), so if the two scripts extracted
// narration even slightly differently they would compute different hashes,
// disagree about what is already cached, and either re-synthesise unchanged
// articles (wasting money) or miss changed ones. Keeping the extraction in one
// place makes that class of drift impossible. Pure and dependency-free so it
// can be unit-tested (tests/narration.test.mjs).

import { createHash } from 'node:crypto';

// An article whose narration is shorter than this is treated as "nothing worth
// narrating" (a stub, a redirect, a data page) and skipped by both scripts.
export const MIN_NARRATION_CHARS = 400;

// The default OpenAI voice, mirrored from generate-audio.mjs so a status run
// with no env override classifies against the same voice the build will use.
export const DEFAULT_VOICE = 'fable';

export function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: m[2] };
}

// Turn an article body into the "podcast edit" narration text: title +
// standfirst + main body prose, stripped of markdown/MDX syntax, code, tables,
// footnote plumbing, image captions, pull quotes/blockquotes and the trailing
// references list. Any change here changes every article's hash, so both
// scripts pick it up together and a refresh is offered for all of them.
export function toNarration(title, description, body) {
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

// Split narration into ≤ maxChars chunks on sentence boundaries, so a long
// article stays under the TTS per-request input limit.
export function chunkText(text, maxChars = 3500) {
  const sentences = text.match(/[^.!?]+[.!?]+[\s"']*|[^.!?]+$/g) ?? [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > maxChars && cur) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

// The cache key: the first 16 hex chars of sha256(voice | narration). Filenames
// are `<slug>-<hash>.mp3`, so a changed voice OR changed text yields a new file
// and the old one lingers as the "prior" recording until a refresh is approved.
export function narrationHash(voice, narration) {
  return createHash('sha256').update(`${voice}|${narration}`).digest('hex').slice(0, 16);
}
