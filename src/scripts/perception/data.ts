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
export interface Context {
  milestones: { date: string; label: string; detail: string; url: string }[];
  adoption: { year: number; share: number; note: string }[];
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
export const THEME_META: Record<string, { label: string; color: string }> = {
  trust: { label: 'Trust', color: '#2f7d52' },
  misconduct: { label: 'Misconduct', color: '#b3402f' },
  race: { label: 'Race', color: '#8a5a2b' },
  terrorism: { label: 'Terrorism', color: '#6d4c91' },
  protest: { label: 'Protest', color: '#c97e2b' },
  reform: { label: 'Reform', color: '#3b6ea5' },
  leadership: { label: 'Leadership', color: '#8a6fae' }, // legacy data only
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
