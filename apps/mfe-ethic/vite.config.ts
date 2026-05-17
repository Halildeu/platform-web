import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
// Faz 21.8 PR-X8: inline modulepreload helper to break the
// auth ↔ design-system MF loadShare runtime cycle.
import { mfPreloadHelperIsolation } from '../../scripts/vite-plugins/mf-preload-helper-isolation';
// PERF-INIT-V2.1 V3-B1a: optional bundle analyzer (ANALYZE_BUNDLE=1 gated).
import { bundleVisualizer } from '../../scripts/vite-plugins/bundle-visualizer';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const deps = pkg.dependencies as Record<string, string>;
const singleton = (
  shareKey: string,
  versionKey: string = shareKey,
  fallback: string | boolean = false,
  extra: Record<string, boolean | string> = {},
) => ({
  singleton: true,
  strictVersion: true,
  requiredVersion: deps[versionKey] ?? fallback,
  ...extra,
});

const HOST_ONLY_STUB_VERSION = '0.0.0';
const hostOnly = (
  shareKey: string,
  versionKey: string = shareKey,
  fallback: string | boolean = false,
) => singleton(shareKey, versionKey, fallback, { import: false, version: HOST_ONLY_STUB_VERSION });

// PR-B2-rollout: convert @tanstack/react-query to hostOnly().  Shell
// already declares it with `singleton: true, eager: true`; remote should
// consume from host's share-scope rather than ship its own copy.
const sharedCore = {
  react: hostOnly('react'),
  'react-dom': hostOnly('react-dom'),
  'react-router': hostOnly('react-router'),
  'react-router-dom': hostOnly('react-router-dom'),
  '@reduxjs/toolkit': hostOnly('@reduxjs/toolkit'),
  'react-redux': hostOnly('react-redux'),
  '@tanstack/react-query': hostOnly('@tanstack/react-query'),
};
const sharedProdOnly = {
  '@mfe/design-system': hostOnly('@mfe/design-system'),
  clsx: singleton('clsx'),
  'tailwind-merge': singleton('tailwind-merge'),
};

const isTest = !!process.env['VITEST'];

export default defineConfig(({ mode }) => ({
  plugins: [
    // PERF-INIT-V2.1 V3-B1a: bundle analyzer (env-gated, returns [] when off)
    ...bundleVisualizer({ mfeName: 'mfe-ethic' }),
    react(),
    tailwindcss(),
    ...(isTest
      ? []
      : [
          federation({
            name: 'mfe_ethic',
            filename: 'remoteEntry.js',
            dts: false,
            remotes: {},
            exposes: {
              './EthicApp': './src/App.tsx',
            },
            shared: {
              ...sharedCore,
              ...(mode === 'production' ? sharedProdOnly : {}),
            },
          }),
          mfPreloadHelperIsolation(),
        ]),
  ],

  resolve: {
    alias: [
      {
        find: '@mfe/design-system',
        replacement: path.resolve(__dirname, '../../packages/design-system/src'),
      },
    ],
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router',
      'react-router-dom',
      '@reduxjs/toolkit',
      'react-redux',
      'clsx',
      'tailwind-merge',
    ],
    exclude: [],
  },

  server: {
    host: '127.0.0.1',
    port: 3002,
    strictPort: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },

  build: {
    target: 'esnext',
    outDir: 'dist',
    rolldownOptions: {},
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    resolve: {
      alias: {
        'mfe_shell/logic': '/src/__mocks__/mfe-shell.ts',
      },
    },
  },
}));
