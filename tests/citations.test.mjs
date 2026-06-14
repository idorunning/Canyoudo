// Unit tests for the evidence-answer citation validation. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCitations } from '../src/lib/citations.mjs';
import { costUsd, monthKey } from '../src/lib/ai-budget-core.mjs';

test('keeps in-range markers and collects them', () => {
  const { text, used } = sanitizeCitations('Patrol cuts burglary [1][3]. Effects fade [2].', 3);
  assert.equal(text, 'Patrol cuts burglary [1][3]. Effects fade [2].');
  assert.deepEqual(used, [1, 2, 3]);
});

test('strips out-of-range markers and tidies the gap', () => {
  const { text, used } = sanitizeCitations('Strong effect [1] [7]. Weak elsewhere [12].', 3);
  assert.equal(text, 'Strong effect [1]. Weak elsewhere.');
  assert.deepEqual(used, [1]);
});

test('zero and duplicate markers', () => {
  const { used } = sanitizeCitations('Claim [0][2][2][2]', 5);
  assert.deepEqual(used, [2]);
});

test('no valid citations left → empty used (caller rejects)', () => {
  const { used } = sanitizeCitations('A confident claim with no support [9].', 3);
  assert.deepEqual(used, []);
});

test('handles empty / nullish text', () => {
  assert.deepEqual(sanitizeCitations('', 5), { text: '', used: [] });
  assert.deepEqual(sanitizeCitations(null, 5), { text: '', used: [] });
});

// The briefing mode reuses sanitizeCitations against a curated set of up to 15
// studies; these guard that the same discipline holds across the larger range
// and the four-section markdown structure survives sanitisation.
test('briefing: keeps markers across a 15-study set, strips beyond it', () => {
  const { text, used } = sanitizeCitations(
    'Patrol helps [3][15]. Repeat victimisation matters [9]. Out of range [16][20].',
    15
  );
  assert.equal(text, 'Patrol helps [3][15]. Repeat victimisation matters [9]. Out of range.');
  assert.deepEqual(used, [3, 9, 15]);
});

test('briefing: a synthesis with no in-range citation is rejected (empty used)', () => {
  const { used } = sanitizeCitations(
    '### What the evidence says\n\nA confident claim with no support [99].',
    12
  );
  assert.deepEqual(used, []);
});

test('briefing: ### section headings survive sanitisation', () => {
  const md = [
    '### The problem',
    'Framing only, may be uncited.',
    '### What the evidence says',
    'Hot spots cut crime [1][4].',
    '### Strength and gaps in the evidence',
    'Few UK trials [2].',
    '### Next steps and ideas to try',
    'Pilot a dosage trial [4]; measure displacement.',
  ].join('\n\n');
  const { text, used } = sanitizeCitations(md, 4);
  for (const heading of [
    '### The problem',
    '### What the evidence says',
    '### Strength and gaps in the evidence',
    '### Next steps and ideas to try',
  ]) {
    assert.ok(text.includes(heading), `keeps heading ${heading}`);
  }
  assert.deepEqual(used, [1, 2, 4]);
});

test('costUsd uses per-model prices and tolerates unknown models', () => {
  // Sonnet: $3/MTok in, $15/MTok out.
  assert.equal(costUsd('claude-sonnet-4-6', 1_000_000, 0), 3);
  assert.equal(costUsd('claude-sonnet-4-6', 0, 1_000_000), 15);
  // Haiku is cheaper than Sonnet for the same usage.
  assert.ok(costUsd('claude-haiku-4-5', 4000, 700) < costUsd('claude-sonnet-4-6', 4000, 700));
  // Unknown model falls back to Sonnet pricing rather than zero.
  assert.equal(costUsd('claude-next-99', 1_000_000, 0), 3);
  // Garbage counts never produce NaN.
  assert.equal(costUsd('claude-sonnet-4-6', undefined, null), 0);
});

test('monthKey buckets by calendar month', () => {
  assert.equal(monthKey(new Date('2026-06-11T21:00:00Z')), '2026-06');
  assert.equal(monthKey(new Date('2026-12-31T23:59:59Z')), '2026-12');
});
