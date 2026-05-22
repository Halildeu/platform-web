import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../../../app/store/store';
import { selectAuthToken } from '../../auth/model/auth.slice';
import { selectNotifyIdentity } from '../model/identity.selectors';
import { unwrapRequestFetchFn } from './notify-request-fetch-fn';
import type {
  PushEndpointListResponse,
  PushSubscribeArgs,
  PushSubscribeResponse,
  PushUnsubscribeArgs,
  PushUnsubscribeResponse,
} from './notify-push.types';

/**
 * RTK Query client for the notification-orchestrator WebPush
 * subscription REST API (Faz 23.7 M7 T4.2 PR-W5).
 *
 * Endpoints:
 * - POST /api/v1/notify/push/subscribe → idempotent upsert (created/updated/reactivated)
 * - GET /api/v1/notify/push/subscribe/me → active endpoint metadata (PII-minimal)
 * - DELETE /api/v1/notify/push/subscribe/{endpointId} → endpoint-level soft delete
 *
 * Same auth contract as preferences/inbox: bearer token + identity headers.
 * Backend SubscriberIdentityGuard enforces JWT sub claim match.
 *
 * Browser-only (mobile FCM/APNS Faz 22.2 dep scope DIŞI).
 */
function resolvePushBaseUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  return `${origin}/api/v1/notify/push/subscribe`;
}

export const notifyPushApi = createApi({
  reducerPath: 'notifyPushApi',
  baseQuery: fetchBaseQuery({
    baseUrl: resolvePushBaseUrl(),
    // Codex 019e50ac/019e5112 re-smoke fix — RTK Query's default
    // Request-object fetch drops headers at the wire layer (nginx ↔
    // orchestrator). Re-issue as string-form fetch so Authorization +
    // identity headers survive end-to-end. See notify-request-fetch-fn.ts.
    fetchFn: unwrapRequestFetchFn,
    prepareHeaders: (headers, { getState }) => {
      const state = getState() as RootState;
      const token = selectAuthToken(state);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const identity = selectNotifyIdentity(state);
      if (identity) {
        headers.set('X-Org-Id', identity.orgId);
        headers.set('X-Subscriber-Id', identity.subscriberId);
      }
      return headers;
    },
  }),
  tagTypes: ['PushEndpoint'],
  endpoints: (build) => ({
    listMyPushEndpoints: build.query<PushEndpointListResponse, void>({
      query: () => ({
        url: '/me',
        method: 'GET',
      }),
      providesTags: () => [{ type: 'PushEndpoint' as const, id: 'LIST' }],
    }),

    subscribePush: build.mutation<PushSubscribeResponse, PushSubscribeArgs>({
      query: ({ orgId: _orgId, subscriberId: _subscriberId, ...body }) => ({
        url: '',
        method: 'POST',
        body,
      }),
      invalidatesTags: () => [{ type: 'PushEndpoint' as const, id: 'LIST' }],
    }),

    unsubscribePush: build.mutation<PushUnsubscribeResponse, PushUnsubscribeArgs>({
      query: ({ endpointId }) => ({
        url: `/${endpointId}`,
        method: 'DELETE',
      }),
      invalidatesTags: () => [{ type: 'PushEndpoint' as const, id: 'LIST' }],
    }),
  }),
});

export const { useListMyPushEndpointsQuery, useSubscribePushMutation, useUnsubscribePushMutation } =
  notifyPushApi;
