-- Reader profile: optional name, role, location and area of interest,
-- entered from the account panel in the header. Powers the personalised
-- greeting ("Good morning, Nathan") for signed-in readers. Every field is
-- optional — a reader who never opens the panel simply gets the
-- name-less greeting.
--
-- Owner-only via RLS, mirroring saved_articles: a reader can only see and
-- edit their own row. The browser talks to this table directly with the
-- anon key + the reader's session JWT.
--
-- Idempotent: safe to paste into the Supabase SQL editor more than once.

create table if not exists reader_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  name        text,
  role        text,
  location    text,
  interest    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table reader_profiles enable row level security;

drop policy if exists reader_profiles_select on reader_profiles;
create policy reader_profiles_select on reader_profiles
  for select using (auth.uid() = user_id);

drop policy if exists reader_profiles_insert on reader_profiles;
create policy reader_profiles_insert on reader_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists reader_profiles_update on reader_profiles;
create policy reader_profiles_update on reader_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
