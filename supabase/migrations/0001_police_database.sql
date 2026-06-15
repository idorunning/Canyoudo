-- Police database — historical, queryable store of data.police.uk built from the
-- bulk CSV archive (crime, outcomes, stop & search) plus the JSON API (forces,
-- people, neighbourhoods, priorities). Populated by scripts/ingest-bulk-police.mjs
-- running in GitHub Actions; read by the Netlify functions under netlify/functions/.
--
-- Design notes
-- ------------
-- • Crime/outcome/stop-search are stored as bounded ROLLUPS (counts), not raw
--   rows — millions of street-crime rows would blow past Supabase's free tier.
--   Stop & search keeps enough dimensional detail (in ss_dim) for disproportionality
--   work without storing every record.
-- • Every per-force rollup also gets an aggregate row with force_id = '_all', written
--   by the ingest job. That keeps the read layer to plain PostgREST selects — no RPC,
--   no GROUP BY at request time. ('_all' is a sentinel, never a real force id.)
-- • All tables are public open data (OGL v3.0), so RLS allows anonymous SELECT.
--   Writes go through the service-role key in the ingest job, which bypasses RLS.

-- Forces ---------------------------------------------------------------------
create table if not exists police_forces (
  id          text primary key,            -- e.g. 'avon-and-somerset'
  name        text not null,
  description text,
  url         text,
  telephone   text,
  engagement_methods jsonb,
  updated_at  timestamptz default now()
);

create table if not exists police_force_people (
  force_id text not null references police_forces(id) on delete cascade,
  name     text not null,
  rank     text,
  bio      text,
  primary key (force_id, name)
);

-- Crime ----------------------------------------------------------------------
create table if not exists crime_force_month (
  force_id text not null,                  -- real force id, or '_all'
  month    text not null,                  -- YYYY-MM
  category text not null,                  -- street.csv "Crime type", slugified
  count    integer not null,
  primary key (force_id, month, category)
);
create index if not exists crime_force_month_month_idx    on crime_force_month (month);
create index if not exists crime_force_month_category_idx on crime_force_month (category);

create table if not exists outcome_force_month (
  force_id         text not null,          -- real force id, or '_all'
  month            text not null,
  outcome_category text not null,          -- outcomes.csv "Outcome type"
  count            integer not null,
  primary key (force_id, month, outcome_category)
);
create index if not exists outcome_force_month_month_idx on outcome_force_month (month);

-- All-crime totals per LSOA per month — the grain maps/hotspots need. LSOA spans
-- forces, so there is no '_all' row here.
create table if not exists crime_lsoa_month (
  lsoa_code text not null,
  lsoa_name text,
  month     text not null,
  count     integer not null,
  primary key (lsoa_code, month)
);
create index if not exists crime_lsoa_month_month_idx on crime_lsoa_month (month);

-- Stop & search --------------------------------------------------------------
-- find_count = searches whose outcome was linked to the object sought (a "find").
-- find_known = searches where that flag was recorded either way (the denominator).
create table if not exists ss_force_month (
  force_id   text not null,                -- real force id, or '_all'
  month      text not null,
  total      integer not null,
  find_count integer not null,
  find_known integer not null,
  primary key (force_id, month)
);
create index if not exists ss_force_month_month_idx on ss_force_month (month);

-- One long, flexible table for every stop-&-search breakdown. dimension is one of
-- officer_ethnicity | self_ethnicity | object_of_search | legislation | age_range
-- | gender | outcome. This powers ethnicity disparity, find-rate-by-object, etc.
create table if not exists ss_dim (
  force_id   text not null,                -- real force id, or '_all'
  month      text not null,
  dimension  text not null,
  value      text not null,
  count      integer not null,
  find_count integer not null,
  primary key (force_id, month, dimension, value)
);
create index if not exists ss_dim_lookup_idx on ss_dim (dimension, force_id, month);

-- Optional denominator for true disproportionality: resident population by broad
-- ethnicity per force area (ONS census). Seed separately (see docs); disparity
-- views fall back to search-volume shares + find rates when this is empty.
create table if not exists force_population_ethnicity (
  force_id   text not null,
  ethnicity  text not null,               -- White | Black | Asian | Mixed | Other
  population integer not null,
  primary key (force_id, ethnicity)
);

-- Neighbourhoods (from the JSON API) -----------------------------------------
create table if not exists neighbourhoods (
  force_id   text not null,
  id         text not null,               -- neighbourhood id within the force
  name       text,
  centre_lat double precision,
  centre_lng double precision,
  url        text,
  updated_at timestamptz default now(),
  primary key (force_id, id)
);

create table if not exists neighbourhood_priorities (
  force_id         text not null,
  neighbourhood_id text not null,
  key              text not null,         -- md5(issue|action), for idempotent upsert
  issue            text,
  action           text,
  issued_on        text,
  primary key (force_id, neighbourhood_id, key)
);

-- Provenance / idempotency ---------------------------------------------------
create table if not exists ingest_runs (
  id            bigint generated always as identity primary key,
  kind          text not null,            -- 'bulk' | 'api'
  dataset_month text,
  rows_upserted integer,
  ok            boolean,
  notes         text,
  started_at    timestamptz default now(),
  finished_at   timestamptz
);

-- Row-level security: public read, no public write -----------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'police_forces','police_force_people','crime_force_month','outcome_force_month',
    'crime_lsoa_month','ss_force_month','ss_dim','force_population_ethnicity',
    'neighbourhoods','neighbourhood_priorities','ingest_runs'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_read', t);
    execute format('create policy %I on %I for select using (true);', t || '_read', t);
  end loop;
end $$;
