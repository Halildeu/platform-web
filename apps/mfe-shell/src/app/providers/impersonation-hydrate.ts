/**
 * User Impersonation v1 PR-C2 — page-refresh hydrate guard helper.
 *
 * Extracted from {@code AuthBootstrapper.tsx} during iter-6 absorb
 * (Codex thread `019e109c`) so the 6-condition hydrate guard is
 * unit-testable without mounting the entire React bootstrap tree
 * (Approach A in the iter-6 review). The component still owns the
 * one-call-site decision (when to invoke this helper) and the lazy
 * Keycloak short-circuit; the side-effects below are the production
 * code path.
 *
 * Six-condition guard (fail-closed if ANY condition is false):
 *   1. {@code IMPERSONATION_MODE_KEY === 'active'}
 *   2. {@code IMPERSONATION_SESSION_ID_KEY} present
 *   3. broker exchanged token decodes as an impersonation token
 *      (azp claim equals {@code BROKER_AZP_CLAIM_DEFAULT})
 *   4. broker token not expired (exp claim > now)
 *   5. broker JWT {@code sid} claim matches the persisted session id
 *   6. original admin token present AND its persisted expiry > now
 *
 * On any failed condition we call {@link clearImpersonationOnFailurePath}
 * and return {@code false}; the caller then falls through to the
 * normal Keycloak bootstrap branch with admin identity. On the happy
 * path we re-write the broker cookie, fetch a fresh target authz
 * snapshot, dispatch {@code hydrateImpersonationSession + transportReady
 * + setAuthInitialized(true)}, and return {@code true}.
 */
import { api, type SharedHttpRequestConfig } from '@mfe/shared-http';
import {
  clearImpersonationOnFailurePath,
  isImpersonationModeActive,
  readImpersonationExchangedToken,
  readImpersonationExpiresAt,
  readImpersonationOriginalAdminExpiresAt,
  readImpersonationOriginalToken,
  readImpersonationSessionId,
  readImpersonationStartedAt,
} from '../layout/impersonation-storage';
import {
  decodeJwtPayload,
  hydrateImpersonationSession,
  setAuthInitialized,
  setAuthPhase,
} from '../../features/auth/model/auth.slice';
import { mapKeycloakProfile } from '../config/auth-helpers';
import type { UserProfile } from '@mfe/shared-types';

/**
 * Minimal dispatcher contract — intentionally narrower than Redux's
 * own {@code Dispatch<AnyAction>} so tests can pass a plain
 * {@code vi.fn()} without wrestling with overload mismatches. The
 * production caller (AuthBootstrapper) supplies the real Redux
 * dispatch.
 */
type ImpersonationHydrateDispatch = (action: { type: string; payload?: unknown }) => unknown;

const BROKER_AZP_CLAIM_DEFAULT = 'impersonation-broker';

/**
 * Token introspection helper. Avoids an {@code @mfe/auth} import —
 * that package is already bound through the federation runtime and a
 * direct import here re-introduces the auth ↔ design-system MF cycle
 * the {@code mf-preload-helper-isolation} plugin tears apart.
 */
const isBrokerToken = (token: string | null | undefined): boolean => {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  return (payload as Record<string, unknown>).azp === BROKER_AZP_CLAIM_DEFAULT;
};

export interface ImpersonationHydrateGuardConditions {
  modeActive: boolean;
  sessionId: boolean;
  tokenIsBroker: boolean;
  tokenNotExpired: boolean;
  sidMatch: boolean;
  originalAdminTokenValid: boolean;
}

