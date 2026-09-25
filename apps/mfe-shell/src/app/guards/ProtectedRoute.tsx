import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasOidcCallbackFragment } from '../auth/redirect-target';
import { useAppSelector } from '../store/store.hooks';
import { usePermissions } from '@mfe/auth';
import { isPermitAllMode } from '../auth/auth-config';
import { decodeJwtPayload, selectAuthPhase } from '../../features/auth/model/auth.slice';

export function hasRealmRole(token: string | null, requiredRole: string): boolean {
  if (!token || !requiredRole.trim()) return false;
  const payload = decodeJwtPayload(token);
  const realmAccess = payload?.['realm_access'];
  if (!realmAccess || typeof realmAccess !== 'object' || Array.isArray(realmAccess)) return false;
  const roles = (realmAccess as Record<string, unknown>)['roles'];
  if (!Array.isArray(roles)) return false;
  const expected = requiredRole.trim().toLowerCase();
  return roles.some((role) => typeof role === 'string' && role.trim().toLowerCase() === expected);
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** @deprecated Use requiredModule instead for OpenFGA-based checks. */
  requiredPermissions?: string[];
  /** OpenFGA module key — preferred over requiredPermissions. */
  requiredModule?: string;
  /** OpenFGA module alternatives — route is allowed when any one is granted. */
  requiredAnyModule?: string[];
  /**
   * Exact IdP realm role required by a transport-specific product surface.
   * Keep this narrow: ordinary product authorization belongs to OpenFGA modules.
   */
  requiredRole?: string;
  fallbackPath?: string;
}

export const ProtectedRoute = ({
  children,
  requiredPermissions,
  requiredModule,
  requiredAnyModule,
  requiredRole,
  fallbackPath = '/unauthorized',
}: ProtectedRouteProps) => {
  const { token, initialized } = useAppSelector((state) => state.auth);
  // Phase 2 PR-Auth-1 absorb (Codex iter-22, thread 019e0119): consult
  // FSM phase to detect transitional bootstrap states. Without this guard,
  // ProtectedRoute's `!initialized` check returns true the moment the
  // legacy boolean flips, but cookie/authz may still be in flight —
  // causing the protected MFE to mount and fan out 401 metadata fetches.
  const authPhase = useAppSelector(selectAuthPhase);
  const isAuthBootstrapping =
    authPhase === 'initializing' ||
    authPhase === 'keycloakReady' ||
    authPhase === 'cookieReady' ||
    authPhase === 'authzReady' ||
    authPhase === 'refreshing';
  const permissions = usePermissions();
  // PR-FE-4 (Codex thread 019e08e2 iter-15 AGREE absorb, 2026-05-08):
  // wait on `authorizationReady` (true only when a real identity has
  // populated /authz/me) instead of `initialized` (true even on 401).
  // Pre-fix /admin/users live symptom: cold mount race set
  // initialized=true with authz=null → isSuperAdmin/hasModule both
  // returned false → redirect to /unauthorized — even though the user
  // had modules.USER_MANAGEMENT=MANAGE on the eventual /authz/me.
  // The new gate keeps ProtectedRoute on its "still loading" path
  // (returns null) until a concrete identity arrives.
  const { hasModule, isSuperAdmin, authorizationReady } = permissions;
  const location = useLocation();
  const permitAllMode = isPermitAllMode();

  // Wait for both auth FSM AND permissions to be ready. transportReady is
  // the gate after which protected MFEs may fetch.
  if (!initialized || isAuthBootstrapping || (!permitAllMode && token && !authorizationReady)) {
    return null;
  }

  if (permitAllMode) {
    return <>{children}</>;
  }

  // platform-web#1200: the return-to target deliberately omits
  // `location.hash`. The only fragment this app ever sees is Keycloak's own
  // `#state=…&code=…` callback; carrying it into `?redirect=` let LoginPage
  // feed it back to Keycloak as redirect_uri, which produced an infinite
  // login loop (RFC 6749 §3.1.2 forbids fragments there in the first place).
  const buildRedirectTarget = () => {
    const composed = `${location.pathname ?? ''}${location.search ?? ''}`;
    return encodeURIComponent(composed || '/');
  };

  if (!token) {
    // An unconsumed Keycloak callback is still in the URL. keycloak-js
    // parses and clears that fragment during init; redirecting away now
    // would discard the authorization code (the second half of #1200: the
    // first callback on a deep route was never exchanged). Hold until the
    // fragment is gone or a token has arrived.
    //
    // Read the LIVE hash, not React Router's snapshot: keycloak-js clears
    // the callback with history.replaceState, which React Router does not
    // observe, so `location.hash` keeps the stale fragment and the hold
    // would never release (live symptom on testai: shell chrome rendered,
    // <main> empty). AuthBootstrapper always dispatches a final phase after
    // kc.init, so the re-render that re-reads the clean hash is guaranteed.
    const liveHash = typeof window !== 'undefined' ? window.location.hash : location.hash;
    if (hasOidcCallbackFragment(liveHash)) {
      return null;
    }
    const redirect = buildRedirectTarget();
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // Module-based check (preferred)
  let canAccess: boolean;
  const requiredModuleAlternatives = requiredAnyModule?.filter(Boolean) ?? [];
  if (requiredRole) {
    // Realm-role gates deliberately do not inherit the OpenFGA super-admin
    // bypass. The downstream remote-support transport requires the same role,
    // so the shell and API fail closed on one identity contract.
    canAccess = hasRealmRole(token, requiredRole);
  } else if (requiredModuleAlternatives.length > 0) {
    canAccess = isSuperAdmin() || requiredModuleAlternatives.some((module) => hasModule(module));
  } else if (requiredModule) {
    canAccess = isSuperAdmin() || hasModule(requiredModule);
  } else if (requiredPermissions) {
    // Legacy string-based check — map to module check for backward compat
    canAccess = isSuperAdmin() || requiredPermissions.every((p) => hasModule(p));
  } else {
    canAccess = true;
  }

  if (!canAccess) {
    return (
      <Navigate
        to={fallbackPath}
        replace
        state={{
          from: location.pathname,
          reason: requiredRole
            ? 'role_denied'
            : requiredModule || requiredModuleAlternatives.length > 0
              ? 'module_denied'
              : 'forbidden',
          requiredModule,
          requiredAnyModule: requiredModuleAlternatives,
          requiredRole,
        }}
      />
    );
  }

  return <>{children}</>;
};
