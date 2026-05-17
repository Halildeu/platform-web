/// <reference types="vite/client" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
// Faz 21.8 PR-X8: inline modulepreload helper to break the
// auth ↔ design-system MF loadShare runtime cycle.
import { mfPreloadHelperIsolation } from '../../scripts/vite-plugins/mf-preload-helper-isolation';
// PERF-INIT-V2.1 V3-B1a: optional bundle analyzer (ANALYZE_BUNDLE=1 gated).
import { bundleVisualizer } from '../../scripts/vite-plugins/bundle-visualizer';

/* ------------------------------------------------------------------ */
/*  Env helpers — replaces webpack's DefinePlugin                      */
/* ------------------------------------------------------------------ */

function loadShellDotEnvLocal(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../mfe-shell/.env.local');
  if (!existsSync(envPath)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return result;
}

function buildRuntimeEnv(mode: string): Record<string, string> {
  const dotEnv = loadShellDotEnvLocal();
  const merged = { ...dotEnv, ...process.env };
  // AG Grid lisansı: VITE_ prefix filter zaten yakalar (single source =
  // VITE_AG_GRID_LICENSE_KEY). Hotfix single-source refactor; both
  // AG_GRID_LICENSE_KEY and VITE_AG_GRID_LICENSE_KEY explicit entries
  // dropped — the second flowed through `key.startsWith('VITE_')` already
  // and the first is no longer the canonical name.
  const allowlist = new Set(['NODE_ENV', 'AUTH_MODE']);
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!allowlist.has(key) && !key.startsWith('VITE_')) continue;
    if (typeof value === 'string') payload[key] = value;
  }
  payload.NODE_ENV ??= mode;
  return payload;
}

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
  'react-redux': hostOnly('react-redux'),
  '@reduxjs/toolkit': hostOnly('@reduxjs/toolkit'),
  '@tanstack/react-query': hostOnly('@tanstack/react-query'),
};
const sharedProdOnly = {
  'ag-grid-react': singleton('ag-grid-react'),
  'ag-grid-community': singleton('ag-grid-community'),
  'ag-grid-enterprise': singleton('ag-grid-enterprise'),
  // PERF-INIT-V2.1 B1a: hostOnly — consume @mfe/design-system from the host
  // share-scope; the prior singleton() shipped a ~1.7 MB-transfer copy per remote.
  '@mfe/design-system': hostOnly('@mfe/design-system'),
  '@mfe/shared-http': singleton('@mfe/shared-http', '@mfe/shared-http', false),
  '@mfe/i18n-dicts': singleton('@mfe/i18n-dicts', '@mfe/i18n-dicts', false),
  // Codex 019e1bed AGREE: @mfe/auth MF singleton — mfe-users PR-C2 ImpersonateAction
  // render gate `isAdmin = isSuperAdmin()` shell PermissionProvider'ın authz state'ine
  // erişebilsin. Önceki yapıda mfe-users `@mfe/auth`'ı share etmiyordu → duplicate
  // PermissionContext default'u (`isSuperAdmin: () => false`) → drawer'da Impersonate
  // section render edilmiyordu. Live federation diagnostic 2026-05-12 13:55 (testai):
  // `__mfe_internal__mfe_users.sharedKeys` listesinde `@mfe/auth` eksikti; bu PR
  // ekliyor. raw `{ singleton: true, requiredVersion: false }` pattern (mfe-access
  // PR E ile aynı) çünkü workspace package için `strictVersion: true` (helper
  // default) gereksiz risk.
  '@mfe/auth': { singleton: true, requiredVersion: false as const },
};

const isTest = !!process.env['VITEST'];

/* ------------------------------------------------------------------ */
/*  Vite Config                                                         */
/* ------------------------------------------------------------------ */

export default defineConfig(({ mode }) => {
  const runtimeEnv = buildRuntimeEnv(mode);
  const appBasePath = normalizeBasePath(
    readEnvString(['APP_BASE_PATH', 'VITE_APP_BASE_PATH'], '/'),
  );
  const shellRemoteEntry = readEnvString(
    ['MFE_SHELL_URL', 'VITE_MFE_SHELL_URL'],
    'http://localhost:3000/remoteEntry.js',
  );
  const reportingRemoteEntry = readEnvString(
    ['MFE_REPORTING_URL', 'VITE_MFE_REPORTING_URL'],
    'http://localhost:3007/remoteEntry.js',
  );

  return {
    base: appBasePath,
    root: __dirname,
    publicDir: 'public',

    plugins: [
      // PERF-INIT-V2.1 V3-B1a: bundle analyzer (env-gated, returns [] when off)
      ...bundleVisualizer({ mfeName: 'mfe-users' }),
      react(),
      ...(isTest
        ? []
        : [
            federation({
              name: 'mfe_users',
              filename: 'remoteEntry.js',
              dts: false,
              remotes: {
                mfe_shell: { type: 'module', name: 'mfe_shell', entry: shellRemoteEntry },
                mfe_reporting: {
                  type: 'module',
                  name: 'mfe_reporting',
                  entry: reportingRemoteEntry,
                },
              },
              exposes: {
                './UsersApp': './src/app/UsersApp.ui.tsx',
                './shell-services': './src/app/services/shell-services.ts',
              },
              shared: {
                /* Always share the full set — remove isSingleDomainBuild conditional
                 * to prevent duplicate React instances in single-domain builds. */
                ...sharedCore,
                ...(mode === 'production' ? sharedProdOnly : {}),
              },
            }),
            // Faz 21.8 PR-X8 (kept from origin/main): mfPreloadHelperIsolation
            // breaks the auth ↔ design-system MF loadShare runtime cycle by
            // inlining the modulepreload helper inside design-system.
            mfPreloadHelperIsolation(),
          ]),
    ],

    resolve: {
      alias: [
        {
          find: '@mfe/design-system',
          replacement: path.resolve(__dirname, '../../packages/design-system/src'),
        },
        { find: '@mfe/auth', replacement: path.resolve(__dirname, '../../packages/auth/src') },
        {
          find: '@mfe/shared-http',
          replacement: path.resolve(__dirname, '../../packages/shared-http/src'),
        },
        // mfe_shell/i18n: only alias in test mode — in dev/prod, MF remote handles it
        ...(isTest
          ? [
              {
                find: 'mfe_shell/i18n',
                replacement: path.resolve(__dirname, '__mocks__/mfe-shell-i18n.ts'),
              },
            ]
          : []),
        {
          find: /^mfe_reporting\/(.*)$/,
          replacement: path.resolve(__dirname, '__mocks__/mfe-reporting-$1.ts'),
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

    define: {
      'process.env': JSON.stringify(runtimeEnv),
    },

    server: {
      host: '127.0.0.1',
      port: 3004,
      strictPort: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      proxy: {
        '/api/auth': { target: 'http://localhost:8088', changeOrigin: true, secure: false },
        '/api': { target: 'http://localhost:8080', changeOrigin: true, secure: false },
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
        '@reduxjs/toolkit',
        'react-redux',
        'axios',
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
      ],
      exclude: ['mfe_shell', 'mfe_reporting', '@tanstack/react-query'],
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: mode === 'development',
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
