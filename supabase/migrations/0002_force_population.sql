-- Force-area resident population (ONS mid-year estimates) — the per-1,000-rate
-- denominator for the crime dashboard. One row per force (plus the '_all'
-- aggregate), seeded by scripts/seed-population.mjs from the ONS "population
-- estimates for police force areas" table. Counts alone can't compare a force
-- with any other; this small table unlocks rates per 1,000 residents across
-- the dashboard and the force briefing.
--
-- Idempotent, matching 0001's conventions: public open data, anonymous SELECT
-- via RLS, writes through the service-role key.

create table if not exists force_population (
  force_id   text primary key,             -- real force id, or '_all'
  population bigint not null,
  year       text not null,                -- e.g. 'mid-2023'
  updated_at timestamptz default now()
);

alter table force_population enable row level security;
drop policy if exists force_population_read on force_population;
create policy force_population_read on force_population for select using (true);
