import { defineConfig, devices } from '@playwright/test';

const acceptanceEnvironment = [
  'AUTH_MODE=permitAll',
  'VITE_AUTH_MODE=permitAll',
  'VITE_ENABLE_FAKE_AUTH=1',
  'VITE_SHELL_SKIP_REMOTE_SERVICES=1',
  'SHELL_SKIP_REMOTE_SERVICES=1',
  'VITE_SHELL_ENABLE_SUGGESTIONS_REMOTE=0',
  'SHELL_ENABLE_SUGGESTIONS_REMOTE=0',
  'VITE_SHELL_ENABLE_ETHIC_REMOTE=0',
  'SHELL_ENABLE_ETHIC_REMOTE=0',
  'VITE_SHELL_ENABLE_MEETING_REMOTE=0',
  'SHELL_ENABLE_MEETING_REMOTE=0',
  'VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE=0',
  'SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE=0',
  'VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE=0',
  'SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE=0',
  'VITE_SHELL_ENABLE_REPORTING_REMOTE=0',
  'SHELL_ENABLE_REPORTING_REMOTE=0',
  'VITE_SHELL_ENABLE_USERS_REMOTE=0',
  'SHELL_ENABLE_USERS_REMOTE=0',
  'VITE_SHELL_ENABLE_ACCESS_REMOTE=0',
  'SHELL_ENABLE_ACCESS_REMOTE=0',
  'VITE_SHELL_ENABLE_AUDIT_REMOTE=0',
  'SHELL_ENABLE_AUDIT_REMOTE=0',
  'VITE_SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE=0',
  'SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE=0',
].join(' ');

export default defineConfig({
  testDir: './e2e/interaction',
  testMatch: '**/fullats-authorized-access.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-fullats-access', open: 'never' }],
  ],
  outputDir: 'test-results/fullats-access-acceptance',
  use: {
    baseURL: 'http://127.0.0.1:3021',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'fullats-access-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `${acceptanceEnvironment} sh -c 'pnpm --filter mfe-shell build && pnpm --filter mfe-shell exec vite preview --host 127.0.0.1 --port 3021'`,
    url: 'http://127.0.0.1:3021/',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
