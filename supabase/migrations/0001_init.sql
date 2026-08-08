-- ============================================================
-- CanYouDo? — initial schema
-- Fair-pay cleaning introduction service (canyoudo.uk)
-- ============================================================

create type public.user_role as enum ('customer', 'cleaner', 'admin');
create type public.booking_status as enum ('pending', 'confirmed', 'declined', 'completed', 'cancelled');

-- ---------- profiles (all users) ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  postcode text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- cleaner extras ----------
create table public.cleaner_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bio text not null default '',
  service_area text not null default '',
  services text[] not null default '{}',
  insurer_name text,
  policy_number text,
  policy_expiry date,
  payment_details text,
  created_at timestamptz not null default now()
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaner_details (profile_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index availability_cleaner_idx on public.availability (cleaner_id);

-- ---------- bookings ----------
-- Money model: customer pays cleaner £15/hr directly; CanYouDo? charges a
-- £5/hr introduction fee online (fee_paid tracks Stripe payment).
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete cascade,
  booking_date date not null,
  start_time time not null,
  hours numeric(3, 1) not null check (hours >= 1 and hours <= 8),
  address text not null,
  postcode text not null,
  areas_requested text not null,
  notes text not null default '',
  status public.booking_status not null default 'pending',
  hourly_rate_cleaner numeric(5, 2) not null default 15.00,
  hourly_rate_fee numeric(5, 2) not null default 5.00,
  fee_paid boolean not null default false,
  stripe_session_id text,
  ai_summary text,
  created_at timestamptz not null default now(),
  check (customer_id <> cleaner_id)
);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_cleaner_idx on public.bookings (cleaner_id);

-- ---------- ratings (quantifiable measures drive bonuses) ----------
create table public.ratings (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  arrived_on_time boolean not null,
  completed_requested_areas boolean not null,
  followed_instructions boolean not null,
  friendly_professional boolean not null,
  overall smallint not null check (overall between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index ratings_cleaner_idx on public.ratings (cleaner_id);

-- ---------- messages (per-booking chat) ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_booking_idx on public.messages (booking_id);

-- ============================================================
-- Auto-create a profile row (and cleaner_details for cleaners)
-- when a user signs up.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'customer')::public.user_role;
  if v_role = 'admin' then
    v_role := 'customer'; -- admin is only ever granted manually
  end if;
  insert into public.profiles (id, role, full_name, email, phone, postcode)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'postcode', '')
  );
  if v_role = 'cleaner' then
    insert into public.cleaner_details (profile_id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Public directory view.
-- SECURITY DEFINER on purpose: exposes only safe, aggregated
-- columns (never policy numbers or payment details).
-- ============================================================
create view public.cleaner_directory
with (security_invoker = off) as
select
  cd.profile_id,
  case
    when array_length(regexp_split_to_array(trim(p.full_name), '\s+'), 1) > 1
      then split_part(trim(p.full_name), ' ', 1) || ' ' || left((regexp_split_to_array(trim(p.full_name), '\s+'))[array_length(regexp_split_to_array(trim(p.full_name), '\s+'), 1)], 1) || '.'
    else p.full_name
  end as display_name,
  cd.bio,
  cd.service_area,
  cd.services,
  (cd.insurer_name is not null and cd.policy_number is not null
    and (cd.policy_expiry is null or cd.policy_expiry >= current_date)) as insured,
  coalesce(r.jobs, 0) as jobs_done,
  coalesce(r.on_time_pct, 0) as on_time_pct,
  coalesce(r.areas_pct, 0) as areas_pct,
  coalesce(r.avg_rating, 0) as avg_rating,
  coalesce(a.slots, '[]'::jsonb) as availability
from public.cleaner_details cd
join public.profiles p on p.id = cd.profile_id and p.role = 'cleaner'
left join lateral (
  select
    count(*)::int as jobs,
    100.0 * avg((arrived_on_time)::int) as on_time_pct,
    100.0 * avg((completed_requested_areas)::int) as areas_pct,
    avg(overall)::numeric(3, 2) as avg_rating
  from public.ratings rt
  where rt.cleaner_id = cd.profile_id
) r on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'weekday', av.weekday, 'start_time', av.start_time, 'end_time', av.end_time
  ) order by av.weekday) as slots
  from public.availability av
  where av.cleaner_id = cd.profile_id
) a on true;

grant select on public.cleaner_directory to anon, authenticated;

