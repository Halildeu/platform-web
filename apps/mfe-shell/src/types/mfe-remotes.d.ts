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

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * impersonation orchestration types. Mirrored on the remote MFE side
 * (apps/mfe-X/src/app/services/shell-services.ts) so any MFE can
 * invoke the host orchestration (start / stop / inspect) without
 * poking Redux directly.
 */
type ShellEnterImpersonationPayload = {
  targetUserId: number;
  // Codex 019e1bed REVISE-2: optional. Backend resolves the Keycloak
  // subject server-side from `targetUserId` via the service-token
  // protected internal user-service endpoint. Keep the field optional
  // on the ambient remote declaration so any MFE consumer matches the
  // shell + mfe-users mirrors and never bakes in a "UUID zorunlu"
  // contract by accident.
  targetSubject?: string;
  targetEmail?: string;
  reason: string;
};

type ShellExitImpersonationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'session-lost' | 'admin-expired' | 'revoke-failed' | 'restore-failed';
      message?: string;
    };

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
    /** PR-C2 impersonation enter orchestration. */
    enterImpersonationSession: (payload: ShellEnterImpersonationPayload) => Promise<void>;
    /** PR-C2 impersonation audit-complete stop. */
    exitImpersonationSession: () => Promise<ShellExitImpersonationResult>;
    /** PR-C2 nested-impersonation guard. */
    isImpersonating: () => boolean;
    /**
     * Codex 019e1bed C-prime AGREE: shell-level superAdmin gate. Remotes
     * whose `@mfe/auth` Vite alias bypasses MF shared registration
     * (e.g. mfe-users) MUST consult this instead of `usePermissions()`
     * to avoid reading from a duplicated local `PermissionContext`.
     */
    isSuperAdmin: () => boolean;
    /**
     * Codex 019ea409: shell-level per-module access getter. Remotes gate
     * destructive actions on `=== 'MANAGE'` (not any VIEW) so a non-super-
     * admin module manager is gated correctly. Fail-closed `'NONE'`.
     */
    getModuleLevel: (module: string) => 'NONE' | 'VIEW' | 'MANAGE';
    /** PR-C2 token swap subscription (SSE consumers reconnect on broker swap). */
    onTokenChange: (listener: (token: string | null) => void) => () => void;
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

declare module 'mfe_meeting/shell-services' {
  export function configureShellServices(services: Partial<RemoteShellServices>): void;
}

declare module 'mfe_endpoint_admin/EndpointAdminApp' {
  const EndpointAdminApp: React.ComponentType;
  export default EndpointAdminApp;
}
