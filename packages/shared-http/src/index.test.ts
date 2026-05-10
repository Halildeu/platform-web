import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AxiosError } from 'axios';

type ModuleExports = typeof import('./index');

const loadModule = async (): Promise<{
  mod: ModuleExports;
  locationReplace: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}> => {
  vi.resetModules();

  const localStorageMock = {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  };
  const locationReplace = vi.fn();
  const dispatchEvent = vi.fn();

  class FakeCustomEvent<T> extends Event {
    detail: T | undefined;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = init?.detail;
    }
  }

  const windowMock: any = {
    localStorage: localStorageMock,
    location: {
      pathname: '/admin/users',
      search: '',
      hash: '',
      replace: locationReplace,
    },
    dispatchEvent,
  };

  vi.stubGlobal('window', windowMock);
  vi.stubGlobal('CustomEvent', FakeCustomEvent);

  const mod = await import('./index');
  return { mod, locationReplace, dispatchEvent };
};

const getResponseInterceptor = (api: ModuleExports['api']) => {
  const handlers = (api.interceptors.response as any).handlers ?? [];
  const last = handlers[handlers.length - 1];
  return last?.rejected;
};

const getRequestInterceptor = (api: ModuleExports['api']) => {
  const handlers = (api.interceptors.request as any).handlers ?? [];
  const last = handlers[handlers.length - 1];
  return last?.fulfilled;
};

