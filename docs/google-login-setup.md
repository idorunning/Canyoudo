# Setting up "Sign in with Google" + saved papers

This guide gets the star-a-paper feature working on /research. It takes about
25 minutes, costs nothing, and you only do it once. Until it's done, the site
simply hides the sign-in button — nothing is broken meanwhile.

**What you're building:** a free [Supabase](https://supabase.com) account
(it provides the login system and a small database for saved papers), plus a
Google "OAuth client" (the thing that makes the "Sign in with Google" popup
work). Then you paste two values into Netlify and redeploy.

---

## Part 1 — Create the Supabase project (5 min)

1. Go to [supabase.com](https://supabase.com) and sign up (your normal email
   is fine — you can even sign up *with* Google).
2. Click **New project**.
   - Name: `thinkingaboutpolicing` (anything works)
   - Database password: make one up and **save it somewhere** (you rarely
     need it again, but you can't view it later)
   - Region: **West EU (London)**
3. Wait 2–3 minutes while it sets up.
4. Once it's ready, note your **Project URL**: go to **Project Settings**
   (gear icon, bottom left) → **API**. You'll see:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string of letters
   Keep this tab open; you'll need both at the end.

## Part 2 — Create the Google OAuth client (10 min)

This is the part that makes the Google popup work. You do it in Google's
developer console — it's free and doesn't need a credit card.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   sign in with your Google account.
2. At the top, click the project dropdown → **New project**. Name it
   `Thinking About Policing` → **Create** → make sure it's selected.
3. In the search bar at the top, type **OAuth consent screen** and open it.
   - Choose **External** → **Create**
   - App name: `Thinking About Policing`
   - User support email: your email
   - Developer contact email: your email
   - Click **Save and continue** through the remaining steps (you can skip
     scopes and test users) → **Back to dashboard**
4. In the search bar, type **Credentials** and open it (under "APIs &
   Services").
5. Click **+ Create credentials** → **OAuth client ID**.
   - Application type: **Web application**
   - Name: `Supabase login`
   - Under **Authorised JavaScript origins**, click **+ Add URI** and add:
     - `https://thinkingaboutpolicing.org`
     - your Supabase Project URL from Part 1 (e.g. `https://abcdefgh.supabase.co`)
   - Under **Authorised redirect URIs**, click **+ Add URI** and add:
     - your Supabase Project URL **plus** `/auth/v1/callback` — e.g.
       `https://abcdefgh.supabase.co/auth/v1/callback`
   - Click **Create**.
6. A box appears with a **Client ID** and **Client secret**. Copy both
   (you can always come back to Credentials to see them again).

## Part 3 — Connect Google to Supabase (3 min)

1. Back in Supabase: **Authentication** (left sidebar) → **Sign In / Providers**.
2. Find **Google** and turn it on.
3. Paste in the **Client ID** and **Client secret** from Part 2 → **Save**.
4. Still in Authentication, open **URL Configuration**:
   - **Site URL**: `https://thinkingaboutpolicing.org`
   - **Redirect URLs** → add: `https://thinkingaboutpolicing.org/*`
   - *(Optional, for testing deploy previews: also add
     `https://*--thinkingaboutpolicing.netlify.app/**` — replace with your
     actual Netlify site name.)*

## Part 4 — Create the saved-papers tables (2 min)

1. In Supabase, open the **SQL Editor** (left sidebar) → **New query**.
2. Paste ALL of this in, then click **Run**:

```sql
-- Folders: the reader's "research aims" — each saved paper can sit in one.
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.saved_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  doi text,
  url text,
  source text,
  year int,
  venue text,
  note text,
  folder_id uuid references public.folders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- One row per paper per user (when the paper has a DOI).
create unique index saved_papers_user_doi
  on public.saved_papers (user_id, doi) where doi is not null;

-- Row-level security: each signed-in user can only ever see, add, edit and
-- remove their OWN saved papers and folders. Enforced by the database itself.
alter table public.saved_papers enable row level security;
alter table public.folders enable row level security;

create policy "read own"   on public.saved_papers
  for select using (auth.uid() = user_id);
create policy "insert own" on public.saved_papers
  for insert with check (auth.uid() = user_id);
create policy "update own" on public.saved_papers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.saved_papers
  for delete using (auth.uid() = user_id);

create policy "read own folders"   on public.folders
  for select using (auth.uid() = user_id);
create policy "insert own folders" on public.folders
  for insert with check (auth.uid() = user_id);
create policy "update own folders" on public.folders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own folders" on public.folders
  for delete using (auth.uid() = user_id);
```

3. It should say "Success. No rows returned". Done.

## Part 4½ — Email sign-in (1 min, optional but recommended)

Besides Google, the site offers "Sign in with email" — a one-click link sent
to any address, with no password. This covers people on work computers
(police.gov.uk and the like) who can't use a personal Google account there.

1. In Supabase: **Authentication** → **Sign In / Providers** → **Email**.
2. Make sure it's **enabled** (it is by default) → Save.
3. *(Optional)* **Authentication** → **Email Templates** → edit the
   **Magic Link** subject to `Your sign-in link for Thinking About Policing`.

Supabase sends these emails itself on the free plan (capped at a handful per
hour, which is plenty). Nothing else to configure.

## Part 5 — Tell Netlify about it (3 min)

1. In Netlify: **Site configuration** → **Environment variables** →
   **Add a variable**, twice:

   | Key | Value |
   |---|---|
   | `PUBLIC_SUPABASE_URL` | your Project URL (e.g. `https://abcdefgh.supabase.co`) |
   | `PUBLIC_SUPABASE_ANON_KEY` | the **anon public** key |

   (These two are *designed* to be public — the database's row-level
   security from Part 4 is what protects the data, not secrecy of the key.)

2. Trigger a redeploy: **Deploys** → **Trigger deploy** → **Deploy site**.

## Try it

Open `/research`, click **Sign in with Google to save papers**, approve the
popup, and star a result. Open the **Saved** tab: your papers are there — and
on any device you sign in on. From there you can sort papers into folders
(one per research aim), add a note to each, and export the lot as a copyable
reference list or a `.ris` file for Zotero/EndNote/Mendeley.

## If something doesn't work

- **Popup opens then errors about redirect_uri** — the redirect URI in
  Part 2 step 5 doesn't exactly match `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
- **Signs in but bounces back signed out** — check Part 3 step 4 (Site URL
  and Redirect URLs).
- **No sign-in button at all** — the two Netlify env vars aren't set, or
  you haven't redeployed since setting them.
- **Google warns "app isn't verified"** — normal for a personal OAuth app;
  click "Advanced" → continue. Verification is only needed past 100 users.

## One free-tier note

Supabase's free plan pauses the database after **7 days with no activity**
(any visitor signing in or loading saved papers counts as activity). If it
pauses, the Supabase dashboard has a one-click **Restore** — searches on
/research keep working regardless, only sign-in/saving sleeps.
