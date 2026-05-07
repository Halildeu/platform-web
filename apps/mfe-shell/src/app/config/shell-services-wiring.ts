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

// Phase 2 PR-Refresh-4: wire the single-flight refresh-token handler.
// When a protected request returns 401, the response interceptor
// awaits this handler once (subsequent 401s within the same window
// share the in-flight Promise), then retries the original request
// once. Implementation reads the Keycloak instance attached to
// {@code window.__keycloak} (matches the existing AuthBootstrapper
// pattern); the Keycloak token-refreshed event already updates the
// Redux store + broadcasts to other tabs via auth-sync, so this
// handler only needs to trigger the network refresh.
registerRefreshHandler(async (): Promise<RefreshResult> => {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'no-window' };
  }
  const kc = (window as Record<string, unknown>).__keycloak as
    | { updateToken?: (minValiditySec: number) => Promise<boolean>; token?: string }
    | undefined;
  if (!kc?.updateToken) {
    return { ok: false, reason: 'no-keycloak' };
  }
  try {
    // Force a refresh (-1 means always refresh regardless of remaining
    // validity). Keycloak's onAuthRefreshSuccess hook in
    // AuthBootstrapper will dispatch the new token into the store and
    // broadcast it via auth-sync; we only need to await the refresh
    // network call here so the response interceptor can retry the
    // original request with the fresh token.
    const refreshed = await kc.updateToken(-1);
    if (!refreshed) {
      return { ok: false, reason: 'token-still-valid' };
    }
    return { ok: true, token: kc.token ?? undefined };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[shell] keycloak.updateToken failed during 401 retry:', err);
    }
    return { ok: false, reason: 'updateToken-failed' };
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
