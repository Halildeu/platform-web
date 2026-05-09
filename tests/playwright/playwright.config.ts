import { defineConfig, devices } from '@playwright/test';

const executablePath = (process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '').trim();
const treatInsecureOriginAsSecure = (
  process.env.PLAYWRIGHT_TREAT_INSECURE_AS_SECURE_ORIGIN ?? ''
).trim();
const chromiumArgs = treatInsecureOriginAsSecure
  ? [`--unsafely-treat-insecure-origin-as-secure=${treatInsecureOriginAsSecure}`]
  : [];

export default defineConfig({
  testDir: __dirname,
  timeout: 60 * 1000,
  // CI runs auth-transport-contract against a freshly-built Module
  // Federation host where the bootstrap chain (api-gateway proxy +
  // mfe_* remote pre-bundling + auth.cookie + authz.me) routinely
  // takes longer than the 10 s `waitForTransportReady` default on a
  // cold runner. The gate has been advisory since PR #310 (commit
  // 583f36e6) — single-shot CI flakes have produced 5 consecutive
  // PR-noise reports even though the underlying contract is healthy
  // on warm runs. Two retries let a real regression slow ALL three
  // attempts (still visible) while normal CI variance lands on a
  // later pass.
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath || chromiumArgs.length > 0
          ? {
              launchOptions: {
                ...(executablePath ? { executablePath } : {}),
                ...(chromiumArgs.length > 0 ? { args: chromiumArgs } : {}),
              },
            }
          : {}),
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
