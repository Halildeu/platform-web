import { defineConfig } from '@playwright/test';
import path from 'node:path';

const port = Number(process.env.MEETING_SESSION_TEST_PORT || 4317);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/meeting-session-selection',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL, browserName: 'chromium', headless: true, screenshot: 'only-on-failure' },
  webServer: {
    command: `npm exec -- vite --host 127.0.0.1 --port ${port}`,
    cwd: path.resolve(__dirname, 'apps/mfe-meeting'),
    url: baseURL,
    reuseExistingServer: false,
  },
});
