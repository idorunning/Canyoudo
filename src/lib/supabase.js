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
      '<div class="notice notice-warn"><strong>Almost there.</strong> The booking system backend isn\'t connected yet — the site owner needs to add the Supabase project keys.</div>';
  }
  return false;
}

export async function getProfile(c) {
  const { data: { session } } = await c.auth.getSession();
  if (!session) return { session: null, profile: null };
  const { data: profile } = await c.from('profiles').select('*').eq('id', session.user.id).single();
  return { session, profile };
}

export async function portalPathFor(c, user) {
  const { data } = await c.from('profiles').select('role').eq('id', user.id).single();
  return data?.role === 'cleaner' ? '/provider/' : '/customer/';
}

/** Redirect to login unless signed in; optionally enforce a role. */
export async function requireAuth(role) {
  const c = getClient();
  if (!c) return null;
  const { session, profile } = await getProfile(c);
  if (!session) {
    window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname);
    return null;
  }
  if (role && profile?.role !== role) {
    window.location.href = profile?.role === 'cleaner' ? '/provider/' : '/customer/';
    return null;
  }
  return { client: c, session, profile };
}

/** Sign in with Google. Requires the Google provider to be enabled in Supabase. */
export async function signInWithGoogle(role) {
  const c = getClient();
  if (!c) return;
  // `role` is only a hint for first-time sign-ups; the DB trigger reads it.
  const redirectTo = window.location.origin + '/auth/callback/' + (role ? '?role=' + role : '');
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  return error;
}

export const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const money = (n) => (n === null || n === undefined ? '—' : GBP.format(Number(n)));

/** Provider rate + platform fee = what the customer sees. */
export function customerRate(providerRate, feePct) {
  return Number(providerRate) * (1 + Number(feePct) / 100);
}

export function bookingTotals(b) {
  const hours = Number(b.hours);
  const base = Number(b.provider_hourly_rate) * hours;
  const urgent = base * (Number(b.urgent_uplift_pct || 0) / 100);
  const providerTotal = base + urgent;
  const fee = providerTotal * (Number(b.platform_fee_pct) / 100);
  return { base, urgent, providerTotal, fee, grandTotal: providerTotal + fee };
}

export const GRADINGS = ['New', 'Rising Star', 'Trusted', 'Elite', 'Superstar'];

export function gradingBadge(g) {
  const cls = { 'New': 'badge-grey', 'Rising Star': 'badge-green', 'Trusted': 'badge-green', 'Elite': 'badge-amber', 'Superstar': 'badge-star' }[g] || 'badge-grey';
  const icon = { 'Superstar': '★', 'Elite': '◆', 'Trusted': '✓', 'Rising Star': '▲', 'New': '•' }[g] || '';
  return `<span class="badge ${cls}">${icon} ${g}</span>`;
}

export function stars(n) {
  const full = Math.round(Number(n));
  return '<span class="stars" aria-label="' + full + ' out of 5">' + '★'.repeat(full) + '<span class="dim">' + '★'.repeat(5 - full) + '</span></span>';
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtDate(d) {
  return new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function api(path, body) {
  return fetch('/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => ({ ok: false }));
}

/** Is a date inside any of the provider's blocked (holiday) ranges? */
export function isBlocked(dateStr, blocks) {
  return (blocks || []).some((b) => dateStr >= b.start_date && dateStr <= b.end_date);
}
