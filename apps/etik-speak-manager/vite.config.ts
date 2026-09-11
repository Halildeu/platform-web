import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { buildRuntimeEnv, injectRuntimeEnv } from './src/runtime-env';

// Build-time env the design system reads in the browser through `window.__env__`
// (packages/design-system/src/lib/ag-grid-license.ts). Without it the manager bundle
// carried no AG Grid licence key and every grid printed the Enterprise licence banner
// (platform-web#1155). Explicit allowlist — see runtime-env.ts.
const runtimeEnv = buildRuntimeEnv(process.env);

export default defineConfig({
  base: '/ethic/',
  plugins: [
    {
      name: 'inject-runtime-env',
      transformIndexHtml: (html) => injectRuntimeEnv(html, runtimeEnv),
    },
    react(),
    tailwindcss(),
  ],
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
