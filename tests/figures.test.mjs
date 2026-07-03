import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNumbers, allowedFigures, verifyFigures } from '../src/lib/figures.mjs';

const digest = {
  scope: 'Kent Police',
  latestMonth: '2026-04',
  totalCrimes12mo: 123456,
  topCategories: [
    { category: 'Violence And Sexual Offences', count12mo: 41200, previous12mo: 39800, changePct: 3.5 },
    { category: 'Shoplifting', count12mo: 15310, previous12mo: 12984, changePct: 17.9 },
  ],
  outcomes12mo: { total: 120000, chargedShare: 9.4, noSuspectShare: 41.2 },
};

test('collectNumbers walks nested objects and arrays', () => {
  const nums = collectNumbers(digest);
  assert.ok(nums.has(123456));
  assert.ok(nums.has(17.9));
  assert.ok(nums.has(41.2));
});

test('digest figures and reasonable roundings pass', () => {
  const text =
    'Kent recorded 123,456 crimes in the year to April — about 123,000, up on the previous 12 months. ' +
    'Shoplifting rose 17.9% (roughly 18%), from 12,984 to 15,310. The charge rate sits at 9.4%, ' +
    'while 41% of cases closed with no suspect identified.';
  const { unmatched } = verifyFigures(text, digest);
  assert.deepEqual(unmatched, []);
});

test('a fabricated headline figure is flagged', () => {
  const { unmatched } = verifyFigures('Burglary fell to 7,777 offences this year.', digest);
  assert.deepEqual(unmatched, ['7,777']);
});

test('small counts, years and ISO months are not treated as figures', () => {
  const { checked, unmatched } = verifyFigures(
    'Across three of the last 12 months of 2025, and since 2024-03, five categories moved.',
    digest
  );
  assert.equal(checked, 0);
  assert.deepEqual(unmatched, []);
});

test('two-significant-figure roundings of large counts pass', () => {
  const allowed = allowedFigures(digest);
  assert.ok(allowed.has(120000)); // 123456 → 2sf
  assert.ok(allowed.has(15000)); // 15310 → 2sf
  const { unmatched } = verifyFigures('That is roughly 120,000 offences.', digest);
  assert.deepEqual(unmatched, []);
});
