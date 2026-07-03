/// <reference types="vite/client" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
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

// jsx-runtime host-shared so plugin-react auto-injected imports resolve through the
// federation loadShare scope (aynı pattern: mfe-schema-explorer/vite.config.ts).
const sharedCore = {
  react: hostOnly('react'),
  'react-dom': hostOnly('react-dom'),
  'react/jsx-runtime': hostOnly('react/jsx-runtime', 'react'),
  'react/jsx-dev-runtime': hostOnly('react/jsx-dev-runtime', 'react'),
  'react-router': hostOnly('react-router'),
  'react-router-dom': hostOnly('react-router-dom'),
  '@tanstack/react-query': singleton('@tanstack/react-query'),
};
// @mfe/design-system MF singleton (mfe-users pattern): shell zaten eager singleton
// olarak sağlar; remote prod'da host'un tek örneğini tüketir (çift-bundle YOK).
// Dev'de DS kopyası bundle edilir; ancak react/react-dom hostOnly (import:false)
// olduğu için DESTEKLENEN render path SHELL'dir — standalone dev render OLMAZ.
// requiredVersion "*" + strictVersion: host'un gerçek sürümü her zaman karşılar.
const sharedProdOnly = {
  '@mfe/design-system': singleton('@mfe/design-system', '@mfe/design-system', false),
};

function readEnvString(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) return normalized;
  }
  return fallback;
}

export default defineConfig(({ mode }) => {
  const shellRemoteEntry = readEnvString(
    ['MFE_SHELL_URL', 'VITE_MFE_SHELL_URL'],
    'http://localhost:3000/remoteEntry.js',
  );
  // ADR-0019: ATS backend'e AYRI namespace (/api/ats/v1 -> ATS /api/v1). Raw /api/v1
  // platform gateway ile çakışır; same-origin proxy CORS/CSRF yüzeyini daraltır.
  const atsBackend = readEnvString(
    ['ATS_BACKEND_URL', 'VITE_ATS_BACKEND_URL'],
    'http://localhost:8080',
  );

  return {
    plugins: [
      react(),
      federation({
        name: 'mfe_interview_evidence',
        filename: 'remoteEntry.js',
        dts: false,
        remotes: {
          mfe_shell: { type: 'module', name: 'mfe_shell', entry: shellRemoteEntry },
        },
        exposes: {
          './InterviewEvidenceApp': './src/App.tsx',
        },
        shared: {
          ...sharedCore,
          ...(mode === 'production' ? sharedProdOnly : {}),
        },
      }),
      mfPreloadHelperIsolation(),
    ],

    resolve: {
      alias: [
        // @mfe/design-system'i kaynağa (src) çöz — mfe-ethic/mfe-users pattern.
        // String alias prefix eşleşmesi subpath'i de kapsar (…/design-system/*).
        {
          find: '@mfe/design-system',
          replacement: path.resolve(__dirname, '../../packages/design-system/src'),
        },
        {
          find: '@tanstack/react-query',
          replacement: path.resolve(
            __dirname,
            'node_modules/@tanstack/react-query/build/modern/index.js',
          ),
        },
      ],
    },

    server: {
      host: '127.0.0.1',
      port: 3011,
      strictPort: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      proxy: {
        '/api/ats': {
          target: atsBackend,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/ats/, '/api'),
        },
      },
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
        'clsx',
      ],
      exclude: ['mfe_shell', '@tanstack/react-query'],
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: mode === 'development',
    },

    // jsdom smoke: SegmentView/App yapısal render (mfe-ethic pattern). react
    // node_modules'den çözülür (federation hostOnly yalnız build'i etkiler);
    // @mfe/design-system yukarıdaki resolve.alias ile src'ye çözülür.
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
