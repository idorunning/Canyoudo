# The police database

A historical, queryable store of [data.police.uk](https://data.police.uk) in
Supabase Postgres, powering the explorer tools under `/data/`:

- **Crime & outcomes** — long-run trends and charge/solve ("justice gap") rates
- **Stop & search disproportionality** — ethnicity, object, find rates over time
- **Neighbourhood policing** — your local team's stated priorities
- **Force profiles & data quality** — coverage tracker, senior officers

This is separate from the lightweight committed snapshot (`src/content/policedata/`,
refreshed by `police-data.yml`) that the original dashboard still uses. The database
adds the historical depth and demographic detail the snapshot can't hold.

## Why a database (and what's in it)

The bulk archive is ~19M+ rows — far too big to commit as JSON. So the ingest stores
bounded **rollups**, not raw rows:

| Table | Grain | Source |
|---|---|---|
| `crime_force_month` | force × month × category (count) | archive `*-street.csv` |
| `outcome_force_month` | force × month × outcome (count) | archive `*-outcomes.csv` |
| `crime_lsoa_month` | LSOA × month (all-crime count) | archive `*-street.csv` |
| `ss_force_month` | force × month (total, find rate) | archive `*-stop-and-search.csv` |
| `ss_dim` | force × month × dimension × value (count, finds) | archive `*-stop-and-search.csv` |
| `police_forces`, `police_force_people` | force metadata, senior officers | JSON API |
| `neighbourhoods`, `neighbourhood_priorities` | local teams + priorities | JSON API |
| `force_population_ethnicity` | ethnicity denominator (optional seed) | ONS census |
| `force_population` | total residents per force (optional seed, migration 0002) | ONS mid-year estimates |
| `ingest_runs` | provenance / idempotency | — |

Every per-force rollup also gets an aggregate row with `force_id = '_all'`, so
"national" is a plain query — no GROUP BY at request time.

**Volume control:** `INGEST_MONTHS` (default 36) bounds how many recent months of
rollups are kept; `INGEST_LSOA_MONTHS` (default 12) bounds the larger LSOA map table.
With these defaults the database fits comfortably inside Supabase's free tier. Leaving
the repo variables unset uses these defaults. After each run the ingest **prunes**
rows older than the windows (the upsert path never deletes on its own), so the tables
stay bounded as the archive rolls forward.

**Phased & resumable (bulk):** the multi-GB archive is never downloaded whole. The
ingest reads the zip's central directory and then each wanted CSV via HTTP **range
requests**, processing and upserting **one month at a time**. Each month is an
independent, idempotent upsert, so a run that is cut short still persists its completed
months and a re-run resumes cleanly. Per-month progress is logged in the `ingest_runs`
table. If the host ever stops honouring range requests, set `FULL_DOWNLOAD=1` to fall
back to a single streamed download.

**Resumable & concurrent (API metadata):** the JSON API phase crawls each force's
neighbourhoods + priorities with bounded concurrency (`API_CONCURRENCY`, default 6 —
well under data.police.uk's ~15 req/s limit) and writes **one force at a time**, with a
per-force checkpoint row (`kind='api'`, force id in `dataset_month`) in `ingest_runs`.
A cancelled run therefore keeps every completed force, and a re-run **skips forces
crawled OK within `API_REFRESH_DAYS`** (default 25) and resumes from the rest. Use
`--no-resume` to force a full re-crawl, or `--force <id>` / `API_FORCE` to crawl a
single force. Because each force stands alone, the metadata phase no longer has to fit
inside one job budget.

**Separate jobs:** the workflow runs the bulk and metadata phases as two independent
jobs (`bulk`, with `SKIP_API=1`; `metadata`, with `SKIP_BULK=1`), each on its own runner
with its own timeout, so a slow metadata crawl can't consume the bulk phase's budget (or
vice versa). Both gate on a shared `guard` job that checks the Supabase secrets.

## Setup (one-off)

1. Use the existing Supabase project (the one behind sign-in / saved papers).
2. Run the migration: paste `supabase/migrations/0001_police_database.sql` into the
   Supabase SQL editor (or `supabase db push` with the CLI). It's idempotent.
3. Add GitHub Actions **secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (Project settings → API). Optionally set repo **variables** `INGEST_MONTHS`,
   `INGEST_LSOA_MONTHS`, `API_REFRESH_DAYS`, `API_CONCURRENCY`.
4. The read path reuses the existing public `PUBLIC_SUPABASE_URL` /
   `PUBLIC_SUPABASE_ANON_KEY` — nothing new to expose; public-SELECT RLS covers
   these open-data tables.

## Running the ingest

- **Automatic:** `police-database.yml` runs monthly (6th, after the snapshot job).
  Trigger manually from the Actions tab, optionally passing specific `months` and a
  `phase` (`all` / `bulk` / `metadata`) to run just one phase — e.g. `metadata` to
  refresh forces/neighbourhoods without re-reading the bulk archive.
- **Manual / local** (needs network to data.police.uk, which the dev sandbox lacks):
  ```bash
  npm install --no-save @supabase/supabase-js unzipper
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ingest-bulk-police.mjs
  # dry run against a local archive, no DB writes:
  node scripts/ingest-bulk-police.mjs --zip ./archive.zip --months 2024-01 --dry-run
  ```

The ingest is **idempotent** — every write is an upsert keyed on the rollup grain,
so re-running a month overwrites rather than duplicates.

## Population denominators (optional, high value)

Two small ONS seeds unlock the dashboard's rate-based features. Both are loaded
from a locally-downloaded ONS CSV by `scripts/seed-population.mjs` (column
matching is by header name; see the script's header comment for usage):

- **`force_population`** (migration `0002_force_population.sql`) — total
  residents per police force area (ONS mid-year estimates). Unlocks *per-1,000
  residents* rates on the crime charts and in the force briefing — the form
  that makes forces comparable at all.
  ```bash
  node scripts/seed-population.mjs --totals pfa-population.csv --year mid-2023
  ```
- **`force_population_ethnicity`** — resident population by broad ethnic group
  (ONS census). True stop-&-search disproportionality needs this
  population-at-risk denominator; seeding it unlocks the disparity ratios.
  Until then the tool shows search-volume shares + find rates, which are still
  informative but not proof of bias.
  ```bash
  node scripts/seed-population.mjs --ethnicity pfa-ethnicity.csv
  ```

Both accept `--dry-run` to parse and report without writing.

## The force briefing

`/data/briefing` is the dashboard's deep tier: a streamed, structured briefing
per force written by the strongest reasoning model from an aggregate-only
digest (`/api/police-db?view=briefing-digest`, built in
`src/lib/briefing-digest.ts`). The generation runs in
`netlify/edge-functions/force-briefing.ts` (same Deno/edge reasoning as the
research review — see docs/research-assistant-v4.md), is cached per force ×
data month in the `force-briefings` Blobs store, and every figure in the
output is verified client-side against the digest (`src/lib/figures.mjs`).
The prompt/heading/label contract lives in `src/lib/dashboard-prompts.ts` and
is asserted by `tests/dashboard-prompts.test.mjs`.

## Parsing/rollup logic

All CSV parsing and rollup maths lives in `scripts/lib/police-csv.mjs` (pure, no
I/O) and is unit-tested in `tests/police-csv.test.mjs` (`npm test`). The ingest
script is just the streaming + Supabase orchestration around it.
