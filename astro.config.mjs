import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://canyoudo.uk',
  output: 'static',
  build: {
    format: 'directory',
  },
});
