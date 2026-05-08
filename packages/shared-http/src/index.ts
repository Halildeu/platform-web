import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
export * from './telemetryClient';
export * from './apiLogger';
export * from './observability';
import {
  recordResponse,
  recordRefreshAttempt,
  recordRefreshWaiter,
  recordAuthNotReady,
} from './observability';

type AuthMode = 'keycloak' | 'permitAll';

type TokenResolver = () => string | null;
type TraceIdResolver = () => string | null;
type UnauthorizedHandler = (error: AxiosError) => void;

/**
 * Phase 2 PR-HTTP-3 (MFE Auth Transport Contract follow-up to PR-Auth-1
 * #302 + PR-Reporting-2 #304): typed result of the shell's auth-ready
 * bridge. The shared HTTP client awaits this resolver before issuing any
 * request that hasn't opted out via {@code __skipAuth}, so no protected
 * endpoint is ever called before the auth FSM reaches transportReady.
 *
 * <p>Mirrors the {@code AuthReadyResult} union exposed via
 * {@code mfe_shell/services} and {@code apps/mfe-shell/src/app/services/
 * shell-services.ts}. We re-declare it here (instead of importing) to
 * keep {@code @mfe/shared-http} a leaf package with no MFE-side
 * dependencies — the shell wires the resolver via
 * {@link registerAuthReadyResolver}.
 */
export type SharedHttpAuthReadyResult =
  | { ok: true }
  | { ok: false; reason?: string; error?: string };

type AuthReadyResolver = () => Promise<SharedHttpAuthReadyResult>;

/**
 * Thrown by the request interceptor when the auth-ready resolver returns
 * {@code !ok}. Distinct from a {@code 401} because the request never
 * left the browser — there is no server response. Callers can branch
 * on this name to skip retry / refresh logic that only makes sense
 * for an actually-issued request.
 */
