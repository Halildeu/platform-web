/* ------------------------------------------------------------------ */
/*  Shell services wiring — connects Redux store, telemetry, etc.      */
/* ------------------------------------------------------------------ */

import {
  api,
  registerAuthReadyResolver,
  registerRefreshHandler,
  type RefreshResult,
} from '@mfe/shared-http';
import { store } from '../store/store';
import {
  configureShellServices,
  type ShellNotificationEntry,
  type ShellTelemetryEvent,
} from '../services/shell-services';
import {
  pushNotification,
  toggleOpen,
} from '../../features/notifications/model/notifications.slice';
import telemetryClient from '../telemetry/telemetry-client';
import { broadcastAuthState } from '../auth/auth-sync';
import { isPermitAllMode } from '../auth/auth-config';
import { mapKeycloakProfile } from '../config/auth-helpers';
import {
  setAuthPhase,
  setKeycloakSession,
  selectIsImpersonating,
  selectIsSuperAdmin,
} from '../../features/auth/model/auth.slice';
import {
  enterImpersonationOrchestration,
  exitImpersonationOrchestration,
  type EnterImpersonationOrchestrationPayload,
} from './impersonation-orchestration';
import { queryClient } from './query-config';
import { readEnvBoolean } from './env';
import { isEndpointAdminRemoteEnabled } from '../shell-navigation';
import { scheduleOnIdle } from '../../lib/idle-scheduler';
import { ensureRemoteShellServicesConfigured } from './ensure-remote-shell-services';

/**
 * Build-time constant injected by Vite's `define` config (see
 * `vite.config.ts:379`). Mirrors `lazy-routes.ts:51` so the dynamic
 * `import('mfe_endpoint_admin/shell-services')` below can be
 * dead-code eliminated when the remote is disabled at build time.
 *
 * 2026-05-08 fix: previously only `lazy-routes.ts` had this guard.
 * `shell-services-wiring.ts` relied on a runtime function call,
 * which Rolldown's static analyser could not see through — so the
 * import specifier survived dead-code elimination and the build
 * failed with "Rolldown failed to resolve import" when the
 * manifest entry was omitted.
 */
declare const __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__: boolean;

/**
 * PERF-INIT-V2 PR-B5b2-prep (Codex thread `019e2358` AGREE Option B) —
 * build-time constant injected by Vite's `define` config (see
 * `vite.config.ts`). When `true`, the 4 admin remotes
 * (mfe_users / mfe_audit / mfe_access / mfe_reporting) are omitted
 * from the federation manifest at build time, and the static
 * `import('mfe_<admin>/shell-services')` block below is dead-code-eliminated
 * by Rolldown.  Same DCE pattern as `__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__`
 * and `__MFE_SCHEMA_EXPLORER_ON_DEMAND__`.
 *
 * When the canary is OFF (default), the static-import path is
 * preserved verbatim so production builds keep current behaviour
 * (no regression).
 */
declare const __MFE_ADMIN_REMOTES_ON_DEMAND__: boolean;

/* ---- Notification dispatcher ---- */

export const pushShellNotification = (entry: ShellNotificationEntry) => {
  store.dispatch(pushNotification(entry));
  if (entry.meta?.open === true) {
    store.dispatch(toggleOpen(true));
  }
};

/* ---- Telemetry dispatcher ---- */

export const emitShellTelemetry = (event: ShellTelemetryEvent) => {
  telemetryClient.emit(event);
};

/* ------------------------------------------------------------------ */
/*  MFE Auth Transport Contract — auth.ready() Promise bridge          */
/* ------------------------------------------------------------------ */

/**
 * Phase 2 PR-Auth-1 (Codex iter-22/23/24 absorb, thread 019e0119):
 * epoch-aware {@code auth.ready()} Promise bridge for MFE remotes.
 *
 * <p>Behavior:
 * <ul>
 *   <li>If current phase is {@code transportReady}: resolves immediately.</li>
 *   <li>If current phase is {@code failed}: rejects with auth error.</li>
 *   <li>Otherwise: subscribes to store updates and resolves on the first
 *       transition to {@code transportReady} (or rejects on {@code failed}).</li>
 * </ul>
 *
 * <p>Each call snapshots {@code authEpoch} at subscribe time. If the epoch
 * changes (logout, re-login, bumpAuthEpoch) before the Promise settles,
 * subscriber is unhooked and the Promise resolves to a typed
 * {@code unauthenticated} marker so the caller can react (e.g. redirect to
 * login) instead of waiting forever.
 */
type AuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

const createAuthReadyPromise = (): Promise<AuthReadyResult> => {
  const stateNow = store.getState().auth;
  if (stateNow.phase === 'transportReady') {
    return Promise.resolve({ ok: true });
  }
  if (stateNow.phase === 'failed') {
    return Promise.resolve({
      ok: false,
      reason: 'failed',
      error: stateNow.authError?.message,
    });
  }
  if (stateNow.phase === 'unauthenticated') {
    return Promise.resolve({ ok: false, reason: 'unauthenticated' });
  }
  const initialEpoch = stateNow.authEpoch;
  return new Promise<AuthReadyResult>((resolve) => {
    const unsubscribe = store.subscribe(() => {
      const s = store.getState().auth;
      if (s.authEpoch !== initialEpoch) {
        // Epoch changed (logout/re-login) — current waiter is stale.
        unsubscribe();
        resolve({ ok: false, reason: 'unauthenticated' });
        return;
      }
      if (s.phase === 'transportReady') {
        unsubscribe();
        resolve({ ok: true });
      } else if (s.phase === 'failed') {
        unsubscribe();
        resolve({ ok: false, reason: 'failed', error: s.authError?.message });
      } else if (s.phase === 'unauthenticated') {
        unsubscribe();
        resolve({ ok: false, reason: 'unauthenticated' });
      }
    });
  });
};

/* ---- Configure shell services ---- */

configureShellServices({
  queryClient,
  getAuthToken: () => store.getState().auth.token,
  subscribeAuthToken: (listener) => {
    const readAuthState = () => store.getState().auth;
    let previousToken = readAuthState().token ?? null;
    let previousExpiresAt = readAuthState().expiresAt ?? null;
    let previousProfileHash = JSON.stringify(readAuthState().user ?? null);
    // Iter-6 P2 absorb (Codex thread `019e109c`): track epoch so an
    // epoch-only delta (e.g. {@code markImpersonationExpired} bumps
    // it but {@code state.token} stays the broker JWT) still
    // forwards a notification to canonical auth listeners. The
    // remote API at line ~432 already does this; iter-6 review
    // surfaced the canonical surface as drifted.
    let previousEpoch = readAuthState().authEpoch;

    const notify = () => {
      const nextState = readAuthState();
      const token = nextState.token ?? null;
      const expiresAt = nextState.expiresAt ?? null;
      const profileHash = JSON.stringify(nextState.user ?? null);
      const epoch = nextState.authEpoch;

      const tokenChanged = token !== previousToken;
      const epochChanged = epoch !== previousEpoch;

      if (tokenChanged || epochChanged) {
        // Epoch-only deltas pass {@code force: true} so the canonical
        // dispatcher (`emitTokenChange`) bypasses its same-token
        // short-circuit and the fan-out reaches subscribers.
        listener(token, tokenChanged ? undefined : { force: true });
      }

      if (tokenChanged || expiresAt !== previousExpiresAt || profileHash !== previousProfileHash) {
        broadcastAuthState({
          token,
          expiresAt,
          profile: nextState.user ?? undefined,
        });
        previousToken = token;
        previousExpiresAt = expiresAt;
        previousProfileHash = profileHash;
      }
      if (epochChanged) {
        previousEpoch = epoch;
      }
    };

    const unsubscribe = store.subscribe(notify);
    listener(previousToken ?? null);
    broadcastAuthState({
      token: previousToken ?? null,
      expiresAt: previousExpiresAt ?? null,
      profile: readAuthState().user ?? undefined,
    });
    return unsubscribe;
  },
  notify: pushShellNotification,
  telemetry: emitShellTelemetry,
  isFeatureEnabled: () => false,
  // Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb, thread 019e0119):
  // wire MFE Auth Transport Contract callbacks into the canonical
  // shell-services contract so {@code getShellServices().auth.ready()}
  // works for remotes pulling via {@code mfe_shell/services}.
  authReady: () => createAuthReadyPromise(),
  isTransportReady: () => store.getState().auth.phase === 'transportReady',
  getAuthPhase: () => store.getState().auth.phase,
  getAuthEpoch: () => store.getState().auth.authEpoch,
  // User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
  // wire orchestration into the canonical shell-services contract so
  // {@code getShellServices().auth.enterImpersonationSession(...)} is
  // callable from both the host shell (ImpersonationBanner) and remote
  // MFEs (ImpersonateAction in mfe-users).
  enterImpersonationSession: (payload) => enterImpersonationOrchestration(payload),
  exitImpersonationSession: () => exitImpersonationOrchestration(),
  isImpersonating: () => selectIsImpersonating(store.getState()),
  // Codex 019e1bed C-prime AGREE: shell-level superAdmin getter for
  // remote MFE consumers. mfe-users `UserDetailDrawer` /
  // `ImpersonateAction` read this instead of the local PermissionContext
  // so the gate cannot regress when MF share + alias setup drifts.
  isSuperAdmin: () => selectIsSuperAdmin(store.getState()),
});

