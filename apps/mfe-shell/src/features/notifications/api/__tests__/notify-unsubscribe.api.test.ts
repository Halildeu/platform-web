// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { notifyUnsubscribeApi } from '../notify-unsubscribe.api';

/**
 * Faz 23.5 M5 G3 — RTK Query slice tests for the public unsubscribe
 * landing endpoint.
 *
 * <p>Mirrors {@code notify-prefs.api.test.ts} stub-global-fetch pattern
 * but the surface is simpler (single GET endpoint, no auth headers,
 * no tag invalidation). Tests cover URL shape, query param encoding,
 * success-state mapping, and error-status pass-through.
 */

interface RequestRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function buildStore() {
  return configureStore({
    reducer: {
      [notifyUnsubscribeApi.reducerPath]: notifyUnsubscribeApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(notifyUnsubscribeApi.middleware),
  });
}

function recordedFetch(records: RequestRecord[], response: { status: number; body?: unknown }) {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    records.push({ url, method, headers });
    const status = response.status;
    return new Response(response.body !== undefined ? JSON.stringify(response.body) : '', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('notifyUnsubscribeApi (Faz 23.5 M5 G3)', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLocation = window.location;
    // Override window.location.origin so the baseUrl resolver picks up
    // a predictable host (Vitest jsdom default is http://localhost:3000).
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.example.com'),
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('redeemUnsubscribeToken issues GET to /api/v1/notify/unsubscribe with token query param', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 200,
      body: { status: 'unsubscribed' },
    });

    const store = buildStore();
    const result = await store.dispatch(
      notifyUnsubscribeApi.endpoints.redeemUnsubscribeToken.initiate('test-hmac-token'),
    );

    expect(result.data).toEqual({ status: 'unsubscribed' });
    expect(records).toHaveLength(1);
    expect(records[0].method).toBe('GET');
    expect(records[0].url).toContain('/api/v1/notify/unsubscribe');
    expect(records[0].url).toContain('token=test-hmac-token');
  });

  it('URL-encodes special characters in the token', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 200,
      body: { status: 'unsubscribed' },
    });

    const store = buildStore();
    await store.dispatch(
      notifyUnsubscribeApi.endpoints.redeemUnsubscribeToken.initiate('a+b/c=d&e'),
    );

    // RTK Query / fetchBaseQuery uses URLSearchParams which encodes
    // + → %2B, / → %2F, = → %3D, & → %26
    expect(records[0].url).toContain('token=a%2Bb%2Fc%3Dd%26e');
  });

  it('surfaces HTTP 401 (invalid token) as RTK Query error with status field', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 401,
      body: { error: 'Unauthorized' },
    });

    const store = buildStore();
    const result = await store.dispatch(
      notifyUnsubscribeApi.endpoints.redeemUnsubscribeToken.initiate('bad-token'),
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect((result.error as { status: number }).status).toBe(401);
  });

  it('surfaces HTTP 410 (expired token) as RTK Query error', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 410,
      body: { error: 'Token expired' },
    });

    const store = buildStore();
    const result = await store.dispatch(
      notifyUnsubscribeApi.endpoints.redeemUnsubscribeToken.initiate('expired-token'),
    );

    expect((result.error as { status: number }).status).toBe(410);
  });

  it('does not attach Authorization or X-Org-Id headers (public endpoint)', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 200,
      body: { status: 'unsubscribed' },
    });

    const store = buildStore();
    await store.dispatch(
      notifyUnsubscribeApi.endpoints.redeemUnsubscribeToken.initiate('any-token'),
    );

    // Public unsubscribe is HMAC-token-authenticated; no user identity
    // headers should leak from this slice into the request.
    expect(records[0].headers['authorization']).toBeUndefined();
    expect(records[0].headers['x-org-id']).toBeUndefined();
    expect(records[0].headers['x-subscriber-id']).toBeUndefined();
  });
});
