import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../../../app/store/store';
import { selectAuthToken } from '../../auth/model/auth.slice';
import { selectNotifyIdentity } from '../model/identity.selectors';
import { unwrapRequestFetchFn } from './notify-request-fetch-fn';

/**
 * RTK Query client for the subscriber-facing topic catalog
 * (Faz 23.5 M5 G3b).
 *
 * <p>The catalog lists the universe of dotted-notation topic keys that
 * a subscriber can opt into / out of. The frontend uses it to power:
 * <ul>
 *   <li>Topic input autocomplete in the preference quick-add form
 *       (replaces free-text typo'd entries).</li>
 *   <li>Channel multi-select restriction in the drawer editor
 *       ({@code supportedChannels} per topic).</li>
 *   <li>"Critical-eligible" badge near the {@code bypassForCritical}
 *       toggle in the drawer editor (UI affordance hint).</li>
 *   <li>Topic category grouping in the rule table filter.</li>
 * </ul>
 *
 * <p>The endpoint requires authentication (same identity guard chain
 * as {@code /preferences/me}). An empty {@code items} array signals
 * "catalog unavailable" — the UI falls back to free-text topic entry
 * in that case.
 *
 * <p>Cache strategy: single LIST tag, no per-entry granularity. The
 * catalog is org/subscriber-agnostic and changes only at backend
 * deploy time; aggressive caching (default 60s RTK Query
 * keepUnusedDataFor) is appropriate.
 */
function resolveTopicCatalogBaseUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/api/v1/notify`;
}

export interface TopicCatalogEntry {
  topicKey: string;
  label: string | null;
  category: string | null;
  supportedChannels: string[];
  criticalEligible: boolean;
  description: string | null;
  defaultFrequencyHint: number | null;
}

export interface TopicCatalogListResponse {
  items: TopicCatalogEntry[];
}

export const notifyTopicCatalogApi = createApi({
  reducerPath: 'notifyTopicCatalogApi',
  baseQuery: fetchBaseQuery({
    baseUrl: resolveTopicCatalogBaseUrl(),
    // Codex 019e50ac/019e5112 re-smoke fix — RTK Query's default
    // Request-object fetch drops headers at the wire layer (nginx ↔
    // orchestrator). Re-issue as string-form fetch so Authorization +
    // identity headers survive end-to-end. See notify-request-fetch-fn.ts.
    fetchFn: unwrapRequestFetchFn,
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const state = getState() as RootState;
      const token = selectAuthToken(state);
      const identity = selectNotifyIdentity(state);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (identity?.orgId) {
        headers.set('X-Org-Id', identity.orgId);
      }
      if (identity?.subscriberId) {
        headers.set('X-Subscriber-Id', identity.subscriberId);
      }
      return headers;
    },
  }),
  tagTypes: ['TopicCatalog'],
  endpoints: (builder) => ({
    listTopicCatalog: builder.query<TopicCatalogListResponse, void>({
      query: () => ({ url: '/topics/me' }),
      providesTags: [{ type: 'TopicCatalog', id: 'LIST' }],
    }),
  }),
});

export const { useListTopicCatalogQuery } = notifyTopicCatalogApi;
