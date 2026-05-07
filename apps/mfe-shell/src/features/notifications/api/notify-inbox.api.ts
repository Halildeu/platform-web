import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
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
 * Endpoints: gateway-fronted under {@code /api/v1/notify/inbox/...}. The
 * shell auth flow already pins the JWT into an httpOnly cookie via
 * {@code POST /auth/cookie}; here we set {@code credentials: 'include'}
 * so every request carries that cookie. The backend
 * {@code SubscriberIdentityGuard} validates the {@code X-Subscriber-Id}
 * header against trusted JWT claims (subscriberId | userId | sub) — see
 * platform-backend PR #94.
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

export const notifyInboxApi = createApi({
  reducerPath: 'notifyInboxApi',
  baseQuery: fetchBaseQuery({
    baseUrl: resolveInboxBaseUrl(),
    // The gateway sets the auth cookie httpOnly + SameSite=Lax under the
    // same origin; include it on every fetch so Spring Security sees the
    // JWT. Without this, the request would be unauthenticated and rejected
    // by the resource-server filter chain.
    credentials: 'include',
    prepareHeaders: (headers, { getState: _getState, extra: _extra, endpoint: _endpoint }) => {
      // X-Org-Id / X-Subscriber-Id are passed per-endpoint via the
      // {@code identity} arg rather than a global selector; this keeps
      // the API client orthogonal to the auth slice and lets
      // {@code AuthBootstrapper} resolve the values once at boot.
      // The headers themselves are appended in each endpoint's
      // {@code query} function via the request config.
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
} = notifyInboxApi;
