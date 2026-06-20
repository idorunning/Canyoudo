// Guards against a stray empty ATX heading (e.g. a lone "### " with no text),
// the kind that slipped into the burnout article. The Astro build does not flag
// these. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content/articles';
const files = readdirSync(DIR).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));

function body(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? text.slice(m[0].length) : text;
}

test('no article has an empty ATX heading', () => {
  const offenders = [];
  for (const f of files) {
    const b = body(readFileSync(join(DIR, f), 'utf8'));
    b.split('\n').forEach((line, i) => {
      if (/^#{1,6}[ \t]*$/.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `empty headings found: ${offenders.join(', ')}`);
});