export const evaluateImpersonationHydrateGuards = (): ImpersonationHydrateGuardConditions => {
  const sessionId = readImpersonationSessionId();
  const exchangedToken = readImpersonationExchangedToken();
  const originalAdminToken = readImpersonationOriginalToken();
  const originalAdminExpiresAt = readImpersonationOriginalAdminExpiresAt();

  const tokenIsBroker = isBrokerToken(exchangedToken);
  const payload = exchangedToken ? decodeJwtPayload(exchangedToken) : null;
  const tokenExpEpoch =
    payload && typeof payload.exp === 'number' ? (payload.exp as number) * 1000 : null;
  const sidClaim =
    payload && typeof (payload as Record<string, unknown>).sid === 'string'
      ? ((payload as Record<string, unknown>).sid as string)
      : null;

  return {
    modeActive: isImpersonationModeActive(),
    sessionId: !!sessionId,
    tokenIsBroker,
    tokenNotExpired: tokenExpEpoch !== null && tokenExpEpoch > Date.now(),
    sidMatch: !!sidClaim && sidClaim === sessionId,
    originalAdminTokenValid:
      !!originalAdminToken &&
      typeof originalAdminExpiresAt === 'number' &&
      originalAdminExpiresAt > Date.now(),
  };
};

/**
 * Production hydrate routine. Returns {@code true} when the guards
 * passed and Redux is now in a {@code transportReady} state with the
 * impersonated subject; {@code false} when guards failed (metadata
 * cleared) or the side-effect calls (cookie write / authz fetch)
 * threw (metadata cleared).
 *
 * The dispatcher is injected so the helper stays free of a React
 * runtime dependency — both the production component and the unit
 * test inject their own dispatch.
 */
export async function tryHydrateImpersonation(
  dispatch: ImpersonationHydrateDispatch,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isImpersonationModeActive()) return false;

  const sessionId = readImpersonationSessionId();
  const exchangedToken = readImpersonationExchangedToken();
  const originalAdminToken = readImpersonationOriginalToken();
  const originalAdminExpiresAt = readImpersonationOriginalAdminExpiresAt();
  const expiresAt = readImpersonationExpiresAt();
  const startedAt = readImpersonationStartedAt();

  const guardConditions = evaluateImpersonationHydrateGuards();
  const allGuardsPass = Object.values(guardConditions).every(Boolean);
  if (!allGuardsPass) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AuthBootstrapper] impersonation hydrate guard failed', guardConditions);
    }
    clearImpersonationOnFailurePath();
    return false;
  }

  if (!exchangedToken || !sessionId) return false;

  try {
    // Re-write the broker cookie so the gateway has the active session
    // marker on this page load (the cookie is httpOnly and does not
    // survive a hard refresh in some browsers).
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
    let targetAuthzSnapshot: Record<string, unknown> | null = null;
    try {
      const authzRes = await api.get('/v1/authz/me', authzCfg);
      targetAuthzSnapshot = (authzRes.data ?? null) as Record<string, unknown> | null;
    } catch (authzErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[AuthBootstrapper] impersonation hydrate authz fetch failed; continuing with empty snapshot',
          authzErr,
        );
      }
    }

    const profile = mapKeycloakProfile(exchangedToken);
    const authzPermissions = Array.isArray(targetAuthzSnapshot?.['permissions'])
      ? (targetAuthzSnapshot?.['permissions'] as string[])
      : [];
    const isSuperAdmin = targetAuthzSnapshot?.['superAdmin'] === true;
    const mergedTargetUser: UserProfile | null = profile
      ? ({
          ...profile,
          email: profile.email ?? '',
          permissions: authzPermissions.length > 0 ? authzPermissions : (profile.permissions ?? []),
          role: isSuperAdmin
            ? 'ADMIN'
            : authzPermissions.length > 0
              ? (authzPermissions.find((p) => p === 'ADMIN') ?? profile.role ?? 'USER')
              : (profile.role ?? 'USER'),
        } satisfies UserProfile)
      : null;

    dispatch(
      hydrateImpersonationSession({
        sessionId,
        exchangedToken,
        expiresAt,
        startedAt,
        targetUser: mergedTargetUser,
        targetAuthzSnapshot,
        originalAdminToken: originalAdminToken as string,
        originalAdminExpiresAt,
      }),
    );
    dispatch(setAuthPhase('transportReady'));
    dispatch(setAuthInitialized(true));
    if (process.env.NODE_ENV !== 'production') {
      console.info('[AuthBootstrapper] impersonation hydrate succeeded', { sessionId });
    }
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AuthBootstrapper] impersonation hydrate failed; clearing metadata', err);
    }
    clearImpersonationOnFailurePath();
    return false;
  }
}
