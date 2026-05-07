// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { notifyInboxApi } from '../notify-inbox.api';
import type { InboxItemDto, InboxListResponseDto, UnreadCountDto } from '../notify-inbox.types';

/**
 * Faz 23.4 PR-E.5 frontend identity bootstrap — RTK Query slice tests.
 *
 * Verifies:
 * - listInbox returns paged data + unreadCount in one response
 * - getUnreadCount lightweight badge endpoint
 * - markRead flips state + invalidates list/badge cache (re-fetch)
 * - archive removes the row from the active list
 * - X-Org-Id / X-Subscriber-Id headers flow through to fetch
 * - credentials: 'include' is set so the gateway httpOnly JWT cookie travels
 *
 * Pattern: stub global {@code fetch} via {@code vi.fn()} — MSW isn't a
 * workspace devDep yet, and the tests don't need a full service worker
 * to verify URL/headers/method/body. The stub returns canned responses
 * keyed by URL+method, captures the request init, and asserts on it.
 */

const IDENTITY = { orgId: 'default', subscriberId: 'sub-1' };

interface RequestRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
  credentials?: RequestCredentials;
}

const buildRow = (overrides: Partial<InboxItemDto>): InboxItemDto => ({
  id: 0,
  orgId: 'default',
  subscriberId: 'sub-1',
  intentId: null,
  topicKey: 'test.topic',
  severity: 'info',
  createdAt: new Date('2026-05-07T08:00:00Z').toISOString(),
  updatedAt: new Date('2026-05-07T08:00:00Z').toISOString(),
  state: 'UNREAD',
  preview: null,
  meta: null,
  ...overrides,
});

const buildStore = () =>
  configureStore({
    reducer: { [notifyInboxApi.reducerPath]: notifyInboxApi.reducer },
    middleware: (gdm) => gdm().concat(notifyInboxApi.middleware),
  });

let recorded: RequestRecord[] = [];
let fetchHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  recorded = [];
  // Default handler: list = 3 seed rows; everything else inferred at call time.
  fetchHandler = makeDefaultHandler();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      // RTK Query's fetchBaseQuery wraps the call into a Request object and
      // passes it as the only argument; init is undefined in that path.
      // Native fetch callers may use (url, init) instead. Support both.
      let url: string;
      let method: string;
      let headers: Record<string, string>;
      let credentials: RequestCredentials | undefined;
      if (input instanceof Request) {
        url = input.url;
        method = input.method.toUpperCase();
        headers = headersToRecord(input.headers);
        credentials = input.credentials;
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
      }
      recorded.push({ url, method, headers, credentials });
      return fetchHandler(input, init);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifyInboxApi.listInbox', () => {
  it('returns paged active rows + unreadCount + sets identity headers', async () => {
    const store = buildStore();
    const result = await store.dispatch(notifyInboxApi.endpoints.listInbox.initiate(IDENTITY));
    expect(result.status).toBe('fulfilled');
    expect(result.data?.items).toHaveLength(3);
    expect(result.data?.unreadCount).toBe(2);
    // Newest-first per backend ordering (most recent createdAt first).
    expect(result.data?.items[0].id).toBe(2);
    expect(result.data?.items[1].id).toBe(1);

    // Identity headers + cookie credentials flow through.
    const req = recorded[0];
    expect(req.headers['x-org-id']).toBe('default');
    expect(req.headers['x-subscriber-id']).toBe('sub-1');
    expect(req.credentials).toBe('include');
    expect(req.url).toContain('/api/v1/notify/inbox/me');
    expect(req.url).toContain('page=0');
    expect(req.url).toContain('size=20');
  });

  it('respects custom pagination args', async () => {
    const store = buildStore();
    const result = await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({ ...IDENTITY, page: 1, size: 2 }),
    );
    expect(result.status).toBe('fulfilled');
    const req = recorded[0];
    expect(req.url).toContain('page=1');
    expect(req.url).toContain('size=2');
  });
});

describe('notifyInboxApi.getUnreadCount', () => {
  it('returns the badge count via lightweight endpoint', async () => {
    const store = buildStore();
    const result = await store.dispatch(notifyInboxApi.endpoints.getUnreadCount.initiate(IDENTITY));
    expect(result.status).toBe('fulfilled');
    expect(result.data?.unreadCount).toBe(2);
    expect(recorded[0].url).toContain('/api/v1/notify/inbox/me/unread-count');
  });
});

