// Pure helpers for the census/population seed fetcher
// (scripts/fetch-census-ethnicity.mjs) — kept separate so node --test can pin
// the mapping and aggregation without any network. Slug rules match
// scripts/seed-population.mjs exactly: the CSVs this feeds are parsed by that
// script's header regexes, so the two must never drift.

export const ALIASES = {
  'metropolitan police': 'metropolitan',
  'london, city of': 'city-of-london',
  'city of london': 'city-of-london',
  'devon and cornwall': 'devon-and-cornwall',
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const forceId = (name) => {
  const n = norm(name);
  if (ALIASES[n]) return ALIASES[n];
  return n.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

export const TERRITORIAL_FORCES = [
  'avon-and-somerset', 'bedfordshire', 'cambridgeshire', 'cheshire', 'city-of-london',
  'cleveland', 'cumbria', 'derbyshire', 'devon-and-cornwall', 'dorset', 'durham',
  'dyfed-powys', 'essex', 'gloucestershire', 'greater-manchester', 'gwent', 'hampshire',
  'hertfordshire', 'humberside', 'kent', 'lancashire', 'leicestershire', 'lincolnshire',
  'merseyside', 'metropolitan', 'norfolk', 'north-wales', 'north-yorkshire',
  'northamptonshire', 'northumbria', 'nottinghamshire', 'south-wales', 'south-yorkshire',
  'staffordshire', 'suffolk', 'surrey', 'sussex', 'thames-valley', 'warwickshire',
  'west-mercia', 'west-midlands', 'west-yorkshire', 'wiltshire',
];

// The five census broad groups → the exact labels ss_dim's officer-defined
// ethnicity uses (the disparity join key). Only the five NOMIS broad-category
// codes (1001–1005) may be fetched: the 19 detailed labels are ambiguous under
// prefix matching ("Mixed: White and Black Caribbean" contains three groups).
export const BROAD_GROUPS = {
  'Asian, Asian British or Asian Welsh': 'Asian',
  'Black, Black British, Black Welsh, Caribbean or African': 'Black',
  'Mixed or Multiple ethnic groups': 'Mixed',
  'White': 'White',
  'Other ethnic group': 'Other',
};

export function broadGroupOf(censusLabel) {
  const g = BROAD_GROUPS[String(censusLabel).trim()];
  if (!g) throw new Error(`Unexpected census ethnic-group label (detailed category?): "${censusLabel}"`);
  return g;
}

// LAD lookup rows → Map<LAD code, { pfaName, pfaCode }>; a LAD appearing under
// several Community Safety Partnerships is fine, a LAD under two different
// police force areas is not.
export function ladToPfa(lookupRows) {
  const m = new Map();
  for (const r of lookupRows) {
    const prev = m.get(r.ladCode);
    if (prev && prev.pfaCode !== r.pfaCode) {
      throw new Error(`LAD ${r.ladCode} maps to two police force areas: ${prev.pfaName} and ${r.pfaName}`);
    }
    m.set(r.ladCode, { pfaName: r.pfaName, pfaCode: r.pfaCode });
  }
  return m;
}

// Aggregate LAD-grained observations to police force areas.
// obs: { ladCode, ladName, group?, value }[]; returns Map<`${pfaName}|${group ?? ''}`, sum>
// and the list of LAD codes that had no lookup entry (the caller decides how
// loudly to fail — England & Wales codes must always map).
export function aggregateToPfa(obs, lookup) {
  const sums = new Map();
  const orphans = [];
  for (const o of obs) {
    const hit = lookup.get(o.ladCode);
    if (!hit) { orphans.push(o.ladCode); continue; }
    const key = `${hit.pfaName}|${o.group ?? ''}`;
    sums.set(key, (sums.get(key) ?? 0) + o.value);
  }
  return { sums, orphans: [...new Set(orphans)] };
}

// CSV out — quoted only where needed, matching seed-population's parser.
export function toCsv(headers, rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

// Sanity pins shared by both outputs.
export function assertPfaCoverage(pfaNames) {
  const ids = new Set([...pfaNames].map(forceId));
  const missing = TERRITORIAL_FORCES.filter((f) => !ids.has(f));
  const extra = [...ids].filter((f) => !TERRITORIAL_FORCES.includes(f));
  if (missing.length || extra.length) {
    throw new Error(`PFA coverage mismatch — missing: [${missing.join(', ')}], unexpected: [${extra.join(', ')}]`);
  }
}
