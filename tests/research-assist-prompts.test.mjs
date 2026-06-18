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

test('prompt version bumped to v6 (invalidates the assist cache)', () => {
  assert.match(src, /ASSIST_PROMPT_VERSION\s*=\s*'v6'/);
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

test('briefing depth scale exposes three levels with prompts + budgets', () => {
  assert.match(src, /export type BriefingDepth = 'low' \| 'mid' \| 'high'/);
  assert.match(src, /export const BRIEFING_LOW_SYSTEM/);
  assert.match(src, /export const BRIEFING_MID_SYSTEM/);
  assert.match(src, /export const BRIEFING_HIGH_SYSTEM/);
  assert.match(src, /export const BRIEFING_SYSTEMS/);
  assert.match(src, /export const BRIEFING_MAX_TOKENS/);
});

test('the full-review (high) depth names the four exact ### headings', () => {
  // The renderer parses on these headings — keep them in lockstep.
  const high = src.slice(src.indexOf('BRIEFING_HIGH_SYSTEM'));
  for (const heading of [
    'The problem',
    'What the evidence says',
    'Strength and gaps in the evidence',
    'Evidence-based approaches to try',
  ]) {
    assert.ok(high.includes(`"${heading}"`), `high depth names the "${heading}" section`);
  }
});

test('the overview (mid) depth is a two-section summary', () => {
  const mid = src.slice(src.indexOf('BRIEFING_MID_SYSTEM'), src.indexOf('BRIEFING_HIGH_SYSTEM'));
  assert.ok(mid.includes('"What the evidence says"'), 'mid names the evidence section');
  assert.ok(mid.includes('"Strength and gaps"'), 'mid names the strength/gaps section');
  assert.match(mid, /exactly two sections/i);
});

test('the quick-scan (low) depth is short and heading-free', () => {
  const low = src.slice(src.indexOf('BRIEFING_LOW_SYSTEM'), src.indexOf('BRIEFING_MID_SYSTEM'));
  assert.match(low, /NO headings/i);
  assert.match(low, /QUICK SCAN/i);
});

test('every briefing depth keeps citation discipline and confidence levels', () => {
  assert.match(src, /ONLY the numbered studies/i);
  assert.match(src, /untrusted data/i);
  for (const level of ['strong', 'mixed', 'thin']) {
    assert.ok(src.includes(`"${level}"`), `confidence level ${level}`);
  }
});
