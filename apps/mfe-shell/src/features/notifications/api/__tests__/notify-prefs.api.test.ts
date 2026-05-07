// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { notifyPrefsApi } from '../notify-prefs.api';
import type { PreferenceDto } from '../notify-prefs.types';

/**
 * Faz 23.5 PR3 — RTK Query slice tests for the preference REST surface.
 *
 * Mirrors the inbox API test pattern: stub global fetch via
 * vi.stubGlobal so RTK Query's Request shape is honored. Tests cover
 * list/upsert/delete URL+method+headers+credentials, plus tag
 * invalidation behavior (mutation triggers list refetch).
 */

const IDENTITY = { orgId: 'default', subscriberId: 'sub-1' };

interface RequestRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
  credentials?: RequestCredentials;
  body?: string | null;
}

const buildPref = (overrides: Partial<PreferenceDto> = {}): PreferenceDto => ({
  id: 1,
  topicKey: 'report.export.ready',
  channel: 'email',
  enabled: true,
  quietHours: null,
  frequencyLimitPerDay: null,
  bypassForCritical: true,
  createdAt: '2026-05-07T08:00:00Z',
  updatedAt: '2026-05-07T08:00:00Z',
  ...overrides,
});

const buildStore = () =>
  configureStore({
    reducer: { [notifyPrefsApi.reducerPath]: notifyPrefsApi.reducer },
    middleware: (gdm) => gdm().concat(notifyPrefsApi.middleware),
  });

let recorded: RequestRecord[] = [];
let fetchHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  recorded = [];
  fetchHandler = makeDefaultHandler();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      let url: string;
      let method: string;
      let headers: Record<string, string>;
      let credentials: RequestCredentials | undefined;
      let body: string | null;
      if (input instanceof Request) {
        url = input.url;
        method = input.method.toUpperCase();
        headers = headersToRecord(input.headers);
        credentials = input.credentials;
        body = await input.clone().text();
      } else {
        url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : String(input);
        method = (init?.method ?? 'GET').toUpperCase();
        headers = headersToRecord(init?.headers);
        credentials = init?.credentials;
        body = typeof init?.body === 'string' ? init.body : null;
      }
      recorded.push({ url, method, headers, credentials, body });
      return fetchHandler(input, init);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifyPrefsApi.listPreferences', () => {
  it('returns the seed list with identity headers + credentials include', async () => {
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.listPreferences.initiate(IDENTITY),
    );
    expect(result.status).toBe('fulfilled');
    expect(result.data).toHaveLength(2);
    const req = recorded[0];
    expect(req.headers['x-org-id']).toBe('default');
    expect(req.headers['x-subscriber-id']).toBe('sub-1');
    expect(req.credentials).toBe('include');
    expect(req.url).toContain('/api/v1/notify/preferences/me');
  });
});

describe('notifyPrefsApi.upsertPreference', () => {
  it('PUTs the body without identity fields and invalidates LIST', async () => {
    const store = buildStore();

    // Prime list cache.
    await store.dispatch(notifyPrefsApi.endpoints.listPreferences.initiate(IDENTITY));
    expect(recorded.filter((r) => r.method === 'GET').length).toBe(1);

    const args = {
      ...IDENTITY,
      topicKey: 'system.maintenance',
      channel: 'email',
      enabled: false,
      quietHours: { start: '22:00' },
      frequencyLimitPerDay: 0,
      bypassForCritical: true,
    };
    const result = await store.dispatch(notifyPrefsApi.endpoints.upsertPreference.initiate(args));
    expect('data' in result && result.data?.id).toBeDefined();

    const putReq = recorded.find((r) => r.method === 'PUT');
    expect(putReq).toBeDefined();
    expect(putReq?.url).toContain('/api/v1/notify/preferences/me');
    expect(putReq?.headers['x-org-id']).toBe('default');
    // Identity fields should NOT be in the body — only DTO fields.
    expect(putReq?.body ?? '').not.toContain('"orgId"');
    expect(putReq?.body ?? '').toContain('"enabled":false');
    expect(putReq?.body ?? '').toContain('"topicKey":"system.maintenance"');

    // List re-fetched because LIST tag was invalidated.
    await store.dispatch(
      notifyPrefsApi.endpoints.listPreferences.initiate(IDENTITY, { forceRefetch: true }),
    );
    const refetches = recorded.filter((r) => r.method === 'GET').length;
    expect(refetches).toBeGreaterThanOrEqual(2);
  });

  it('returns 400 when enabled is missing (backend @NotNull)', async () => {
    fetchHandler = async () =>
      jsonResponse({ error: 'validation', message: 'enabled is required' }, 400);
    const store = buildStore();
    const args = {
      ...IDENTITY,
      topicKey: 'foo',
      channel: 'bar',
      // enabled deliberately omitted at the wire level — but the type
      // makes this a TS error; cast through unknown to simulate a
      // backend rejection.
    } as unknown as Parameters<typeof notifyPrefsApi.endpoints.upsertPreference.initiate>[0];
    const result = await store.dispatch(notifyPrefsApi.endpoints.upsertPreference.initiate(args));
    expect('error' in result && (result.error as { status: number }).status).toBe(400);
  });
});

