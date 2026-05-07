import type { RootState } from '../../../app/store/store';

/**
 * Notification identity selectors (Faz 23.4 PR-E.5).
 *
 * Resolves the {@code (orgId, subscriberId)} pair the inbox API client
 * needs to send on every request. The pair drives both REST headers and
 * the SSE query params; centralizing the resolution here keeps the
 * convention auditable and lets future canonical-claim migration (Codex
 * iter-3 long-term target C) flip in one place.
 *
 * <h3>SubscriberId resolution priority</h3>
 *
 * Codex iter-4 RED absorb: the original implementation read
 * {@code state.auth.user.id} which under the Keycloak SSO bootstrap is
 * the JWT {@code sub} claim (a UUID). Notification producers
 * (variant-service / report-service) populate
 * {@code recipient.subscriberId} with the platform's canonical DB user
 * id (numeric, exposed via the JWT custom {@code userId} claim and the
 * {@code /api/v1/authz/me} response). If the UI sent the JWT sub, the
 * backend {@link com.serban.notify.api.SubscriberIdentityGuard} would
 * still 200 (sub is in its trusted claim set), but the inbox query would
 * find no matching rows (subscriber_id column stores the canonical id,
 * not the UUID).
 *
 * Resolution priority (first non-empty wins):
 * <ol>
 *   <li>{@code state.auth.authzSnapshot.userId} — canonical id from
 *       /api/v1/authz/me; matches what producers store.</li>
 *   <li>{@code state.auth.user.id} (string only) — JWT sub fallback;
 *       used until /api/v1/authz/me has resolved or in profiles where
 *       the snapshot is unavailable.</li>
 * </ol>
 *
 * <h3>OrgId</h3>
 *
 * Hard-coded {@code "default"} (single-tenant platform; no tenant claim
 * in JWT yet — Faz 24 hardening introduces it).
 */

/** Single-tenant default. Replace once tenant claim lands (Faz 24). */
export const DEFAULT_ORG_ID = 'default' as const;

/**
 * Returns the resolved {@code (orgId, subscriberId)} pair, or {@code null}
 * when the user is not yet authenticated (boot in progress / signed out).
 *
 * Consumers should treat {@code null} as "skip the inbox call" — there is
 * no inbox to fetch without an authenticated subscriber.
 */
export const selectNotifyIdentity = (
  state: RootState,
): { orgId: string; subscriberId: string } | null => {
  // Prefer authzSnapshot.userId (canonical DB id) — this is what
  // notification producers reference. Fall back to user.id only when the
  // snapshot has not arrived yet.
  const authzUserId = readAuthzUserId(state);
  const profileId = readProfileId(state);
  const subscriberId = authzUserId ?? profileId;
  if (!subscriberId) {
    return null;
  }
  return { orgId: DEFAULT_ORG_ID, subscriberId };
};

/** Boolean readiness selector — useful for guarding {@code skip} on RTK Query. */
export const selectNotifyIdentityReady = (state: RootState): boolean =>
  selectNotifyIdentity(state) !== null;

// ─── Private extractors ─────────────────────────────────────────────────

const readAuthzUserId = (state: RootState): string | null => {
  const snapshot = state.auth.authzSnapshot as Record<string, unknown> | null | undefined;
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  const value = snapshot.userId;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Numeric id from the legacy authz response — coerce to string so
    // downstream header serialization is uniform.
    return String(value);
  }
  return null;
};

const readProfileId = (state: RootState): string | null => {
  const profileId = state.auth.user?.id;
  if (typeof profileId === 'string' && profileId.length > 0) {
    return profileId;
  }
  return null;
};
