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
  coverage: {
    httpStart: string;
    securityStart: string;
    httpLimited: boolean;
    securityLimited: boolean;
  };
  summary: StatSection<EdgeSummary>;
  trend: StatSection<EdgePoint[]>;
  statusCodes: StatSection<EdgeCount[]>;
  cacheStatuses: StatSection<EdgeCount[]>;
  topPaths: StatSection<EdgePath[]>;
  countries: StatSection<EdgeCountry[]>;
  security: StatSection<SecuritySummary>;
};

type CfConfig = { zone: string; token: string };
type DatasetLimit = {
  enabled: boolean;
  maxDuration: number;
  notOlderThan: number;
};
type DatasetLimits = {
  http: DatasetLimit | null;
  firewall: DatasetLimit | null;
};

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

function boundedRange(
  requestedStart: string,
  end: string,
  limit: DatasetLimit | null,
): { start: string; limited: boolean } {
  if (!limit?.enabled) return { start: requestedStart, limited: false };
  const requested = Date.parse(requestedStart);
  const endTime = Date.parse(end);
  const durationFloor =
    limit.maxDuration > 0 ? endTime - limit.maxDuration * 1000 + 60_000 : requested;
  const retentionFloor =
    limit.notOlderThan > 0 ? Date.now() - limit.notOlderThan * 1000 + 60_000 : requested;
  const actual = Math.max(requested, durationFloor, retentionFloor);
  return { start: new Date(actual).toISOString(), limited: actual > requested + 1000 };
}

function httpFilter(start: string, end: string, extra = ""): string {
  // This dashboard reports every edge request. Do not require the optional
  // requestSource filter: Cloudflare exposes filter fields per zone and plan,
  // and rejecting one optional field otherwise takes down every HTTP dataset.
  return `{ datetime_geq: "${start}", datetime_lt: "${end}"${extra} }`;
}

function firewallFilter(start: string, end: string): string {
  return `{ datetime_geq: "${start}", datetime_lt: "${end}" }`;
}

function errorReason(status: number, errors: unknown): string {
  const messages = Array.isArray(errors)
    ? errors
        .map((e: any) => String(e?.message ?? ""))
        .filter(Boolean)
        .join(" ")
    : "";
  if (
    status === 401 ||
    status === 403 ||
    /permission|not authorised|not authorized|access denied|does not have access/i.test(messages)
  ) {
    return "Cloudflare access was refused. Check that the token has Zone Analytics: Read permission for this zone.";
  }
  if (/older than|maxDuration|time range|notOlderThan/i.test(messages)) {
    return "Cloudflare does not retain this much detail on the current plan. Choose a shorter period.";
  }
  if (/cannot query field|unknown argument|field .* is not available/i.test(messages)) {
    return "Cloudflare does not expose one of the requested analytics fields for this zone or plan.";
  }
  if (/zone|dataset.*not enabled|not enabled.*dataset/i.test(messages)) {
    return "Cloudflare Analytics is not enabled for this zone or dataset.";
  }
  return "Cloudflare returned an analytics error for this dataset.";
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

async function getDatasetLimits(cf: CfConfig): Promise<DatasetLimits | null> {
  const result = await query(
    cf,
    `{
      viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
        settings {
          httpRequestsAdaptiveGroups { enabled maxDuration notOlderThan }
          firewallEventsAdaptive { enabled maxDuration notOlderThan }
        }
      } }
    }`,
  );
  if (!result.ok) return null;
  const normalise = (value: any): DatasetLimit | null =>
    value
      ? {
          enabled: Boolean(value.enabled),
          maxDuration: Number(value.maxDuration ?? 0),
          notOlderThan: Number(value.notOlderThan ?? 0),
        }
      : null;
  return {
    http: normalise(result.data.settings?.httpRequestsAdaptiveGroups),
    firewall: normalise(result.data.settings?.firewallEventsAdaptive),
  };
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
  enabled = true,
): Promise<StatSection<SecuritySummary>> {
  if (!enabled) {
    return {
      ok: false,
      reason: "Cloudflare Security Events is not enabled for this zone or plan.",
    };
  }

  const result = await query(
    cf,
    `{
      viewer { zones(filter: { zoneTag: "${cf.zone}" }) {
        rows: firewallEventsAdaptive(
          filter: ${firewallFilter(start, end)}, limit: 5000, orderBy: [datetime_DESC]
        ) { action source clientCountryName }
      } }
    }`,
  );
  if (!result.ok) return result;

  const actionCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const rows = result.data.rows ?? [];
  for (const row of rows) {
    const action =
      [row?.action, row?.source].filter(Boolean).join(" · ") || "Unknown";
    const country = String(row?.clientCountryName ?? "");
    actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
    if (country) countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
  }

  const byCount = (a: { count: number }, b: { count: number }) =>
    b.count - a.count;
  return {
    ok: true,
    data: {
      total: rows.length,
      actions: [...actionCounts].map(([name, count]) => ({ name, count })).sort(byCount).slice(0, 12),
      countries: [...countryCounts].map(([code, count]) => ({ code, count })).sort(byCount).slice(0, 10),
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
      coverage: {
        httpStart: start,
        securityStart: start,
        httpLimited: false,
        securityLimited: false,
      },
      summary: missing,
      trend: missing,
      statusCodes: missing,
      cacheStatuses: missing,
      topPaths: missing,
      countries: missing,
      security: missing,
    };
  }

  const limits = await getDatasetLimits(cf);
  const httpRange = boundedRange(start, end, limits?.http ?? null);
  const securityRange = boundedRange(start, end, limits?.firewall ?? null);

  const [
    summary,
    trend,
    statusCodes,
    cacheStatuses,
    topPaths,
    countries,
    security,
  ] = await Promise.all([
    getSummary(cf, httpRange.start, end),
    getTrend(cf, period, httpRange.start, end),
    getBreakdown(cf, httpRange.start, end, "edgeResponseStatus", 12),
    getBreakdown(cf, httpRange.start, end, "cacheStatus", 12),
    getTopPaths(cf, httpRange.start, end),
    getCountries(cf, httpRange.start, end),
    getSecurity(cf, securityRange.start, end, limits?.firewall?.enabled ?? true),
  ]);

  return {
    period,
    start,
    end,
    coverage: {
      httpStart: httpRange.start,
      securityStart: securityRange.start,
      httpLimited: httpRange.limited,
      securityLimited: securityRange.limited,
    },
    summary,
    trend,
    statusCodes,
    cacheStatuses,
    topPaths,
    countries,
    security,
  };
}
