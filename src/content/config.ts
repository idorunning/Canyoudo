import { defineCollection, z } from 'astro:content';

export const SECTIONS = ['police-policy', 'public-policy', 'influential-people', 'other'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  'police-policy': 'Police Policy',
  'public-policy': 'Public Policy',
  'influential-people': 'Influential People',
  other: 'Other',
};

const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  // Which section the article belongs to. Changing this in the editor is what
  // "moves" an article between areas; it drives the /{section}/{slug} URL.
  section: z.enum(SECTIONS).default('police-policy'),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // Old paths to 301-redirect to this article — fill in when you move an
  // article between sections so the previous URL doesn't break.
  redirectFrom: z.array(z.string()).optional(),
  draft: z.boolean().default(false),
  author: z.string().default('Nathan Tracey'),
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

export const collections = {
  articles: defineCollection({ type: 'content', schema: articleSchema }),
  topics: defineCollection({ type: 'data', schema: topicsSchema }),
  books: defineCollection({ type: 'data', schema: booksSchema }),
  resources: defineCollection({ type: 'data', schema: resourcesSchema }),
};