-- ============================================================
-- Monthly stats + bonus view (invoker rights: each cleaner sees
-- only their own rows via the ratings RLS policies).
-- Bonus rules (needs >= 4 rated jobs in the month):
--   100% on time            -> £20
--   >= 95% areas completed  -> £20
--   average overall >= 4.5  -> £10
-- ============================================================
create view public.cleaner_monthly_stats
with (security_invoker = on) as
select
  rt.cleaner_id,
  date_trunc('month', b.booking_date)::date as month,
  count(*)::int as jobs,
  100.0 * avg((rt.arrived_on_time)::int) as on_time_pct,
  100.0 * avg((rt.completed_requested_areas)::int) as areas_pct,
  avg(rt.overall)::numeric(3, 2) as avg_overall,
  (case when count(*) >= 4 and avg((rt.arrived_on_time)::int) = 1 then 20 else 0 end
   + case when count(*) >= 4 and avg((rt.completed_requested_areas)::int) >= 0.95 then 20 else 0 end
   + case when count(*) >= 4 and avg(rt.overall) >= 4.5 then 10 else 0 end)::int as bonus_total
from public.ratings rt
join public.bookings b on b.id = rt.booking_id
group by rt.cleaner_id, date_trunc('month', b.booking_date);

grant select on public.cleaner_monthly_stats to authenticated;

-- ============================================================
-- Cleaner payment details, revealed only to the customer of a
-- confirmed/completed booking with that cleaner.
-- ============================================================
create or replace function public.get_cleaner_payment_details(bid uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select cd.payment_details
  from public.bookings b
  join public.cleaner_details cd on cd.profile_id = b.cleaner_id
  where b.id = bid
    and b.customer_id = auth.uid()
    and b.status in ('confirmed', 'completed');
$$;

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.cleaner_details enable row level security;
alter table public.availability enable row level security;
alter table public.bookings enable row level security;
alter table public.ratings enable row level security;
alter table public.messages enable row level security;

-- profiles: read own; read basic details of anyone you share a booking with;
-- read any cleaner profile (names shown in directory/bookings)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_select_cleaners" on public.profiles
  for select using (role = 'cleaner');
create policy "profiles_select_booking_counterpart" on public.profiles
  for select using (
    exists (
      select 1 from public.bookings b
      where (b.customer_id = profiles.id and b.cleaner_id = auth.uid())
         or (b.cleaner_id = profiles.id and b.customer_id = auth.uid())
    )
  );
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role in ('customer', 'cleaner'));

-- cleaner_details: owner only (public reads go through cleaner_directory)
create policy "cleaner_details_own" on public.cleaner_details
  for all using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- availability: owner manages; reads go through cleaner_directory
create policy "availability_own" on public.availability
  for all using (auth.uid() = cleaner_id)
  with check (auth.uid() = cleaner_id);

-- bookings
create policy "bookings_select_participant" on public.bookings
  for select using (auth.uid() in (customer_id, cleaner_id));
create policy "bookings_insert_customer" on public.bookings
  for insert with check (
    auth.uid() = customer_id
    and status = 'pending'
    and fee_paid = false
    and hourly_rate_cleaner = 15.00
    and hourly_rate_fee = 5.00
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer')
    and exists (select 1 from public.profiles p where p.id = cleaner_id and p.role = 'cleaner')
  );
-- customers may only cancel (or leave pending); cleaners accept/decline/complete
create policy "bookings_update_customer" on public.bookings
  for update using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id and status in ('pending', 'cancelled'));
create policy "bookings_update_cleaner" on public.bookings
  for update using (auth.uid() = cleaner_id)
  with check (auth.uid() = cleaner_id and status in ('confirmed', 'declined', 'completed', 'cancelled'));

-- ratings: the booking's customer rates a completed booking, once
create policy "ratings_select_participant" on public.ratings
  for select using (auth.uid() in (customer_id, cleaner_id));
create policy "ratings_insert_customer" on public.ratings
  for insert with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
        and b.cleaner_id = ratings.cleaner_id
        and b.status = 'completed'
    )
  );

-- messages: participants of the booking only
create policy "messages_select_participant" on public.messages
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and auth.uid() in (b.customer_id, b.cleaner_id)
    )
  );
create policy "messages_insert_participant" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and auth.uid() in (b.customer_id, b.cleaner_id)
        and b.status in ('pending', 'confirmed')
    )
  );
