import { defineConfig } from '@playwright/test';

// Browser tests against the production build (`astro preview`), for behaviour
// that only exists there — notably the Content Security Policy.
export default defineConfig({
  testDir: './tests/prod',
  timeout: 60000,
  use: { baseURL: 'http://localhost:4339', channel: 'chrome' },
  webServer: {
    command: 'npm run build && npx astro preview --port 4339',
    url: 'http://localhost:4339',
    reuseExistingServer: false,
    timeout: 180000,
  },
});
