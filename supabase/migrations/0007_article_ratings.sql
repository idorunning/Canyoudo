-- Community star ratings, aggregated per article on the existing engagement
-- row (0002). Same write model as views/shares: the browser can only call the
-- RPC below, which validates the value and adjusts the aggregate — it can
-- never set a raw sum or count. Reads stay public via the existing
-- article_engagement_read policy.
--
-- Re-rating: the article page remembers the reader's previous star in
-- localStorage and passes it as p_prev, so the sum adjusts without the count
-- double-counting the same reader. (A hand-crafted call can skew the sum;
-- accepted — the same trust level as increment_article_view.)
--
-- Idempotent: safe to paste into the Supabase SQL editor more than once.

alter table article_engagement
  add column if not exists rating_sum   bigint not null default 0,
  add column if not exists rating_count bigint not null default 0;

create or replace function rate_article(p_slug text, p_rating int, p_prev int default null)
returns table (rating_sum bigint, rating_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be 1-5';
  end if;
  if p_prev is not null and (p_prev < 1 or p_prev > 5) then
    p_prev := null;
  end if;

  insert into article_engagement (slug, rating_sum, rating_count)
  values (p_slug, p_rating, 1)
  on conflict (slug) do update
    set rating_sum   = article_engagement.rating_sum + p_rating - coalesce(p_prev, 0),
        rating_count = article_engagement.rating_count + case when p_prev is null then 1 else 0 end,
        updated_at   = now();

  return query
    select ae.rating_sum, ae.rating_count
    from article_engagement ae
    where ae.slug = p_slug;
end;
$$;

revoke all on function rate_article(text, int, int) from public;
grant execute on function rate_article(text, int, int) to anon, authenticated;
