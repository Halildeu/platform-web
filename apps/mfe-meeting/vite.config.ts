import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

import { bundleVisualizer } from '../../scripts/vite-plugins/bundle-visualizer';
import { mfPreloadHelperIsolation } from '../../scripts/vite-plugins/mf-preload-helper-isolation';

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

const isTest = !!process.env['VITEST'];
const enableDevFederation = process.env['MFE_MEETING_DEV_FEDERATION'] === '1';

export default defineConfig(({ mode }) => ({
  plugins: [
    ...bundleVisualizer({ mfeName: 'mfe-meeting' }),
    react(),
    tailwindcss(),
    ...(isTest || (mode !== 'production' && !enableDevFederation)
      ? []
      : [
          federation({
            name: 'mfe_meeting',
            filename: 'remoteEntry.js',
            dts: false,
            remotes: {},
            exposes: {
              './MeetingApp': './src/App.tsx',
              './shell-services': './src/shell-services.ts',
            },
            shared: {
              '@mfe/shared-http': singleton('@mfe/shared-http', false),
              react: hostOnly('react'),
              'react-dom': hostOnly('react-dom'),
              'react/jsx-runtime': hostOnly('react/jsx-runtime', 'react'),
              'react/jsx-dev-runtime': hostOnly('react/jsx-dev-runtime', 'react'),
            },
          }),
          mfPreloadHelperIsolation(),
        ]),
  ],
  server: {
    host: '127.0.0.1',
    port: 3010,
    strictPort: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'lucide-react',
    ],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    chunkSizeWarningLimit: 1024,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
}));
