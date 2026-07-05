-- Monthly homepage poll: one vote tally per (month, choice), keyed by the
-- poll's month string (e.g. "2026-07") and a lower-cased choice label.
-- Mirrors article_engagement (0002): the only write path is a single RPC
-- that adds exactly 1 to one counter, so a visitor's browser can never set
-- an arbitrary value or touch another month/choice directly. Reads are
-- public — an opinion tally isn't sensitive.
--
-- Idempotent: safe to paste into the Supabase SQL editor more than once.

create table if not exists monthly_poll_votes (
  month      text not null,
  choice     text not null,
  votes      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, choice)
);

alter table monthly_poll_votes enable row level security;

drop policy if exists monthly_poll_votes_read on monthly_poll_votes;
create policy monthly_poll_votes_read on monthly_poll_votes for select using (true);

create or replace function increment_poll_vote(p_month text, p_choice text)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into monthly_poll_votes (month, choice, votes)
  values (p_month, p_choice, 1)
  on conflict (month, choice) do update
    set votes = monthly_poll_votes.votes + 1,
        updated_at = now()
  returning votes;
$$;

revoke all on function increment_poll_vote(text, text) from public;
grant execute on function increment_poll_vote(text, text) to anon, authenticated;
