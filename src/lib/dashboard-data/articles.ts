// Local article metadata for the /dashboard/articles power table: everything
// the content collection already knows (including drafts, which the public
// site filters out), plus computed reading time. No remote calls, so unlike
// the other dashboard-data modules this can't fail soft — it's always ok.

import { getCollection } from 'astro:content';
import readingTime from 'reading-time';

export type ArticleRow = {
  slug: string;
  title: string;
  section: string;
  pubDate: Date;
  updatedDate?: Date;
  draft: boolean;
  tags: string[];
  format: 'md' | 'mdx'; // .mdx interactive articles aren't editable in Keystatic
  words: number;
  minutes: number;
};

export async function getArticleRows(): Promise<ArticleRow[]> {
  const articles = await getCollection('articles');
  return articles
    .map((entry) => {
      const rt = readingTime(entry.body);
      return {
        slug: entry.slug,
        title: entry.data.title,
        section: entry.data.section,
        pubDate: entry.data.pubDate,
        updatedDate: entry.data.updatedDate,
        draft: entry.data.draft,
        tags: entry.data.tags ?? [],
        format: entry.id.endsWith('.mdx') ? ('mdx' as const) : ('md' as const),
        words: rt.words,
        minutes: Math.max(1, Math.round(rt.minutes)),
      };
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}
