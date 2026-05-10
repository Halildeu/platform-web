/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * extracted impersonation orchestration. Lives in its own module so
 * unit tests can exercise enter/exit without pulling
 * shell-services-wiring's Module Federation remote import side-effects.
 *
 * The shell wires the orchestration at startup via the
 * {@code configureShellServices} call in {@code shell-services-wiring.ts};
 * remote MFEs reach it through {@code getShellServices().auth.*}.
 */
import { api, type SharedHttpRequestConfig } from '@mfe/shared-http';
import { store } from '../store/store';
import { mapKeycloakProfile } from '../config/auth-helpers';
import {
  setAuthPhase,
  enterImpersonationSession,
  exitImpersonationSession as exitImpersonationSessionAction,
  markImpersonationExpired,
  selectImpersonationSessionId,
  selectImpersonationOriginalAdminToken,
  selectImpersonationOriginalAdminExpiresAt,
} from '../../features/auth/model/auth.slice';
import {
  enterImpersonationMode,
  exitImpersonationMode,
  clearImpersonationOnFailurePath,
} from '../layout/impersonation-storage';
import { queryClient } from './query-config';
import type { UserProfile } from '@mfe/shared-types';

/**
 * Inline copy of the {@code @mfe/auth} start request shape — pulling
 * the full {@code @mfe/auth} module here would re-introduce the auth ↔
 * design-system Module Federation cycle the
 * mf-preload-helper-isolation plugin guards against.
 */
interface StartImpersonationRequest {
  targetUserId: number;
  targetSubject: string;
  targetEmail?: string;
  reason: string;
}

interface StartImpersonationResponseShape {
  sessionId: string | null;
  exchangedToken: string | null;
  expiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface EnterImpersonationOrchestrationPayload {
  targetUserId: number;
  targetSubject: string;
  targetEmail?: string;
  reason: string;
}

export type ExitImpersonationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'session-lost' | 'admin-expired' | 'revoke-failed' | 'restore-failed';
      message?: string;
    };

const buildTargetUser = (
  exchangedToken: string,
  authzSnapshot: Record<string, unknown> | null,
): UserProfile | null => {
  const profile = mapKeycloakProfile(exchangedToken);
  if (!profile) return null;
  const authzPermissions = Array.isArray(authzSnapshot?.['permissions'])
    ? (authzSnapshot?.['permissions'] as string[])
    : [];
  const isSuperAdmin = authzSnapshot?.['superAdmin'] === true;
  return {
    ...profile,
    permissions: authzPermissions.length > 0 ? authzPermissions : profile.permissions,
    role: isSuperAdmin
      ? 'ADMIN'
      : authzPermissions.length > 0
        ? (authzPermissions.find((p) => p === 'ADMIN') ?? profile.role)
        : profile.role,
  };
};

const decodeTokenExpiry = (token: string): number | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
      '=',
    );
    const decoded =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

/**
 * PR-C2 enterImpersonationSession orchestration.
 */
