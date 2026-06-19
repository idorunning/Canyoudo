# SEO Improvement Plan — Thinking About Policing

A prioritised, codebase-specific set of actions to improve how
`thinkingaboutpolicing.org` performs in Google Search, built around what
**Google Search Console** (GSC) actually reports, and structured so you can
measure a clean **before vs after** using your GoatCounter export and GSC's own
data.

- **Site:** https://thinkingaboutpolicing.org (Astro 4, static, hosted on Netlify)
- **Author:** Nathan Tracey
- **Analytics:** GoatCounter (`thinkingaboutpolicing.goatcounter.com`)
- **Search Console:** https://search.google.com/search-console
- **Plan created:** 2026-06-19

---

## 0. How to measure (do this FIRST — it's your "before")

You can't compare before/after without a baseline captured *before* you ship
any changes. Spend 15 minutes capturing the snapshot below, save the exports to
a dated folder (e.g. `seo-baseline-2026-06/`), and keep them out of the repo if
they contain anything you'd rather not publish.

### 0.1 GoatCounter export (organic traffic baseline)
1. Open the GoatCounter dashboard → **Export** (or `…/export.csv`).
2. Export the **last 90 days** of pageviews so you have a stable seasonal
   baseline, plus the **referrers** view (to isolate `Google`/search referrers).
3. Save as `goatcounter-before-YYYY-MM-DD.csv`.
4. Note the headline numbers you care about: total pageviews, pageviews from
   search referrers, and your top 10 landing pages.

> GoatCounter tells you *traffic that arrived*. Search Console tells you *how
> you ranked and were clicked in Google*. You need both: GSC explains the
> "why" behind GoatCounter's "what".

### 0.2 Search Console export (search baseline)
In GSC, capture each of these for the **last 3 months** (and again later for
the same length of window, so the comparison is like-for-like):

| GSC report | What to export | Why it matters |
|---|---|---|
| **Performance → Search results** | Total clicks, impressions, avg CTR, avg position. Export the **Queries** and **Pages** tabs. | Your core before/after scoreboard. |
| **Indexing → Pages** | Count of "Indexed" vs "Not indexed" + the reasons. | Pages that aren't indexed can't rank. |
| **Sitemaps** | Submitted vs discovered URL counts. | Confirms Google sees everything. |
| **Experience → Core Web Vitals** | URLs rated Good / Needs improvement / Poor (mobile + desktop). | Ranking + UX signal. |
| **Enhancements / Rich results** | Any Article / FAQ / Breadcrumb items detected + errors. | Structured-data wins. |

Save these as `gsc-before-*.csv`.

