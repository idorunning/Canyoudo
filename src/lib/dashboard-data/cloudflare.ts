// Cloudflare edge analytics for /dashboard/traffic.
//
// This deliberately complements GoatCounter rather than replacing it:
// GoatCounter counts browser page views; Cloudflare counts every request at
// the edge, including assets, API calls and automated traffic. The GraphQL API
// also exposes delivery and security signals that a browser counter cannot.
//
// Needs two server-only Netlify variables:
//   CLOUDFLARE_ZONE_ID
//   CLOUDFLARE_API_TOKEN (read-only Analytics access for this zone)

import type { PeriodKey } from "./goatcounter";
import { safeJson, type StatSection } from "./types";

const API = "https://api.cloudflare.com/client/v4/graphql";

type EdgeSummary = {
  requests: number;
  visits: number;
  bytes: number;
  cacheHits: number;
  cacheHitRatio: number;
  clientErrors: number;
  serverErrors: number;
  errorRate: number;
};

export type EdgePoint = { time: string; requests: number; bytes: number };
export type EdgeCount = { name: string; count: number };
export type EdgePath = { path: string; requests: number; bytes: number };
export type EdgeCountry = { code: string; count: number };
export type SecuritySummary = {
  total: number;
  actions: EdgeCount[];
  countries: EdgeCountry[];
};

export type CloudflareTraffic = {
  period: PeriodKey;
  start: string;
  end: string;
  summary: StatSection<EdgeSummary>;
  trend: StatSection<EdgePoint[]>;
  statusCodes: StatSection<EdgeCount[]>;
  cacheStatuses: StatSection<EdgeCount[]>;
  topPaths: StatSection<EdgePath[]>;
  countries: StatSection<EdgeCountry[]>;
  security: StatSection<SecuritySummary>;
};

type CfConfig = { zone: string; token: string };

const PERIOD_DAYS: Record<PeriodKey, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "12mo": 365,
};

function config(): CfConfig | null {
  const zone = process.env.CLOUDFLARE_ZONE_ID?.trim() ?? "";
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  if (!zone || !token || !/^[a-f0-9]{32}$/i.test(zone)) return null;
  return { zone, token };
}

function rangeFor(period: PeriodKey): { start: string; end: string } {
  const end = new Date();
  const start = new Date(
    end.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000,
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

function httpFilter(start: string, end: string, extra = ""): string {
  return `{ datetime_geq: "${start}", datetime_lt: "${end}", requestSource: "eyeball"${extra} }`;
}

function firewallFilter(start: string, end: string): string {
  return `{ datetime_geq: "${start}", datetime_lt: "${end}" }`;
}

function errorReason(status: number, errors: unknown): string {
  if (status === 401 || status === 403) {
    return "Cloudflare access was refused. Check that the token has read-only Analytics access for this zone.";
  }
  const messages = Array.isArray(errors)
    ? errors
        .map((e: any) => String(e?.message ?? ""))
        .filter(Boolean)
        .join(" ")
    : "";
  if (/older than|maxDuration|time range|notOlderThan/i.test(messages)) {
    return "Cloudflare does not retain this much detail on the current plan. Choose a shorter period.";
  }
  return "Cloudflare did not return this dataset for the selected period or plan.";
}

async function query(
  cf: CfConfig,
  graphql: string,
): Promise<{ ok: true; data: any } | { ok: false; reason: string }> {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cf.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: graphql }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await safeJson(res);
    if (!res.ok || body?.errors?.length) {
      return { ok: false, reason: errorReason(res.status, body?.errors) };
    }
    const zone = body?.data?.viewer?.zones?.[0];
    if (!zone)
      return {
        ok: false,
        reason: "Cloudflare returned no analytics for this zone.",
      };
    return { ok: true, data: zone };
  } catch {
    return { ok: false, reason: "Could not reach Cloudflare." };
  }
}

async function getSummary(
  cf: CfConfig,
  start: string,
  end: string,
): Promise<StatSection<EdgeSummary>> {
  const all = httpFilter(start, end);
  const hits = httpFilter(start, end, ', cacheStatus: "hit"');
  const clientErrors = httpFilter(
    start,
    end,
    ", edgeResponseStatus_geq: 400, edgeResponseStatus_lt: 500",
  );
  const serverErrors = httpFilter(
    start,
    end,
    ", edgeResponseStatus_geq: 500, edgeResponseStatus_lt: 600",
  );
  const result = await query(
    cf,
    `{
    viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
      all: httpRequestsAdaptiveGroups(filter: ${all}, limit: 1) {
        count
        sum { visits edgeResponseBytes }
      }
      hits: httpRequestsAdaptiveGroups(filter: ${hits}, limit: 1) { count }
      clientErrors: httpRequestsAdaptiveGroups(filter: ${clientErrors}, limit: 1) { count }
      serverErrors: httpRequestsAdaptiveGroups(filter: ${serverErrors}, limit: 1) { count }
    } }
  }`,
  );
  if (!result.ok) return result;

  const requests = Number(result.data.all?.[0]?.count ?? 0);
  const cacheHits = Number(result.data.hits?.[0]?.count ?? 0);
  const four = Number(result.data.clientErrors?.[0]?.count ?? 0);
  const five = Number(result.data.serverErrors?.[0]?.count ?? 0);
  return {
    ok: true,
    data: {
      requests,
      visits: Number(result.data.all?.[0]?.sum?.visits ?? 0),
      bytes: Number(result.data.all?.[0]?.sum?.edgeResponseBytes ?? 0),
      cacheHits,
      cacheHitRatio: requests > 0 ? cacheHits / requests : 0,
      clientErrors: four,
      serverErrors: five,
      errorRate: requests > 0 ? (four + five) / requests : 0,
    },
  };
}

