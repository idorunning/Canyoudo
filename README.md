# CanYouDo? — canyoudo.uk

A **digital notice board** connecting customers with independent local cleaners
("service providers"). Providers publish **their own hourly rate** and are paid it
directly and in full. CanYouDo? adds a **20% service charge** on top, shown to the
customer before booking and paid separately — so our fee never comes out of the
provider's earnings.

CanYouDo? is **not** a cleaning company, employer or agency, and **does not provide,
arrange or verify insurance**. Providers are independent businesses carrying their own
independent cover; insurance is a matter for the provider and customer to discuss and
agree directly.

## Stack

| Layer | Tech |
|---|---|
| Site | [Astro](https://astro.build) (static) + vanilla JS islands |
| Auth + database | [Supabase](https://supabase.com) (Postgres with row-level security) |
| Hosting + serverless | [Netlify](https://netlify.com) (functions in `netlify/functions/`) |
| DNS | Cloudflare (domain: canyoudo.uk) |
| Payments | Stripe Checkout (service charge only — providers are paid directly) |
| Email | Resend (automatic booking notifications) |
| AI booking monitor | Anthropic API (reviews each booking, writes a summary/flag) |

## The money model (single source of truth)

- The provider sets `cleaner_details.hourly_rate`. They are paid it **directly** by the customer.
- `platform_settings.fee_pct` (default **20%**) is added on top → what the customer sees.
- `platform_settings.urgent_uplift_pct` (default 25%) is an uplift on the **provider's** rate for short-notice jobs — it goes to them, not to us.
- Both are enforced in the database: the `bookings` insert RLS policy checks the booking's rate matches the provider's published rate and that the fee/uplift match `platform_settings`. **Change rates with SQL, not in the UI.**
- No fixed prices appear anywhere in the site copy.

## What's implemented

**Public**
- Home, How it works, Pricing, Our promise, Terms, Privacy — all describing the model without fixed figures, with explicit notice-board and independent-insurance wording.
- **Directory** (`/find-a-cleaner/`) — search by area/day/grading, favourites-only filter, each card showing rate + service charge = total, grading, photos and track record.
- **Provider profile** (`/p/?id=…`) — full profile, photo gallery, availability, blocked dates, public reviews, and a booking calendar that greys out unavailable and blocked dates.

**Auth**
- Email/password sign-up (confirmation email) and **Google OAuth**, plus forgotten-password → reset flow (`/reset-password/`).
- `/auth/callback/` completes OAuth and asks first-time Google users which side of the board they're on.

**Customer** (`/customer/`)
- **Bookings** — pay the service charge, reveal provider contact/payment details on confirmation, message, cancel.
- **What I need** — the availability calendar: **rolling requests** (weekly/fortnightly/monthly on a chosen weekday) and **ad-hoc requests** (a specific date), each markable **urgent**. Posted to the open board; only the postcode is shown publicly.
- **Favourites** — save providers and rebook quickly.
- **Reviews** — star rating, headline, free text and four factual questions; published publicly like a review site.

**Provider** (`/provider/`)
- **My bookings** — accept / decline / complete, messaging, earnings.
- **Open requests** — browse the customer notice board, with an estimate of what each job pays at their own rate.
- **Holidays & time off** — block date ranges; blocked dates become unbookable.
- **Performance** — grading and month-by-month quality stats.
- **Profile** (`/provider/profile/`) — bio, area, services, years of experience, **own hourly rate** (with a live preview of what customers will see), photo gallery, **independent insurance details** (insurer, policy number, expiry — the number is never public), contact email/phone, payment instructions, and weekly availability.

**Gradings** — earned from reviews, never bought: **New → Rising Star → Trusted → Elite → Superstar**, computed in the `cleaner_directory` view from rated-job count and average rating.

Everything fails soft: with no keys configured the site still builds and shows a friendly "backend not connected" notice.

## Launch checklist

### 1. Supabase — ✅ DONE
- Project `canyoudo` (ref `gksbjshaljexlrevgedh`), region **eu-west-2 (London)**.
- Migrations `0001`–`0003` applied. The signup trigger is tested.
- **Still to do by hand:**
  - **Auth → URL Configuration:** set Site URL to your live domain, and add `<domain>/auth/callback/` and `<domain>/reset-password/` as redirect URLs.
  - **Auth → Providers → Google:** enable it and paste in a Google Cloud OAuth client ID and secret (authorised redirect URI: `https://gksbjshaljexlrevgedh.supabase.co/auth/v1/callback`). Until then the Google buttons show a friendly "not enabled yet" message.

### 2. Netlify — ✅ DEPLOYED
- Live at **https://canyoudo-web.netlify.app** (project `canyoudo-web`).
- Already set: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SITE_URL`, `SECRETS_SCAN_OMIT_KEYS`.
- **Still to add:**
  - `SUPABASE_SERVICE_ROLE_KEY` — secret key from Supabase → Project Settings → API. Required by the serverless functions (emails, Stripe, AI). Never expose to the browser.
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — see step 4
  - `RESEND_API_KEY`, `EMAIL_FROM` — see step 5
  - `ANTHROPIC_API_KEY` — see step 6
- **Connect the GitHub repo** (Site configuration → Build & deploy) so pushes to `main` deploy automatically.
- Update `SITE_URL` to `https://canyoudo.uk` once DNS is live.

> **Deploy gotcha:** Netlify reuses its build directory between deploys and uploads never
> delete files that were removed from the source. Renaming or deleting a page therefore
> leaves a stale copy behind that can break the next build. `netlify.toml` clears the known
> stale path before building; if you rename more pages, add them there or use
> "Clear cache and deploy site" in the Netlify UI.

### 3. Cloudflare (DNS for canyoudo.uk)
- `CNAME` `www` → `canyoudo-web.netlify.app` (proxy **off** / grey cloud)
- `CNAME` (or flattened `ALIAS`) `@` → `apex-loadbalancer.netlify.com`
- Add `canyoudo.uk` + `www.canyoudo.uk` in Netlify → Domain management and let it provision HTTPS.

### 4. Stripe (service charge)
1. Copy your **secret key** into `STRIPE_SECRET_KEY`.
2. Webhook endpoint `https://canyoudo.uk/api/stripe-webhook`, event `checkout.session.completed`; put the signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Until keys are set, bookings still work — the site says the charge will be invoiced separately.

### 5. Resend (booking emails)
Verify the `canyoudo.uk` domain, then set `RESEND_API_KEY` and `EMAIL_FROM="CanYouDo? <bookings@canyoudo.uk>"`.

### 6. Anthropic (AI booking monitor)
Set `ANTHROPIC_API_KEY`. Each new booking gets a one-line summary or a flag if the request looks unrealistic; it appears on the booking in both portals.

## Local development

```bash
npm install
cp .env.example .env   # fill in at least the PUBLIC_ vars
npm run dev
```
