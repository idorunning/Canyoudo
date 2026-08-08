-- ============================================================
-- CanYouDo? — marketplace expansion
--   * providers set their own hourly rate; the platform adds a
--     percentage fee on top (customer sees the combined total)
--   * customer availability-wanted requests (rolling / ad-hoc / urgent)
--   * provider holiday blocking
--   * favourites, public reviews, grading tiers
--   * richer provider profiles (photos, insurance, contact details)
-- ============================================================

-- ---------- provider profile ----------
alter table public.cleaner_details
  add column hourly_rate numeric(6, 2),
  add column contact_email text,
  add column contact_phone text,
  add column photos text[] not null default '{}',
  add column avatar_url text,
  add column insurance_doc_url text,
  add column years_experience smallint;

-- ---------- platform fee ----------
-- Single source of truth for the percentage added on top of the
-- provider's own rate. Changing it here changes it everywhere.
create table public.platform_settings (
  id boolean primary key default true check (id),
  fee_pct numeric(5, 2) not null default 20.00,
  urgent_uplift_pct numeric(5, 2) not null default 25.00
);
insert into public.platform_settings (id) values (true);
grant select on public.platform_settings to anon, authenticated;
alter table public.platform_settings enable row level security;
create policy "platform_settings_read" on public.platform_settings for select using (true);

-- ---------- bookings: rate snapshot + request types ----------
drop policy "bookings_insert_customer" on public.bookings;

alter table public.bookings
  drop column hourly_rate_cleaner,
  drop column hourly_rate_fee;

alter table public.bookings
  add column provider_hourly_rate numeric(6, 2) not null default 0,
  add column platform_fee_pct numeric(5, 2) not null default 20.00,
  add column urgent boolean not null default false,
  add column urgent_uplift_pct numeric(5, 2) not null default 0,
  add column booking_type text not null default 'one_off'
    check (booking_type in ('one_off', 'rolling', 'ad_hoc')),
  add column recurrence text
    check (recurrence is null or recurrence in ('weekly', 'fortnightly', 'monthly'));

-- Customers may only book a provider at that provider's published rate,
-- with the platform fee taken from platform_settings.
create policy "bookings_insert_customer" on public.bookings
  for insert with check (
    auth.uid() = customer_id
    and status = 'pending'
    and fee_paid = false
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer')
    and exists (
      select 1 from public.cleaner_details cd
      join public.profiles p on p.id = cd.profile_id and p.role = 'cleaner'
      where cd.profile_id = cleaner_id
        and cd.hourly_rate is not null
        and cd.hourly_rate = provider_hourly_rate
    )
    and platform_fee_pct = (select fee_pct from public.platform_settings where id)
    and (
      (urgent = false and urgent_uplift_pct = 0)
      or (urgent = true and urgent_uplift_pct = (select urgent_uplift_pct from public.platform_settings where id))
    )
  );

-- ---------- provider holidays / blocked dates ----------
create table public.provider_unavailability (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaner_details (profile_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index provider_unavailability_idx on public.provider_unavailability (cleaner_id, start_date);

alter table public.provider_unavailability enable row level security;
create policy "unavailability_own" on public.provider_unavailability
  for all using (auth.uid() = cleaner_id) with check (auth.uid() = cleaner_id);
create policy "unavailability_public_read" on public.provider_unavailability
  for select using (true);

-- ---------- customer requests (the notice board itself) ----------
create table public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  request_type text not null check (request_type in ('rolling', 'ad_hoc')),
  recurrence text check (recurrence is null or recurrence in ('weekly', 'fortnightly', 'monthly')),
  weekday smallint check (weekday is null or weekday between 0 and 6),
  preferred_date date,
  start_time time,
  hours numeric(3, 1) not null check (hours >= 1 and hours <= 8),
  postcode text not null,
  areas_requested text not null,
  notes text not null default '',
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  created_at timestamptz not null default now(),
  -- a rolling request repeats on a weekday; an ad-hoc request names a date
  check (
    (request_type = 'rolling' and weekday is not null)
    or (request_type = 'ad_hoc' and preferred_date is not null)
  )
);
create index customer_requests_open_idx on public.customer_requests (status, created_at desc);

alter table public.customer_requests enable row level security;
create policy "requests_own" on public.customer_requests
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);
-- providers browse the open board (address is never posted, only postcode)
create policy "requests_providers_read_open" on public.customer_requests
  for select using (
    status = 'open'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cleaner')
  );

-- ---------- favourites ----------
create table public.favourites (
  customer_id uuid not null references public.profiles (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, cleaner_id)
);
alter table public.favourites enable row level security;
create policy "favourites_own" on public.favourites
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

-- ---------- reviews: make them public, Google-review style ----------
alter table public.ratings
  add column title text not null default '',
  add column published boolean not null default true;

-- Public, read-only review feed. Reviewer shown as first name + initial.
create view public.provider_reviews
with (security_invoker = off) as
select
  rt.cleaner_id,
  rt.booking_id,
  rt.overall,
  rt.title,
  rt.comment,
  rt.arrived_on_time,
  rt.completed_requested_areas,
  rt.followed_instructions,
  rt.friendly_professional,
  rt.created_at,
  case
    when position(' ' in trim(p.full_name)) > 0
      then split_part(trim(p.full_name), ' ', 1) || ' ' || left(split_part(trim(p.full_name), ' ', 2), 1) || '.'
    else p.full_name
  end as reviewer_name