// Phase 2 PR-HTTP-3: wire the same auth-ready bridge into
// {@code @mfe/shared-http}'s request interceptor. Direct {@code api.get/...}
// calls (legacy callers, internal shell features) now also wait for
// {@code transportReady} before firing — closing the residual 401-storm
// surface that PR-Auth-1's eager-prefetch removal and PR-Reporting-2's
// metadata cache only partially covered (those PRs gated their own
// fetch helpers; this hook gates the underlying axios client).
//
// Remote MFEs that import {@code api} directly via {@code @mfe/shared-http}
// inherit the gate transparently, but the canonical pattern is still to
// consume {@code getShellServices().http} (enforced by the ESLint rule
// added in this PR).
registerAuthReadyResolver(() => createAuthReadyPromise());

// Phase 2 PR-Refresh-4 (Codex iter-1 P0 absorb, thread 019e048d):
// wire the single-flight refresh-token handler. When a protected
// request returns 401, the response interceptor awaits this handler
// once (subsequent 401s within the same window share the in-flight
// Promise), then retries the original request once.
//
// CRITICAL: the handler must complete the FULL transport-refresh
// closure (mirror of AuthBootstrapper.onTokenExpired):
//   1. keycloak.updateToken(-1) → fresh access token
//   2. POST /auth/cookie with the new token (httpOnly cookie write)
//   3. fetchAppPermissions(newToken) → fresh authz snapshot
//   4. dispatch(setKeycloakSession(...)) so the tokenResolver returns
//      the new token when the request interceptor re-injects on retry
// Skipping step 4 (the original iter-0 implementation) leaves the
// Redux store with the OLD token, so the retried request injects the
// stale Authorization header and 401s again.
//
// Each network call inside the closure carries
// `__skipAuthReadyGate: true` and `__skipRefreshOn401: true` to
// avoid re-entering this very pipeline (deadlock + loop guard).
registerRefreshHandler(async (): Promise<RefreshResult> => {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'no-window' };
  }
  // PR-C2 (Codex AGREE thread `019e109c` iter-1 + iter-4): the
  // single-flight 401 refresh handler MUST NOT call
  // keycloak.updateToken while an impersonation session is active.
  // Otherwise the broker exchanged token would be overwritten with
  // the admin token mid-session, breaking the FSM and audit chain.
  // The broker has its own TTL and the impersonation-expired
  // listener observes the 403 SESSION_EXPIRED event when it fires.
  if (selectIsImpersonating(store.getState())) {
    return { ok: false, reason: 'impersonation-active' };
  }
  const kc = (window as Record<string, unknown>).__keycloak as
    | {
        updateToken?: (minValiditySec: number) => Promise<boolean>;
        token?: string;
        tokenParsed?: { exp?: number };
      }
    | undefined;
  if (!kc?.updateToken) {
    return { ok: false, reason: 'no-keycloak' };
  }
  try {
    // Step 1: force-refresh the access token via Keycloak.
    const refreshed = await kc.updateToken(-1);
    const newToken = kc.token;
    if (!refreshed || !newToken) {
      return { ok: false, reason: 'token-still-valid-or-missing' };
    }

    // Step 2: write the new token to the httpOnly cookie. Must
    // bypass both the auth-ready gate (we're driving the FSM) and
    // the refresh pipeline itself (no recursion).
    const cookieCfg = {
      headers: { Authorization: `Bearer ${newToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    await api.post('/auth/cookie', null, cookieCfg);

    // Step 3: fetch the authz snapshot so the new principal's
    // permissions/superAdmin/allowedModules are reflected before any
    // dependent request retries.
    const authzCfg = {
      headers: { Authorization: `Bearer ${newToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    let authzSnapshot: Record<string, unknown> | null = null;
    let permissions: string[] = [];
    let superAdmin = false;
    try {
      const authzRes = await api.get('/v1/authz/me', authzCfg);
      authzSnapshot = (authzRes.data ?? null) as Record<string, unknown> | null;
      const data = (authzSnapshot ?? {}) as {
        permissions?: string[];
        allowedModules?: string[];
        superAdmin?: boolean;
      };
      superAdmin = data.superAdmin === true;
      if (Array.isArray(data.allowedModules) && data.allowedModules.length > 0) {
        permissions = data.allowedModules;
      } else if (Array.isArray(data.permissions)) {
        permissions = data.permissions;
      }
    } catch (authzErr) {
      // Non-fatal — log and proceed with empty snapshot. The retry
      // can still succeed on the original request; missing authz only
      // matters for permission-gated UI surfaces and they will fetch
      // again on next mount.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[shell] /v1/authz/me failed during refresh:', authzErr);
      }
    }

    // Step 4: dispatch the new token to the Redux store. tokenResolver
    // (registered in this file's configureShellServices call above)
    // reads from store.auth.token; the request interceptor re-injects
    // the new token onto the retried request. setKeycloakSession also
    // triggers the existing auth-sync broadcast so other tabs see
    // the refresh.
    const profile = mapKeycloakProfile(newToken);
    const mergedProfile = profile
      ? {
          ...profile,
          permissions: permissions.length > 0 ? permissions : profile.permissions,
          role: superAdmin ? 'ADMIN' : (permissions.find((p) => p === 'ADMIN') ?? profile.role),
        }
      : undefined;
    store.dispatch(
      setKeycloakSession({
        token: newToken,
        profile: mergedProfile,
        expiresAt: kc.tokenParsed?.exp ? kc.tokenParsed.exp * 1000 : null,
        authzSnapshot,
      }),
    );

    // Codex iter-2 P1 absorb (thread 019e048d): re-open the auth-ready
    // gate. setKeycloakSession updates token/user only; phase changes
    // are owned by setAuthPhase. If a 401 fires while the FSM is in
    // {@code refreshing} or {@code authzReady} (e.g. proactive
    // onTokenExpired ran first and stalled mid-closure), the retried
    // request would hang on auth.ready() forever — even though the
    // refresh logically succeeded. Mirror the proactive refresh's last
    // step (AuthBootstrapper.onTokenExpired) and dispatch
    // {@code transportReady} so {@code createAuthReadyPromise()}
    // resolves with {@code ok: true} for the retry's interceptor wait.
    store.dispatch(setAuthPhase('transportReady'));

    return { ok: true, token: newToken };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[shell] refresh closure failed during 401 retry:', err);
    }
    // 2026-05-20 hotfix (Codex thread 019e4443 REVISE absorb): refresh
    // closure failure on 401 retry is unrecoverable — the user's local
    // token is already proven invalid by the 401 that triggered the
    // refresh, AND the refresh attempt itself just failed. Leaving
    // {@code state.auth.token} truthy in Redux replays the same stuck-
    // UI class as the bootstrap-time silent-SSO bug (ProtectedRoute +
    // LoginPage + PermissionProvider all mis-read the inconsistent
    // {phase!=transportReady, token=truthy} pair). Clear Redux session
    // + authzSnapshot + dispatch {@code unauthenticated} so the next
    // protected mount routes to /login. Persistence cleanup is owned
    // by the AuthBootstrapper wrapper's clearPersistedAuthKeys() —
    // shell-services-wiring cannot import it cleanly without a cycle,
    // and the slice's null-token branch already drops the same 3 keys.
    try {
      store.dispatch(setKeycloakSession({ token: null, authzSnapshot: null }));
      store.dispatch(setAuthPhase('unauthenticated'));
    } catch (dispatchErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[shell] stale-token clear dispatch failed:', dispatchErr);
      }
    }
    return { ok: false, reason: 'refresh-closure-failed' };
  }
});

