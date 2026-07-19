// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://nickygrey.com',
  base: '/',
  output: 'static',
  build: {
    assets: 'assets'
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de'],
    routing: {
      prefixDefaultLocale: false
    }
  }
});