export async function enterImpersonationOrchestration(
  payload: EnterImpersonationOrchestrationPayload,
): Promise<void> {
  const state = store.getState().auth;
  const adminToken = state.token;
  if (!adminToken) {
    throw new Error('Cannot start impersonation without an admin token');
  }
  if (state.impersonation.status === 'active' || state.impersonation.status === 'entering') {
    throw new Error('Another impersonation session is already active');
  }

  const originalAdminUser = state.user;
  const originalAdminAuthzSnapshot = state.authzSnapshot;
  const originalAdminExpiresAt = state.expiresAt;

  store.dispatch(setAuthPhase('refreshing'));

  const startCfg: SharedHttpRequestConfig = {
    headers: { Authorization: `Bearer ${adminToken}` },
    __skipAuthReadyGate: true,
    __skipRefreshOn401: true,
  };
  const startRequest: StartImpersonationRequest = {
    targetUserId: payload.targetUserId,
    targetSubject: payload.targetSubject.trim(),
    targetEmail: payload.targetEmail,
    reason: payload.reason.trim(),
  };
  let response: StartImpersonationResponseShape;
  try {
    const res = await api.post('/v1/impersonation/sessions', startRequest, startCfg);
    response = res.data as StartImpersonationResponseShape;
  } catch (err) {
    store.dispatch(setAuthPhase('transportReady'));
    throw err;
  }

  if (response.errorCode || !response.exchangedToken || !response.sessionId) {
    store.dispatch(setAuthPhase('transportReady'));
    const message = response.errorMessage ?? 'Impersonation could not be started';
    const error = new Error(message) as Error & { errorCode?: string };
    error.errorCode = response.errorCode ?? undefined;
    throw error;
  }

  const exchangedToken = response.exchangedToken;
  const sessionId = response.sessionId;
  const brokerExpiresAt = response.expiresAt
    ? new Date(response.expiresAt).getTime()
    : decodeTokenExpiry(exchangedToken);

  try {
    const cookieCfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${exchangedToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    await api.post('/auth/cookie', null, cookieCfg);

    const authzCfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${exchangedToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    const authzRes = await api.get('/v1/authz/me', authzCfg);
    const targetAuthzSnapshot = (authzRes.data ?? null) as Record<string, unknown> | null;
    const targetUser = buildTargetUser(exchangedToken, targetAuthzSnapshot);

    enterImpersonationMode({
      originalAdminToken: adminToken,
      originalAdminExpiresAt: originalAdminExpiresAt,
      sessionId,
      exchangedToken,
      expiresAt: brokerExpiresAt,
    });

    try {
      await queryClient.cancelQueries();
      queryClient.clear();
    } catch (cacheErr) {
      console.warn('[shell] queryClient.clear failed during impersonation enter', cacheErr);
    }

    store.dispatch(
      enterImpersonationSession({
        sessionId,
        exchangedToken,
        expiresAt: brokerExpiresAt,
        targetUser,
        targetAuthzSnapshot,
        originalAdminToken: adminToken,
        originalAdminUser,
        originalAdminAuthzSnapshot,
        originalAdminExpiresAt,
      }),
    );

    store.dispatch(setAuthPhase('transportReady'));
  } catch (err) {
    clearImpersonationOnFailurePath();
    store.dispatch(setAuthPhase('transportReady'));
    throw err;
  }
}

/**
 * PR-C2 exitImpersonationSession orchestration (Codex iter-3 invariant
 * — audit-complete stop, revoke-first).
 */
export async function exitImpersonationOrchestration(): Promise<ExitImpersonationResult> {
  const state = store.getState().auth;
  const sessionId = selectImpersonationSessionId(store.getState()) ?? state.impersonation.sessionId;
  const originalAdminToken =
    selectImpersonationOriginalAdminToken(store.getState()) ??
    state.impersonation.originalAdminToken;
  const originalAdminExpiresAt =
    selectImpersonationOriginalAdminExpiresAt(store.getState()) ??
    state.impersonation.originalAdminExpiresAt;

  if (!sessionId) {
    store.dispatch(markImpersonationExpired({ reason: 'session_lost' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'session-lost' };
  }
  if (
    !originalAdminToken ||
    typeof originalAdminExpiresAt !== 'number' ||
    originalAdminExpiresAt <= Date.now()
  ) {
    store.dispatch(markImpersonationExpired({ reason: 'admin_expired' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'admin-expired' };
  }

  store.dispatch(setAuthPhase('refreshing'));

  try {
    const revokeCfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${originalAdminToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    await api.post(
      `/v1/impersonation/sessions/${sessionId}/revoke`,
      { reason: 'USER_STOP_FROM_BANNER' },
      revokeCfg,
    );
  } catch (revokeErr) {
    store.dispatch(setAuthPhase('transportReady'));
    const message =
      revokeErr instanceof Error
        ? revokeErr.message
        : 'Backend revoke failed during impersonation stop';
    return { ok: false, reason: 'revoke-failed', message };
  }

  let adminAuthzSnapshot: Record<string, unknown> | null =
    store.getState().auth.impersonation.originalAdminAuthzSnapshot;
  let adminUser = store.getState().auth.impersonation.originalAdminUser;

  try {
    const cookieCfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${originalAdminToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    await api.post('/auth/cookie', null, cookieCfg);

    if (!adminAuthzSnapshot) {
      try {
        const authzCfg: SharedHttpRequestConfig = {
          headers: { Authorization: `Bearer ${originalAdminToken}` },
          __skipAuthReadyGate: true,
          __skipRefreshOn401: true,
        };
        const authzRes = await api.get('/v1/authz/me', authzCfg);
        adminAuthzSnapshot = (authzRes.data ?? null) as Record<string, unknown> | null;
      } catch (authzErr) {
        console.warn('[shell] admin authz/me fetch failed during impersonation exit', authzErr);
      }
    }
    if (!adminUser) {
      adminUser = buildTargetUser(originalAdminToken, adminAuthzSnapshot);
    }

    try {
      await queryClient.cancelQueries();
      queryClient.clear();
    } catch (cacheErr) {
      console.warn('[shell] queryClient.clear failed during impersonation exit', cacheErr);
    }

    store.dispatch(
      exitImpersonationSessionAction({
        adminToken: originalAdminToken,
        adminUser,
        adminAuthzSnapshot,
        adminExpiresAt: originalAdminExpiresAt,
      }),
    );
    store.dispatch(setAuthPhase('transportReady'));
    exitImpersonationMode();
    return { ok: true };
  } catch (restoreErr) {
    store.dispatch(setAuthPhase('transportReady'));
    const message =
      restoreErr instanceof Error
        ? restoreErr.message
        : 'Admin restore failed after revoke succeeded';
    return { ok: false, reason: 'restore-failed', message };
  }
}

/**
 * PR-C2 lifecycle-expired recovery path (Codex iter-5 P1-4 absorb,
 * thread `019e109c`). Distinct from {@link exitImpersonationOrchestration}
 * because the backend already considers the session inactive when this
 * runs — calling {@code POST /sessions/<id>/revoke} would 4xx and the
 * banner-stop revoke-first sequence would never reach admin restore.
 *
 * <p>Flow:
 * <ol>
 *   <li>Drop the broker httpOnly cookie (best-effort {@code DELETE /auth/cookie}
 *       with the broker token; ignored if it fails since the new admin
 *       cookie below will overwrite it anyway).</li>
 *   <li>Re-write {@code /auth/cookie} with the cached admin token so the
 *       gateway swaps back to the admin session.</li>
 *   <li>Refresh the admin authz snapshot if it is not already in memory.</li>
 *   <li>Reset the React-Query cache so any in-flight target queries die.</li>
 *   <li>Dispatch {@link exitImpersonationSession} to atomically restore
 *       the admin identity in Redux + clear the impersonation substate.</li>
 *   <li>Clear the impersonation localStorage keys.</li>
 * </ol>
 *
 * <p>Pre-conditions: the listener verified the cached admin token is
 * still valid (TTL not exceeded). When the admin token is gone or
 * already expired the listener takes the {@code clearImpersonationOnFailurePath}
 * + {@code /login?reason=impersonation_expired} branch and never calls
 * this helper.
 */
export async function recoverFromLifecycleExpiry(): Promise<ExitImpersonationResult> {
  const state = store.getState().auth;
  const sessionId = selectImpersonationSessionId(store.getState()) ?? state.impersonation.sessionId;
  const originalAdminToken =
    selectImpersonationOriginalAdminToken(store.getState()) ??
    state.impersonation.originalAdminToken;
  const originalAdminExpiresAt =
    selectImpersonationOriginalAdminExpiresAt(store.getState()) ??
    state.impersonation.originalAdminExpiresAt;
  const brokerToken = state.token;

  if (!sessionId) {
    store.dispatch(markImpersonationExpired({ reason: 'session_lost' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'session-lost' };
  }
  if (
    !originalAdminToken ||
    typeof originalAdminExpiresAt !== 'number' ||
    originalAdminExpiresAt <= Date.now()
  ) {
    store.dispatch(markImpersonationExpired({ reason: 'admin_expired' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'admin-expired' };
  }

  store.dispatch(setAuthPhase('refreshing'));

  // Best-effort broker cookie drop. The DELETE may fail (already revoked,
  // network blip); the admin cookie write below overwrites it either way.
  if (brokerToken) {
    try {
      const dropCfg: SharedHttpRequestConfig = {
        headers: { Authorization: `Bearer ${brokerToken}` },
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
      };
      await api.delete('/auth/cookie', dropCfg);
    } catch (dropErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[shell] broker cookie drop ignored during lifecycle recovery', dropErr);
      }
    }
  }

  let adminAuthzSnapshot: Record<string, unknown> | null =
    store.getState().auth.impersonation.originalAdminAuthzSnapshot;
  let adminUser = store.getState().auth.impersonation.originalAdminUser;

  try {
    const cookieCfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${originalAdminToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    await api.post('/auth/cookie', null, cookieCfg);

    if (!adminAuthzSnapshot) {
      try {
        const authzCfg: SharedHttpRequestConfig = {
          headers: { Authorization: `Bearer ${originalAdminToken}` },
          __skipAuthReadyGate: true,
          __skipRefreshOn401: true,
        };
        const authzRes = await api.get('/v1/authz/me', authzCfg);
        adminAuthzSnapshot = (authzRes.data ?? null) as Record<string, unknown> | null;
      } catch (authzErr) {
        console.warn(
          '[shell] admin authz/me fetch failed during lifecycle recovery; continuing with empty snapshot',
          authzErr,
        );
      }
    }
    if (!adminUser) {
      adminUser = buildTargetUser(originalAdminToken, adminAuthzSnapshot);
    }

    try {
      await queryClient.cancelQueries();
      queryClient.clear();
    } catch (cacheErr) {
      console.warn('[shell] queryClient.clear failed during lifecycle recovery', cacheErr);
    }

    store.dispatch(
      exitImpersonationSessionAction({
        adminToken: originalAdminToken,
        adminUser,
        adminAuthzSnapshot,
        adminExpiresAt: originalAdminExpiresAt,
      }),
    );
    store.dispatch(setAuthPhase('transportReady'));
    exitImpersonationMode();
    return { ok: true };
  } catch (restoreErr) {
    store.dispatch(setAuthPhase('transportReady'));
    const message =
      restoreErr instanceof Error
        ? restoreErr.message
        : 'Admin restore failed during lifecycle recovery';
    return { ok: false, reason: 'restore-failed', message };
  }
}
