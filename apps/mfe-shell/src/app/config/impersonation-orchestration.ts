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
  // Codex 019e1bed REVISE-2: optional. Backend resolves via internal
  // user-service endpoint when omitted.
  targetSubject?: string;
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
  // Codex 019e1bed REVISE-2: optional. Backend resolves via internal
  // user-service endpoint when omitted.
  targetSubject?: string;
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

/**
 * PR-C2 iter-6 P1 absorb (Codex thread `019e109c`): broker httpOnly
 * cookie drop helper, callable on every failure / logout path that
 * tears down impersonation metadata. Iter-5 added the cookie drop
 * inside {@link recoverFromLifecycleExpiry} only; iter-6 review
 * surfaced 4 additional paths where the broker cookie was leaking:
 *
 * <ol>
 *   <li>{@code ImpersonationExpiredListener} admin-invalid branch
 *       (cached admin token gone or expired — recovery cannot run,
 *       /login redirect fires).</li>
 *   <li>{@code exitImpersonationOrchestration} {@code session-lost}
 *       branch (sessionId missing in store + persisted).</li>
 *   <li>{@code exitImpersonationOrchestration} {@code admin-expired}
 *       branch (cached admin token + expiry already past).</li>
 *   <li>{@code UserMenuDropdown} logout handler when impersonation is
 *       still active at logout time.</li>
 * </ol>
 *
 * <p>Best-effort semantics: any rejection is swallowed because the
 * cookie may already be gone (404), the network may be flaky, or the
 * broker token itself may be expired (401 from the gateway). The
 * caller's primary task — clear metadata + redirect — must continue
 * regardless. Errors are only logged in non-production builds for
 * forensic visibility.
 *
 * <p>The optional {@code brokerToken} argument lets callers attach an
 * {@code Authorization: Bearer <broker>} header when they still hold
 * the broker JWT in memory; on the logout path the helper is invoked
 * without a broker token because Redux has already been torn down,
 * but the gateway will still drop the cookie via the implicit cookie
 * credential.
 */
