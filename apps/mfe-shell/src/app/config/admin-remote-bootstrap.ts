/**
 * PERF-INIT-V2 PR-B5b2-prep-3 (Codex thread `019e237d` post-merge
 * P2 + P3 absorb).
 *
 * Pure-data constants + URL resolver for the 4 admin remotes
 * (users / access / audit / reporting) on-demand bootstrap path.
 *
 * Extracted from `shell-services-wiring.ts` so a unit test can
 * assert the canonical sequence + resolver behaviour without
 * importing the wiring module (which pulls federation virtual
 * specifiers `mfe_<admin>/shell-services` that Vite's
 * import-analysis cannot resolve under vitest).
 *
 * NO federation virtual imports.  Pure ESM + globals.
 */

export type AdminRemoteKey = 'reporting' | 'access' | 'audit' | 'users';

/**
 * Canonical idle-batch bootstrap order for the 4 admin remotes.
 * Codex risk ranking — lowest-blast remote first so if the helper
 * has a pathology we get an early signal from `mfe_reporting`
 * before touching the more sensitive remotes:
 *
 *   1. mfe_reporting   — read-only + paged (lowest blast)
 *   2. mfe_access      — RBAC matrix (medium blast)
 *   3. mfe_audit       — audit-log SSE consumer (medium blast)
 *   4. mfe_users       — impersonation FSM + notifications (highest blast)
 *
 * The corresponding unit test in
 * `__tests__/admin-remote-bootstrap.test.ts` asserts this exact
 * order so a future edit cannot silently re-order the registration
 * without breaking CI.  `shell-services-wiring.ts` iterates this
 * array; comment-only sequence specs in `vite.config.ts` and the
 * wrapper files reference the same const for documentation purposes.
 */
export const ADMIN_REMOTE_BOOTSTRAP_SEQUENCE: ReadonlyArray<AdminRemoteKey> = [
  'reporting',
  'access',
  'audit',
  'users',
] as const;

/**
 * Default `localhost:<port>` fallback used when no env override is
 * provided (dev mode).  Ports match the federation manifest defaults
 * in `apps/mfe-shell/vite.config.ts` `buildRemotes.remoteEntries`.
 */
export const ADMIN_REMOTE_DEFAULT_PORTS: Readonly<Record<AdminRemoteKey, number>> = {
  reporting: 3007,
  access: 3005,
  audit: 3006,
  users: 3004,
};

/**
 * Resolve an admin remote's `remoteEntry.js` URL via the same lookup
 * order as the route-level wrappers
 * (`createUsersAppOnDemand.tsx` `resolveUsersRemoteEntry` etc.) so
 * the idle batch and the route-level call use the SAME URL.  If both
 * paths resolve different URLs the helper's `configuredRemotes` Set
 * would still dedup, but `host.registerRemotes` would be called with
 * the second URL, racing against the first load — keeping them
 * symmetrical avoids the hazard.
 */
export function resolveAdminRemoteEntry(key: AdminRemoteKey): string {
  const upper = key.toUpperCase();
  if (typeof window !== 'undefined') {
    const w = window as Window & { __env__?: Record<string, string> };
    const url = w.__env__?.[`MFE_${upper}_URL`] ?? w.__env__?.[`VITE_MFE_${upper}_URL`] ?? null;
    if (url) return url;
  }
  if (typeof process !== 'undefined' && process.env) {
    const url = process.env[`MFE_${upper}_URL`] ?? process.env[`VITE_MFE_${upper}_URL`] ?? null;
    if (url) return url;
  }
  return `http://localhost:${ADMIN_REMOTE_DEFAULT_PORTS[key]}/remoteEntry.js`;
}
