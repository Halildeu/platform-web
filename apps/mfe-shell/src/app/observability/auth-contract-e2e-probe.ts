import {
  api,
  getMetricsSnapshot,
  recordRefreshAttempt,
  recordRefreshWaiter,
  type MetricsSnapshot,
} from '@mfe/shared-http';
import type { Store } from '@reduxjs/toolkit';

/**
 * Phase 2 PR-E2E-6: test-only window probe surface.
 *
 * <p>Exposes a small set of internals (HTTP client, Redux store, metrics
 * helpers) on {@code window.__authContractProbe} so Playwright tests can
 * exercise the auth transport contract end-to-end without resorting to
 * accidental globals or unstable {@code import('@mfe/shared-http')}
 * runtime resolution under module federation.
 *
 * <p>Strictly gated: the probe is only installed when
 * {@code VITE_AUTH_CONTRACT_E2E=1} (or the build-time equivalent
 * {@code NEXT_PUBLIC_AUTH_CONTRACT_E2E=1}) is set. Production bundles
 * built without that flag never expose the probe — verified by the
 * production CI build with no env override.
 *
 * <p>The companion mock-token bridge is intentionally NOT placed on the
 * probe object: it lives on {@code window.__authContractMockToken} so
 * callers don't have to worry about probe install timing relative to
 * the AuthBootstrapper effect (Codex iter-2 Q-N: ESM evaluation order
 * is not a guarantee surface).
 */

declare global {
  interface Window {
    __authContractProbe?: {
      readonly http: typeof api;
      readonly store: Store;
      readonly metrics: {
        getSnapshot: () => MetricsSnapshot;
        recordRefreshAttempt: typeof recordRefreshAttempt;
        recordRefreshWaiter: typeof recordRefreshWaiter;
      };
    };
    /**
     * Test-only mock JWT for the AuthBootstrapper's keycloak.init bypass.
     * MUST be a real base64url-encoded JWT (header.payload.signature) so
     * AuthBootstrapper's tokenParsed inspection works without choking.
     * AuthBootstrapper reads this directly (Codex iter-2 must-fix #2:
     * single canonical surface, no probe-timing dependency).
     */
    __authContractMockToken?: string;
  }
}

/**
 * Returns true iff the test-only auth contract E2E mode is enabled
 * via build-time env flag. Production bundles (no flag) MUST always
 * return false — used by both the probe install gate AND the
 * AuthBootstrapper mock-Keycloak bypass to ensure the bypass branch
 * cannot be tripped by a global injection in a production build
 * (Codex iter-3 P0 #1 absorb).
 */
/**
 * Codex 019e27bf — P1 shell-test-infra fix. Read precedence:
 * `import.meta.env` (Vite-native, build-time) → guarded `process.env`
 * (webpack DefinePlugin, hosts that ship a Node-style env shim) →
 * `window.__env__` / `window.__ENV__` (runtime override set by
 * Playwright fixtures via addInitScript before bundle boot).
 *
 * The previous gate read only `process.env`, which Vite's client
 * bundle does not unconditionally inline, so the test-mode probe
 * stayed disabled in dev-mode + production-preview CI runs even when
 * VITE_AUTH_CONTRACT_E2E was set at the workflow level.
 */
const readProbeEnv = (key: string): string => {
  try {
    const importMetaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    const fromImportMeta = importMetaEnv?.[key];
    if (typeof fromImportMeta === 'string' && fromImportMeta.length > 0) {
      return fromImportMeta;
    }
  } catch {
    /* import.meta unavailable in some compile targets */
  }
  try {
    if (typeof process !== 'undefined' && typeof process.env?.[key] === 'string') {
      return process.env[key] as string;
    }
  } catch {
    /* ignore — Vite client bundle */
  }
  if (typeof window !== 'undefined') {
    const win = window as Window & {
      __env__?: Record<string, string | undefined>;
      __ENV__?: Record<string, string | undefined>;
    };
    const candidate = win.__env__?.[key] ?? win.__ENV__?.[key];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return '';
};

export const isAuthContractE2eEnabled = (): boolean => {
  const flag =
    readProbeEnv('VITE_AUTH_CONTRACT_E2E') || readProbeEnv('NEXT_PUBLIC_AUTH_CONTRACT_E2E');
  return flag === '1' || flag.toLowerCase() === 'true';
};

export const installAuthContractE2eProbe = (store: Store): void => {
  if (typeof window === 'undefined') return;
  if (!isAuthContractE2eEnabled()) return;
  // Idempotent: re-mount of AppProviders (StrictMode) must not re-install
  if (window.__authContractProbe) return;

  Object.defineProperty(window, '__authContractProbe', {
    value: Object.freeze({
      http: api,
      store,
      metrics: Object.freeze({
        getSnapshot: getMetricsSnapshot,
        recordRefreshAttempt,
        recordRefreshWaiter,
      }),
    }),
    writable: false,
    configurable: false,
  });
};
