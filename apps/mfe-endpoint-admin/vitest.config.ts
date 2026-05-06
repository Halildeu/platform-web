import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@mfe/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@mfe/design-system/advanced/data-grid': path.resolve(
        __dirname,
        '../../packages/design-system/src/advanced/data-grid',
      ),
      '@mfe/auth': path.resolve(__dirname, '../../packages/auth/src'),
      '@mfe/shared-http': path.resolve(__dirname, '../../packages/shared-http/src'),
      '@mfe/i18n-dicts': path.resolve(__dirname, '../../packages/i18n-dicts/src'),
      'mfe_shell/i18n': path.resolve(__dirname, '__mocks__/mfe-shell-i18n.ts'),
    },
  },
  test: {
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    // jsdom 29 + Node 22 undici: Request constructor rejects relative
    // URLs unless the document URL is set explicitly. Without this the
    // RTK Query slice (`baseUrl: '/api/v1'`) throws ERR_INVALID_URL
    // before the mocked `fetch` ever runs.
    environmentOptions: {
      jsdom: { url: 'http://localhost' },
    },
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
