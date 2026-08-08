// Creates a Stripe Checkout session for the CanYouDo? introduction fee
// (£5 per booked hour). The cleaner's £15/hour is paid directly by the
// customer and never passes through the platform.

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
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return json({ error: 'payments_not_configured' }, 200);

  const { booking_id, origin } = await req.json().catch(() => ({}));
  if (!booking_id) return json({ error: 'missing_booking_id' }, 400);

  const rows = await sbFetch(`bookings?id=eq.${encodeURIComponent(booking_id)}&select=id,hours,hourly_rate_fee,fee_paid,booking_date`);
  const booking = rows && rows[0];
  if (!booking) return json({ error: 'booking_not_found' }, 404);
  if (booking.fee_paid) return json({ error: 'already_paid' }, 400);

  const pence = Math.round(Number(booking.hours) * Number(booking.hourly_rate_fee) * 100);
  const site = process.env.SITE_URL || origin || 'https://canyoudo.uk';

  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': String(pence),
    'line_items[0][price_data][product_data][name]': `CanYouDo? introduction fee — ${booking.hours}h clean on ${booking.booking_date}`,
    'metadata[booking_id]': booking.id,
    success_url: `${site}/customer/?paid=${booking.id}`,
    cancel_url: `${site}/customer/`,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const session = await res.json();
  if (!res.ok) return json({ error: 'stripe_error', detail: session?.error?.message }, 502);

  await sbFetch(`bookings?id=eq.${encodeURIComponent(booking.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ stripe_session_id: session.id }),
    headers: { prefer: 'return=minimal' },
  });

  return json({ url: session.url });
};