export class AuthNotReadyError extends Error {
  constructor(
    public readonly reason: string,
    public readonly detail?: string,
  ) {
    super(`auth-not-ready: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'AuthNotReadyError';
  }
}

/**
 * Phase 2 PR-Refresh-4: typed result from the shell's refresh-token
 * handler. {@code ok: true} carries the new token (optional — handler
 * may have already pushed it to the store/cookie); {@code ok: false}
 * carries the reason so the response interceptor can propagate the
 * 401 with diagnostic context.
 */
export type RefreshResult = { ok: true; token?: string } | { ok: false; reason: string };

type RefreshHandler = () => Promise<RefreshResult>;
type EnvRecord = Record<string, string | undefined>;
export type SharedHttpRequestConfig = AxiosRequestConfig & {
  __suppressGlobalForbiddenToast?: boolean;
  __suppressGlobalProfileMissingToast?: boolean;
  /**
   * 2026-04-19 (QLTY-PROACTIVE-02): opt-out of Authorization header injection
   * for public endpoints (e.g. /v1/theme-registry). Prevents stale/wrong-aud
   * token races during app bootstrap where AuthBootstrapper hasn't yet run but
   * a persisted token still lives in localStorage. Set `{ __skipAuth: true }`
   * on the request config — Authorization header will NOT be added.
   *
   * Rationale: Spring Security `permitAll()` STILL invokes the JWT filter when
   * a Bearer header is present, so strict single-aud validators (e.g. variant-
   * service) reject stale/wrong-aud tokens and the request fails with 401 even
   * though the endpoint is declared public. Sending the request anonymously
   * sidesteps the filter.
   *
   * <p>PR-HTTP-3: setting {@code __skipAuth: true} ALSO bypasses the
   * auth-ready gate added in this PR — if the caller declares the endpoint
   * does not need our auth orchestration, neither header injection nor the
   * gate apply.
   */
  __skipAuth?: boolean;
  /**
   * Phase 2 PR-HTTP-3 (Codex iter-1 P0/P1 absorb, thread 019e046c):
   * opt-out of the auth-ready gate ONLY (Authorization header injection
   * still applies normally). For requests that DRIVE the auth FSM
   * itself — they cannot wait for transportReady because their
   * completion is what produces transportReady:
   * <ul>
   *   <li>{@code POST /auth/cookie} (AuthBootstrapper setTokenCookie)</li>
   *   <li>{@code DELETE /auth/cookie} (AuthBootstrapper clearTokenCookie)</li>
   *   <li>{@code POST /v1/auth/sessions} (loginUser thunk)</li>
   *   <li>{@code GET /v1/authz/me} immediately post-login (loginUser)</li>
   *   <li>{@code GET /users/by-email/...} immediately post-login</li>
   *   <li>{@code POST /users/public/register} (registerUser thunk)</li>
   * </ul>
   * Without this opt-out, the request awaits transportReady which can
   * only happen after the request itself resolves — classic deadlock
   * caught by Codex iter-1 P0.
   */
  __skipAuthReadyGate?: boolean;
  /**
   * Phase 2 PR-Refresh-4: internal flag set by the response interceptor
   * after a refresh-and-retry attempt. Prevents an infinite refresh
   * loop if the retried request itself returns 401.
   */
  __isRefreshAttempt?: boolean;
  /**
   * Phase 2 PR-Refresh-4: opt-out of the single-flight 401 refresh-retry
   * pipeline. The shell's refresh handler ({@code keycloak.updateToken})
   * itself MUST set this to avoid recursive refresh attempts. Public
   * endpoints with manual auth ({@code __skipAuth: true}) implicitly
   * bypass refresh too — they didn't carry our auth in the first place.
   */
  __skipRefreshOn401?: boolean;
};

/**
 * Type guard for {@link AuthNotReadyError} across module boundaries.
 *
 * <p>Phase 2 PR-HTTP-3 (Codex iter-1 §3 absorb): under Module Federation
 * with no-share semantics, a remote MFE's {@code AuthNotReadyError}
 * class may be a different prototype than the shell's instance, so a
 * naive {@code instanceof} fails even when the error is conceptually
 * the same. Use this name-based guard instead.
 */
export const isAuthNotReadyError = (err: unknown): err is AuthNotReadyError =>
  err != null &&
  typeof err === 'object' &&
  (err as { name?: unknown }).name === 'AuthNotReadyError';

const getEnvValue = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && typeof process.env?.[key] === 'string') {
    return process.env[key];
  }
  if (typeof window !== 'undefined') {
    const win = window as Window & {
      __env__?: EnvRecord;
      __ENV__?: EnvRecord;
    };
    const candidate = win.__env__?.[key] ?? win.__ENV__?.[key];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return undefined;
};

const resolveAuthMode = (): AuthMode => {
  const raw = getEnvValue('VITE_AUTH_MODE') ?? getEnvValue('AUTH_MODE');
  if (raw && raw.toLowerCase() === 'permitall') {
    return 'permitAll';
  }
  return 'keycloak';
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveGatewayBaseUrl = (): string => {
  const fromEnv = getEnvValue('VITE_GATEWAY_URL');
  // Varsayılan olarak, same-origin proxy (/api) kullan.
  // Gerekirse VITE_GATEWAY_URL ile tam gateway URL'si verilebilir.
  const base = fromEnv || '/api';
  return trimTrailingSlash(base);
};

const defaultTokenResolver: TokenResolver = () => null;

const defaultTraceResolver: TraceIdResolver = () => null;

let tokenResolver: TokenResolver = defaultTokenResolver;
let traceResolver: TraceIdResolver = defaultTraceResolver;
let unauthorizedHandler: UnauthorizedHandler | null = null;
// Phase 2 PR-HTTP-3: shell-supplied auth-ready bridge. Default null means
// no gate (legacy behaviour preserved for tests / package isolation).
let authReadyResolver: AuthReadyResolver | null = null;

// Phase 2 PR-Refresh-4: shell-supplied refresh-token handler. Default
// null means the response interceptor falls back to the legacy 401
// path (dispatch event, reject). When wired, the interceptor will
// single-flight a refresh on 401 and retry the original request once.
let refreshHandler: RefreshHandler | null = null;
let refreshInFlight: Promise<RefreshResult> | null = null;

let authMode: AuthMode = resolveAuthMode();
let authRedirectInProgress = false;
const PROFILE_MISSING_CODE = 'PROFILE_MISSING';
const GLOBAL_TOAST_DEDUPE_MS = 2_000;
// İlk yüklemede auth init tamamlanmadan gelebilecek 401'leri yutmak için küçük tolerans
const appStartTime = Date.now();
const INITIAL_401_GRACE_MS = 5_000;
let initialUnauthorizedIgnored = false;
let lastGlobalToast: { message: string; at: number } | null = null;

const AUTH_STORAGE_KEYS = [
  'token',
  'user',
  'tokenExpiresAt',
  'shell_auth_state',
  'serban.shell.authState',
  'shell-auth-sync',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const clearPersistedAuth = () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    AUTH_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
};

const dispatchGlobalToast = (message: string) => {
  const now = Date.now();
  if (
    lastGlobalToast &&
    lastGlobalToast.message === message &&
    now - lastGlobalToast.at < GLOBAL_TOAST_DEDUPE_MS
  ) {
    return;
  }
  lastGlobalToast = { message, at: now };
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent('app:toast', {
        detail: { type: 'error', text: message },
      }),
    );
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[shared-http] toast dispatch failed', message);
    }
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const redirectToLogin = () => {
  if (typeof window === 'undefined' || authRedirectInProgress) {
    return;
  }
  authRedirectInProgress = true;
  const { location } = window;
  const current = `${location.pathname ?? ''}${location.search ?? ''}${location.hash ?? ''}` || '/';
  const isOnLogin = location.pathname?.startsWith('/login');
  const redirect = isOnLogin ? '/' : current;
  const target = `/login?redirect=${encodeURIComponent(redirect)}`;
  location.replace(target);
};

const handleUnauthorized = (reason = 'unauthorized') => {
  if (typeof window === 'undefined') {
    return;
  }
  const hasToken = Boolean(tokenResolver());
  const locationSafe = typeof window !== 'undefined' && window.location ? window.location : null;
  // Eğer henüz token alınmamışsa (ör. sayfa yeni yüklendi, keycloak init bekleniyor),
  // 401 geldiyse login sayfasına zorla yönlendirmeyelim; init tamamlanınca tekrar denenecek.
  if (!hasToken) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[LOGIN REDIRECT SKIP]', { reason, path: locationSafe?.pathname ?? 'n/a' });
    }
    return;
  }
  // Sayfa yüklenir yüklenmez gelen ilk 401'leri (muhtemel init yarışı) yut.
  const sinceStart = Date.now() - appStartTime;
  if (!initialUnauthorizedIgnored && sinceStart < INITIAL_401_GRACE_MS) {
    initialUnauthorizedIgnored = true;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[LOGIN REDIRECT SKIP - GRACE]', { reason, sinceStart });
    }
    return;
  }
  // Önceki davranış redirect+logout idi; artık yalnızca isteği düşürüp handler’a bildiriyoruz.
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[401 HANDLE]', { reason, path: locationSafe?.pathname ?? 'n/a' });
  }
  abortPendingRequests();
};

const handleForbidden = () => {
  dispatchGlobalToast('Bu işlem için yetkiniz bulunmuyor.');
};

const handleProfileMissing = () => {
  dispatchGlobalToast(
    'Profiliniz henüz oluşturulmamış. Lütfen sistem yöneticisiyle iletişime geçin.',
  );
};

const extractErrorCode = (error: AxiosError): string | null => {
  const data = error.response?.data;
  if (!data) {
    return null;
  }
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'object' && data !== null) {
    const structured = data as Record<string, unknown>;
    if (typeof structured.message === 'string') {
      return structured.message;
    }
    if (typeof structured.detail === 'string') {
      return structured.detail;
    }
    if (typeof structured.errorCode === 'string') {
      return structured.errorCode;
    }
    if (typeof structured.title === 'string') {
      return structured.title;
    }
  }
  return null;
};

export const registerAuthTokenResolver = (resolver?: TokenResolver): void => {
  tokenResolver = resolver ?? defaultTokenResolver;
};

export const registerTraceIdResolver = (resolver?: TraceIdResolver): void => {
  traceResolver = resolver ?? defaultTraceResolver;
};

export const registerUnauthorizedHandler = (handler?: UnauthorizedHandler): void => {
  unauthorizedHandler = handler ?? null;
};

/**
 * Phase 2 PR-HTTP-3: register the shell's auth-ready bridge so the
 * shared HTTP client awaits {@code transportReady} before issuing any
 * protected request. Pass {@code undefined} to remove the gate (the
 * default behaviour with no resolver is to let the request proceed —
 * this preserves legacy callers that don't run inside a shell).
 *
 * <p>The shell wires this in {@code shell-services-wiring.ts} alongside
 * {@link registerAuthTokenResolver} so the same auth FSM that powers
 * {@code getShellServices().auth.ready()} also gates direct
 * {@code api.get/post/...} calls. MFEs that consume
 * {@code getShellServices().http} get the gate transparently — they
 * don't need to call {@code auth.ready()} themselves.
 *
 * <p>Opt-out: a request config can set
 * {@code __skipAuth: true} (existing flag) to bypass the gate, e.g.
 * for public endpoints like {@code /v1/theme-registry} that must work
 * before authentication completes.
 */
export const registerAuthReadyResolver = (resolver?: AuthReadyResolver): void => {
  authReadyResolver = resolver ?? null;
};

/**
 * Phase 2 PR-Refresh-4: register the shell's refresh-token handler.
 * When a protected request returns 401, the response interceptor will:
 * <ol>
 *   <li>Single-flight: if a refresh is already in flight, every other
 *       401-failing request awaits the same Promise (one network
 *       refresh per token expiry, no thundering herd).</li>
 *   <li>On {@code ok: true}, retry the original request once with the
 *       new token (the {@code __isRefreshAttempt} flag prevents a
 *       second refresh if the retry also 401s).</li>
 *   <li>On {@code ok: false}, propagate the original 401 (existing
 *       {@code app:auth:unauthorized} event is dispatched as before).</li>
 * </ol>
 *
 * <p>Pass {@code undefined} to remove the handler — falls back to the
 * legacy 401 path.
 */
export const registerRefreshHandler = (handler?: RefreshHandler): void => {
  refreshHandler = handler ?? null;
};

export const configureSharedHttp = (config?: { authMode?: AuthMode }): void => {
  if (config?.authMode) {
    authMode = config.authMode;
  }
};

const api = axios.create({
  baseURL: resolveGatewayBaseUrl(),
  withCredentials: false,
});

const ensureHeaders = (config: AxiosRequestConfig) => {
  if (!config.headers) {
    config.headers = {};
  }
  return config.headers;
};

const pendingControllers = new Set<AbortController>();
const requestControllerMap = new WeakMap<AxiosRequestConfig, AbortController>();

const trackPendingRequest = (config: AxiosRequestConfig) => {
  if (typeof AbortController === 'undefined') {
    return;
  }
  if (config.signal) {
    return;
  }
  const controller = new AbortController();
  config.signal = controller.signal;
  requestControllerMap.set(config, controller);
  pendingControllers.add(controller);
};

const releasePendingRequest = (config?: AxiosRequestConfig) => {
  if (!config) {
    return;
  }
  const controller = requestControllerMap.get(config);
  if (!controller) {
    return;
  }
  pendingControllers.delete(controller);
  requestControllerMap.delete(config);
};

const abortPendingRequests = () => {
  pendingControllers.forEach((controller) => {
    try {
      controller.abort();
    } catch {
      // ignore abort errors
    }
  });
  pendingControllers.clear();
};

const isPermitAllMode = () => authMode === 'permitAll';

const installInterceptors = (client: AxiosInstance) => {
  client.interceptors.request.use(async (config) => {
    const sharedConfig = config as SharedHttpRequestConfig;
    const skipAuth = sharedConfig.__skipAuth === true;
    const skipGate = sharedConfig.__skipAuthReadyGate === true || skipAuth;

    // Phase 2 PR-HTTP-3 (Codex iter-1 P0/P2 absorb): the auth-ready
    // gate runs BEFORE trackPendingRequest so a gate-rejected request
    // does not leak a pending controller. Tracking is delayed until
    // the gate clears (or is bypassed); this matches the historic
    // contract where trackPendingRequest only existed for in-flight
    // request abort, which only makes sense once the request is
    // actually about to fly.
    if (!skipGate && !isPermitAllMode() && authReadyResolver) {
      // Phase 2 PR-Obs-5: a resolver that throws (rather than returning
      // typed {@code !ok}) is itself a failure mode worth recording —
      // bounded reason {@code 'resolver-throw'} keeps cardinality flat
      // (Codex iter-1 P1). The original error still propagates to the
      // caller via the rethrow below.
      let result: SharedHttpAuthReadyResult;
      try {
        result = await authReadyResolver();
      } catch (resolverError) {
        recordAuthNotReady('resolver-throw');
        throw resolverError;
      }
      if (!result.ok) {
        recordAuthNotReady(result.reason ?? 'unknown');
        // Throwing inside a request interceptor short-circuits the
        // request — axios rejects the caller's promise with this
        // error. We use a typed error class plus a name-based guard
        // ({@link isAuthNotReadyError}) so callers can branch across
        // module-federation boundaries.
        throw new AuthNotReadyError(result.reason ?? 'unknown', result.error);
      }
    }

    trackPendingRequest(config);

    const headers = ensureHeaders(config);
    const token = tokenResolver();
    if (process.env.NODE_ENV !== 'production') {
      try {
        const base = config.baseURL ?? resolveGatewayBaseUrl();
        const path = typeof config.url === 'string' ? config.url : '';
        const prefix = path.startsWith('/') ? '' : '/';
        console.debug(
          `[AUTH DEBUG] url=${trimTrailingSlash(base)}${prefix}${path} method=${config.method ?? 'get'} hasToken=${Boolean(
            token,
          )} skipAuth=${skipAuth}`,
        );
      } catch {
        console.debug('[AUTH DEBUG] url=<unknown> method=<unknown> hasToken', Boolean(token));
      }
    }
    if (token && !headers.Authorization && !isPermitAllMode() && !skipAuth) {
      headers.Authorization = `Bearer ${token}`;
    }
    const traceId = traceResolver();
    if (traceId && !headers['X-Trace-Id']) {
      headers['X-Trace-Id'] = traceId;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      releasePendingRequest(response.config);
      // Phase 2 PR-Obs-5: record real response.status (not hardcoded
      // 200 — Codex iter-0 P0 #3). 201/204/304 are preserved.
      recordResponse(response.status, response.config?.method);
      return response;
    },
    async (error: AxiosError) => {
      releasePendingRequest(error.config);
      const requestConfig = (error.config ?? {}) as SharedHttpRequestConfig;
      const status = error?.response?.status;
      // Phase 2 PR-Obs-5: status-bearing errors land in the request
      // counter; network / CORS / abort errors are intentionally
      // out-of-scope (Codex iter-1 P1: explicit bounded scope).
      if (typeof status === 'number') {
        recordResponse(status, error.config?.method);
      }
      if (status === 401 && !isPermitAllMode()) {
        // Phase 2 PR-Refresh-4: single-flight refresh + retry pipeline.
        // Conditions for an attempt:
        //   - a refresh handler is registered (shell-wired);
        //   - this is NOT itself a refresh attempt (no infinite loop);
        //   - the request did not opt out via __skipRefreshOn401;
        //   - the request did not opt out from auth entirely
        //     (__skipAuth = "no auth header" → no point refreshing).
        // Codex iter-1 P1 absorb (thread 019e048d): also exclude
        // {@code __skipAuthReadyGate} requests. Bootstrap, login, and
        // register flows mark their requests with this flag (PR-HTTP-3
        // contract); they DRIVE the auth FSM, so a 401 from them must
        // NOT trigger refresh — the refresh handler itself uses these
        // same self-driving endpoints, which would deadlock.
        const eligibleForRefresh =
          refreshHandler !== null &&
          !requestConfig.__isRefreshAttempt &&
          !requestConfig.__skipRefreshOn401 &&
          !requestConfig.__skipAuth &&
          !requestConfig.__skipAuthReadyGate;

        if (eligibleForRefresh) {
          // Single-flight: every 401 within the same refresh window
          // awaits the same Promise. The first caller starts the
          // refresh; subsequent callers race onto the in-flight
          // result and retry once it settles.
          //
          // Phase 2 PR-Obs-5: only the OWNER (refreshInFlight === null
          // path) records a refresh attempt; waiters increment the
          // separate refreshWaiterTotal so a single real refresh isn't
          // multi-counted (Codex iter-0 P0 #4 + iter-1 final naming).
          let isOwner = false;
          if (refreshInFlight === null) {
            isOwner = true;
            // Codex iter-1 P2 absorb: wrap the handler invocation so a
            // SYNCHRONOUS throw (handler that throws before returning a
            // Promise) is also caught and converted to ok=false. The
            // outer try/await only catches Promise rejections.
            refreshInFlight = (async () => {
              try {
                return await (refreshHandler as RefreshHandler)();
              } catch (handlerErr) {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[shared-http] refresh handler threw:', handlerErr);
                }
                return { ok: false, reason: 'handler-threw' } as RefreshResult;
              }
            })().finally(() => {
              refreshInFlight = null;
            });
          } else {
            recordRefreshWaiter();
          }
          const refreshResult: RefreshResult = await refreshInFlight;
          if (isOwner) {
            recordRefreshAttempt(refreshResult.ok ? 'ok' : refreshResult.reason);
          }
          if (refreshResult.ok) {
            // Retry the original request once. Mark with
            // __isRefreshAttempt so a follow-up 401 does NOT trigger
            // another refresh (prevents loop). Authorization header
            // is re-injected by the request interceptor against the
            // (now-updated) tokenResolver.
            const retryConfig = error.config as SharedHttpRequestConfig | undefined;
            if (retryConfig) {
              retryConfig.__isRefreshAttempt = true;
              // Codex iter-1 P2 absorb: case-insensitive Authorization
              // header strip. axios uses uppercase but downstream code
              // (or merged config from external callers) may set the
              // lowercase variant; both forms must be cleared so the
              // request interceptor's re-inject from tokenResolver
              // doesn't compete with a stale header.
              if (retryConfig.headers && typeof retryConfig.headers === 'object') {
                const headers = retryConfig.headers as Record<string, unknown> & {
                  delete?: (key: string) => void;
                };
                if (typeof headers.delete === 'function') {
                  headers.delete('Authorization');
                  headers.delete('authorization');
                } else {
                  delete headers.Authorization;
                  delete headers.authorization;
                }
              }
              return client.request(retryConfig);
            }
          }
          // Refresh failed — fall through to the legacy 401 path so
          // the existing event/handler are dispatched.
        }

        handleUnauthorized('http-401');
        unauthorizedHandler?.(error);
        // Codex 019dd818 iter-7 (B-prime PR-2a): global event dispatch for
        // 401 — auth provider + shell UX listener'lar event'i dinler. Unauthorized
        // handler no-op olsa bile (mfe-access/audit registerUnauthorizedHandler
        // override pattern) event çıkar. Event detail sanitize: sadece status,
        // method, url (path-only), timestamp; header/token/body YOK.
        if (typeof window !== 'undefined') {
          const method = (error.config?.method ?? 'get').toUpperCase();
          const url = typeof error.config?.url === 'string' ? error.config.url : undefined;
          window.dispatchEvent(
            new CustomEvent('app:auth:unauthorized', {
              detail: {
                status: 401,
                method,
                url,
                timestamp: Date.now(),
              },
            }),
          );
        }
        return Promise.reject(error);
      }
      if (status === 403) {
        const errorCode = extractErrorCode(error);
        if (errorCode === PROFILE_MISSING_CODE) {
          if (!requestConfig.__suppressGlobalProfileMissingToast) {
            handleProfileMissing();
          }
        } else {
          if (!requestConfig.__suppressGlobalForbiddenToast) {
            handleForbidden();
          }
        }
        return Promise.reject(error);
      }
      return Promise.reject(error);
    },
  );
};

installInterceptors(api);

export const resolveAuthToken = (): string | null => tokenResolver();
export const resolveTraceId = (): string | null => traceResolver();
export const getGatewayBaseUrl = (): string => api.defaults.baseURL ?? resolveGatewayBaseUrl();

export const conditionalGet = async <T>(
  url: string,
  config?: AxiosRequestConfig & { etag?: string },
) => {
  const { etag, ...rest } = config ?? {};
  const headers = { ...(rest.headers ?? {}) } as Record<string, unknown>;
  if (typeof etag === 'string' && etag.length > 0 && typeof headers['If-None-Match'] !== 'string') {
    headers['If-None-Match'] = etag;
  }
  return api.get<T>(url, {
    ...rest,
    headers: headers as unknown as import('axios').RawAxiosRequestHeaders,
    validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
  });
};

export { api };
export type ApiInstance = typeof api;
export { fetchManifest, fetchPageLayout } from './manifest';
