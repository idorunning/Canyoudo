import type { Config } from '@netlify/functions';

// Upserts a reader's MailerLite subscription state. Driven by the "Email me
// new articles" toggle in the account settings panel (see
// src/scripts/account/header-account.ts), and by the older sign-in bridge in
// src/lib/mailerlite-subscribe.ts. Separate from the embedded form in
// NewsletterForm.astro, which posts straight to MailerLite from the browser
// and needs no server code — this path needs a real API key, since it's a
// server-to-server upsert with no reader-facing widget.
//
//   POST /api/mailerlite-subscribe   { email, subscribe?: boolean }   → { ok: true }
//
// `subscribe` defaults to true (add to the list). Passing false updates the
// subscriber's status to "unsubscribed" so the account toggle can turn email
// off as well as on. Without MAILERLITE_API_KEY set this quietly 503s and the
// client swallows the error — sign-in itself never depends on this succeeding.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) return json(503, { error: 'Newsletter sync is not configured yet.' });

  let email = '';
  let subscribe = true;
  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (body?.subscribe === false) subscribe = false;
  } catch {
    // falls through to the validation error below
  }
  if (!EMAIL_RE.test(email)) return json(400, { error: 'A valid email address is required.' });

  const groupId = process.env.MAILERLITE_GROUP_ID;
  try {
    // The connect API's subscribers endpoint is an upsert: it creates the
    // subscriber if new, or updates the existing one. `status: unsubscribed`
    // is how a subscriber is turned off without deleting them, so a reader can
    // toggle email back on later and keep their history.
    const payload: Record<string, unknown> = { email };
    if (subscribe) {
      payload.status = 'active';
      if (groupId) payload.groups = [groupId];
    } else {
      payload.status = 'unsubscribed';
    }
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return json(res.status === 429 ? 429 : 502, { error: 'MailerLite did not accept the subscribe request.' });
    }
  } catch {
    return json(502, { error: 'Could not reach MailerLite.' });
  }

  return json(200, { ok: true });
};

export const config: Config = { path: '/api/mailerlite-subscribe' };
