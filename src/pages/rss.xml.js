import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const articles = await getCollection('articles', ({ data }) => !data.draft);

  const items = articles
    .map(a => ({ ...a, section: a.data.section }))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  return rss({
    title: 'Thinking About Policing',
    description: 'Evidence-based writing on policing, public policy, and the occasional historical puzzle. By Nathan Tracey.',
    site: context.site,
    items: items.map(item => ({
      title: item.data.title,
      pubDate: item.data.pubDate,
      description: item.data.description,
      link: `/${item.section}/${item.slug}/`,
    })),
    customData: `<language>en-gb</language>`,
  });
}
