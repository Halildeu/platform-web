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
