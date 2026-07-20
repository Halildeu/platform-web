import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/ethic/',
  plugins: [react()],
  resolve: {
    alias: {
      '@mfe/design-system': path.resolve(__dirname, 'src/ui-adapter.tsx'),
      '@mfe/shared-http': path.resolve(__dirname, 'src/standalone-http.ts'),
    },
  },
  build: { target: 'es2022', outDir: 'dist' },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
