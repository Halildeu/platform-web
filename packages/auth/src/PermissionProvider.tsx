import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { AuthzMeResponse, AccessLevel } from './types';
import { fetchAuthzMe, fetchAuthzVersion } from './api';
import { isAuthCriticalUnauthorizedUrl, isUnauthorizedError } from './errors';

interface PermissionContextValue {
  /** Current user's authorization data */
  authz: AuthzMeResponse | null;
  /** Whether initial load is complete */
  initialized: boolean;
  /**
   * PR-FE-4 (Codex thread 019e08e2 iter-15 AGREE absorb, 2026-05-08):
   * `authorizationReady` is the canonical "permissions resolved with a
   * concrete identity" gate. Distinct from `initialized` which fires
   * even when /authz/me returned 401 / authz=null (session-expired
   * path). Pre-fix `ProtectedRoute` used `initialized` as the wait
   * gate, so a 401-during-bootstrap → `initialized=true, authz=null`
   * → `isSuperAdmin()/hasModule()` both returned false → redirect to
   * `/unauthorized` even when the user actually had MANAGE on the
   * required module (live testai symptom on /admin/users). Post-fix
   * gate is true only when:
   * <ul>
   *   <li>permitAll mode (no authz needed), OR</li>
   *   <li>{@code authz?.userId} is non-empty (real identity loaded)</li>
   * </ul>
   * Sessions on a 401 path stay false → ProtectedRoute keeps showing
   * a loading state (returns null) instead of bouncing to
   * /unauthorized; the auth FSM's recovery loop (silent SSO,
   * AuthBootstrapper retry, or operator login) eventually populates a
   * real identity and the gate clears.
   */
  authorizationReady: boolean;
  /** Whether currently loading */
  loading: boolean;
  /**
   * True when the latest /me or /version call returned 401.
   *
   * Codex 019dd818 iter-4 (B-prime focused semantic fix): authn/session
   * bozuk olduğunda eski authz cache'i KULLANILMAZ; consumer "yetkin yok"
   * değil "oturum yenile" UX'i üretmeli (PR-2 shell). useZanzibarAccess
   * sessionExpired true ise reason='session_expired' döner.
   */
  sessionExpired: boolean;
  /** Check if user has access to a module */
  hasModule: (module: string) => boolean;
  /** Get module access level (VIEW | MANAGE | NONE) */
  getModuleLevel: (module: string) => AccessLevel;
  /** Check if an action is allowed */
  isActionAllowed: (action: string) => boolean;
  /** Check if an action is explicitly denied */
  isActionDenied: (action: string) => boolean;
  /** Check if user can view a report */
  canViewReport: (report: string) => boolean;
  /** Get user's role names */
  getUserRoles: () => string[];
  /** Check if user is superAdmin */
  isSuperAdmin: () => boolean;
  /** Check if user can access a company */
  canAccessCompany: (companyId: number) => boolean;
  /** Refresh authorization data */
  refresh: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextValue>({
  authz: null,
  initialized: false,
  authorizationReady: false,
  loading: false,
  sessionExpired: false,
  hasModule: () => false,
  getModuleLevel: () => 'NONE',
  isActionAllowed: () => false,
  isActionDenied: () => false,
  canViewReport: () => false,
  getUserRoles: () => [],
  isSuperAdmin: () => false,
  canAccessCompany: () => false,
  refresh: async () => {},
});

interface PermissionProviderProps {
  children: React.ReactNode;
  /** HTTP GET function (from shared-http or axios) */
  httpGet: (url: string) => Promise<{ data: unknown }>;
  /** If true, all permissions are granted (dev/permitAll mode) */
  permitAll?: boolean;
  /** If false, authz isteği atılmaz; token beklenir. */
  enabled?: boolean;
  /** Cache TTL in ms (default: 60000 = 1 min) */
  cacheTtl?: number;
  /** Pre-fetched authz data — skips initial /me fetch when provided. */
  initialData?: AuthzMeResponse | null;
}

export function PermissionProvider({
  children,
  httpGet,
  permitAll = false,
  enabled = true,
  cacheTtl = 60_000,
  initialData,
}: PermissionProviderProps) {
  const [authz, setAuthz] = useState<AuthzMeResponse | null>(initialData ?? null);
  const [initialized, setInitialized] = useState(!!initialData);
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastVersionRef = React.useRef<number | null>(initialData?.authzVersion ?? null);

  const loadAuthz = useCallback(async () => {
    if (permitAll) {
      setAuthz({
        userId: 'dev-user',
        superAdmin: true,
        allowedModules: [
          'USER_MANAGEMENT',
          'ACCESS',
          'AUDIT',
          'REPORT',
          'MEETING',
          'TRANSCRIPT',
          'WAREHOUSE',
          'PURCHASE',
          'THEME',
        ],
        allowedCompanyIds: [],
        allowedProjectIds: [],
        allowedWarehouseIds: [],
        roles: ['Süper Admin'],
        modules: {
          USER_MANAGEMENT: 'MANAGE',
          ACCESS: 'MANAGE',
          AUDIT: 'MANAGE',
          REPORT: 'MANAGE',
          MEETING: 'MANAGE',
          TRANSCRIPT: 'MANAGE',
          WAREHOUSE: 'MANAGE',
          PURCHASE: 'MANAGE',
          THEME: 'MANAGE',
        },
        actions: {},
        reports: {},
        pages: {},
        scopes: { companyIds: [], projectIds: [], warehouseIds: [], branchIds: [] },
      });
      setInitialized(true);
      setSessionExpired(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchAuthzMe(httpGet);
      setAuthz(data);
      setInitialized(true);
      setSessionExpired(false);
      if (data.authzVersion != null) {
        lastVersionRef.current = data.authzVersion;
      }
    } catch (err) {
      // Codex 019dd818 iter-4 (B-prime): 401 = session expired (authn unknown),
      // farklı semantik authz deny'den. Stale authz cache kullanma — sessionExpired
      // flag'i ile consumer'lar "oturum yenile" UX'i üretsin.
      if (isUnauthorizedError(err)) {
        console.warn('[PermissionProvider] /v1/authz/me 401 — session expired');
        setAuthz(null);
        setSessionExpired(true);
        setInitialized(true);
        lastVersionRef.current = null;
        return;
      }
      // Network/5xx/unknown — transient. ProtectedRoute loading spinner gösterir,
      // periodic refresh (60s) veya initialData ile recover edilir.
      console.error('[PermissionProvider] Failed to fetch authz:', err);
      setAuthz(null);
    } finally {
      setLoading(false);
    }
  }, [httpGet, permitAll]);

  useEffect(() => {
    if (!enabled) {
      // Don't set initialized=true when disabled — ProtectedRoute should
      // keep showing loading until auth init completes and enables us.
      setAuthz(null);
      setSessionExpired(false);
      setLoading(false);
      return undefined;
    }

    // If parent provides pre-fetched data, use it instead of fetching.
    // Codex 019dd818 iter-6 PARTIAL: re-auth recovery yolu — shell yeni
    // initialData verdiğinde sessionExpired flag'i de sıfırlanmalı, aksi
    // halde 401 sonrası fresh authz gelse bile useZanzibarAccess'i
    // sessionExpired short-circuit ile 'disabled'/'session_expired' kalır.
    if (initialData) {
      setAuthz(initialData);
      setInitialized(true);
      setSessionExpired(false);
      lastVersionRef.current = initialData.authzVersion ?? null;
    } else {
      loadAuthz();
    }

    // P0: Version-based smart refresh — poll /version (lightweight),
    // only do full /me refresh when version changes.
    if (!permitAll && cacheTtl > 0) {
      const pollVersion = async () => {
        try {
          const serverVersion = await fetchAuthzVersion(httpGet);
          if (serverVersion === -1) {
            await loadAuthz();
            return;
          }
          if (lastVersionRef.current === null || serverVersion !== lastVersionRef.current) {
            await loadAuthz();
          }
        } catch (err) {
          // Codex 019dd818 iter-4 (B-prime): 401 from /version artık silent skip
          // değil — session expired sinyali olarak işle. fetchAuthzVersion 401'ı
          // propagate ediyor (5xx/network -1'e fallback ediyor).
          if (isUnauthorizedError(err)) {
            console.warn('[PermissionProvider] /v1/authz/version 401 — session expired');
            setAuthz(null);
            setSessionExpired(true);
            setInitialized(true);
            lastVersionRef.current = null;
            return;
          }
          // Other errors silent skip — next poll will retry
        }
      };
      const interval = setInterval(pollVersion, cacheTtl);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [loadAuthz, httpGet, permitAll, enabled, cacheTtl, initialData]);

  // Codex 019dd818 iter-7 (B-prime PR-2a): shared-http 401 event listener.
  // PR-1 sadece /me ve /version 401'ı yakalıyor. Object-level /authz/check,
  // /batch-check veya başka API 401 verdiğinde shared-http interceptor
  // window.dispatchEvent('app:auth:unauthorized') yapar; provider de bu
  // event'i dinleyerek cache'i 60s poll'a kadar beklemeden invalidate eder.
  // Guard: permitAll/enabled=false → bootstrap noise'unu ignore et.
  //
  // iter-34: only AUTH-CRITICAL path 401s should collapse the global
  // session. Live capture against testai.acik.com showed variant-service
  // returning HTTP 401 for /api/v1/variants?gridId=... while the JWT was
  // valid (Spring's BearerTokenAuthenticationFilter logged
  // "Authenticated=true" — the 401 came from a downstream authorization
  // check that should have been a 403). The agressive listener mistook
  // that for a session-level expiry, set sessionExpired=true, and the
  // user-detail drawer's canEdit flag flipped to false → every role
  // checkbox rendered as cursor:not-allowed (the screenshot bug). Filter
  // by URL: only /authz/me and /authz/version actually mean "the auth
  // identity itself is gone."
  useEffect(() => {
    if (permitAll || !enabled || typeof window === 'undefined') return undefined;

    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ url?: unknown }>).detail;
      if (!isAuthCriticalUnauthorizedUrl(detail?.url)) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PermissionProvider] non-auth-critical 401 ignored:', detail?.url);
        }
        return;
      }
      console.warn('[PermissionProvider] app:auth:unauthorized event — invalidating cache');
      setAuthz(null);
      setSessionExpired(true);
      setInitialized(true);
      lastVersionRef.current = null;
    };
    window.addEventListener('app:auth:unauthorized', handler);
    return () => window.removeEventListener('app:auth:unauthorized', handler);
  }, [permitAll, enabled]);

  const value = useMemo<PermissionContextValue>(
    () => ({
      authz,
      initialized,
      // PR-FE-4 (Codex thread 019e08e2 iter-15 AGREE absorb): only true
      // when there is a real identity behind the permissions snapshot.
      // 401 / network-error / null-authz paths set initialized=true so
      // ProtectedRoute exits the "still loading" branch — but they MUST
      // NOT trip the permission deny path. Gate this explicitly via
      // authorizationReady which the route guard waits on instead.
      authorizationReady: permitAll || Boolean(authz?.userId),
      loading,
      sessionExpired,
      hasModule: (module: string) => {
        if (permitAll || authz?.superAdmin) return true;
        // Prefer new modules map, fallback to legacy allowedModules
        if (authz?.modules && Object.keys(authz.modules).length > 0) {
          const level = authz.modules[module];
          return level === 'VIEW' || level === 'MANAGE';
        }
        return authz?.allowedModules?.includes(module) ?? false;
      },
      getModuleLevel: (module: string): AccessLevel => {
        if (permitAll || authz?.superAdmin) return 'MANAGE';
        return (authz?.modules?.[module] as AccessLevel) ?? 'NONE';
      },
      isActionAllowed: (action: string) => {
        if (permitAll || authz?.superAdmin) return true;
        return authz?.actions?.[action] === 'ALLOW';
      },
      isActionDenied: (action: string) => {
        return authz?.actions?.[action] === 'DENY';
      },
      canViewReport: (report: string) => {
        if (permitAll || authz?.superAdmin) return true;
        const grant = authz?.reports?.[report];
        return grant === 'ALLOW';
      },
      getUserRoles: () => authz?.roles ?? [],
      isSuperAdmin: () => permitAll || (authz?.superAdmin ?? false),
      canAccessCompany: (companyId: number) => {
        if (permitAll || authz?.superAdmin) return true;
        return authz?.allowedCompanyIds?.includes(companyId) ?? false;
      },
      refresh: loadAuthz,
    }),
    [authz, initialized, loading, sessionExpired, permitAll, loadAuthz],
    // Note: `authorizationReady` is derived inline from {authz?.userId, permitAll}
    // — both already in the dependency array, so the memoized value
    // re-computes correctly without listing the derived flag explicitly.
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Hook to access permission context.
 */
export function usePermissions() {
  return useContext(PermissionContext);
}
