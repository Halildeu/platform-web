import {
  api,
  registerAuthTokenResolver,
  registerTraceIdResolver,
  registerUnauthorizedHandler,
} from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';
import type { ShellNotificationEntry, ShellTelemetryEvent } from 'mfe_shell/services';

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * mirrored orchestration types so {@code useAuditLiveStream} can
 * subscribe to the broker token swap event without poking Redux.
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
    /** PR-C2 token swap subscription — SSE consumers reconnect on broker swap. */
    onTokenChange?: (listener: (token: string | null) => void) => () => void;
    /** PR-C2 impersonation enter orchestration (optional in the audit MFE). */
    enterImpersonationSession?: (payload: ShellEnterImpersonationPayload) => Promise<void>;
    /** PR-C2 impersonation audit-complete stop (optional in the audit MFE). */
    exitImpersonationSession?: () => Promise<ShellExitImpersonationResult>;
    /** PR-C2 nested-impersonation guard. */
    isImpersonating?: () => boolean;
  };
};

const createNoopServices = (): RemoteShellServices => ({
  notify: {
    push: (entry: ShellNotificationEntry) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-audit] noop notify', entry);
      }
    },
  },
  telemetry: {
    emit: (event: ShellTelemetryEvent) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-audit] noop telemetry', event);
      }
    },
  },
  http: api,
  auth: {
    getToken: () => null,
    getUser: () => null,
    onTokenChange: () => () => undefined,
    isImpersonating: () => false,
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
  // Shell'in auth/trace bilgisini shared-http'ye köprüle
  registerAuthTokenResolver(() => currentServices?.auth.getToken() ?? null);
  registerTraceIdResolver(() => null);
  // Unauthorized durumda shell tarafı gerekli yönetimi yapıyor; ekstra aksiyon yok
  registerUnauthorizedHandler(() => undefined);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[mfe-audit] shell services configured');
  }
};

export const getShellServices = (): RemoteShellServices => {
  if (!currentServices) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[mfe-audit] Shell servisleri henüz konfigüre edilmedi; noop kullanılacak.');
      return fallbackServices;
    }
    throw new Error('[mfe-audit] Shell servisleri konfigüre edilmedi.');
  }
  return currentServices;
};
