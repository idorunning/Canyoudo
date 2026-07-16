import test from 'node:test';
import assert from 'node:assert/strict';
import { rollupDim, latestMonthOf } from '../src/lib/ss-rollup.mjs';

// Regression pin for the "dozens of White 2% rows" bug: ss_dim stores one row
// per month per value, and the police-db ss-dim/disproportionality views must
// collapse those to one row per value over a 12-month window before any share
// is computed.

// 14 months × 3 ethnicities, White dominant every month — the exact shape that
// fanned out on /data/disproportionality.
const months = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(Date.UTC(2025, 2 + i, 1));
  months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
}
const fixture = months.flatMap((month) => [
  { month, value: 'White', count: 100, find_count: 20 },
  { month, value: 'Black', count: 40, find_count: 8 },
  { month, value: 'Asian', count: 20, find_count: 4 },
]);

test('rollupDim collapses monthly rows to one per value over the last 12 months', () => {
  const rolled = rollupDim(fixture);
  assert.equal(rolled.values.length, 3, 'one row per ethnicity, never one per month');
  const white = rolled.values[0];
  assert.equal(white.value, 'White', 'sorted by count descending');
  assert.equal(white.count, 100 * 12, 'summed over exactly the last 12 months, not all 14');
  assert.equal(white.find_count, 20 * 12);
  assert.deepEqual(rolled.window, { from: months[2], to: months[13], months: 12 });
  assert.equal(rolled.latestMonth, months[13]);
});

test('shares computed from the rollup are window-consistent (the 2% symptom is gone)', () => {
  const rolled = rollupDim(fixture);
  const total = rolled.values.reduce((s, v) => s + v.count, 0);
  const whiteShare = rolled.values[0].count / total;
  assert.ok(Math.abs(whiteShare - 100 / 160) < 1e-9, 'White = 62.5%, not ~2% per-month slivers');
  assert.ok(Math.abs(rolled.values.reduce((s, v) => s + v.count / total, 0) - 1) < 1e-9, 'shares sum to 1');
});

test('single-month input (month filter upstream) is a plain per-value sum', () => {
  const one = fixture.filter((r) => r.month === months[13]);
  const rolled = rollupDim(one);
  assert.equal(rolled.values.length, 3);
  assert.equal(rolled.values[0].count, 100);
  assert.equal(rolled.window?.to, months[13]);
});

test('empty and null-safety', () => {
  assert.deepEqual(rollupDim([]), { latestMonth: null, window: null, values: [] });
  assert.equal(latestMonthOf([]), null);
  assert.equal(latestMonthOf(fixture), months[13]);
  const noFind = rollupDim([{ month: '2026-01', value: 'X', count: 5 }]);
  assert.equal(noFind.values[0].find_count, 0, 'missing find_count treated as 0');
});

test('window can be customised', () => {
  const rolled = rollupDim(fixture, { windowMonths: 3 });
  assert.equal(rolled.values[0].count, 300);
  assert.equal(rolled.window?.months, 3);
});