export async function dropBrokerCookieBestEffort(brokerToken?: string | null): Promise<void> {
  try {
    const cfg: SharedHttpRequestConfig = {
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
      ...(brokerToken ? { headers: { Authorization: `Bearer ${brokerToken}` } } : {}),
    };
    await api.delete('/auth/cookie', cfg);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[shell] broker cookie drop best-effort failed (non-fatal)', err);
    }
  }
}

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
  // Codex 019e1bed REVISE-2: build request conditionally so the
  // `targetSubject` key is omitted from the JSON payload entirely when
  // the caller didn't supply one. Backend resolves the subject
  // server-side via the internal user-service endpoint.
  const trimmedSubject = payload.targetSubject?.trim();
  const startRequest: StartImpersonationRequest = {
    targetUserId: payload.targetUserId,
    targetEmail: payload.targetEmail,
    reason: payload.reason.trim(),
    ...(trimmedSubject ? { targetSubject: trimmedSubject } : {}),
  };
  let response: StartImpersonationResponseShape;
  try {
    const res = await api.post('/v1/impersonation/sessions', startRequest, startCfg);
    response = res.data as StartImpersonationResponseShape;
  } catch (err) {
    store.dispatch(setAuthPhase('transportReady'));
    // Codex 019e1e0f BUG #3 follow-up: Spring's
    // MethodArgumentNotValidException (e.g. reason < 10 chars) returns
    // a 400 with body shape
    //   { error: "VALIDATION_ERROR",
    //     message: "Validation failed",
    //     fieldErrors: [{ field: "reason", message: "boyut '10' ile '500' arasında olmalı" }] }
    // which differs from the StartResponse `errorCode/errorMessage`
    // shape the controller's BLOCKED branches return. Without this
    // adapter the FE error mapping never matched (axios error.message
    // is just "Request failed with status code 400") and users saw a
    // generic "Impersonation başlatılamadı" fallback. Surface the
    // field-level message + a synthetic `VALIDATION_ERROR` errorCode
    // so ImpersonateAction's ERROR_CODE_MESSAGES map can localize it.
    const axiosBody = (err as { response?: { data?: unknown } })?.response?.data;
    if (axiosBody && typeof axiosBody === 'object') {
      const body = axiosBody as {
        error?: string;
        message?: string;
        fieldErrors?: Array<{ field?: string; message?: string }>;
      };
      if (body.error === 'VALIDATION_ERROR') {
        const fieldMsg = body.fieldErrors?.find((fe) => fe?.message)?.message;
        const wrappedMsg = fieldMsg ?? body.message ?? 'Validation failed';
        const wrapped = new Error(wrappedMsg) as Error & { errorCode?: string };
        wrapped.errorCode = 'VALIDATION_ERROR';
        throw wrapped;
      }
    }
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

  // Iter-7 P1-2 absorb (Codex thread `019e109c`): track whether the
  // broker httpOnly cookie has actually been written so the catch
  // block can roll the gateway back to the admin identity if any
  // subsequent step (authz/me, dispatch, cache reset) throws.
  // Without this rollback, a partial failure leaves the gateway with
  // a broker cookie pointed at the target user while Redux still
  // shows the admin — a split-brain that defeats the FSM-first
  // guarantee PR-C2 is built around (no localStorage / cookie state
  // outside the FSM).
  let brokerCookieWritten = false;
  try {
    const cookieCfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${exchangedToken}` },
      __skipAuthReadyGate: true,
      __skipRefreshOn401: true,
    };
    await api.post('/auth/cookie', null, cookieCfg);
    brokerCookieWritten = true;

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
    // Iter-7 P1-2 absorb (Codex thread `019e109c`): if the broker
    // cookie was already written, roll the gateway back so the
    // admin's cookie matches Redux (which still holds the admin
    // identity — none of the impersonation dispatches ran). Both
    // requests are best-effort: the broker cookie may already be
    // gone, and the admin restore may collide with an unrelated
    // session, but the outer caller still re-throws so the UI shows
    // a toast and the user can retry.
    if (brokerCookieWritten) {
      try {
        await dropBrokerCookieBestEffort(exchangedToken);
      } catch (dropErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[shell] broker cookie rollback drop failed (non-fatal)', dropErr);
        }
      }
      try {
        const restoreCfg: SharedHttpRequestConfig = {
          headers: { Authorization: `Bearer ${adminToken}` },
          __skipAuthReadyGate: true,
          __skipRefreshOn401: true,
        };
        await api.post('/auth/cookie', null, restoreCfg);
      } catch (restoreErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            '[shell] admin cookie restore after broker rollback failed (non-fatal)',
            restoreErr,
          );
        }
      }
    }
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
    // Iter-6 P1 absorb (Codex thread `019e109c`): drop the broker
    // httpOnly cookie before metadata teardown so the gateway no
    // longer holds an impersonation cookie pointing at a session id
    // we cannot revoke. {@code state.token} is the broker JWT at
    // this point (Redux still carries it because exit was triggered
    // from the banner while impersonation was active).
    await dropBrokerCookieBestEffort(state.token);
    store.dispatch(markImpersonationExpired({ reason: 'session_lost' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'session-lost' };
  }
  if (
    !originalAdminToken ||
    typeof originalAdminExpiresAt !== 'number' ||
    originalAdminExpiresAt <= Date.now()
  ) {
    // Iter-6 P1 absorb: same broker cookie drop on the admin-expired
    // branch — restore cannot run, banner will redirect to /login,
    // but the cookie must still be invalidated server-side so the
    // next non-impersonation request does not authenticate as the
    // target user.
    await dropBrokerCookieBestEffort(state.token);
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
    // Iter-6 P1 absorb (Codex thread `019e109c`): drop broker cookie
    // even on the early-exit fail-closed branches so the gateway
    // does not retain an impersonation credential after metadata
    // teardown.
    await dropBrokerCookieBestEffort(brokerToken);
    store.dispatch(markImpersonationExpired({ reason: 'session_lost' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'session-lost' };
  }
  if (
    !originalAdminToken ||
    typeof originalAdminExpiresAt !== 'number' ||
    originalAdminExpiresAt <= Date.now()
  ) {
    // Iter-6 P1 absorb: same — admin token gone or expired, broker
    // cookie still has to drop before clearImpersonationOnFailurePath
    // so the next page load does not see a stale impersonation
    // cookie tied to a session we can no longer prove ownership of.
    await dropBrokerCookieBestEffort(brokerToken);
    store.dispatch(markImpersonationExpired({ reason: 'admin_expired' }));
    clearImpersonationOnFailurePath();
    return { ok: false, reason: 'admin-expired' };
  }

  store.dispatch(setAuthPhase('refreshing'));

  // Best-effort broker cookie drop. The DELETE may fail (already revoked,
  // network blip); the admin cookie write below overwrites it either way.
  // Iter-6 P1 absorb: route through the shared helper so every cleanup
  // path emits the same telemetry shape and shares the swallow-error
  // contract.
  if (brokerToken) {
    await dropBrokerCookieBestEffort(brokerToken);
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
