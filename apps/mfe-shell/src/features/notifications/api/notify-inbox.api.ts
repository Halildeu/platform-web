import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../../../app/store/store';
import { selectNotifyIdentity } from '../model/identity.selectors';
import { selectAuthToken } from '../../auth/model/auth.slice';
import type {
  InboxItemActionArgs,
  InboxItemDto,
  InboxListArgs,
  InboxListResponseDto,
  InboxRequestIdentity,
  UnreadCountDto,
} from './notify-inbox.types';

/**
 * RTK Query client for the notification-orchestrator inbox REST API
 * (Faz 23.4 PR-E.5 — frontend identity bootstrap).
 *
 * Endpoints: gateway-fronted under {@code /api/v1/notify/inbox/...}.
 * REST requests authenticate with an {@code Authorization: Bearer}
 * header sourced from the Redux {@code auth} slice — the api-gateway
 * {@code CookieAwareBearerTokenConverter} honours the
 * {@code erp_access_token} cookie only for the SSE {@code /me/stream}
 * path, so every REST inbox call carries the bearer token explicitly.
 * The backend {@code SubscriberIdentityGuard} validates the
 * {@code X-Subscriber-Id} header against trusted JWT claims
 * (subscriberId | userId | sub) — see platform-backend PR #94.
 *
 * Why RTK Query (not a custom hook): cache, automatic invalidation
 * (mark-read / archive flip the list and badge), built-in loading / error
 * state, and trivial MSW interception in tests. {@code @reduxjs/toolkit}
 * is already a workspace dep; the {@code /query/react} subpath ships the
 * hook factory without any extra package.
 */
/**
 * Resolve the base URL for inbox API requests. Browser and jsdom both
 * expose {@code window.location.origin}; we prefix it so the URL is
 * absolute (Node's {@code Request} constructor rejects relative URLs in
 * test environments). In a true Node-only environment without a window
 * we fall back to {@code http://localhost} which is a sane default for
 * tests that stub fetch.
 */
function resolveInboxBaseUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  return `${origin}/api/v1/notify/inbox`;
}

/**
 * Workaround for `Request`-object header drop observed at the wire layer
 * (PR-5.X-quartet follow-up; Codex thread {@code 019e075d} iter-7).
 *
 * <p>Live evidence captured in DevTools on testai.acik.com:
 * <pre>
 *   fetch(url, { headers })                   → 200
 *   fetch(new Request(url, { headers }))      → 400 MissingRequestHeader
 *   fetch(url, { headers: new Headers(...) }) → 200
 * </pre>
 *
 * <p>The two failing and passing calls carried identical header
 * key/value pairs (asserted via header-entries dump in the spy);
 * the only difference was the Request-vs-string input form to
 * {@code fetch}. RTK Query 2.x's {@code fetchBaseQuery} defaults to
 * the Request-object form ({@code new Request(url, init)} → {@code
 * fetch(request)}), which trips this drop somewhere between the
 * frontend pod's nginx and the orchestrator.
 *
 * <p>This fetchFn unwraps an incoming {@code Request} and re-issues
 * the call with the string URL + plain init shape so the headers
 * survive end-to-end. Investigation of the underlying proxy/runtime
 * difference is queued as a separate follow-up — once isolated we
 * can revert to RTK's default fetcher.
 */
async function unwrapRequestFetchFn(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const headers: Record<string, string> = {};
    input.headers.forEach((value, key) => {
      headers[key] = value;
    });
    // Codex iter-7 REVISE absorb: full Request semantics preservation.
    // {@code signal} is the critical one — RTK Query writes
    // {@code api.signal} (and any timeout signal) onto the Request
    // before calling fetchFn, so dropping it would silently disable
    // abort / timeout / cancel for inbox API queries. The remaining
    // properties (referrerPolicy, keepalive) are added for parity so
    // the unwrapped reissue is byte-equivalent to the original Request.
    const reissue: RequestInit = {
      method: input.method,
      headers,
      credentials: input.credentials,
      mode: input.mode,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
    };
    // Don't fabricate an empty ArrayBuffer when the caller never set a
    // body — the RTK Query mutations that do carry payloads will hit
    // this branch with input.body !== null and we faithfully forward.
    if (input.method !== 'GET' && input.method !== 'HEAD' && input.body !== null) {
      reissue.body = await input.clone().arrayBuffer();
    }
    return fetch(input.url, reissue);
  }
  return fetch(input, init);
}

