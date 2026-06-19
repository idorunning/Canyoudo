import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import rehypeTopicLinks from './src/plugins/rehype-topic-links.mjs';
import rehypeResponsiveTables from './src/plugins/rehype-responsive-tables.mjs';

export default defineConfig({
  site: 'https://thinkingaboutpolicing.org',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    // Stamp every sitemap entry with a build-time `lastmod` so Google gets a
    // freshness hint and reschedules crawls after each deploy. (A per-page
    // lastmod would be richer, but the integration doesn't expose page content
    // here; the build date is a safe, honest floor.)
    sitemap({
      serialize(item) {
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
    mdx(),
  ],
  markdown: {
    // Auto-link dictionary topics in article bodies (MDX inherits this), then
    // make data tables responsive (scroll wrapper + per-cell labels for the
    // mobile card layout).
    rehypePlugins: [rehypeTopicLinks, rehypeResponsiveTables],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
