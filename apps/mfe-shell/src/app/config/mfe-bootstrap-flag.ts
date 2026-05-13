/**
 * PERF-INIT-V2 PR-B5b3-prep — MFE on-demand bootstrap rollback feature flag.
 *
 * This module ships ONLY the flag reader. NO behaviour change.
 *
 * Context (PMD v4 §3 Wave B5b — Codex thread 019e20fa iter-7+iter-8):
 * Wave B5b (MFE on-demand bootstrap) is the primary decoded-reduction
 * path after PR-B5d0 falsified per-subpath share-scope federation.
 * B5b consists of:
 *   - B5b3-prep (THIS PR): rollback feature flag, NO behaviour change
 *   - B5b0      : remoteEntry initiator-attribution diagnostic
 *   - B5b1      : single-MFE canary (consumes this flag for the first time)
 *   - B5b2      : admin remotes route-scoped rollout
 *   - B5b3      : federation-doctor + nightly smoke
 *
 * **Precondition for B5b1 (Codex iter-2 + iter-5 sequencing rule)**:
 * this flag must ship + be toggleable BEFORE B5b1 merges. Once B5b1+
 * consumes the flag, an operator can disable on-demand bootstrap at
 * runtime (env var) without a rebuild. This is the rollback safety
 * net for the largest blast-radius wave in PERF-INIT-V2.
 *
 * Env var name precedence (first truthy wins):
 *   1. `MFE_ON_DEMAND_BOOTSTRAP=1` (runtime env, cluster-side)
 *   2. `VITE_MFE_ON_DEMAND_BOOTSTRAP=1` (build-time env, Vite-injected)
 *
 * Default: OFF — current eager bootstrap unchanged.
 */

import { readEnvBoolean } from './env';

/**
 * Read the rollback feature flag for MFE on-demand bootstrap.
 *
 * Returns `true` only when an operator has explicitly opted in via env
 * (cluster runtime or Vite build-time). Defaults to `false` — the
 * current eager bootstrap path stays the canonical behaviour until
 * B5b1+ consumes the flag and is itself rolled out.
 */
export function isMfeOnDemandBootstrapEnabled(): boolean {
  return (
    readEnvBoolean('MFE_ON_DEMAND_BOOTSTRAP') ||
    readEnvBoolean('VITE_MFE_ON_DEMAND_BOOTSTRAP')
  );
}
