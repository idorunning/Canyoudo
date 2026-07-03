# Article engagement (real "most read" + share counts)

A single Supabase table, `article_engagement`, that tallies real page views and
real shares per article — replacing the hand-picked `MOST_READ_SLUGS` list that
used to stand in for it, and powering the "shared N times" line next to the
share buttons on every article.

## What's in it

| Column | What it counts |
|---|---|
| `slug` | the article's filename slug (primary key) |
| `view_count` | incremented once per reader per article per browser session |
| `share_count` | incremented once per click on a share link or the copy-link button |

Writes only ever happen through two RPCs, `increment_article_view(slug)` and
`increment_article_share(slug)`, each of which adds exactly 1 to one counter.
There's no public UPDATE grant, so a visitor's browser can never set an
arbitrary count or touch anyone else's row.

## Setup (one-off)

1. Uses the existing Supabase project (the one behind sign-in / saved papers /
   the police database).
2. Run the migration: paste `supabase/migrations/0002_article_engagement.sql`
   into the Supabase SQL editor (or `supabase db push` with the CLI). It's
   idempotent.
3. No new env vars — the read path (`scripts/bundle-engagement.mjs`) and the
   write path (the in-page script in `src/layouts/ArticleLayout.astro`) both
   reuse the existing public `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`.

## How the numbers get on the page

The site is static, so nothing queries Supabase at request time. Instead:

- **`scripts/bundle-engagement.mjs`** runs in `prebuild` and bakes the current
  counters into `src/lib/engagement-bundle.json` (gitignored, regenerated on
  every build).
- **The homepage's "Most read"** (`src/pages/index.astro`) sorts all articles
  by `view_count` from that bundle and takes the top four. If the bundle is
  empty — a fresh deploy, or Supabase not configured — it falls back to the
  old hand-picked list so the section never renders blank.
- **Each article page** (`src/layouts/ArticleLayout.astro`) shows its baked-in
  share count next to "Share this article", then a client-side script bumps
  it live (via the RPC's return value) the moment a reader shares.

Because the counters are baked at build time, "most read" is only as fresh as
the last deploy — the site rebuilds on every push, plus the news-fetch cron
every 12 hours (`.github/workflows/news.yml`), so in practice it's rarely more
than a few hours stale.
