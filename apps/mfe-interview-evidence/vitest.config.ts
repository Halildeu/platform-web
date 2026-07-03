import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * jsdom smoke runner (mfe-meeting pattern). Kök `vitest.config.ts` `projects`
 * allowlist'i bu dosyayı çağırır (web-test-gate `test:workspace`). Ayrı config
 * olduğu için vite.config resolve.alias'ını DEVRALMAZ → `@mfe/design-system`
 * alias'ı burada tekrar tanımlanır (src'ye çözüm; App/SegmentView render eder).
 */
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@mfe/design-system',
        replacement: path.resolve(__dirname, '../../packages/design-system/src'),
      },
    ],
  },
  test: {
    name: 'mfe-interview-evidence',
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