/* ------------------------------------------------------------------ */
/*  User Impersonation v1 PR-C2 — orchestration extracted to            */
/*  ./impersonation-orchestration.ts so unit tests can exercise the    */
/*  enter / exit logic without pulling Module Federation remote        */
/*  imports from this wiring module.                                    */
/* ------------------------------------------------------------------ */

/* ---- Wire remote module shell-services ---- */

/**
 * PERF-INIT-V2 PR-B5b2-prep-2 (Codex thread `019e2358` AGREE Option B) —
 * exposed shape of the sharedServices object that remote MFEs receive
 * via `configureShellServices(sharedServices)`.  Kept as a `type` so
 * the 4 admin on-demand wrappers
 * (`createUsersAppOnDemand.tsx` / `createAccessAppOnDemand.tsx` /
 *  `createAuditAppOnDemand.tsx` / `createReportingAppOnDemand.tsx`)
 * can type-narrow their `ensureRemoteShellServicesConfigured` call.
 */
export type SharedShellServices = {
  notify: { push: typeof pushShellNotification };
  telemetry: { emit: typeof emitShellTelemetry };
  http: typeof api;
  auth: {
    getToken: () => string | null;
    getUser: () => ReturnType<typeof store.getState>['auth']['user'] | null;
    ready: () => ReturnType<typeof createAuthReadyPromise>;
    isTransportReady: () => boolean;
    getPhase: () => ReturnType<typeof store.getState>['auth']['phase'];
    getEpoch: () => number;
    enterImpersonationSession: (
      payload: EnterImpersonationOrchestrationPayload,
    ) => ReturnType<typeof enterImpersonationOrchestration>;
    exitImpersonationSession: () => ReturnType<typeof exitImpersonationOrchestration>;
    isImpersonating: () => boolean;
    isSuperAdmin: () => boolean;
    onTokenChange: (listener: (token: string | null) => void) => () => void;
  };
};

