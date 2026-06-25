// Shared definitions for the police-perception word analysis — the single source
// of truth behind the agent fan-out, the Guardian fetcher and the build/merge
// script. Plain ESM, no Astro imports, so it runs anywhere in the Node pipeline.
//
// The study covers three subject FACETS of UK policing coverage, each defined by
// a fixed query set so every year is measured the same way:
//   • police-general          — the institution and the act of policing
//   • forces                  — named territorial forces
//   • leaders-officers-staff  — ranks, roles and named individuals
//
// Storing only DERIVED aggregates (counts, rates, scores) + provenance is a hard
// rule — see scripts/build-perception.mjs and src/content/config.ts.

export const SCHEMA_VERSION = 1;
export const METHODOLOGY_VERSION = '2026.1';

export const YEAR_START = 2000;
export const YEAR_END = 2025;

export const FACETS = ['police-general', 'forces', 'leaders-officers-staff'];

export const FACET_LABELS = {
  'police-general': 'The police, generally',
  forces: 'British police forces',
  'leaders-officers-staff': 'Leaders, officers & staff',
};

// Query terms per facet. Every source ORs these phrases into a search and then
// tallies word hits within the MATCHED articles' text, so these terms decide
// which articles enter the corpus. The study is strictly "about the police", so
// the terms are police-specific: ambiguous single words (force, officer,
// commissioner, sergeant, constable) are qualified with "police" to keep out
// armed forces, council officers, EU commissioners, military ranks, etc.
// Phrases are quoted by each fetcher; whole-corpus comparability comes from the
// per-10k normalisation downstream. Keep OR-lists modest — GDELT rejects
// over-long/over-complex queries.
export const FACET_QUERIES = {
  'police-general': ['police', 'policing', 'constabulary', 'police force', 'law enforcement'],
  forces: [
    'metropolitan police',
    'met police',
    'greater manchester police',
    'west midlands police',
    'merseyside police',
    'south yorkshire police',
    'police scotland',
    'british transport police',
    'city of london police',
  ],
  'leaders-officers-staff': [
    'police officer',
    'chief constable',
    'police commissioner',
    'police and crime commissioner',
    'police constable',
    'police sergeant',
    'community support officer',
    'special constable',
    'police staff',
  ],
};

// Guardian tag selectors (verified live against content.guardianapis.com). The
// Guardian's editorial `uk/police` tag is a clean, comprehensive index of UK
// police coverage (the `uk-news/police` form returns nothing). For police-general
// we select by this tag ALONE — it's both fuller and cleaner than a free-text
// phrase match, and avoids the global-desk "trump/nsw/sydney" noise entirely.
// (Note: the Guardian ANDs `tag` with `q`, so a tag here REPLACES the q query
// rather than narrowing it.) Facets without a tag fall back to the phrase query
// constrained to the UK production office.
export const GUARDIAN_FACET_TAGS = {
  'police-general': 'uk/police',
};

