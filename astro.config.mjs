import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import rehypeTopicLinks from './src/plugins/rehype-topic-links.mjs';
import rehypeResponsiveTables from './src/plugins/rehype-responsive-tables.mjs';
import rehypeImageDimensions from './src/plugins/rehype-image-dimensions.mjs';

export default defineConfig({
  site: 'https://thinkingaboutpolicing.org',
  // 'hybrid' prerenders every page to static HTML by default (same as before),
  // except the admin-only routes (Keystatic, /dashboard) which opt out with
  // `export const prerender = false` so they can run as live Netlify Functions.
  output: 'hybrid',
  adapter: netlify(),
  integrations: [
    tailwind({ applyBaseStyles: false }),
    // Stamp every sitemap entry with a build-time `lastmod` so Google gets a
    // freshness hint and reschedules crawls after each deploy. (A per-page
    // lastmod would be richer, but the integration doesn't expose page content
    // here; the build date is a safe, honest floor.)
    sitemap({
      filter: (page) =>
        !page.includes('/design-preview') &&
        !page.includes('/offline') &&
        !page.includes('/library'),
      serialize(item) {
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
    mdx(),
    // Article editor (replaces Sveltia). Registers /keystatic and
    // /api/keystatic/* as live routes; keystatic.config.ts defines the
    // content schema. react() is required because Keystatic's admin UI
    // renders as a client:only React app.
    react(),
    keystatic(),
  ],
  markdown: {
    // Auto-link dictionary topics in article bodies (MDX inherits this), then
    // make data tables responsive (scroll wrapper + per-cell labels for the
    // mobile card layout).
    rehypePlugins: [rehypeTopicLinks, rehypeResponsiveTables, rehypeImageDimensions],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
