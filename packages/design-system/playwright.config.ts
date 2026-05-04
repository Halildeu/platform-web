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
      // Faz 21.10 wave 8 — mobile-only fixtures (`*-mobile.visual.ts`)
      // carry their own viewport assumptions and snapshot baselines;
      // desktop projects skip them so we don't double-snapshot the
      // same composites at desktop resolution.
      testIgnore: '**/*-mobile.visual.ts',
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: '**/*-mobile.visual.ts',
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: '**/*-mobile.visual.ts',
    },
    {
      // Faz 21.10 wave 8 — mobile baseline (Pixel 5 ≈ 393×851 viewport).
      // Locks the wave 1-7 responsive primitives (KPICard padding,
      // ChartContainer header, ChartDashboard per-breakpoint columns,
      // SparklineChart fluid width/height, ChartToolbar wrap, ChartLegend
      // mobile gap) so future regressions are caught at the actual
      // viewport where the responsive fix is meaningful.
      name: 'mobile-pixel5',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/*-mobile.visual.ts',
    },
  ],
  // PW_STORYBOOK_STATIC_DIR → serve a pre-built Storybook from that
  // directory (relative to monorepo root) using Python's built-in HTTP
  // server. K5 uses `storybook-static-k5` (scoped config under
  // `.storybook-k5`); a future full visual sweep would use
  // `storybook-static`. Default (no env var) keeps `npm run storybook`
  // dev mode for local snapshot work.
  webServer: process.env.PW_STORYBOOK_STATIC_DIR
    ? {
        command: `python3 -m http.server 6006 --directory ${process.env.PW_STORYBOOK_STATIC_DIR}`,
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
