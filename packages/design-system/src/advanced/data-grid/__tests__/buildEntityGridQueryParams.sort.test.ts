import { describe, expect, it } from 'vitest';

import { buildEntityGridQueryParams } from '../buildEntityGridQueryParams';

/**
 * `sortFieldMap` exists because a grid's column ids and its backend's field
 * names are separate vocabularies, and the mismatch fails quietly: a backend
 * that validates `sort` against an allow-list drops what it does not recognise
 * and still returns rows, just in the default order. Nothing throws, nothing
 * logs, and the column looks sortable while doing nothing (gitops#3291).
 */
const request = (sortModel: Array<{ colId: string; sort: 'asc' | 'desc' }>) =>
  ({
    startRow: 0,
    endRow: 25,
    sortModel,
    filterModel: {},
    rowGroupCols: [],
    groupKeys: [],
    valueCols: [],
    pivotCols: [],
    pivotMode: false,
  }) as never;

describe('buildEntityGridQueryParams — sortFieldMap', () => {
  it('translates mapped column ids to their backend field names', () => {
    const params = buildEntityGridQueryParams({
      request: request([{ colId: 'username', sort: 'asc' }]),
      sortFieldMap: { username: 'kcUsername' },
    });

    expect(params.sort).toBe('kcUsername,asc');
  });

  it('passes unmapped column ids through unchanged', () => {
    const params = buildEntityGridQueryParams({
      request: request([{ colId: 'email', sort: 'desc' }]),
      sortFieldMap: { username: 'kcUsername' },
    });

    expect(params.sort).toBe('email,desc');
  });

  it('translates every entry of a multi-column sort', () => {
    const params = buildEntityGridQueryParams({
      request: request([
        { colId: 'fullName', sort: 'asc' },
        { colId: 'lastLoginAt', sort: 'desc' },
      ]),
      sortFieldMap: { fullName: 'name', lastLoginAt: 'lastLogin' },
    });

    expect(params.sort).toBe('name,asc;lastLogin,desc');
  });

  /** Callers that never pass a map must behave exactly as before. */
  it('is a no-op when no map is supplied', () => {
    const params = buildEntityGridQueryParams({
      request: request([{ colId: 'fullName', sort: 'asc' }]),
    });

    expect(params.sort).toBe('fullName,asc');
  });
});