/**
 * Build the sharedServices object once per page load.  All getters are
 * closures over `store.getState()` so the cached object stays current
 * w.r.t. Redux state without rebuild.  Cached at module level so the
 * route-level wrappers (B5b2-prep-2) and the idle batch loader below
 * see the SAME object reference — important for remotes that compare
 * services by identity.
 *
 * Codex `019e2358` Option B note: the cache lifetime is page-scoped
 * (no reset path).  Logout/re-login does NOT invalidate it because
 * the underlying getters read fresh Redux state on each invocation.
 */
let cachedSharedShellServices: SharedShellServices | null = null;

function buildSharedShellServices(): SharedShellServices {
  return {
    notify: { push: pushShellNotification },
    telemetry: { emit: emitShellTelemetry },
    http: api,
    auth: {
      getToken: () => store.getState().auth.token ?? null,
      getUser: () => store.getState().auth.user ?? null,
      /**
       * Phase 2 PR-Auth-1 (Codex iter-24 §Auth-1 absorb, thread 019e0119):
       * epoch-aware {@code ready()} Promise bridge. MFEs MUST call
       * {@code await hostServices.auth.ready()} before issuing protected
       * HTTP requests; the Promise resolves when phase reaches
       * {@code transportReady}, rejects when phase is {@code failed}, and
       * resolves to a typed unauthenticated marker when phase is
       * {@code unauthenticated}. Invalidated by {@link bumpAuthEpoch} /
       * {@link logout} so logout/re-login cycles produce a fresh signal.
       */
      ready: () => createAuthReadyPromise(),
      isTransportReady: () => store.getState().auth.phase === 'transportReady',
      getPhase: () => store.getState().auth.phase,
      getEpoch: () => store.getState().auth.authEpoch,
      /**
       * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c`
       * iter-4): start an impersonation session against the supplied
       * target user. Drives the FSM through {@code refreshing →
       * transportReady} so concurrent protected requests pause until
       * the broker token + target authz snapshot land in Redux.
       */
      enterImpersonationSession: (payload: EnterImpersonationOrchestrationPayload) =>
        enterImpersonationOrchestration(payload),
      /**
       * PR-C2 audit-complete stop (Codex iter-3 invariant: revoke-first;
       * on revoke failure no state mutation, banner shows retry).
       */
      exitImpersonationSession: () => exitImpersonationOrchestration(),
      /** PR-C2 quick gate for ImpersonateAction nested-impersonation guard. */
      isImpersonating: () => selectIsImpersonating(store.getState()),
      // Codex 019e1bed C-prime AGREE: shell-level superAdmin getter for
      // remote MFE consumers. mfe-users `UserDetailDrawer` /
      // `ImpersonateAction` read this instead of the local PermissionContext
      // so the gate cannot regress when MF share + alias setup drifts.
      isSuperAdmin: () => selectIsSuperAdmin(store.getState()),
      /**
       * PR-C2 token change subscription. SSE consumers (mfe-audit
       * useAuditLiveStream) re-open their stream when the broker
       * token swap arrives. Listener fires immediately with the
       * current token (consistent with the {@code subscribeAuthToken}
       * pattern in the legacy host bridge).
       *
       * <p>Codex iter-5 P2 absorb (thread `019e109c`): the listener
       * is now epoch-aware. {@code markImpersonationExpired} bumps
       * {@code authEpoch} but does NOT change {@code state.token}
       * (the broker JWT stays in place until the listener restores
       * the admin or redirects). Without epoch awareness, audit
       * live-stream subscribers would keep their broker SSE alive
       * for an unbounded window after expiry. Treating an epoch
       * delta as a token-change signal forces reconnect against
       * whatever credential is currently authoritative.
       */
      onTokenChange: (listener: (token: string | null) => void) => {
        let previousToken = store.getState().auth.token ?? null;
        let previousEpoch = store.getState().auth.authEpoch;
        listener(previousToken);
        return store.subscribe(() => {
          const nextToken = store.getState().auth.token ?? null;
          const nextEpoch = store.getState().auth.authEpoch;
          if (nextToken !== previousToken || nextEpoch !== previousEpoch) {
            previousToken = nextToken;
            previousEpoch = nextEpoch;
            listener(nextToken);
          }
        });
      },
    },
  };
}