// Per-force registry — the named UK forces tracked individually so each can be
// filtered to its own "journey" (coverage volume + tone + words over time) and
// compared against the others. This is a SEPARATE, lighter dimension from the
// `forces` thematic facet above: a per-force GDELT search (fetch-gdelt-forces),
// keyed by `id`, surfaced as `forceBreakdown` on each year. The set is the
// largest UK forces plus Surrey & Sussex; edit freely. `query` lists the name
// variants OR'd into the search (phrases are quoted by the fetcher).
export const FORCES = [
  { id: 'metropolitan', name: 'Metropolitan Police', query: ['metropolitan police', 'met police'] },
  { id: 'police-scotland', name: 'Police Scotland', query: ['police scotland'] },
  { id: 'psni', name: 'Police Service of Northern Ireland', query: ['police service of northern ireland', 'PSNI'] },
  { id: 'west-midlands', name: 'West Midlands Police', query: ['west midlands police'] },
  { id: 'greater-manchester', name: 'Greater Manchester Police', query: ['greater manchester police'] },
  { id: 'west-yorkshire', name: 'West Yorkshire Police', query: ['west yorkshire police'] },
  { id: 'thames-valley', name: 'Thames Valley Police', query: ['thames valley police'] },
  { id: 'merseyside', name: 'Merseyside Police', query: ['merseyside police'] },
  { id: 'kent', name: 'Kent Police', query: ['kent police'] },
  { id: 'essex', name: 'Essex Police', query: ['essex police'] },
  { id: 'hampshire', name: 'Hampshire Constabulary', query: ['hampshire constabulary', 'hampshire police'] },
  { id: 'avon-somerset', name: 'Avon and Somerset Police', query: ['avon and somerset police', 'avon and somerset constabulary'] },
  { id: 'lancashire', name: 'Lancashire Constabulary', query: ['lancashire constabulary', 'lancashire police'] },
  { id: 'northumbria', name: 'Northumbria Police', query: ['northumbria police'] },
  { id: 'south-yorkshire', name: 'South Yorkshire Police', query: ['south yorkshire police'] },
  { id: 'surrey', name: 'Surrey Police', query: ['surrey police'] },
  { id: 'sussex', name: 'Sussex Police', query: ['sussex police'] },
];

export const forceById = (id) => FORCES.find((f) => f.id === id);

// Outlet registry — used to enforce source diversity and to compute the
// per-year diversity index. `type` spreads the sample across the press; `lean`
// is recorded so a future analysis can check for political skew. This is a
// representative (not exhaustive) set of UK-relevant outlets.
export const OUTLETS = [
  { name: 'The Guardian', type: 'broadsheet', lean: 'left' },
  { name: 'The Observer', type: 'broadsheet', lean: 'left' },
  { name: 'The Times', type: 'broadsheet', lean: 'right' },
  { name: 'The Daily Telegraph', type: 'broadsheet', lean: 'right' },
  { name: 'The Independent', type: 'broadsheet', lean: 'centre' },
  { name: 'i', type: 'broadsheet', lean: 'centre' },
  { name: 'Financial Times', type: 'broadsheet', lean: 'centre' },
  { name: 'Daily Mail', type: 'tabloid', lean: 'right' },
  { name: 'The Sun', type: 'tabloid', lean: 'right' },
  { name: 'Daily Mirror', type: 'tabloid', lean: 'left' },
  { name: 'Daily Express', type: 'tabloid', lean: 'right' },
  { name: 'Daily Star', type: 'tabloid', lean: 'na' },
  { name: 'BBC News', type: 'broadcaster', lean: 'centre' },
  { name: 'Sky News', type: 'broadcaster', lean: 'centre' },
  { name: 'ITV News', type: 'broadcaster', lean: 'centre' },
  { name: 'Channel 4 News', type: 'broadcaster', lean: 'centre' },
  { name: 'Manchester Evening News', type: 'regional', lean: 'na' },
  { name: 'Liverpool Echo', type: 'regional', lean: 'na' },
  { name: 'Birmingham Mail', type: 'regional', lean: 'na' },
  { name: 'Yorkshire Post', type: 'regional', lean: 'na' },
  { name: 'Police Professional', type: 'trade', lean: 'na' },
  { name: 'Police Oracle', type: 'trade', lean: 'na' },
  { name: 'GOV.UK', type: 'official', lean: 'na' },
  { name: 'Home Office', type: 'official', lean: 'na' },
];

export const OUTLET_TYPES = ['broadsheet', 'tabloid', 'broadcaster', 'regional', 'trade', 'official', 'other'];

// Diversity quotas, applied per year by the build step.
export const QUOTAS = {
  maxOutletShare: 0.4, // no single outlet may exceed this share of counted items
  minOutlets: 3, // a year below this is flagged as low-diversity
  sparseItemThreshold: 400, // years below this item count are flagged `sparse`
};

export const outletByName = (name) => OUTLETS.find((o) => o.name === name) ?? { name, type: 'other', lean: 'na' };
