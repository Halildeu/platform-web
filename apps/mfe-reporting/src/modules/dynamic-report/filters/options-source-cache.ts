/**
 * Options-source cache for metadata-driven filter widgets.
 *
 * PR-D1b.B (Codex thread `019e8074`, 2026-06-01) — singleton cache that
 * resolves `FilterOptionsSource` to an array of `FilterOptionEntry`.
 *
 * **Three source modes** (mirrors backend `FilterOptionsSourceType`):
 *  - `static` — returns `definition.options` directly (no I/O).
 *  - `filter-values` — delegates to the existing
 *    `module.fetchFilterValues?(column)` already wired through
 *    `apps/mfe-reporting/src/modules/dynamic-report/api.ts:fetchFilterValues`.
 *    Values returned by the backend `GET /v1/reports/{key}/filter-values?
 *    column=...` endpoint.
 *  - `endpoint` — HTTP GET against the supplied path/URL with the same
 *    `X-Company-Id` header + auth wiring used by the rest of the dynamic-
 *    report API helpers. Cached by `(authEpoch, companyId, endpoint)`
 *    composite key.
 *
 * **Cache invariants:**
 *  - Singleton process-level cache (one per app instance), NOT bound to
 *    the `metadata-cache.ts` private state. The two caches share the
 *    auth epoch concept but have their own invalidation cadence —
 *    metadata invalidates only on logout / tenant switch; options
 *    invalidate on the same triggers + per-companyId scoping (because
 *    the same `endpoint` resolves to different option sets per tenant).
 *  - Auth epoch advance (logout / re-login) → entire cache wipe.
 *  - `companyId` change → cache entries keyed under the previous
 *    company stay in memory but are unreachable; new fetches re-key.
 *  - Failed fetches NOT cached → next call retries (matches metadata-
 *    cache failure semantics).
 *  - `__resetOptionsSourceCacheForTest` exported for vitest isolation.
 *
 * Cross-AI peer review (Codex iter-2 + iter-3): own auth+companyId scope,
 * NOT bound to metadata-cache private state. The boundary comment in
 * `metadata-cache.ts:getCachedFilterDefinitions` reaffirms this.
 */

import { getShellServices } from '../../../app/services/shell-services';
import type { FilterDefinition, FilterOptionEntry, FilterOptionsSource } from '../types';
import {
  buildCompanyHeaders,
  fetchFilterValues,
  resolveCompanyId,
  resolveHttpClient,
} from '../api';

/* -------------------------------------------------------------------------- */
/*  State                                                                     */
/* -------------------------------------------------------------------------- */

interface CacheState {
  /** Composite-key → resolved options array. */
  success: Map<string, FilterOptionEntry[]>;
  /** In-flight promises shared between concurrent callers on the same key. */
  inflight: Map<string, Promise<FilterOptionEntry[]>>;
  /** Last observed shell-services auth epoch. */
  lastSeenEpoch: number;
}

const state: CacheState = {
  success: new Map(),
  inflight: new Map(),
  lastSeenEpoch: 0,
};

/* -------------------------------------------------------------------------- */
/*  Auth epoch invalidation                                                   */
/* -------------------------------------------------------------------------- */

function ensureFreshEpoch(): void {
  let epoch: number;
  try {
    epoch = getShellServices().auth.getEpoch();
  } catch {
    // shell-services not yet wired — leave the cache as-is.
    return;
  }
  if (epoch !== state.lastSeenEpoch) {
    state.lastSeenEpoch = epoch;
    state.success.clear();
    state.inflight.clear();
  }
}

/* -------------------------------------------------------------------------- */
/*  Key composition                                                           */
/* -------------------------------------------------------------------------- */

function composeKey(source: FilterOptionsSource, reportKey: string): string {
  const epoch = state.lastSeenEpoch;
  const companyId = resolveCompanyId() ?? 'no-tenant';
  switch (source.type) {
    case 'endpoint':
      return `${epoch}::${companyId}::endpoint::${source.endpoint ?? ''}`;
    case 'filter-values':
      return `${epoch}::${companyId}::filter-values::${reportKey}::${source.column ?? ''}`;
    case 'static':
      // Static options never touch the cache (resolved synchronously below);
      // this branch only exists for exhaustiveness.
      return `${epoch}::${companyId}::static`;
    default:
      return `${epoch}::${companyId}::unknown`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the options for a `FilterDefinition`. Returns the inline
 * `options` when no `optionsSource` is configured, or delegates per
 * `optionsSource.type`. Throws on `endpoint` / `filter-values` failure
 * (caller should display an error state, not silently render empty).
 */
export async function resolveFilterOptions(
  definition: FilterDefinition,
  reportKey: string,
): Promise<FilterOptionEntry[]> {
  ensureFreshEpoch();

  // 1. No source AND inline options → trivially return inline.
  if (!definition.optionsSource) {
    return definition.options ?? [];
  }

  const source = definition.optionsSource;

  // 2. Source = static → return inline options (treated as authoritative).
  if (source.type === 'static') {
    return definition.options ?? [];
  }

  // 3. Source = filter-values → delegate to existing module API.
  if (source.type === 'filter-values') {
    const column = source.column;
    if (!column) {
      throw new Error('[options-source-cache] filter-values source requires `column`');
    }
    const key = composeKey(source, reportKey);
    return cachedOrFetch(key, () => loadFromFilterValues(reportKey, column));
  }

  // 4. Source = endpoint → http GET with auth + X-Company-Id headers.
  if (source.type === 'endpoint') {
    const endpoint = source.endpoint;
    if (!endpoint) {
      throw new Error('[options-source-cache] endpoint source requires `endpoint`');
    }
    const key = composeKey(source, reportKey);
    return cachedOrFetch(key, () => loadFromEndpoint(endpoint));
  }

  return [];
}

async function cachedOrFetch(
  key: string,
  loader: () => Promise<FilterOptionEntry[]>,
): Promise<FilterOptionEntry[]> {
  const cached = state.success.get(key);
  if (cached) return cached;

  const inflight = state.inflight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const result = await loader();
      state.success.set(key, result);
      return result;
    } finally {
      state.inflight.delete(key);
    }
  })();

  state.inflight.set(key, promise);
  return promise;
}

/* -------------------------------------------------------------------------- */
/*  Loaders                                                                   */
/* -------------------------------------------------------------------------- */

async function loadFromFilterValues(
  reportKey: string,
  column: string,
): Promise<FilterOptionEntry[]> {
  const result = await fetchFilterValues(reportKey, column);
  // `fetchFilterValues` returns `{ values: string[] }`. Map to FilterOptionEntry.
  const values = result?.values ?? [];
  return values.map((value) => ({ value }));
}

async function loadFromEndpoint(endpoint: string): Promise<FilterOptionEntry[]> {
  const client = resolveHttpClient();
  const { data } = await client.get<FilterOptionEntry[] | { items?: FilterOptionEntry[] }>(
    endpoint,
    { headers: buildCompanyHeaders() },
  );
  if (Array.isArray(data)) return data;
  // Defensive: backends may wrap in {items: [...]} envelope.
  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/*  Test helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Wipe the entire options-source cache. Test-only helper; intentionally
 * not part of the public component API.
 */
export function __resetOptionsSourceCacheForTest(): void {
  state.success.clear();
  state.inflight.clear();
  state.lastSeenEpoch = 0;
}
