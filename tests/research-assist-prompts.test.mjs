// Unit tests guarding the assist prompts' contract — the function and the
// client renderer both depend on these exact shapes/headings. The prompts live
// in a .ts file, so we assert against its source text (Node 20 can't import
// .ts without a loader). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../src/lib/research-assist-prompts.ts', import.meta.url)),
  'utf8'
);

test('prompt version bumped to v5 (invalidates the assist cache)', () => {
  assert.match(src, /ASSIST_PROMPT_VERSION\s*=\s*'v5'/);
});

test('PLAN_SYSTEM demands JSON-only with framing + angles', () => {
  assert.match(src, /export const PLAN_SYSTEM/);
  assert.match(src, /ONLY a JSON object/);
  assert.match(src, /"framing"/);
  assert.match(src, /"angles"/);
  assert.match(src, /exactly 3/i);
  // Treats the problem as data, not instructions (prompt-injection guard).
  assert.match(src, /data, not instructions/i);
});

test('BRIEFING_SYSTEM demands JSON-only and the four exact ### headings', () => {
  assert.match(src, /export const BRIEFING_SYSTEM/);
  // The renderer parses on these headings — keep them in lockstep.
  for (const heading of [
    'The problem',
    'What the evidence says',
    'Strength and gaps in the evidence',
    'Next steps and ideas to try',
  ]) {
    assert.ok(src.includes(`"${heading}"`), `BRIEFING_SYSTEM names the "${heading}" section`);
  }
});

test('BRIEFING_SYSTEM enforces citation discipline and confidence levels', () => {
  assert.match(src, /ONLY the numbered studies/i);
  assert.match(src, /untrusted data/i);
  for (const level of ['strong', 'mixed', 'thin']) {
    assert.ok(src.includes(`"${level}"`), `confidence level ${level}`);
  }
});
