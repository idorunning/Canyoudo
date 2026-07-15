import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import {
  CRIME_CATEGORY_META, categoryColor, categoryLabel,
  TIER_BREAKS, tierForZoom,
  DOMINANT_EXCLUDE, dominantCategory,
  dotRadius, ratePer1000,
  viewportPoly, viewportAreaKm2,
  cellSizeDeg, gridCluster,
  monthOptions, heatShade,
} from '../src/lib/crime-map-core.mjs';

// --- palette ------------------------------------------------------------------

test('all 14 data.police.uk categories have distinct light and dark colours', () => {
  assert.equal(CRIME_CATEGORY_META.length, 14);
  const light = new Set(CRIME_CATEGORY_META.map((m) => m.color));
  const dark = new Set(CRIME_CATEGORY_META.map((m) => m.colorDark));
  assert.equal(light.size, 14, 'light hexes must be unique');
  assert.equal(dark.size, 14, 'dark hexes must be unique');
  for (const m of CRIME_CATEGORY_META) {
    assert.match(m.color, /^#[0-9a-f]{6}$/, m.key);
    assert.match(m.colorDark, /^#[0-9a-f]{6}$/, m.key);
    assert.ok(m.label.length > 2, m.key);
  }
});

test('unknown categories fall back to the other-crime colour', () => {
  assert.equal(categoryColor('not-a-category'), categoryColor('other-crime'));
  assert.equal(categoryColor('not-a-category', true), categoryColor('other-crime', true));
  assert.equal(categoryLabel('not-a-category'), 'Other crime');
});

// --- zoom ladder ----------------------------------------------------------------

test('tierForZoom boundaries match TIER_BREAKS', () => {
  assert.equal(tierForZoom(5), 1);
  assert.equal(tierForZoom(TIER_BREAKS.forces - 1), 1);
  assert.equal(tierForZoom(TIER_BREAKS.forces), 2);
  assert.equal(tierForZoom(TIER_BREAKS.hotspots - 1), 2);
  assert.equal(tierForZoom(TIER_BREAKS.hotspots), 3);
  assert.equal(tierForZoom(17), 3);
});

// --- dominant category ---------------------------------------------------------

test('dominantCategory excludes ASB and other-crime by default', () => {
  const byCategory = { 'anti-social-behaviour': 900, 'violent-crime': 500, 'burglary': 300, 'other-crime': 600 };
  assert.equal(dominantCategory(byCategory), 'violent-crime');
  assert.equal(dominantCategory(byCategory, { exclude: [] }), 'anti-social-behaviour');
});

test('dominantCategory returns null when nothing qualifies', () => {
  assert.equal(dominantCategory({}), null);
  assert.equal(dominantCategory({ 'anti-social-behaviour': 10 }), null);
  assert.equal(dominantCategory({ 'burglary': 0 }), null);
  assert.equal(dominantCategory(undefined), null);
});

test('DOMINANT_EXCLUDE names real categories', () => {
  const keys = new Set(CRIME_CATEGORY_META.map((m) => m.key));
  for (const k of DOMINANT_EXCLUDE) assert.ok(keys.has(k), k);
});

// --- scales --------------------------------------------------------------------

test('dotRadius is monotonic and clamped', () => {
  const r1 = dotRadius(100, 1000), r2 = dotRadius(500, 1000), r3 = dotRadius(1000, 1000);
  assert.ok(r1 < r2 && r2 < r3);
  assert.equal(dotRadius(0, 1000), 4);
  assert.equal(dotRadius(100, 0), 4, 'zero max degrades to min');
  assert.equal(dotRadius(2000, 1000), 26, 'over-max clamps to max radius');
  assert.equal(dotRadius(50, 100, { min: 2, max: 10 }), 2 + 8 * Math.sqrt(0.5));
});

test('ratePer1000 is null-safe', () => {
  assert.equal(ratePer1000(1500, 1_000_000), 1.5);
  assert.equal(ratePer1000(1500, 0), null);
  assert.equal(ratePer1000(1500, null), null);
});

// --- viewport helpers ----------------------------------------------------------

test('viewportPoly formats four corners clockwise from NW', () => {
  const poly = viewportPoly({ north: 51.55, south: 51.45, east: -0.05, west: -0.15 });
  assert.equal(poly, '51.5500,-0.1500:51.5500,-0.0500:51.4500,-0.0500:51.4500,-0.1500');
  assert.equal(viewportPoly({ north: 51.5, south: 51.4, east: 0.1, west: 0 }, 2), '51.50,0.00:51.50,0.10:51.40,0.10:51.40,0.00');
});

test('viewportAreaKm2 approximates a known box', () => {
  // 0.1° × 0.1° at ~51.5°N ≈ 11.13 km × 6.93 km ≈ 77 km²
  const area = viewportAreaKm2({ north: 51.55, south: 51.45, east: -0.05, west: -0.15 });
  assert.ok(area > 70 && area < 85, `got ${area}`);
});

// --- clustering ------------------------------------------------------------------

test('gridCluster conserves counts and finds the true dominant', () => {
  const points = [];
  for (let i = 0; i < 40; i++) points.push({ lat: 51.5 + (i % 5) * 1e-4, lng: -0.1, category: 'burglary' });
  for (let i = 0; i < 10; i++) points.push({ lat: 51.5, lng: -0.1, category: 'anti-social-behaviour' });
  for (let i = 0; i < 7; i++) points.push({ lat: 53.48, lng: -2.24, category: 'drugs' });
  const clusters = gridCluster(points, cellSizeDeg(13));
  assert.equal(clusters.reduce((s, c) => s + c.n, 0), points.length, 'Σn = input length');
  const london = clusters.find((c) => c.lat < 52);
  const manchester = clusters.find((c) => c.lat > 53);
  assert.equal(london.dominant, 'burglary');
  assert.equal(london.byCategory['anti-social-behaviour'], 10);
  assert.equal(manchester.n, 7);
  assert.equal(manchester.dominant, 'drugs');
});

test('cellSizeDeg shrinks with zoom', () => {
  assert.ok(cellSizeDeg(13) < cellSizeDeg(9));
  // 32px at z13: 360 / (256 * 2^13) * 32 ≈ 0.0055°
  assert.ok(Math.abs(cellSizeDeg(13) - 0.005493) < 1e-4);
});

// --- months + heat ramp -----------------------------------------------------------

test('monthOptions walks back across year boundaries, newest first', () => {
  assert.deepEqual(monthOptions('2026-02', 4), ['2026-02', '2026-01', '2025-12', '2025-11']);
  assert.deepEqual(monthOptions('garbage'), []);
});

test('heatShade advances with count and never leaves the ramp', () => {
  const low = heatShade(1, 100), high = heatShade(100, 100);
  assert.notEqual(low, high);
  assert.match(heatShade(0, 0), /^#/);
  assert.match(heatShade(50, 100, true), /^#/);
  assert.equal(heatShade(0, 100), heatShade(0, 0), 'zero count = base stop');
});

// --- committed geo asset integrity (the correctness pin for the map's data) -------

test('force-centroids.json ids exactly match the committed force list, in bounds', () => {
  const centroids = JSON.parse(readFileSync('src/data/force-centroids.json', 'utf8'));
  const committed = readdirSync('src/content/policedata/forces')
    .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(Object.keys(centroids.forces).sort(), committed);
  for (const [id, c] of Object.entries(centroids.forces)) {
    assert.ok(c.lat >= 49 && c.lat <= 61, `${id} lat ${c.lat}`);
    assert.ok(c.lng >= -8.7 && c.lng <= 2, `${id} lng ${c.lng}`);
    assert.ok(c.name, id);
  }
});

test('pfa-boundaries.json is a FeatureCollection under the size budget', () => {
  const path = 'public/geo/pfa-boundaries.json';
  assert.ok(statSync(path).size <= 600 * 1024, 'over the 600 KB budget');
  const fc = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 43, '43 territorial EW forces');
  for (const f of fc.features) assert.ok(f.properties.id && f.properties.name);
});

test('lsoa-centroids.json has a plausible code count and shape', () => {
  const { count, c } = JSON.parse(readFileSync('public/geo/lsoa-centroids.json', 'utf8'));
  assert.ok(count >= 34000 && count <= 39000, `count ${count}`);
  assert.equal(Object.keys(c).length, count);
  const [lat, lng] = c['E01000001'];
  assert.ok(lat > 51 && lat < 52 && lng > -1 && lng < 0, 'City of London LSOA in place');
});
