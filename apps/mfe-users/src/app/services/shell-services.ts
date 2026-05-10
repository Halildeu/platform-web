import { api, registerAuthTokenResolver, logExpected } from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';
import type { ShellNotificationEntry, ShellTelemetryEvent } from 'mfe_shell/services';

/**
 * PR-FE-1 (Codex thread 019e08e2 iter-7 AGREE absorb, 2026-05-08):
 * MFE Auth Transport Contract — typed result mirror for shell.auth.ready().
 *
 * <p>Pre-fix mfe-users only declared {@code getToken/getUser} on the
 * shell-services auth interface. Shell at runtime DID pass the full
 * Phase 2 PR-Auth-1 contract object (ready/isTransportReady/getPhase/
 * getEpoch — see {@code apps/mfe-shell/src/app/config/shell-services-
 * wiring.ts:196}), but the type erasure on the mfe-users side meant
 * components like {@code UsersGrid.runAccessProbe} could not call
 * {@code auth.ready()} before issuing the first {@code fetchUsers}
 * — they hit the shell's request interceptor before {@code
 * transportReady} fired and surfaced
 * {@code auth-not-ready: unauthenticated} as a network-error toast.
 *
 * <p>Mirroring the reporting pattern (apps/mfe-reporting/src/app/
 * services/shell-services.ts) so admin pages get the same
 * await-before-fetch story.
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

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * orchestration types mirrored from the shell so this MFE can call
 * {@code getShellServices().auth.enterImpersonationSession(...)} with
 * full type safety from {@code ImpersonateAction.tsx}.
 */
export interface ShellEnterImpersonationPayload {
  targetUserId: number;
  targetSubject: string;
  targetEmail?: string;
  reason: string;
}

export type ShellExitImpersonationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'session-lost' | 'admin-expired' | 'revoke-failed' | 'restore-failed';
      message?: string;
    };

export type RemoteShellServices = {
  notify: { push: (entry: ShellNotificationEntry) => void };
  telemetry: { emit: (event: ShellTelemetryEvent) => void };
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    getUser: () => unknown;
    /**
     * PR-FE-1 (Codex 019e08e2 iter-7): epoch-aware Promise bridge.
     * MFE pages MUST await before issuing protected requests to avoid
     * pre-cookie 401 storms / `auth-not-ready` toasts. Fallback service
     * returns {ok:false, reason:'unauthenticated'} fail-closed (no
     * protected request leaves the MFE pre-wiring).
     */
    ready: () => Promise<AuthReadyResult>;
    isTransportReady: () => boolean;
    getPhase: () => RemoteShellAuthPhase;
    getEpoch: () => number;
    /** PR-C2 impersonation enter orchestration. */
    enterImpersonationSession: (payload: ShellEnterImpersonationPayload) => Promise<void>;
    /** PR-C2 impersonation audit-complete stop. */
    exitImpersonationSession: () => Promise<ShellExitImpersonationResult>;
    /** PR-C2 nested-impersonation guard. */
    isImpersonating: () => boolean;
    /** PR-C2 token swap subscription (SSE consumers reconnect on broker swap). */
    onTokenChange: (listener: (token: string | null) => void) => () => void;
  };
};

const createNoopServices = (): RemoteShellServices => ({
  notify: {
    push: (entry: ShellNotificationEntry) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-users] noop notify', entry);
      }
    },
  },
  telemetry: {
    emit: (event: ShellTelemetryEvent) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-users] noop telemetry', event);
      }
    },
  },
  http: api,
  auth: {
    getToken: () => null,
    getUser: () => null,
    // PR-FE-1 (Codex 019e08e2 iter-7 absorb): fallback fail-closed.
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
    // PR-C2 fallback: standalone-dev mode rejects impersonation
    // start so the form surfaces an actionable error rather than
    // hanging on a no-op promise.
    enterImpersonationSession: () =>
      Promise.reject(new Error('Shell services not yet configured (impersonation)')),
    exitImpersonationSession: () =>
      Promise.resolve<ShellExitImpersonationResult>({
        ok: false,
        reason: 'session-lost',
        message: 'Shell services not yet configured (impersonation)',
      }),
    isImpersonating: () => false,
    onTokenChange: () => () => undefined,
  },
});

let currentServices: RemoteShellServices | null = null;
const fallbackServices = createNoopServices();

export const configureShellServices = (services: Partial<RemoteShellServices>): void => {
  currentServices = {
    notify: services.notify ?? fallbackServices.notify,
    telemetry: services.telemetry ?? fallbackServices.telemetry,
    http: services.http ?? fallbackServices.http,
    auth: services.auth ?? fallbackServices.auth,
  };
  registerAuthTokenResolver(() => currentServices?.auth.getToken() ?? null);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[mfe-users] shell services configured');
  }
};

export const getShellServices = (): RemoteShellServices => {
  if (!currentServices) {
    if (process.env.NODE_ENV !== 'production') {
      // Expected: standalone dev (mfe-users tek başına, shell host değil) — noop fallback
      logExpected('shellServices.getShellServices', undefined, { reason: 'standalone-dev-noop' });
      return fallbackServices;
    }
    throw new Error('[mfe-users] Shell servisleri konfigüre edilmedi.');
  }
  return currentServices;
};