describe('notifyPrefsApi.deletePreference', () => {
  it('DELETEs by id and invalidates LIST', async () => {
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.deletePreference.initiate({ ...IDENTITY, id: 42 }),
    );
    expect('data' in result || result.status === 'fulfilled').toBe(true);
    const delReq = recorded.find((r) => r.method === 'DELETE');
    expect(delReq?.url).toMatch(/\/api\/v1\/notify\/preferences\/me\/42$/);
    expect(delReq?.headers['x-subscriber-id']).toBe('sub-1');
  });

  it('surfaces 404 when service returns false', async () => {
    fetchHandler = async () => new Response(null, { status: 404 });
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.deletePreference.initiate({ ...IDENTITY, id: 999 }),
    );
    expect('error' in result && (result.error as { status: number }).status).toBe(404);
  });
});

describe('notifyPrefsApi.restoreDefaults (Faz 23.6 PR-C1)', () => {
  it('DELETEs /me with identity headers, no body, and invalidates LIST', async () => {
    fetchHandler = async () => jsonResponse({ deletedCount: 3 });
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.restoreDefaults.initiate(IDENTITY),
    );
    expect('data' in result).toBe(true);
    expect((result as { data?: { deletedCount: number } }).data?.deletedCount).toBe(3);

    const delReq = recorded.find((r) => r.method === 'DELETE');
    expect(delReq?.url).toMatch(/\/api\/v1\/notify\/preferences\/me$/);
    expect(delReq?.url).not.toMatch(/\/me\/\d+$/);
    expect(delReq?.headers['x-org-id']).toBe('default');
    expect(delReq?.headers['x-subscriber-id']).toBe('sub-1');
    expect(delReq?.credentials).toBe('include');
    expect(delReq?.body).toBeFalsy();
  });

  it('forwards 503 (preferences disabled) as a typed error', async () => {
    fetchHandler = async () =>
      jsonResponse({ error: 'preferences_disabled', message: 'feature off' }, 503);
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.restoreDefaults.initiate(IDENTITY),
    );
    expect('error' in result && (result.error as { status: number }).status).toBe(503);
  });

  it('forwards 403 (org / subscriber boundary mismatch)', async () => {
    fetchHandler = async () => new Response(null, { status: 403 });
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.restoreDefaults.initiate(IDENTITY),
    );
    expect('error' in result && (result.error as { status: number }).status).toBe(403);
  });

  it('refetches the list after a successful restore (LIST tag invalidation)', async () => {
    let listFetchCount = 0;
    fetchHandler = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : String(input);
      const method =
        input instanceof Request
          ? input.method.toUpperCase()
          : (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && /\/preferences\/me$/.test(url)) {
        listFetchCount += 1;
        return jsonResponse([buildPref({ id: 1 })]);
      }
      if (method === 'DELETE' && /\/preferences\/me$/.test(url)) {
        return jsonResponse({ deletedCount: 5 });
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    };

    const store = buildStore();
    const sub = store.dispatch(notifyPrefsApi.endpoints.listPreferences.initiate(IDENTITY));
    await sub;
    expect(listFetchCount).toBe(1);

    await store.dispatch(notifyPrefsApi.endpoints.restoreDefaults.initiate(IDENTITY));
    await sub.refetch();
    expect(listFetchCount).toBeGreaterThanOrEqual(2);
    sub.unsubscribe();
  });
});

