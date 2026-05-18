import { api } from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';
import type { ShellNotificationEntry, ShellTelemetryEvent } from 'mfe_shell/services';

// In single-domain builds, @mfe/shared-http is NOT shared via Module
// Federation — each remote gets its own copy without the shell's token
// resolver. Add a request interceptor that reads the token from the
// shell's Keycloak instance (attached to window by the shell).
api.interceptors.request.use((config) => {
  if (config.headers?.Authorization) return config;
  // Try shell's Keycloak instance first
  const kc = (window as Record<string, unknown>).__keycloak as { token?: string } | undefined;
  const token = kc?.token;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Phase 2 PR-Auth-1 (Codex iter-25 §3 absorb, thread 019e0119):
 * MFE Auth Transport Contract — typed result mirror for shell.auth.ready().
 */
export type AuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

export type RemoteShellAuthPhase =
  | 'initializing'
  | 'keycloakReady'
  | 'cookieReady'
  | 'authzReady'
  | 'transportReady'
  | 'refreshing'
  | 'unauthenticated'
  | 'failed';

export type RemoteShellServices = {
  notify: { push: (entry: ShellNotificationEntry) => void };
  telemetry: { emit: (event: ShellTelemetryEvent) => void };
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    getUser: () => unknown;
    /**
     * Phase 2 PR-Auth-1: epoch-aware Promise bridge. MFEs MUST await
     * before issuing protected requests to avoid pre-cookie 401 storms.
     * Fallback service returns {ok:false, reason:'unauthenticated'}
     * fail-closed (no protected request leaves the MFE pre-wiring).
     */
    ready: () => Promise<AuthReadyResult>;
    isTransportReady: () => boolean;
    getPhase: () => RemoteShellAuthPhase;
    getEpoch: () => number;
    /**
     * R15 user-visible repair (Codex 019e2aef iter-6 — mirror of
     * mfe-users PR-C2 pattern). Shell-level superAdmin gate exposed
     * so `ReportingHub` can consult the shell singleton instead of
     * `usePermissions()` from a local `@mfe/auth` `PermissionContext`
     * that may still resolve to the default `isSuperAdmin: () => false`
     * even after the federation singleton config — the reporting MFE
     * bundle's local Context instance does not always observe the
     * host shell's PermissionProvider state. Browser-verified bug
     * (testai 2026-05-15): /authz/me returned superAdmin=true but
     * ReportingHub auth filter dropped 38 of 52 catalog entries
     * because the local context never received the host state.
     */
    isSuperAdmin: () => boolean;
  };
};

const createNoopServices = (): RemoteShellServices => ({
  notify: {
    push: (entry: ShellNotificationEntry) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-reporting] noop notify', entry);
      }
    },
  },
  telemetry: {
    emit: (event: ShellTelemetryEvent) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-reporting] noop telemetry', event);
      }
    },
  },
  http: api,
  auth: {
    getToken: () => null,
    getUser: () => null,
    // Phase 2 PR-Auth-1 (Codex iter-25 §3 absorb): fallback fail-closed.
    // Pre-wiring protected requests get an immediate unauthenticated
    // marker rather than waiting forever or attempting a no-token fetch.
    ready: () =>
      Promise.resolve<AuthReadyResult>({
        ok: false,
        reason: 'unauthenticated',
        error: 'Shell services not yet configured (fallback)',
      }),
    isTransportReady: () => false,
    getPhase: () => 'initializing' as const,
    getEpoch: () => 0,
    // R15 user-visible repair (Codex 019e2aef iter-6): fail-closed
    // fallback. If shell services have not wired yet, treat the user
    // as non-super-admin so the report group filter still applies.
    isSuperAdmin: () => false,
  },
});

let currentServices: RemoteShellServices | null = null;
const fallbackServices = createNoopServices();

export const configureShellServices = (services: Partial<RemoteShellServices>): void => {
  /*
   * Partial merge (Codex thread 019e3ab8). configureShellServices is
   * called more than once: the shell wires the full set at route load
   * ({ http: shellClient, auth, ... }), then ReportingProviders
   * re-configures with the canonical `mfe_shell/services` object —
   * which carries NO `http`. A plain overwrite would resolve the
   * absent `http` to `fallbackServices.http` (the remote's own axios
   * copy with only a synchronous window.__keycloak interceptor),
   * silently downgrading an already-wired shell client. That was the
   * root cause of the dynamic-report `/data` 401 auth-race. Each
   * absent field now falls back to the CURRENT value first, then the
   * fallback — so a later incomplete configure cannot regress a field.
   */
  const previous = currentServices ?? fallbackServices;
  currentServices = {
    notify: services.notify ?? previous.notify,
    telemetry: services.telemetry ?? previous.telemetry,
    http: services.http ?? previous.http,
    auth: services.auth ?? previous.auth,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[mfe-reporting] shell services configured');
  }
};

export const getShellServices = (): RemoteShellServices => {
  if (!currentServices) {
    // Always return fallback instead of throwing — Module Federation
    // shell-services wiring is async, and dashboard components may
    // render before wiring completes. Throwing causes token-less
    // requests (401) on dashboard endpoints.
    console.warn(
      '[mfe-reporting] Shell servisleri henüz konfigüre edilmedi; fallback kullanılacak.',
    );
    return fallbackServices;
  }
  return currentServices;
};
