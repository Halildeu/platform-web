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
/**
 * Phase 2 PR #314 (Codex thread 019e062b iter-0 P1 absorb): the
 * keycloak instance is passed to the controller as a structural type
 * with LIVE getters for {@code token} and {@code tokenParsed}.
 *
 * <p>Why getters and not plain properties: in keycloak-js@26+ the
 * standard auth-code callback assigns {@code keycloak.token} INSIDE
 * {@code keycloak.init()} — i.e. between the React component's
 * useEffect tick that constructs the deps object and the controller's
 * post-init read of the deps. If the React side passes
 * {@code token: keycloak.token} as a plain field, the controller sees
 * the pre-init snapshot (typically null on first cold load) and
 * dispatches {@code unauthenticated}, leaving the freshly-set token
 * stranded inside the keycloak instance. Live getter callbacks
 * resolve at the moment the controller reads, after init completes.
 */
export interface BootstrapKeycloak {
  authenticated?: boolean;
  /** LIVE getter — re-read after each await boundary. */
  getToken: () => string | null | undefined;
  /** LIVE getter — re-read after each await boundary. */
  getTokenParsed: () => { exp?: number } | undefined;
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
  /**
   * Stale-token recovery (2026-05-20 hotfix). Called when silent-SSO
   * returns no Keycloak session — clears `state.auth.token` (which may
   * have been rehydrated from a stale localStorage entry) so the
   * ProtectedRoute + PermissionProvider + LoginPage gates see a
   * consistent unauthenticated state. Without this, the localStorage
   * token survives in Redux while `phase=unauthenticated`, producing a
   * stuck UI: ProtectedRoute treats `(token && !authorizationReady)`
   * as "still loading" and LoginPage's `(initialized && token)` guard
   * Navigate()s back to the protected route → infinite loop.
   */
  dispatchSessionClear: () => void;
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

    // Codex thread 019e062b iter-0 P1 #1 absorb: read token via live
    // getter, NOT via a snapshot taken before init() resolved. This
    // is the key fix — keycloak-js sets keycloak.token inside init()
    // for auth-code callback flow, and a pre-init snapshot would miss
    // the freshly-issued token entirely.
    const kcToken = deps.keycloak.getToken() ?? null;
    if (!kcToken) {
      // 2026-05-20 hotfix: clear any stale Redux token BEFORE dispatching
      // the unauthenticated phase. `state.auth.token` may have been
      // rehydrated from localStorage at slice-init time; if we leave it
      // truthy after declaring "no session", ProtectedRoute /
      // PermissionProvider / LoginPage all read the inconsistent state
      // and produce a redirect loop (see dispatchSessionClear JSDoc).
      // Dispatch order matters: clear first, then phase — so React
      // subscribers get the token=null + phase=unauthenticated state in
      // the same render flush.
      deps.dispatchSessionClear();
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
      expiresAt: deps.keycloak.getTokenParsed()?.exp
        ? (deps.keycloak.getTokenParsed() as { exp: number }).exp * 1000
        : null,
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
