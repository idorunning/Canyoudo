// Guards against two content bugs fixed this cycle that the Astro build does not
// reliably catch on its own. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content/articles';
const files = readdirSync(DIR).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));

// Strip frontmatter so we only scan the body.
function body(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? text.slice(m[0].length) : text;
}

test('there are article files to check', () => {
  assert.ok(files.length > 10, `expected many articles, found ${files.length}`);
});

test('no .mdx file uses <url> autolinks (MDX parses < as JSX)', () => {
  const offenders = [];
  for (const f of files.filter((f) => f.endsWith('.mdx'))) {
    const b = body(readFileSync(join(DIR, f), 'utf8'));
    if (/<https?:\/\//.test(b)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `MDX files with <url> autolinks: ${offenders.join(', ')}`);
});
