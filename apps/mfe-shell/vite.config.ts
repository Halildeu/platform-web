/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { serviceHealthApi } from './vite-plugins/service-health-api';
// Faz 21.8 PR-X8: break runtime cycle by inlining the
// modulepreload helper inside design-system loadShare instead of importing
// it from auth loadShare.
import { mfPreloadHelperIsolation } from '../../scripts/vite-plugins/mf-preload-helper-isolation';
// PERF-INIT-V2 PR-A0: optional bundle analyzer. Activates only when
// ANALYZE_BUNDLE=1 env is set; outputs treemap + raw stats JSON under
// tests/perf/bundle-stats/mfe-shell/. See docs/performance/bundle-taxonomy.md.
import { bundleVisualizer } from '../../scripts/vite-plugins/bundle-visualizer';

/* ------------------------------------------------------------------ */
/*  Env helpers — replaces webpack's DefinePlugin + InjectRuntimeEnv   */
/* ------------------------------------------------------------------ */

/** Load .env.local manually (Vite's loadEnv only reads VITE_ prefixed) */
function loadDotEnvLocal(): Record<string, string> {
  const envPath = path.resolve(__dirname, '.env.local');
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

/** Build runtime env payload (same allowlist as webpack.common.js) */
function buildRuntimeEnv(mode: string): Record<string, string> {
  const dotEnv = loadDotEnvLocal();
  // process.env takes priority over .env.local (same as webpack.common.js)
  const merged = { ...dotEnv, ...process.env };
  // AG Grid lisansı: VITE_ prefix yeterli (allowlist'a eklemeye gerek yok).
  // Tek-kaynak (single source of truth): GitHub Secret AG_GRID_LICENSE_KEY →
  // CI build-arg VITE_AG_GRID_LICENSE_KEY → Vite buildRuntimeEnv → bundle.
  const allowlist = new Set([
    'NODE_ENV',
    'AUTH_MODE',
    // AG_GRID_LICENSE_KEY removed (hotfix single-source refactor): the
    // VITE_AG_GRID_LICENSE_KEY env is already picked up by the
    // `key.startsWith('VITE_')` filter below — explicit allowlist entry
    // is now redundant.
    'SHELL_SKIP_REMOTE_SERVICES',
    'SHELL_ENABLE_SUGGESTIONS_REMOTE',
    'SHELL_ENABLE_ETHIC_REMOTE',
    // FE-001 reapply: contract parity with VITE_ prefix so that build-time
    // gating in vite.config buildRemotes() and runtime gating in
    // shell-navigation read the same flag.
    'SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE',
  ]);
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!allowlist.has(key) && !key.startsWith('VITE_') && !key.startsWith('MFE_')) continue;
    if (typeof value === 'string') payload[key] = value;
  }
  payload.NODE_ENV ??= mode;
  return payload;
}

/* ------------------------------------------------------------------ */
/*  Remote helpers — replaces webpack.remotes.js                       */
/* ------------------------------------------------------------------ */

