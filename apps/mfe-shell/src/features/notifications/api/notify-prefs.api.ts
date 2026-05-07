import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
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
 * Same identity contract as the inbox surface (Faz 23.4 PR-E.5):
 * {@code credentials: 'include'} pulls the gateway httpOnly JWT cookie;
 * X-Org-Id / X-Subscriber-Id headers identify the caller; backend
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
    credentials: 'include',
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

export const { useListPreferencesQuery, useUpsertPreferenceMutation, useDeletePreferenceMutation } =
  notifyPrefsApi;