/**
 * Public accessor for the cached sharedServices object.  Used by:
 *   - `wireRemoteShellServices()` below (idle batch loader)
 *   - The 4 admin on-demand wrappers (route-level race protection)
 * Both paths get the same object reference so the helper's
 * configured-remotes Set semantics stay consistent.
 */
export function getSharedShellServices(): SharedShellServices {
  if (cachedSharedShellServices !== null) {
    return cachedSharedShellServices;
  }
  cachedSharedShellServices = buildSharedShellServices();
  return cachedSharedShellServices;
}

/**
 * Test-only reset for the sharedServices cache.  Production code
 * MUST NOT call this; the cache lives for the page lifecycle.
 *
 * @internal
 */
export function __resetSharedShellServicesForTests(): void {
  cachedSharedShellServices = null;
}

// PR-B5b2-prep-3 (Codex `019e237d` post-merge P2 + P3 absorb): canonical
// sequence + URL resolver moved to `./admin-remote-bootstrap.ts` so a
// dedicated unit test can target them without importing this wiring
// module (which pulls federation virtual specifiers that Vite's
// import-analysis cannot resolve under vitest).  Production wiring
// re-exports the sequence so the const remains discoverable through
// `shell-services-wiring`.
export {
  ADMIN_REMOTE_BOOTSTRAP_SEQUENCE,
  resolveAdminRemoteEntry,
  type AdminRemoteKey,
} from './admin-remote-bootstrap';
import { ADMIN_REMOTE_BOOTSTRAP_SEQUENCE, resolveAdminRemoteEntry } from './admin-remote-bootstrap';

