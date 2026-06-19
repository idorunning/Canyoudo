// Static endpoint that renders one branded 1200×630 social-share card per
// article at build time, written to dist/og/<section>/<slug>.png. The card is
// hand-authored SVG rasterised with `sharp` (already a devDependency, and the
// same technique scripts/generate-og-assets.mjs uses for the static default
// card) — no extra dependencies or vendored fonts. ArticleLayout references the
// resulting URL as og:image / twitter:image for every article.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import sharp from 'sharp';
import { renderCardSvg } from '../../../lib/og-card.mjs';
import { SECTION_LABELS } from '../../../content/config';

export const getStaticPaths: GetStaticPaths = async () => {
  // Same enumeration as src/pages/[section]/[slug].astro, so every published
  // article URL has a matching card.
  const articles = await getCollection('articles', ({ data }) => !data.draft);
  return articles.map((article) => ({
    params: { section: article.data.section, slug: article.slug },
    props: {
      title: article.data.title,
      section: SECTION_LABELS[article.data.section],
      author: article.data.author,
    },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const { title, section, author } = props as { title: string; section: string; author: string };
  const svg = renderCardSvg({ title, section, author });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
