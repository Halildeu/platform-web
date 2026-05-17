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
  selectIsImpersonating,
} from '../../features/auth/model/auth.slice';
import { subscribeAuthState, withSuppressedAuthBroadcast } from '../auth/auth-sync';
import { createDevAuthSession, mapKeycloakProfile } from '../config/auth-helpers';
import { api, type SharedHttpRequestConfig } from '@mfe/shared-http';
import { registerGridVariantsTokenResolver } from '@mfe/design-system';
import { bootstrapAuthController, type BootstrapInitOptions } from './auth-bootstrap-controller';
import { isAuthContractE2eEnabled } from '../observability/auth-contract-e2e-probe';
import { tryHydrateImpersonation } from './impersonation-hydrate';

/* ------------------------------------------------------------------ */
/*  Fetch real application permissions from permission-service          */
/* ------------------------------------------------------------------ */

interface AuthzMeResult {
  permissions: string[];
  superAdmin: boolean;
  /** Full /v1/authz/me response for PermissionProvider (avoids double fetch). */
  rawResponse: Record<string, unknown> | null;
}

/**
 * Exported for PR-HTTP-3 regression tests so the production helper's
 * use of {@code __skipAuthReadyGate: true} can be verified directly
 * (the React component wraps these as bootstrap deps; the test mocks
 * them, so without a separate export the bypass-flag assertion would
 * have nothing to check).
 */
