/**
 * PERF-INIT-V2 PR-B5b3-prep — MFE on-demand bootstrap feature flag.
 *
 * This module ships ONLY the flag reader. NO behaviour change.
 *
 * Context (PMD v4 §3 Wave B5b — Codex thread 019e20fa iter-7+iter-8):
 * Wave B5b (MFE on-demand bootstrap) is the primary decoded-reduction
 * path after PR-B5d0 falsified per-subpath share-scope federation.
 * B5b consists of:
 *   - B5b3-prep (THIS PR): feature flag reader, NO behaviour change
 *   - B5b0      : remoteEntry initiator-attribution diagnostic
 *   - B5b1      : single-MFE canary (consumes the flag at BUILD time)
 *   - B5b2      : admin remotes route-scoped rollout
 *   - B5b3      : federation-doctor + nightly smoke
 *
 * Rollback semantic (Codex thread 019e228d / 019e22a1 iter-2+iter-3
 * clarification — applies to B5b1 onwards):
 *
 *   - B5b1's `lazy-routes.ts` reads `__MFE_SUGGESTIONS_ON_DEMAND__`
 *     compile-time define populated by `vite.config.ts`'s build-time
 *     reader.  Rolldown dead-code-eliminates the inverse branch.
 *   - Once a build has been made with the flag on, the eager
 *     `import('mfe_suggestions/SuggestionsApp')` specifier no longer
 *     exists in the bundle.  Full post-build rollback requires
 *     rebuilding with the flag off.
 *   - The runtime reader exported below (`isMfeOnDemandBootstrapEnabled`)
 *     is a flag-state probe used by OTHER consumers that gate behaviour
 *     on the same env (observability, debug surfaces).  It does NOT
 *     control B5b1's eager/on-demand selection after deploy.
 *
 * Env var precedence (first-defined wins; runtime overrides build-time
 * before the build runs — operators that want to disable the canary
 * must set `MFE_ON_DEMAND_BOOTSTRAP=0` BEFORE `pnpm build`):
 *
 *   1. `MFE_ON_DEMAND_BOOTSTRAP=1` (runtime env, cluster-side or pre-build)
 *   2. `VITE_MFE_ON_DEMAND_BOOTSTRAP=1` (build-time env, Vite-injected)
 *
 * Default: OFF — current eager bootstrap unchanged.
 */

import { readEnv } from './env';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function parseTruthy(value: string): boolean {
  return TRUTHY.has(value.trim().toLowerCase());
}

/**
 * Read the MFE on-demand bootstrap flag state.  Used by consumers
 * that gate behaviour on the same env — observability, debug surfaces,
 * future B5b2/B5b3 wiring.  Does NOT control B5b1's eager/on-demand
 * selection at runtime — that branch is fixed at build time by
 * `vite.config.ts`'s `__MFE_SUGGESTIONS_ON_DEMAND__` define.
 *
 * **Precedence (first-defined wins, including explicit falsy):**
 *
 *   1. `MFE_ON_DEMAND_BOOTSTRAP` env
 *      — when set (to ANY value including `0` / `false`), this source
 *        decides; build-time is NOT consulted
 *   2. `VITE_MFE_ON_DEMAND_BOOTSTRAP` env
 *      — only consulted when the first variable is unset
 *
 * **Why first-defined-wins (Codex iter-1 finding, thread 019e2266)**:
 * a boolean-OR over both sources would let `VITE_MFE_ON_DEMAND_BOOTSTRAP=1`
 * baked into the bundle override a deliberate
 * `MFE_ON_DEMAND_BOOTSTRAP=0` operator opt-out.  The runtime reader
 * must honour the same precedence as the build-time reader in
 * `vite.config.ts` so probes return the same value on both sides of
 * the build boundary.
 *
 * Returns `true` only when the deciding source contains a truthy
 * value (case-insensitive: `1` / `true` / `yes` / `on`).  Defaults to
 * `false`.
 */
export function isMfeOnDemandBootstrapEnabled(): boolean {
  const runtimeRaw = readEnv('MFE_ON_DEMAND_BOOTSTRAP', '');
  if (runtimeRaw !== '') {
    return parseTruthy(runtimeRaw);
  }
  const buildRaw = readEnv('VITE_MFE_ON_DEMAND_BOOTSTRAP', '');
  if (buildRaw !== '') {
    return parseTruthy(buildRaw);
  }
  return false;
}
