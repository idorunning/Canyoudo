import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const police = await getCollection('police-policy', ({ data }) => !data.draft);
  const publicCol = await getCollection('public-policy', ({ data }) => !data.draft);
  const other = await getCollection('other', ({ data }) => !data.draft);

  const items = [
    ...police.map(a => ({ ...a, section: 'police-policy' })),
    ...publicCol.map(a => ({ ...a, section: 'public-policy' })),
    ...other.map(a => ({ ...a, section: 'other' })),
  ].sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

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
