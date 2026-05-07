import type { ApiInstance } from '@mfe/shared-http';
import type { ShellNotificationEntry, ShellTelemetryEvent } from 'mfe_shell/services';

/**
 * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb, thread 019e0119):
 * MFE Auth Transport Contract — typed result + phase union mirrored
 * for shell-side remote declarations. Remote MFE consumers receive
 * the same shape via {@code mfe_shell/services} type re-export
 * (see apps/mfe-reporting/src/types/mfe-shell.d.ts).
 */
type AuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

type RemoteShellAuthPhase =
  | 'initializing'
  | 'keycloakReady'
  | 'cookieReady'
  | 'authzReady'
  | 'transportReady'
  | 'refreshing'
  | 'unauthenticated'
  | 'failed';

type RemoteShellServices = {
  notify: { push: (entry: ShellNotificationEntry) => void };
  telemetry: { emit: (event: ShellTelemetryEvent) => void };
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    getUser: () => unknown;
    /**
     * Phase 2 PR-Auth-1: epoch-aware Promise bridge. MFEs MUST await
     * before issuing protected requests to avoid pre-cookie 401 storms.
     */
    ready: () => Promise<AuthReadyResult>;
    isTransportReady: () => boolean;
    getPhase: () => RemoteShellAuthPhase;
    getEpoch: () => number;
  };
};

declare module 'mfe_access/shell-services' {
  export function configureShellServices(services: RemoteShellServices): void;
}

declare module 'mfe_audit/shell-services' {
  export function configureShellServices(services: RemoteShellServices): void;
}

declare module 'mfe_users/shell-services' {
  export function configureShellServices(services: Partial<RemoteShellServices>): void;
}

declare module 'mfe_reporting/shell-services' {
  export function configureShellServices(services: Partial<RemoteShellServices>): void;
}

declare module 'mfe_endpoint_admin/shell-services' {
  export function configureShellServices(services: Partial<RemoteShellServices>): void;
}

declare module 'mfe_endpoint_admin/EndpointAdminApp' {
  const EndpointAdminApp: React.ComponentType;
  export default EndpointAdminApp;
}
