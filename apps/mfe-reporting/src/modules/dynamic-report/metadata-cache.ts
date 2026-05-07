import type { ColumnMeta } from '@mfe/design-system/advanced/data-grid';
import { fetchReportMetadata } from './api';
import type { ReportCapabilities, ReportColumnMeta } from './types';
import { getShellServices } from '../../app/services/shell-services';

/**
 * Phase 2 PR-Reporting-2 (MFE Auth Transport Contract): shared report
 * metadata cache + auth-ready gate + bounded concurrency.
 *
 * <p>Background. PR-Auth-1 (#302) removed the eager
 * {@code void ensureColumnMeta()} fan-out that produced the 574 cold-reload
 * {@code /metadata} requests on testai.acik.com. The remaining attack
 * surface is opening many reports in parallel (dashboard widgets,
 * deep-linked tabs) where each {@link createDynamicReportModule} factory
 * call held its OWN {@code metaPromise} cache — duplicate factory
 * instances for the same {@code report.key} re-fetched the same metadata.
 *
 * <p>This module is the canonical, repo-shared cache:
 * <ul>
 *   <li>Per-{@code reportKey} success cache (success values are reused
 *       indefinitely until {@code clearCache()} or an epoch bump).</li>
 *   <li>Per-{@code reportKey} in-flight promise share so two parallel
 *       callers issue exactly one HTTP request.</li>
 *   <li>{@code auth.ready()} gate — fail-closed return value for
 *       {@code unauthenticated}/{@code failed} phases (no protected HTTP
 *       request leaves the client before the auth FSM reaches
 *       {@code transportReady}).</li>
 *   <li>Bounded concurrency (default {@code 4}) so a 12-widget dashboard
 *       does not fan out 12 simultaneous metadata calls.</li>
 *   <li>Epoch-aware invalidation: {@code auth.getEpoch()} change (logout /
 *       re-login / {@code bumpAuthEpoch}) drops every cached entry so the
 *       new principal does not see the previous principal's allowed
 *       columns.</li>
 * </ul>
 *
 * <p>Failure handling: a failed fetch (network error, 5xx) is NOT cached
 * — the next {@code fetchMeta()} call retries. Only successful responses
 * (including empty {@code columns: []} from a valid backend) are cached.
 * This is a deliberate change from the prior per-factory behaviour which
 * cached the empty array indefinitely on the first error and prevented
 * recovery without a full page reload.
 */

export interface CachedMeta {
  columns: ColumnMeta[];
  capabilities: ReportCapabilities | undefined;
}

/** Default concurrency cap. Picked to keep dashboards smooth without bursting. */
const DEFAULT_MAX_CONCURRENT = 4;

interface CacheState {
  success: Map<string, CachedMeta>;
  inflight: Map<string, Promise<CachedMeta>>;
  inflightCount: number;
  waitQueue: Array<() => void>;
  lastSeenEpoch: number;
  maxConcurrent: number;
}

const state: CacheState = {
  success: new Map(),
  inflight: new Map(),
  inflightCount: 0,
  waitQueue: [],
  lastSeenEpoch: -1,
  maxConcurrent: DEFAULT_MAX_CONCURRENT,
};

/* -------------------------------------------------------------------------- */
/*  Backend ReportColumnMeta → Universal ColumnMeta                            */
/* -------------------------------------------------------------------------- */

export function mapBackendColumnMeta(col: ReportColumnMeta): ColumnMeta {
  const base = {
    field: col.field,
    headerNameKey: col.headerName,
    width: col.width,
  };

  switch (col.type) {
    case 'number':
      return {
        ...base,
        columnType: 'number' as const,
        decimals: col.decimals,
        suffix: col.suffix,
        prefix: col.prefix,
      };
    case 'date':
      return { ...base, columnType: 'date' as const };
    case 'badge':
      // Backend ships `variantMap: Record<string, string>` (variant name as
      // string). The grid component types the field with the design-system's
      // narrower `ColumnBadgeVariant` union — same wire shape, narrower
      // domain. Double-cast to acknowledge the intent without re-validating
      // each entry (the backend column metadata is trusted).
      return {
        ...base,
        columnType: 'badge' as const,
        variantMap: (col.variantMap ?? {}) as unknown as Record<
          string,
          import('@mfe/design-system/advanced/data-grid').ColumnBadgeVariant
        >,
        labelMap: col.labelMap,
      };
    case 'status':
      // Same trust boundary as badge. Backend `statusMap` shape matches
      // {variant, labelKey} but typed loosely; we accept the wire shape.
      return {
        ...base,
        columnType: 'status' as const,
        statusMap: (col.statusMap ?? {}) as unknown as Record<
          string,
          import('@mfe/design-system/advanced/data-grid').StatusMapEntry
        >,
      };
    case 'currency':
      return {
        ...base,
        columnType: 'currency' as const,
        currencyCode: col.currencyCode,
        decimals: col.decimals,
      };
    case 'boolean':
      return { ...base, columnType: 'boolean' as const };
    case 'percent':
      return { ...base, columnType: 'percent' as const, decimals: col.decimals };
    case 'enum':
      return {
        ...base,
        columnType: 'enum' as const,
        labelMap: col.labelMap ?? {},
      };
    default:
      return { ...base, columnType: 'text' as const };
  }
}

/* -------------------------------------------------------------------------- */
/*  Epoch invalidation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Reset the cache when the auth epoch advances (logout / re-login /
 * {@code bumpAuthEpoch}). The new principal must not see the previous
 * principal's metadata — particularly column allowlists which can vary
 * by role.
 */
