import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * RTK Query client for the public unsubscribe endpoint
 * (Faz 23.5 M5 G3).
 *
 * <p>This client is intentionally separate from {@code notify-prefs.api.ts}
 * because:
 * <ul>
 *   <li>It is <b>public / unauthenticated</b> — no JWT Bearer header,
 *       no X-Org-Id / X-Subscriber-Id headers. Authentication is by
 *       HMAC-signed token embedded in the URL query, verified
 *       server-side by {@code UnsubscribeRevokeService}.</li>
 *   <li>It has a different lifecycle from the in-app preference editor
 *       (one-shot landing page, not a long-lived authenticated SPA
 *       view).</li>
 *   <li>RFC 8058 one-click semantics — a single GET call performs both
 *       token verification AND preference revoke; no separate
 *       confirmation form.</li>
 * </ul>
 *
 * <p>Endpoint:
 * <ul>
 *   <li>{@code GET /api/v1/notify/unsubscribe?token=&lt;HMAC-token&gt;}
 *       → returns {@code { status: "unsubscribed" }} on success
 *         (HTTP 200) or an error object on failure.</li>
 * </ul>
 *
 * <p>Error mapping (server → client):
 * <ul>
 *   <li>HTTP 200 with {@code status: "unsubscribed"} → success</li>
 *   <li>HTTP 401 → token invalid (signature mismatch or malformed)</li>
 *   <li>HTTP 410 → token expired</li>
 *   <li>HTTP 404 → preference row not found (already deleted?)</li>
 *   <li>HTTP 5xx → server error — show generic retry message</li>
 * </ul>
 */
function resolveUnsubscribeBaseUrl(): string {
  // Same origin convention as notify-prefs.api.ts: the gateway routes
  // /api/v1/notify/* to the notification-orchestrator backend.
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/api/v1/notify`;
}

export type UnsubscribeStatus = 'unsubscribed';

export interface UnsubscribeResponse {
  status: UnsubscribeStatus;
}

export const notifyUnsubscribeApi = createApi({
  reducerPath: 'notifyUnsubscribeApi',
  baseQuery: fetchBaseQuery({
    baseUrl: resolveUnsubscribeBaseUrl(),
  }),
  // No tag types — endpoint is a one-shot mutation in semantics
  // (token can only be redeemed once). Each call returns a fresh
  // result; no caching helps.
  endpoints: (builder) => ({
    redeemUnsubscribeToken: builder.query<UnsubscribeResponse, string>({
      query: (token) => ({
        url: '/unsubscribe',
        params: { token },
      }),
    }),
  }),
});

export const { useRedeemUnsubscribeTokenQuery } = notifyUnsubscribeApi;
