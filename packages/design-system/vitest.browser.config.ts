import { defineConfig } from 'vitest/config';
import { defineBrowserCommand, playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

type EmulatedMediaOptions = {
  colorScheme: 'dark' | 'light' | 'no-preference' | null;
  forcedColors: 'active' | 'none' | null;
};

/**
 * Vitest browser provider config (Chromium).
 *
 * Includes both `*.browser.test` (legacy real-browser tests) and
 * `*.cssom.test` (L3 CSSOM harness tests, see ADR-test-environment-strategy).
 *
 * The Tailwind 4 Vite plugin is required so resolved CSS variables are
 * available in the test page. Without it, `getComputedStyle(root)` would
 * return empty strings even in Chromium and the harness would fail with
 * a "tailwind layer did not load" diagnostic.
 *
 * The shared CSS entry (`src/__tests__/cssom-harness.css`) imports
 * `tailwindcss` plus the generated theme files so primitives can be
 * styled exactly as production.
 */
export default defineConfig({
  plugins: [tailwindcss()],
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'vitest-browser-react',
    ],
  },
  resolve: {
    alias: {
      '@mfe/design-system': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    name: 'browser',
    root: path.resolve(__dirname),
    browser: {
      enabled: true,
      // Required even outside CI: Badge acceptance must never open an app window.
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      commands: {
        emulateBadgeMedia: defineBrowserCommand(async ({ page }, options: EmulatedMediaOptions) => {
          await page.emulateMedia({
            colorScheme: options.colorScheme,
            forcedColors: options.forcedColors,
          });
        }),
      },
    },
    include: ['src/**/*.browser.test.{ts,tsx}', 'src/**/*.cssom.test.{ts,tsx}'],
    setupFiles: ['./src/__tests__/cssom-setup.ts'],
    // Visual tests excluded until toMatchImageSnapshot plugin is installed
    // include: ['src/**/*.visual.test.{ts,tsx}'],
  },
});
