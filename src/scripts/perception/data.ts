// Client-side data access for the perception explorer. Loads the one-file
// bundle written by scripts/generate-perception-clouds.mjs (so the browser makes
// a single request, not 26), and exposes typed accessors the explorer shares.

export interface Word { term: string; count: number; ratePer10k: number }
export interface Lex { items: number; ratePer10k: number }
export interface Entity { name: string; type: 'force' | 'leader' | 'officer' | 'role'; count: number; ratePer10k: number }
export interface Sentiment { mean: number; positive: number; neutral: number; negative: number; gdeltToneMean: number | null }
export interface Facet {
  corpusTokens: number;
  topWords: Word[];
  sentiment: Sentiment;
  lexicons: Record<string, Lex>;
  entities: Entity[];
}
export interface Provenance {
  generatedAt: string; method: string; sourcesUsed: string[];
  itemCount: number; diversityIndex: number | null; sparse: boolean; sample: boolean; notes: string;
}
// A named force's lighter "journey" aggregate for a year (volume + tone + words).
export interface ForceTrend {
  name: string;
  volume: number;
  tone: number | null;
  sentiment: Sentiment;
  topWords: Word[];
}
export interface YearData {
  year: number;
  provenance: Provenance;
  facets: Record<string, Facet>;
  forceBreakdown?: Record<string, ForceTrend> | null;
}
// London: narrative vs reality — the curated, cited dataset behind the London view.
export interface LondonMetric {
  key: string;
  label: string;
  source: string;
  sourceUrl: string;
  latest: string; // short cited headline change, e.g. "−16% — fewest since 2014"
  points: { year: number; value: number }[];
}
export interface LondonPost {
  date: string;
  author: string;
  platform: string;
  quote: string;
  url: string;
  note: string;
}
export interface LondonData {
  note: string;
  baseYear: number;
  metrics: LondonMetric[];
  narrative: { year: number; value: number; note: string }[];
  posts: LondonPost[];
}
export interface Context {
  milestones: { date: string; label: string; detail: string; url: string }[];
  adoption: { year: number; share: number; note: string }[];
  london?: LondonData;
}
export interface Bundle {
  methodologyVersion: string;
  maxima: { wordRate: number; lexRate: number; entityRate: number; forceWordRate?: number };
  sample: boolean;
  facetLabels: Record<string, string>;
  forces?: { id: string; name: string }[];
  sentimentLemmas?: { positive: string[]; negative: string[] };
  wordDisplay?: Record<string, string>;
  wordHide?: string[];
  events?: { year: number; label: string }[];
  years: YearData[];
  context: Context | null;
}

export const FACETS = ['police-general', 'forces', 'leaders-officers-staff'] as const;
export type FacetKey = (typeof FACETS)[number];

// Display metadata for every theme key the data may carry — the current six plus
// the legacy "leadership" (so older data still renders during a re-fetch). Short
// labels keep charts legible; the lexicon scope (e.g. "& corruption") lives in
// the prose. THEME_ORDER is the preferred draw order; callers filter to keys
// actually present in the data via themesPresent().
// Colours reference the chart tokens in global.css, so the explorer follows
// the theme (light/dark, and any future palette flip). The strings work
// anywhere the explorer injects them: inline styles, SVG attributes, chips.
export const THEME_META: Record<string, { label: string; color: string }> = {
  trust: { label: 'Trust', color: 'rgb(var(--chart-green))' },
  misconduct: { label: 'Misconduct', color: 'rgb(var(--chart-red))' },
  race: { label: 'Race', color: 'rgb(var(--chart-amber))' },
  terrorism: { label: 'Terrorism', color: 'rgb(var(--chart-purple))' },
  protest: { label: 'Protest', color: 'rgb(var(--chart-orange))' },
  reform: { label: 'Reform', color: 'rgb(var(--chart-blue))' },
  leadership: { label: 'Leadership', color: 'rgb(var(--chart-violet))' }, // legacy data only
};
export const THEME_ORDER = ['trust', 'misconduct', 'race', 'terrorism', 'protest', 'reform', 'leadership'] as const;

// The theme keys actually present across the given years for a facet, in draw order.
export function themesPresent(years: YearData[], facet: string): string[] {
  const present = new Set<string>();
  for (const y of years) for (const k of Object.keys(y.facets?.[facet]?.lexicons ?? {})) present.add(k);
  return THEME_ORDER.filter((k) => present.has(k) && THEME_META[k]);
}

let cache: Bundle | null = null;

export async function loadBundle(): Promise<Bundle> {
  if (cache) return cache;
  const res = await fetch('/perception-data.json');
  if (!res.ok) throw new Error(`perception-data.json → ${res.status}`);
  cache = (await res.json()) as Bundle;
  return cache;
}

export const milestoneYear = (date: string): number => Number(date.slice(0, 4));