export const wireRemoteShellServices = () => {
  if (typeof window === 'undefined') {
    return;
  }
  if (
    readEnvBoolean('VITE_SHELL_SKIP_REMOTE_SERVICES') ||
    readEnvBoolean('SHELL_SKIP_REMOTE_SERVICES')
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[shell] remote shell-services yuklemesi environment ile kapatildi');
    }
    return;
  }
  const sharedServices = getSharedShellServices();
  // PERF-INIT-V2 PR-B5b2-prep-2 (Codex thread `019e2358` AGREE Option B):
  // build-time conditional gate for the 4 admin remotes' shell-services
  // wiring.  When `__MFE_ADMIN_REMOTES_ON_DEMAND__` is ON, Rolldown DCE's
  // the static-import 4-remote contract block below; the idle batch loader
  // uses `ensureRemoteShellServicesConfigured` from the prep-1 helper
  // (PR #459) which registers + loads + configures via host MF runtime
  // instance.  The same helper is also called by the route-level
  // on-demand wrappers so concurrent calls collapse onto a single load.
  //
  // Sequence: `reporting → access → audit → users` (Codex risk ranking,
  // lowest-blast first).  If the helper itself has a pathology, we get
  // an early signal from `mfe_reporting` before touching the more
  // sensitive remotes.
  if (__MFE_ADMIN_REMOTES_ON_DEMAND__) {
    // PR-B5b2-prep-3 (Codex `019e237d` P3 absorb): iterate the canonical
    // sequence so comment-only drift can't silently re-order the
    // registration.  Sequence test in `__tests__/admin-remote-bootstrap.test.ts`
    // asserts the same order at module level.
    const adminRemotes: Array<{ name: string; entry: string }> =
      ADMIN_REMOTE_BOOTSTRAP_SEQUENCE.map((key) => ({
        name: `mfe_${key}`,
        entry: resolveAdminRemoteEntry(key),
      }));
    adminRemotes.forEach(({ name, entry }) => {
      ensureRemoteShellServicesConfigured(name, entry, sharedServices).catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug(`[shell] ${name} shell-services konfigurasyonu atlandı`, error);
        }
      });
    });
  } else {
    // Eager static-import path — current behaviour preserved verbatim
    // when the canary is OFF.  Default for production until the testai
    // variant flips `__MFE_ADMIN_REMOTES_ON_DEMAND__` to true.
    const remotes: Array<{
      name: string;
      loader: () => Promise<{
        configureShellServices: (services: typeof sharedServices) => void;
      }>;
    }> = [
      { name: 'mfe_access', loader: () => import('mfe_access/shell-services') },
      { name: 'mfe_audit', loader: () => import('mfe_audit/shell-services') },
      { name: 'mfe_users', loader: () => import('mfe_users/shell-services') },
      {
        name: 'mfe_reporting',
        loader: () => import('mfe_reporting/shell-services'),
      },
    ];
    remotes.forEach(({ name, loader }) => {
      loader()
        .then((module) => module.configureShellServices(sharedServices))
        .catch((error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug(`[shell] ${name} shell-services konfigurasyonu atlandı`, error);
          }
        });
    });
  }
  // FE-001 (post-#284) + Module Federation build-time tree-shake fix
  // (2026-05-08): the runtime `isEndpointAdminRemoteEnabled()` guard
  // alone is NOT enough — Rolldown's static analysis still tries to
  // resolve `import('mfe_endpoint_admin/shell-services')` at build
  // time, and when `vite.config.buildRemotes()` omits the manifest
  // entry (default OFF), the import resolution fails:
  //   error: [vite]: Rolldown failed to resolve import
  //          "mfe_endpoint_admin/shell-services" from
  //          "shell-services-wiring.ts"
  // Fix: gate the dynamic `import()` behind the same compile-time
  // `__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__` constant that
  // `lazy-routes.ts` already uses. The constant is replaced inline
  // by Vite's `define`, so when the build flag is OFF the entire
  // branch (including the static import specifier) is dead-code
  // eliminated and Rolldown never sees the unresolvable specifier.
  // Runtime `isEndpointAdminRemoteEnabled()` stays as the second
  // gate so a build-time-enabled bundle can still hide the remote
  // at runtime via env flag (legacy contract preserved).
  if (__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__ && isEndpointAdminRemoteEnabled()) {
    import('mfe_endpoint_admin/shell-services')
      .then((module) => module.configureShellServices(sharedServices))
      .catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[shell] mfe_endpoint_admin shell-services konfigurasyonu atlandı', error);
        }
      });
  }
};