describe('notifyInboxApi.markRead', () => {
  it('POSTs to /{id}/read and invalidates the list cache', async () => {
    const store = buildStore();

    // Prime list cache.
    await store.dispatch(notifyInboxApi.endpoints.listInbox.initiate(IDENTITY));
    expect(recorded.filter((r) => r.url.includes('/me')).length).toBe(1);

    // Mutate id=1 → READ.
    fetchHandler = makeMarkReadHandler({
      readId: 1,
      postReadUnread: 1, // After id=1 flips, only id=2 stays UNREAD.
    });
    const mutation = await store.dispatch(
      notifyInboxApi.endpoints.markRead.initiate({ ...IDENTITY, id: 1 }),
    );
    expect('data' in mutation && mutation.data?.state).toBe('READ');
    const markReq = recorded.find((r) => r.url.endsWith('/1/read'));
    expect(markReq?.method).toBe('POST');
    expect(markReq?.headers['x-subscriber-id']).toBe('sub-1');

    // List re-fetch (cache invalidation) — RTK Query refetches subscribed
    // queries automatically when their tags are invalidated.
    await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate(IDENTITY, { forceRefetch: true }),
    );
    const listAfter = recorded.filter((r) => r.url.includes('/me?')).pop();
    expect(listAfter).toBeDefined();
  });

  it('returns 404 when the row is unknown', async () => {
    fetchHandler = makeNotFoundHandler();
    const store = buildStore();
    const result = await store.dispatch(
      notifyInboxApi.endpoints.markRead.initiate({ ...IDENTITY, id: 999 }),
    );
    expect('error' in result && (result.error as { status: number }).status).toBe(404);
  });
});

describe('notifyInboxApi.archive', () => {
  it('POSTs to /{id}/archive and removes from the active list', async () => {
    const store = buildStore();
    fetchHandler = makeArchiveHandler({ archiveId: 1 });

    const mutation = await store.dispatch(
      notifyInboxApi.endpoints.archive.initiate({ ...IDENTITY, id: 1 }),
    );
    expect('data' in mutation && mutation.data?.state).toBe('ARCHIVED');
    const archReq = recorded.find((r) => r.url.endsWith('/1/archive'));
    expect(archReq?.method).toBe('POST');

    // Re-fetch the list to verify archived row no longer appears.
    fetchHandler = makeDefaultHandler({ excludeIds: [1] });
    const refreshed = await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate(IDENTITY, { forceRefetch: true }),
    );
    expect(refreshed.data?.items.map((i) => i.id)).not.toContain(1);
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

function extractCall(
  input: RequestInfo | URL,
  init?: RequestInit,
): { url: string; method: string } {
  if (input instanceof Request) {
    return { url: input.url, method: input.method.toUpperCase() };
  }
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
  return { url, method: (init?.method ?? 'GET').toUpperCase() };
}

function makeDefaultHandler(opts: { excludeIds?: number[] } = {}) {
  const exclude = new Set(opts.excludeIds ?? []);
  const seed: InboxItemDto[] = [
    buildRow({ id: 1, createdAt: '2026-05-07T08:00:00Z', state: 'UNREAD' }),
    buildRow({ id: 2, createdAt: '2026-05-07T09:15:00Z', state: 'UNREAD', severity: 'warning' }),
    buildRow({ id: 3, createdAt: '2026-05-06T22:00:00Z', state: 'READ' }),
  ].filter((r) => !exclude.has(r.id));

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { url, method } = extractCall(input, init);

    if (method === 'GET' && url.includes('/me/unread-count')) {
      const unread = seed.filter((r) => r.state === 'UNREAD').length;
      return jsonResponse({ unreadCount: unread } satisfies UnreadCountDto);
    }
    if (method === 'GET' && url.includes('/me')) {
      const sorted = [...seed].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const body: InboxListResponseDto = {
        items: sorted,
        totalElements: sorted.length,
        totalPages: 1,
        pageNumber: 0,
        pageSize: 20,
        unreadCount: sorted.filter((r) => r.state === 'UNREAD').length,
      };
      return jsonResponse(body);
    }
    return jsonResponse({ error: 'unhandled', url, method }, 500);
  };
}

function makeMarkReadHandler(opts: { readId: number; postReadUnread: number }) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { url, method } = extractCall(input, init);
    if (method === 'POST' && url.endsWith(`/${opts.readId}/read`)) {
      return jsonResponse(buildRow({ id: opts.readId, state: 'READ' }));
    }
    if (method === 'GET' && url.includes('/me')) {
      // List after mutation: id=opts.readId is READ, id=2 still UNREAD.
      return jsonResponse({
        items: [
          buildRow({ id: 2, createdAt: '2026-05-07T09:15:00Z', state: 'UNREAD' }),
          buildRow({ id: opts.readId, state: 'READ' }),
        ],
        totalElements: 2,
        totalPages: 1,
        pageNumber: 0,
        pageSize: 20,
        unreadCount: opts.postReadUnread,
      } satisfies InboxListResponseDto);
    }
    return jsonResponse({ error: 'unhandled', url, method }, 500);
  };
}

function makeArchiveHandler(opts: { archiveId: number }) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { url, method } = extractCall(input, init);
    if (method === 'POST' && url.endsWith(`/${opts.archiveId}/archive`)) {
      return jsonResponse(buildRow({ id: opts.archiveId, state: 'ARCHIVED' }));
    }
    return jsonResponse({ error: 'unhandled', url, method }, 500);
  };
}

function makeNotFoundHandler() {
  return async (): Promise<Response> => jsonResponse({ error: 'not-found' }, 404);
}
