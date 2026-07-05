# Monthly reader poll

A single Supabase table, `monthly_poll_votes`, that tallies real votes for the
homepage's "This month's question" — replacing the old client-only poll that
only remembered a reader's own choice and never showed a result.

## What's in it

| Column | What it counts |
|---|---|
| `month` | the poll's month key, e.g. `"2026-07"` (matches `src/data/polls.json`) |
| `choice` | the lower-cased choice label, e.g. `"yes"` |
| `votes` | how many times that choice has been picked |

Writes only ever happen through one RPC, `increment_poll_vote(month, choice)`,
which adds exactly 1 to one counter. There's no public UPDATE grant, so a
visitor's browser can never set an arbitrary count.

## Setup (one-off)

1. Uses the existing Supabase project.
2. Run the migration: paste `supabase/migrations/0003_monthly_poll_votes.sql`
   into the Supabase SQL editor (or `supabase db push`). It's idempotent.
3. No new env vars — reuses `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`.

## Adding next month's question

Add an entry to the top of `src/data/polls.json`:

```json
{ "month": "2026-08", "question": "…", "choices": ["Yes", "No", "Unsure"] }
```

The homepage always treats the most recent `month` as the live, votable
question; every earlier entry becomes read-only history in the scrollable
"Past months" strip beneath it.

## How the numbers get on the page

The site is static, so nothing queries Supabase at request time:

- **`scripts/bundle-polls.mjs`** runs in `prebuild` and bakes current tallies
  into `src/lib/polls-bundle.json` (gitignored, regenerated on every build).
- **The homepage** (`src/pages/index.astro`) renders every month's bars from
  that bundle. For the current month, a client script swaps the vote buttons
  for the tally the moment a reader votes (remembered per month via
  `localStorage`), then calls the RPC and re-fetches that month's live counts
  so the bars reflect the vote immediately rather than waiting for the next
  deploy.
