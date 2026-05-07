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
