import { QueryClient } from '@tanstack/react-query';
import contract from './contract/shell-services.contract.json';
import { subscribeAuthState } from '../auth/auth-sync';

type AuthListener = (token: string | null) => void;

/**
 * Iter-6 P2 absorb (Codex thread `019e109c`): wiring callback may emit
 * an opaque "force" envelope so the dispatcher knows to bypass the
 * same-token short-circuit when an epoch delta (not a token swap)
 * triggered the fire. The remote API ({@code auth.onTokenChange}
 * surfaced via {@code shell-services-wiring.ts:432}) is already
 * epoch-aware; this brings the canonical
 * {@code getShellServices().auth.onTokenChange} surface to parity
 * so consumers wired through {@code init.subscribeAuthToken} —
 * canonical shell-services or auth-sync's BroadcastChannel — also
 * see the post-{@code markImpersonationExpired} signal.
 */
type AuthEmitOptions = { force?: boolean };
type AuthListenerEnvelope = (token: string | null, options?: AuthEmitOptions) => void;

export type ShellTelemetryEvent = {
  type: string;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  timestamp?: number;
};

export type ShellNotificationType = 'success' | 'info' | 'warning' | 'error' | 'loading';

export type ShellNotificationEntry = {
  id?: string;
  message: string;
  description?: string;
  type?: ShellNotificationType;
  priority?: 'normal' | 'high';
  pinned?: boolean;
  createdAt?: number;
  meta?: Record<string, unknown>;
};

/**
 * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb, thread 019e0119):
 * MFE Auth Transport Contract — typed result + phase union.
 */
export type AuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

export type ShellAuthPhase =
  | 'initializing'
  | 'keycloakReady'
  | 'cookieReady'
  | 'authzReady'
  | 'transportReady'
  | 'refreshing'
  | 'unauthenticated'
  | 'failed';

/**
 * Codex 019ea409 — per-module access level surfaced to remote MFE
 * consumers. Mirrors the shell auth slice's `ModuleAccessLevel`; kept as a
 * local type so this generic service registry does not import the auth
 * feature slice. Wiring maps the Redux selector onto this contract.
 */
export type ShellModuleLevel = 'NONE' | 'VIEW' | 'MANAGE';

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * start payload. The orchestration handles backend start request +
 * cookie write + authz/me + Redux dispatch + storage persist.
 */
