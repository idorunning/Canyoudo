import { defineCollection, z } from 'astro:content';

export const SECTIONS = ['police-policy', 'public-policy', 'influential-people', 'other', 'data-stories'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  'police-policy': 'Evidence & Practice',
  'public-policy': 'Leadership & Culture',
  'influential-people': 'Influential People',
  other: 'Data Stories',
  'data-stories': 'Technology & Innovation',
};

// Sections shown in navigation and discovery surfaces (homepage grid, site
// overview, explore rail).
export const VISIBLE_SECTIONS: Section[] = SECTIONS;

// The browser editor serialises a cleared optional field as '' rather than
// omitting it — and '' coerces to Invalid Date, which fails the build. Treat
// blank as absent everywhere an optional/defaulted field could receive one.
const blankAsUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);

// One point in an article's practical summary: what the evidence says, plus
// the source it came from — which must already be cited in the article body.
const evidencePointSchema = z.object({
  point: z.string(),
  source: z.preprocess(blankAsUndefined, z.string().optional()), // label, e.g. "College of Policing (2023)"
  // An absolute URL, or a site-relative path for documents the site hosts
  // itself (e.g. /documents/…): both must already be cited in the article.
  url: z.preprocess(
    blankAsUndefined,
    z
      .string()
      .optional()
      .refine((v) => v === undefined || v.startsWith('/') || URL.canParse(v), {
        message: 'must be an absolute URL or a site-relative path',
      })
  ),
});

// The Practical Summary card at the foot of an article, collated on
// /practical-summaries: a briefing for senior leaders. The problem in a
// sentence, only the strongest evidence, and if/then outcomes — if we do X,
// this is the benefit, and who gains. Strictly a summary — no claims or
// sources beyond the article.
const practicalSummarySchema = z.object({
  problem: z.string(),
  evidence: z.array(evidencePointSchema).min(1).max(3),
  outcomes: z
    .array(
      z.object({
        action: z.string(), // completes "If we …"
        benefit: z.string(), // the gain, and who gets it — public/victims/officers/force
      })
    )
    .min(1)
    .max(3),
});

export type PracticalSummary = z.infer<typeof practicalSummarySchema>;

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
  // Up to three questions to spark discussion — shown at the end of the article
  // to give readers something concrete to think about or share on LinkedIn.
  discussionQuestions: z.array(z.string()).optional(),
  // The Practical Summary card (see practicalSummarySchema above). Optional —
  // articles without one still build. The editor's object field always
  // serialises the whole shape, so a summary with a blank problem statement
  // is treated as absent rather than failing the build.
  practicalSummary: z.preprocess(
    (v) => (v && typeof v === 'object' && (v as { problem?: unknown }).problem ? v : undefined),
    practicalSummarySchema.optional()
  ),
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

// Static pages (About, Contact, How I built this) — editable in the CMS under
// Pages. `draft` mirrors the articles' flag: on = taken off the live site (the
// route 404s and any nav link to it is hidden), so a page can be held back for
// rewriting without deleting its content.
const pagesSchema = z.object({
  title: z.string(),
  description: z.string(),
  draft: z.boolean().default(false),
});

// --- Change log -------------------------------------------------------------
// A running, plain-English record of changes to the site — fixes, new
// articles, content updates and learning notes — shown beneath the "How I
// built this" explainer. Curated by hand (not auto-generated from git) and
// editable in the CMS as a single-file list, so each entry can say in human
// terms what changed and why. One `changelog.json` carries the whole list.
const changelogSchema = z.object({
  changelog: z.array(
    z.object({
      date: z.coerce.date(),
      title: z.string(),
      description: z.string(),
      // Optional category, used only for the small coloured badge on each
      // entry. Blank is fine — the editor serialises a cleared field as ''.
      type: z.preprocess(
        blankAsUndefined,
        z.enum(['new', 'fix', 'update', 'article', 'note']).optional()
      ),
    })
  ),
});