function readEnvBoolean(keys: string[], fallback = true): boolean {
  const dotEnv = loadDotEnvLocal();
  for (const key of keys) {
    const value = dotEnv[key] ?? process.env[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    const n = value.trim().toLowerCase();
    return n === '1' || n === 'true' || n === 'yes' || n === 'on';
  }
  return fallback;
}

function readEnvString(keys: string[], fallback: string): string {
  const dotEnv = loadDotEnvLocal();
  for (const key of keys) {
    const value = dotEnv[key] ?? process.env[key];
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

/**
 * Single source of truth for the endpoint-admin build-time gate.
 * `defineConfig` closure passes the result into BOTH:
 *   - `buildRemotes(endpointAdminEnabled)` — manifest entry inclusion
 *   - `define.__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__` — compile-time
 *     boolean replaced inline so `lazy-routes.ts` dead-code-eliminates
 *     the static `import("mfe_endpoint_admin/EndpointAdminApp")`.
 *
 * Codex PR #287 iter-1: IIFE/process.env pattern in lazy-routes was
 * not provably tree-shaken by Rollup. Direct `define` constant is the
 * canonical Vite/esbuild-friendly approach.
 */
function readEndpointAdminBuildFlag(): boolean {
  return readEnvBoolean(
    ['VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE', 'SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE'],
    false,
  );
}

/**
 * PERF-INIT-V2 PR-B5b1 (canary) — BUILD-TIME first-defined precedence
 * reader for the MFE on-demand bootstrap canary.  Default OFF — current
 * eager bootstrap path stays canonical unless an operator explicitly
 * opts in via `MFE_ON_DEMAND_BOOTSTRAP=1` (or `VITE_MFE_ON_DEMAND_BOOTSTRAP=1`)
 * BEFORE running `pnpm build`.
 *
 * ROLLBACK SEMANTIC (Codex iter-2 P0-2 clarification):
 *
 * This reader is evaluated EXCLUSIVELY at build time by Vite — its
 * result feeds the `__MFE_SUGGESTIONS_ON_DEMAND__` define constant
 * which Rolldown dead-code-eliminates the inverse branch.  Once a
 * build has been made with the flag ON, the eager
 * `import('mfe_suggestions/SuggestionsApp')` specifier no longer
 * exists in the bundle and CANNOT be re-enabled by any runtime env
 * (`window.__env__`, `process.env`, etc.).  Full post-build rollback
 * requires rebuilding with the flag OFF.
 *
 * The companion runtime reader in `apps/mfe-shell/src/app/config/mfe-bootstrap-flag.ts`
 * (PR-B5b3-prep) exists for OTHER consumers that might gate behaviour
 * on the same env — it does not flip B5b1's eager/on-demand selection
 * after deploy.
 */
function readSuggestionsOnDemandBuildFlag(): boolean {
  // First-defined wins: `MFE_ON_DEMAND_BOOTSTRAP` overrides
  // `VITE_MFE_ON_DEMAND_BOOTSTRAP` so operators can disable the canary
  // before the build runs even when CI exports the VITE_ form.
  const runtimeRaw = process.env.MFE_ON_DEMAND_BOOTSTRAP;
  if (runtimeRaw !== undefined && runtimeRaw !== '') {
    return /^(1|true|yes|on)$/i.test(runtimeRaw.trim());
  }
  const buildRaw = process.env.VITE_MFE_ON_DEMAND_BOOTSTRAP;
  if (buildRaw !== undefined && buildRaw !== '') {
    return /^(1|true|yes|on)$/i.test(buildRaw.trim());
  }
  return false;
}

function buildRemotes(endpointAdminEnabled: boolean, suggestionsOnDemand: boolean) {
  const enabled = {
    suggestions: readEnvBoolean([
      'VITE_SHELL_ENABLE_SUGGESTIONS_REMOTE',
      'SHELL_ENABLE_SUGGESTIONS_REMOTE',
    ]),
    ethic: readEnvBoolean(['VITE_SHELL_ENABLE_ETHIC_REMOTE', 'SHELL_ENABLE_ETHIC_REMOTE']),
    access: readEnvBoolean(['VITE_SHELL_ENABLE_ACCESS_REMOTE', 'SHELL_ENABLE_ACCESS_REMOTE']),
    audit: readEnvBoolean(['VITE_SHELL_ENABLE_AUDIT_REMOTE', 'SHELL_ENABLE_AUDIT_REMOTE']),
    users: readEnvBoolean(['VITE_SHELL_ENABLE_USERS_REMOTE', 'SHELL_ENABLE_USERS_REMOTE']),
    reporting: readEnvBoolean([
      'VITE_SHELL_ENABLE_REPORTING_REMOTE',
      'SHELL_ENABLE_REPORTING_REMOTE',
    ]),
    schemaExplorer: readEnvBoolean([
      'VITE_SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE',
      'SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE',
    ]),
    endpointAdmin: endpointAdminEnabled,
  };

  // All remotes must be declared so MF plugin can resolve their imports
  // at static analysis time. Disabled remotes use a stub entry that returns
  // empty modules — the dynamic import() in shell-services-wiring.ts
  // will catch the error and gracefully skip.
  const STUB = 'data:text/javascript,export default {}; export function configureShellServices(){}';
  const remoteEntries = {
    suggestions: readEnvString(
      ['MFE_SUGGESTIONS_URL', 'VITE_MFE_SUGGESTIONS_URL'],
      'http://localhost:3001/remoteEntry.js',
    ),
    ethic: readEnvString(
      ['MFE_ETHIC_URL', 'VITE_MFE_ETHIC_URL'],
      'http://localhost:3002/remoteEntry.js',
    ),
    users: readEnvString(
      ['MFE_USERS_URL', 'VITE_MFE_USERS_URL'],
      'http://localhost:3004/remoteEntry.js',
    ),
    access: readEnvString(
      ['MFE_ACCESS_URL', 'VITE_MFE_ACCESS_URL'],
      'http://localhost:3005/remoteEntry.js',
    ),
    audit: readEnvString(
      ['MFE_AUDIT_URL', 'VITE_MFE_AUDIT_URL'],
      'http://localhost:3006/remoteEntry.js',
    ),
    reporting: readEnvString(
      ['MFE_REPORTING_URL', 'VITE_MFE_REPORTING_URL'],
      'http://localhost:3007/remoteEntry.js',
    ),
    schemaExplorer: readEnvString(
      ['MFE_SCHEMA_EXPLORER_URL', 'VITE_MFE_SCHEMA_EXPLORER_URL'],
      'http://localhost:3008/remoteEntry.js',
    ),
    endpointAdmin: readEnvString(
      ['MFE_ENDPOINT_ADMIN_URL', 'VITE_MFE_ENDPOINT_ADMIN_URL'],
      'http://localhost:3009/remoteEntry.js',
    ),
  };

  return {
    // PERF-INIT-V2 PR-B5b1 canary: when `MFE_ON_DEMAND_BOOTSTRAP=1`
    // the suggestions remote is OMITTED from the federation manifest so
    // the @module-federation/vite plugin does not emit a synchronous
    // `remoteEntry.js` fetch at host bootstrap.  The runtime route
    // loader (`createSuggestionsAppOnDemand.tsx`) uses
    // `@module-federation/runtime` `registerRemotes` + `loadRemote` to
    // bring the remote up only when `/suggestions` is navigated to.
    // Same precedent as `mfe_endpoint_admin` build-time omit below.
    ...(suggestionsOnDemand && enabled.suggestions
      ? {}
      : {
          mfe_suggestions: {
            type: 'module' as const,
            name: 'mfe_suggestions',
            entry: enabled.suggestions ? remoteEntries.suggestions : STUB,
          },
        }),
    mfe_ethic: {
      type: 'module',
      name: 'mfe_ethic',
      entry: enabled.ethic ? remoteEntries.ethic : STUB,
    },
    mfe_access: {
      type: 'module',
      name: 'mfe_access',
      entry: enabled.access ? remoteEntries.access : STUB,
    },
    mfe_audit: {
      type: 'module',
      name: 'mfe_audit',
      entry: enabled.audit ? remoteEntries.audit : STUB,
    },
    mfe_users: {
      type: 'module',
      name: 'mfe_users',
      entry: enabled.users ? remoteEntries.users : STUB,
    },
    mfe_reporting: {
      type: 'module',
      name: 'mfe_reporting',
      entry: enabled.reporting ? remoteEntries.reporting : STUB,
    },
    mfe_schema_explorer: {
      type: 'module',
      name: 'mfe_schema_explorer',
      entry: enabled.schemaExplorer ? remoteEntries.schemaExplorer : STUB,
    },
    // FE-001 reapply build-time omit (post-#284): when the flag is
    // OFF, the manifest entry is omitted entirely. STUB pattern was
    // tried in PR #258/#280 and crashed live MF runtime with
    // #RUNTIME-002 because the data URI does not satisfy init()/get().
    // The lazy-routes.ts companion check tree-shakes the static
    // import in the same build, so neither side references the
    // remote when disabled.
    ...(enabled.endpointAdmin
      ? {
          mfe_endpoint_admin: {
            type: 'module' as const,
            name: 'mfe_endpoint_admin',
            entry: remoteEntries.endpointAdmin,
          },
        }
      : {}),
  };
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
  eager: boolean = false,
) => ({
  singleton: true,
  requiredVersion: deps[versionKey] ?? fallback,
  ...(eager && { eager: true }),
});
const sharedCore = {
  react: singleton('react', 'react', false, true),
  'react-dom': singleton('react-dom', 'react-dom', false, true),
  'react-router': singleton('react-router', 'react-router', false, true),
  'react-router-dom': singleton('react-router-dom', 'react-router-dom', false, true),
  '@reduxjs/toolkit': singleton('@reduxjs/toolkit', '@reduxjs/toolkit', false, true),
  'react-redux': singleton('react-redux', 'react-redux', false, true),
  '@tanstack/react-query': singleton('@tanstack/react-query', '@tanstack/react-query', false, true),
};
const sharedProdOnly = {
  clsx: singleton('clsx'),
  'tailwind-merge': singleton('tailwind-merge'),
  'ag-grid-community': singleton('ag-grid-community'),
  'ag-grid-enterprise': singleton('ag-grid-enterprise'),
  'ag-grid-react': singleton('ag-grid-react'),
  // Align with remotes — host must declare shared packages that remotes expect
  '@mfe/design-system': { singleton: true, requiredVersion: false as const },
  '@mfe/shared-http': { singleton: true, requiredVersion: false as const },
  '@mfe/i18n-dicts': { singleton: true, requiredVersion: false as const },
  // PR E (Codex CNS thread 019d99ba Tur 11): `@mfe/auth` MF singleton.
  // Shell AuthBootstrapper `/v1/authz/me` çekip PermissionProvider'a set ediyor;
  // ama remote (mfe-access) kendi @mfe/auth bundle instance'ı ile default context
  // kullanıyordu → `usePermissions().authz` null → RoleDrawer currentUserId null →
  // ExplainPermissionModal "Kullanıcı seçilmedi" alert. Singleton ile host+remote
  // aynı provider instance'ını paylaşır.
  '@mfe/auth': { singleton: true, requiredVersion: false as const },
};
// NOTE: SINGLE_DOMAIN_BUILD env var is still consumed by build-single-domain.mjs
// for output directory layout, but the shared config is now unified for all modes.

/* ------------------------------------------------------------------ */
/*  Vite Config                                                         */
/* ------------------------------------------------------------------ */

export default defineConfig(({ mode }) => {
  const runtimeEnv = buildRuntimeEnv(mode);
  const appBasePath = normalizeBasePath(
    readEnvString(['APP_BASE_PATH', 'VITE_APP_BASE_PATH'], '/'),
  );
  // Single source of truth — passed into both buildRemotes() and
  // define for compile-time consumption in lazy-routes.ts.
  const endpointAdminBuildEnabled = readEndpointAdminBuildFlag();
  // PERF-INIT-V2 PR-B5b1 canary: same pattern as endpointAdminBuildEnabled.
  // When ON the suggestions remote is omitted from federation manifest
  // AND the static `import('mfe_suggestions/SuggestionsApp')` in
  // lazy-routes.ts is dead-code-eliminated via the
  // `__MFE_SUGGESTIONS_ON_DEMAND__` define constant below.  Runtime
  // route loader uses `@module-federation/runtime` to bring the remote
  // up on navigation.
  const suggestionsOnDemandBuildEnabled = readSuggestionsOnDemandBuildFlag();

  return {
    base: appBasePath,
    root: __dirname,
    publicDir: 'public',

    plugins: [
      // PERF-INIT-V2 PR-A0: bundle analyzer (env-gated, returns [] when off)
      ...bundleVisualizer({ mfeName: 'mfe-shell' }),
      /* Live service health API — serves /api/services without backend */
      serviceHealthApi(),
      /* Inject runtime env into HTML */
      {
        name: 'inject-runtime-env',
        transformIndexHtml(html) {
          return html.replace(
            'window.__env__ = window.__env__ || {};',
            `window.__env__ = Object.assign({}, ${JSON.stringify(runtimeEnv)});`,
          );
        },
      },
      react(),
      tailwindcss(),
      federation({
        name: 'mfe_shell',
        filename: 'remoteEntry.js',
        dts: false,
        remotes: buildRemotes(endpointAdminBuildEnabled, suggestionsOnDemandBuildEnabled),
        exposes: {
          './logic': './src/exposed-logic.ts',
          './services': './src/app/services/shell-services.ts',
          './i18n': './src/app/i18n/index.ts',
        },
        /* Dev mode also needs core singleton sharing.
         * Without this, remotes load their own React runtime and routes white-screen with invalid hook calls. */
        shared: {
          /* Always share the full core set — isSingleDomainBuild conditional
           * was omitting @tanstack/react-query and prodOnly packages, causing
           * duplicate React instances and white-screen errors in remotes.
           * Fix: always use sharedCore + sharedProdOnly in production. */
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
          find: '@mfe/design-system',
          replacement: path.resolve(__dirname, '../../packages/design-system/src'),
        },
        {
          find: '@mfe/i18n-dicts',
          replacement: path.resolve(__dirname, '../../packages/i18n-dicts/src'),
        },
        {
          find: '@mfe/shared-http',
          replacement: path.resolve(__dirname, '../../packages/shared-http/src'),
        },
        // Bypass MF loadShare wrapper for @tanstack/react-query — prevents
        // "QueryCache is not a constructor" caused by async TLA in Vite 8.
        // Direct resolve to node_modules ESM entry, skipping MF's virtual module.
        {
          find: '@tanstack/react-query',
          replacement: path.resolve(
            __dirname,
            'node_modules/@tanstack/react-query/build/modern/index.js',
          ),
        },
      ],
    },

    /* Env injection — replaces DefinePlugin + InjectRuntimeEnv */
    define: {
      'process.env': JSON.stringify(runtimeEnv),
      // Compile-time boolean for lazy-routes.ts. Direct define is the
      // canonical pattern Rollup/esbuild dead-code-eliminate; the
      // previous IIFE-over-process.env approach was not reliably
      // tree-shaken (Codex PR #287 iter-1 must-fix #1).
      __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__: JSON.stringify(endpointAdminBuildEnabled),
      // PERF-INIT-V2 PR-B5b1 canary: dead-code-eliminate the static
      // `import('mfe_suggestions/SuggestionsApp')` in lazy-routes.ts
      // when the on-demand canary is active.  Same Vite `define`
      // pattern as the endpoint-admin precedent (Codex PR #287 iter-1).
      __MFE_SUGGESTIONS_ON_DEMAND__: JSON.stringify(suggestionsOnDemandBuildEnabled),
      // PERF-INIT-V2 PR-B5c-lite (Codex thread 019e20fa iter-2 finding):
      // build-time opt-in for production __perfSnapshot exposure. The
      // perf-observer.ts shouldExposeGlobal() reads this constant; when
      // VITE_PERF_OBSERVER_EXPOSE='1' the window globals are exposed
      // even in production builds. Off-by-default; only opt-in for
      // synthetic measurement environments (testai performance preview,
      // Lighthouse-CI worker). The runtime `window.__PERF_OBSERVER_ENABLE`
      // flag remains the recommended path for Playwright (no rebuild
      // needed); this build-time flag covers scenarios where addInitScript
      // cannot be wired (cluster-side Lighthouse, third-party perf probe).
      __PERF_OBSERVER_EXPOSE__: JSON.stringify(process.env.VITE_PERF_OBSERVER_EXPOSE === '1'),
    },

    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      proxy: {
        '/auth/realms': {
          target: 'http://localhost:8081',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/auth/, ''),
        },
        // Direct service routes — bypass gateway (avoids Vault/Eureka issues)
        '/api/v1/reports': { target: 'http://localhost:8095', changeOrigin: true, secure: false },
        '/api/v1/dashboards': {
          target: 'http://localhost:8095',
          changeOrigin: true,
          secure: false,
        },
        // Access/authz plane permission-service uzerinde yasiyor; local dev
        // proxy'leri stage gateway sahipligiyle ayni tutulur.
        '/api/v1/context-health': {
          target: 'http://localhost:8095',
          changeOrigin: true,
          secure: false,
        },
        '/api/v1/roles': { target: 'http://localhost:8090', changeOrigin: true, secure: false },
        '/api/v1/permissions': {
          target: 'http://localhost:8090',
          changeOrigin: true,
          secure: false,
        },
        '/api/v1/authz': { target: 'http://localhost:8090', changeOrigin: true, secure: false },
        '/api/v1/users': { target: 'http://localhost:8089', changeOrigin: true, secure: false },
        '/api/v1/companies': { target: 'http://localhost:8092', changeOrigin: true, secure: false },
        '/api/v1/themes': { target: 'http://localhost:8091', changeOrigin: true, secure: false },
        '/api/v1/theme-registry': {
          target: 'http://localhost:8091',
          changeOrigin: true,
          secure: false,
        },
        '/api/v1/me/theme': { target: 'http://localhost:8091', changeOrigin: true, secure: false },
        '/api/v1/variants': { target: 'http://localhost:8091', changeOrigin: true, secure: false },
        // /api/audit → gateway (route'lar permission-service DB'sine bağlı, henüz migrate edilmedi)
        '/api/v1/schema': { target: 'http://localhost:8096', changeOrigin: true, secure: false },
        // '/api/services' handled by serviceHealthApi() Vite plugin
        '/cockpit-api': {
          target: 'http://localhost:8790',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/cockpit-api/, '/api'),
        },
        '/api': { target: 'http://localhost:8080', changeOrigin: true, secure: false },
      },
    },

    /* Pre-bundle ALL deps including monorepo packages — critical for cold-load speed.
     * Without this, Vite serves 250+ individual HTTP requests (one per module).
     * With this, monorepo sources get bundled into optimized chunks like node_modules. */
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
        '@reduxjs/toolkit/query',
        '@reduxjs/toolkit/query/react',
        'react-redux',
        'clsx',
        'tailwind-merge',
        'axios',
        'zod',
        'keycloak-js',
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
        '@sentry/react',
        'lucide-react',
        // Monorepo packages — stable, rarely change → pre-bundle for speed
        '@mfe/shared-http',
        '@platform/capabilities',
      ],
      exclude: [
        // @tanstack/react-query: MF loadShare wrapper causes "QueryCache is not a constructor"
        '@tanstack/react-query',
        '@tanstack/react-query-devtools',
        // @mfe/design-system: actively developed → exclude for HMR
        '@mfe/design-system',
        // MF remotes + heavy lazy deps
        'shiki',
        'mfe_suggestions',
        'mfe_ethic',
        'mfe_access',
        'mfe_audit',
        'mfe_users',
        'mfe_reporting',
      ],
    },

    /* Warm up critical modules at server start — eliminates first-load delay */
    warmup: {
      clientFiles: [
        './src/index.tsx',
        './src/app/bootstrap.tsx',
        './src/app/ShellApp.tsx',
        './src/app/layout/ShellLayout.tsx',
        './src/app/router/AppRouter.tsx',
        './src/app/providers/AuthBootstrapper.tsx',
        './src/app/store/store.ts',
        './src/app/theme/theme-context.provider.tsx',
        './src/app/config/query-config.ts',
        './src/app/config/shell-services-wiring.ts',
        './src/app/config/http-config.ts',
        './src/app/i18n/index.ts',
        './src/app/auth/auth-config.ts',
        './src/pages/home/*.tsx',
        '../../packages/design-system/src/index.ts',
        '../../packages/design-system/src/components/index.ts',
        '../../packages/design-system/src/primitives/index.ts',
      ],
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: mode === 'development',
    },
  };
});
