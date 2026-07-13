// Server-side Supabase reads for the admin dashboard. This is the only file
// that may use SUPABASE_SERVICE_ROLE_KEY: the service role bypasses the
// owner-only RLS on reader_profiles/saved_articles, so nothing here may ever
// be imported into client-side code or passed into a <script define:vars>.

import { safeJson, type StatSection } from './types';

function supabaseAdmin(): { url: string; headers: Record<string, string> } | null {
  const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url: url.replace(/\/$/, ''),
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  };
}

// --- Overview tile (unchanged behaviour from dashboard-stats.ts) ------------

export type SignupStats = { totalUsers: number };

export async function getSignupStats(): Promise<StatSection<SignupStats>> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: 'Supabase sign-up counts are not connected yet.' };

  try {
    const res = await fetch(`${sb.url}/auth/v1/admin/users?per_page=1`, { headers: sb.headers });
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

// --- Reader list (GoTrue users joined with reader_profiles) -------------------

export type Reader = {
  id: string;
  email: string;
  provider: string;
  createdAt: string;
  lastSignInAt: string;
  name: string;
  role: string;
  location: string;
  interest: string;
  subscribed: boolean | null;
};

export type ReaderSummary = {
  total: number;
  newThisMonth: number;
  subscribedPct: number; // of readers with an explicit true
  byProvider: { name: string; count: number }[];
  byRole: { name: string; count: number }[];
  byInterest: { name: string; count: number }[];
  truncated: boolean; // hit the pagination cap
};

const PER_PAGE = 100;
const MAX_PAGES = 10; // 1,000 users — far beyond this site's scale; guards a runaway loop

function tally(values: (string | undefined | null)[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export async function listReaders(): Promise<StatSection<{ readers: Reader[]; summary: ReaderSummary }>> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: 'Supabase reader data is not connected yet.' };

  try {
    const users: any[] = [];
    let truncated = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`${sb.url}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`, {
        headers: sb.headers,
      });
      if (!res.ok) return { ok: false, reason: 'Supabase did not return the user list.' };
      const body = await safeJson(res);
      const batch = Array.isArray(body?.users) ? body.users : [];
      users.push(...batch);
      if (batch.length < PER_PAGE) break;
      if (page === MAX_PAGES) truncated = true;
    }

    const profRes = await fetch(
      `${sb.url}/rest/v1/reader_profiles?select=user_id,name,role,location,interest,subscribed`,
      { headers: { ...sb.headers, Range: '0-4999' } }
    );
    // Profiles are optional decoration on the auth records — if the table is
    // missing (migration not applied) the reader list still renders.
    const profiles: any[] = profRes.ok ? ((await safeJson(profRes)) ?? []) : [];
    const bySlugId = new Map(profiles.map((p) => [p.user_id, p]));

    const readers: Reader[] = users
      .map((u) => {
        const p = bySlugId.get(u.id) ?? {};
        return {
          id: u.id ?? '',
          email: u.email ?? '',
          provider: u.app_metadata?.provider ?? 'email',
          createdAt: u.created_at ?? '',
          lastSignInAt: u.last_sign_in_at ?? '',
          name: p.name ?? '',
          role: p.role ?? '',
          location: p.location ?? '',
          interest: p.interest ?? '',
          subscribed: typeof p.subscribed === 'boolean' ? p.subscribed : null,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const newThisMonth = readers.filter((r) => r.createdAt && new Date(r.createdAt) >= monthStart).length;
    const subscribedCount = readers.filter((r) => r.subscribed === true).length;

    return {
      ok: true,
      data: {
        readers,
        summary: {
          total: readers.length,
          newThisMonth,
          subscribedPct: readers.length ? Math.round((subscribedCount / readers.length) * 100) : 0,
          byProvider: tally(readers.map((r) => r.provider)),
          byRole: tally(readers.map((r) => r.role)),
          byInterest: tally(readers.map((r) => r.interest)),
          truncated,
        },
      },
    };
  } catch {
    return { ok: false, reason: 'Could not reach Supabase.' };
  }
}

// The overview page's "recent sign-ups" list only needs one small page.
export async function getRecentSignups(limit = 5): Promise<StatSection<{ email: string; createdAt: string }[]>> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: 'Supabase sign-up data is not connected yet.' };

  try {
    // GoTrue's admin listing is newest-first.
    const res = await fetch(`${sb.url}/auth/v1/admin/users?page=1&per_page=${limit}`, { headers: sb.headers });
    if (!res.ok) return { ok: false, reason: 'Supabase did not return recent sign-ups.' };
    const body = await safeJson(res);
    const users = Array.isArray(body?.users) ? body.users : [];
    return {
      ok: true,
      data: users
        .map((u: any) => ({ email: u.email ?? '', createdAt: u.created_at ?? '' }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit),
    };
  } catch {
    return { ok: false, reason: 'Could not reach Supabase.' };
  }
}

// --- Reader deletion (admin action) -------------------------------------------
// Hard-deletes a GoTrue user by id. Every reader-owned table references
// auth.users with ON DELETE CASCADE, so this also removes their profile, saved
// articles, folders, etc. in one step (same mechanism as the self-service
// /api/delete-account function, but driven by the admin rather than the user).
// Only ever called from the admin-gated /dashboard/delete-user endpoint.

export type DeleteResult = { ok: true } | { ok: false; reason: string };

export async function deleteReader(userId: string): Promise<DeleteResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: 'Supabase is not connected.' };
  if (!/^[0-9a-fA-F-]{36}$/.test(userId)) return { ok: false, reason: 'Invalid user id.' };

  try {
    const res = await fetch(`${sb.url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: sb.headers,
    });
    if (!res.ok) return { ok: false, reason: 'Supabase would not delete that user.' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not reach Supabase.' };
  }
}

// --- Saved-article counts -----------------------------------------------------

export async function getSavedArticleCounts(): Promise<StatSection<Map<string, number>>> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: 'Supabase saved-article data is not connected yet.' };

  try {
    // Count per slug in JS rather than a PostgREST aggregate (which needs a
    // server-side config flag). Fine at personal-site scale.
    const res = await fetch(`${sb.url}/rest/v1/saved_articles?select=slug`, {
      headers: { ...sb.headers, Range: '0-4999' },
    });
    if (!res.ok) return { ok: false, reason: 'Supabase did not return saved articles.' };
    const rows: any[] = (await safeJson(res)) ?? [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row?.slug) counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
    }
    return { ok: true, data: counts };
  } catch {
    return { ok: false, reason: 'Could not reach Supabase.' };
  }
}

// --- Article engagement (views, shares, ratings) ------------------------------
// The table is public-read, but reuse the same admin headers for consistency.
// rating_sum/rating_count only exist after migration 0007 — select * so the
// query works either way and the columns default to 0 when absent.

export type Engagement = {
  viewCount: number;
  shareCount: number;
  ratingSum: number;
  ratingCount: number;
};

export async function getEngagement(): Promise<StatSection<Map<string, Engagement>>> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: 'Supabase engagement data is not connected yet.' };

  try {
    const res = await fetch(`${sb.url}/rest/v1/article_engagement?select=*`, {
      headers: { ...sb.headers, Range: '0-4999' },
    });
    if (!res.ok) return { ok: false, reason: 'Supabase did not return engagement data.' };
    const rows: any[] = (await safeJson(res)) ?? [];
    const bySlug = new Map<string, Engagement>();
    for (const row of rows) {
      if (!row?.slug) continue;
      bySlug.set(row.slug, {
        viewCount: Number(row.view_count ?? 0),
        shareCount: Number(row.share_count ?? 0),
        ratingSum: Number(row.rating_sum ?? 0),
        ratingCount: Number(row.rating_count ?? 0),
      });
    }
    return { ok: true, data: bySlug };
  } catch {
    return { ok: false, reason: 'Could not reach Supabase.' };
  }
}
