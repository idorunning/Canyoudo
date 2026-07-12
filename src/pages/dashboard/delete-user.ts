// Admin-only endpoint that deletes a reader account by id. Guarded by the same
// session cookie as every /dashboard page — never callable without a valid
// admin session — and only reachable by POST from the Audience table's
// per-row delete form. On success (or a soft failure) it redirects back to
// /dashboard/audience with a short flash message in the query string, so the
// admin sees the outcome without a client-side script.
export const prerender = false;

import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, isValidSession } from '../../lib/admin-auth';
import { deleteReader } from '../../lib/dashboard-data/supabase-admin';

const back = (params: Record<string, string>) =>
  new Response(null, {
    status: 303,
    headers: { location: `/dashboard/audience?${new URLSearchParams(params).toString()}` },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isValidSession(cookies.get(ADMIN_COOKIE)?.value)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const userId = String(form.get('userId') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  if (!userId) return back({ deleted: 'error', reason: 'No user selected.' });

  const result = await deleteReader(userId);
  if (!result.ok) return back({ deleted: 'error', reason: result.reason });

  return back({ deleted: 'ok', email });
};

// A stray GET (e.g. someone pasting the URL) just bounces back to the table.
export const GET: APIRoute = () => back({});