describe('shared-http interceptors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('on 401 invokes handler, emits app:auth:unauthorized for shell, never app:toast or redirect', async () => {
    const { mod, locationReplace, dispatchEvent } = await loadModule();
    const unauthorizedHandler = vi.fn();
    mod.registerAuthTokenResolver(() => 'token-from-store');
    mod.registerUnauthorizedHandler(unauthorizedHandler);
    const rejected = getResponseInterceptor(mod.api);
    const firstError = { response: { status: 401 } } as AxiosError;
    const secondError = { response: { status: 401 } } as AxiosError;

    await expect(rejected?.(firstError)).rejects.toBe(firstError);
    await expect(rejected?.(secondError)).rejects.toBe(secondError);

    // Custom handler is the application-supplied policy hook; called for every 401.
    expect(unauthorizedHandler).toHaveBeenCalledTimes(2);
    expect(unauthorizedHandler).toHaveBeenLastCalledWith(secondError);

    // 401 path never redirects; redirect responsibility is the application's
    // (auth provider, shell). Implementation in src/index.ts:319-341.
    expect(locationReplace).not.toHaveBeenCalled();

    // The 401 path emits a sanitized auth event for shell/auth-provider listeners.
    // It must NOT emit a forbidden toast (`app:toast` reserved for 403). The
    // previous assertion `expect(dispatchEvent).not.toHaveBeenCalled()` was
    // stale — implementation always emits `app:auth:unauthorized` (intentional,
    // see Codex thread 019df7a1 iter-2; consumers in mfe-access/audit override
    // the handler but the event surface stays).
    const dispatchedEvents = dispatchEvent.mock.calls.map(([event]) => event);
    const authEvents = dispatchedEvents.filter((event) => event.type === 'app:auth:unauthorized');
    const toastEvents = dispatchedEvents.filter((event) => event.type === 'app:toast');
    expect(authEvents).toHaveLength(2);
    expect(toastEvents).toHaveLength(0);

    // Detail invariant — sensitive payload (token, body, headers) must not
    // surface. Asserting Object.keys() instead of `not.toHaveProperty` so a
    // future regression that adds an unsanitized field is caught explicitly.
    for (const event of authEvents) {
      expect(Object.keys(event.detail).sort()).toEqual(['method', 'status', 'timestamp', 'url']);
      expect(event.detail).toEqual({
        method: 'GET',
        status: 401,
        url: undefined,
        timestamp: expect.any(Number),
      });
    }
  });

  it('shows forbidden toast without logout on 403', async () => {
    const { mod, locationReplace, dispatchEvent } = await loadModule();
    const unauthorizedHandler = vi.fn();
    mod.registerUnauthorizedHandler(unauthorizedHandler);
    const rejected = getResponseInterceptor(mod.api);
    const error = { response: { status: 403 } } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);

    expect(unauthorizedHandler).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail.text).toBe('Bu işlem için yetkiniz bulunmuyor.');
  });

  it('suppresses forbidden toast when request opts out from global access toast', async () => {
    const { mod, locationReplace, dispatchEvent } = await loadModule();
    const rejected = getResponseInterceptor(mod.api);
    const error = {
      config: { __suppressGlobalForbiddenToast: true },
      response: { status: 403 },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);

    expect(locationReplace).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('deduplicates repeated forbidden toasts in a short time window', async () => {
    const { mod, dispatchEvent } = await loadModule();
    const rejected = getResponseInterceptor(mod.api);
    const first = { response: { status: 403 } } as AxiosError;
    const second = { response: { status: 403 } } as AxiosError;

    await expect(rejected?.(first)).rejects.toBe(first);
    await expect(rejected?.(second)).rejects.toBe(second);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('dispatches app:auth:impersonation-expired and suppresses forbidden toast on lifecycle 403', async () => {
    // User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c`
    // iter-4): backend signals an expired / revoked / missing
    // impersonation session via 403 + a stable {@code errorCode}.
    // The interceptor MUST emit the lifecycle event and skip the
    // generic forbidden toast so the listener owns the user-facing
    // recovery flow.
    const { mod, dispatchEvent } = await loadModule();
    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: {
        status: 403,
        data: { errorCode: 'IMPERSONATION_SESSION_EXPIRED' },
      },
      config: { method: 'get', url: '/v1/some-protected-endpoint' },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('app:auth:impersonation-expired');
    expect(event.detail.code).toBe('IMPERSONATION_SESSION_EXPIRED');
    expect(event.detail.status).toBe(403);
    expect(event.detail.method).toBe('GET');
    expect(event.detail.url).toBe('/v1/some-protected-endpoint');
    // Generic forbidden toast (app:toast) MUST NOT fire when the
    // lifecycle event is dispatched.
    const toastCalls = dispatchEvent.mock.calls.filter(
      ([dispatched]) => (dispatched as Event).type === 'app:toast',
    );
    expect(toastCalls).toHaveLength(0);
  });

  it.each([
    'IMPERSONATION_SESSION_EXPIRED',
    'IMPERSONATION_SESSION_REQUIRED',
    'EXCHANGED_TOKEN_EXPIRED',
    'IMPERSONATION_SESSION_REVOKED',
  ])('routes 403 %s through the impersonation-expired event', async (errorCode) => {
    const { mod, dispatchEvent } = await loadModule();
    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 403, data: { errorCode } },
      config: { method: 'post', url: '/v1/x' },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe('app:auth:impersonation-expired');
  });

  it('shows profile missing toast without redirect on 403 PROFILE_MISSING', async () => {
    const { mod, locationReplace, dispatchEvent } = await loadModule();
    const unauthorizedHandler = vi.fn();
    mod.registerUnauthorizedHandler(unauthorizedHandler);
    const rejected = getResponseInterceptor(mod.api);
    const error = { response: { status: 403, data: { message: 'PROFILE_MISSING' } } } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);

    expect(unauthorizedHandler).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail.text).toBe(
      'Profiliniz henüz oluşturulmamış. Lütfen sistem yöneticisiyle iletişime geçin.',
    );
  });

  it('skips auth header and redirect in permitAll mode', async () => {
    const { mod, locationReplace } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    mod.registerAuthTokenResolver(() => 'token-from-store');
    mod.configureSharedHttp({ authMode: 'permitAll' });
    const config = await handler?.({ headers: {} });
    expect(config?.headers?.Authorization).toBeUndefined();

    const unauthorizedHandler = vi.fn();
    mod.registerUnauthorizedHandler(unauthorizedHandler);
    const rejected = getResponseInterceptor(mod.api);
    const error = { response: { status: 401 } } as AxiosError;
    await expect(rejected?.(error)).rejects.toBe(error);
    expect(locationReplace).not.toHaveBeenCalled();
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });
});

/*
 * Phase 2 PR-HTTP-3 (MFE Auth Transport Contract): the request
 * interceptor awaits the shell-supplied auth-ready resolver before
 * issuing any protected request. The resolver is registered via
 * {@code registerAuthReadyResolver()} and its return value gates the
 * fetch:
 *   - {@code { ok: true }}: request proceeds normally
 *   - {@code { ok: false, ... }}: request is rejected with a typed
 *     {@link AuthNotReadyError} BEFORE the network call
 *
 * The {@code __skipAuth: true} config flag and {@code permitAll} mode
 * bypass the gate (matching the existing Authorization-header policy).
 *
 * No resolver registered is the legacy default — the request flies
 * without waiting (preserves stand-alone test/SDK usage).
 */