export async function fetchAppPermissions(token: string): Promise<AuthzMeResult> {
  try {
    // PR-HTTP-3 (Codex iter-2 P0 absorb, thread 019e046c): bypass the
    // shell's auth-ready gate. fetchAppPermissions runs in the
    // bootstrap chain BETWEEN {@code cookieReady} and {@code transportReady}
    // (see auth-bootstrap-controller.ts:130). Without the bypass, the
    // gate would await transportReady — which only fires AFTER this
    // very call resolves, producing the same self-deadlock as
    // setTokenCookie. The refresh path uses the same helper, so
    // this single bypass also fixes the refresh deadlock.
    const cfg: SharedHttpRequestConfig = {
      headers: { Authorization: `Bearer ${token}` },
      __skipAuthReadyGate: true,
    };
    const res = await api.get('/v1/authz/me', cfg);
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
/** Exported for PR-HTTP-3 regression tests (see {@link fetchAppPermissions}). */
export async function setTokenCookie(token: string): Promise<void> {
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

/** Exported for PR-HTTP-3 regression tests (see {@link fetchAppPermissions}). */
export async function clearTokenCookie(): Promise<void> {
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
/*  Bootstrap outcome deferred — onAuthSuccess ↔ bootstrap() handshake  */
/* ------------------------------------------------------------------ */

/**
 * PR-2 (Codex AGREE thread `019e362e`): the explicit outcome that
 * {@code bootstrap()} resolves once it finishes, so the
 * {@code keycloak.onAuthSuccess} catch-up handler can decide whether it
 * still has work to do — instead of unconditionally re-running the full
 * cookie + authz + session sequence (the redundant double-bootstrap).
 *
 * <ul>
 *   <li>{@code transportReady} — the bootstrap controller already wrote
 *       the cookie + authz snapshot + session. onAuthSuccess is a NO-OP;
 *       re-running would issue a 2nd {@code POST /api/auth/cookie}, a 2nd
 *       {@code GET /v1/authz/me} and a 2nd {@code setKeycloakSession}
 *       (which itself triggers a 2nd inbox refetch).</li>
 *   <li>{@code unauthenticated} — keycloak.init() saw no token. This is
 *       the genuine post-redirect race (PR #313): keycloak-js fired
 *       onAuthSuccess later with a freshly-exchanged auth-code token, so
 *       the catch-up closure DOES run and converts the FSM to
 *       transportReady.</li>
 *   <li>{@code failed} — bootstrap hit a hard error (cookie write reject
 *       or a boundary throw). onAuthSuccess is a NO-OP — no hidden retry;
 *       the {@code failed} FSM state is authoritative.</li>
 *   <li>{@code hydrated} — an impersonation session was restored before
 *       keycloak.init(); keycloak handlers are no-ops while impersonation
 *       is active (iter-5 P1-3 invariant).</li>
 * </ul>
 */
export type BootstrapOutcome =
  | { kind: 'transportReady' }
  | { kind: 'unauthenticated' }
  | { kind: 'failed' }
  | { kind: 'hydrated' };

/** One-shot deferred bridging {@code bootstrap()} and {@code onAuthSuccess}. */
export interface BootstrapOutcomeDeferred {
  /** Resolves once — with the outcome {@code bootstrap()} declares. */
  promise: Promise<BootstrapOutcome>;
  /**
   * {@code resolveBootstrapOutcomeOnce} semantics — only the FIRST call
   * settles the promise; later calls are silently ignored.
   * {@code bootstrap()} resolves from several code paths (impersonation
   * hydrate early-return, controller result, error boundary, finally
   * backstop) and only the first wins.
   */
  resolve: (outcome: BootstrapOutcome) => void;
}

/**
 * Create the one-shot {@link BootstrapOutcomeDeferred}. Constructed
 * BEFORE {@code keycloak.onAuthSuccess} is attached so the handler can
 * {@code await} the outcome no matter how early keycloak-js fires the
 * event during {@code keycloak.init()}.
 */
export function createBootstrapOutcomeDeferred(): BootstrapOutcomeDeferred {
  let settle: (outcome: BootstrapOutcome) => void = () => undefined;
  const promise = new Promise<BootstrapOutcome>((res) => {
    settle = res;
  });
  let settled = false;
  const resolve = (outcome: BootstrapOutcome): void => {
    if (settled) return;
    settled = true;
    settle(outcome);
  };
  return { promise, resolve };
}

/* ------------------------------------------------------------------ */
/*  onAuthSuccess catch-up handler factory                              */
/* ------------------------------------------------------------------ */

export interface OnAuthSuccessHandlerDeps {
  getMounted: () => boolean;
  getIsImpersonating: () => boolean;
  getKeycloakToken: () => string | undefined | null;
  getKeycloakTokenParsed: () => { exp?: number } | undefined;
  setTokenCookie: (token: string) => Promise<void>;
  fetchAppPermissions: (token: string) => Promise<AuthzMeResult>;
  mapProfile: typeof mapKeycloakProfile;
  dispatch: (action: AnyAction) => unknown;
  /**
   * PR-2: resolves with {@code bootstrap()}'s outcome. The handler
   * awaits this BEFORE doing any work — the catch-up closure runs ONLY
   * for {@code unauthenticated}; {@code transportReady} / {@code failed}
   * / {@code hydrated} are all no-ops.
   */
  bootstrapOutcome: Promise<BootstrapOutcome>;
}

type AnyAction = { type: string; payload?: unknown };

/**
 * Iter-6 P1-3 absorb (Codex thread `019e109c`): factory wrapping the
 * post-{@code keycloak.init} catch-up closure. Extracted for unit
 * testing the impersonation guard and the dispatch sequence without
 * mounting the React component.
 *
 * <p>PR-2 (Codex AGREE thread `019e362e`): the catch-up is now
 * RESULT-GATED. The handler awaits {@code deps.bootstrapOutcome} and
 * runs the cookie + authz + session closure ONLY when bootstrap declared
 * {@code unauthenticated} (the genuine post-redirect auth-code race).
 * On {@code transportReady} the bootstrap controller already did that
 * work — re-running it was the redundant double-bootstrap (a 2nd
 * {@code /api/auth/cookie}, {@code /v1/authz/me} and inbox refetch on
 * every silent-SSO load). On {@code failed} there is no hidden retry;
 * on {@code hydrated} impersonation owns the FSM.
 *
 * <p>Iter-5 P1-3 invariant preserved: when impersonation is active the
 * handler short-circuits BEFORE awaiting the outcome and before any
 * {@code /auth/cookie} write — otherwise Keycloak.js's silent SSO
 * completion would clobber the broker session with the admin token.
 * Same rationale as {@code keycloak.onTokenExpired}; both refresh
 * surfaces are impersonation-guarded.
 */
export function createOnAuthSuccessHandler(deps: OnAuthSuccessHandlerDeps): () => Promise<void> {
  return async () => {
    if (!deps.getMounted()) return;
    // Iter-5 P1-3 invariant: keycloak handlers are no-ops while
    // impersonation is active. The hydrate path established the
    // broker session before keycloak.init; if Keycloak.js fires
    // {@code onAuthSuccess} after a silent SSO completion against
    // the admin realm session, this guard prevents the catch-up
    // closure from re-writing /auth/cookie with the admin token.
    if (deps.getIsImpersonating()) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[AuthBootstrapper] onAuthSuccess skipped — impersonation active');
      }
      return;
    }
    // PR-2 (Codex AGREE thread 019e362e): result-gated catch-up. Wait
    // for bootstrap() to declare its outcome, then act ONLY on the
    // genuine post-redirect race (`unauthenticated`). `transportReady`
    // means the controller already ran cookie + authz + session — the
    // closure here would just duplicate it. `failed` gets no hidden
    // retry; `hydrated` means impersonation owns the FSM.
    const outcome = await deps.bootstrapOutcome;
    if (!deps.getMounted()) return;
    if (outcome.kind !== 'unauthenticated') {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[AuthBootstrapper] onAuthSuccess no-op — bootstrap outcome=${outcome.kind}`);
      }
      return;
    }
    const token = deps.getKeycloakToken();
    if (!token) return;
    if (process.env.NODE_ENV !== 'production') {
      console.info('[AuthBootstrapper] onAuthSuccess catch-up closure (post-redirect race)');
    }
    try {
      await deps.setTokenCookie(token);
      if (!deps.getMounted()) return;
      const profile = deps.mapProfile(token);
      const authzResult = await deps.fetchAppPermissions(token);
      if (!deps.getMounted()) return;
      const mergedProfile = profile
        ? {
            ...profile,
            permissions:
              authzResult.permissions.length > 0 ? authzResult.permissions : profile.permissions,
            role: authzResult.superAdmin
              ? 'ADMIN'
              : authzResult.permissions.length > 0
                ? (authzResult.permissions.find((p) => p === 'ADMIN') ?? profile.role)
                : profile.role,
          }
        : undefined;
      const tokenParsed = deps.getKeycloakTokenParsed();
      deps.dispatch(
        setKeycloakSession({
          token,
          profile: mergedProfile,
          expiresAt: tokenParsed?.exp ? tokenParsed.exp * 1000 : null,
          authzSnapshot: authzResult.rawResponse,
        }),
      );
      deps.dispatch(setAuthPhase('transportReady'));
      deps.dispatch(setAuthInitialized(true));
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AuthBootstrapper] onAuthSuccess closure failed:', err);
      }
      if (deps.getMounted()) {
        deps.dispatch(
          setAuthFailed({
            message:
              'Auth cookie write failed during onAuthSuccess catch-up; protected requests cannot proceed.',
            cause: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/*  AuthBootstrapper — Keycloak initialization & token management      */
/* ------------------------------------------------------------------ */

export const AuthBootstrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const isImpersonating = useAppSelector(selectIsImpersonating);
  const tokenRef = useRef<string | null>(null);
  // PR-C2: stable ref read by Keycloak event handlers (which are
  // attached once per mount and would otherwise close over the initial
  // {@code isImpersonating=false}). Updated whenever the selector
  // changes so {@code onTokenExpired} can decide whether to skip.
  const isImpersonatingRef = useRef<boolean>(false);
  const shouldUseKeycloak = isKeycloakMode();

  useEffect(() => {
    tokenRef.current = token ?? null;
    // Register token resolver for grid variant API calls
    registerGridVariantsTokenResolver(() => tokenRef.current);
  }, [token]);

  useEffect(() => {
    isImpersonatingRef.current = isImpersonating;
  }, [isImpersonating]);

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

  /**
   * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4
   * + iter-6 Approach A): page-refresh hydrate guard. Implementation
   * extracted to {@link tryHydrateImpersonation} (./impersonation-hydrate)
   * so the 6-condition guard + happy-path side-effects are unit-testable
   * without mounting the whole bootstrap tree. The component owns the
   * decision of WHEN to invoke (right before Keycloak init); the helper
   * owns the side-effects.
   */
  const hydrateImpersonationFromStorage = React.useCallback(
    () => tryHydrateImpersonation(dispatch),
    [dispatch],
  );

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
    // PR-2 (Codex AGREE thread 019e362e): one-shot deferred bridging
    // bootstrap() and the keycloak.onAuthSuccess handler. Created here —
    // before either handler is attached — so onAuthSuccess can await the
    // bootstrap outcome no matter how early keycloak-js fires the event.
    const bootstrapOutcomeDeferred = createBootstrapOutcomeDeferred();

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
        // 2026-05-10 hotfix (login flow P1) iter-2: GC stale
        // `kc-callback-*` localStorage entries left by aborted PKCE
        // flows. keycloak-js writes one entry per createLoginUrl
        // invocation (carrying PKCE state + nonce + code_verifier) at
        // {@code lib/keycloak.js:1783}: {@code expires = Date.now() +
        // 60*60*1000}. Aborted flows (user closes tab, network error,
        // server-side reload during KC redirect) leak entries
        // indefinitely. Live cluster smoke observed 21+ stale entries;
        // over months this both bloats localStorage quota AND leaks
        // PKCE material to any XSS landing on the origin. Cross-AI
        // Codex review (thread 019e1336) flagged as P1.
        //
        // Iter-1 used {@code now - expires > 1h} which is wrong: that
        // condition only fires once the entry has been expired for
        // 1h — i.e. ~2h after creation. Iter-2 (Codex thread 019e1341
        // P1 #3 absorb) uses {@code expires <= now} which matches the
        // semantics keycloak-js itself uses in clearInvalidValues. An
        // active in-flight callback (with future expires) is preserved.
        //
        // Wrapped in its own try/catch (Codex P2 absorb) so a privacy-
        // mode {@code window.localStorage} access throw doesn't break
        // the whole bootstrap.
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const now = Date.now();
            const stale: string[] = [];
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (!key || !key.startsWith('kc-callback-')) continue;
              try {
                const raw = window.localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : null;
                const expires = typeof parsed?.expires === 'number' ? parsed.expires : null;
                // Active flow: future expires (kept). Stale: missing,
                // malformed, or already-expired entries (cleaned).
                if (expires === null || expires <= now) {
                  stale.push(key);
                }
              } catch {
                stale.push(key);
              }
            }
            if (stale.length > 0) {
              stale.forEach((k) => window.localStorage.removeItem(k));
              console.info(`[AuthBootstrapper] cleaned ${stale.length} stale kc-callback entries`);
            }
          }
        } catch (err) {
          // Privacy mode / disabled storage — skip cleanup, don't
          // break bootstrap.
          console.warn('[AuthBootstrapper] kc-callback cleanup skipped:', err);
        }

        // PR-C2 (Codex AGREE thread `019e109c` iter-4): impersonation
        // hydrate guard — must run BEFORE keycloak.init to avoid the
        // re-init writing the admin token back over the broker token.
        // 6-condition check is inside the helper; on success the
        // bootstrap returns early without touching keycloak.
        const hydrated = await hydrateImpersonationFromStorage();
        if (hydrated) {
          // Impersonation session restored — keycloak handlers stay
          // no-ops (iter-5 P1-3). Tell onAuthSuccess via the outcome.
          bootstrapOutcomeDeferred.resolve({ kind: 'hydrated' });
          return;
        }
        const isLoginRoute =
          typeof window !== 'undefined' && window.location?.pathname?.startsWith('/login');
        const urlHasAuthCode =
          typeof window !== 'undefined' &&
          (window.location?.hash?.includes('code=') || window.location?.search?.includes('code='));
        const initOptions: BootstrapInitOptions = {
          pkceMethod: 'S256',
          checkLoginIframe: false,
        };
        // 2026-05-11 (Codex 019e13ef AGREE on semantic correctness;
        // REVISE on hypothesis):
        //
        // No `onLoad` with URL callback is semantically correct;
        // callback handling is independent of `onLoad` in
        // keycloak-js@26.2.4 — `#processInit()` parses URL callback
        // FIRST (keycloak.js:803), runs `#processCallback()` and
        // `/token` exchange when valid (keycloak.js:810), then RETURNS
        // before the `onLoad` switch (keycloak.js:832). So setting
        // `onLoad: 'check-sso'` for the URL-callback branch is
        // redundant at best — the library does its callback work
        // unconditionally when state+code are present.
        //
        // Live failure ("açılmıyor" — KC redirects with code, /token
        // never fires) is not yet root-caused. Candidate hypotheses
        // remaining to confirm via the diagnostic log below:
        //   - kc-callback storage entry for the URL state is missing
        //     at the moment kc.init() reads it (storage isolation,
        //     entry consumed by a prior parse, or different origin)
        //   - URL callback present but token exchange does not fire
        //     (validation step beyond state lookup, e.g. nonce or
        //     redirectUri mismatch)
        //   - URL hash stripped by React Router before kc.init() runs
        //
        // Silent SSO (no URL code) path is unchanged.
        if (urlHasAuthCode) {
          // Intentional: no onLoad. keycloak-js processes URL callback
          // unconditionally when state+code present.
        } else if (!isLoginRoute && authConfig.keycloak.enableSilentCheckSso) {
          initOptions.onLoad = 'check-sso';
          initOptions.silentCheckSsoRedirectUri = authConfig.keycloak.silentCheckSsoRedirectUri;
        }
        // 2026-05-11 diagnostic: log kc-callback storage state when URL
        // has auth code, to surface "callback storage missing/mismatch"
        // bugs in production. Real-user "açılmıyor" symptom on testai
        // shows kc.init() finishing without firing /token exchange —
        // this log helps prove whether the kc-callback entry for the
        // URL state exists at the moment kc.init() is about to run.
        let urlCodeDiag: Record<string, unknown> = {};
        if (urlHasAuthCode && typeof window !== 'undefined') {
          try {
            const hashStr = (window.location?.hash ?? '').replace(/^#/, '');
            const params = new URLSearchParams(
              hashStr || (window.location?.search ?? '').replace(/^\?/, ''),
            );
            const stateVal = params.get('state');
            const callbackKey = stateVal ? `kc-callback-${stateVal}` : null;
            const cbExists = callbackKey ? !!window.localStorage.getItem(callbackKey) : false;
            const totalCallbacks = Object.keys(window.localStorage).filter((k) =>
              k.startsWith('kc-callback-'),
            ).length;
            // Sanitize state prefix: only alphanumeric/dash chars
            // accepted into the log message. Defense against CodeQL
            // "format string depends on user-provided value"
            // (rule js/format-string-injection); even though
            // console.info doesn't interpret %s, sanitizing closes
            // the static-analysis flag and is good hygiene.
            const safeStatePrefix = stateVal
              ? stateVal.slice(0, 8).replace(/[^a-zA-Z0-9-]/g, '_')
              : null;
            urlCodeDiag = {
              urlStateLen: stateVal?.length ?? 0,
              urlStatePrefix: safeStatePrefix,
              callbackExists: cbExists,
              totalCallbacks,
            };
          } catch (err) {
            urlCodeDiag = { diagFailed: err instanceof Error ? err.message : String(err) };
          }
        }
        // 2026-05-11 (follow-up to PR #387 — diagnostic readability):
        // Inline-string the diagnostic payload so console capture
        // tools that flatten object args (Chrome MCP read_console_messages,
        // some log aggregators) can still extract the fields. The
        // original object-arg form is preserved alongside for DevTools
        // pretty-printing.
        const diagPayload = {
          isLoginRoute,
          urlHasAuthCode,
          onLoad: initOptions.onLoad,
          kcUrl: authConfig.keycloak.url,
          ...urlCodeDiag,
        };
        // CodeQL js/format-string-injection guard:
        // The FIRST argument to console.info must be a CONSTANT string
        // literal — never a concatenation that includes URL-derived
        // values. Even with state-prefix sanitisation, CodeQL flags
        // any first-arg string built from a tainted source. Solution:
        // the constant prefix stays in arg 0; the serialised JSON
        // (which contains the diagnostic detail Chrome MCP can capture
        // as a flat string) goes in arg 1; the structured payload
        // (which DevTools pretty-prints) goes in arg 2.
        let diagSerialized: string;
        try {
          diagSerialized = JSON.stringify(diagPayload);
        } catch {
          diagSerialized = '<unserializable>';
        }
        console.info('[AuthBootstrapper] init starting', diagSerialized, diagPayload);

        // Phase 2 PR-E2E-6: test-only Keycloak bootstrap bypass.
        // GUARDED by isAuthContractE2eEnabled() — production bundles
        // (where VITE_AUTH_CONTRACT_E2E is unset) NEVER take this
        // branch even if window.__authContractMockToken is somehow
        // injected (Codex iter-3 P0 #1: defense-in-depth, do not rely
        // on the probe-install gate alone). Test bundles set both the
        // env flag AND the mock token slot.
        const mockToken =
          isAuthContractE2eEnabled() && typeof window !== 'undefined'
            ? window.__authContractMockToken
            : undefined;
        if (mockToken) {
          const parts = mockToken.split('.');
          let exp = Math.floor(Date.now() / 1000) + 3600;
          if (parts.length === 3) {
            try {
              const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              if (typeof payload.exp === 'number') {
                exp = payload.exp;
              }
            } catch {
              // fall back to default exp
            }
          }
          (keycloak as { token: string | undefined }).token = mockToken;
          (keycloak as { tokenParsed: Record<string, unknown> | undefined }).tokenParsed = {
            exp,
          };
          (keycloak as { authenticated: boolean | undefined }).authenticated = true;
          console.info('[AuthBootstrapper] e2e-mock bypass — keycloak.init no-op', {
            exp,
          });
        }

        // Phase 2 PR-Auth-1 (Codex iter-25 §2 absorb, thread 019e0119):
        // bootstrap delegated to extracted controller so unit tests can
        // exercise the same code path. AuthBootstrapper.test.ts no longer
        // duplicates the implementation.
        const result = await bootstrapAuthController({
          keycloak: {
            authenticated: keycloak.authenticated,
            // PR #314 (Codex 019e062b iter-0 P1 #1 absorb): live
            // getters, NOT pre-init snapshots. keycloak-js sets
            // keycloak.token inside init() for auth-code callback;
            // a snapshot taken here (before init resolved) would
            // capture null and the controller would never see the
            // freshly-issued token.
            getToken: () => keycloak.token,
            getTokenParsed: () => keycloak.tokenParsed,
            // PR-E2E-6: when mockToken set, init is a no-op; the keycloak
            // surface already carries the test token from above.
            init: mockToken ? async () => undefined : (opts) => keycloak.init(opts),
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
        // PR-2: hand the controller's terminal phase to the
        // onAuthSuccess handler. transportReady / unauthenticated map
        // 1:1; every other terminal phase (failed, or a defensive
        // non-terminal leak) collapses to `failed`.
        bootstrapOutcomeDeferred.resolve({
          kind:
            result.finalPhase === 'transportReady'
              ? 'transportReady'
              : result.finalPhase === 'unauthenticated'
                ? 'unauthenticated'
                : 'failed',
        });
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
        // PR-2 defensive backstop: guarantee the onAuthSuccess handler
        // never hangs awaiting an outcome no code path resolved (e.g. an
        // unexpected throw after the controller returned). resolve is
        // idempotent — a no-op on every path that already settled.
        bootstrapOutcomeDeferred.resolve({ kind: 'failed' });
        if (mounted) {
          // Backward-compat: legacy {@code initialized} boolean is now
          // derived from {@link AuthPhase}; calling setAuthInitialized
          // after bootstrap completes keeps existing consumers (those
          // that haven't migrated to selectIsTransportReady) working.
          dispatch(setAuthInitialized(true));
        }
      }
    };

    // 2026-05-08 third hotfix (PR #313) — post-redirect auth-code race.
    //
    // Repro: user lands at /login, kc.init() returns with kc.token=null
    // (no Keycloak session yet). The bootstrap controller declares
    // 'unauthenticated' and returns early — setTokenCookie / authz
    // never run. Then the user completes the Keycloak login and the
    // page reloads with an auth code; kc.init() exchanges it and
    // keycloak-js fires onAuthSuccess internally with the fresh token.
    // The catch-up closure writes the cookie, fetches authz, dispatches
    // the session and converts the FSM to transportReady.
    //
    // PR-2 (Codex AGREE thread 019e362e) — two structural changes that
    // kill the double-bootstrap (a duplicate /api/auth/cookie,
    // /v1/authz/me and inbox/me on EVERY silent-SSO page load):
    //   1. onAuthSuccess is attached BEFORE bootstrap() is invoked, so
    //      it can never miss an onAuthSuccess that keycloak-js fires
    //      synchronously deep inside keycloak.init().
    //   2. The handler is result-gated (see createOnAuthSuccessHandler):
    //      it awaits the bootstrap outcome and runs the catch-up closure
    //      ONLY for `unauthenticated`. On the silent-SSO happy path
    //      bootstrap reaches `transportReady` and the handler is a
    //      no-op — the controller already did the cookie + authz work.
    keycloak.onAuthSuccess = createOnAuthSuccessHandler({
      getMounted: () => mounted,
      getIsImpersonating: () => isImpersonatingRef.current,
      getKeycloakToken: () => keycloak.token,
      getKeycloakTokenParsed: () => keycloak.tokenParsed,
      setTokenCookie,
      fetchAppPermissions,
      mapProfile: mapKeycloakProfile,
      dispatch,
      bootstrapOutcome: bootstrapOutcomeDeferred.promise,
    });

    keycloak.onTokenExpired = async () => {
      // PR-C2 (Codex AGREE thread `019e109c` iter-1 + iter-4): refresh
      // handler MUST NOT call keycloak.updateToken while an
      // impersonation session is active — the broker token would be
      // overwritten with the admin token mid-session, breaking the
      // FSM and the audit chain. Bail early; the broker token has its
      // own TTL (managed by backend) and the impersonation-expired
      // listener picks up the 403 SESSION_EXPIRED event when it fires.
      if (isImpersonatingRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[AuthBootstrapper] onTokenExpired skipped — impersonation active');
        }
        return;
      }
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

    // PR-2: bootstrap() is invoked LAST — after both keycloak event
    // handlers are attached — so onAuthSuccess (which keycloak-js can
    // fire synchronously inside keycloak.init()) always finds its
    // handler in place and a live bootstrapOutcome deferred to await.
    bootstrap();

    return () => {
      mounted = false;
    };
  }, [dispatch, shouldUseKeycloak]);

  return <>{children}</>;
};
