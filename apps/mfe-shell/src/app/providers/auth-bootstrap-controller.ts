/* ------------------------------------------------------------------ */
/*  Auth Bootstrap Controller — production-grade pure async function   */
/* ------------------------------------------------------------------ */

/**
 * Phase 2 PR-Auth-1 (Codex iter-25 §2 absorb, thread 019e0119):
 * extracted bootstrap controller. The React component
 * {@code AuthBootstrapper.tsx} now delegates the actual async sequence
 * to this function so unit tests can exercise the production code path
 * directly with mock dependencies — instead of testing a duplicate
 * implementation inside the test file.
 *
 * <p>Strict await sequence (Codex iter-22/23/24 absorb):
 * <pre>
 * initializing
 *   → keycloakReady   (after keycloak.init resolves)
 *   → cookieReady     (after POST /api/auth/cookie resolves; only if kcToken)
 *   → authzReady      (after GET /v1/authz/me resolves)
 *   → transportReady  (final gate; protected MFE render + fetch enabled)
 * </pre>
 *
 * <p>Failure paths:
 * <ul>
 *   <li>Keycloak.init throws → setAuthFailed (technical error; degraded UI)</li>
 *   <li>keycloak returns no token → unauthenticated (login UI OK)</li>
 *   <li>cookie write throws → setAuthFailed (gateway/network problem)</li>
 *   <li>authz/me throws → tolerated; advance to transportReady with empty
 *       permissions (PermissionProvider handles fallback)</li>
 * </ul>
 */
export interface BootstrapKeycloak {
  authenticated?: boolean;
  token: string | null | undefined;
  tokenParsed?: { exp?: number };
  init: (opts: BootstrapInitOptions) => Promise<void>;
}

export interface BootstrapInitOptions {
  pkceMethod: 'S256';
  checkLoginIframe: false;
  onLoad?: 'check-sso';
  silentCheckSsoRedirectUri?: string;
}

export interface BootstrapDeps {
  keycloak: BootstrapKeycloak;
  initOptions: BootstrapInitOptions;
  /**
   * Cookie write helper — must throw on failure. The bootstrap
   * controller awaits this before advancing phase to {@code cookieReady}.
   */
  setTokenCookie: (token: string) => Promise<void>;
  /**
   * Authz/me snapshot fetch — non-fatal on failure (returns empty
   * permissions). Errors are NOT propagated; bootstrap still advances
   * to {@code transportReady}.
   */
  fetchAppPermissions: (token: string) => Promise<{
    permissions: string[];
    superAdmin: boolean;
    rawResponse: Record<string, unknown> | null;
  }>;
  /**
   * Profile mapper — pure function, no side effects. Called after token
   * available; nullable when keycloak token cannot be parsed.
   */
  mapProfile: (token: string) => unknown | null;
  /** Action dispatchers (Redux). */
  dispatchPhase: (phase: BootstrapPhase) => void;
  dispatchFailed: (error: { message: string; cause?: string }) => void;
  dispatchSession: (session: BootstrapSession) => void;
  /** Liveness check — bootstrap aborts if mounted becomes false. */
  isMounted: () => boolean;
}

export type BootstrapPhase =
  | 'keycloakReady'
  | 'cookieReady'
  | 'authzReady'
  | 'transportReady'
  | 'unauthenticated';

export interface BootstrapSession {
  token: string;
  profile: unknown;
  expiresAt: number | null;
  authzSnapshot: Record<string, unknown> | null;
}

export interface BootstrapResult {
  finalPhase: BootstrapPhase | 'failed';
  cookieAwaited: boolean;
}

export async function bootstrapAuthController(deps: BootstrapDeps): Promise<BootstrapResult> {
  let cookieAwaited = false;
  try {
    await deps.keycloak.init(deps.initOptions);
    if (!deps.isMounted()) {
      return { finalPhase: 'unauthenticated', cookieAwaited };
    }
    deps.dispatchPhase('keycloakReady');

    const kcToken = deps.keycloak.token ?? null;
    if (!kcToken) {
      deps.dispatchPhase('unauthenticated');
      return { finalPhase: 'unauthenticated', cookieAwaited };
    }

    try {
      await deps.setTokenCookie(kcToken);
      cookieAwaited = true;
      if (!deps.isMounted()) {
        return { finalPhase: 'unauthenticated', cookieAwaited };
      }
      deps.dispatchPhase('cookieReady');
    } catch (cookieErr) {
      deps.dispatchFailed({
        message: 'Auth cookie write failed; protected requests cannot proceed.',
        cause: cookieErr instanceof Error ? cookieErr.message : String(cookieErr),
      });
      return { finalPhase: 'failed', cookieAwaited };
    }

    const profile = deps.mapProfile(kcToken);
    const authzResult = await deps.fetchAppPermissions(kcToken);
    if (!deps.isMounted()) {
      return { finalPhase: 'unauthenticated', cookieAwaited };
    }
    deps.dispatchPhase('authzReady');

    deps.dispatchSession({
      token: kcToken,
      profile,
      expiresAt: deps.keycloak.tokenParsed?.exp ? deps.keycloak.tokenParsed.exp * 1000 : null,
      authzSnapshot: authzResult.rawResponse,
    });

    deps.dispatchPhase('transportReady');
    return { finalPhase: 'transportReady', cookieAwaited };
  } catch (err) {
    if (deps.isMounted()) {
      deps.dispatchFailed({
        message: 'Keycloak bootstrap failed.',
        cause: err instanceof Error ? err.message : String(err),
      });
    }
    return { finalPhase: 'failed', cookieAwaited };
  }
}