export interface ShellEnterImpersonationPayload {
  targetUserId: number;
  /**
   * Codex {@code 019e1bed} REVISE-2: optional. Backend now resolves the
   * Keycloak subject server-side from {@code targetUserId} via the
   * service-token protected internal user-service endpoint. Callers
   * that omit this field get backend-authoritative resolution; legacy
   * callers that still pass it short-circuit the resolution.
   */
  targetSubject?: string;
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

export interface ShellAuthService {
  getToken(): string | null;
  onTokenChange(listener: AuthListener): () => void;
  /**
   * Phase 2 PR-Auth-1: epoch-aware Promise bridge. MFEs MUST await this
   * before issuing protected HTTP requests. Resolves with discriminated
   * union so callers handle transportReady, unauthenticated, and failed
   * outcomes without throwing.
   */
  ready(): Promise<AuthReadyResult>;
  /** Synchronous phase inspection (use {@link ready} for async wait). */
  isTransportReady(): boolean;
  getPhase(): ShellAuthPhase;
  /** Bumps on logout / re-login; lets MFEs invalidate cached Promises. */
  getEpoch(): number;
  /**
   * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
   * start an impersonation session. Drives the FSM through
   * {@code refreshing → transportReady} atomically so the target
   * identity reaches PermissionProvider / SSE consumers in one swap.
   */
  enterImpersonationSession(payload: ShellEnterImpersonationPayload): Promise<void>;
  /**
   * PR-C2 audit-complete stop (Codex iter-3 invariant: revoke-first).
   */
  exitImpersonationSession(): Promise<ShellExitImpersonationResult>;
  /** PR-C2 nested-impersonation guard. */
  isImpersonating(): boolean;
  /**
   * Codex 019e1bed C-prime AGREE — superAdmin gate exposed via shell auth
   * singleton instead of relying on remote MFE's local `@mfe/auth`
   * `PermissionContext`. Remotes whose Vite alias bypasses MF shared
   * registration would otherwise see the default
   * `isSuperAdmin: () => false` from a duplicated context. Routing the
   * gate through shell auth keeps consumer remotes (mfe-users
   * `UserDetailDrawer`, `ImpersonateAction`) on the same canonical
   * `authzSnapshot` the shell hydrates from `/api/v1/authz/me`.
   *
   * Source-of-truth: `store.getState().auth.authzSnapshot?.superAdmin`.
   * Fallback: `false` until shell services are wired and authz is
   * fetched (fail-closed; matches `isImpersonating` shape).
   */
  isSuperAdmin(): boolean;
  /**
   * Codex 019ea409 — per-module access level for remote MFE consumers that
   * must gate destructive actions (reset password, deactivate user) on
   * MANAGE specifically rather than any VIEW access. `isSuperAdmin()` only
   * answers the all-or-nothing super-admin case; this exposes the
   * canonical `authzSnapshot.modules[module]` level so a non-super-admin
   * module manager is gated correctly.
   *
   * Source-of-truth: shell auth slice `selectModuleLevel(module)`.
   * Fallback: `'NONE'` until wired + authz fetched (fail-closed).
   */
  getModuleLevel(module: string): ShellModuleLevel;
}

export interface ShellTelemetryService {
  emit(event: ShellTelemetryEvent): void;
}

export interface ShellNotificationService {
  push(entry: ShellNotificationEntry): void;
}

export interface ShellFeatureFlagService {
  isEnabled(flag: string): boolean;
}

export interface ShellServices {
  auth: ShellAuthService;
  query: QueryClient;
  telemetry: ShellTelemetryService;
  notify: ShellNotificationService;
  featureFlags: ShellFeatureFlagService;
  contract: typeof contract;
}

export type ShellServicesInit = {
  queryClient: QueryClient;
  getAuthToken: () => string | null;
  /**
   * Iter-6 P2 absorb (Codex thread `019e109c`): the listener
   * delivered by wiring may opt-in to {@code force: true} so an
   * epoch delta with an unchanged token still propagates to
   * {@code authListeners} (e.g. {@code markImpersonationExpired}
   * bumps {@code authEpoch} but does not swap {@code state.token}).
   * Plain {@link AuthListener} consumers continue to work.
   */
  subscribeAuthToken?: (listener: AuthListenerEnvelope) => () => void;
  notify?: (entry: ShellNotificationEntry) => void;
  telemetry?: (event: ShellTelemetryEvent) => void;
  isFeatureEnabled?: (flag: string) => boolean;
  /**
   * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): MFE Auth Transport
   * Contract callbacks. Without these, getShellServices().auth uses
   * fail-closed fallback ({@code ready()} resolves with
   * {@code unauthenticated}, {@code isTransportReady} false).
   */
  authReady?: () => Promise<AuthReadyResult>;
  isTransportReady?: () => boolean;
  getAuthPhase?: () => ShellAuthPhase;
  getAuthEpoch?: () => number;
  /** PR-C2 impersonation enter orchestration. */
  enterImpersonationSession?: (payload: ShellEnterImpersonationPayload) => Promise<void>;
  /** PR-C2 impersonation audit-complete stop. */
  exitImpersonationSession?: () => Promise<ShellExitImpersonationResult>;
  /** PR-C2 nested-impersonation guard. */
  isImpersonating?: () => boolean;
  /**
   * Codex 019e1bed C-prime AGREE: shell-level superAdmin gate for
   * remote MFE consumers. Wiring should pass a getter that reads
   * `store.getState().auth.authzSnapshot?.superAdmin === true`.
   */
  isSuperAdmin?: () => boolean;
  /**
   * Codex 019ea409: shell-level per-module access getter. Wiring passes
   * `(module) => selectModuleLevel(module)(store.getState())`. Omitted ⇒
   * fail-closed `'NONE'`.
   */
  getModuleLevel?: (module: string) => ShellModuleLevel;
};

const authListeners = new Set<AuthListener>();
let unsubscribeAuthSource: (() => void) | null = null;

let queryClientRef: QueryClient | null = null;
let tokenCache: string | null = null;
let getAuthTokenImpl: () => string | null = () => tokenCache;
let fallbackQueryClient: QueryClient | null = null;
let warnedUnconfigured = false;

const normalizeToken = (token: string | null | undefined): string | null => {
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = token.trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') {
    return null;
  }
  return normalized;
};

