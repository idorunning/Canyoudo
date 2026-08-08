# CanYouDo? — canyoudo.uk

The fair-pay cleaning introduction service. Customers pay a transparent **£20/hour** —
**£15/hour goes directly to the cleaner**, **£5/hour** is the CanYouDo? introduction fee,
which funds the platform and a monthly bonus pot rewarding measurably great work.

CanYouDo? is an **online introduction service** (a notice board connecting independent
cleaners with customers) — not a cleaning company or employer. Cleaners hold their own
public liability insurance; customers provide all cleaning products.

## Stack

| Layer | Tech |
|---|---|
| Site | [Astro](https://astro.build) (static) + vanilla JS islands |
| Auth + database | [Supabase](https://supabase.com) (Postgres with row-level security) |
| Hosting + serverless | [Netlify](https://netlify.com) (functions in `netlify/functions/`) |
| DNS | Cloudflare (domain: canyoudo.uk) |
| Payments | Stripe Checkout (introduction fee only — cleaners are paid directly) |
| Email | Resend (automatic booking notifications) |
| AI booking monitor | Anthropic API (Claude reviews each booking, writes a summary/flag) |

## What's implemented

- **Marketing pages** — home, how it works, pricing (with the £15/£5 split and bonus table), our promise, terms (introduction-service model), privacy.
- **Auth** — email/password signup as *customer* or *cleaner* (Supabase Auth; a DB trigger creates the profile row).
- **Cleaner portal** (`/cleaner/`) — booking requests with accept / decline / complete, per-booking messaging, monthly performance + bonus table, earnings stats.
- **Cleaner profile** (`/cleaner/profile/`) — bio, service area, services, weekly availability grid, **insurance details** (insurer, policy number, expiry → drives the public "Insured" badge; the number itself is never public), and payment instructions (shown only to customers with a confirmed booking).
- **Directory** (`/find-a-cleaner/`) — searchable by area/day, shows factual track record (on-time %, areas-completed %, average rating).
- **Booking flow** — date/time/hours, requested areas, notes; availability warning; automatic emails to both sides; AI review; Stripe Checkout for the introduction fee.
- **Customer portal** (`/customer/`) — bookings, pay fee, cleaner payment details, messaging, cancel, and **factual ratings** (on time? areas cleaned? instructions followed? professional?) that drive bonuses.
- **Bonuses** — computed in SQL (`cleaner_monthly_stats`): with ≥4 rated jobs/month — 100% on-time £20, ≥95% areas £20, ≥4.5★ £10 (max £50/month).

Everything fails soft: with no keys configured the site still builds and shows a friendly "backend not connected" notice.

## Launch checklist

### 1. Supabase (auth + database)
1. Create a project at [database.new](https://database.new) (region: **eu-west-2 London**), name `canyoudo`.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
3. In **Auth → URL Configuration** set Site URL to `https://canyoudo.uk`.
4. Copy the project URL and publishable (anon) key into Netlify env vars (below).

### 2. Netlify (hosting)
1. New site → import this GitHub repo (`idorunning/Canyoudo`). Build command and publish dir come from `netlify.toml`.
2. Environment variables (Site settings → Environment):
   - `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — from step 1 (safe to expose)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — service role key (secret! functions only)
   - `SITE_URL` = `https://canyoudo.uk`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — see step 4
   - `RESEND_API_KEY`, `EMAIL_FROM` — see step 5
   - `ANTHROPIC_API_KEY` — see step 6
3. Add custom domain `canyoudo.uk` (Netlify will show the DNS records needed).

### 3. Cloudflare (DNS for canyoudo.uk)
In the Cloudflare dashboard for canyoudo.uk → DNS:
- `CNAME` `www` → `<your-site>.netlify.app` (proxy **off**/grey cloud, per Netlify's guidance)
- `CNAME` (or `ALIAS`/flattened `CNAME`) `@` → `apex-loadbalancer.netlify.com`
- In Netlify → Domain management, add `canyoudo.uk` + `www.canyoudo.uk` and let Netlify provision HTTPS.

### 4. Stripe (introduction fee payments)
1. Create a Stripe account → copy the **secret key** into `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint: `https://canyoudo.uk/api/stripe-webhook`, event `checkout.session.completed`; copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Until keys are set, bookings still work — the site says the fee will be invoiced separately.

### 5. Resend (booking emails)
1. Create a [Resend](https://resend.com) account, verify the `canyoudo.uk` domain (they'll give you Cloudflare DNS records).
2. Set `RESEND_API_KEY` and `EMAIL_FROM="CanYouDo? <bookings@canyoudo.uk>"`.

### 6. Anthropic (AI booking monitor)
Set `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com). Each new booking is reviewed by Claude (Haiku — fractions of a penny per booking) which writes a one-line summary or flags problems; it appears on the booking in both portals.

## Local development

```bash
npm install
cp .env.example .env   # fill in at least the PUBLIC_ vars
npm run dev
```

## Business rules (single source of truth)

- Customer rate **£20/h** = cleaner **£15/h** (paid directly, never through the platform) + fee **£5/h** (Stripe).
- Customers provide all cleaning products and equipment.
- Ratings are factual booleans + overall stars; bonuses need ≥4 rated jobs in a calendar month.
- Rates are enforced in the DB (`bookings` RLS insert policy pins 15.00/5.00) — change them with a migration, not in the UI.
