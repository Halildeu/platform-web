import type { RootState } from '../../../app/store/store';

/**
 * Notification identity selectors (Faz 23.4 PR-E.5; Faz 23.5 hardening).
 *
 * Resolves the {@code (orgId, subscriberId)} pair the inbox / preferences
 * APIs expect on every request. The pair drives both REST headers and SSE
 * query params; centralising the resolution here keeps the convention
 * auditable and lets the canonical-claim cutover flip in one place.
 *
 * <h3>SubscriberId resolution priority</h3>
 *
 * <p>Codex thread `019e0316` iter-3 absorb — canonical-first ordering so
 * the upcoming `subscriberId` JWT claim takes effect automatically once
 * the Keycloak mapper rolls out. Until then, legacy fallbacks keep today's
 * tokens working.
 *
 * <ol>
 *   <li>{@code state.auth.authzSnapshot.subscriberId} — canonical numeric
 *       id from {@code /api/v1/authz/me} (Faz 23.5 backend PR #107).
 *       Backend Long; we coerce to string here.</li>
 *   <li>{@code state.auth.user.subscriberId} — persisted alias copied
 *       through {@code setKeycloakSession} so token refreshes don't lose
 *       the canonical id when the snapshot reload hasn't completed yet.</li>
 *   <li>{@code state.auth.authzSnapshot.userId} — legacy permission-service
 *       claim (numeric DB id). Stays as a fallback during the rollout
 *       window.</li>
 *   <li>{@code state.auth.user.id} — JWT `sub` UUID. Last-resort fallback;
 *       gated behind {@code initialized === true} so we don't fire inbox
 *       calls with a stale persisted UUID before the snapshot reload.</li>
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
  const authzSubscriberId = readAuthzSubscriberId(state);
  const profileSubscriberId = readProfileSubscriberId(state);
  const authzUserId = readAuthzUserId(state);
  const profileId = readProfileId(state);

  // Codex iter-3 absorb: only the legacy `user.id` UUID fallback should
  // wait on bootstrap. Canonical sources resolve immediately.
  const onlyLegacyUuidFallback =
    authzSubscriberId === undefined &&
    profileSubscriberId === undefined &&
    authzUserId === undefined &&
    profileId !== undefined;
  if (onlyLegacyUuidFallback && state.auth.initialized !== true) {
    return null;
  }

  const subscriberId = authzSubscriberId ?? profileSubscriberId ?? authzUserId ?? profileId;
  if (!subscriberId) {
    return null;
  }
  return { orgId: DEFAULT_ORG_ID, subscriberId };
};

/** Boolean readiness selector — useful for guarding {@code skip} on RTK Query. */
export const selectNotifyIdentityReady = (state: RootState): boolean =>
  selectNotifyIdentity(state) !== null;

// ─── Private extractors ─────────────────────────────────────────────────

/**
 * Coerce a heterogeneous identity claim (string / number / null) to the
 * canonical string shape. Mirrors the helper in {@code auth.slice} so the
 * trim / number-finite contract is uniform across reducer + selector
 * (Codex thread `019e0316` iter-2 absorb).
 */
const coerceIdentityValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const readAuthzSubscriberId = (state: RootState): string | undefined => {
  const snapshot = state.auth.authzSnapshot as Record<string, unknown> | null | undefined;
  return coerceIdentityValue(snapshot?.['subscriberId']);
};

const readProfileSubscriberId = (state: RootState): string | undefined => {
  return coerceIdentityValue(state.auth.user?.subscriberId);
};

const readAuthzUserId = (state: RootState): string | undefined => {
  const snapshot = state.auth.authzSnapshot as Record<string, unknown> | null | undefined;
  return coerceIdentityValue(snapshot?.['userId']);
};

const readProfileId = (state: RootState): string | undefined => {
  return coerceIdentityValue(state.auth.user?.id);
};
