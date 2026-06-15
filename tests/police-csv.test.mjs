import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  parseArchivePath,
  slug,
  rollupStreetByCategory,
  rollupStreetByLsoa,
  rollupOutcomes,
  rollupStops,
  mergeCounts,
} from '../scripts/lib/police-csv.mjs';

test('parseCsv handles quoted fields, embedded commas and escaped quotes', () => {
  const text =
    'Crime ID,Month,Location,Crime type\n' +
    'abc,2024-01,"On or near Shopping Area, High Street",Anti-social behaviour\n' +
    'def,2024-01,"He said ""hi""",Other theft\n';
  const rows = parseCsv(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Location'], 'On or near Shopping Area, High Street');
  assert.equal(rows[0]['Crime type'], 'Anti-social behaviour');
  assert.equal(rows[1]['Location'], 'He said "hi"');
});

test('parseCsv tolerates CRLF, a BOM and no trailing newline', () => {
  const text = '﻿a,b\r\n1,2\r\n3,4';
  const rows = parseCsv(text);
  assert.deepEqual(rows, [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('parseArchivePath pulls month, force and kind from the file path', () => {
  assert.deepEqual(parseArchivePath('2024-01/2024-01-avon-and-somerset-street.csv'), {
    month: '2024-01',
    force: 'avon-and-somerset',
    kind: 'street',
  });
  assert.deepEqual(parseArchivePath('2024-01/2024-01-metropolitan-stop-and-search.csv'), {
    month: '2024-01',
    force: 'metropolitan',
    kind: 'stop-and-search',
  });
  assert.equal(parseArchivePath('readme.txt'), null);
});

test('slug matches the API crime-category ids', () => {
  assert.equal(slug('Anti-social behaviour'), 'anti-social-behaviour');
  assert.equal(slug('Violence and sexual offences'), 'violence-and-sexual-offences');
});

test('rollupStreetByCategory counts by slugified crime type', () => {
  const rows = [
    { 'Crime type': 'Burglary', 'LSOA code': 'E1', 'LSOA name': 'Area 1' },
    { 'Crime type': 'Burglary', 'LSOA code': 'E1', 'LSOA name': 'Area 1' },
    { 'Crime type': 'Other theft', 'LSOA code': 'E2', 'LSOA name': 'Area 2' },
  ];
  const cats = rollupStreetByCategory(rows).sort((a, b) => a.category.localeCompare(b.category));
  assert.deepEqual(cats, [
    { category: 'burglary', count: 2 },
    { category: 'other-theft', count: 1 },
  ]);
});

test('rollupStreetByLsoa totals all-crime per LSOA and keeps the name', () => {
  const rows = [
    { 'Crime type': 'Burglary', 'LSOA code': 'E1', 'LSOA name': 'Area 1' },
    { 'Crime type': 'Burglary', 'LSOA code': 'E1', 'LSOA name': 'Area 1' },
    { 'Crime type': 'Other theft', 'LSOA code': 'E2', 'LSOA name': 'Area 2' },
    { 'Crime type': 'Drugs', 'LSOA code': '', 'LSOA name': '' }, // no location → skipped
  ];
  const byLsoa = rollupStreetByLsoa(rows).sort((a, b) => a.lsoa_code.localeCompare(b.lsoa_code));
  assert.deepEqual(byLsoa, [
    { lsoa_code: 'E1', lsoa_name: 'Area 1', count: 2 },
    { lsoa_code: 'E2', lsoa_name: 'Area 2', count: 1 },
  ]);
});

test('rollupOutcomes buckets blanks as Not stated', () => {
  const rows = [
    { 'Outcome type': 'Suspect charged' },
    { 'Outcome type': 'Suspect charged' },
    { 'Outcome type': 'Investigation complete; no suspect identified' },
    { 'Outcome type': '' },
  ];
  const out = rollupOutcomes(rows).sort((a, b) => b.count - a.count);
  assert.deepEqual(out[0], { outcome_category: 'Suspect charged', count: 2 });
  assert.ok(out.some((o) => o.outcome_category === 'Not stated' && o.count === 1));
});

test('rollupStops computes totals, find rate and dimension breakdowns', () => {
  const rows = [
    {
      'Officer-defined ethnicity': 'White',
      'Self-defined ethnicity': 'White - English',
      'Object of search': 'Controlled drugs',
      Legislation: 'Misuse of Drugs Act 1971 (section 23)',
      'Age range': '18-24',
      Gender: 'Male',
      Outcome: 'A no further action disposal',
      'Outcome linked to object of search': 'false',
    },
    {
      'Officer-defined ethnicity': 'Black',
      'Self-defined ethnicity': 'Black - African',
      'Object of search': 'Controlled drugs',
      Legislation: 'Misuse of Drugs Act 1971 (section 23)',
      'Age range': '18-24',
      Gender: 'Male',
      Outcome: 'Arrest',
      'Outcome linked to object of search': 'true',
    },
    {
      'Officer-defined ethnicity': 'Black',
      'Self-defined ethnicity': '',
      'Object of search': 'Stolen goods',
      Legislation: '',
      'Age range': 'over 34',
      Gender: 'Female',
      Outcome: 'Arrest',
      'Outcome linked to object of search': '', // not recorded → excluded from find_known
    },
  ];
  const r = rollupStops(rows);
  assert.equal(r.total, 3);
  assert.equal(r.find_known, 2); // two rows recorded the flag
  assert.equal(r.find_count, 1); // one was a find

  const black = r.dims.find((d) => d.dimension === 'officer_ethnicity' && d.value === 'Black');
  assert.equal(black.count, 2);
  assert.equal(black.find_count, 1);
  const noLeg = r.dims.find((d) => d.dimension === 'legislation' && d.value === 'Not stated');
  assert.equal(noLeg.count, 1);
});

test('mergeCounts folds per-force rollups into one aggregate', () => {
  const forceA = [{ category: 'burglary', count: 2 }, { category: 'drugs', count: 1 }];
  const forceB = [{ category: 'burglary', count: 3 }];
  const all = mergeCounts([forceA, forceB], ['category']).sort((a, b) => a.category.localeCompare(b.category));
  assert.deepEqual(all, [
    { category: 'burglary', count: 5 },
    { category: 'drugs', count: 1 },
  ]);
});

test('mergeCounts can sum several numeric fields at once', () => {
  const a = [{ dimension: 'gender', value: 'Male', count: 2, find_count: 1 }];
  const b = [{ dimension: 'gender', value: 'Male', count: 4, find_count: 2 }];
  const merged = mergeCounts([a, b], ['dimension', 'value'], ['count', 'find_count']);
  assert.deepEqual(merged, [{ dimension: 'gender', value: 'Male', count: 6, find_count: 3 }]);
});
