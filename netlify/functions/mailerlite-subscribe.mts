import type { Config } from '@netlify/functions';

// Upserts a reader into MailerLite when they tick the "add me to the email
// list" checkbox on the sign-in form (see src/lib/mailerlite-subscribe.ts).
// Separate from the embedded form in NewsletterForm.astro, which posts
// straight to MailerLite from the browser and needs no server code — this
// path needs a real API key, since it's a server-to-server upsert with no
// reader-facing form for MailerLite's own widget to render.
//
//   POST /api/mailerlite-subscribe   { email }   → { ok: true }
//
// Without MAILERLITE_API_KEY set, this quietly 503s and the client swallows
// the error — sign-in itself never depends on this succeeding.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) return json(503, { error: 'Newsletter sync is not configured yet.' });

  let email = '';
  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    // falls through to the validation error below
  }
  if (!EMAIL_RE.test(email)) return json(400, { error: 'A valid email address is required.' });

  const groupId = process.env.MAILERLITE_GROUP_ID;
  try {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email, ...(groupId ? { groups: [groupId] } : {}) }),
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
