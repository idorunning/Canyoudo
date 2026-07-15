// Pure logic for the Crime Map (/data) — no DOM, no Leaflet, so node --test
// can load it directly (the same pattern as outcomes.mjs). The map controller
// (src/scripts/data/crime-map.ts) owns all rendering and I/O.

// The 14 data.police.uk crime categories, in legend order. Colours are
// OKLCH-designed in hue families (reds = violence, blues = property entry,
// greens = theft, ambers = damage/order) with alternating lightness, and
// validated with the dataviz palette checker against both tile surfaces:
// every hard check passes in both modes (worst adjacent CVD ΔE 10.8 light /
// 8.6 dark, normal-vision ΔE 17.3 / 15.5). The handful of sub-3:1-contrast
// slots are relieved by the dot's surface-colour stroke, the named tooltip,
// and the legend/panel labels, per the palette rules.
export const CRIME_CATEGORY_META = [
  { key: 'violent-crime',         label: 'Violence & sexual offences', family: 'violence', color: '#a43b38', colorDark: '#b93d42' },
  { key: 'robbery',               label: 'Robbery',                    family: 'violence', color: '#d87d4c', colorDark: '#cd7c20' },
  { key: 'possession-of-weapons', label: 'Possession of weapons',      family: 'violence', color: '#7f3e00', colorDark: '#93472c' },
  { key: 'criminal-damage-arson', label: 'Criminal damage & arson',    family: 'disorder', color: '#ca9d33', colorDark: '#bc8800' },
  { key: 'public-order',          label: 'Public order',               family: 'disorder', color: '#81720e', colorDark: '#656902' },
  { key: 'burglary',              label: 'Burglary',                   family: 'property', color: '#2769b7', colorDark: '#3e6dc8' },
  { key: 'vehicle-crime',         label: 'Vehicle crime',              family: 'property', color: '#50a9d9', colorDark: '#00a4be' },
  { key: 'bicycle-theft',         label: 'Bicycle theft',              family: 'property', color: '#31509d', colorDark: '#4f5aac' },
  { key: 'other-theft',           label: 'Other theft',                family: 'theft',    color: '#33854a', colorDark: '#1a8656' },
  { key: 'shoplifting',           label: 'Shoplifting',                family: 'theft',    color: '#80b761', colorDark: '#969a00' },
  { key: 'theft-from-the-person', label: 'Theft from the person',      family: 'theft',    color: '#00673f', colorDark: '#007757' },
  { key: 'drugs',                 label: 'Drugs',                      family: 'drugs',    color: '#8766bb', colorDark: '#8d6cc2' },
  { key: 'anti-social-behaviour', label: 'Anti-social behaviour',      family: 'other',    color: '#2ca2a2', colorDark: '#229c9c' },
  { key: 'other-crime',           label: 'Other crime',                family: 'other',    color: '#874882', colorDark: '#90578c' },
];

const META_BY_KEY = new Map(CRIME_CATEGORY_META.map((m) => [m.key, m]));
const FALLBACK = META_BY_KEY.get('other-crime');

// The street API names categories with url-slugs (violent-crime,
// criminal-damage-arson) but the bulk-CSV ingest slugifies the CSV's Title
// Case names (Violence and sexual offences → violence-and-sexual-offences),
// so the database rollups speak a slightly different dialect. Canonicalise
// before any palette/label lookup — two of the fourteen differ.
const CATEGORY_ALIASES = {
  'violence-and-sexual-offences': 'violent-crime',
  'criminal-damage-and-arson': 'criminal-damage-arson',
};
export function canonicalCategory(key) {
  return CATEGORY_ALIASES[key] ?? key;
}

export function categoryColor(key, dark = false) {
  const m = META_BY_KEY.get(canonicalCategory(key)) ?? FALLBACK;
  return dark ? m.colorDark : m.color;
}

export function categoryLabel(key) {
  return (META_BY_KEY.get(canonicalCategory(key)) ?? FALLBACK).label;
}

// The zoom ladder: forces → hotspots → streets.
export const TIER_BREAKS = { forces: 9, hotspots: 13 };
export function tierForZoom(zoom) {
  return zoom < TIER_BREAKS.forces ? 1 : zoom < TIER_BREAKS.hotspots ? 2 : 3;
}

// The tier actually rendered. Zoom alone can lie on large displays: a wide
// monitor at the street break can still show >400 km², which the street API
// refuses (>10k crimes) — so tier 3 demotes back to hotspots until the
// viewport is small enough to load individual crimes.
export function effectiveTier(zoom, areaKm2, { streetLimit = 400 } = {}) {
  const t = tierForZoom(zoom);
  return t === 3 && areaKm2 > streetLimit ? 2 : t;
}

