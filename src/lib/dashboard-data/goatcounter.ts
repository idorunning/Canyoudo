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

// --- Overview tile (unchanged behaviour from dashboard-stats.ts) ------------

export type TrafficStats = {
  totalPageviews: number;
  totalVisitors: number;
  topPaths: { path: string; count: number }[];
};

export async function getTrafficStats(): Promise<StatSection<TrafficStats>> {
  const gc = siteAndHeaders();
  if (!gc) return { ok: false, reason: 'GoatCounter is not connected yet.' };

  try {
    const [totalRes, hitsRes] = await Promise.all([
      fetch(`${gc.site}/api/v0/stats/total`, { headers: gc.headers }),
      fetch(`${gc.site}/api/v0/stats/hits?limit=10`, { headers: gc.headers }),
    ]);
    if (!totalRes.ok || !hitsRes.ok) return { ok: false, reason: 'GoatCounter did not return stats.' };

    const total = await safeJson(totalRes);
    const hits = await safeJson(hitsRes);
    const topPaths = Array.isArray(hits?.hits)
      ? hits.hits.slice(0, 10).map((h: any) => ({ path: h.path, count: h.count ?? 0 }))
      : [];

    return {
      ok: true,
      data: {
        totalPageviews: total?.total ?? 0,
        totalVisitors: total?.total_unique ?? 0,
        topPaths,
      },
    };
  } catch {
    return { ok: false, reason: 'Could not reach GoatCounter.' };
  }
}

// --- Traffic page detail ------------------------------------------------------
// Each widget gets its own StatSection so one endpoint drifting or 404ing
// degrades that widget alone, not the whole page.

export type DailySeries = { days: { day: string; count: number }[]; total: number; totalUnique: number };
export type PathCount = { name: string; count: number };

export type TrafficDetail = {
  daily: StatSection<DailySeries>;
  topPages: StatSection<PathCount[]>;
  referrers: StatSection<PathCount[]>;
  browsers: StatSection<PathCount[]>;
  locations: StatSection<PathCount[]>;
};

const NOT_CONNECTED = { ok: false as const, reason: 'GoatCounter is not connected yet.' };

async function statList(
  gc: { site: string; headers: Record<string, string> },
  endpoint: string,
  // hits comes back as { hits: [{ path, count }] }; the grouping endpoints as
  // { stats: [{ name/id, count }] }. Normalise both to { name, count }.
  pick: (body: any) => PathCount[]
): Promise<StatSection<PathCount[]>> {
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

async function getDaily(gc: { site: string; headers: Record<string, string> }): Promise<StatSection<DailySeries>> {
  try {
    // /stats/total returns per-day buckets in `stats` alongside the totals;
    // default range covers the last week, so ask for the last 30 days.
    const end = new Date();
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const res = await fetch(`${gc.site}/api/v0/stats/total?start=${fmt(start)}&end=${fmt(end)}`, {
      headers: gc.headers,
    });
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

export async function getTrafficDetail(): Promise<TrafficDetail> {
  const gc = siteAndHeaders();
  if (!gc) {
    return {
      daily: NOT_CONNECTED,
      topPages: NOT_CONNECTED,
      referrers: NOT_CONNECTED,
      browsers: NOT_CONNECTED,
      locations: NOT_CONNECTED,
    };
  }

  const [daily, topPages, referrers, browsers, locations] = await Promise.all([
    getDaily(gc),
    statList(gc, 'hits?limit=25', (body) =>
      Array.isArray(body?.hits) ? body.hits.map((h: any) => ({ name: h.path ?? '', count: h.count ?? 0 })) : []
    ),
    statList(gc, 'toprefs?limit=10', fromStats),
    statList(gc, 'browsers?limit=10', fromStats),
    statList(gc, 'locations?limit=10', fromStats),
  ]);

  return { daily, topPages, referrers, browsers, locations };
}
