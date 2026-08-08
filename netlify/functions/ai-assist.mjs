// AI booking monitor: reviews each new booking with Claude, writes a short
// friendly summary onto the booking, and flags anything that needs a human
// look (impossible timings, missing access info, safety concerns).
// Fails soft when ANTHROPIC_API_KEY isn't configured.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function sbFetch(path, init = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res.ok ? res.json().catch(() => null) : null;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ ok: false, skipped: true, reason: 'ai_not_configured' });

  const { action, booking_id } = await req.json().catch(() => ({}));
  if (action !== 'review_booking' || !booking_id) return json({ error: 'bad_request' }, 400);

  const rows = await sbFetch(
    `bookings?id=eq.${encodeURIComponent(booking_id)}&select=id,booking_date,start_time,hours,postcode,areas_requested,notes`
  );
  const b = rows && rows[0];
  if (!b) return json({ ok: false, error: 'booking_not_found' }, 404);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:
        'You review cleaning bookings for CanYouDo?, a UK cleaning introduction service. Respond with ONE sentence (max 25 words), no preamble. If the requested areas look like far too much work for the booked hours, or access/instructions are unclear, say so helpfully; otherwise give a brief cheerful summary of the job. Never invent details.',
      messages: [
        {
          role: 'user',
          content: `Booking: ${b.booking_date} ${String(b.start_time).slice(0, 5)}, ${b.hours} hours, postcode ${b.postcode}. Areas requested: ${b.areas_requested}. Notes: ${b.notes || '(none)'}`,
        },
      ],
    }),
  });
  if (!res.ok) return json({ ok: false, error: 'ai_error' }, 502);
  const data = await res.json();
  const summary = (data.content?.[0]?.text || '').trim().slice(0, 300);
  if (summary) {
    await sbFetch(`bookings?id=eq.${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ai_summary: summary }),
      headers: { prefer: 'return=minimal' },
    });
  }
  return json({ ok: true, summary });
};
