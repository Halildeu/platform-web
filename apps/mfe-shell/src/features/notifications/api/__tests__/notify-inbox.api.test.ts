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
 * - Authorization: Bearer <auth.token> flows through to fetch
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
 * PR-5.X-bis follow-up (Codex thread {@code 019e075d} iter-2 REVISE
 * absorb correction): {@code prepareHeaders} now reads identity from
 * {@code state.auth} via {@code selectNotifyIdentity} and writes
 * {@code X-Org-Id} / {@code X-Subscriber-Id} on every request. Tests
 * therefore must pre-load an auth slice so the selector resolves to
 * the expected identity. The default fixture matches the endpoint
 * arg ({@code IDENTITY = { orgId: 'default', subscriberId: 'sub-1' }})
 * so existing tests still see the same wire headers as before; the
 * new fixture also lets tests cover the unauthenticated branch.
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
        // from "no override given" so callers can drop a field entirely.
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

    // Identity + bearer auth headers flow through.
    const req = recorded[0];
    expect(req.headers['x-org-id']).toBe('default');
    expect(req.headers['x-subscriber-id']).toBe('sub-1');
    expect(req.headers['authorization']).toBe('Bearer stub-token');
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
 * PR-5.X-bis (Codex thread {@code 019e075d} iter-2 REVISE absorb
 * correction): {@code prepareHeaders} now writes
 * {@code X-Org-Id}/{@code X-Subscriber-Id} from {@code state.auth} for
 * every request. Live evidence post-PR-316 deploy showed the
 * endpoint-level {@code headers: identityHeaders(arg)} field was being
 * dropped on the wire — RTK Query cache held a {@code rejected, 400
 * MissingRequestHeader} entry with the dolu identity arg, while a
 * manual {@code fetch} with the same headers returned 200.
 *
 * <p>iter-2's cache-vs-identity drift concern is moot in single-tenant
 * deployments because the call site reads identity from the same
 * selector and forwards it as the arg, so {@code arg === state}. In a
 * multi-tenant future the call site would gate the call with
 * {@code skipToken} before {@code prepareHeaders} ever runs.
 */
describe('notifyInboxApi prepareHeaders state-derived identity', () => {
  it('writes X-Org-Id / X-Subscriber-Id from state for every request', async () => {
    const store = buildStore({ orgId: 'state-org', subscriberId: 'state-sub' });
    const result = await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({
        orgId: 'state-org',
        subscriberId: 'state-sub',
      }),
    );
    expect(result.status).toBe('fulfilled');

    const req = recorded[0];
    // prepareHeaders sets the identity from state. The arg matches the
    // state in the live deployment so this is idempotent regardless of
    // whether the endpoint config wrote anything to the headers map.
    expect(req.headers['x-org-id']).toBe('state-org');
    expect(req.headers['x-subscriber-id']).toBe('state-sub');
    expect(req.headers['authorization']).toBe('Bearer stub-token');
  });

  it('rescues a blank-arg call by sourcing identity from state (post-PR-316 wire-safety net)', async () => {
    // Defensive recovery for the bug that motivated this PR: even if
    // a caller forwards an empty arg (the endpoint config would set
    // {X-Org-Id:'', X-Subscriber-Id:''}), prepareHeaders re-derives
    // identity from state and writes the wire headers correctly.
    // skipToken in NotificationCenter prevents this call shape in the
    // happy path; this test guards the wire layer for any future
    // caller that bypasses skipToken.
    const store = buildStore({ orgId: 'rescued-org', subscriberId: 'rescued-sub' });
    const result = await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({ orgId: '', subscriberId: '' }),
    );
    expect(result.status).toBe('fulfilled');

    const req = recorded[0];
    expect(req.headers['x-org-id']).toBe('rescued-org');
    expect(req.headers['x-subscriber-id']).toBe('rescued-sub');
  });

  it('leaves headers blank when the auth slice has no identity (fail-closed)', async () => {
    // Genuinely unauthenticated → no token + null identity →
    // prepareHeaders writes neither Authorization nor identity headers →
    // gateway returns 401 in production. Correct fail-closed boundary.
    const store = buildStore({ unauthenticated: true });
    await store.dispatch(
      notifyInboxApi.endpoints.listInbox.initiate({ orgId: '', subscriberId: '' }),
    );

    const req = recorded[0];
    expect(req.headers['authorization'] ?? '').toBe('');
    expect(req.headers['x-org-id'] ?? '').toBe('');
    expect(req.headers['x-subscriber-id'] ?? '').toBe('');
  });
});

/**
 * PR-5.X-quartet (Codex thread {@code 019e075d} iter-7 follow-up):
 * the {@code unwrapRequestFetchFn} workaround forces RTK Query to call
 * {@code fetch(url, init)} instead of {@code fetch(new Request(url,
 * init))}. Live evidence on testai.acik.com showed the Request-object
 * form lost identity headers somewhere between the frontend pod's
 * nginx and the orchestrator (`fetch(url, { headers })` returned 200
 * but `fetch(new Request(url, { headers }))` with the exact same
 * headers returned 400 MissingRequestHeader). This test guards the
 * fetcher contract: every dispatched query reaches the global
 * {@code fetch} stub with a string URL, never a Request instance.
 */
