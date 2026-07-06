// Data for the /dashboard admin page: traffic, email subscribers, reader
// sign-ups, pulled from services already used elsewhere on the site
// (GoatCounter analytics, MailerLite newsletter, Supabase reader accounts).
//
// Same convention as src/lib/police-db.ts: if a service isn't configured,
// its section quietly reports "not connected yet" instead of throwing, so a
// missing API key never takes down the whole page.

export type StatSection<T> = { ok: true; data: T } | { ok: false; reason: string };

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// --- Traffic (GoatCounter) ---------------------------------------------------
// Needs GOATCOUNTER_API_TOKEN, generated at https://<site>.goatcounter.com/user/api
// (Settings → API). PUBLIC_GOATCOUNTER_URL already holds the site's count
// endpoint, e.g. https://thinkingaboutpolicing.goatcounter.com/count.

export type TrafficStats = {
  totalPageviews: number;
  totalVisitors: number;
  topPaths: { path: string; count: number }[];
};

export async function getTrafficStats(): Promise<StatSection<TrafficStats>> {
  const token = process.env.GOATCOUNTER_API_TOKEN;
  const countUrl = process.env.PUBLIC_GOATCOUNTER_URL;
  if (!token || !countUrl) return { ok: false, reason: 'GoatCounter is not connected yet.' };

  const site = countUrl.replace(/\/count\/?$/, '');
  const headers = { authorization: `Bearer ${token}` };

  try {
    const [totalRes, hitsRes] = await Promise.all([
      fetch(`${site}/api/v0/stats/total`, { headers }),
      fetch(`${site}/api/v0/stats/hits?limit=10`, { headers }),
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

// --- Email subscribers (MailerLite) -----------------------------------------
// Reuses MAILERLITE_API_KEY (already set for netlify/functions/mailerlite-subscribe.mts).

export type SubscriberStats = { activeCount: number };

export async function getSubscriberStats(): Promise<StatSection<SubscriberStats>> {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) return { ok: false, reason: 'MailerLite is not connected yet.' };

  try {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers?filter[status]=active&limit=1', {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false, reason: 'MailerLite did not return subscriber stats.' };
    const body = await safeJson(res);
    const activeCount = body?.meta?.total ?? body?.total ?? 0;
    return { ok: true, data: { activeCount } };
  } catch {
    return { ok: false, reason: 'Could not reach MailerLite.' };
  }
}

// --- Reader sign-ups (Supabase auth) ----------------------------------------
// Needs SUPABASE_SERVICE_ROLE_KEY — server-side only, never sent to the
// browser (same rule as the GitHub Action ingest script that already uses it).

export type SignupStats = { totalUsers: number };

export async function getSignupStats(): Promise<StatSection<SignupStats>> {
  const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, reason: 'Supabase sign-up counts are not connected yet.' };

  try {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) return { ok: false, reason: 'Supabase did not return sign-up stats.' };
    // GoTrue doesn't return a total count directly; the paginated response's
    // headers carry it, but fetch() lowercases and exposes them here.
    const total = res.headers.get('x-total-count');
    if (total) return { ok: true, data: { totalUsers: Number(total) } };
    const body = await safeJson(res);
    const users = Array.isArray(body?.users) ? body.users : [];
    return { ok: true, data: { totalUsers: users.length } };
  } catch {
    return { ok: false, reason: 'Could not reach Supabase.' };
  }
}
