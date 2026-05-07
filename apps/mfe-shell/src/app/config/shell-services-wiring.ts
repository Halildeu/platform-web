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
import { setAuthPhase, setKeycloakSession } from '../../features/auth/model/auth.slice';
import { queryClient } from './query-config';
import { readEnvBoolean } from './env';
import { isEndpointAdminRemoteEnabled } from '../shell-navigation';

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

    const notify = () => {
      const nextState = readAuthState();
      const token = nextState.token ?? null;
      const expiresAt = nextState.expiresAt ?? null;
      const profileHash = JSON.stringify(nextState.user ?? null);

      if (token !== previousToken) {
        listener(token);
      }

      if (
        token !== previousToken ||
        expiresAt !== previousExpiresAt ||
        profileHash !== previousProfileHash
      ) {
        broadcastAuthState({
          token,
          expiresAt,
          profile: nextState.user ?? undefined,
        });
        previousToken = token;
        previousExpiresAt = expiresAt;
        previousProfileHash = profileHash;
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
    return { ok: false, reason: 'refresh-closure-failed' };
  }
});

/* ---- Wire remote module shell-services ---- */

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
  const sharedServices = {
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
    },
  };
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
    remotes.push({
      name: 'mfe_endpoint_admin',
      loader: () => import('mfe_endpoint_admin/shell-services'),
    });
  }
  remotes.forEach(({ name, loader }) => {
    loader()
      .then((module) => module.configureShellServices(sharedServices))
      .catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug(`[shell] ${name} shell-services konfigurasyonu atlandı`, error);
        }
      });
  });
};

let remoteShellServicesWired = false;

const shouldWireRemoteShellServices = () => {
  const authState = store.getState().auth;
  return isPermitAllMode() || Boolean(authState.token);
};

const wireRemoteShellServicesWhenReady = () => {
  if (remoteShellServicesWired || !shouldWireRemoteShellServices()) {
    return;
  }
  remoteShellServicesWired = true;
  wireRemoteShellServices();
};

// Avoid eager remote evaluation on public routes like /login. Some remotes
// still pull React vendor chunks during shell-services import, which can
// white-screen the page before auth completes.
wireRemoteShellServicesWhenReady();

store.subscribe(() => {
  wireRemoteShellServicesWhenReady();
});