function ensureFreshEpoch(): void {
  let epoch: number;
  try {
    epoch = getShellServices().auth.getEpoch();
  } catch {
    // shell-services not yet wired — leave the cache as-is. The
    // auth.ready() gate below will fail-close for the same reason.
    return;
  }
  if (epoch !== state.lastSeenEpoch) {
    state.lastSeenEpoch = epoch;
    state.success.clear();
    state.inflight.clear();
    // Note: we do NOT cancel in-flight promises here. Their
    // {@code finally} block will release the semaphore slot; the
    // caller still receives whatever the underlying fetch produces
    // (the result simply will not be cached for the new epoch).
  }
}

/* -------------------------------------------------------------------------- */
/*  Bounded concurrency semaphore                                              */
/* -------------------------------------------------------------------------- */

function acquireSlot(): Promise<void> {
  if (state.inflightCount < state.maxConcurrent) {
    state.inflightCount += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    state.waitQueue.push(() => {
      state.inflightCount += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  state.inflightCount = Math.max(0, state.inflightCount - 1);
  const next = state.waitQueue.shift();
  if (next) next();
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetch (or return cached) metadata for the given report key.
 *
 * <p>Resolves with a {@link CachedMeta} on success. Returns
 * {@code { columns: [], capabilities: undefined }} when:
 * <ul>
 *   <li>{@code auth.ready()} resolves with {@code !ok} (fail-closed —
 *       caller should not paint the grid).</li>
 *   <li>The fetch throws (5xx / network error). The error is NOT cached;
 *       the next call retries.</li>
 * </ul>
 *
 * <p>Identical concurrent calls share one underlying HTTP request via
 * the {@code inflight} map. The result is cached under the report key
 * once the fetch resolves successfully.
 */
export function fetchMeta(reportKey: string): Promise<CachedMeta> {
  ensureFreshEpoch();

  const cached = state.success.get(reportKey);
  if (cached) return Promise.resolve(cached);

  const inflight = state.inflight.get(reportKey);
  if (inflight) return inflight;

  // CRITICAL: build the in-flight promise SYNCHRONOUSLY and register it in
  // the inflight Map BEFORE the first `await`. Otherwise concurrent callers
  // all pass the inflight check before any of them stores the promise, and
  // we end up with N parallel fetches for the same key.
  const promise: Promise<CachedMeta> = (async (): Promise<CachedMeta> => {
    // Auth-ready gate: do NOT issue the HTTP request before the auth FSM
    // reaches transportReady. PR-Auth-1 (#302) flagged this as the root
    // cause of the 574 cold-reload 401 storm; this gate enforces it for
    // every metadata fetch from the reporting MFE. On non-ok we drop the
    // inflight entry (without caching the empty result) so the next call
    // retries once the auth FSM advances.
    let authResult: { ok: boolean };
    try {
      authResult = await getShellServices().auth.ready();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[mfe-reporting/metadata-cache] auth.ready() threw for ${reportKey}:`, err);
      }
      state.inflight.delete(reportKey);
      return emptyMeta();
    }

    if (!authResult.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          `[mfe-reporting/metadata-cache] auth not ready for ${reportKey}; skipping fetch`,
        );
      }
      state.inflight.delete(reportKey);
      return emptyMeta();
    }

    await acquireSlot();
    try {
      const meta = await fetchReportMetadata(reportKey);
      const result: CachedMeta = {
        columns: meta.columns.map(mapBackendColumnMeta),
        capabilities: meta.capabilities,
      };
      state.success.set(reportKey, result);
      return result;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[mfe-reporting/metadata-cache] fetch failed for ${reportKey}:`, err);
      }
      // Do NOT cache the failure — let the next caller retry.
      return emptyMeta();
    } finally {
      state.inflight.delete(reportKey);
      releaseSlot();
    }
  })();

  state.inflight.set(reportKey, promise);
  return promise;
}

/**
 * Synchronous read of cached columns. Returns {@code []} when no
 * successful fetch has resolved yet for the key. Mirrors the legacy
 * {@code getColumnMeta()} contract on {@link ReportModule}.
 */
export function getCachedColumns(reportKey: string): ColumnMeta[] {
  return state.success.get(reportKey)?.columns ?? [];
}

/**
 * Synchronous read of cached capabilities. Returns {@code undefined}
 * when no successful fetch has resolved yet for the key.
 */
export function getCachedCapabilities(reportKey: string): ReportCapabilities | undefined {
  return state.success.get(reportKey)?.capabilities;
}

/* -------------------------------------------------------------------------- */
/*  Test helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Reset all cache state. Test-only; production code paths invalidate via
 * the auth epoch tracker.
 */
export function __resetMetadataCacheForTest(): void {
  state.success.clear();
  state.inflight.clear();
  state.inflightCount = 0;
  state.waitQueue.length = 0;
  state.lastSeenEpoch = -1;
  state.maxConcurrent = DEFAULT_MAX_CONCURRENT;
}

/** Test-only: override the bounded-concurrency cap. */
export function __setMaxConcurrentForTest(n: number): void {
  state.maxConcurrent = Math.max(1, n);
}

/** Test-only: read the in-flight count snapshot. */
export function __getInflightCountForTest(): number {
  return state.inflightCount;
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                  */
/* -------------------------------------------------------------------------- */

function emptyMeta(): CachedMeta {
  return { columns: [], capabilities: undefined };
}
