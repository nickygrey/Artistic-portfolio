import { defineConfig } from '@playwright/test';

// Browser tests against the production build (`astro preview`), for behaviour
// that only exists there — notably the Content Security Policy.
export default defineConfig({
  testDir: './tests/prod',
  timeout: 60000,
  use: { baseURL: 'http://localhost:4339', channel: 'chrome' },
  webServer: {
    // --ignore-lock keeps the preview in the foreground (Astro 7 backgrounds it when it detects a coding agent).
    command: 'npm run build && npx astro preview --port 4339 --ignore-lock',
    url: 'http://localhost:4339',
    reuseExistingServer: false,
    timeout: 180000,
  },
});
