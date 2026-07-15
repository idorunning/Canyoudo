import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREND, trendLabel, changePct, median,
  forceInsightLines, nationalInsightLines,
  hotspotInsight, viewSummary, disparityLine, DISPARITY_CAVEAT,
} from '../src/lib/map-insights.mjs';
import { TREND_LABELS } from '../src/lib/dashboard-prompts.ts';

test('the map speaks the same fixed trend vocabulary as the briefings', () => {
  assert.deepEqual(TREND, TREND_LABELS);
});

test('trendLabel thresholds and null-safety', () => {
  assert.equal(trendLabel(110, 100), 'Rising');
  assert.equal(trendLabel(90, 100), 'Falling');
  assert.equal(trendLabel(104, 100), 'Steady');
  assert.equal(trendLabel(96, 100), 'Steady');
  assert.equal(trendLabel(100, null), 'Too early to say');
  assert.equal(trendLabel(100, 0), 'Too early to say');
  assert.equal(trendLabel(120, 100, { threshold: 0.25 }), 'Steady');
});

test('changePct and median', () => {
  assert.equal(changePct(110, 100), 10);
  assert.equal(changePct(100, null), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

const nat = { total: 4_400_000, prevTotal: 4_500_000, population: 60_000_000, windowTo: '2026-04' };

test('forceInsightLines: full context when denominators exist', () => {
  const lines = forceInsightLines({ total: 61204, prevTotal: 64000, population: 1_850_000 }, nat, 'Kent');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Kent recorded 61,204 crimes in the 12 months to April 2026/);
  assert.match(lines[0], /33 per 1,000 residents/);
  assert.match(lines[0], /well below the England & Wales average of 73/);
  assert.match(lines[1], /within 4\.4% of the previous 12 months — steady/);
  const falling = forceInsightLines({ total: 50000, prevTotal: 64000, population: 1_850_000 }, nat, 'Kent');
  assert.match(falling[1], /21\.9% lower.*falling/);
});

test('forceInsightLines: no rate sentence without a denominator', () => {
  const lines = forceInsightLines({ total: 1000, prevTotal: null, population: null }, { ...nat, population: null }, 'Gwent');
  assert.ok(!/per 1,000/.test(lines[0]), 'never invent a rate');
  assert.match(lines[1], /too early to say/i);
});

test('nationalInsightLines: headline + spread when rates exist', () => {
  const forces = Array.from({ length: 12 }, (_, i) => ({ total: 10000 + i * 1000, population: 500_000 }));
  const lines = nationalInsightLines(nat, forces);
  assert.match(lines[0], /4,400,000 crimes.*within 2\.2% of the previous 12 months, steady/);
  assert.match(lines[1], /Rates run from 20 to 42/);
  const fallback = nationalInsightLines(nat, [{ total: 1, population: null }]);
  assert.match(fallback[1], /not a rate/);
});

test('hotspotInsight compares against the median hotspot', () => {
  assert.match(hotspotInsight(240, [30, 30, 240]), /8× the median/);
  assert.match(hotspotInsight(30, [30, 28, 32]), /about the median/);
  assert.match(hotspotInsight(5, []), /^5 crimes this month\.$/);
});

test('viewSummary tallies categories and streets', () => {
  const pts = [
    { category: 'burglary', street: 'On or near High Street' },
    { category: 'burglary', street: 'On or near High Street' },
    { category: 'drugs', street: 'On or near Park Road' },
  ];
  const s = viewSummary(pts);
  assert.equal(s.total, 3);
  assert.deepEqual(s.topCategories[0], ['burglary', 2]);
  assert.deepEqual(s.topStreets[0], ['On or near High Street', 2]);
});

test('disparityLine is careful with and without a denominator', () => {
  assert.match(
    disparityLine({ ethnicity: 'Black', searchShare: 0.22, populationShare: 0.12, disparityRatio: 1.83 }),
    /Black people account for 22% of searches and 12% of residents — a 1\.8× disparity\./
  );
  assert.match(
    disparityLine({ ethnicity: 'Asian', searchShare: 0.1, populationShare: null, disparityRatio: null }),
    /no population share loaded/
  );
  assert.match(DISPARITY_CAVEAT, /not proof of bias/);
});

test('no dramatic vocabulary ever appears in generated lines', () => {
  const banned = /soar|surg|plummet|skyrocket|epidemic|wave|explod|spiral/i;
  const samples = [
    ...forceInsightLines({ total: 90000, prevTotal: 40000, population: 1_000_000 }, nat, 'Testshire'),
    ...forceInsightLines({ total: 10000, prevTotal: 90000, population: null }, nat, 'Testshire'),
    ...nationalInsightLines({ total: 9_000_000, prevTotal: 2_000_000, population: 60_000_000 }, []),
    hotspotInsight(9999, [10, 10, 10]),
  ];
  for (const line of samples) assert.ok(!banned.test(line), line);
});
