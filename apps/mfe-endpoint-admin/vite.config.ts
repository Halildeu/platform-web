import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
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

const sharedCore = {
  react: hostOnly('react'),
  'react-dom': hostOnly('react-dom'),
  'react-router': hostOnly('react-router'),
  'react-router-dom': hostOnly('react-router-dom'),
};

const sharedProdOnly = {
  '@mfe/design-system': { singleton: true, requiredVersion: false as const },
  '@mfe/shared-http': { singleton: true, requiredVersion: false as const },
};

const isTest = !!process.env['VITEST'];

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
    plugins: [
      react(),
      tailwindcss(),
      ...(isTest
        ? []
        : [
            federation({
              name: 'mfe_endpoint_admin',
              filename: 'remoteEntry.js',
              dts: false,
              remotes: {
                mfe_shell: {
                  type: 'module',
                  name: 'mfe_shell',
                  entry: shellRemoteEntry,
                },
              },
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
        {
          find: '@mfe/shared-http',
          replacement: path.resolve(__dirname, '../../packages/shared-http/src'),
        },
        ...(isTest
          ? [
              {
                find: 'mfe_shell/i18n',
                replacement: path.resolve(__dirname, '../mfe-shell/src/app/i18n/index.ts'),
              },
            ]
          : []),
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
      ],
      exclude: ['mfe_shell'],
    },

    server: {
      host: '127.0.0.1',
      port: 3009,
      strictPort: true,
      cors: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
