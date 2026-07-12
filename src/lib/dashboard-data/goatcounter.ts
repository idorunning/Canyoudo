// GoatCounter traffic stats for /dashboard and /dashboard/traffic.
// Needs GOATCOUNTER_API_TOKEN, generated at https://<site>.goatcounter.com/user/api
// (Settings → API). PUBLIC_GOATCOUNTER_URL already holds the site's count
// endpoint, e.g. https://thinkingaboutpolicing.goatcounter.com/count.

import { safeJson, type StatSection } from './types';

function siteAndHeaders(): { site: string; headers: Record<string, string> } | null {
  const token = process.env.GOATCOUNTER_API_TOKEN;
  const countUrl = process.env.PUBLIC_GOATCOUNTER_URL;
  if (!token || !countUrl) return null;
  return {
    site: countUrl.replace(/\/count\/?$/, ''),
    headers: { authorization: `Bearer ${token}` },
  };
}

// --- Time periods -------------------------------------------------------------
// Every detail widget can be scoped to a window. GoatCounter's stats endpoints
// all accept start=/end= (YYYY-MM-DD); we derive them from a small named set so
// the UI and the API stay in lock-step.

export type PeriodKey = '24h' | '7d' | '30d' | '12mo';

export const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: '24h', label: 'Last 24 hours', days: 1 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '12mo', label: 'Last 12 months', days: 365 },
];

export const DEFAULT_PERIOD: PeriodKey = '30d';

export function resolvePeriod(raw: string | null | undefined): PeriodKey {
  return PERIODS.some((p) => p.key === raw) ? (raw as PeriodKey) : DEFAULT_PERIOD;
}

function rangeFor(period: PeriodKey): { start: string; end: string; days: number } {
  const days = PERIODS.find((p) => p.key === period)?.days ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end), days };
}

// --- Traffic detail -----------------------------------------------------------
// Each widget gets its own StatSection so one endpoint drifting or 404ing
// degrades that widget alone, not the whole page.

export type DailySeries = { days: { day: string; count: number }[]; total: number; totalUnique: number };
export type PathCount = { name: string; count: number };
// Locations additionally carry the ISO country code so the UI can show a flag.
export type GeoCount = { name: string; count: number; code: string };

export type TrafficDetail = {
  period: PeriodKey;
  daily: StatSection<DailySeries>;
  topPages: StatSection<PathCount[]>;
  referrers: StatSection<PathCount[]>;
  browsers: StatSection<PathCount[]>;
  locations: StatSection<GeoCount[]>;
};

const NOT_CONNECTED = { ok: false as const, reason: 'GoatCounter is not connected yet.' };

async function statList<T>(
  gc: { site: string; headers: Record<string, string> },
  endpoint: string,
  // hits comes back as { hits: [{ path, count }] }; the grouping endpoints as
  // { stats: [{ name/id, count }] }. Normalise both via the caller's picker.
  pick: (body: any) => T[]
): Promise<StatSection<T[]>> {
  try {
    const res = await fetch(`${gc.site}/api/v0/stats/${endpoint}`, { headers: gc.headers });
    if (!res.ok) return { ok: false, reason: `GoatCounter did not return ${endpoint.split('?')[0]} stats.` };
    const body = await safeJson(res);
    return { ok: true, data: pick(body) };
  } catch {
    return { ok: false, reason: 'Could not reach GoatCounter.' };
  }
}

function fromStats(body: any): PathCount[] {
  return Array.isArray(body?.stats)
    ? body.stats.map((s: any) => ({ name: s.name ?? s.id ?? '', count: s.count ?? 0 }))
    : [];
}

async function getDaily(
  gc: { site: string; headers: Record<string, string> },
  range: { start: string; end: string }
): Promise<StatSection<DailySeries>> {
  try {
    // /stats/total returns per-day buckets in `stats` alongside the totals.
    const res = await fetch(
      `${gc.site}/api/v0/stats/total?start=${range.start}&end=${range.end}`,
      { headers: gc.headers }
    );
    if (!res.ok) return { ok: false, reason: 'GoatCounter did not return daily stats.' };
    const body = await safeJson(res);
    const days = Array.isArray(body?.stats)
      ? body.stats.map((s: any) => ({
          day: String(s.day ?? '').slice(0, 10),
          count: s.daily ?? s.count ?? 0,
        }))
      : [];
    return {
      ok: true,
      data: { days, total: body?.total ?? 0, totalUnique: body?.total_unique ?? 0 },
    };
  } catch {
    return { ok: false, reason: 'Could not reach GoatCounter.' };
  }
}

export async function getTrafficDetail(period: PeriodKey = DEFAULT_PERIOD): Promise<TrafficDetail> {
  const gc = siteAndHeaders();
  if (!gc) {
    return {
      period,
      daily: NOT_CONNECTED,
      topPages: NOT_CONNECTED,
      referrers: NOT_CONNECTED,
      browsers: NOT_CONNECTED,
      locations: NOT_CONNECTED,
    };
  }

  const { start, end } = rangeFor(period);
  const win = `start=${start}&end=${end}`;

  const [daily, topPages, referrers, browsers, locations] = await Promise.all([
    getDaily(gc, { start, end }),
    statList<PathCount>(gc, `hits?limit=25&${win}`, (body) =>
      Array.isArray(body?.hits) ? body.hits.map((h: any) => ({ name: h.path ?? '', count: h.count ?? 0 })) : []
    ),
    statList<PathCount>(gc, `toprefs?limit=10&${win}`, fromStats),
    statList<PathCount>(gc, `browsers?limit=10&${win}`, fromStats),
    statList<GeoCount>(gc, `locations?limit=12&${win}`, (body) =>
      Array.isArray(body?.stats)
        ? body.stats.map((s: any) => ({ name: s.name ?? '', count: s.count ?? 0, code: String(s.id ?? '') }))
        : []
    ),
  ]);

  return { period, daily, topPages, referrers, browsers, locations };
}
