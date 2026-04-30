/**
 * Codex 019dddf4 iter-43 — initial-circle producer for UserDetailDrawer
 * leading avatar.
 *
 * Mirrors the existing private `getInitials` in
 * `apps/mfe-shell/src/app/layout/header/UserMenuDropdown.tsx` (line 18).
 * Duplicated here intentionally:
 *   - mfe-users → mfe-shell would be a reverse dependency (forbidden);
 *   - no `packages/shared-utils` package exists yet (only shared-types
 *     and shared-http), so a single shared util doesn't justify a new
 *     package boundary;
 *   - if a third consumer (e.g. iter-44 RoleDrawer) adopts this helper,
 *     promote both copies into a new shared package and migrate.
 *
 * Behavior (locked to match UserMenuDropdown for visual consistency):
 *   - trim whitespace
 *   - prefer `fullName` → `displayName` → `name`
 *   - split on whitespace, take first 2 tokens
 *   - first character of each token, uppercased via `toUpperCase()`
 *     (NOT `toLocaleUpperCase("tr-TR")` — keeps "Çiğdem Öz" → "ÇÖ"
 *     instead of transliterating; deviation from shell behavior would
 *     create cross-product inconsistency)
 *   - email fallback when no name fields present (first letter of
 *     local-part, uppercased)
 *   - "U" final fallback when nothing else available
 *
 * Examples:
 *   getInitials({ fullName: "Halil Koçoğlu" })          // "HK"
 *   getInitials({ fullName: "Çiğdem Öz" })              // "ÇÖ"
 *   getInitials({ fullName: "Ada" })                    // "A"
 *   getInitials({ email: "user@example.com" })          // "U"
 *   getInitials(null)                                   // "U"
 */
export function getInitials(
  user:
    | {
        fullName?: string;
        displayName?: string;
        name?: string;
        email?: string;
      }
    | null
    | undefined,
): string {
  const name = user?.fullName?.trim() || user?.displayName?.trim() || user?.name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return (user?.email?.[0] ?? 'U').toUpperCase();
}
