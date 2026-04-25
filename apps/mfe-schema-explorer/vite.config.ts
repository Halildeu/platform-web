/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

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
const hostOnly = (shareKey: string, versionKey: string = shareKey, fallback: string | boolean = false) =>
  singleton(shareKey, versionKey, fallback, { import: false, version: HOST_ONLY_STUB_VERSION });

const sharedCore = {
  react: hostOnly('react'),
  'react-dom': hostOnly('react-dom'),
  'react-router': hostOnly('react-router'),
  'react-router-dom': hostOnly('react-router-dom'),
  '@tanstack/react-query': singleton('@tanstack/react-query'),
};
const sharedProdOnly = {};

/* 2026-04-25 Faz 19.MSSQL.K — Build-time env-driven mfe_shell remote URL.
 * Önceki hardcoded 'http://localhost:3000/remoteEntry.js' → tarayıcı runtime'da
 * single-domain build'inde net::ERR_CONNECTION_REFUSED veriyordu (çünkü prod'da
 * localhost:3000 yok, mfe-shell aynı origin'de /remoteEntry.js).
 * Pattern: mfe-reporting + mfe-users ile aynı (env-driven via build-single-domain.mjs).
 */
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

  return {
    plugins: [
      react(),
      federation({
        name: 'mfe_schema_explorer',
        filename: 'remoteEntry.js',
        dts: false,
        remotes: {
          mfe_shell: { type: 'module', name: 'mfe_shell', entry: shellRemoteEntry },
        },
        exposes: {
          './SchemaExplorerApp': './src/App.tsx',
        },
        shared: {
          ...sharedCore,
          ...(mode === 'production' ? sharedProdOnly : {}),
        },
      }),
    ],

    resolve: {
      alias: [
        { find: '@tanstack/react-query', replacement: path.resolve(__dirname, 'node_modules/@tanstack/react-query/build/modern/index.js') },
      ],
    },

    server: {
      host: '127.0.0.1',
      port: 3008,
      strictPort: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      proxy: {
        '/api/v1/schema': {
          target: 'http://localhost:8096',
          changeOrigin: true,
        },
      },
    },

    optimizeDeps: {
      include: [
        'react', 'react-dom', 'react-dom/client',
        'react/jsx-runtime', 'react/jsx-dev-runtime',
        'react-router', 'react-router-dom',
        'axios', 'clsx',
        'cytoscape', 'cytoscape-fcose',
      ],
      exclude: ['mfe_shell', '@tanstack/react-query'],
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: mode === 'development',
    },
  };
});