async function getTrend(
  cf: CfConfig,
  period: PeriodKey,
  start: string,
  end: string,
): Promise<StatSection<EdgePoint[]>> {
  const dimension = period === "24h" ? "datetimeHour" : "date";
  const limit = period === "24h" ? 48 : PERIOD_DAYS[period] + 2;
  const result = await query(
    cf,
    `{
    viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
      rows: httpRequestsAdaptiveGroups(
        filter: ${httpFilter(start, end)}, limit: ${limit}, orderBy: [${dimension}_ASC]
      ) {
        count
        sum { edgeResponseBytes }
        dimensions { ${dimension} }
      }
    } }
  }`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: (result.data.rows ?? []).map((row: any) => ({
      time: String(row?.dimensions?.[dimension] ?? ""),
      requests: Number(row?.count ?? 0),
      bytes: Number(row?.sum?.edgeResponseBytes ?? 0),
    })),
  };
}

async function getBreakdown(
  cf: CfConfig,
  start: string,
  end: string,
  dimension: "edgeResponseStatus" | "cacheStatus",
  limit: number,
): Promise<StatSection<EdgeCount[]>> {
  const result = await query(
    cf,
    `{
    viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
      rows: httpRequestsAdaptiveGroups(
        filter: ${httpFilter(start, end)}, limit: ${limit}, orderBy: [count_DESC]
      ) { count dimensions { ${dimension} } }
    } }
  }`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: (result.data.rows ?? []).map((row: any) => ({
      name: String(row?.dimensions?.[dimension] ?? "Unknown"),
      count: Number(row?.count ?? 0),
    })),
  };
}

async function getTopPaths(
  cf: CfConfig,
  start: string,
  end: string,
): Promise<StatSection<EdgePath[]>> {
  const result = await query(
    cf,
    `{
    viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
      rows: httpRequestsAdaptiveGroups(
        filter: ${httpFilter(start, end)}, limit: 20, orderBy: [sum_edgeResponseBytes_DESC]
      ) {
        count
        sum { edgeResponseBytes }
        dimensions { clientRequestPath }
      }
    } }
  }`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: (result.data.rows ?? []).map((row: any) => ({
      path: String(row?.dimensions?.clientRequestPath ?? ""),
      requests: Number(row?.count ?? 0),
      bytes: Number(row?.sum?.edgeResponseBytes ?? 0),
    })),
  };
}

async function getCountries(
  cf: CfConfig,
  start: string,
  end: string,
): Promise<StatSection<EdgeCountry[]>> {
  const result = await query(
    cf,
    `{
    viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
      rows: httpRequestsAdaptiveGroups(
        filter: ${httpFilter(start, end)}, limit: 12, orderBy: [count_DESC]
      ) { count dimensions { clientCountryName } }
    } }
  }`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: (result.data.rows ?? []).map((row: any) => ({
      code: String(row?.dimensions?.clientCountryName ?? ""),
      count: Number(row?.count ?? 0),
    })),
  };
}

async function getSecurity(
  cf: CfConfig,
  start: string,
  end: string,
): Promise<StatSection<SecuritySummary>> {
  const filter = firewallFilter(start, end);
  const result = await query(
    cf,
    `{
    viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
      actions: firewallEventsAdaptiveGroups(
        filter: ${filter}, limit: 12, orderBy: [count_DESC]
      ) { count dimensions { action source } }
      countries: firewallEventsAdaptiveGroups(
        filter: ${filter}, limit: 10, orderBy: [count_DESC]
      ) { count dimensions { clientCountryName } }
    } }
  }`,
  );
  if (!result.ok) return result;

  const actions = (result.data.actions ?? []).map((row: any) => ({
    name:
      [row?.dimensions?.action, row?.dimensions?.source]
        .filter(Boolean)
        .join(" · ") || "Unknown",
    count: Number(row?.count ?? 0),
  }));
  const countries = (result.data.countries ?? []).map((row: any) => ({
    code: String(row?.dimensions?.clientCountryName ?? ""),
    count: Number(row?.count ?? 0),
  }));
  return {
    ok: true,
    data: {
      total: actions.reduce(
        (sum: number, item: EdgeCount) => sum + item.count,
        0,
      ),
      actions,
      countries,
    },
  };
}

export async function getCloudflareTraffic(
  period: PeriodKey,
): Promise<CloudflareTraffic> {
  const cf = config();
  const { start, end } = rangeFor(period);
  if (!cf) {
    const missing = {
      ok: false as const,
      reason:
        "Cloudflare is not connected yet. Set CLOUDFLARE_ZONE_ID and a read-only CLOUDFLARE_API_TOKEN in Netlify.",
    };
    return {
      period,
      start,
      end,
      summary: missing,
      trend: missing,
      statusCodes: missing,
      cacheStatuses: missing,
      topPaths: missing,
      countries: missing,
      security: missing,
    };
  }

  const [
    summary,
    trend,
    statusCodes,
    cacheStatuses,
    topPaths,
    countries,
    security,
  ] = await Promise.all([
    getSummary(cf, start, end),
    getTrend(cf, period, start, end),
    getBreakdown(cf, start, end, "edgeResponseStatus", 12),
    getBreakdown(cf, start, end, "cacheStatus", 12),
    getTopPaths(cf, start, end),
    getCountries(cf, start, end),
    getSecurity(cf, start, end),
  ]);

  return {
    period,
    start,
    end,
    summary,
    trend,
    statusCodes,
    cacheStatuses,
    topPaths,
    countries,
    security,
  };
}
