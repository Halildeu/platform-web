/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
// Faz 21.8 PR-X8: inline modulepreload helper to break the
// auth ↔ design-system MF loadShare runtime cycle.
import { mfPreloadHelperIsolation } from '../../scripts/vite-plugins/mf-preload-helper-isolation';

function readEnvString(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return fallback;
}

function normalizeBasePath(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

/* ------------------------------------------------------------------ */
/*  Read package.json deps for MF shared config                        */
/* ------------------------------------------------------------------ */

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
  'ag-grid-community': singleton('ag-grid-community'),
  'ag-grid-enterprise': singleton('ag-grid-enterprise'),
  'ag-grid-react': singleton('ag-grid-react'),
  '@platform/capabilities': singleton('@platform/capabilities', false),
  '@mfe/design-system': singleton('@mfe/design-system', false),
  '@mfe/shared-http': singleton('@mfe/shared-http', false),
  '@mfe/i18n-dicts': singleton('@mfe/i18n-dicts', false),
  // R15 user-visible repair follow-up (Codex 019e2aef iter-3):
  // mfe-reporting was missing the `@mfe/auth` shared singleton, so its
  // `useAuthz()` hook resolved against a fresh React Context whose
  // default value is `isSuperAdmin: () => false` / `canViewReport: () => false`.
  // Even after the host shell's PermissionProvider had `superAdmin: true`
  // and 4 reportGroup MANAGE grants, the reporting bundle inside the
  // module-federation boundary never observed it. ReportingHub's filter
  // (`m() ? d : d.filter(e => !e.reportGroup || p(e.reportGroup))`) then
  // dropped all 31 dynamic reports. Same pattern fix already lives in
  // mfe-users (PR around Codex thread 019e1bed) and mfe-access — adding
  // it here closes the cross-MFE singleton gap.
  '@mfe/auth': { singleton: true, requiredVersion: false as const },
};

/* ------------------------------------------------------------------ */
/*  Vite Config                                                         */
/* ------------------------------------------------------------------ */

export default defineConfig(({ mode }) => {
  const appBasePath = normalizeBasePath(
    readEnvString(['APP_BASE_PATH', 'VITE_APP_BASE_PATH'], '/'),
  );
  const shellRemoteEntry = readEnvString(
    ['MFE_SHELL_URL', 'VITE_MFE_SHELL_URL'],
    'http://localhost:3000/remoteEntry.js',
  );

  return {
    base: appBasePath,
    root: __dirname,
    publicDir: 'public',

    plugins: [
      react(),
      federation({
        name: 'mfe_reporting',
        filename: 'remoteEntry.js',
        dts: false,
        remotes: {
          mfe_shell: { type: 'module', name: 'mfe_shell', entry: shellRemoteEntry },
        },
        exposes: {
          './ReportingApp': './src/App.tsx',
          './grid': './src/grid/index.ts',
          './shell-services': './src/app/services/shell-services.ts',
        },
        shared: {
          /* Always share the full set — remove isSingleDomainBuild conditional
           * to prevent duplicate React instances in single-domain builds. */
          ...sharedCore,
          ...(mode === 'production' ? sharedProdOnly : {}),
        },
      }),
      mfPreloadHelperIsolation(),
    ],

    resolve: {
      alias: [
        {
          find: '@platform/capabilities',
          replacement: path.resolve(__dirname, '../../packages/platform-capabilities/src'),
        },
        {
          find: '@mfe/x-charts',
          replacement: path.resolve(__dirname, '../../packages/x-charts/src'),
        },
        {
          find: '@mfe/design-system',
          replacement: path.resolve(__dirname, '../../packages/design-system/src'),
        },
        {
          find: '@mfe/shared-http',
          replacement: path.resolve(__dirname, '../../packages/shared-http/src'),
        },
        {
          // R15 follow-up: alias @mfe/auth so the dev build resolves to the
          // host's PermissionProvider source. Mirrors mfe-users vite alias.
          find: '@mfe/auth',
          replacement: path.resolve(__dirname, '../../packages/auth/src'),
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
      port: 3007,
      strictPort: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
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
        'axios',
        'clsx',
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
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
