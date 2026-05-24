// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unwrapRequestFetchFn } from '../unwrap-request-fetch-fn';

/**
 * unwrapRequestFetchFn (endpoint-admin local copy) — `Request`-object
 * header-drop workaround.
 *
 * Mirrors the notify-domain shim test
 * (`apps/mfe-shell/src/features/notifications/api/__tests__/notify-request-fetch-fn.test.ts`,
 * platform-web #652 `07805aa`). Faz 22 ALLOW-path browser smoke
 * (2026-05-24) caught the same wire-layer drop on `endpointAdminApi`
 * — see `../unwrap-request-fetch-fn.ts` doc comment for live evidence.
 *
 * The endpoint-admin client is GET-only today, but we include the
 * non-GET body forwarding case from the notify shim for parity so
 * future POST/PATCH mutations carry payload correctly.
 */
describe('unwrapRequestFetchFn (endpoint-admin) — Request→string header-drop workaround', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('unwraps a Request to a string-URL fetch with headers preserved', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    const req = new Request('https://testai.acik.com/api/v1/endpoint-admin/endpoint-devices', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok-9001', Accept: 'application/json' },
    });
    await unwrapRequestFetchFn(req);

    expect(calls).toHaveLength(1);
    // The wire-layer header drop only triggers on the Request-object form,
    // so the re-issue MUST be a plain string URL — never a Request.
    expect(typeof calls[0].input).toBe('string');
    expect(calls[0].input).toBe('https://testai.acik.com/api/v1/endpoint-admin/endpoint-devices');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-9001');
    expect(headers.accept).toBe('application/json');
  });

  it('forwards a non-Request input (string URL) unchanged', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    const init: RequestInit = {
      method: 'GET',
      headers: { Authorization: 'Bearer tok-9001' },
    };
    await unwrapRequestFetchFn('https://testai.acik.com/api/v1/endpoint-agents/status', init);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('https://testai.acik.com/api/v1/endpoint-agents/status');
    expect(calls[0].init).toBe(init);
  });

  it('forwards the body for a non-GET Request (parity with notify shim)', async () => {
    const calls: { init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    const req = new Request(
      'https://testai.acik.com/api/v1/endpoint-admin/endpoint-commands/x/approval',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      },
    );
    await unwrapRequestFetchFn(req);

    expect(calls).toHaveLength(1);
    expect((calls[0].init?.method ?? '').toUpperCase()).toBe('POST');
    expect(calls[0].init?.body).toBeDefined();
  });

  it('preserves AbortSignal for RTK Query timeout/cancel', async () => {
    const calls: { init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    const ac = new AbortController();
    const req = new Request('https://testai.acik.com/api/v1/endpoint-agents/status', {
      method: 'GET',
      signal: ac.signal,
    });
    await unwrapRequestFetchFn(req);

    expect(calls).toHaveLength(1);
    expect(calls[0].init?.signal).toBe(req.signal);
  });
});
