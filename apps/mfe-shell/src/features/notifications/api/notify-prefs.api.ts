import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../../../app/store/store';
import { selectNotifyIdentity } from '../model/identity.selectors';
import { selectAuthToken } from '../../auth/model/auth.slice';
import type {
  PreferenceDeleteArgs,
  PreferenceDto,
  PreferenceRequestIdentity,
  PreferenceUpsertArgs,
} from './notify-prefs.types';

/**
 * RTK Query client for the notification-orchestrator preference REST
 * API (Faz 23.5 PR3 — preferences UI).
 *
 * Endpoints:
 * - {@code GET /api/v1/notify/preferences/me} → list rows
 * - {@code PUT /api/v1/notify/preferences/me} → upsert by composite key
 * - {@code DELETE /api/v1/notify/preferences/me/{id}} → remove one row
 *
 * Same auth contract as the inbox surface: an {@code Authorization:
 * Bearer} header (sourced from the Redux {@code auth} slice) plus
 * X-Org-Id / X-Subscriber-Id identity headers, both set in
 * {@code prepareHeaders}. The backend
 * {@link com.serban.notify.api.SubscriberIdentityGuard} enforces the
 * trusted-claim-set match server-side.
 *
 * Cache strategy:
 * - {@code Preference / LIST} tag covers the list query.
 * - {@code Preference / id} tag per row would be useful for granular
 *   invalidation but the v1 UI works against the full list (a single
 *   toggle re-renders the table); the LIST tag is sufficient and keeps
 *   the cache shape simple.
 * - {@code upsert} and {@code deleteOne} both invalidate {@code LIST}
 *   so the table re-fetches automatically after a mutation.
 */
function resolvePreferencesBaseUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  return `${origin}/api/v1/notify/preferences`;
}

export const notifyPrefsApi = createApi({
  reducerPath: 'notifyPrefsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: resolvePreferencesBaseUrl(),
    // Wire-level safety net — set bearer + identity headers for every
    // request. Endpoint-level `headers: identityHeaders(arg)` stays for
    // cache-key parity; prepareHeaders is the guaranteed wire write.
    // Absent token → no header → fail-closed 401.
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
  tagTypes: ['Preference'] as const,
  endpoints: (build) => ({
    /** GET /me — list rows newest-first by updated_at. */
    listPreferences: build.query<PreferenceDto[], PreferenceRequestIdentity>({
      query: ({ orgId, subscriberId }) => ({
        url: '/me',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Preference' as const, id })),
              { type: 'Preference' as const, id: 'LIST' },
            ]
          : [{ type: 'Preference' as const, id: 'LIST' }],
    }),

    /**
     * PUT /me — upsert by composite key. Idempotent: re-PUT for the
     * same {(topicKey, channel)} tuple returns the post-mutation row.
     * Validation (backend): {@code enabled} required (@NotNull);
     * missing field returns 400.
     */
    upsertPreference: build.mutation<PreferenceDto, PreferenceUpsertArgs>({
      query: ({ orgId, subscriberId, ...body }) => ({
        url: '/me',
        method: 'PUT',
        headers: identityHeaders({ orgId, subscriberId }),
        body,
      }),
      invalidatesTags: () => [{ type: 'Preference' as const, id: 'LIST' }],
    }),

    /**
     * DELETE /me/{id} — remove one preference row. 404 on cross-tenant
     * or missing id (matches inbox archive existence-disclosure
     * pattern). The list tag invalidation triggers a refetch that drops
     * the row from the table immediately.
     */
    deletePreference: build.mutation<void, PreferenceDeleteArgs>({
      query: ({ orgId, subscriberId, id }) => ({
        url: `/me/${id}`,
        method: 'DELETE',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      invalidatesTags: () => [{ type: 'Preference' as const, id: 'LIST' }],
    }),

    /**
     * DELETE /me — restore-defaults: hard-delete every preference row
     * owned by the caller in a single backend transaction (Faz 23.6
     * PR-A1 / PR-C1 — backend PR #115). Idempotent; returns
     * {@code deletedCount} for UX feedback (toast / banner).
     *
     * <p>The list tag invalidation refetches and the table empties
     * back to its "no rules — default-allow" baseline.
     */
    restoreDefaults: build.mutation<{ deletedCount: number }, PreferenceRequestIdentity>({
      query: ({ orgId, subscriberId }) => ({
        url: '/me',
        method: 'DELETE',
        headers: identityHeaders({ orgId, subscriberId }),
      }),
      invalidatesTags: () => [{ type: 'Preference' as const, id: 'LIST' }],
    }),

    /**
     * POST /me/mute-channel — atomic channel-wide mute (Faz 23.6
     * PR-A2 / PR-C2 — backend PR #116). Writes a channel-wildcard
     * deny rule, deletes same-channel exact overrides, and shadows
     * topic-wide allow rules with channel-specific exact denies so
     * the dispatch resolver actually mutes the channel.
     *
     * <p>The response carries both counts: {@code deletedOverrideCount}
     * (existing same-channel exacts removed) and
     * {@code shadowDenyCount} (topic-wide allow rules shadowed).
     * Together they let the UI tell the operator exactly what
     * happened.
     */
    muteChannel: build.mutation<
      { channel: string; muted: boolean; deletedOverrideCount: number; shadowDenyCount: number },
      PreferenceRequestIdentity & { channel: string }
    >({
      query: ({ orgId, subscriberId, channel }) => ({
        url: '/me/mute-channel',
        method: 'POST',
        headers: identityHeaders({ orgId, subscriberId }),
        body: { channel },
      }),
      invalidatesTags: () => [{ type: 'Preference' as const, id: 'LIST' }],
    }),
  }),
});

function identityHeaders({
  orgId,
  subscriberId,
}: PreferenceRequestIdentity): Record<string, string> {
  return {
    'X-Org-Id': orgId,
    'X-Subscriber-Id': subscriberId,
  };
}

export const {
  useListPreferencesQuery,
  useUpsertPreferenceMutation,
  useDeletePreferenceMutation,
  useRestoreDefaultsMutation,
  useMuteChannelMutation,
} = notifyPrefsApi;
