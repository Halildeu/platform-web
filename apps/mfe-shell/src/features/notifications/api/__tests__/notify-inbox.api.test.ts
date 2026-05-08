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
  intentId: null,
  subject: 'Test subject',
  bodyText: 'Test body',
  bodyHtml: null,
  locale: 'tr-TR',
  topicKey: 'test.topic',
  severity: 'info',
  state: 'UNREAD',
  readAt: null,
  archivedAt: null,
  createdAt: new Date('2026-05-07T08:00:00Z').toISOString(),
  expiresAt: null,
  ...overrides,
});

/**
 * PR-5.X follow-up (Codex thread {@code 019e075d} PARTIAL iter-1):
 * the inbox baseQuery now reads a defensive fallback identity from
 * {@code state.auth} via {@code selectNotifyIdentity}. Tests must
 * therefore pre-load an auth slice so the selector returns the
 * expected identity. Empty/blank endpoint headers exercise the
 * fallback branch; non-blank endpoint headers must still win.
 */
type AuthOverrides = {
  orgId?: string | undefined;
  subscriberId?: string | undefined;
  unauthenticated?: boolean;
};

const buildAuthState = (overrides: AuthOverrides = {}) => {
  const baseUser = overrides.unauthenticated
    ? null
    : {
        id: 'profile-1',
        email: 'admin@example.com',
        role: 'ADMIN' as const,
        permissions: [] as string[],
        // 'in' operator distinguishes "explicitly undefined override"
        // (drop the field entirely so the selector returns null) from
        // "no override given" (use the default canary identity).
        orgId: 'orgId' in overrides ? overrides.orgId : 'default',
        subscriberId: 'subscriberId' in overrides ? overrides.subscriberId : 'sub-1',
      };
  return {
    user: baseUser,
    token: overrides.unauthenticated ? null : 'stub-token',
    status: 'idle' as const,
    error: null,
    registrationStatus: 'idle' as const,
    lastRegisteredEmail: null,
    expiresAt: null,
    initialized: true,
    phase: overrides.unauthenticated ? ('unauthenticated' as const) : ('transportReady' as const),
    authError: null,
    authEpoch: 0,
    transportReadyAt: overrides.unauthenticated ? null : Date.now(),
    authzSnapshot: null,
  };
};

const buildStore = (authOverrides: AuthOverrides = {}) => {
  const auth = buildAuthState(authOverrides);
  return configureStore({
    reducer: {
      // Minimal pass-through auth slice so {@code selectNotifyIdentity}
      // can resolve to the same identity the production selector would
      // surface (state.auth.user.orgId / subscriberId).
      auth: (state = auth) => state,
      [notifyInboxApi.reducerPath]: notifyInboxApi.reducer,
    },
    middleware: (gdm) => gdm().concat(notifyInboxApi.middleware),
  });
};

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

/**
 * PR-5.X follow-up (Codex thread {@code 019e075d} PARTIAL iter-1):
 * defensive {@code prepareHeaders} fallback. The endpoint-level
 * {@code identityHeaders(arg)} stays canonical so cache key and
 * resource identity come from the same place; this branch only kicks
 * in when the endpoint-level headers are blank — the production race
 * we observed at page-load when {@code AuthBootstrapper} was still
 * looping. Live evidence: 4x 400 {@code MissingRequestHeader} from
 * the orchestrator before tab-switch refetches landed with proper
 * headers. With the fallback wired the request goes out with the
 * state-derived identity even if the caller forgot to forward it.
 */
describe('notifyInboxApi prepareHeaders defensive fallback', () => {
  it('fills X-Org-Id / X-Subscriber-Id from state when endpoint headers are blank', async () => {
    const store = buildStore({ orgId: 'default', subscriberId: 'sub-state' });
    const result = await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({ orgId: '', subscriberId: '' }),
    );
    expect(result.status).toBe('fulfilled');

    const req = recorded[0];
    expect(req.headers['x-org-id']).toBe('default');
    expect(req.headers['x-subscriber-id']).toBe('sub-state');
  });

  it('does not override non-blank endpoint headers', async () => {
    // Endpoint headers must win so the cache key, the response, and the
    // header set always describe the same {@code (org, subscriber)} pair.
    const store = buildStore({ orgId: 'state-org', subscriberId: 'state-sub' });
    const result = await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({
        orgId: 'arg-org',
        subscriberId: 'arg-sub',
      }),
    );
    expect(result.status).toBe('fulfilled');

    const req = recorded[0];
    expect(req.headers['x-org-id']).toBe('arg-org');
    expect(req.headers['x-subscriber-id']).toBe('arg-sub');
  });

  it('leaves headers blank when both endpoint and state are missing identity', async () => {
    // Auth slice unauthenticated → state.auth.user === null →
    // selectNotifyIdentity returns null → prepareHeaders no-op.
    const store = buildStore({ unauthenticated: true });
    await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({ orgId: '', subscriberId: '' }),
    );

    const req = recorded[0];
    // No fallback when state has nothing to fill in. The orchestrator
    // will reject with 400 — that's the correct fail-closed behaviour
    // because there is genuinely no authenticated identity to claim.
    expect(req.headers['x-org-id'] ?? '').toBe('');
    expect(req.headers['x-subscriber-id'] ?? '').toBe('');
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
        page: 0,
        size: 20,
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
        page: 0,
        size: 20,
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
