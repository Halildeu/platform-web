// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unwrapRequestFetchFn } from '../notify-request-fetch-fn';

/**
 * unwrapRequestFetchFn — `Request`-object header-drop workaround
 * (Codex 019e075d iter-7; shared-module extraction Codex 019e50ac/019e5112).
 *
 * The notify RTK clients (inbox / preferences / push) wire this as their
 * fetchBaseQuery `fetchFn`. RTK Query 2.x defaults to `fetch(new Request(
 * url, init))`; a wire-layer drop between the frontend nginx and the
 * orchestrator loses headers on that form. This fetchFn re-issues the call
 * in string-URL form so Authorization + identity headers survive.
 */
describe('unwrapRequestFetchFn — Request→string header-drop workaround', () => {
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

    const req = new Request('https://testai.acik.com/api/v1/notify/preferences/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok-123', 'X-Org-Id': 'default' },
    });
    await unwrapRequestFetchFn(req);

    expect(calls).toHaveLength(1);
    // The wire-layer header drop only triggers on the Request-object form,
    // so the re-issue MUST be a plain string URL — never a Request.
    expect(typeof calls[0].input).toBe('string');
    expect(calls[0].input).toBe('https://testai.acik.com/api/v1/notify/preferences/me');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-123');
    expect(headers['x-org-id']).toBe('default');
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

    const init: RequestInit = { method: 'GET', headers: { Authorization: 'Bearer t' } };
    await unwrapRequestFetchFn('https://example.com/x', init);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('https://example.com/x');
    expect(calls[0].init).toBe(init);
  });

  it('forwards the body for a non-GET Request', async () => {
    const calls: { init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    const req = new Request('https://testai.acik.com/api/v1/notify/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpointUrl: 'https://webpush-smoke.invalid/p' }),
    });
    await unwrapRequestFetchFn(req);

    expect(calls).toHaveLength(1);
    expect((calls[0].init?.method ?? '').toUpperCase()).toBe('POST');
    expect(calls[0].init?.body).toBeDefined();
  });
});
