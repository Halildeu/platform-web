import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * L4 invariant visual matrix — dedicated Playwright config (PR-3).
 *
 * Codex thread 019df8eb iter-1 contract:
 *   - Independent of `playwright.config.ts` (which scans the legacy
 *     non-x-charts visual specs that PR-3 deliberately leaves untouched).
 *   - Chromium-only hard gate; Firefox/WebKit deferred to a follow-up.
 *   - Snapshot dir is scoped to `__snapshots__/invariants/` so the
 *     legacy `__snapshots__/<spec-name>/` tree never collides.
 *   - Test glob is also scoped to `invariants/` so the legacy
 *     `*.visual.ts` files never enter this runner.
 *   - Storybook static dir served via `PW_STORYBOOK_INVARIANTS_STATIC_DIR`
 *     env var so the workflow can build `.storybook-invariants` first
 *     (mismatch with the full Storybook bundle would silently use the
 *     wrong story set).
 *
 * Baseline production: `gh workflow run web-test-gate.yml -f mode=invariant-baseline`
 * uploads a Linux artifact; maintainer commits to the snapshot dir.
 * No auto-commit. See ADR §L4 + .github/workflows/web-test-gate.yml.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');
const storybookStaticDir =
  process.env.PW_STORYBOOK_INVARIANTS_STATIC_DIR ??
  path.join(monorepoRoot, 'storybook-static-invariants');

export default defineConfig({
  testDir: './src/__visual__/invariants',
  testMatch: '**/*.visual.test.ts',
  snapshotDir: './src/__visual__/__snapshots__/invariants',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{projectName}/{arg}{ext}',
  outputDir: './src/__visual__/test-results-invariants',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:6007',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // CI workflow builds `.storybook-invariants` into
    // `storybook-static-invariants/` and points
    // PW_STORYBOOK_INVARIANTS_STATIC_DIR at it. Locally, run:
    //   pnpm exec storybook build -c .storybook-invariants -o storybook-static-invariants
    // before invoking `playwright test --config playwright.invariants.config.ts`.
    //
    // Codex iter-3 LOW 4: `python3 -m http.server` over `npx http-server`
    // — first-time npx fetch is unnecessary network risk for a hard gate,
    // and python3 is preinstalled on every reasonable runner.
    command: `python3 -m http.server 6007 --directory "${storybookStaticDir}"`,
    url: 'http://127.0.0.1:6007/iframe.html?id=visual-invariants-themematrix--light',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
