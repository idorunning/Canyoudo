// MailerLite newsletter stats for /dashboard and /dashboard/newsletter.
// Reuses MAILERLITE_API_KEY (already set for netlify/functions/mailerlite-subscribe.mts).
// 3 calls per page view against a 120 req/min limit — nowhere near it.

import { safeJson, type StatSection } from './types';

const API = 'https://connect.mailerlite.com/api';

function headers(): Record<string, string> | null {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) return null;
  return { accept: 'application/json', authorization: `Bearer ${apiKey}` };
}

// --- Overview tile (unchanged behaviour from dashboard-stats.ts) ------------

export type SubscriberStats = { activeCount: number };

export async function getSubscriberStats(): Promise<StatSection<SubscriberStats>> {
  const h = headers();
  if (!h) return { ok: false, reason: 'MailerLite is not connected yet.' };

  try {
    const res = await fetch(`${API}/subscribers?filter[status]=active&limit=1`, { headers: h });
    if (!res.ok) return { ok: false, reason: 'MailerLite did not return subscriber stats.' };
    const body = await safeJson(res);
    const activeCount = body?.meta?.total ?? body?.total ?? 0;
    return { ok: true, data: { activeCount } };
  } catch {
    return { ok: false, reason: 'Could not reach MailerLite.' };
  }
}

// --- Newsletter page detail ---------------------------------------------------

export type Subscriber = {
  email: string;
  name: string;
  status: string;
  subscribedAt: string; // ISO-ish datetime, '' when unknown
};

export type GrowthBucket = { month: string; count: number }; // month = 'YYYY-MM'

export type NewsletterDetail = {
  recent: StatSection<{ subscribers: Subscriber[]; growth: GrowthBucket[] }>;
  groups: StatSection<{ name: string; activeCount: number }[]>;
  campaigns: StatSection<
    { name: string; finishedAt: string; sent: number; openRate: number; clickRate: number }[]
  >;
};

const NOT_CONNECTED = { ok: false as const, reason: 'MailerLite is not connected yet.' };

async function getRecentAndGrowth(h: Record<string, string>): Promise<NewsletterDetail['recent']> {
  try {
    const res = await fetch(`${API}/subscribers?limit=50&sort=-subscribed_at`, { headers: h });
    if (!res.ok) return { ok: false, reason: 'MailerLite did not return the subscriber list.' };
    const body = await safeJson(res);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];

    const subscribers: Subscriber[] = rows.map((s) => ({
      email: s.email ?? '',
      name: [s.fields?.name, s.fields?.last_name].filter(Boolean).join(' '),
      status: s.status ?? '',
      subscribedAt: s.subscribed_at ?? s.created_at ?? '',
    }));

    // 12-month growth from this (recent-first) window. With ≤50 signups a
    // year the buckets are complete; beyond that the oldest month shown is a
    // floor, which is fine for a trend bar.
    const growth = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      growth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    for (const s of subscribers) {
      const month = s.subscribedAt.slice(0, 7);
      if (growth.has(month)) growth.set(month, (growth.get(month) ?? 0) + 1);
    }

    return {
      ok: true,
      data: {
        subscribers,
        growth: [...growth.entries()].map(([month, count]) => ({ month, count })),
      },
    };
  } catch {
    return { ok: false, reason: 'Could not reach MailerLite.' };
  }
}

async function getGroups(h: Record<string, string>): Promise<NewsletterDetail['groups']> {
  try {
    const res = await fetch(`${API}/groups?limit=25`, { headers: h });
    if (!res.ok) return { ok: false, reason: 'MailerLite did not return groups.' };
    const body = await safeJson(res);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    return {
      ok: true,
      data: rows.map((g) => ({ name: g.name ?? '', activeCount: g.active_count ?? 0 })),
    };
  } catch {
    return { ok: false, reason: 'Could not reach MailerLite.' };
  }
}

async function getCampaigns(h: Record<string, string>): Promise<NewsletterDetail['campaigns']> {
  try {
    const res = await fetch(`${API}/campaigns?filter[status]=sent&limit=10`, { headers: h });
    if (!res.ok) return { ok: false, reason: 'MailerLite did not return campaigns.' };
    const body = await safeJson(res);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    return {
      ok: true,
      data: rows.map((c) => {
        const stats = c.stats ?? {};
        return {
          name: c.name ?? '',
          finishedAt: c.finished_at ?? '',
          sent: stats.sent ?? 0,
          // The API reports rates as fractions inside { float } wrappers.
          openRate: stats.open_rate?.float ?? 0,
          clickRate: stats.click_rate?.float ?? 0,
        };
      }),
    };
  } catch {
    return { ok: false, reason: 'Could not reach MailerLite.' };
  }
}

export async function getNewsletterDetail(): Promise<NewsletterDetail> {
  const h = headers();
  if (!h) return { recent: NOT_CONNECTED, groups: NOT_CONNECTED, campaigns: NOT_CONNECTED };

  const [recent, groups, campaigns] = await Promise.all([
    getRecentAndGrowth(h),
    getGroups(h),
    getCampaigns(h),
  ]);
  return { recent, groups, campaigns };
}
