import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL || '';
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

let client = null;

/** Returns a shared Supabase client, or null when the backend isn't configured yet. */
export function getClient() {
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

export function isConfigured() {
  return Boolean(url && key);
}

/** Show a friendly banner on app pages when Supabase isn't wired up yet. */
export function requireBackend(containerId = 'app') {
  if (isConfigured()) return true;
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML =
      '<div class="notice notice-warn"><strong>Almost there.</strong> The booking system backend isn\'t connected yet — the site owner needs to add the Supabase project keys. Everything else is ready to go.</div>';
  }
  return false;
}

export async function getProfile(client) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { session: null, profile: null };
  const { data: profile } = await client
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return { session, profile };
}

export async function portalPathFor(client, user) {
  const { data } = await client.from('profiles').select('role').eq('id', user.id).single();
  return data?.role === 'cleaner' ? '/cleaner/' : '/customer/';
}

/** Redirect to login unless signed in; returns {session, profile} when signed in. */
export async function requireAuth(role) {
  const c = getClient();
  if (!c) return null;
  const { session, profile } = await getProfile(c);
  if (!session) {
    window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname);
    return null;
  }
  if (role && profile?.role !== role) {
    window.location.href = profile?.role === 'cleaner' ? '/cleaner/' : '/customer/';
    return null;
  }
  return { client: c, session, profile };
}

export const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export const RATES = { customer: 20, cleaner: 15, fee: 5 };

export function fmtDate(d) {
  return new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** Fire-and-forget call to a serverless helper; failures are silent by design. */
export function api(path, body) {
  return fetch('/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => ({ ok: false }));
}
