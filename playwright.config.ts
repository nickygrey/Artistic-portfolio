import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4329',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    // Phones: Safari's engine on an iPhone, Chrome on Android. Only the phone suite runs here.
    { name: 'iphone', use: { ...devices['iPhone 13'] }, testMatch: /phone\.spec\.ts/ },
    { name: 'android', use: { ...devices['Pixel 7'], channel: 'chrome' }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev -- --port 4329',
    url: 'http://localhost:4329',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
