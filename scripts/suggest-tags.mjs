// Author tooling — NOT part of the deploy build.
//
//   npm run suggest-tags            # report only: prints suggested tags
//   npm run suggest-tags -- --write # append the missing tags to frontmatter
//
// It scans each article's body against the topics dictionary
// (src/content/topics/topics.json) and suggests the matching topic slugs that
// aren't already tagged. --write only ever *appends* (never removes or reorders
// other frontmatter) and is idempotent: run it twice and the second run is a
// no-op. Review the diff before committing.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readTopics, buildEntries } from '../src/lib/topic-matcher.mjs';

const CONTENT_DIR = 'src/content/articles';
const WRITE = process.argv.includes('--write');
const entries = buildEntries(readTopics());

function frontmatterBounds(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  return { fm: text.slice(3, end), bodyStart: end + 4 };
}

// Existing tags, in either inline ["a","b"] or block (- a / - b) form.
function readTags(fm) {
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
  if (inline) {
    return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const lines = fm.split('\n');
  const start = lines.findIndex((l) => /^tags:\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*(.+)$/);
    if (!m) break;
    out.push(m[1].trim().replace(/^["']|["']$/g, ''));
  }
  return out;
}

function hasTopic(tags, entry) {
  const lower = tags.map((t) => t.toLowerCase());
  const terms = [entry.slug, entry.label, ...entry.terms].map((t) => t.toLowerCase());
  return terms.some((t) => lower.includes(t));
}

// Append slugs to the tags field, handling inline and block forms.
function appendTags(text, fm, bodyStart, slugs) {
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
  if (inline) {
    const existing = inline[1].trim();
    const additions = slugs.map((s) => `"${s}"`).join(', ');
    const inner = existing ? `${existing}, ${additions}` : additions;
    const newFm = fm.replace(inline[0], `tags: [${inner}]`);
    return '---' + newFm + text.slice(3 + fm.length);
  }
  const lines = fm.split('\n');
  const start = lines.findIndex((l) => /^tags:\s*$/.test(l));
  if (start !== -1) {
    let last = start;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*-\s*(.+)$/.test(lines[i])) last = i;
      else break;
    }
    const indent = (lines[last].match(/^(\s*)-/) || [, '  '])[1];
    lines.splice(last + 1, 0, ...slugs.map((s) => `${indent}- ${s}`));
    return '---' + lines.join('\n') + text.slice(3 + fm.length);
  }
  return null; // no tags field — leave it to the author
}

let totalSuggested = 0;
let filesChanged = 0;

if (existsSync(CONTENT_DIR)) {
  for (const file of readdirSync(CONTENT_DIR)) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const path = join(CONTENT_DIR, file);
    const text = readFileSync(path, 'utf8');
    const b = frontmatterBounds(text);
    if (!b) continue;
    const body = text.slice(b.bodyStart);
    const tags = readTags(b.fm);

    const suggestions = entries
      .filter((e) => !hasTopic(tags, e) && e.regex.test(body))
      .map((e) => e.slug);

    if (suggestions.length === 0) continue;
    totalSuggested += suggestions.length;
    console.log(`\n${file}`);
    console.log(`  + ${suggestions.join(', ')}`);

    if (WRITE) {
      const updated = appendTags(text, b.fm, b.bodyStart, suggestions);
      if (updated) {
        writeFileSync(path, updated);
        filesChanged++;
      } else {
        console.log('  (no tags field found — add one in the editor first)');
      }
    }
  }
}

console.log(
  `\nsuggest-tags: ${totalSuggested} suggestion(s)` +
    (WRITE ? `, ${filesChanged} file(s) updated.` : '. Re-run with --write to apply.')
);
