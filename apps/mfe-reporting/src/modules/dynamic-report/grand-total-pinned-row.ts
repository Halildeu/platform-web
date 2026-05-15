/**
 * PR-0.5a (Codex threads 019e2c61 plan-time + 019e2ca8 post-impl):
 * pinned-bottom grand-total row wiring helpers. Keep the decision
 * surface (root detection, epoch guard, malformed-shape filter) out
 * of the giant ReportPage.tsx so it can be unit-tested without
 * spinning up the full ReportingProviders shell.
 *
 * Backend contract recap (platform-backend PR #213): the response
 * envelope carries an optional `grandTotalRow: Map<String, Object>`
 * field on root SSRM grouped (non-pivot) responses. Map keys mirror
 * the aggregation aliases; values may legitimately be `null` (empty
 * filter SUM/AVG, weightedavg denominator zero, percentile over
 * empty set). Child-store / flat / pivot responses omit the field.
 */
import type { GridApi } from 'ag-grid-community';
import type { GridRequest, GridResponse } from '../../grid';

/**
 * Returns true iff the normalized SSRM request represents a root-store
 * load — i.e. the user is looking at the top-level buckets, not inside
 * an expanded ancestor. The backend gates `grandTotalRow` on
 * `currentLevel == 0`, which mirrors an empty `groupKeys` array on the
 * normalized request.
 *
 * Important: pass the NORMALIZED request (after
 * {@code normalizeServerSideRequest}), not the raw AG Grid SSRM
 * snapshot. AG Grid can emit stale `groupKeys` during partial pivot /
 * flat degradation; the backend always sees the normalized payload,
 * so the FE root-detection must agree with the backend's view to
 * avoid stale-pinned-row drift.
 */
export const isRootSsrmRequest = (req: GridRequest): boolean =>
  !Array.isArray(req.groupKeys) || req.groupKeys.length === 0;

/**
 * Decide what to write to `pinnedBottomRowData` for the response.
 *
 * - Backend emitted a populated `grandTotalRow` → wrap into a
 *   single-row array; AG Grid renders one pinned-bottom row.
 * - Backend omitted the field, returned `null`, or returned an empty
 *   map → clear the pinned-bottom row so a previous global total
 *   doesn't dangle on screen.
 * - Backend returned a non-object / array (rolling-deploy mismatch) →
 *   the API layer already drops it; this helper just sees `undefined`.
 */
export const buildGrandTotalPinnedRows = <TRow>(res: GridResponse<TRow>): TRow[] => {
  if (
    res.grandTotalRow &&
    typeof res.grandTotalRow === 'object' &&
    !Array.isArray(res.grandTotalRow) &&
    Object.keys(res.grandTotalRow).length > 0
  ) {
    return [res.grandTotalRow as TRow];
  }
  return [];
};

/**
 * Epoch-guarded write of `pinnedBottomRowData` to the live grid API.
 *
 * - Non-root requests are no-ops (the global pinned row stays as the
 *   root-request set it).
 * - Root requests must come in monotonic order; an out-of-order
 *   stale root response drops on the floor by epoch mismatch. AG Grid
 *   SSRM can race two roots (rapid filter / sort / nav); without this
 *   guard the older response can stomp the newer pinned row.
 * - The `setGridOption` call is wrapped in try/catch because the api
 *   may be torn down mid-flight (component unmount, route change).
 *   The pinned row is a UX enhancement, not load-bearing on the data
 *   render path, so swallowing the teardown race is safe.
 *
 * Returns `true` iff the helper actually wrote to the grid (root +
 * latest epoch); `false` otherwise. Callers can use this for tests
 * or telemetry.
 */
export const applyGrandTotalPinnedRow = <TRow>(args: {
  api: GridApi<TRow>;
  req: GridRequest;
  res: GridResponse<TRow>;
  rootRequestId: number | null;
  latestRootRequestId: number;
}): boolean => {
  const { api, req, res, rootRequestId, latestRootRequestId } = args;
  if (!isRootSsrmRequest(req)) return false;
  if (rootRequestId === null) return false;
  if (rootRequestId !== latestRootRequestId) return false;

  const pinnedRows = buildGrandTotalPinnedRows(res);
  try {
    api.setGridOption('pinnedBottomRowData', pinnedRows);
    return true;
  } catch {
    return false;
  }
};