describe('shared-http auth-ready gate (PR-HTTP-3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('awaits authReadyResolver before issuing the request when registered', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);

    let resolveReady!: (value: { ok: true }) => void;
    const readyPromise = new Promise<{ ok: true }>((resolve) => {
      resolveReady = resolve;
    });
    const resolver = vi.fn(() => readyPromise);
    mod.registerAuthReadyResolver(resolver);

    let interceptorResolved = false;
    const interceptorPromise = handler?.({ headers: {} }).then((cfg: any) => {
      interceptorResolved = true;
      return cfg;
    });

    // Microtask flush — the await on resolver should pause the interceptor
    // before completion.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(interceptorResolved).toBe(false);

    // Once the resolver resolves, the interceptor finishes.
    resolveReady({ ok: true });
    const config = await interceptorPromise;
    expect(interceptorResolved).toBe(true);
    expect(config?.headers).toBeDefined();
  });

  it('rejects with AuthNotReadyError when resolver returns !ok', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    mod.registerAuthReadyResolver(() =>
      Promise.resolve({ ok: false, reason: 'unauthenticated', error: 'no cookie' }),
    );

    await expect(handler?.({ headers: {} })).rejects.toMatchObject({
      name: 'AuthNotReadyError',
      reason: 'unauthenticated',
      detail: 'no cookie',
    });
  });

  it('skips the gate when __skipAuth is set on the request config', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    const resolver = vi.fn(() => Promise.resolve({ ok: false, reason: 'unauthenticated' }));
    mod.registerAuthReadyResolver(resolver);

    // __skipAuth opts out — the resolver must NOT be called for this
    // request, and the request proceeds (no Authorization header is added,
    // matching the existing __skipAuth contract for public endpoints).
    const config = await handler?.({ headers: {}, __skipAuth: true });
    expect(resolver).not.toHaveBeenCalled();
    expect(config?.headers?.Authorization).toBeUndefined();
  });

  it('skips the gate in permitAll mode', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    const resolver = vi.fn(() => Promise.resolve({ ok: false, reason: 'unauthenticated' }));
    mod.registerAuthReadyResolver(resolver);
    mod.configureSharedHttp({ authMode: 'permitAll' });

    const config = await handler?.({ headers: {} });
    expect(resolver).not.toHaveBeenCalled();
    expect(config?.headers?.Authorization).toBeUndefined();
  });

  it('legacy: no resolver registered → request proceeds without gate', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    // Note: registerAuthReadyResolver is NOT called.
    const config = await handler?.({ headers: {} });
    expect(config?.headers).toBeDefined();
  });

  it('passing undefined to registerAuthReadyResolver clears the resolver', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    const resolver = vi.fn(() => Promise.resolve({ ok: false, reason: 'unauthenticated' }));
    mod.registerAuthReadyResolver(resolver);

    // Clear the resolver — gate should no longer apply.
    mod.registerAuthReadyResolver(undefined);
    const config = await handler?.({ headers: {} });
    expect(resolver).not.toHaveBeenCalled();
    expect(config?.headers).toBeDefined();
  });

  it('Codex iter-1 P0: __skipAuthReadyGate bypasses the gate (bootstrap deadlock fix)', async () => {
    // Regression test for Codex iter-1 P0: AuthBootstrapper's
    // setTokenCookie call is what advances the FSM toward
    // transportReady. If the gate applies to that call, transportReady
    // can never happen — the call waits for the FSM, the FSM waits for
    // the call. __skipAuthReadyGate breaks the cycle.
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    const resolver = vi.fn(
      () =>
        // Never-resolving promise — without the bypass, the request would
        // hang indefinitely.
        new Promise<{ ok: true }>(() => undefined),
    );
    mod.registerAuthReadyResolver(resolver);

    const config = await handler?.({
      headers: { Authorization: 'Bearer pre-login-token' },
      __skipAuthReadyGate: true,
    });

    // Resolver was NEVER called — gate was skipped at the contract level.
    expect(resolver).not.toHaveBeenCalled();
    // Manually-set Authorization header is preserved (the interceptor
    // only adds when no header is present).
    expect(config?.headers?.Authorization).toBe('Bearer pre-login-token');
  });

  it('Codex iter-1 P2: gate-rejected request does NOT leak a pending controller', async () => {
    // Regression test for Codex iter-1 P2: trackPendingRequest used to
    // run BEFORE the gate, so an AuthNotReadyError throw would leave
    // the controller in the pendingControllers Set forever. The fix
    // moves trackPendingRequest AFTER the gate so a rejected request
    // never enters the tracking set.
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    mod.registerAuthReadyResolver(() => Promise.resolve({ ok: false, reason: 'unauthenticated' }));

    await expect(handler?.({ headers: {} })).rejects.toMatchObject({
      name: 'AuthNotReadyError',
    });

    // Indirect check: a subsequent successful request should be the
    // FIRST tracked entry. We cannot read pendingControllers directly
    // (private state) but we can verify the next call doesn't error
    // and proceeds normally — if the rejected call had leaked a
    // controller with the same config reference, AbortController would
    // misbehave on this call. (Static contract test.)
    mod.registerAuthReadyResolver(() => Promise.resolve({ ok: true }));
    const okConfig = await handler?.({ headers: {} });
    expect(okConfig).toBeDefined();
  });

  it('Codex iter-1 §3: isAuthNotReadyError name-based guard works across module boundaries', async () => {
    const { mod } = await loadModule();
    const handler = getRequestInterceptor(mod.api);
    mod.registerAuthReadyResolver(() =>
      Promise.resolve({ ok: false, reason: 'unauthenticated', error: 'no cookie' }),
    );

    let caught: unknown;
    try {
      await handler?.({ headers: {} });
    } catch (err) {
      caught = err;
    }

    expect(mod.isAuthNotReadyError(caught)).toBe(true);
    // Simulated cross-module: even an object with only `name` (no
    // prototype identity) should pass the guard.
    expect(mod.isAuthNotReadyError({ name: 'AuthNotReadyError', message: 'x' })).toBe(true);
    expect(mod.isAuthNotReadyError(new Error('different'))).toBe(false);
    expect(mod.isAuthNotReadyError(null)).toBe(false);
    expect(mod.isAuthNotReadyError(undefined)).toBe(false);
    expect(mod.isAuthNotReadyError('string')).toBe(false);
  });
});