const defaultNotify = (entry: ShellNotificationEntry) => {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[shell:notify]', entry);
  }
};

const defaultTelemetry = (event: ShellTelemetryEvent) => {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[shell:telemetry]', event);
  }
};

let notifyImpl = defaultNotify;
let telemetryImpl = defaultTelemetry;
let featureFlagImpl: (flag: string) => boolean = () => false;

/**
 * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): MFE Auth Transport Contract
 * provider state. Default (un-configured) callbacks fail-closed so MFEs
 * waiting on {@code auth.ready()} do not hang or fetch protected
 * endpoints without authentication.
 */
let authReadyImpl: () => Promise<AuthReadyResult> = () =>
  Promise.resolve({
    ok: false,
    reason: 'unauthenticated',
    error: 'Shell services not configured',
  });
let isTransportReadyImpl: () => boolean = () => false;
let getAuthPhaseImpl: () => ShellAuthPhase = () => 'initializing';
let getAuthEpochImpl: () => number = () => 0;
let enterImpersonationSessionImpl: (
  payload: ShellEnterImpersonationPayload,
) => Promise<void> = () =>
  Promise.reject(new Error('Shell services not configured for impersonation'));
let exitImpersonationSessionImpl: () => Promise<ShellExitImpersonationResult> = () =>
  Promise.resolve({
    ok: false as const,
    reason: 'session-lost' as const,
    message: 'Shell services not configured for impersonation',
  });
let isImpersonatingImpl: () => boolean = () => false;
// Codex 019e1bed C-prime AGREE: shell-level superAdmin gate. Default
// `false` is fail-closed; wiring (`shell-services-wiring.ts`) supplies
// the Redux-backed implementation reading `auth.authzSnapshot.superAdmin`.
let isSuperAdminImpl: () => boolean = () => false;
// Codex 019ea409: shell-level per-module access getter. Default `'NONE'`
// is fail-closed; wiring supplies the Redux-backed `selectModuleLevel`.
let getModuleLevelImpl: (module: string) => ShellModuleLevel = () => 'NONE';

const emitTokenChange = (token: string | null, options?: AuthEmitOptions) => {
  const normalizedToken = normalizeToken(token);
  // Iter-6 P2 absorb (Codex thread `019e109c`): {@code force: true}
  // bypasses the same-token short-circuit so the
  // {@code markImpersonationExpired} epoch bump still drives the
  // canonical {@code auth.onTokenChange} fan-out — without forcing
  // wiring would observe {@code token === tokenCache}, return early,
  // and audit-live-stream subscribers would never see the signal.
  if (tokenCache === normalizedToken && !options?.force) {
    return;
  }
  tokenCache = normalizedToken;
  authListeners.forEach((listener) => listener(tokenCache));
};

subscribeAuthState((payload) => {
  emitTokenChange(payload.token ?? null);
});