/**
 * PERF-INIT-V2 PR-B3a state machine.
 *
 * Before PR-B3a there was a single boolean ("wired or not").  With the
 * idle deferral there is a new intermediate state: callback scheduled
 * but the actual `wireRemoteShellServices()` work has not yet run.
 * Codex review (thread 019e2060) flagged that lumping these together
 * masks the real mental model.  Naming the variable
 * `remoteShellServicesScheduledOrWired` documents the semantics:
 * "we have already committed to wiring; do not schedule again."
 */
let remoteShellServicesScheduledOrWired = false;

const shouldWireRemoteShellServices = () => {
  const authState = store.getState().auth;
  return isPermitAllMode() || Boolean(authState.token);
};

/**
 * PERF-INIT-V2 PR-B3a (shell-services idle deferral).
 *
 * Once auth is ready and we decide to wire remote shell-services, do NOT
 * call {@code wireRemoteShellServices()} synchronously — defer to the next
 * idle window.  None of the remote {@code configureShellServices()}
 * handlers are needed for the next paint; they register background
 * listeners that only fire on later user actions (notification recipients,
 * audit live-stream re-binders, etc.).  Running them off the critical path
 * frees the main thread for post-login route render.
 *
 * {@code timeout: 3000} bounds the worst case so pages that never go
 * idle (continuous animations, polling loops) still get their remote
 * services within 3 seconds.
 *
 * Codex iter-2 P3 absorb (thread 019e2060): the idle callback re-checks
 * {@code shouldWireRemoteShellServices()} before invoking the wiring
 * function.  Without this guard a post-auth → logout sequence (auth lands,
 * idle callback queued, user logs out before idle fires) would still
 * trigger remote chunk loads on the `/login` page — exactly the public-
 * route eager-evaluation hazard the call-site comment was trying to avoid.
 * If the auth state has been invalidated by the time idle fires, we reset
 * the scheduling flag so a subsequent re-login can schedule again.
 */
const REMOTE_SERVICES_IDLE_TIMEOUT_MS = 3000;

const runWireWhenStillReady = () => {
  if (!shouldWireRemoteShellServices()) {
    // Auth was invalidated between schedule and idle fire.  Reset the
    // flag so a future re-login can re-schedule; do NOT wire remotes
    // onto the public route.
    remoteShellServicesScheduledOrWired = false;
    return;
  }
  wireRemoteShellServices();
};

const wireRemoteShellServicesWhenReady = () => {
  if (remoteShellServicesScheduledOrWired || !shouldWireRemoteShellServices()) {
    return;
  }
  remoteShellServicesScheduledOrWired = true;
  scheduleOnIdle(runWireWhenStillReady, {
    timeout: REMOTE_SERVICES_IDLE_TIMEOUT_MS,
  });
};

// Avoid eager remote evaluation on public routes like /login. Some remotes
// still pull React vendor chunks during shell-services import, which can
// white-screen the page before auth completes.
//
// PR-B3a (2026-05-13): even after auth lands, the actual
// `wireRemoteShellServices()` call is now deferred to the next idle window
// via `scheduleOnIdle` so it does not compete with the critical post-login
// render.
wireRemoteShellServicesWhenReady();

store.subscribe(() => {
  wireRemoteShellServicesWhenReady();
});