from public.ratings rt
join public.profiles p on p.id = rt.customer_id
where rt.published;

grant select on public.provider_reviews to anon, authenticated;

-- ============================================================
-- Directory rebuilt: adds rate + fee maths, grading tier,
-- photos, contact availability and review counts.
--
-- Grading tiers (earned, never bought):
--   New · Rising Star · Trusted · Elite · Superstar
-- ============================================================
drop view public.cleaner_directory;

create view public.cleaner_directory
with (security_invoker = off) as
select
  cd.profile_id,
  case
    when position(' ' in trim(p.full_name)) > 0
      then split_part(trim(p.full_name), ' ', 1) || ' ' || left(split_part(trim(p.full_name), ' ', 2), 1) || '.'
    else p.full_name
  end as display_name,
  cd.bio,
  cd.service_area,
  cd.services,
  cd.photos,
  cd.avatar_url,
  cd.years_experience,
  cd.hourly_rate,
  s.fee_pct,
  case when cd.hourly_rate is null then null
       else round(cd.hourly_rate * (1 + s.fee_pct / 100.0), 2) end as customer_total_rate,
  (cd.insurer_name is not null and cd.policy_number is not null
    and (cd.policy_expiry is null or cd.policy_expiry >= current_date)) as insurance_on_file,
  coalesce(r.jobs, 0) as jobs_done,
  coalesce(r.on_time_pct, 0) as on_time_pct,
  coalesce(r.areas_pct, 0) as areas_pct,
  coalesce(r.avg_rating, 0) as avg_rating,
  coalesce(r.review_count, 0) as review_count,
  case
    when coalesce(r.jobs, 0) >= 50 and coalesce(r.avg_rating, 0) >= 4.8 then 'Superstar'
    when coalesce(r.jobs, 0) >= 25 and coalesce(r.avg_rating, 0) >= 4.6 then 'Elite'
    when coalesce(r.jobs, 0) >= 10 and coalesce(r.avg_rating, 0) >= 4.3 then 'Trusted'
    when coalesce(r.jobs, 0) >= 3  and coalesce(r.avg_rating, 0) >= 4.0 then 'Rising Star'
    else 'New'
  end as grading,
  coalesce(f.fav_count, 0) as favourite_count,
  coalesce(a.slots, '[]'::jsonb) as availability,
  coalesce(u.blocks, '[]'::jsonb) as blocked_dates
from public.cleaner_details cd
join public.profiles p on p.id = cd.profile_id and p.role = 'cleaner'
cross join (select fee_pct from public.platform_settings where id) s
left join lateral (
  select
    count(*)::int as jobs,
    100.0 * avg((arrived_on_time)::int) as on_time_pct,
    100.0 * avg((completed_requested_areas)::int) as areas_pct,
    avg(overall)::numeric(3, 2) as avg_rating,
    count(*) filter (where length(comment) > 0)::int as review_count
  from public.ratings rt where rt.cleaner_id = cd.profile_id
) r on true
left join lateral (
  select count(*)::int as fav_count from public.favourites fv where fv.cleaner_id = cd.profile_id
) f on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'weekday', av.weekday, 'start_time', av.start_time, 'end_time', av.end_time
  ) order by av.weekday) as slots
  from public.availability av where av.cleaner_id = cd.profile_id
) a on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'start_date', un.start_date, 'end_date', un.end_date
  ) order by un.start_date) as blocks
  from public.provider_unavailability un
  where un.cleaner_id = cd.profile_id and un.end_date >= current_date
) u on true;

grant select on public.cleaner_directory to anon, authenticated;

-- ---------- monthly performance (no cash figures; quality only) ----------
drop view public.cleaner_monthly_stats;

create view public.cleaner_monthly_stats
with (security_invoker = on) as
select
  rt.cleaner_id,
  date_trunc('month', b.booking_date)::date as month,
  count(*)::int as jobs,
  100.0 * avg((rt.arrived_on_time)::int) as on_time_pct,
  100.0 * avg((rt.completed_requested_areas)::int) as areas_pct,
  avg(rt.overall)::numeric(3, 2) as avg_overall,
  (count(*) >= 4
    and avg((rt.arrived_on_time)::int) = 1
    and avg((rt.completed_requested_areas)::int) >= 0.95
    and avg(rt.overall) >= 4.5) as bonus_qualified
from public.ratings rt
join public.bookings b on b.id = rt.booking_id
group by rt.cleaner_id, date_trunc('month', b.booking_date);

grant select on public.cleaner_monthly_stats to authenticated;

-- ---------- provider contact details, released on a confirmed booking ----------
create or replace function public.get_provider_contact(bid uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'payment_details', cd.payment_details,
    'contact_email', cd.contact_email,
    'contact_phone', cd.contact_phone,
    'insurer_name', cd.insurer_name,
    'policy_expiry', cd.policy_expiry
  )
  from public.bookings b
  join public.cleaner_details cd on cd.profile_id = b.cleaner_id
  where b.id = bid
    and b.customer_id = auth.uid()
    and b.status in ('confirmed', 'completed');
$$;

revoke execute on function public.get_provider_contact(uuid) from anon;
revoke execute on function public.get_cleaner_payment_details(uuid) from anon;