### 0.3 One-off tools to record a baseline
- **PageSpeed Insights** (https://pagespeed.web.dev/) — run the homepage, one
  article, and `/data`. Record mobile + desktop scores and the Core Web Vitals.
- **Rich Results Test** (https://search.google.com/test/rich-results) — test the
  homepage, an article, and `/ai`. Screenshot what's detected.
- **URL Inspection** in GSC on 3–4 key URLs — confirm "URL is on Google".

### 0.4 The review cadence
- Ship changes in the batches below.
- In GSC, **request indexing** (URL Inspection → Request Indexing) for any page
  you materially change, so Google re-crawls sooner.
- Wait **4–6 weeks** (search data lags), then re-export the same GSC + GoatCounter
  views into `*-after-*.csv` and compare the same metrics over the same window
  length. Don't judge after just a few days.

---

## What's already in good shape (no action needed)

A baseline audit of the codebase shows the fundamentals are already strong, so
the work below is about polishing, not rebuilding:

- ✅ Canonical URLs on every page (`BaseLayout.astro`).
- ✅ Per-page `<title>` and `<meta name="description">`, with sensible defaults.
- ✅ Open Graph + Twitter card tags.
- ✅ `schema.org` JSON-LD: `WebSite`, `Blog`, `Person` (home), `Article`
  (articles), `FAQPage` (`/ai`).
- ✅ Auto-generated XML sitemap (`@astrojs/sitemap`) referenced from `robots.txt`.
- ✅ RSS feed, plus a human-readable `/sitemap` page and `llms.txt`.
- ✅ `robots.txt` allows crawl, blocks `/admin/`.
- ✅ `lang="en-GB"`, semantic headings, skip-link, lazy-loaded images.
- ✅ 301 redirect handling for moved articles (`generate-redirects.mjs`).

---

## Priority 1 — Quick, high-impact fixes (do this week)

### 1.1 🐞 Create the missing default social image (`/og-default.png`)
**Problem:** `BaseLayout.astro` sets `image = '/og-default.png'` as the default
Open Graph / Twitter image, but **that file does not exist in `public/`**. Every
page without a hero image (home, `/about`, `/data`, `/topics`, section indexes,
`/ai`, etc.) currently points its `og:image` and `twitter:image` at a 404.

**Why it matters:** Links to those pages shared on social/messaging render with
no preview image, which depresses click-through — and a broken `og:image` is a
sloppy signal. The homepage in particular has no image card today.

**Action:**
- Create a branded 1200×630 PNG and save it as `public/og-default.png`
  (the title + author + a clean background; reuse the site's dark `#1a1817`
  and accent colour to match the title-card fallback in `ArticleLayout.astro`).
- *Optional, better:* generate per-page OG images at build time (e.g. with
  `satori`/`@vercel/og`-style rendering or Astro's `astro-og-canvas`) so every
  article gets its own card. Start with the static fallback; automate later.

**Verify:** Rich Results Test + the
[OpenGraph debugger](https://www.opengraph.xyz/) on the homepage.

### 1.2 Add `lastmod` to the XML sitemap
**Problem:** `@astrojs/sitemap` runs with defaults, so URLs have no `<lastmod>`.
Google uses `lastmod` as a freshness hint when scheduling re-crawls.

**Action:** in `astro.config.mjs`, give the `sitemap()` integration a
`serialize` (or use a `lastmod` per page) so article entries carry their
`updatedDate`/`pubDate`. Even a site-wide build date is better than nothing.

### 1.3 Use a raster logo in Organization JSON-LD
**Problem:** the `Blog`/`Organization` JSON-LD in `index.astro` uses
`favicon.svg` as the publisher `logo`. Google's logo guidelines want a
**raster** image (PNG/JPG) and ideally explicit dimensions.

**Action:** add a `public/logo.png` (square or 112×112+) and reference it as an
`ImageObject` with `width`/`height` in the `publisher.logo` of the home-page
JSON-LD (and the `publisher` block in `ArticleLayout.astro`).

### 1.4 Submit & confirm the sitemap in GSC
- Confirm `https://thinkingaboutpolicing.org/sitemap-index.xml` is submitted
  under **Sitemaps** and shows "Success".
- After shipping P1, use **URL Inspection → Request Indexing** on the homepage
  and 3–4 priority articles.

---

## Priority 2 — Structured data & rich results (1–2 weeks)

These help Google show richer results (breadcrumbs, article cards) and improve
CTR without changing rankings directly.

### 2.1 Add `BreadcrumbList` JSON-LD
**Gap:** no `BreadcrumbList` anywhere in the codebase. Articles live at
`/{section}/{slug}`, which is a clean, crawlable hierarchy — perfect for
breadcrumbs in the SERP.

**Action:** emit `BreadcrumbList` JSON-LD on:
- **Articles** (`ArticleLayout.astro`): Home → Section → Article.
- **Section index pages** (`[section]/index.astro`): Home → Section.
- **Topic pages** (`topics/[slug].astro`): Home → Topics → Topic.

Pass it through the existing `jsonLd` prop on `BaseLayout` so it renders in
`<head>` alongside the other graphs.

### 2.2 Enrich the Article schema
The `Article` JSON-LD in `ArticleLayout.astro` is good but can be stronger:
- Make `author` reference the Person via `url: /about` so Google links the
  entity to the homepage `Person` graph (consistent author entity = E-E-A-T).
- Add `keywords` from the article `tags`.
- Ensure `image` is always present (falls back to `/og-default.png` once 1.1
  lands) — `Article` rich results prefer an image.
- Consider `wordCount` and `articleSection` (you already know the section).

### 2.3 Connect the author entity (E-E-A-T)
Nathan being a serving police inspector is a genuine expertise/authority signal
Google rewards for this topic. Strengthen it:
- On `/about`, add `Person` JSON-LD (jobTitle, `sameAs` links to any public
  profiles — LinkedIn, X, Bluesky, books' author pages).
- Make sure the home-page `Person.url` and article `author.url` both point to
  `/about` so it's one consistent entity.

---

## Priority 3 — Indexing & crawl hygiene (1–2 weeks)

Driven by the GSC **Pages** (Indexing) report. Work the "Not indexed" reasons.

### 3.1 Review every "Not indexed" reason in GSC
Common ones and what to do:
- **Crawled – currently not indexed / Discovered – not indexed:** usually
  thin/duplicate content or low perceived value. Strengthen the page (see P4) or
  consolidate.
- **Duplicate without user-selected canonical:** confirm the canonical (already
  present) resolves — check trailing-slash and `www` vs non-`www` consistency.
- **Page with redirect / Alternate page with canonical:** expected for
  `redirectFrom` URLs; just confirm they're intentional.
- **Excluded by 'noindex':** make sure nothing important is noindexed.

### 3.2 Decide indexing for utility pages
Some pages add little search value and can dilute crawl focus. Decide
per-page whether to `noindex` (still crawlable, just kept out of the index):
- Likely **noindex**: `/search`, `/subscribe`, `/contact` (thin), `/404`.
- Keep indexed: all articles, section indexes, `/topics`, `/topics/*`, `/data*`,
  `/about`, `/research`, `/ai`, `/books`, `/resources`, `/sitemap`.

**Action:** add an optional `noindex` prop to `BaseLayout.astro` that emits
`<meta name="robots" content="noindex,follow">` when set, then opt the chosen
pages in. (`/admin/` is already disallowed in `robots.txt`.)

### 3.3 Canonical host consistency
Confirm Netlify forces a single host + scheme (https, non-`www` — your canonicals
use the bare domain) with 301s, so Google never sees duplicate variants.

---

## Priority 4 — Content & on-page (ongoing, biggest long-term lever)

Rankings ultimately follow useful content that matches what people search. Use
the GSC **Performance → Queries** report to drive this — it tells you the exact
words people use to find (or nearly find) you.

### 4.1 Mine GSC for "striking distance" wins
- Sort **Queries** by impressions, then filter to **position 5–20**. These are
  pages Google already considers relevant but that aren't on page one.
- For each, check the ranking page: does it fully answer that query? Add a
  section, sharpen the H1/title/description to match the phrasing, add an
  internal link from a stronger page. Small edits to near-miss pages usually
  beat writing brand-new content.

### 4.2 Tighten titles & meta descriptions for CTR
- In the **Performance → Pages** report, find pages with high impressions but
  **low CTR** — their title/description aren't earning the click.
- Front-load the keyword, keep titles ≤ ~60 chars (the ` — Thinking About
  Policing` suffix is added automatically), descriptions ~150 chars, written as
  a promise of what the reader gets. These live in each article's frontmatter
  (`title`, `description`).

### 4.3 Strengthen internal linking
- You already auto-link dictionary topics in article bodies (`rehype-topic-links`)
  and have a `/sitemap` and `/topics` hub — good. Push further:
  - Add 2–4 contextual links between related articles within each section.
  - Ensure every article is reachable from a topic page and a section index
    (orphan pages rank poorly).
- Make sure topic pages have real descriptive copy (the schema allows an
  optional `description`); a topic page that's just a list of links is thin.

### 4.4 Image alt text & dimensions
- Article hero alt text is currently generic (`Illustration for "<title>"` in
  `ArticleLayout.astro`). Where an image depicts something specific, use
  descriptive alt instead — helps Google Images and accessibility.
- For content images, set explicit `width`/`height` (or aspect-ratio) to avoid
  layout shift (CLS) — see P5.

### 4.5 Keep content fresh
- When you meaningfully update an article, set its `updatedDate` frontmatter
  (already supported and shown). Combined with 1.2's `lastmod`, this signals
  freshness and nudges a re-crawl.

---

## Priority 5 — Core Web Vitals & performance (as needed)

From GSC **Experience → Core Web Vitals** and PageSpeed Insights. Static Astro
is already fast, so this is mostly defensive.

### 5.1 Reduce layout shift (CLS) from images
Most content images lack explicit dimensions. Add `width`/`height` (or a fixed
aspect ratio via Tailwind) to images in articles and cards so the browser
reserves space before they load.

### 5.2 Optimise font loading
`BaseLayout.astro` loads DM Sans + Source Serif 4 from Google Fonts. You already
`preconnect`. To cut render-blocking and FOUT:
- Consider self-hosting the two fonts (subset to Latin) and `font-display: swap`.
- Or trim the requested weights/italics to only those actually used.

### 5.3 Use Astro's image pipeline for content images
You ship `sharp` already. Where practical, route images through Astro's
`<Image>`/asset pipeline (or pre-generate responsive `srcset` for the hero) to
serve right-sized, modern formats. Build-fetched images live under
`public/images/*.webp`, which is a good start.

### 5.4 Re-test
Re-run PageSpeed Insights on home / an article / `/data` after changes and
confirm CWV stay "Good" on mobile.

---

## Suggested execution order (checklist)

**Batch A — this week (P1):**
- [ ] 1.1 Create `public/og-default.png` (1200×630)
- [ ] 1.2 Add `lastmod` to sitemap config
- [ ] 1.3 Add `public/logo.png` + use it in Organization JSON-LD
- [ ] 1.4 Confirm sitemap in GSC + request indexing on key pages

**Batch B — next (P2 + P3):**
- [ ] 2.1 `BreadcrumbList` on articles, sections, topics
- [ ] 2.2 Enrich `Article` schema (author url, keywords, image, wordCount)
- [ ] 2.3 `Person` schema on `/about` + consistent author entity
- [ ] 3.1 Work the GSC "Not indexed" list
- [ ] 3.2 `noindex` prop + apply to `/search`, `/subscribe`, `/contact`, `/404`
- [ ] 3.3 Confirm single-host 301s on Netlify

**Batch C — ongoing (P4 + P5):**
- [ ] 4.1 Improve 5 "striking distance" pages from GSC
- [ ] 4.2 Rewrite low-CTR titles/descriptions
- [ ] 4.3 Add internal links + flesh out topic descriptions
- [ ] 4.4 Descriptive alt text
- [ ] 5.x Image dimensions, font loading, re-test CWV

---

## Before / after comparison table (fill this in)

Capture the same metrics, same window length, before changes and ~4–6 weeks
after.

| Metric | Source | Before (date: ____) | After (date: ____) | Δ |
|---|---|---|---|---|
| Pageviews (90d) | GoatCounter | | | |
| Pageviews from search referrers | GoatCounter | | | |
| Total clicks | GSC Performance | | | |
| Total impressions | GSC Performance | | | |
| Average CTR | GSC Performance | | | |
| Average position | GSC Performance | | | |
| Indexed pages | GSC Indexing | | | |
| Queries in position 1–10 | GSC Performance | | | |
| Rich results detected (Article/FAQ/Breadcrumb) | GSC Enhancements | | | |
| Core Web Vitals "Good" URLs (mobile) | GSC Experience | | | |
| PageSpeed mobile (home / article) | PSI | | | |

> Tip: GSC's Performance report has a built-in **"Compare"** date mode — set it
> to compare your after-window against the equal-length before-window for an
> instant clicks/impressions/CTR/position delta without spreadsheets.

---

## Notes & caveats
- Search results lag: allow **4–6 weeks** after shipping before judging, and
  expect noise — look at trends, not single days.
- GoatCounter measures *all* traffic; isolate the **search/Google referrer**
  segment when attributing SEO impact, and remember direct/social traffic moves
  for unrelated reasons (a new article, a newsletter send, a social post).
- Everything above is implementable within the current Astro setup; most P1–P3
  items are small, well-scoped edits to `BaseLayout.astro`, `ArticleLayout.astro`,
  `astro.config.mjs`, and a couple of new files in `public/`.