export const notifyInboxApi = createApi({
  reducerPath: 'notifyInboxApi',
  baseQuery: fetchBaseQuery({
    baseUrl: resolveInboxBaseUrl(),
    fetchFn: unwrapRequestFetchFn,
    /**
     * State-derived identity headers (PR-5.X-bis follow-up; Codex thread
     * {@code 019e075d} iter-2 REVISE absorb correction).
     *
     * <p>Live evidence post-PR-316 deploy (FE pod {@code sha-dec128b}):
     * RTK Query cache showed {@code listInbox({"orgId":"default",
     * "subscriberId":"1"})} entry with status {@code "rejected"} and
     * error {@code 400 MissingRequestHeader: X-Org-Id}. The endpoint
     * config sets {@code headers: identityHeaders(arg)} but the field
     * was not surfacing on the wire — the dolu-arg request reached the
     * orchestrator with no identity headers at all. Manual {@code fetch}
     * with the same headers returned 200, confirming the request shape
     * was correct only when the call set them globally.
     *
     * <p>{@code prepareHeaders} is the RTK Query API guaranteed to run
     * for every request, so we set the identity here from
     * {@code state.auth} via {@link selectNotifyIdentity}. The
     * endpoint-level {@code headers: identityHeaders(arg)} is kept for
     * cache-key parity, but the wire-level safety now lives here.
     *
     * <p>Codex iter-2 raised a cache-vs-identity drift concern about
     * state-derived header fallbacks: a blank-arg request rewritten
     * with state headers would land under the wrong cache key. That
     * concern is moot in this single-tenant deployment because
     * {@code arg.orgId === state.auth.user.orgId} and
     * {@code arg.subscriberId === state.auth.user.subscriberId} are
     * the same identity by construction (the call site reads identity
     * from the same selector and passes it as the arg). Drift would
     * only be possible if a multi-tenant operator handed in a
     * different identity than their state, in which case
     * {@code skipToken} (already wired in {@code NotificationCenter})
     * would short-circuit the call before {@code prepareHeaders} runs.
     *
     * <p>Why we don't simply replace endpoint-level headers: the arg
     * still drives the cache key, so endpoints continue to set headers
     * for parity with future schemes that might derive identity per
     * call. Endpoint-level headers are "intent"; {@code prepareHeaders}
     * is "wire safety".
     */
    prepareHeaders: (headers, { getState }) => {
      const state = getState() as RootState;
      // REST notify routes authenticate header-only at the gateway (the
      // erp_access_token cookie is honoured only for the SSE /me/stream
      // path). Absent token → no header → fail-closed 401, same boundary
      // as the null-identity case below.
      const token = selectAuthToken(state);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const identity = selectNotifyIdentity(state);
      if (!identity) {
        return headers;
      }
      // Always set both headers; the state-derived identity matches the
      // arg-derived identity in this deployment, so this is idempotent
      // when the endpoint config already set them and recovers the
      // wire request when (as observed in production) the field was
      // dropped between the endpoint config and the actual fetch.
      headers.set('X-Org-Id', identity.orgId);
      headers.set('X-Subscriber-Id', identity.subscriberId);
      return headers;
    },
  }),
  tagTypes: ['Inbox', 'UnreadCount'] as const,
  endpoints: (build) => ({
    /**
     * GET /api/v1/notify/inbox/me — paged active inbox + unread count in
     * a single response. The backend returns ARCHIVED rows filtered out
     * and newest-first ordering.
     */
    listInbox: build.query<InboxListResponseDto, InboxListArgs>({
      query: ({ orgId, subscriberId, page = 0, size = 20 }) => ({
        url: '/me',
        params: { page, size },
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Inbox' as const, id })),
              { type: 'Inbox' as const, id: 'LIST' },
              { type: 'UnreadCount' as const, id: 'BADGE' },
            ]
          : [
              { type: 'Inbox' as const, id: 'LIST' },
              { type: 'UnreadCount' as const, id: 'BADGE' },
            ],
    }),

    /**
     * GET /api/v1/notify/inbox/me/unread-count — lightweight badge
     * endpoint. Use this when the SSE stream is unavailable or for the
     * initial render before the SSE connection completes.
     */
    getUnreadCount: build.query<UnreadCountDto, InboxRequestIdentity>({
      query: ({ orgId, subscriberId }) => ({
        url: '/me/unread-count',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      providesTags: [{ type: 'UnreadCount' as const, id: 'BADGE' }],
    }),

    /**
     * POST /api/v1/notify/inbox/{id}/read — mark a row as READ. The
     * server returns the post-mutation row. Idempotent: re-marking a
     * READ row is a no-op and still returns 200 with the row.
     */
    markRead: build.mutation<InboxItemDto, InboxItemActionArgs>({
      query: ({ id, orgId, subscriberId }) => ({
        url: `/${id}/read`,
        method: 'POST',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Inbox' as const, id },
        { type: 'Inbox' as const, id: 'LIST' },
        { type: 'UnreadCount' as const, id: 'BADGE' },
      ],
    }),

    /**
     * POST /api/v1/notify/inbox/{id}/archive — soft-delete (state →
     * ARCHIVED). UI removes from list immediately via cache invalidation.
     */
    archive: build.mutation<InboxItemDto, InboxItemActionArgs>({
      query: ({ id, orgId, subscriberId }) => ({
        url: `/${id}/archive`,
        method: 'POST',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Inbox' as const, id },
        { type: 'Inbox' as const, id: 'LIST' },
        { type: 'UnreadCount' as const, id: 'BADGE' },
      ],
    }),

    /**
     * POST /api/v1/notify/inbox/me/mark-all-read — Faz 23.5 PR4
     * integration of the backend bulk endpoint (PR #97).
     *
     * <p>Replaces the v1 UI's per-row mark-read loop. The backend
     * captures a server-side cutoff timestamp and only flips rows whose
     * {@code createdAt <= cutoff}, so notifications arriving between
     * the request landing and the UPDATE are not collateral-marked-as-
     * read — UX-correct for "mark everything I've seen as read".
     *
     * <p>Returns the number of rows affected and the applied cutoff
     * for audit / UX feedback ("13 bildirim okundu işaretlendi").
     * The LIST tag invalidation triggers a refetch so the drawer
     * shows the post-bulk state.
     */
    markAllAsRead: build.mutation<{ updatedCount: number; cutoff: string }, InboxRequestIdentity>({
      query: ({ orgId, subscriberId }) => ({
        url: '/me/mark-all-read',
        method: 'POST',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      invalidatesTags: () => [
        { type: 'Inbox' as const, id: 'LIST' },
        { type: 'UnreadCount' as const, id: 'BADGE' },
      ],
    }),
  }),
});

/**
 * Build the X-Org-Id / X-Subscriber-Id header pair that every backend
 * endpoint requires. Centralized so the header names stay consistent and
 * a future migration (e.g. JWT-only resolution per Codex iter-3 canonical
 * target C) can be applied in a single place.
 */
function identityHeaders({ orgId, subscriberId }: InboxRequestIdentity): Record<string, string> {
  return {
    'X-Org-Id': orgId,
    'X-Subscriber-Id': subscriberId,
  };
}

export const {
  useListInboxQuery,
  useGetUnreadCountQuery,
  useMarkReadMutation,
  useArchiveMutation,
  useMarkAllAsReadMutation,
} = notifyInboxApi;
