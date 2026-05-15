import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import {
  applyGrandTotalPinnedRow,
  buildGrandTotalPinnedRows,
  isRootSsrmRequest,
} from '../grand-total-pinned-row';
import type { GridRequest, GridResponse } from '../../../grid';

type TestRow = Record<string, unknown>;

/**
 * PR-0.5a (Codex threads 019e2c61 plan-time + 019e2ca8 post-impl):
 * regression coverage for the pinned-bottom grand-total wiring.
 * Backend emits the row only on root SSRM grouped (non-pivot) loads;
 * AG Grid can race two root requests, so we need an epoch guard +
 * normalized-request-based root detection.
 */
describe('isRootSsrmRequest', () => {
  it('returns true when groupKeys is empty', () => {
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: [] };
    expect(isRootSsrmRequest(req)).toBe(true);
  });

  it('returns true when groupKeys is undefined', () => {
    const req: GridRequest = { page: 1, pageSize: 50 };
    expect(isRootSsrmRequest(req)).toBe(true);
  });

  it('returns false when groupKeys carries at least one ancestor key', () => {
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: ['FIN'] };
    expect(isRootSsrmRequest(req)).toBe(false);
  });

  it('returns false for deep child stores', () => {
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      groupKeys: ['FIN', 'IST', '2024-Q4'],
    };
    expect(isRootSsrmRequest(req)).toBe(false);
  });
});

describe('buildGrandTotalPinnedRows', () => {
  it('wraps a populated grandTotalRow into a single-row array', () => {
    const res: GridResponse<TestRow> = {
      rows: [{ category: 'FIN' }],
      total: 1,
      grandTotalRow: { amount: 9999.99 },
    };
    expect(buildGrandTotalPinnedRows(res)).toEqual([{ amount: 9999.99 }]);
  });

  it('preserves null aggregate values (empty filter SUM/AVG semantics)', () => {
    const res: GridResponse<TestRow> = {
      rows: [],
      total: 0,
      // backend legitimately returns null for empty filter SUM/AVG,
      // weightedavg with zero denominator, percentile over empty set
      grandTotalRow: { amount: null, median_amount: null, qty: 42 },
    };
    const pinned = buildGrandTotalPinnedRows(res);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toEqual({ amount: null, median_amount: null, qty: 42 });
  });

  it('returns empty array when grandTotalRow is undefined', () => {
    const res: GridResponse<TestRow> = {
      rows: [{ id: 1 }],
      total: 1,
    };
    expect(buildGrandTotalPinnedRows(res)).toEqual([]);
  });

  it('returns empty array when grandTotalRow is null', () => {
    const res: GridResponse<TestRow> = {
      rows: [{ id: 1 }],
      total: 1,
      grandTotalRow: null,
    };
    expect(buildGrandTotalPinnedRows(res)).toEqual([]);
  });

  it('returns empty array when grandTotalRow is an empty object', () => {
    const res: GridResponse<TestRow> = {
      rows: [{ id: 1 }],
      total: 1,
      grandTotalRow: {},
    };
    expect(buildGrandTotalPinnedRows(res)).toEqual([]);
  });

  it('returns empty array for malformed array shape (rolling deploy)', () => {
    const res = {
      rows: [],
      total: 0,
      // a stale backend / dev typo could theoretically return an
      // array; the API layer drops it but defense-in-depth here too
      grandTotalRow: ['oops'] as unknown as Record<string, unknown>,
    };
    expect(buildGrandTotalPinnedRows(res)).toEqual([]);
  });
});

const mockApi = () => {
  const setGridOption = vi.fn();
  return {
    api: { setGridOption } as unknown as GridApi<TestRow>,
    setGridOption,
  };
};

describe('applyGrandTotalPinnedRow', () => {
  it('writes pinned row when root request is latest', () => {
    const { api, setGridOption } = mockApi();
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: [] };
    const res: GridResponse<TestRow> = {
      rows: [{ category: 'FIN' }],
      total: 1,
      grandTotalRow: { amount: 100 },
    };

    const wrote = applyGrandTotalPinnedRow({
      api,
      req,
      res,
      rootRequestId: 1,
      latestRootRequestId: 1,
    });

    expect(wrote).toBe(true);
    expect(setGridOption).toHaveBeenCalledWith('pinnedBottomRowData', [{ amount: 100 }]);
  });

  it('clears pinned row when latest root response omits grandTotalRow', () => {
    // Codex 019e2ca8 review: pivot toggle / filter narrowed to empty
    // set / capability flip all leave the latest root response
    // without grandTotalRow. Clear to [] so no stale total dangles.
    const { api, setGridOption } = mockApi();
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: [] };
    const res: GridResponse<TestRow> = {
      rows: [{ category: 'FIN' }],
      total: 1,
      // grandTotalRow intentionally absent
    };

    const wrote = applyGrandTotalPinnedRow({
      api,
      req,
      res,
      rootRequestId: 2,
      latestRootRequestId: 2,
    });

    expect(wrote).toBe(true);
    expect(setGridOption).toHaveBeenCalledWith('pinnedBottomRowData', []);
  });

  it('skips writes for child-store requests (preserves the global pinned row)', () => {
    // Drilling into a bucket: the pinned bottom row should stay
    // anchored to the root total set by a prior root request.
    const { api, setGridOption } = mockApi();
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: ['FIN'] };
    const res: GridResponse<TestRow> = {
      rows: [],
      total: 0,
      // child responses don't carry grandTotalRow anyway
    };

    const wrote = applyGrandTotalPinnedRow({
      api,
      req,
      res,
      rootRequestId: null,
      latestRootRequestId: 1,
    });

    expect(wrote).toBe(false);
    expect(setGridOption).not.toHaveBeenCalled();
  });

  it('drops late root responses when a newer root request is in flight (epoch guard)', () => {
    // Two root requests fired in quick succession:
    //   id 1 → fetch starts, epoch=1
    //   id 2 → fetch starts, epoch=2
    //   id 1 → resolves LATE
    //   id 2 → resolves
    // The late id 1 must not stomp id 2's pinned row.
    const { api, setGridOption } = mockApi();
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: [] };
    const stalRes: GridResponse<TestRow> = {
      rows: [],
      total: 0,
      grandTotalRow: { amount: 'stale' },
    };

    const wrote = applyGrandTotalPinnedRow({
      api,
      req,
      res: stalRes,
      rootRequestId: 1,
      latestRootRequestId: 2, // newer request bumped the epoch
    });

    expect(wrote).toBe(false);
    expect(setGridOption).not.toHaveBeenCalled();
  });

  it('survives api teardown mid-flight (swallows setGridOption throw)', () => {
    // Component unmount / route change can destroy the AG Grid api.
    // The helper must not bubble the error since the pinned row is a
    // UX enhancement, not load-bearing on the data render path.
    const setGridOption = vi.fn(() => {
      throw new Error('api destroyed');
    });
    const api = { setGridOption } as unknown as GridApi<TestRow>;
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: [] };
    const res: GridResponse<TestRow> = {
      rows: [],
      total: 0,
      grandTotalRow: { amount: 1 },
    };

    const wrote = applyGrandTotalPinnedRow({
      api,
      req,
      res,
      rootRequestId: 1,
      latestRootRequestId: 1,
    });

    expect(wrote).toBe(false);
    expect(setGridOption).toHaveBeenCalledTimes(1);
  });
});
