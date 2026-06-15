import type { Config } from '@netlify/functions';
import {
  configured, ALL,
  crimeByMonth, outcomesByMonth, lsoaHotspots,
  ssByMonth, ssDim, populationByEthnicity,
  force, forcePeople, allForces,
  neighbourhood, neighbourhoodPriorities, dataCoverage,
  type CrimeRow, type OutcomeRow,
} from '../../src/lib/police-db';

// Runtime JSON API over the Supabase police database, consumed by the explorer
// pages under /data/. Read-only; everything it serves is public open data, so it
// caches hard at the edge (the underlying data changes monthly). When Supabase
// isn't configured it returns 503 with a clear note so pages degrade quietly.
//
//   GET /api/police-db?view=<name>&force=&dimension=&month=&id=

const json = (status: number, body: unknown, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': cache ? 'public, max-age=600, s-maxage=86400' : 'no-store',
    },
  });

const CHARGED = /charged|caution|community resolution|penalty notice|summons|out-of-court/i;
const NO_SUSPECT = /no suspect identified/i;

// Pivot rollup rows into aligned monthly series the charts can plot directly.
function pivot<T extends { month: string; count: number }>(rows: T[], keyOf: (r: T) => string) {
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const idx = new Map(months.map((m, i) => [m, i]));
  const series = new Map<string, number[]>();
  const totals = new Map<string, number>();
  const totalByMonth = new Array(months.length).fill(0);
  for (const r of rows) {
    const k = keyOf(r);
    if (!series.has(k)) series.set(k, new Array(months.length).fill(0));
    series.get(k)![idx.get(r.month)!] += r.count;
    totals.set(k, (totals.get(k) ?? 0) + r.count);
    totalByMonth[idx.get(r.month)!] += r.count;
  }
  const items = [...series.entries()]
    .map(([key, byMonth]) => ({ key, total: totals.get(key) ?? 0, byMonth }))
    .sort((a, b) => b.total - a.total);
  return { months, items, totalByMonth };
}

export default async (req: Request) => {
  if (!configured()) return json(503, { error: 'The police database is not configured yet.' });
  const url = new URL(req.url);
  const view = url.searchParams.get('view') ?? '';
  const forceId = url.searchParams.get('force') || ALL;
  const month = url.searchParams.get('month') || undefined;

  try {
    switch (view) {
      case 'forces':
        return json(200, { forces: await allForces() }, true);

      case 'coverage':
        return json(200, await dataCoverage(), true);

      case 'crime-trend': {
        const rows: CrimeRow[] = await crimeByMonth(forceId);
        const p = pivot(rows, (r) => r.category);
        return json(200, { force: forceId, months: p.months, categories: p.items, totalByMonth: p.totalByMonth }, true);
      }

      case 'outcomes': {
        const rows: OutcomeRow[] = await outcomesByMonth(forceId);
        const p = pivot(rows, (r) => r.outcome_category);
        // The "justice gap": share charged vs share closed with no suspect.
        const chargeRate = p.months.map((_, i) => {
          let charged = 0, noSuspect = 0, total = p.totalByMonth[i];
          for (const it of p.items) {
            if (CHARGED.test(it.key)) charged += it.byMonth[i];
            if (NO_SUSPECT.test(it.key)) noSuspect += it.byMonth[i];
          }
          return { charged: total ? charged / total : 0, noSuspect: total ? noSuspect / total : 0 };
        });
        return json(200, { force: forceId, months: p.months, outcomes: p.items, chargeRate }, true);
      }

      case 'ss-trend': {
        const rows = await ssByMonth(forceId);
        return json(200, {
          force: forceId,
          series: rows.map((r) => ({
            month: r.month, total: r.total,
            findRate: r.find_known ? r.find_count / r.find_known : null,
          })),
        }, true);
      }

      case 'ss-dim': {
        const dimension = url.searchParams.get('dimension') || 'officer_ethnicity';
        const rows = await ssDim(forceId, dimension, month);
        return json(200, {
          force: forceId, dimension,
          values: rows.map((r) => ({
            value: r.value, count: r.count, find_count: r.find_count,
            findRate: r.count ? r.find_count / r.count : null,
          })),
        }, true);
      }

      case 'disproportionality': {
        // Officer-defined ethnicity shares of searches vs resident population
        // shares (when seeded) → a disparity ratio. Without population data we
        // still return search shares + find rates.
        const [dims, pop] = await Promise.all([
          ssDim(forceId, 'officer_ethnicity', month),
          forceId === ALL ? [] : populationByEthnicity(forceId),
        ]);
        const searchTotal = dims.reduce((s, d) => s + d.count, 0) || 1;
        const popTotal = pop.reduce((s, p) => s + p.population, 0);
        const popShare = new Map(pop.map((p) => [p.ethnicity, p.population / (popTotal || 1)]));
        const groups = dims.map((d) => {
          const searchShare = d.count / searchTotal;
          const ps = popShare.get(d.value) ?? null;
          return {
            ethnicity: d.value, searches: d.count, searchShare,
            populationShare: ps,
            disparityRatio: ps ? searchShare / ps : null,
            findRate: d.count ? d.find_count / d.count : null,
          };
        });
        return json(200, { force: forceId, month: month ?? null, hasPopulation: popTotal > 0, groups }, true);
      }

      case 'hotspots':
        return json(200, { month: month ?? null, lsoas: await lsoaHotspots(month, 50) }, true);

      case 'force-profile': {
        if (forceId === ALL) return json(400, { error: 'A force id is required.' });
        const [f, people, ss] = await Promise.all([force(forceId), forcePeople(forceId), ssByMonth(forceId)]);
        if (!f) return json(404, { error: 'Force not found in the database.' });
        return json(200, { force: f, people, ssSeries: ss.map((r) => ({ month: r.month, total: r.total })) }, true);
      }

      case 'neighbourhood': {
        const id = url.searchParams.get('id') || '';
        if (forceId === ALL || !id) return json(400, { error: 'force and id are required.' });
        const [n, priorities] = await Promise.all([neighbourhood(forceId, id), neighbourhoodPriorities(forceId, id)]);
        return json(200, { neighbourhood: n, priorities }, true);
      }

      default:
        return json(400, { error: `Unknown view "${view}".` });
    }
  } catch (err) {
    return json(502, { error: 'Database query failed.', detail: String(err) });
  }
};

export const config: Config = { path: '/api/police-db' };
