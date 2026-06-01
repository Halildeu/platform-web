import type { HotfixPostureSnapshot, HotfixPostureSnapshotSummary } from './types';

/**
 * WEB hotfix-posture truncation helper — Faz 22.5 (WEB-014G). Mirror of
 * the AG-036 `isPossiblyTruncated` helper + backend
 * `HotfixPostureSnapshotTruncation` (Codex 019e81fe iter-3 P1.3 +
 * 019e8245 iter-3 P1.7 — 3-leg OR).
 *
 * Rule (independent for installed + pending):
 *   installedPossiblyTruncated =
 *     installedTruncated === true                  // agent authoritative
 *     || installedPossiblyTruncated === true       // backend-computed
 *     || installedCount >= maxInstalled            // defence-in-depth
 *
 *   pendingPossiblyTruncated =
 *     pendingTruncated === true
 *     || pendingPossiblyTruncated === true
 *     || pendingTotalCount >= maxPending
 *
 * Why three legs:
 * - `*Truncated === true` is the AUTHORITATIVE agent signal (parser
 *   sets it when it dropped rows). View MUST trust + render the hint.
 * - `*PossiblyTruncated === true` is the backend-derived hint (same
 *   rule on the server); we trust it but never let a wrong / stale
 *   `false` SUPPRESS the hint when other signals fire.
 * - `count >= max` is the widened defence-in-depth fallback so an
 *   above-cap aggregate from any future bulk path cannot fail-open the
 *   hint.
 *
 * The OR composition guarantees the hint is rendered when ANY signal
 * agrees a truncation occurred — the client cannot accidentally HIDE
 * the hint because of a single misbehaving signal.
 */

export function isInstalledPossiblyTruncated(
  snapshot: HotfixPostureSnapshot | HotfixPostureSnapshotSummary,
): boolean {
  return (
    snapshot.installedTruncated === true ||
    snapshot.installedPossiblyTruncated === true ||
    snapshot.installedCount >= snapshot.maxInstalled
  );
}

export function isPendingPossiblyTruncated(
  snapshot: HotfixPostureSnapshot | HotfixPostureSnapshotSummary,
): boolean {
  return (
    snapshot.pendingTruncated === true ||
    snapshot.pendingPossiblyTruncated === true ||
    snapshot.pendingTotalCount >= snapshot.maxPending
  );
}
