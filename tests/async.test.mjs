import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pMap } from '../scripts/lib/async.mjs';

test('pMap returns results in input order', async () => {
  const out = await pMap([1, 2, 3, 4, 5], async (n) => {
    await new Promise((r) => setTimeout(r, (6 - n) * 5)); // later items resolve first
    return n * 10;
  }, 3);
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
});

test('pMap never exceeds the concurrency limit', async () => {
  let inFlight = 0;
  let peak = 0;
  await pMap(Array.from({ length: 20 }, (_, i) => i), async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
  }, 4);
  assert.equal(peak, 4);
});

test('pMap handles an empty list', async () => {
  assert.deepEqual(await pMap([], async (x) => x, 4), []);
});

test('pMap passes the index to fn', async () => {
  const out = await pMap(['a', 'b', 'c'], async (v, i) => `${i}:${v}`, 2);
  assert.deepEqual(out, ['0:a', '1:b', '2:c']);
});

test('pMap propagates errors', async () => {
  await assert.rejects(
    () => pMap([1, 2, 3], async (n) => { if (n === 2) throw new Error('boom'); return n; }, 2),
    /boom/,
  );
});
