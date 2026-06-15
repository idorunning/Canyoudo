// Read layer for the Supabase police database (schema:
// supabase/migrations/0001_police_database.sql, populated by
// scripts/ingest-bulk-police.mjs). Used server-side by the Netlify functions.
//
// Everything is public open data, so the anonymous key + public-SELECT RLS is
// enough. Per-force rollups carry an aggregate row with force_id = '_all', so
// "national" is just a normal query — no GROUP BY at request time.
//
// If Supabase isn't configured, configured() is false and every helper returns
// empty/null, so the DB-backed pages degrade quietly (the site's convention).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ALL = '_all';

const URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;
export function configured(): boolean {
  return Boolean(URL && KEY);
}
function db(): SupabaseClient | null {
  if (!configured()) return null;
  if (!client) client = createClient(URL, KEY, { auth: { persistSession: false } });
  return client;
}

const rows = async (q: any) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
};

export interface CrimeRow { force_id: string; month: string; category: string; count: number }
export interface OutcomeRow { force_id: string; month: string; outcome_category: string; count: number }
export interface SsMonthRow { force_id: string; month: string; total: number; find_count: number; find_known: number }
export interface SsDimRow { force_id: string; month: string; dimension: string; value: string; count: number; find_count: number }

// --- crime + outcomes --------------------------------------------------------
export async function crimeByMonth(forceId = ALL): Promise<CrimeRow[]> {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('crime_force_month').select('force_id,month,category,count').eq('force_id', forceId).order('month'));
}

export async function outcomesByMonth(forceId = ALL): Promise<OutcomeRow[]> {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('outcome_force_month').select('force_id,month,outcome_category,count').eq('force_id', forceId).order('month'));
}

// Hotspots: the top LSOAs by all-crime count in one month (latest if omitted).
export async function lsoaHotspots(month?: string, limit = 50): Promise<{ lsoa_code: string; lsoa_name: string | null; month: string; count: number }[]> {
  const sb = db(); if (!sb) return [];
  const m = month ?? (await latestLsoaMonth());
  if (!m) return [];
  return rows(sb.from('crime_lsoa_month').select('lsoa_code,lsoa_name,month,count').eq('month', m).order('count', { ascending: false }).limit(limit));
}

async function latestLsoaMonth(): Promise<string | null> {
  const sb = db(); if (!sb) return null;
  const r = await rows(sb.from('crime_lsoa_month').select('month').order('month', { ascending: false }).limit(1));
  return r[0]?.month ?? null;
}

// --- stop & search -----------------------------------------------------------
export async function ssByMonth(forceId = ALL): Promise<SsMonthRow[]> {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('ss_force_month').select('force_id,month,total,find_count,find_known').eq('force_id', forceId).order('month'));
}

export async function ssDim(forceId: string, dimension: string, month?: string): Promise<SsDimRow[]> {
  const sb = db(); if (!sb) return [];
  let q = sb.from('ss_dim').select('force_id,month,dimension,value,count,find_count').eq('force_id', forceId).eq('dimension', dimension);
  if (month) q = q.eq('month', month);
  return rows(q.order('count', { ascending: false }));
}

// Resident population by broad ethnicity (the disproportionality denominator).
export async function populationByEthnicity(forceId: string): Promise<{ ethnicity: string; population: number }[]> {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('force_population_ethnicity').select('ethnicity,population').eq('force_id', forceId));
}

// --- forces + neighbourhoods -------------------------------------------------
export async function force(id: string) {
  const sb = db(); if (!sb) return null;
  const r = await rows(sb.from('police_forces').select('*').eq('id', id).limit(1));
  return r[0] ?? null;
}
export async function forcePeople(id: string) {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('police_force_people').select('name,rank,bio').eq('force_id', id));
}
export async function allForces() {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('police_forces').select('id,name').order('name'));
}

export async function neighbourhood(forceId: string, id: string) {
  const sb = db(); if (!sb) return null;
  const r = await rows(sb.from('neighbourhoods').select('*').eq('force_id', forceId).eq('id', id).limit(1));
  return r[0] ?? null;
}
export async function neighbourhoodPriorities(forceId: string, id: string) {
  const sb = db(); if (!sb) return [];
  return rows(sb.from('neighbourhood_priorities').select('issue,action,issued_on').eq('force_id', forceId).eq('neighbourhood_id', id));
}

// --- coverage / data quality -------------------------------------------------
export async function dataCoverage() {
  const sb = db(); if (!sb) return null;
  const [latestSs, latestCrime, runs] = await Promise.all([
    rows(sb.from('ss_force_month').select('month').order('month', { ascending: false }).limit(1)),
    rows(sb.from('crime_force_month').select('month').order('month', { ascending: false }).limit(1)),
    rows(sb.from('ingest_runs').select('kind,dataset_month,rows_upserted,ok,notes,finished_at').order('finished_at', { ascending: false }).limit(1)),
  ]);
  return {
    latestStopSearchMonth: latestSs[0]?.month ?? null,
    latestCrimeMonth: latestCrime[0]?.month ?? null,
    lastRun: runs[0] ?? null,
  };
}
