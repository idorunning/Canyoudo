// Automatic booking notification emails, sent via Resend.
// Fails soft: if keys aren't configured yet, it simply reports skipped:true.

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

const fmt = (b) =>
  `${b.booking_date} at ${String(b.start_time).slice(0, 5)} (${b.hours}h) — ${b.address}, ${b.postcode}`;

function buildEmails(type, b, customer, cleaner) {
  const site = process.env.SITE_URL || 'https://canyoudo.uk';
  const feeAmount = (Number(b.hours) * Number(b.hourly_rate_fee)).toFixed(2);
  const payAmount = (Number(b.hours) * Number(b.hourly_rate_cleaner)).toFixed(2);
  const cFirst = (customer.full_name || 'A customer').split(' ')[0];
  const pFirst = (cleaner.full_name || 'your cleaner').split(' ')[0];
  const emails = [];

  switch (type) {
    case 'booking_created':
      emails.push({
        to: cleaner.email,
        subject: `New booking request — ${b.booking_date}`,
        text: `Hi ${pFirst},\n\n${cFirst} has requested a clean:\n${fmt(b)}\nAreas: ${b.areas_requested}\n\nYou'll be paid £${payAmount} directly by the customer on the day (they provide all products).\n\nAccept or decline in your portal: ${site}/cleaner/\n\n— CanYouDo?`,
      });
      emails.push({
        to: customer.email,
        subject: `Booking request sent — ${b.booking_date}`,
        text: `Hi ${cFirst},\n\nYour request has been sent to ${pFirst}:\n${fmt(b)}\n\nYou'll pay ${pFirst} £${payAmount} directly on the day, and the £${feeAmount} introduction fee online. Remember: you provide all cleaning products.\n\nTrack it here: ${site}/customer/\n\n— CanYouDo?`,
      });
      break;
    case 'booking_confirmed':
      emails.push({
        to: customer.email,
        subject: `Confirmed! ${pFirst} is booked for ${b.booking_date}`,
        text: `Hi ${cFirst},\n\n${pFirst} has confirmed your clean:\n${fmt(b)}\n\nPay ${pFirst} £${payAmount} directly on the day — payment details are on your booking: ${site}/customer/\n\n— CanYouDo?`,
      });
      break;
    case 'booking_declined':
      emails.push({
        to: customer.email,
        subject: `Booking declined — ${b.booking_date}`,
        text: `Hi ${cFirst},\n\nUnfortunately ${pFirst} can't make this one:\n${fmt(b)}\n\nAny paid introduction fee will be refunded. Plenty more great cleaners here: ${site}/find-a-cleaner/\n\n— CanYouDo?`,
      });
      break;
    case 'booking_cancelled':
      emails.push({
        to: cleaner.email,
        subject: `Booking cancelled — ${b.booking_date}`,
        text: `Hi ${pFirst},\n\n${cFirst} has cancelled the booking:\n${fmt(b)}\n\nYour portal: ${site}/cleaner/\n\n— CanYouDo?`,
      });
      break;
    case 'booking_completed':
      emails.push({
        to: customer.email,
        subject: `How did it go? Rate your clean`,
        text: `Hi ${cFirst},\n\n${pFirst} has marked your clean as completed:\n${fmt(b)}\n\nPlease rate the visit (it takes 30 seconds and decides ${pFirst}'s quality bonus): ${site}/customer/\n\nAnd don't forget to pay ${pFirst} £${payAmount} directly if you haven't already.\n\n— CanYouDo?`,
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
    `bookings?id=eq.${encodeURIComponent(booking_id)}&select=*,customer:profiles!bookings_customer_id_fkey(full_name,email),cleaner:profiles!bookings_cleaner_id_fkey(full_name,email)`
  );
  const b = rows && rows[0];
  if (!b) return json({ ok: false, error: 'booking_not_found' }, 404);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json({ ok: false, skipped: true, reason: 'email_not_configured' });

  const from = process.env.EMAIL_FROM || 'CanYouDo? <bookings@canyoudo.uk>';
  const emails = buildEmails(type, b, b.customer || {}, b.cleaner || {});
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
