/**
 * ImpersonationExpiredListener — User Impersonation v1 PR-C2 (Codex AGREE
 * thread `019e109c` iter-4 absorb).
 *
 * Listens for the {@code app:auth:impersonation-expired} window event
 * dispatched by {@code @mfe/shared-http}'s response interceptor when a
 * 403 carries one of the {@link IMPERSONATION_ERROR_CODES} values.
 *
 * Recovery flow:
 *   1. Mark the substate {@code expired} so SSE / banner consumers
 *      stop reading the broker token.
 *   2. If the cached original admin token + expiry are still valid,
 *      run the exit orchestration to restore the admin identity.
 *   3. Otherwise (token gone, expired, or restore failed): clear all
 *      impersonation metadata and redirect to /login with a
 *      {@code reason=impersonation_expired} query parameter so the
 *      user sees an explicit "your session ended" message.
 *
 * Mounted once at the top of the shell tree by {@code AppProviders}.
 * StrictMode dev double-mount is idempotent — the effect uses a
 * symbol-keyed installation flag on the {@code window} object so the
 * second mount returns early without re-installing the listener.
 */
import React, { useEffect } from 'react';
import { useAppDispatch } from '../store/store.hooks';
import { store } from '../store/store';
import { markImpersonationExpired } from '../../features/auth/model/auth.slice';
import {
  clearImpersonationOnFailurePath,
  readImpersonationOriginalAdminExpiresAt,
  readImpersonationOriginalToken,
} from '../layout/impersonation-storage';
import { exitImpersonationOrchestration } from '../config/impersonation-orchestration';

const INSTALL_FLAG = '__impersonationExpiredListenerInstalled__';

interface ImpersonationExpiredEventDetail {
  code?: string;
  status?: number;
  method?: string;
  url?: string;
  timestamp?: number;
}

const redirectToLoginExpired = () => {
  if (typeof window === 'undefined') return;
  // Use {@code assign} (not {@code replace}) so the user can navigate
  // back to the previous page if they re-authenticate without the
  // browser nuking the history entry.
  try {
    window.location.assign('/login?reason=impersonation_expired');
  } catch {
    // best effort
  }
};

const handleExpired = async (
  detail: ImpersonationExpiredEventDetail | undefined,
): Promise<void> => {
  const reason = detail?.code ?? 'expired';
  store.dispatch(markImpersonationExpired({ reason }));

  // Prefer the in-memory original admin material (Redux substate) so
  // the orchestration short-circuits the authz/me re-fetch when
  // possible. Fall back to the persisted token if the listener fires
  // after a hydrate-only path (no in-memory snapshot).
  const reduxOriginalToken = store.getState().auth.impersonation.originalAdminToken;
  const reduxOriginalExpiresAt = store.getState().auth.impersonation.originalAdminExpiresAt;
  const persistedOriginalToken = readImpersonationOriginalToken();
  const persistedOriginalExpiresAt = readImpersonationOriginalAdminExpiresAt();

  const adminToken = reduxOriginalToken ?? persistedOriginalToken;
  const adminExpiresAt = reduxOriginalExpiresAt ?? persistedOriginalExpiresAt;

  const adminTokenValid =
    !!adminToken && typeof adminExpiresAt === 'number' && adminExpiresAt > Date.now();

  if (!adminTokenValid) {
    clearImpersonationOnFailurePath();
    redirectToLoginExpired();
    return;
  }

  try {
    const result = await exitImpersonationOrchestration();
    if (!result.ok) {
      // Revoke endpoint may legitimately reject the cleanup attempt
      // (e.g. session was already revoked by another admin). Either
      // way the broker token is gone — push the user to /login so
      // they can re-authenticate cleanly.
      clearImpersonationOnFailurePath();
      redirectToLoginExpired();
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[shell] impersonation-expired listener exit failed', err);
    }
    clearImpersonationOnFailurePath();
    redirectToLoginExpired();
  }
};

export const ImpersonationExpiredListener: React.FC = () => {
  const dispatch = useAppDispatch();
  // dispatch reference is intentionally unused by the listener body
  // (the handler dispatches directly via the imported {@code store}
  // to keep the closure independent of React StrictMode re-mount
  // ordering); the hook call still ensures the component is mounted
  // inside the Provider tree.
  void dispatch;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as Window & Record<string, unknown>;
    if (win[INSTALL_FLAG] === true) {
      return;
    }
    win[INSTALL_FLAG] = true;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<ImpersonationExpiredEventDetail | undefined>;
      void handleExpired(custom.detail);
    };
    window.addEventListener('app:auth:impersonation-expired', handler);

    return () => {
      window.removeEventListener('app:auth:impersonation-expired', handler);
      win[INSTALL_FLAG] = false;
    };
  }, []);

  return null;
};

export default ImpersonationExpiredListener;
