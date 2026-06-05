import { defineCollection, z } from 'astro:content';

const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().default(false),
  author: z.string().default('Nathan Tracey'),
});

export const collections = {
  'police-policy': defineCollection({ type: 'content', schema: articleSchema }),
  'public-policy': defineCollection({ type: 'content', schema: articleSchema }),
  'other': defineCollection({ type: 'content', schema: articleSchema }),
};
