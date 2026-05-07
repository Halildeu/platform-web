/**
 * Phase 2 PR-Obs-5: PII-free fetch telemetry counters + bounded recent
 * event ring. Pairs with the auth-ready gate (PR-HTTP-3) and refresh
 * pipeline (PR-Refresh-4) to surface degraded transport behaviour to
 * the shell observer + degraded UI banner without ever leaking URL,
 * token, or response body.
 *
 * <p>Cardinality contract:
 * <ul>
 *   <li>{@code requestTotal} keyed by {@code <statusClass>xx_<METHOD>}</li>
 *   <li>{@code authNotReadyTotal} reason normalised to bounded enum</li>
 *   <li>{@code refreshAttemptTotal} only counts single-flight OWNERS</li>
 *   <li>{@code refreshWaiterTotal} separate counter for callers that
 *       coalesced onto an in-flight refresh (Codex iter-1 P0 #4)</li>
 *   <li>{@code recentRefreshFailures} bounded ring (max 20 entries,
 *       5 minute TTL); reason normalised to bounded enum</li>
 *   <li>{@code transportReadyDurationMs} gauge — single observation per
 *       auth epoch (caller is responsible; observer dedups via
 *       {@code recordedEpochRef})</li>
 * </ul>
 *
 * <p>URL is NEVER a label. Even after PII-stripping, route templates
 * vary across MFEs and would balloon cardinality without operator
 * benefit. Status + method gives 4×8 = 32 buckets which is plenty for
 * the rolling-window degraded UI heuristic and the periodic snapshot
 * emission.
 */

const RING_MAX_ENTRIES = 20;
const RING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SUBSCRIBER_THROTTLE_MS = 1000; // notify ≤ 1Hz

const HTTP_METHOD_VALUES = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'UNKNOWN',
] as const;
type HttpMethod = (typeof HTTP_METHOD_VALUES)[number];
type StatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';
type RequestKey = `${StatusClass}_${HttpMethod}`;

/**
 * Bounded reason enum for the auth-not-ready counter. Free-form
 * resolver reasons are mapped to one of these via
 * {@link normaliseAuthNotReadyReason}; raw error strings never reach
 * the counter map (Codex iter-1 P1: cardinality protection).
 */
export type AuthNotReadyReason =
  | 'failed'
  | 'unauthenticated'
  | 'resolver-throw'
  | 'unknown'
  | 'other';

/**
 * Bounded reason enum for refresh failures stored in the recent
 * failure ring (Codex iter-1 P1: only known shell-emitted reasons
 * land here; anything unrecognised becomes {@code 'other'}).
 */
export type RefreshFailureReason =
  | 'refresh-closure-failed'
  | 'handler-threw'
  | 'token-still-valid-or-missing'
  | 'unknown'
  | 'other';

export interface RecentRefreshFailure {
  readonly at: number;
  readonly reason: RefreshFailureReason;
}

export interface MetricsSnapshot {
  readonly requestTotal: Readonly<Partial<Record<RequestKey, number>>>;
  readonly authNotReadyTotal: Readonly<Record<AuthNotReadyReason, number>>;
  readonly refreshAttemptTotal: Readonly<{ ok: number; fail: number }>;
  readonly refreshWaiterTotal: number;
  readonly recentRefreshFailures: ReadonlyArray<RecentRefreshFailure>;
  readonly transportReadyDurationMs: number | null;
}

export type MetricsSubscriber = (snapshot: MetricsSnapshot) => void;
export type Unsubscribe = () => void;

interface MutableMetricsState {
  requestTotal: Map<RequestKey, number>;
  authNotReadyTotal: Record<AuthNotReadyReason, number>;
  refreshAttemptTotal: { ok: number; fail: number };
  refreshWaiterTotal: number;
  recentRefreshFailures: RecentRefreshFailure[];
  transportReadyDurationMs: number | null;
}

const createInitialState = (): MutableMetricsState => ({
  requestTotal: new Map(),
  authNotReadyTotal: {
    failed: 0,
    unauthenticated: 0,
    'resolver-throw': 0,
    unknown: 0,
    other: 0,
  },
  refreshAttemptTotal: { ok: 0, fail: 0 },
  refreshWaiterTotal: 0,
  recentRefreshFailures: [],
  transportReadyDurationMs: null,
});

let state: MutableMetricsState = createInitialState();
const subscribers = new Set<MetricsSubscriber>();
let throttleHandle: ReturnType<typeof setTimeout> | null = null;
let pendingNotify = false;

const normaliseMethod = (method: string | undefined): HttpMethod => {
  if (!method) return 'UNKNOWN';
  const upper = method.toUpperCase();
  return (HTTP_METHOD_VALUES as ReadonlyArray<string>).includes(upper)
    ? (upper as HttpMethod)
    : 'UNKNOWN';
};

const statusClassFor = (status: number): StatusClass | null => {
  if (status >= 100 && status < 200) return '1xx';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return null;
};

const KNOWN_AUTH_NOT_READY_REASONS = new Set<AuthNotReadyReason>([
  'failed',
  'unauthenticated',
  'resolver-throw',
  'unknown',
  'other',
]);

const normaliseAuthNotReadyReason = (reason: string | undefined): AuthNotReadyReason => {
  if (!reason) return 'unknown';
  if (KNOWN_AUTH_NOT_READY_REASONS.has(reason as AuthNotReadyReason)) {
    return reason as AuthNotReadyReason;
  }
  return 'other';
};