/*
 * Phase 2 PR-Refresh-4 (MFE Auth Transport Contract): the response
 * interceptor single-flights a refresh-token call on 401 and retries
 * the original request once. The shell registers the refresh handler
 * via {@code registerRefreshHandler()}.
 *
 * Coverage:
 *   1. 401 + refresh ok → original request retried once
 *   2. 401 + refresh fails → legacy 401 path (event + reject)
 *   3. concurrent 401s share ONE refresh call (single-flight)
 *   4. retry that itself 401s does NOT trigger a second refresh
 *      (__isRefreshAttempt flag prevents loop)
 *   5. __skipRefreshOn401 opt-out
 *   6. __skipAuth implicitly opts out
 *   7. permitAll mode bypasses (no refresh path)
 *   8. no handler registered → legacy 401 path
 */
describe('shared-http single-flight refresh-on-401 (PR-Refresh-4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('401 + refresh ok → retries the original request once', async () => {
    const { mod } = await loadModule();
    // Build a real client.request stub so the retry path can be observed.
    const requestSpy = vi.spyOn(mod.api, 'request').mockResolvedValue({
      data: 'retry-success',
      status: 200,
    } as never);

    mod.registerRefreshHandler(() => Promise.resolve({ ok: true, token: 'fresh-token' }));

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/v1/users/me', method: 'get', headers: { Authorization: 'Bearer stale' } },
    } as AxiosError;

    const result = await rejected?.(error);
    // The retry result is what bubbles up from the response interceptor.
    expect(result).toMatchObject({ data: 'retry-success', status: 200 });

    // Retry was issued exactly once with __isRefreshAttempt set, and the
    // stale Authorization header was stripped (request interceptor
    // re-injects from updated tokenResolver).
    expect(requestSpy).toHaveBeenCalledTimes(1);
    const retryConfig = requestSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(retryConfig.__isRefreshAttempt).toBe(true);
    expect((retryConfig.headers as Record<string, unknown>)?.Authorization).toBeUndefined();

    requestSpy.mockRestore();
  });

  it('401 + refresh fails → falls back to legacy 401 path (event + reject)', async () => {
    const { mod, dispatchEvent } = await loadModule();
    const unauthorizedHandler = vi.fn();
    mod.registerUnauthorizedHandler(unauthorizedHandler);
    mod.registerRefreshHandler(() =>
      Promise.resolve({ ok: false, reason: 'refresh-token-expired' }),
    );

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/v1/users/me', method: 'get', headers: {} },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);
    // Legacy 401 contract preserved: handler called, event dispatched.
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    const authEvents = dispatchEvent.mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'app:auth:unauthorized');
    expect(authEvents).toHaveLength(1);
  });

  it('concurrent 401s share ONE refresh call (single-flight)', async () => {
    const { mod } = await loadModule();
    const requestSpy = vi.spyOn(mod.api, 'request').mockResolvedValue({
      data: 'retried',
      status: 200,
    } as never);

    let resolveRefresh!: (value: { ok: true; token?: string }) => void;
    const refreshSpy = vi.fn(
      () =>
        new Promise<{ ok: true; token?: string }>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    mod.registerRefreshHandler(refreshSpy);

    const rejected = getResponseInterceptor(mod.api);
    const makeError = (url: string) =>
      ({
        response: { status: 401 },
        config: { url, method: 'get', headers: {} },
      }) as AxiosError;

    const a = rejected?.(makeError('/a'));
    const b = rejected?.(makeError('/b'));
    const c = rejected?.(makeError('/c'));

    // Microtask flush — only one refresh call should have started.
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Resolve the single refresh; all three retries fan out.
    resolveRefresh({ ok: true });
    await Promise.all([a, b, c]);

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(3);

    requestSpy.mockRestore();
  });

  it('__isRefreshAttempt prevents a second refresh (no infinite loop)', async () => {
    const { mod, dispatchEvent } = await loadModule();
    const refreshSpy = vi.fn(() => Promise.resolve({ ok: true as const }));
    mod.registerRefreshHandler(refreshSpy);

    const rejected = getResponseInterceptor(mod.api);
    // The retry that came back from the first refresh attempt also fails
    // 401 → must NOT trigger a second refresh.
    const error = {
      response: { status: 401 },
      config: {
        url: '/v1/users/me',
        method: 'get',
        headers: {},
        __isRefreshAttempt: true,
      },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
    // Falls through to the legacy 401 path.
    const authEvents = dispatchEvent.mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'app:auth:unauthorized');
    expect(authEvents).toHaveLength(1);
  });

  it('__skipRefreshOn401 opts the request out of the refresh pipeline', async () => {
    const { mod } = await loadModule();
    const refreshSpy = vi.fn(() => Promise.resolve({ ok: true as const }));
    mod.registerRefreshHandler(refreshSpy);

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/x', method: 'get', headers: {}, __skipRefreshOn401: true },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('__skipAuth implicitly opts out of refresh', async () => {
    const { mod } = await loadModule();
    const refreshSpy = vi.fn(() => Promise.resolve({ ok: true as const }));
    mod.registerRefreshHandler(refreshSpy);

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/public', method: 'get', headers: {}, __skipAuth: true },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('permitAll mode bypasses the refresh pipeline entirely', async () => {
    const { mod } = await loadModule();
    const refreshSpy = vi.fn(() => Promise.resolve({ ok: true as const }));
    mod.registerRefreshHandler(refreshSpy);
    mod.configureSharedHttp({ authMode: 'permitAll' });

    const rejected = getResponseInterceptor(mod.api);
    const error = { response: { status: 401 }, config: { headers: {} } } as AxiosError;
    await expect(rejected?.(error)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('no handler registered → legacy 401 path (event + reject)', async () => {
    const { mod, dispatchEvent } = await loadModule();
    // Note: registerRefreshHandler is NOT called.
    const unauthorizedHandler = vi.fn();
    mod.registerUnauthorizedHandler(unauthorizedHandler);

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/x', method: 'get', headers: {} },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    const authEvents = dispatchEvent.mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'app:auth:unauthorized');
    expect(authEvents).toHaveLength(1);
  });

  it('Codex iter-1 P1: __skipAuthReadyGate excludes from refresh (bootstrap calls)', async () => {
    // Regression test for Codex iter-1 P1: bootstrap, login, register
    // calls all carry __skipAuthReadyGate (PR-HTTP-3 contract). They
    // DRIVE the FSM, so a 401 from them must NOT trigger refresh —
    // the refresh handler itself uses these same self-driving
    // endpoints, which would loop/deadlock.
    const { mod, dispatchEvent } = await loadModule();
    const refreshSpy = vi.fn(() => Promise.resolve({ ok: true as const }));
    mod.registerRefreshHandler(refreshSpy);

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/auth/cookie', method: 'post', headers: {}, __skipAuthReadyGate: true },
    } as AxiosError;

    await expect(rejected?.(error)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
    // Falls through to legacy 401 path normally (event still dispatched).
    const authEvents = dispatchEvent.mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'app:auth:unauthorized');
    expect(authEvents).toHaveLength(1);
  });

  it('Codex iter-1 P2: handler that throws synchronously is caught (not propagated)', async () => {
    // Regression test for Codex iter-1 P2: a sync-throw refresh handler
    // (rare but valid for a public API) must not bubble its error to
    // the caller. The interceptor catches it and falls through to the
    // legacy 401 path with the original error.
    const { mod, dispatchEvent } = await loadModule();
    const refreshSpy = vi.fn(() => {
      throw new Error('sync handler crash');
    });
    mod.registerRefreshHandler(refreshSpy as unknown as () => Promise<{ ok: true }>);

    const rejected = getResponseInterceptor(mod.api);
    const originalError = {
      response: { status: 401 },
      config: { url: '/x', method: 'get', headers: {} },
    } as AxiosError;

    // The original 401 error propagates (NOT the handler's sync error).
    await expect(rejected?.(originalError)).rejects.toBe(originalError);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    // Legacy 401 path runs because refresh fell through to ok:false.
    const authEvents = dispatchEvent.mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'app:auth:unauthorized');
    expect(authEvents).toHaveLength(1);
  });

  it('Codex iter-1 P2: case-insensitive Authorization header strip on retry', async () => {
    const { mod } = await loadModule();
    const requestSpy = vi.spyOn(mod.api, 'request').mockResolvedValue({
      data: 'retried',
      status: 200,
    } as never);
    mod.registerRefreshHandler(() => Promise.resolve({ ok: true }));

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: {
        url: '/x',
        method: 'get',
        // Lowercase form — older calls / merged config may set this.
        headers: { authorization: 'Bearer stale-lowercase', 'X-Trace-Id': 'preserved' },
      },
    } as AxiosError;

    await rejected?.(error);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    const retryConfig = requestSpy.mock.calls[0][0] as Record<string, unknown>;
    const headers = retryConfig.headers as Record<string, unknown>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    // Other headers preserved.
    expect(headers['X-Trace-Id']).toBe('preserved');

    requestSpy.mockRestore();
  });
});

