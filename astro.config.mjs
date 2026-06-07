import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import rehypeTopicLinks from './src/plugins/rehype-topic-links.mjs';

export default defineConfig({
  site: 'https://thinkingaboutpolicing.org',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap(),
    mdx(),
  ],
  markdown: {
    // Auto-link dictionary topics in article bodies (MDX inherits this).
    rehypePlugins: [rehypeTopicLinks],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