const KNOWN_REFRESH_FAILURE_REASONS = new Set<RefreshFailureReason>([
  'refresh-closure-failed',
  'handler-threw',
  'token-still-valid-or-missing',
  'unknown',
  'other',
]);

const normaliseRefreshFailureReason = (reason: string | undefined): RefreshFailureReason => {
  if (!reason) return 'unknown';
  if (KNOWN_REFRESH_FAILURE_REASONS.has(reason as RefreshFailureReason)) {
    return reason as RefreshFailureReason;
  }
  return 'other';
};

const pruneRecentFailures = (now: number): void => {
  const cutoff = now - RING_TTL_MS;
  state.recentRefreshFailures = state.recentRefreshFailures.filter((f) => f.at >= cutoff);
};

const buildSnapshot = (): MetricsSnapshot => {
  const requestTotal: Partial<Record<RequestKey, number>> = {};
  state.requestTotal.forEach((value, key) => {
    requestTotal[key] = value;
  });
  return Object.freeze({
    requestTotal: Object.freeze(requestTotal),
    authNotReadyTotal: Object.freeze({ ...state.authNotReadyTotal }),
    refreshAttemptTotal: Object.freeze({ ...state.refreshAttemptTotal }),
    refreshWaiterTotal: state.refreshWaiterTotal,
    recentRefreshFailures: Object.freeze(
      state.recentRefreshFailures.map((f) => Object.freeze({ ...f })),
    ),
    transportReadyDurationMs: state.transportReadyDurationMs,
  });
};

const scheduleNotify = (): void => {
  pendingNotify = true;
  if (throttleHandle !== null) {
    return;
  }
  throttleHandle = setTimeout(() => {
    throttleHandle = null;
    if (!pendingNotify) return;
    pendingNotify = false;
    const snapshot = buildSnapshot();
    subscribers.forEach((handler) => {
      try {
        handler(snapshot);
      } catch {
        // subscriber errors are non-fatal
      }
    });
  }, SUBSCRIBER_THROTTLE_MS);
};

/**
 * Record a completed HTTP response (success or error). Status is used
 * as-is to derive the bucket; URL is never recorded.
 */
export const recordResponse = (status: number | undefined, method: string | undefined): void => {
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    return;
  }
  const klass = statusClassFor(status);
  if (klass === null) {
    return;
  }
  const m = normaliseMethod(method);
  const key: RequestKey = `${klass}_${m}`;
  state.requestTotal.set(key, (state.requestTotal.get(key) ?? 0) + 1);
  scheduleNotify();
};

/**
 * Record a single-flight refresh OWNER attempt (Codex iter-1 P0 #4).
 * Callers that coalesced onto an in-flight refresh must use
 * {@link recordRefreshWaiter} instead.
 */
export const recordRefreshAttempt = (result: 'ok' | string): void => {
  const now = Date.now();
  if (result === 'ok') {
    state.refreshAttemptTotal.ok += 1;
  } else {
    state.refreshAttemptTotal.fail += 1;
    pruneRecentFailures(now);
    state.recentRefreshFailures = [
      ...state.recentRefreshFailures,
      { at: now, reason: normaliseRefreshFailureReason(result) },
    ].slice(-RING_MAX_ENTRIES);
  }
  scheduleNotify();
};

/**
 * Record a 401 caller that joined an already-in-flight refresh
 * (single-flight coalescing). Separate from
 * {@link recordRefreshAttempt} so a real refresh isn't double-counted.
 */
export const recordRefreshWaiter = (): void => {
  state.refreshWaiterTotal += 1;
  scheduleNotify();
};

/**
 * Record an auth-ready gate rejection. Reason is normalised to a
 * bounded enum to protect counter-key cardinality.
 */
export const recordAuthNotReady = (reason: string | undefined): void => {
  const normalised = normaliseAuthNotReadyReason(reason);
  state.authNotReadyTotal[normalised] += 1;
  scheduleNotify();
};

/**
 * Record the gauge value for time-to-transportReady (ms). Caller is
 * responsible for dedup per auth epoch — the observer
 * ({@code AuthFsmObserver}) uses {@code recordedEpochRef} to ensure
 * StrictMode / re-renders don't double-record.
 */
export const recordTransportReady = (durationMs: number): void => {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  state.transportReadyDurationMs = durationMs;
  scheduleNotify();
};

/**
 * Returns a deeply-frozen immutable snapshot of the current metrics.
 * Recent failure ring is pruned to the TTL window before returning.
 */
export const getMetricsSnapshot = (): MetricsSnapshot => {
  pruneRecentFailures(Date.now());
  return buildSnapshot();
};

/**
 * Subscribe to metrics changes. Notifications are throttled to ≤ 1Hz
 * so a burst of recordResponse calls doesn't trigger a render storm.
 * Returns an unsubscribe function.
 */
export const subscribeMetrics = (handler: MetricsSubscriber): Unsubscribe => {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
};

/**
 * Test-only export: reset metrics state to a fresh initial value and
 * cancel any pending throttled notification. Production callers must
 * not depend on this — counters are intentionally cumulative for the
 * lifetime of the page.
 */
export const __resetMetricsForTesting = (): void => {
  state = createInitialState();
  if (throttleHandle !== null) {
    clearTimeout(throttleHandle);
    throttleHandle = null;
  }
  pendingNotify = false;
  subscribers.clear();
};