// Which category colours a force dot. Anti-social behaviour tops nearly every
// force (and "other crime" says nothing), so by default both are excluded from
// the *dot colour* — the panel and tooltip always show the true breakdown, and
// the legend says so. Returns null when nothing qualifies.
export const DOMINANT_EXCLUDE = ['anti-social-behaviour', 'other-crime'];
export function dominantCategory(byCategory, { exclude = DOMINANT_EXCLUDE } = {}) {
  let best = null, bestCount = 0;
  for (const [key, count] of Object.entries(byCategory ?? {})) {
    if (exclude.includes(canonicalCategory(key))) continue;
    if (count > bestCount) { best = key; bestCount = count; }
  }
  return best;
}

// Dot radius by value — square-root scaling so *area* tracks the count.
export function dotRadius(value, maxValue, { min = 4, max = 26 } = {}) {
  if (!(maxValue > 0) || !(value > 0)) return min;
  return Math.min(max, min + (max - min) * Math.sqrt(Math.min(value, maxValue) / maxValue));
}

export function ratePer1000(total, population) {
  return population > 0 ? (total / population) * 1000 : null;
}

// data.police.uk poly format for the current viewport: the four corners as
// "lat,lng:lat,lng:…". 4 dp (~11 m) keeps cache keys stable while panning.
export function viewportPoly({ north, south, east, west }, dp = 4) {
  const r = (v) => v.toFixed(dp);
  return [
    `${r(north)},${r(west)}`, `${r(north)},${r(east)}`,
    `${r(south)},${r(east)}`, `${r(south)},${r(west)}`,
  ].join(':');
}

export function viewportAreaKm2({ north, south, east, west }) {
  const KM_PER_DEG = 111.32;
  const midLat = ((north + south) / 2) * (Math.PI / 180);
  const h = Math.abs(north - south) * KM_PER_DEG;
  const w = Math.abs(east - west) * KM_PER_DEG * Math.cos(midLat);
  return h * w;
}

// A ~px-sized grid cell in degrees of longitude at a Web-Mercator zoom.
// (Constant in latitude too — a hair tall in the north, fine for clustering.)
export function cellSizeDeg(zoom, px = 32) {
  return (360 / (256 * 2 ** zoom)) * px;
}

// Screen-grid clustering for tier 3. Buckets points on a fixed lat/lng grid
// (keyed on the grid, not pixels, so panning reuses buckets) and returns one
// dot per bucket at the members' mean position. Count is conserved: Σn equals
// the number of input points.
export function gridCluster(points, cellDeg) {
  const buckets = new Map();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cellDeg)}|${Math.floor(p.lng / cellDeg)}`;
    let b = buckets.get(key);
    if (!b) { b = { lat: 0, lng: 0, n: 0, byCategory: {} }; buckets.set(key, b); }
    b.lat += p.lat; b.lng += p.lng; b.n++;
    b.byCategory[p.category] = (b.byCategory[p.category] ?? 0) + 1;
  }
  return [...buckets.values()].map((b) => ({
    lat: b.lat / b.n, lng: b.lng / b.n, n: b.n, byCategory: b.byCategory,
    // Clusters show the true dominant — the legend filter has already removed
    // anything the reader chose to hide, so no exclusions here.
    dominant: dominantCategory(b.byCategory, { exclude: [] }),
  }));
}

// 'YYYY-MM' options, newest first, ending at `latest`.
export function monthOptions(latest, n = 12) {
  const [y, m] = String(latest).split('-').map(Number);
  if (!y || !m) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Tier-2 volume shading: one hue (the site's accent red), stepped light→dark
// on light tiles and dark→light on dark tiles so "more" always advances
// toward salience. Sequential, per the palette rules — never a rainbow.
const HEAT_LIGHT = ['#d9a9a4', '#c07b73', '#a04c44', '#7c2828'];
const HEAT_DARK = ['#5a2a26', '#8c4038', '#b95c50', '#e58a7a'];
export function heatShade(count, max, dark = false) {
  const ramp = dark ? HEAT_DARK : HEAT_LIGHT;
  if (!(max > 0) || !(count > 0)) return ramp[0];
  const t = Math.sqrt(count / max); // match dot-area scaling so colour and size agree
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

// Honesty notes the map must surface for specific forces (see
// docs/crime-dashboard-review.md's caveat discipline; police.uk changelog).
export const FORCE_DATA_NOTES = {
  'greater-manchester':
    'Greater Manchester Police’s street-level data has known gaps since 2019, including recent missing months — treat low counts here as missing data, not low crime.',
};
