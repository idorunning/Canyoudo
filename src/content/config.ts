import { defineCollection, z } from 'astro:content';

export const SECTIONS = ['police-policy', 'public-policy', 'influential-people', 'other', 'data-stories'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  'police-policy': 'Police Policy',
  'public-policy': 'Public Policy',
  'influential-people': 'Influential People',
  other: 'Interesting Distractions',
  'data-stories': 'The Data Tells a Story',
};

// The browser editor serialises a cleared optional field as '' rather than
// omitting it — and '' coerces to Invalid Date, which fails the build. Treat
// blank as absent everywhere an optional/defaulted field could receive one.
const blankAsUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);

const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  // Which section the article belongs to. Changing this in the editor is what
  // "moves" an article between areas; it drives the /{section}/{slug} URL.
  section: z.enum(SECTIONS).default('police-policy'),
  pubDate: z.coerce.date(),
  updatedDate: z.preprocess(blankAsUndefined, z.coerce.date().optional()),
  heroImage: z.string().optional(),
  thumbnail: z.string().optional(),
  // A head-and-shoulders portrait, shown on the Influential People cards so
  // each person is presented by their face rather than text alone.
  portrait: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // A short, scannable summary shown in a box above the article body — the
  // three-to-five points a reader should leave with. Optional; adds structure
  // to longer essays without changing the prose. Three to five lines reads best.
  keyTakeaways: z.array(z.string()).optional(),
  // Old paths to 301-redirect to this article — fill in when you move an
  // article between sections so the previous URL doesn't break.
  redirectFrom: z.array(z.string()).optional(),
  draft: z.boolean().default(false),
  author: z.preprocess(blankAsUndefined, z.string().default('Nathan Tracey')),
});

// --- Site data, all editable in the CMS as single-file "data" collections. ---
// Decap's `file` collections with a top-level list widget serialise to
// { key: [...] } (not a bare array), so each schema wraps its array in a named
// key and readers use entry.data.<key>. Keep the key, the JSON, and the Decap
// config in agreement.

// The topics dictionary: the single source of truth behind tag suggestions,
// in-body auto-linking, and the /topics/* archive pages.
const topicsSchema = z.object({
  topics: z.array(
    z.object({
      label: z.string(),
      slug: z.string(),
      aliases: z.array(z.string()).default([]),
      description: z.string().optional(),
    })
  ),
});

// Books / ebooks — the site links out to wherever they're sold.
const booksSchema = z.object({
  books: z.array(
    z.object({
      title: z.string(),
      cover: z.string().optional(),
      blurb: z.string(),
      buyUrl: z.string().url(),
      buyLabel: z.string().optional(),
      price: z.string().optional(),
      tags: z.array(z.string()).default([]),
    })
  ),
});

// External "further reading" links (SEBP, College of Policing, …).
const resourcesSchema = z.object({
  resources: z.array(
    z.object({
      label: z.string(),
      url: z.string().url(),
      note: z.string().optional(),
      category: z.string().optional(),
    })
  ),
});

// --- Aggregated news headlines ---------------------------------------------
// A rolling snapshot of policing / law / AI headlines, pulled from a curated
// set of public RSS/Atom feeds by scripts/fetch-news.mjs (run on a schedule by
// .github/workflows/news.yml) and read at build time by the sidebar widget.
// Only headline, source, link and date are stored — never full article text —
// so this stays within what RSS is meant for: syndicating links back to the
// source. A single `latest.json` carries the whole list.
const newsSchema = z.object({
  provenance: z.object({
    fetchedAt: z.string(), // ISO timestamp of the fetch
    feedCount: z.number().default(0), // how many feeds responded
    sources: z.array(z.string()).default([]),
  }),
  items: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        source: z.string(),
        topic: z.enum(['policing', 'law', 'ai', 'other']).default('other'),
        isoDate: z.string(), // ISO publication date
        summary: z.string().default(''),
      })
    )
    .default([]),
});

// --- Police data snapshot ---------------------------------------------------
// A monthly, version-controlled snapshot of data.police.uk, written by
// scripts/fetch-police-data.mjs (run on a schedule by .github/workflows/
// police-data.yml) and read at build time by the /data explorer. Stop & search
// is the only dataset the API exposes force-wide, so it is what the snapshot
// carries; crime is inherently geographic and lives in the client-side lookup.
//
// Every file ships a `provenance` block — dataset month, fetch time, source and
// licence — so each figure on the page can state exactly where it came from and
// how old it is. `sample: true` marks placeholder data committed before the
// first real fetch, so pages can flag it as illustrative.
const provenanceSchema = z.object({
  source: z.string().default('https://data.police.uk'),
  licence: z.string().default('Open Government Licence v3.0'),
  datasetMonth: z.string(), // 'YYYY-MM' — the latest month the data describes
  fetchedAt: z.string(), // ISO timestamp of the fetch
  windowMonths: z.number().default(12), // length of the trend window
  sample: z.boolean().default(false),
});

const countSchema = z.object({ label: z.string(), count: z.number() });

// A single month's full breakdown (used for the latest month and the window).
const breakdownSchema = z.object({
  total: z.number(),
  byOutcome: z.array(countSchema).default([]),
  byOfficerEthnicity: z.array(countSchema).default([]),
  byObjectOfSearch: z.array(countSchema).default([]),
  findRate: z.number().nullable().default(null),
});

// The per-month trend point (sparkline data).
const stopPointSchema = z.object({
  month: z.string(),
  total: z.number(),
  findRate: z.number().nullable().default(null),
});

const stopSearchSchema = z.object({
  latest: breakdownSchema.nullable().default(null),
  series: z.array(stopPointSchema).default([]),
  window: breakdownSchema.partial({ findRate: true }).nullable().default(null),
});

const nationalSnapshot = z.object({
  kind: z.literal('national'),
  provenance: provenanceSchema,
  forcesCount: z.number(),
  // Forces that returned no stop & search for the latest month, so coverage
  // gaps are visible rather than silently flattening the national total.
  forcesMissing: z.array(z.string()).default([]),
  stopSearch: z.object({
    latest: z.object({ total: z.number(), findRate: z.number().nullable().default(null) }),
    series: z.array(stopPointSchema).default([]),
    window: breakdownSchema.partial({ findRate: true }),
  }),
});

const forceSnapshot = z.object({
  kind: z.literal('force'),
  provenance: provenanceSchema,
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  stopSearch: stopSearchSchema,
});

// Interpretation now happens at runtime (netlify/functions/interpret.mts), and
// area/postcode crime is fetched live there — so the snapshot only carries the
// force-wide stop & search data the explorer reads at build time.
const policeDataSchema = z.discriminatedUnion('kind', [nationalSnapshot, forceSnapshot]);

// Static pages (About, Contact) — editable in the CMS under Pages.
const pagesSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const collections = {
  articles: defineCollection({ type: 'content', schema: articleSchema }),
  pages: defineCollection({ type: 'content', schema: pagesSchema }),
  topics: defineCollection({ type: 'data', schema: topicsSchema }),
  books: defineCollection({ type: 'data', schema: booksSchema }),
  resources: defineCollection({ type: 'data', schema: resourcesSchema }),
  policedata: defineCollection({ type: 'data', schema: policeDataSchema }),
  news: defineCollection({ type: 'data', schema: newsSchema }),
};
