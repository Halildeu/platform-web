import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// Build-time env the design system reads at runtime through `process.env` /
// `window.__env__` (packages/design-system/src/lib/ag-grid-license.ts). The shell
// does the same in its buildRuntimeEnv(); without it the manager bundle carried no
// AG Grid licence key and every grid printed the Enterprise licence banner
// (platform-web#1155). Only VITE_* keys, so nothing else from the build host leaks in.
const runtimeEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => key.startsWith('VITE_') && typeof value === 'string'),
);

export default defineConfig({
  base: '/ethic/',
  plugins: [react(), tailwindcss()],
  define: { 'process.env': JSON.stringify(runtimeEnv) },
  resolve: {
    alias: {
      // The real design system, resolved from source exactly as mfe-shell does.
      // The cell used to alias this to a local 83-line stand-in, which is why the
      // manager panel looked nothing like the platform: mfe-ethic asked for the
      // design system and got a hand-rolled imitation with invented tokens.
      '@mfe/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@mfe/shared-http': path.resolve(__dirname, 'src/standalone-http.ts'),
    },
  },
  build: { target: 'es2022', outDir: 'dist' },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