describe('notifyPrefsApi.muteChannel (Faz 23.6 PR-C2)', () => {
  it('POSTs /me/mute-channel with channel body, identity headers, and credentials include', async () => {
    fetchHandler = async () =>
      jsonResponse({ channel: 'email', muted: true, deletedOverrideCount: 3, shadowDenyCount: 2 });
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.muteChannel.initiate({ ...IDENTITY, channel: 'email' }),
    );
    expect('data' in result).toBe(true);
    expect((result as { data?: { deletedOverrideCount: number } }).data?.deletedOverrideCount).toBe(
      3,
    );
    expect((result as { data?: { shadowDenyCount: number } }).data?.shadowDenyCount).toBe(2);

    const postReq = recorded.find((r) => r.method === 'POST');
    expect(postReq?.url).toMatch(/\/api\/v1\/notify\/preferences\/me\/mute-channel$/);
    expect(postReq?.headers['x-org-id']).toBe('default');
    expect(postReq?.headers['x-subscriber-id']).toBe('sub-1');
    expect(postReq?.credentials).toBe('include');
    expect(postReq?.body).toBeTruthy();
    expect(JSON.parse(postReq?.body ?? '{}')).toEqual({ channel: 'email' });
  });

  it('forwards 400 (unknown channel) as a typed error', async () => {
    fetchHandler = async () =>
      jsonResponse(
        {
          error: 'validation',
          message: 'channel must be one of email, sms, slack, webhook, in-app',
        },
        400,
      );
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.muteChannel.initiate({ ...IDENTITY, channel: 'smoke-signal' }),
    );
    expect('error' in result && (result.error as { status: number }).status).toBe(400);
  });

  it('forwards 403 (org / subscriber boundary)', async () => {
    fetchHandler = async () => new Response(null, { status: 403 });
    const store = buildStore();
    const result = await store.dispatch(
      notifyPrefsApi.endpoints.muteChannel.initiate({ ...IDENTITY, channel: 'email' }),
    );
    expect('error' in result && (result.error as { status: number }).status).toBe(403);
  });

  it('refetches the list after a successful mute-channel (LIST tag)', async () => {
    let listFetchCount = 0;
    fetchHandler = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : String(input);
      const method =
        input instanceof Request
          ? input.method.toUpperCase()
          : (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && /\/preferences\/me$/.test(url)) {
        listFetchCount += 1;
        return jsonResponse([buildPref({ id: 1 })]);
      }
      if (method === 'POST' && /\/preferences\/me\/mute-channel$/.test(url)) {
        return jsonResponse({
          channel: 'email',
          muted: true,
          deletedOverrideCount: 0,
          shadowDenyCount: 0,
        });
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    };

    const store = buildStore();
    const sub = store.dispatch(notifyPrefsApi.endpoints.listPreferences.initiate(IDENTITY));
    await sub;
    expect(listFetchCount).toBe(1);

    // Codex thread `019e03d1` REVISE iter-2 absorb: do NOT call
    // `sub.refetch()` manually — that would only prove the helper
    // works, not that `invalidatesTags: LIST` triggers an automatic
    // refetch on the active subscription. Wait for RTK Query's own
    // refetch tick instead, then assert the count went up.
    await store.dispatch(
      notifyPrefsApi.endpoints.muteChannel.initiate({ ...IDENTITY, channel: 'email' }),
    );
    // RTK Query refires the list query because the LIST tag was
    // invalidated by the mutation. Microtask + macrotask boundary so
    // the dispatched re-subscribe lands.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(listFetchCount).toBeGreaterThanOrEqual(2);
    sub.unsubscribe();
  });
});

// ─── Test helpers ────────────────────────────────────────────────────────

function headersToRecord(input: HeadersInit | undefined): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  if (input instanceof Headers) {
    input.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(input)) {
    for (const [k, v] of input) out[k.toLowerCase()] = v;
    return out;
  }
  for (const [k, v] of Object.entries(input as Record<string, string>)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeDefaultHandler() {
  const seed: PreferenceDto[] = [
    buildPref({ id: 1, topicKey: 'report.export.ready', channel: 'email' }),
    buildPref({ id: 2, topicKey: null, channel: null, enabled: false }),
  ];

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    const method =
      input instanceof Request ? input.method.toUpperCase() : (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && /\/preferences\/me$/.test(url)) {
      return jsonResponse(seed);
    }
    if (method === 'PUT' && /\/preferences\/me$/.test(url)) {
      return jsonResponse(buildPref({ id: 99, enabled: false }));
    }
    if (method === 'DELETE' && /\/preferences\/me\/\d+$/.test(url)) {
      return new Response(null, { status: 204 });
    }
    return jsonResponse({ error: 'unhandled', url, method }, 500);
  };
}
