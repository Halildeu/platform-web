import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/store.hooks';
import { usePermissions } from '@mfe/auth';
import { isPermitAllMode } from '../auth/auth-config';
import { selectAuthPhase } from '../../features/auth/model/auth.slice';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** @deprecated Use requiredModule instead for OpenFGA-based checks. */
  requiredPermissions?: string[];
  /** OpenFGA module key — preferred over requiredPermissions. */
  requiredModule?: string;
  /** OpenFGA module alternatives — route is allowed when any one is granted. */
  requiredAnyModule?: string[];
  fallbackPath?: string;
}

export const ProtectedRoute = ({
  children,
  requiredPermissions,
  requiredModule,
  requiredAnyModule,
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

  const buildRedirectTarget = () => {
    const composed = `${location.pathname ?? ''}${location.search ?? ''}${location.hash ?? ''}`;
    return encodeURIComponent(composed || '/');
  };

  if (!token) {
    const redirect = buildRedirectTarget();
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // Module-based check (preferred)
  let canAccess: boolean;
  const requiredModuleAlternatives = requiredAnyModule?.filter(Boolean) ?? [];
  if (requiredModuleAlternatives.length > 0) {
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
          reason:
            requiredModule || requiredModuleAlternatives.length > 0 ? 'module_denied' : 'forbidden',
          requiredModule,
          requiredAnyModule: requiredModuleAlternatives,
        }}
      />
    );
  }

  return <>{children}</>;
};
