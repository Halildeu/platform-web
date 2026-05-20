// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore, type Action, type Reducer } from '@reduxjs/toolkit';
import { notifyTopicCatalogApi } from '../notify-topic-catalog.api';

/**
 * Faz 23.5 M5 G3b — RTK Query slice tests for the topic catalog
 * endpoint.
 *
 * <p>Mirrors notify-prefs.api.test.ts pattern: stub global fetch,
 * configure a minimal store with the auth slice fixture so
 * {@code prepareHeaders} can resolve Bearer + identity headers.
 */

interface RequestRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const IDENTITY = { orgId: 'default', subscriberId: 'sub-1' };
const AUTH_TOKEN = 'stub-jwt';

// Mirror the full auth slice shape from notify-prefs.api.test.ts so
// selectAuthToken + selectNotifyIdentity resolve correctly.
function buildAuthState() {
  return {
    user: {
      id: 'profile-1',
      email: 'admin@example.com',
      role: 'ADMIN' as const,
      permissions: [] as string[],
      orgId: IDENTITY.orgId,
      subscriberId: IDENTITY.subscriberId,
    },
    token: AUTH_TOKEN,
    status: 'idle' as const,
    error: null,
    registrationStatus: 'idle' as const,
    lastRegisteredEmail: null,
    expiresAt: null,
    initialized: true,
    phase: 'transportReady' as const,
    authError: null,
    authEpoch: 0,
    authzSnapshot: null,
  };
}

const authReducer: Reducer<ReturnType<typeof buildAuthState>, Action> = (
  state = buildAuthState(),
) => state;

function buildStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      [notifyTopicCatalogApi.reducerPath]: notifyTopicCatalogApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(notifyTopicCatalogApi.middleware),
  });
}

function recordedFetch(records: RequestRecord[], response: { status: number; body?: unknown }) {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    // RTK Query passes a Request object (not init separately) — headers
    // live on input.headers, not init.headers, when input is a Request.
    const url = input instanceof Request ? input.url : String(input);
    const method = input instanceof Request ? input.method : ((init?.method ?? 'GET') as string);
    const headers: Record<string, string> = {};
    const sourceHeaders = input instanceof Request ? input.headers : new Headers(init?.headers);
    sourceHeaders.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    records.push({ url, method: method.toUpperCase(), headers });
    return new Response(response.body !== undefined ? JSON.stringify(response.body) : '', {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('notifyTopicCatalogApi (Faz 23.5 M5 G3b)', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLocation = window.location;
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

  it('listTopicCatalog issues GET to /api/v1/notify/topics/me with identity headers', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 200,
      body: {
        items: [
          {
            topicKey: 'auth.mfa-otp',
            label: 'MFA OTP Kodu',
            category: 'auth',
            supportedChannels: ['SMS', 'EMAIL'],
            criticalEligible: true,
            description: 'OTP',
            defaultFrequencyHint: null,
          },
        ],
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      notifyTopicCatalogApi.endpoints.listTopicCatalog.initiate(),
    );

    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0].topicKey).toBe('auth.mfa-otp');
    expect(records).toHaveLength(1);
    expect(records[0].method).toBe('GET');
    expect(records[0].url).toContain('/api/v1/notify/topics/me');
    expect(records[0].headers['authorization']).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(records[0].headers['x-org-id']).toBe(IDENTITY.orgId);
    expect(records[0].headers['x-subscriber-id']).toBe(IDENTITY.subscriberId);
  });

  it('returns empty items[] when backend returns empty catalog (frontend fallback signal)', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 200,
      body: { items: [] },
    });

    const store = buildStore();
    const result = await store.dispatch(
      notifyTopicCatalogApi.endpoints.listTopicCatalog.initiate(),
    );

    expect(result.data?.items).toEqual([]);
  });

  it('surfaces HTTP 401 as RTK Query error', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 401,
      body: { error: 'Unauthenticated' },
    });

    const store = buildStore();
    const result = await store.dispatch(
      notifyTopicCatalogApi.endpoints.listTopicCatalog.initiate(),
    );

    expect(result.data).toBeUndefined();
    expect((result.error as { status: number }).status).toBe(401);
  });

  it('shares cache for repeat dispatches via TopicCatalog/LIST tag', async () => {
    const records: RequestRecord[] = [];
    globalThis.fetch = recordedFetch(records, {
      status: 200,
      body: { items: [] },
    });

    const store = buildStore();
    await store.dispatch(notifyTopicCatalogApi.endpoints.listTopicCatalog.initiate());
    await store.dispatch(notifyTopicCatalogApi.endpoints.listTopicCatalog.initiate());

    // Second dispatch should hit cache, not refetch.
    expect(records).toHaveLength(1);
  });
});
