/**
 * PR-0.4g (2026-05-15): variant-state sync fix coverage. AG Grid SSRM
 * keeps {@link GridRequest#valueCols} populated from the variant state
 * even after the user removes the last row-group chip. Without the
 * normaliser the backend dispatcher sees stale aggregation intent and
 * trips {@code GROUPING_NOT_SUPPORTED} (live testai bug 2026-05-15).
 *
 * The unit suite pins every transition the dispatcher cares about:
 *   - no group / no pivot / no expansion + valueCols → drop valueCols
 *   - row-group present → leave untouched (grouped query OK)
 *   - pivot mode active → leave untouched (pivot path OK)
 *   - ancestor groupKeys set → leave untouched (drill-down path OK)
 */
import { describe, expect, it } from 'vitest';

import { normalizeServerSideRequest, type GridRequest } from './index';

const baseRequest = (overrides: Partial<GridRequest> = {}): GridRequest => ({
  page: 1,
  pageSize: 50,
  startRow: 0,
  endRow: 50,
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
  groupKeys: [],
  filterModel: undefined,
  sortModel: undefined,
  ...overrides,
});

describe('normalizeServerSideRequest', () => {
  it('drops stale valueCols + groupKeys when no grouping/pivot/expansion is requested', () => {
    // Live testai bug repro: variant removed row-group but AG Grid
    // kept valueCols → backend GROUPING_NOT_SUPPORTED. Normaliser
    // collapses the request to a flat query so the dispatcher routes
    // it to the legacy executeQuery path.
    const req = baseRequest({
      rowGroupCols: [],
      pivotCols: [],
      pivotMode: false,
      groupKeys: [],
      valueCols: [{ id: 'AMOUNT', field: 'AMOUNT', displayName: 'AMOUNT', aggFunc: 'sum' }],
    });
    const out = normalizeServerSideRequest(req);
    expect(out.valueCols).toEqual([]);
    expect(out.groupKeys).toEqual([]);
    expect(out.rowGroupCols).toEqual([]);
    expect(out.pivotMode).toBe(false);
  });

  it('leaves a grouped request untouched (rowGroupCols populated)', () => {
    const req = baseRequest({
      rowGroupCols: [{ id: 'CATEGORY', field: 'CATEGORY', displayName: 'CATEGORY', aggFunc: null }],
      valueCols: [{ id: 'AMOUNT', field: 'AMOUNT', displayName: 'AMOUNT', aggFunc: 'sum' }],
    });
    const out = normalizeServerSideRequest(req);
    expect(out).toBe(req);
  });

  it('leaves a pivoted request untouched (pivotMode true)', () => {
    const req = baseRequest({
      rowGroupCols: [{ id: 'CATEGORY', field: 'CATEGORY', displayName: 'CATEGORY', aggFunc: null }],
      valueCols: [{ id: 'AMOUNT', field: 'AMOUNT', displayName: 'AMOUNT', aggFunc: 'sum' }],
      pivotCols: [{ id: 'BA', field: 'BA', displayName: 'BA', aggFunc: null }],
      pivotMode: true,
    });
    const out = normalizeServerSideRequest(req);
    expect(out).toBe(req);
  });

  it('leaves a drill-down request untouched (groupKeys non-empty)', () => {
    const req = baseRequest({
      rowGroupCols: [{ id: 'CATEGORY', field: 'CATEGORY', displayName: 'CATEGORY', aggFunc: null }],
      valueCols: [{ id: 'AMOUNT', field: 'AMOUNT', displayName: 'AMOUNT', aggFunc: 'sum' }],
      groupKeys: ['FIN'],
    });
    const out = normalizeServerSideRequest(req);
    expect(out).toBe(req);
  });

  it('leaves a pivotCols-only payload untouched (covers AG Grid mid-toggle race)', () => {
    // AG Grid emits pivotCols before pivotMode flips to true during a
    // drag — normaliser must not strip the in-flight signal.
    const req = baseRequest({
      pivotCols: [{ id: 'BA', field: 'BA', displayName: 'BA', aggFunc: null }],
      pivotMode: false,
      valueCols: [{ id: 'AMOUNT', field: 'AMOUNT', displayName: 'AMOUNT', aggFunc: 'sum' }],
    });
    const out = normalizeServerSideRequest(req);
    expect(out).toBe(req);
  });

  it('returns the same object when there is nothing to normalise (no valueCols)', () => {
    // Flat request without any aggregation columns must skip the
    // {…request} spread so callers can rely on referential equality
    // for memoisation / strict-mode logging.
    const req = baseRequest();
    const out = normalizeServerSideRequest(req);
    expect(out).toBe(req);
  });
});
