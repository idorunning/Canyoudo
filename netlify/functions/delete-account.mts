import type { Config } from '@netlify/functions';

// Permanently deletes a signed-in reader's account and all of their data.
// Driven by the "Delete account" button in the account settings panel
// (see src/scripts/account/header-account.ts).
//
//   POST /api/delete-account   Authorization: Bearer <reader access token>
//     → { ok: true }
//
// Flow:
//   1. Verify the caller's Supabase access token by asking the auth server who
//      it belongs to. A forged or expired token yields no user → 401.
//   2. Delete that user with the service-role key via the auth admin API. Every
//      reader-owned table (reader_profiles, saved_articles, saved_papers,
//      folders, paper_folders, …) references auth.users with ON DELETE CASCADE,
//      so removing the user removes their rows in one step.
//
// The service-role key never leaves the server. Without it (or the Supabase
// URL) configured this 503s and the client surfaces a "not available" message —
// nothing is half-deleted.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return json(503, { error: 'Account deletion is not configured.' });
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(401, { error: 'Sign in first.' });

  // 1. Resolve the token to a user id.
  let userId = '';
  try {
    const who = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    });
    if (!who.ok) return json(401, { error: 'Session is not valid — sign in again.' });
    const user = await who.json();
    userId = typeof user?.id === 'string' ? user.id : '';
  } catch {
    return json(502, { error: 'Could not verify your session.' });
  }
  if (!userId) return json(401, { error: 'Session is not valid — sign in again.' });

  // 2. Hard-delete the user (cascades to all their data).
  try {
    const del = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    if (!del.ok) return json(502, { error: 'Could not delete the account — try again.' });
  } catch {
    return json(502, { error: 'Could not reach the account service.' });
  }

  return json(200, { ok: true });
};

export const config: Config = { path: '/api/delete-account' };
