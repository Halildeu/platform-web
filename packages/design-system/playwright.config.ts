import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Storybook is configured at the monorepo root (/web/.storybook/main.ts)
// and serves design-system stories on port 6006.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './src/__visual__',
  testMatch: '**/*.visual.ts',
  snapshotDir: './src/__visual__/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{projectName}/{arg}{ext}',
  outputDir: './src/__visual__/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  // PW_STORYBOOK_STATIC=1 → serve a pre-built Storybook from the
  // `storybook-static` directory at the monorepo root using Python's
  // built-in HTTP server (no extra dependency needed on Ubuntu runners).
  // Default (dev mode) keeps the developer ergonomics of `npm run
  // storybook` for local snapshot work.
  webServer:
    process.env.PW_STORYBOOK_STATIC === '1'
      ? {
          command: 'python3 -m http.server 6006 --directory storybook-static',
          cwd: monorepoRoot,
          port: 6006,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        }
      : {
          command: 'npm run storybook',
          cwd: monorepoRoot,
          port: 6006,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
