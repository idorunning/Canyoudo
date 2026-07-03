-- Article engagement counters: a view count and a share count per article,
-- keyed by slug. Backs the homepage "Most read" list (real page views instead
-- of a hand-curated slug list) and the per-article share count shown next to
-- the share buttons.
--
-- Writes never go through a public UPDATE grant. A browser can only call the
-- two RPCs below, each of which adds exactly 1 to one counter for one slug —
-- it can never set an arbitrary value or touch another table. Reads are public
-- (a popularity count isn't sensitive), same as the police-database tables.
--
-- Idempotent: safe to paste into the Supabase SQL editor more than once.

create table if not exists article_engagement (
  slug        text primary key,
  view_count  bigint not null default 0,
  share_count bigint not null default 0,
  updated_at  timestamptz not null default now()
);

alter table article_engagement enable row level security;

drop policy if exists article_engagement_read on article_engagement;
create policy article_engagement_read on article_engagement for select using (true);

create or replace function increment_article_view(p_slug text)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into article_engagement (slug, view_count)
  values (p_slug, 1)
  on conflict (slug) do update
    set view_count = article_engagement.view_count + 1,
        updated_at = now()
  returning view_count;
$$;

create or replace function increment_article_share(p_slug text)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into article_engagement (slug, share_count)
  values (p_slug, 1)
  on conflict (slug) do update
    set share_count = article_engagement.share_count + 1,
        updated_at = now()
  returning share_count;
$$;

revoke all on function increment_article_view(text) from public;
revoke all on function increment_article_share(text) from public;
grant execute on function increment_article_view(text) to anon, authenticated;
grant execute on function increment_article_share(text) to anon, authenticated;
