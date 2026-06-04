import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://thinkingaboutpolicing.co.uk',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap(),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
