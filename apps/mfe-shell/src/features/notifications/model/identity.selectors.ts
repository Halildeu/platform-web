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
 * Today the resolution is:
 * - {@code orgId} → hard-coded "default" (single-tenant platform; no
 *   tenant claim in JWT yet — Faz 24 hardening introduces it).
 * - {@code subscriberId} → {@code state.auth.user.id} as populated by
 *   {@code AuthBootstrapper} from {@code /api/v1/authz/me} or the JWT
 *   custom {@code userId} claim.
 *
 * The backend {@link SubscriberIdentityGuard} (notification-orchestrator
 * PR #94) accepts a match against any of {@code subscriberId | userId |
 * sub} JWT claims, so the value emitted here is already trusted regardless
 * of which producer convention generated the inbox row.
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
  const userId = state.auth.user?.id;
  if (!userId || typeof userId !== 'string') {
    return null;
  }
  return { orgId: DEFAULT_ORG_ID, subscriberId: userId };
};

/** Boolean readiness selector — useful for guarding {@code skip} on RTK Query. */
export const selectNotifyIdentityReady = (state: RootState): boolean =>
  selectNotifyIdentity(state) !== null;
