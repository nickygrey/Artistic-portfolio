import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4329',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev -- --port 4329',
    url: 'http://localhost:4329',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
