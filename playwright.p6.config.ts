import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/interaction',
  testMatch: '**/p6-*.spec.ts',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-p6', open: 'never' }]],
  outputDir: 'test-results/p6-acceptance',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'p6-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run dev:interview-evidence:acceptance',
    url: 'http://127.0.0.1:3011/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
