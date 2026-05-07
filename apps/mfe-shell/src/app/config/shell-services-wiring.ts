/* ------------------------------------------------------------------ */
/*  Shell services wiring — connects Redux store, telemetry, etc.      */
/* ------------------------------------------------------------------ */

import { api } from '@mfe/shared-http';
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
  // FE-001 reapply (post-#284): runtime conditional gate companion to
  // the build-time omit pattern in vite.config + lazy-routes. Default
  // OFF means no eager loader runs against the disabled remote, so MF
  // runtime never tries to resolve init/get on a disabled URI.
  if (isEndpointAdminRemoteEnabled()) {
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
