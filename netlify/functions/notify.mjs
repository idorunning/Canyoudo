// Automatic booking notification emails, sent via Resend.
// Fails soft: if keys aren't configured yet, it reports skipped:true.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function sbFetch(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  return res.ok ? res.json().catch(() => null) : null;
}

const gbp = (n) => '£' + Number(n).toFixed(2);

function totals(b) {
  const base = Number(b.provider_hourly_rate) * Number(b.hours);
  const providerTotal = base * (1 + Number(b.urgent_uplift_pct || 0) / 100);
  const fee = providerTotal * (Number(b.platform_fee_pct) / 100);
  return { providerTotal, fee, grand: providerTotal + fee };
}

const when = (b) =>
  `${b.booking_date} at ${String(b.start_time).slice(0, 5)} (${b.hours}h) — ${b.address}, ${b.postcode}`;

const INSURANCE_NOTE =
  'A reminder: CanYouDo? is a notice board and does not provide or verify insurance. Providers carry their own independent cover — please agree insurance arrangements between yourselves before work begins.';

function buildEmails(type, b, customer, provider) {
  const site = process.env.SITE_URL || 'https://canyoudo.uk';
  const t = totals(b);
  const cFirst = (customer.full_name || 'A customer').split(' ')[0];
  const pFirst = (provider.full_name || 'your provider').split(' ')[0];
  const emails = [];

  switch (type) {
    case 'booking_created':
      emails.push({
        to: provider.email,
        subject: `New booking request — ${b.booking_date}${b.urgent ? ' (urgent)' : ''}`,
        text: `Hi ${pFirst},\n\n${cFirst} has requested a clean:\n${when(b)}\nAreas: ${b.areas_requested}\n${b.urgent ? `\nThis is flagged urgent, which includes a ${b.urgent_uplift_pct}% short-notice uplift on your rate.\n` : ''}\nYou'll be paid ${gbp(t.providerTotal)} directly by the customer.\n\nAccept or decline in your portal: ${site}/provider/\n\n${INSURANCE_NOTE}\n\n— CanYouDo?`,
      });
      emails.push({
        to: customer.email,
        subject: `Booking request sent — ${b.booking_date}`,
        text: `Hi ${cFirst},\n\nYour request has gone to ${pFirst}:\n${when(b)}\n\nYou'll pay ${pFirst} ${gbp(t.providerTotal)} directly, and our service charge of ${gbp(t.fee)} online. Total ${gbp(t.grand)}.\n\nTrack it here: ${site}/customer/\n\n${INSURANCE_NOTE}\n\n— CanYouDo?`,
      });
      break;
    case 'booking_confirmed':
      emails.push({
        to: customer.email,
        subject: `Confirmed! ${pFirst} is booked for ${b.booking_date}`,
        text: `Hi ${cFirst},\n\n${pFirst} has confirmed:\n${when(b)}\n\nPay ${pFirst} ${gbp(t.providerTotal)} directly — their payment and contact details are now on your booking: ${site}/customer/\n\n${INSURANCE_NOTE}\n\n— CanYouDo?`,
      });
      break;
    case 'booking_declined':
      emails.push({
        to: customer.email,
        subject: `Booking declined — ${b.booking_date}`,
        text: `Hi ${cFirst},\n\nUnfortunately ${pFirst} can't take this one:\n${when(b)}\n\nAny service charge you've paid will be refunded. There are plenty more providers on the board: ${site}/find-a-cleaner/\n\n— CanYouDo?`,
      });
      break;
    case 'booking_cancelled':
      emails.push({
        to: provider.email,
        subject: `Booking cancelled — ${b.booking_date}`,
        text: `Hi ${pFirst},\n\n${cFirst} has cancelled:\n${when(b)}\n\nYour portal: ${site}/provider/\n\n— CanYouDo?`,
      });
      break;
    case 'booking_completed':
      emails.push({
        to: customer.email,
        subject: 'How did it go? Leave a review',
        text: `Hi ${cFirst},\n\n${pFirst} has marked your clean as completed:\n${when(b)}\n\nPlease leave a review — it takes a minute and builds ${pFirst}'s grading: ${site}/customer/\n\nAnd don't forget to pay ${pFirst} ${gbp(t.providerTotal)} directly if you haven't already.\n\n— CanYouDo?`,
      });
      break;
  }
  return emails;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const { type, booking_id } = await req.json().catch(() => ({}));
  if (!type || !booking_id) return json({ error: 'bad_request' }, 400);

  const rows = await sbFetch(
    `bookings?id=eq.${encodeURIComponent(booking_id)}&select=*,customer:profiles!bookings_customer_id_fkey(full_name,email),provider:profiles!bookings_cleaner_id_fkey(full_name,email)`
  );
  const b = rows && rows[0];
  if (!b) return json({ ok: false, error: 'booking_not_found' }, 404);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json({ ok: false, skipped: true, reason: 'email_not_configured' });

  const from = process.env.EMAIL_FROM || 'CanYouDo? <bookings@canyoudo.uk>';
  const emails = buildEmails(type, b, b.customer || {}, b.provider || {});
  const results = await Promise.all(
    emails.filter((e) => e.to).map((e) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [e.to], subject: e.subject, text: e.text }),
      }).then((r) => r.ok)
    )
  );
  return json({ ok: true, sent: results.filter(Boolean).length });
};