export const configureShellServices = (init: ShellServicesInit): void => {
  queryClientRef = init.queryClient;
  getAuthTokenImpl = init.getAuthToken;
  notifyImpl = init.notify ?? defaultNotify;
  telemetryImpl = init.telemetry ?? defaultTelemetry;
  featureFlagImpl = init.isFeatureEnabled ?? (() => false);

  // Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): wire MFE Auth Transport
  // Contract callbacks if provided. Defaults remain fail-closed.
  if (init.authReady) authReadyImpl = init.authReady;
  if (init.isTransportReady) isTransportReadyImpl = init.isTransportReady;
  if (init.getAuthPhase) getAuthPhaseImpl = init.getAuthPhase;
  if (init.getAuthEpoch) getAuthEpochImpl = init.getAuthEpoch;
  // PR-C2 impersonation orchestration wires.
  if (init.enterImpersonationSession)
    enterImpersonationSessionImpl = init.enterImpersonationSession;
  if (init.exitImpersonationSession) exitImpersonationSessionImpl = init.exitImpersonationSession;
  if (init.isImpersonating) isImpersonatingImpl = init.isImpersonating;
  if (init.isSuperAdmin) isSuperAdminImpl = init.isSuperAdmin;
  // Codex 019ea409 — reset to the fail-closed default when wiring OMITS the
  // getter, rather than retaining a stale impl from a prior configure call.
  // (The legacy `if (provided)` callbacks above can leak a previous impl on
  // re-configure; the new getter is reset-on-omit so a partial re-wire never
  // leaves MANAGE-level access dangling.)
  getModuleLevelImpl = init.getModuleLevel ?? (() => 'NONE');

  unsubscribeAuthSource?.();
  if (init.subscribeAuthToken) {
    // Iter-6 P2 absorb: forward the {@code force} hint so
    // {@code markImpersonationExpired} epoch bumps reach canonical
    // auth listeners even when the token string is unchanged.
    unsubscribeAuthSource = init.subscribeAuthToken((token, options) =>
      emitTokenChange(token, options),
    );
  } else {
    emitTokenChange(getAuthTokenImpl());
  }
};

export const getShellServices = (): ShellServices => {
  const targetQueryClient = queryClientRef;
  if (!targetQueryClient) {
    if (process.env.NODE_ENV !== 'production') {
      if (!fallbackQueryClient) {
        fallbackQueryClient = new QueryClient();
      }
      if (!warnedUnconfigured) {
        console.debug(
          '[shell] Shell servisleri henüz konfigüre edilmedi; fallback noop döndürülüyor.',
        );
        warnedUnconfigured = true;
      }
      return createShellServices(fallbackQueryClient);
    }
    throw new Error('[shell] configureShellServices must be called first.');
  }
  return createShellServices(targetQueryClient);
};

export const shellServicesContract = contract;

function createShellServices(queryClient: QueryClient | null): ShellServices {
  return {
    auth: {
      getToken: () => normalizeToken(tokenCache ?? getAuthTokenImpl() ?? null),
      onTokenChange: (listener: AuthListener) => {
        authListeners.add(listener);
        listener(normalizeToken(tokenCache ?? getAuthTokenImpl() ?? null));
        return () => authListeners.delete(listener);
      },
      // Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): MFE Auth Transport
      // Contract methods. Routes to wired callbacks (shell-services-wiring)
      // or fail-closed defaults if shell hasn't been configured yet.
      ready: () => authReadyImpl(),
      isTransportReady: () => isTransportReadyImpl(),
      getPhase: () => getAuthPhaseImpl(),
      getEpoch: () => getAuthEpochImpl(),
      // PR-C2 impersonation orchestration surface.
      enterImpersonationSession: (payload) => enterImpersonationSessionImpl(payload),
      exitImpersonationSession: () => exitImpersonationSessionImpl(),
      isImpersonating: () => isImpersonatingImpl(),
      isSuperAdmin: () => isSuperAdminImpl(),
      getModuleLevel: (module: string) => getModuleLevelImpl(module),
    },
    query: queryClient ?? fallbackQueryClient ?? new QueryClient(),
    telemetry: {
      emit: (event: ShellTelemetryEvent) => {
        const payload: ShellTelemetryEvent = {
          ...event,
          timestamp: event.timestamp ?? Date.now(),
        };
        telemetryImpl(payload);
      },
    },
    notify: {
      push: (entry: ShellNotificationEntry) => {
        const notification: ShellNotificationEntry = {
          ...entry,
          createdAt: entry.createdAt ?? Date.now(),
          type: entry.type ?? 'info',
        };
        notifyImpl(notification);
      },
    },
    featureFlags: {
      isEnabled: (flag: string) => Boolean(featureFlagImpl(flag)),
    },
    contract,
  };
}
