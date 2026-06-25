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
  lexicons: Record<'trust' | 'misconduct' | 'reform' | 'race' | 'leadership', Lex>;
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
export const THEME_KEYS = ['trust', 'misconduct', 'reform', 'race', 'leadership'] as const;

let cache: Bundle | null = null;

export async function loadBundle(): Promise<Bundle> {
  if (cache) return cache;
  const res = await fetch('/perception-data.json');
  if (!res.ok) throw new Error(`perception-data.json → ${res.status}`);
  cache = (await res.json()) as Bundle;
  return cache;
}

export const milestoneYear = (date: string): number => Number(date.slice(0, 4));
