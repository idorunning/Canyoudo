-- Reader library: articles saved for later, per signed-in reader. Uses the
-- same Supabase auth as the research assistant and data tools, so the one
-- sign-in covers saved papers, briefings AND saved articles.
--
-- Owner-only via RLS, mirroring saved_papers: a reader can only see and edit
-- their own rows. The browser talks to this table directly with the anon key +
-- the reader's session JWT.
--
-- Idempotent: safe to paste into the Supabase SQL editor more than once.

create table if not exists saved_articles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  slug        text not null,
  section     text not null,
  title       text not null,
  description text,
  saved_at    timestamptz not null default now(),
  unique (user_id, slug)
);

alter table saved_articles enable row level security;

drop policy if exists saved_articles_select on saved_articles;
create policy saved_articles_select on saved_articles
  for select using (auth.uid() = user_id);

drop policy if exists saved_articles_insert on saved_articles;
create policy saved_articles_insert on saved_articles
  for insert with check (auth.uid() = user_id);

drop policy if exists saved_articles_delete on saved_articles;
create policy saved_articles_delete on saved_articles
  for delete using (auth.uid() = user_id);

create index if not exists saved_articles_user_idx
  on saved_articles (user_id, saved_at desc);
