import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  forceId, TERRITORIAL_FORCES, broadGroupOf, ladToPfa, aggregateToPfa, toCsv, assertPfaCoverage,
} from '../scripts/lib/census-lib.mjs';

test('the five broad census labels map 1:1 onto the ss_dim ethnicity vocabulary', () => {
  assert.equal(broadGroupOf('Asian, Asian British or Asian Welsh'), 'Asian');
  assert.equal(broadGroupOf('Black, Black British, Black Welsh, Caribbean or African'), 'Black');
  assert.equal(broadGroupOf('Mixed or Multiple ethnic groups'), 'Mixed');
  assert.equal(broadGroupOf('White'), 'White');
  assert.equal(broadGroupOf('Other ethnic group'), 'Other');
});

test('detailed census categories are rejected, never mis-folded', () => {
  // "Mixed: White and Black Caribbean" contains three group words — folding it
  // with regexes would double-count; only the five broad codes are allowed in.
  assert.throws(() => broadGroupOf('Mixed or Multiple ethnic groups: White and Black Caribbean'));
  assert.throws(() => broadGroupOf('White: Gypsy or Irish Traveller'));
  assert.throws(() => broadGroupOf('Total: All usual residents'));
});

test('forceId slug edges match seed-population.mjs', () => {
  assert.equal(forceId('Metropolitan Police'), 'metropolitan');
  assert.equal(forceId('London, City of'), 'city-of-london');
  assert.equal(forceId('Devon & Cornwall'), 'devon-and-cornwall');
  assert.equal(forceId('Dyfed-Powys'), 'dyfed-powys');
});

test('ladToPfa dedupes CSP splits but rejects a LAD under two PFAs', () => {
  const ok = ladToPfa([
    { ladCode: 'E07000001', pfaCode: 'E23000001', pfaName: 'A' },
    { ladCode: 'E07000001', pfaCode: 'E23000001', pfaName: 'A' }, // second CSP, same PFA
  ]);
  assert.equal(ok.size, 1);
  assert.throws(() => ladToPfa([
    { ladCode: 'E07000001', pfaCode: 'E23000001', pfaName: 'A' },
    { ladCode: 'E07000001', pfaCode: 'E23000002', pfaName: 'B' },
  ]));
});

test('aggregateToPfa sums by PFA×group and reports orphans', () => {
  const lookup = ladToPfa([
    { ladCode: 'L1', pfaCode: 'P1', pfaName: 'Kent' },
    { ladCode: 'L2', pfaCode: 'P1', pfaName: 'Kent' },
  ]);
  const { sums, orphans } = aggregateToPfa([
    { ladCode: 'L1', group: 'White', value: 10 },
    { ladCode: 'L2', group: 'White', value: 5 },
    { ladCode: 'L1', group: 'Black', value: 2 },
    { ladCode: 'LX', group: 'White', value: 99 },
  ], lookup);
  assert.equal(sums.get('Kent|White'), 15);
  assert.equal(sums.get('Kent|Black'), 2);
  assert.deepEqual(orphans, ['LX']);
});

test('assertPfaCoverage demands exactly the 43 territorial forces', () => {
  assert.doesNotThrow(() => assertPfaCoverage(TERRITORIAL_FORCES.map((f) => f.replace(/-/g, ' '))));
  assert.throws(() => assertPfaCoverage(['Kent']));
});

test('toCsv quotes only when needed', () => {
  assert.equal(toCsv(['a', 'b'], [['x,y', 1]]), 'a,b\n"x,y",1\n');
});

// --- committed seed integrity (real numbers only, full coverage) -----------------

// Quote-aware line split ("London, City of" carries a comma).
function splitLine(l) {
  const out = [];
  let field = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

test('pfa-ethnicity-census2021.csv: 43 forces × 5 groups, plausible total', () => {
  const rows = readFileSync('data/seeds/pfa-ethnicity-census2021.csv', 'utf8').trim().split('\n').slice(1)
    .map(splitLine);
  assert.equal(rows.length, 215, '43 forces × 5 groups');
  const forces = new Set(rows.map((r) => forceId(r[0])));
  assert.equal(forces.size, 43);
  for (const f of TERRITORIAL_FORCES) assert.ok(forces.has(f), f);
  const total = rows.reduce((s, r) => s + Number(r[2]), 0);
  assert.ok(total > 58_000_000 && total < 61_500_000, `census total ${total}`);
  assert.ok(rows.every((r) => Number(r[2]) > 0), 'no zero cells');
});

test('pfa-population CSV: 43 forces, plausible total, no zeros', () => {
  const rows = readFileSync('data/seeds/pfa-population-mid-2024.csv', 'utf8').trim().split('\n').slice(1)
    .map(splitLine);
  assert.equal(new Set(rows.map((r) => forceId(r[0]))).size, 43);
  const total = rows.reduce((s, r) => s + Number(r[1]), 0);
  assert.ok(total > 59_000_000 && total < 64_000_000, `mid-year total ${total}`);
  // City of London (~15k residents) is genuinely tiny; everyone else is six figures.
  assert.ok(rows.every((r) => Number(r[1]) > 8_000), 'every force has a real population');
  assert.ok(rows.filter((r) => forceId(r[0]) !== 'city-of-london').every((r) => Number(r[1]) > 100_000));
});
