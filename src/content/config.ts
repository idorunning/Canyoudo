import { defineCollection, z } from 'astro:content';

export const SECTIONS = ['police-policy', 'public-policy', 'other'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  'police-policy': 'Police Policy',
  'public-policy': 'Public Policy',
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

export const collections = {
  articles: defineCollection({ type: 'content', schema: articleSchema }),
};
