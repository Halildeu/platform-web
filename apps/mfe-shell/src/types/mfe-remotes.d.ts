// Top-level `import type` statements would convert this file from an
// ambient declaration into a module — at which point the `declare
// module 'mfe_*/shell-services'` blocks below become private exports
// instead of global augmentations, and remote consumers see TS2307.
// Use the inline `import()` type expression (which doesn't introduce
// a top-level import statement) so this file stays ambient.

type ApiInstance = import('@mfe/shared-http').ApiInstance;
type ShellNotificationEntry = import('mfe_shell/services').ShellNotificationEntry;
type ShellTelemetryEvent = import('mfe_shell/services').ShellTelemetryEvent;

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