// --- Media perception of policing ------------------------------------------
// Per-YEAR DERIVED aggregates of UK news coverage about policing (word
// frequencies, sentiment, themed-lexicon scores, named-entity counts) for the
// "Perception of the Police in Online Media" data story. Mirrors the news
// collection's hard rule: ONLY derived numbers plus provenance (headline,
// source, link, date) are stored — NEVER full article text. Produced by a
// reproducible fetch/seed step and normalised by scripts/build-perception.mjs.
// One file per year; index.json is the manifest; context.json is the social-
// media overlay. The three coexist via a discriminated union on `kind`.
const perceptionWord = z.object({ term: z.string(), count: z.number(), ratePer10k: z.number() });
const perceptionLex = z.object({ items: z.number(), ratePer10k: z.number() });
const perceptionEntity = z.object({
  name: z.string(),
  type: z.enum(['force', 'leader', 'officer', 'role']),
  count: z.number(),
  ratePer10k: z.number(),
});
const perceptionSentiment = z.object({
  mean: z.number(), // [-1, 1] toward the police
  positive: z.number(),
  neutral: z.number(),
  negative: z.number(),
  gdeltToneMean: z.number().nullable().default(null),
});
// Themed-lexicon counts, keyed by theme. A flexible record (rather than a fixed
// object) so the committed data validates whether it carries the original five
// themes or the current six (trust, misconduct, race, terrorism, protest,
// reform) — the front-end renders whichever keys are present.
const perceptionLexicons = z.record(z.string(), perceptionLex);
const perceptionFacet = z.object({
  corpusTokens: z.number(),
  topWords: z.array(perceptionWord).default([]),
  sentiment: perceptionSentiment,
  lexicons: perceptionLexicons,
  entities: z.array(perceptionEntity).default([]),
});
// A single named force's lighter "journey" aggregate for a year (volume + tone
// + top words), keyed by force id under a year's optional `forceBreakdown`.
const perceptionForceTrend = z.object({
  name: z.string(),
  volume: z.number().default(0), // total matching articles (coverage volume)
  tone: z.number().nullable().default(null), // GDELT measured tone mean
  sentiment: perceptionSentiment,
  topWords: z.array(perceptionWord).default([]),
});
const perceptionProvenance = z.object({
  generatedAt: z.string(),
  method: z.string(), // guardian | gdelt | mediacloud | websearch | hybrid | seed
  sourcesUsed: z.array(z.string()).default([]),
  itemCount: z.number().default(0),
  diversityIndex: z.number().nullable().default(null), // normalised entropy 0..1
  sparse: z.boolean().default(false),
  sample: z.boolean().default(false), // illustrative data, awaiting a live fetch
  notes: z.string().default(''),
});
const perceptionSource = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string(),
  date: z.string(),
  outletType: z.enum(['broadsheet', 'tabloid', 'broadcaster', 'regional', 'trade', 'official', 'other']).default('other'),
});

// A single YEAR file.
const perceptionYear = z.object({
  kind: z.literal('year'),
  schemaVersion: z.number().default(1),
  year: z.number(),
  provenance: perceptionProvenance,
  sources: z.array(perceptionSource).default([]),
  facets: z.object({
    'police-general': perceptionFacet,
    forces: perceptionFacet,
    'leaders-officers-staff': perceptionFacet,
  }),
  // Optional per-force breakdown (named force id → its journey aggregate). Added
  // by the GDELT per-force pass; absent on years not yet pulled for forces.
  forceBreakdown: z.record(z.string(), perceptionForceTrend).optional(),
});

// The manifest (index.json): year list + global maxima for shared scaling.
const perceptionIndex = z.object({
  kind: z.literal('index'),
  schemaVersion: z.number().default(1),
  years: z.array(z.number()).default([]),
  methodologyVersion: z.string(),
  maxima: z.object({ wordRate: z.number(), lexRate: z.number(), entityRate: z.number(), forceWordRate: z.number().default(0) }),
  builtAt: z.string(),
  sample: z.boolean().default(false),
});

// The social-media overlay (context.json): dated milestone markers + the UK
// social-news-adoption series, each carrying a source URL. Hand-curated.
const perceptionContext = z.object({
  kind: z.literal('context'),
  schemaVersion: z.number().default(1),
  milestones: z
    .array(
      z.object({
        date: z.string(), // 'YYYY-MM' or 'YYYY'
        label: z.string(),
        detail: z.string().default(''),
        url: z.string().default(''),
      })
    )
    .default([]),
  adoption: z
    .array(z.object({ year: z.number(), share: z.number(), note: z.string().default('') }))
    .default([]),
  // Official survey confidence (ONS Crime Survey for England & Wales), so the
  // tool can plot measured public confidence against the headline-tone series.
  // goodJob = "police do a good/excellent job"; localConfidence = "confidence in
  // local police"; both % and nullable (the CSEW was suspended in 2021–22 for
  // COVID — null years are drawn as a break in the line, never interpolated).
  confidence: z
    .array(
      z.object({
        year: z.number(),
        goodJob: z.number().nullable().default(null),
        localConfidence: z.number().nullable().default(null),
        note: z.string().default(''),
      })
    )
    .default([]),
});

const perceptionSchema = z.discriminatedUnion('kind', [perceptionYear, perceptionIndex, perceptionContext]);

export const collections = {
  articles: defineCollection({ type: 'content', schema: articleSchema }),
  pages: defineCollection({ type: 'content', schema: pagesSchema }),
  topics: defineCollection({ type: 'data', schema: topicsSchema }),
  books: defineCollection({ type: 'data', schema: booksSchema }),
  resources: defineCollection({ type: 'data', schema: resourcesSchema }),
  policedata: defineCollection({ type: 'data', schema: policeDataSchema }),
  news: defineCollection({ type: 'data', schema: newsSchema }),
  changelog: defineCollection({ type: 'data', schema: changelogSchema }),
  perception: defineCollection({ type: 'data', schema: perceptionSchema }),
};
