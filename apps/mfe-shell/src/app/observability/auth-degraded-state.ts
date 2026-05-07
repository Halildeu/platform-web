import type { MetricsSnapshot } from '@mfe/shared-http';
import type { AuthPhase } from '../../features/auth/model/auth.slice';

const SLOW_INIT_THRESHOLD_MS = 30_000;
const RECENT_REFRESH_WINDOW_MS = 60_000;
const RECENT_REFRESH_FAIL_THRESHOLD = 2;

export type DegradedReason = 'slow-init' | 'recent-refresh-failures';

export interface DegradedState {
  readonly degraded: boolean;
  readonly reason: DegradedReason | null;
}

/**
 * Phase 2 PR-Obs-5 (Codex iter-1 P1 #2 absorb): derive degraded UI
 * state from {@code phase}, bootstrap timing, and the metrics
 * snapshot's bounded recent-failure ring.
 *
 * <p>Decision tree (priority order):
 * <ol>
 *   <li>{@code phase === 'failed'}: NOT degraded. Root failed UI in
 *       {@code AppRouter} already surfaces a technical-error message;
 *       a global banner would duplicate it (Codex iter-0 P1 #2).</li>
 *   <li>Slow init: phase still pre-terminal AND
 *       {@code now - bootstrapStartAt > 30s}. Bootstrap genuinely
 *       took too long; user should reload or check connectivity.</li>
 *   <li>Recent refresh failures: more than 2 entries in the bounded
 *       ring within the last 60 seconds. Token rotation is failing
 *       repeatedly; user likely needs to re-login.</li>
 * </ol>
 *
 * <p>Pure function — same inputs always produce the same output.
 * Used by both the banner component (consumes derived state) and
 * the test suite (asserts the threshold logic in isolation).
 */
export const selectAuthDegradedState = (
  phase: AuthPhase,
  bootstrapStartAt: number,
  metrics: MetricsSnapshot,
  now: number,
): DegradedState => {
  if (phase === 'failed') {
    return { degraded: false, reason: null };
  }

  // After the early-return above the type is narrowed; we still spell
  // out the terminal-phase exclusion explicitly for readability.
  const isPreTerminal = phase !== 'transportReady' && phase !== 'unauthenticated';
  if (isPreTerminal && now - bootstrapStartAt > SLOW_INIT_THRESHOLD_MS) {
    return { degraded: true, reason: 'slow-init' };
  }

  const cutoff = now - RECENT_REFRESH_WINDOW_MS;
  const recentFailures = metrics.recentRefreshFailures.filter((f) => f.at >= cutoff);
  if (recentFailures.length > RECENT_REFRESH_FAIL_THRESHOLD) {
    return { degraded: true, reason: 'recent-refresh-failures' };
  }

  return { degraded: false, reason: null };
};

export const __TEST_ONLY__ = {
  SLOW_INIT_THRESHOLD_MS,
  RECENT_REFRESH_WINDOW_MS,
  RECENT_REFRESH_FAIL_THRESHOLD,
};