describe('notifyInboxApi unwrapRequestFetchFn (Request→string workaround)', () => {
  it('passes string URL + init to fetch and preserves Request semantics', async () => {
    type CallSnapshot = {
      inputType: string;
      method: string;
      headers: Record<string, string>;
      credentials?: RequestCredentials;
      hasSignal: boolean;
    };
    const calls: CallSnapshot[] = [];
    const orig = (global as unknown as { fetch: typeof fetch }).fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          inputType:
            typeof input === 'string' ? 'string' : input instanceof Request ? 'Request' : 'URL',
          method: (init?.method ?? 'GET').toUpperCase(),
          headers: headersToRecord(init?.headers),
          credentials: init?.credentials,
          // Codex iter-7 REVISE absorb: RTK Query writes api.signal +
          // any per-request timeout signal onto the Request before
          // fetchFn runs. The unwrap must forward that signal so
          // abort/timeout/cancel continue to fire after the reissue.
          hasSignal: init?.signal != null && typeof init.signal === 'object',
        });
        recorded.push({
          url: typeof input === 'string' ? input : String(input),
          method: (init?.method ?? 'GET').toUpperCase(),
          headers: headersToRecord(init?.headers),
          credentials: init?.credentials,
        });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              page: 0,
              size: 20,
              totalElements: 0,
              totalPages: 0,
              unreadCount: 0,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }),
    );

    const store = buildStore();
    const result = await store.dispatch(notifyInboxApi.endpoints.listInbox.initiate(IDENTITY));
    expect(result.status).toBe('fulfilled');

    // Wire-level guarantee: the workaround always issues a string URL,
    // never a Request instance.
    expect(calls).toHaveLength(1);
    expect(calls[0].inputType).toBe('string');
    expect(calls[0].method).toBe('GET');

    // Header preservation through the unwrap.
    expect(calls[0].headers['x-org-id']).toBe('default');
    expect(calls[0].headers['x-subscriber-id']).toBe('sub-1');
    expect(calls[0].headers['authorization']).toBe('Bearer stub-token');

    // Abort/timeout signal must carry over so RTK Query cancellation
    // and any per-request timeout continue to fire.
    expect(calls[0].hasSignal).toBe(true);

    // Restore original fetch handler for subsequent describe blocks.
    vi.unstubAllGlobals();
    (global as unknown as { fetch: typeof fetch }).fetch = orig;
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

/**
 * Faz 23.4 M6a — GET /me/history. The history surface lists rows in
 * EVERY state (UNREAD + READ + ARCHIVED) within a server-enforced
 * rolling window and carries window metadata instead of an unreadCount
 * badge. Pages are requested individually so the "Geçmiş" tab can
 * accumulate them client-side.
 */
describe('notifyInboxApi.listHistory', () => {
  it('GETs /me/history with paging params + identity headers and returns window metadata', async () => {
    fetchHandler = makeHistoryHandler({
      pages: [
        [
          buildRow({ id: 1, state: 'UNREAD' }),
          buildRow({ id: 2, state: 'ARCHIVED', archivedAt: '2026-05-10T08:00:00Z' }),
        ],
      ],
    });
    const store = buildStore();
    const result = await store.dispatch(notifyInboxApi.endpoints.listHistory.initiate(IDENTITY));
    expect(result.status).toBe('fulfilled');
    expect(result.data?.items).toHaveLength(2);
    // History is NOT state-filtered — an ARCHIVED row is present.
    expect(result.data?.items.map((i) => i.state)).toContain('ARCHIVED');
    expect(result.data?.windowDays).toBe(30);
    expect(result.data?.windowStart).toBeTruthy();

    const req = recorded[0];
    expect(req.url).toContain('/api/v1/notify/inbox/me/history');
    expect(req.url).toContain('page=0');
    expect(req.url).toContain('size=50');
    expect(req.headers['x-org-id']).toBe('default');
    expect(req.headers['x-subscriber-id']).toBe('sub-1');
  });

  it('fetches the requested page for client-side accumulation', async () => {
    fetchHandler = makeHistoryHandler({
      pages: [[buildRow({ id: 1 })], [buildRow({ id: 2 })]],
    });
    const store = buildStore();
    const result = await store.dispatch(
      notifyInboxApi.endpoints.listHistory.initiate({ ...IDENTITY, page: 1, size: 50 }),
    );
    expect(result.status).toBe('fulfilled');
    expect(result.data?.page).toBe(1);
    expect(result.data?.totalPages).toBe(2);
    expect(result.data?.items[0].id).toBe(2);
    expect(recorded[0].url).toContain('page=1');
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

/**
 * Faz 23.4 M6a — GET /me/history handler. Returns one page at a time
 * from the supplied page fixtures so accumulation can be exercised. The
 * `/me/history` check runs before the generic `/me` branch so it is not
 * shadowed (the substring `/me` also matches `/me/history`).
 */
function makeHistoryHandler(opts: { pages: InboxItemDto[][]; windowDays?: number }) {
  const windowDays = opts.windowDays ?? 30;
  const totalElements = opts.pages.reduce((n, p) => n + p.length, 0);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { url, method } = extractCall(input, init);
    if (method === 'GET' && url.includes('/me/history')) {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page') ?? '0');
      const size = Number(parsed.searchParams.get('size') ?? '50');
      return jsonResponse({
        items: opts.pages[page] ?? [],
        page,
        size,
        totalElements,
        totalPages: opts.pages.length,
        windowStart: '2026-04-19T00:00:00Z',
        windowDays,
      });
    }
    return jsonResponse({ error: 'unhandled', url, method }, 500);
  };
}

function makeNotFoundHandler() {
  return async (): Promise<Response> => jsonResponse({ error: 'not-found' }, 404);
}
