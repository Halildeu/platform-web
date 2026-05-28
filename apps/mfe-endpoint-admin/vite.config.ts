/// <reference types="vite/client" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
// Faz 21.8 PR-X8: inline modulepreload helper to break the
// auth ↔ design-system MF loadShare runtime cycle.
import { mfPreloadHelperIsolation } from '../../scripts/vite-plugins/mf-preload-helper-isolation';

/* ------------------------------------------------------------------ */
/*  Env helpers — same shape as other MFEs                             */
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
    if (normalized.length > 0) return normalized;
  }
  return fallback;
}

function normalizeBasePath(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === '/') return '/';
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

/* ------------------------------------------------------------------ */
/*  MF shared deps                                                      */
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

// jsx-runtime / jsx-dev-runtime explicitly shared so that the @vitejs/plugin-react
// auto-injected `import { jsx, jsxs } from "react/jsx-runtime"` (dev: jsx-dev-runtime)
// resolves through the federation loadShare scope instead of racing against the
// host's shared React instance. Without these entries the runtimes go through
// the slower per-import loadShare chunk path, which the federation runtime warns
// about with `Shared module react/jsx-dev-runtime was imported before federation
// bootstrap finished`. Pinned to react's version because they ship inside the
// react package (no independent semver).
const sharedCore = {
  react: hostOnly('react'),
  'react-dom': hostOnly('react-dom'),
  'react/jsx-runtime': hostOnly('react/jsx-runtime', 'react'),
  'react/jsx-dev-runtime': hostOnly('react/jsx-dev-runtime', 'react'),
  'react-router': hostOnly('react-router'),
  'react-router-dom': hostOnly('react-router-dom'),
  'react-redux': hostOnly('react-redux'),
  '@reduxjs/toolkit': hostOnly('@reduxjs/toolkit'),
  '@tanstack/react-query': singleton('@tanstack/react-query'),
  // Faz 22.2 — AG Grid singletons mirror the mfe-users pattern so the
  // shell + every grid-enabled MFE share one ag-grid runtime instance.
  // Duplicate runtimes break module registration and silently strip
  // enterprise features.
  'ag-grid-react': singleton('ag-grid-react'),
  'ag-grid-community': singleton('ag-grid-community'),
  'ag-grid-enterprise': singleton('ag-grid-enterprise'),
};
const sharedProdOnly = {
  '@mfe/design-system': singleton('@mfe/design-system', '@mfe/design-system', false),
  '@mfe/shared-http': singleton('@mfe/shared-http', '@mfe/shared-http', false),
  '@mfe/i18n-dicts': singleton('@mfe/i18n-dicts', '@mfe/i18n-dicts', false),
};

const isTest = !!process.env['VITEST'];
// Standalone dev mode opt-in. When `VITE_ENDPOINT_ADMIN_STANDALONE=true` is
// exported (e.g. `pnpm --filter mfe-endpoint-admin start` for solo browser
// smoke), the federation plugin block is skipped entirely. Rationale: the
// @module-federation/vite 1.15.x host bootstrap emits a `hostAutoInit` virtual
// module that dynamic-imports React from the raw pnpm `node_modules/.pnpm/
// react@18.2.0/node_modules/react/index.js` CommonJS shim. In a browser ESM
// context the CJS shim throws `ReferenceError: module is not defined`, so the
// app never mounts. Production builds and shell-mounted dev runs both DO NOT
// set this flag — federation stays active so the remote is consumable from
// the host. The `shell-services.ts` module already has a noop fallback for
// the standalone path, so skipping federation does not break anything inside
// the remote bundle itself.
const isStandalone = process.env['VITE_ENDPOINT_ADMIN_STANDALONE'] === 'true';

export default defineConfig(({ mode }) => {
  const runtimeEnv = buildRuntimeEnv(mode);
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
      ...(isTest || isStandalone
        ? []
        : [
            federation({
              name: 'mfe_endpoint_admin',
              filename: 'remoteEntry.js',
              dts: false,
              remotes: {
                mfe_shell: { type: 'module', name: 'mfe_shell', entry: shellRemoteEntry },
              },
              // Codex iter-2 PARTIAL absorb (must-fix #1): mfe-users pattern
              // ile tam injection. shell-services dosyası + shell tarafı
              // wiring + d.ts mock birlikte. Olmadan, dev-mode'da
              // `@mfe/shared-http` MF singleton paylaşılmadığı için
              // shell.registerAuthTokenResolver remote'a ulaşmıyor → 401.
              exposes: {
                './EndpointAdminApp': './src/app/EndpointAdminApp.ui.tsx',
                './shell-services': './src/app/services/shell-services.ts',
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
        { find: '@mfe/auth', replacement: path.resolve(__dirname, '../../packages/auth/src') },
        {
          find: '@mfe/shared-http',
          replacement: path.resolve(__dirname, '../../packages/shared-http/src'),
        },
        ...(isTest
          ? [
              {
                find: 'mfe_shell/i18n',
                replacement: path.resolve(__dirname, '__mocks__/mfe-shell-i18n.ts'),
              },
            ]
          : []),
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
      port: 3009,
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

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
