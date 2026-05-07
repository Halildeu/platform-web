import React, { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/store.hooks';
import keycloak from '../auth/keycloakClient';
import { authConfig, isKeycloakMode } from '../auth/auth-config';
import {
  logout,
  setKeycloakSession,
  setAuthInitialized,
  setAuthPhase,
  setAuthFailed,
} from '../../features/auth/model/auth.slice';
import { subscribeAuthState, withSuppressedAuthBroadcast } from '../auth/auth-sync';
import { createDevAuthSession, mapKeycloakProfile } from '../config/auth-helpers';
import { api, type SharedHttpRequestConfig } from '@mfe/shared-http';
import { registerGridVariantsTokenResolver } from '@mfe/design-system';
import { bootstrapAuthController, type BootstrapInitOptions } from './auth-bootstrap-controller';

/* ------------------------------------------------------------------ */
/*  Fetch real application permissions from permission-service          */
/* ------------------------------------------------------------------ */

interface AuthzMeResult {
  permissions: string[];
  superAdmin: boolean;
  /** Full /v1/authz/me response for PermissionProvider (avoids double fetch). */
  rawResponse: Record<string, unknown> | null;
}

async function fetchAppPermissions(token: string): Promise<AuthzMeResult> {
  try {
    const res = await api.get('/v1/authz/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.data as Record<string, unknown> & {
      permissions?: string[];
      allowedModules?: string[];
      superAdmin?: boolean;
    };
    const superAdmin = data?.superAdmin === true;
    // Prefer allowedModules (OpenFGA) over legacy permissions
    if (Array.isArray(data?.allowedModules) && data.allowedModules.length > 0) {
      return { permissions: data.allowedModules, superAdmin, rawResponse: data };
    }
    return {
      permissions: Array.isArray(data?.permissions) ? data.permissions : [],
      superAdmin,
      rawResponse: data,
    };
  } catch (err: unknown) {
    console.warn('AuthBootstrapper: /v1/authz/me failed, falling back to JWT roles', err);
    return { permissions: [], superAdmin: false, rawResponse: null };
  }
}

/**
 * Store token in httpOnly cookie via gateway endpoint.
 *
 * <p>Phase 2 PR-Auth-1 (Codex iter-22 §Auth-1 absorb, thread 019e0119):
 * promise must be awaited by the caller (no fire-and-forget). Returns a
 * boolean indicating success so the bootstrapper can advance the auth
 * FSM accordingly. Network/server errors throw so the caller may
 * dispatch {@code setAuthFailed} with structured context.
 *
 * <p>Dev mode (no gateway): caller must catch and decide policy. The
 * helper itself does NOT swallow errors anymore — silent failure was
 * the root cause of the pre-cookie metadata 401 storm observed at
 * testai.acik.com (574 metadata requests, all 401, before cookie POST
 * resolved).
 */
async function setTokenCookie(token: string): Promise<void> {
  // PR-HTTP-3 (Codex iter-1 P0 absorb, thread 019e046c): bypass the
  // shell's auth-ready gate. This call is what DRIVES the FSM toward
  // {@code transportReady}; it cannot wait for transportReady itself
  // without a self-deadlock. Authorization header is set explicitly here.
  const config: SharedHttpRequestConfig = {
    headers: { Authorization: `Bearer ${token}` },
    __skipAuthReadyGate: true,
  };
  await api.post('/auth/cookie', null, config);
}

async function clearTokenCookie(): Promise<void> {
  try {
    // PR-HTTP-3: same rationale as setTokenCookie — clearing the cookie
    // is part of the auth FSM transition (logout); cannot gate on
    // transportReady. Use __skipAuthReadyGate so the request flies even
    // when the FSM is not transportReady (e.g. mid-logout).
    const config: SharedHttpRequestConfig = { __skipAuthReadyGate: true };
    await api.delete('/auth/cookie', config);
  } catch {
    // Silently ignore
  }
}

/* ------------------------------------------------------------------ */
/*  AuthBootstrapper — Keycloak initialization & token management      */
/* ------------------------------------------------------------------ */

export const AuthBootstrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const tokenRef = useRef<string | null>(null);
  const shouldUseKeycloak = isKeycloakMode();

  useEffect(() => {
    tokenRef.current = token ?? null;
    // Register token resolver for grid variant API calls
    registerGridVariantsTokenResolver(() => tokenRef.current);
  }, [token]);

  /* Cross-window auth state subscription */
  useEffect(() => {
    if (!shouldUseKeycloak) {
      // Phase 2 PR-Auth-1 (Codex iter-25 §1 absorb, thread 019e0119):
      // non-Keycloak / dev / permitAll path advances FSM phase to a
      // terminal state. Without this, ProtectedRoute blocks render
      // forever on `initializing` — initialized boolean alone is not
      // enough since phase=initializing fails the new isAuthBootstrapping
      // guard.
      dispatch(setAuthPhase('transportReady'));
      dispatch(setAuthInitialized(true));
      return () => undefined;
    }
    const unsubscribe = subscribeAuthState((payload) => {
      withSuppressedAuthBroadcast(() => {
        if (!payload?.token) {
          dispatch(logout());
          dispatch(setAuthInitialized(true));
          return;
        }
        // Phase 2 PR-Auth-1 (Codex iter-25 §1 absorb): cross-window
        // token sync also advances to transportReady. Source window
        // already passed through full bootstrap (cookie + authz/me);
        // peer windows trust the broadcast as cookie-ready signal.
        dispatch(
          setKeycloakSession({
            token: payload.token,
            profile: payload.profile ?? undefined,
            expiresAt: payload.expiresAt ?? null,
          }),
        );
        dispatch(setAuthPhase('transportReady'));
        dispatch(setAuthInitialized(true));
      });
    });
    return unsubscribe;
  }, [dispatch, shouldUseKeycloak]);

  /* Keycloak bootstrap */
  useEffect(() => {
    if (!shouldUseKeycloak) {
      if (authConfig.enableFakeAuth) {
        // Try real Keycloak token first (async), fallback to fake JWT
        createDevAuthSession().then((session) => {
          dispatch(
            setKeycloakSession({
              token: session.token,
              profile: session.profile ?? undefined,
              expiresAt: session.expiresAt,
            }),
          );
          // Phase 2 PR-Auth-1 (Codex iter-25 §1 absorb): dev/fake-auth
          // path bypasses cookie write + authz/me; advance phase to
          // transportReady so MFE protected render unblocks.
          dispatch(setAuthPhase('transportReady'));
          dispatch(setAuthInitialized(true));
        });
        return;
      } else {
        dispatch(setKeycloakSession({ token: null }));
        // Phase 2 PR-Auth-1 (Codex iter-25 §1 absorb): permitAll/no-auth
        // path advances to transportReady (permitAllMode short-circuits
        // ProtectedRoute downstream).
        dispatch(setAuthPhase('transportReady'));
      }
      dispatch(setAuthInitialized(true));
      return;
    }
    let mounted = true;

    /**
     * Phase 2 PR-Auth-1 (Codex iter-22/23 §Auth-1 absorb, thread 019e0119):
     * MFE Auth Transport Contract bootstrap. Strict await sequence:
     *
     * <pre>
     * initializing
     *   → keycloakReady   (after keycloak.init resolves)
     *   → cookieReady     (after POST /api/auth/cookie resolves; only if kcToken)
     *   → authzReady      (after GET /v1/authz/me resolves)
     *   → transportReady  (final gate; protected MFE render + fetch enabled)
     * </pre>
     *
     * Failure paths:
     * - Keycloak.init throws → setAuthFailed (technical error; degraded UI)
     * - keycloak returns no token → setAuthPhase('unauthenticated') (login UI OK)
     * - cookie write throws → setAuthFailed (gateway/network problem)
     * - authz/me throws → tolerated; advance to transportReady with empty
     *   permissions (PermissionProvider handles fallback). This preserves
     *   the previous behavior where /authz/me failure didn't block login.
     */
    const bootstrap = async () => {
      try {
        const isLoginRoute =
          typeof window !== 'undefined' && window.location?.pathname?.startsWith('/login');
        const urlHasAuthCode =
          typeof window !== 'undefined' &&
          (window.location?.hash?.includes('code=') || window.location?.search?.includes('code='));
        const initOptions: BootstrapInitOptions = {
          pkceMethod: 'S256',
          checkLoginIframe: false,
        };
        if (urlHasAuthCode) {
          initOptions.onLoad = 'check-sso';
        } else if (!isLoginRoute && authConfig.keycloak.enableSilentCheckSso) {
          initOptions.onLoad = 'check-sso';
          initOptions.silentCheckSsoRedirectUri = authConfig.keycloak.silentCheckSsoRedirectUri;
        }
        console.info('[AuthBootstrapper] init starting', {
          isLoginRoute,
          urlHasAuthCode,
          onLoad: initOptions.onLoad,
          kcUrl: authConfig.keycloak.url,
        });

        // Phase 2 PR-Auth-1 (Codex iter-25 §2 absorb, thread 019e0119):
        // bootstrap delegated to extracted controller so unit tests can
        // exercise the same code path. AuthBootstrapper.test.ts no longer
        // duplicates the implementation.
        const result = await bootstrapAuthController({
          keycloak: {
            authenticated: keycloak.authenticated,
            token: keycloak.token,
            tokenParsed: keycloak.tokenParsed,
            init: (opts) => keycloak.init(opts),
          },
          initOptions,
          setTokenCookie,
          fetchAppPermissions,
          mapProfile: mapKeycloakProfile,
          dispatchPhase: (phase) => dispatch(setAuthPhase(phase)),
          dispatchFailed: (error) => dispatch(setAuthFailed(error)),
          dispatchSession: (session) => {
            // Re-merge mapKeycloakProfile output with authz permissions
            // (preserved from previous behaviour).
            const profile = session.profile as ReturnType<typeof mapKeycloakProfile> | null;
            const authzPermissions =
              (session.authzSnapshot?.['permissions'] as string[] | undefined) ?? [];
            const isSuperAdmin = session.authzSnapshot?.['superAdmin'] === true;
            const mergedProfile = profile
              ? {
                  ...profile,
                  permissions: authzPermissions.length > 0 ? authzPermissions : profile.permissions,
                  role: isSuperAdmin
                    ? 'ADMIN'
                    : authzPermissions.length > 0
                      ? (authzPermissions.find((p) => p === 'ADMIN') ?? profile.role)
                      : profile.role,
                }
              : undefined;
            dispatch(
              setKeycloakSession({
                token: session.token,
                profile: mergedProfile,
                expiresAt: session.expiresAt,
                authzSnapshot: session.authzSnapshot,
              }),
            );
          },
          isMounted: () => mounted,
        });

        // Backward-compat: handle no-session case for tokenRef sync
        if (result.finalPhase === 'unauthenticated' && !tokenRef.current) {
          dispatch(setKeycloakSession({ token: null }));
        }
        console.info('[AuthBootstrapper] bootstrap completed', { phase: result.finalPhase });
      } catch (err: unknown) {
        // Defensive — controller already handles its own errors via
        // dispatchFailed; this catch covers anything outside the
        // controller boundary (e.g. setKeycloakSession dispatch crash).
        console.error('[AuthBootstrapper] outer bootstrap error:', err);
        if (mounted && !tokenRef.current) {
          dispatch(setKeycloakSession({ token: null }));
          dispatch(
            setAuthFailed({
              message: 'Bootstrap controller boundary error.',
              cause: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      } finally {
        if (mounted) {
          // Backward-compat: legacy {@code initialized} boolean is now
          // derived from {@link AuthPhase}; calling setAuthInitialized
          // after bootstrap completes keeps existing consumers (those
          // that haven't migrated to selectIsTransportReady) working.
          dispatch(setAuthInitialized(true));
        }
      }
    };

    bootstrap();

    keycloak.onTokenExpired = async () => {
      // Phase 2 PR-Auth-1 (Codex iter-24 §Auth-1 absorb, thread 019e0119):
      // refresh path uses the same await sequence as bootstrap. Without
      // this, mid-session token refresh repeats the pre-cookie 401 race
      // for any concurrent in-flight protected requests.
      dispatch(setAuthPhase('refreshing'));
      try {
        const refreshed = await keycloak.updateToken(60);
        if (refreshed && keycloak.token) {
          // await cookie write before advancing — same fix as bootstrap
          try {
            await setTokenCookie(keycloak.token);
          } catch (refreshCookieErr) {
            console.warn('[AuthBootstrapper] refresh cookie write failed:', refreshCookieErr);
            void clearTokenCookie();
            // Roll back to authzReady (still authenticated; protected
            // transport may degrade for next request batch). PR-Refresh-4
            // will add single-flight retry queue.
            dispatch(setAuthPhase('authzReady'));
            return;
          }
          const profile = mapKeycloakProfile(keycloak.token);
          const authzResult = await fetchAppPermissions(keycloak.token);
          const mergedProfile = profile
            ? {
                ...profile,
                permissions:
                  authzResult.permissions.length > 0
                    ? authzResult.permissions
                    : profile.permissions,
                role: authzResult.superAdmin
                  ? 'ADMIN'
                  : authzResult.permissions.length > 0
                    ? (authzResult.permissions.find((p) => p === 'ADMIN') ?? profile.role)
                    : profile.role,
              }
            : undefined;
          dispatch(
            setKeycloakSession({
              token: keycloak.token,
              profile: mergedProfile,
              expiresAt: keycloak.tokenParsed?.exp ? keycloak.tokenParsed.exp * 1000 : null,
              authzSnapshot: authzResult.rawResponse,
            }),
          );
          // Refresh cycle complete; transport ready again.
          dispatch(setAuthPhase('transportReady'));
        } else {
          // Refresh returned false (token still valid); roll back phase.
          dispatch(setAuthPhase('transportReady'));
        }
      } catch (refreshError) {
        // Token refresh failed — log but don't logout.
        // Keycloak SSO session may still be valid for re-auth.
        console.warn('[AuthBootstrapper] Token refresh failed:', refreshError);
        void clearTokenCookie();
        // Roll back to authzReady (no transportReady) — caller may
        // re-attempt or trigger logout based on their flow. PR-Refresh-4
        // will replace this with proper single-flight retry queue.
        dispatch(setAuthPhase('authzReady'));
      }
    };

    return () => {
      mounted = false;
    };
  }, [dispatch, shouldUseKeycloak]);

  return <>{children}</>;
};