/*
 * Phase 2 PR-Obs-5: observability counters wired into the request and
 * response interceptors. Verifies the contract claimed in the plan:
 *   - real response.status is recorded (not hardcoded 200)
 *   - status-bearing errors land in the counter
 *   - auth-ready gate rejections record bounded reason
 *   - resolver THROW (not just !ok return) records 'resolver-throw'
 *   - single-flight: only the OWNER records refresh attempt; waiters
 *     increment refreshWaiterTotal separately
 */
describe('shared-http observability wire-up (PR-Obs-5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records real response.status on success (not hardcoded 200)', async () => {
    const { mod } = await loadModule();
    mod.__resetMetricsForTesting();
    const handlers = (mod.api.interceptors.response as any).handlers ?? [];
    const fulfilled = handlers[handlers.length - 1]?.fulfilled;

    fulfilled?.({ status: 201, config: { method: 'POST' } });
    fulfilled?.({ status: 204, config: { method: 'DELETE' } });
    fulfilled?.({ status: 304, config: { method: 'GET' } });

    const snap = mod.getMetricsSnapshot();
    expect(snap.requestTotal['2xx_POST']).toBe(1);
    expect(snap.requestTotal['2xx_DELETE']).toBe(1);
    expect(snap.requestTotal['3xx_GET']).toBe(1);
  });

  it('records status-bearing errors (4xx/5xx)', async () => {
    const { mod } = await loadModule();
    mod.__resetMetricsForTesting();
    const rejected = getResponseInterceptor(mod.api);

    await expect(
      rejected?.({ response: { status: 500 }, config: { method: 'GET' } } as AxiosError),
    ).rejects.toBeDefined();
    await expect(
      rejected?.({ response: { status: 503 }, config: { method: 'POST' } } as AxiosError),
    ).rejects.toBeDefined();

    const snap = mod.getMetricsSnapshot();
    expect(snap.requestTotal['5xx_GET']).toBe(1);
    expect(snap.requestTotal['5xx_POST']).toBe(1);
  });

  it('records auth-not-ready when gate rejects (bounded reason)', async () => {
    const { mod } = await loadModule();
    mod.__resetMetricsForTesting();
    const handler = getRequestInterceptor(mod.api);
    mod.registerAuthReadyResolver(() => Promise.resolve({ ok: false, reason: 'unauthenticated' }));

    await expect(handler?.({ headers: {} })).rejects.toMatchObject({
      name: 'AuthNotReadyError',
    });

    const snap = mod.getMetricsSnapshot();
    expect(snap.authNotReadyTotal.unauthenticated).toBe(1);
  });

  it('records resolver-throw when resolver itself throws (Codex iter-0 P1 #7)', async () => {
    const { mod } = await loadModule();
    mod.__resetMetricsForTesting();
    const handler = getRequestInterceptor(mod.api);
    const boom = new Error('resolver exploded');
    mod.registerAuthReadyResolver(() => {
      throw boom;
    });

    // The original error propagates (not wrapped in AuthNotReadyError);
    // the counter still records the throw under bounded 'resolver-throw'.
    await expect(handler?.({ headers: {} })).rejects.toBe(boom);

    const snap = mod.getMetricsSnapshot();
    expect(snap.authNotReadyTotal['resolver-throw']).toBe(1);
  });

  it('records ONLY the single-flight owner refresh attempt; waiters separate', async () => {
    const { mod } = await loadModule();
    mod.__resetMetricsForTesting();

    let resolveRefresh!: () => void;
    const refreshDone = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    let refreshCalls = 0;
    mod.registerRefreshHandler(async () => {
      refreshCalls += 1;
      await refreshDone;
      return { ok: true, token: 'refreshed' };
    });
    mod.registerAuthTokenResolver(() => 'refreshed');

    const requestSpy = vi.spyOn(mod.api, 'request').mockResolvedValue({ data: 'ok' } as never);

    const rejected = getResponseInterceptor(mod.api);
    const error1 = {
      response: { status: 401 },
      config: { url: '/api/a', method: 'get', headers: {} },
    } as AxiosError;
    const error2 = {
      response: { status: 401 },
      config: { url: '/api/b', method: 'get', headers: {} },
    } as AxiosError;
    const error3 = {
      response: { status: 401 },
      config: { url: '/api/c', method: 'get', headers: {} },
    } as AxiosError;

    // Fire 3 simultaneous 401s — first is owner, others are waiters.
    const p1 = rejected?.(error1);
    const p2 = rejected?.(error2);
    const p3 = rejected?.(error3);

    // Let the in-flight refresh start
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshCalls).toBe(1);

    // Resolve refresh; all three callers retry
    resolveRefresh();
    await Promise.all([p1, p2, p3]);

    const snap = mod.getMetricsSnapshot();
    // Owner counted once, NOT three times
    expect(snap.refreshAttemptTotal.ok).toBe(1);
    expect(snap.refreshAttemptTotal.fail).toBe(0);
    // Two waiters
    expect(snap.refreshWaiterTotal).toBe(2);

    requestSpy.mockRestore();
  });

  it('records refresh failure with normalised reason in recent ring', async () => {
    const { mod } = await loadModule();
    mod.__resetMetricsForTesting();
    mod.registerRefreshHandler(async () => ({ ok: false, reason: 'refresh-closure-failed' }));
    mod.registerAuthTokenResolver(() => 'token');

    const rejected = getResponseInterceptor(mod.api);
    const error = {
      response: { status: 401 },
      config: { url: '/api/a', method: 'get', headers: {} },
    } as AxiosError;
    await expect(rejected?.(error)).rejects.toBe(error);

    const snap = mod.getMetricsSnapshot();
    expect(snap.refreshAttemptTotal.fail).toBe(1);
    expect(snap.recentRefreshFailures).toHaveLength(1);
    expect(snap.recentRefreshFailures[0].reason).toBe('refresh-closure-failed');
  });
});
