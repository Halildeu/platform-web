// @vitest-environment jsdom
/**
 * Options-source cache tests (PR-D1b.B step 3).
 *
 * Codex thread `019e8074` iter-3 AGREE.
 *
 * Cases pinned:
 *  - `static` source → returns inline options without I/O
 *  - `filter-values` source → delegates to module.fetchFilterValues
 *  - `endpoint` source → http GET with X-Company-Id headers, cache hit
 *    on second call
 *  - Auth epoch advance → cache invalidated
 *  - companyId scope → cache keyed per-tenant
 *  - In-flight promise shared between concurrent callers
 *  - Failed fetch NOT cached → next call retries
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getShellServices: vi.fn(),
  fetchFilterValues: vi.fn(),
  resolveCompanyId: vi.fn(),
  resolveHttpClient: vi.fn(),
  buildCompanyHeaders: vi.fn(),
}));

vi.mock('../../../../app/services/shell-services', () => ({
  getShellServices: mocks.getShellServices,
}));

vi.mock('../../api', () => ({
  buildCompanyHeaders: mocks.buildCompanyHeaders,
  fetchFilterValues: mocks.fetchFilterValues,
  resolveCompanyId: mocks.resolveCompanyId,
  resolveHttpClient: mocks.resolveHttpClient,
}));

const mockGetShellServices = mocks.getShellServices;
const mockFetchFilterValues = mocks.fetchFilterValues;
const mockResolveCompanyId = mocks.resolveCompanyId;
const mockResolveHttpClient = mocks.resolveHttpClient;
const mockBuildCompanyHeaders = mocks.buildCompanyHeaders;

import { __resetOptionsSourceCacheForTest, resolveFilterOptions } from '../options-source-cache';
import type { FilterDefinition } from '../../types';

const def = (overrides: Partial<FilterDefinition>): FilterDefinition => ({
  key: 'k',
  kind: 'enum-select',
  ...overrides,
});

beforeEach(() => {
  __resetOptionsSourceCacheForTest();
  mockGetShellServices.mockReset();
  mockFetchFilterValues.mockReset();
  mockResolveCompanyId.mockReset();
  mockResolveHttpClient.mockReset();
  mockBuildCompanyHeaders.mockReset();
  mockBuildCompanyHeaders.mockReturnValue({ 'X-Company-Id': '7' });
  mockResolveCompanyId.mockReturnValue('7');
  mockGetShellServices.mockReturnValue({ auth: { getEpoch: () => 1 } });
});

describe('resolveFilterOptions', () => {
  it('static source returns inline options without I/O', async () => {
    const inline = [
      { value: 'A', label: 'Alpha' },
      { value: 'B', label: 'Bravo' },
    ];
    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        options: inline,
        optionsSource: { type: 'static' },
      }),
      'report-key',
    );
    expect(result).toEqual(inline);
    expect(mockFetchFilterValues).not.toHaveBeenCalled();
    expect(mockResolveHttpClient).not.toHaveBeenCalled();
  });

  it('no optionsSource → returns inline options', async () => {
    const inline = [{ value: 'X' }];
    const result = await resolveFilterOptions(
      def({ key: 'STATUS', options: inline }),
      'report-key',
    );
    expect(result).toEqual(inline);
  });

  it('static source with no inline options → empty array', async () => {
    const result = await resolveFilterOptions(
      def({ key: 'STATUS', optionsSource: { type: 'static' } }),
      'report-key',
    );
    expect(result).toEqual([]);
  });

  it('filter-values source delegates to module fetchFilterValues', async () => {
    mockFetchFilterValues.mockResolvedValueOnce({
      values: ['ACTIVE', 'INACTIVE'],
    });
    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        optionsSource: { type: 'filter-values', column: 'STATUS_COL' },
      }),
      'report-key',
    );
    expect(mockFetchFilterValues).toHaveBeenCalledWith('report-key', 'STATUS_COL');
    expect(result).toEqual([{ value: 'ACTIVE' }, { value: 'INACTIVE' }]);
  });

  it('filter-values source missing column → throws', async () => {
    await expect(
      resolveFilterOptions(
        def({
          key: 'STATUS',
          optionsSource: { type: 'filter-values' },
        }),
        'report-key',
      ),
    ).rejects.toThrow(/column/);
  });

  it('endpoint source GETs with X-Company-Id headers', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ value: 'A' }, { value: 'B' }],
    });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
      }),
      'report-key',
    );

    expect(get).toHaveBeenCalledWith('/v1/lookup/status', {
      headers: { 'X-Company-Id': '7' },
    });
    expect(result).toEqual([{ value: 'A' }, { value: 'B' }]);
  });

  it('endpoint source missing endpoint → throws', async () => {
    await expect(
      resolveFilterOptions(
        def({ key: 'STATUS', optionsSource: { type: 'endpoint' } }),
        'report-key',
      ),
    ).rejects.toThrow(/endpoint/);
  });

  it('endpoint source caches second call (single network round-trip)', async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ value: 'A' }] });
    mockResolveHttpClient.mockReturnValue({ get });
    const definition = def({
      key: 'STATUS',
      optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
    });

    await resolveFilterOptions(definition, 'report-key');
    await resolveFilterOptions(definition, 'report-key');

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('endpoint source DOES re-fetch on auth epoch advance', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ value: 'A' }] })
      .mockResolvedValueOnce({ data: [{ value: 'B' }] });
    mockResolveHttpClient.mockReturnValue({ get });
    const definition = def({
      key: 'STATUS',
      optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
    });

    await resolveFilterOptions(definition, 'report-key');

    // Logout → re-login: shell epoch advances
    mockGetShellServices.mockReturnValue({ auth: { getEpoch: () => 2 } });

    const result = await resolveFilterOptions(definition, 'report-key');
    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ value: 'B' }]);
  });

  it('endpoint source scopes cache by companyId (tenant switch re-fetches)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ value: 'A7' }] })
      .mockResolvedValueOnce({ data: [{ value: 'A8' }] });
    mockResolveHttpClient.mockReturnValue({ get });
    const definition = def({
      key: 'STATUS',
      optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
    });

    mockResolveCompanyId.mockReturnValue('7');
    await resolveFilterOptions(definition, 'report-key');

    // Tenant switch
    mockResolveCompanyId.mockReturnValue('8');
    const result = await resolveFilterOptions(definition, 'report-key');

    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ value: 'A8' }]);
  });

  it('in-flight promise shared between concurrent callers (single fetch)', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    const get = vi.fn().mockReturnValue(
      new Promise((res) => {
        resolveGet = res;
      }),
    );
    mockResolveHttpClient.mockReturnValue({ get });
    const definition = def({
      key: 'STATUS',
      optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
    });

    const a = resolveFilterOptions(definition, 'report-key');
    const b = resolveFilterOptions(definition, 'report-key');

    resolveGet({ data: [{ value: 'A' }] });

    const [resultA, resultB] = await Promise.all([a, b]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(resultA).toEqual([{ value: 'A' }]);
    expect(resultB).toEqual([{ value: 'A' }]);
  });

  it('failed endpoint fetch is NOT cached — next call retries', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: [{ value: 'A' }] });
    mockResolveHttpClient.mockReturnValue({ get });
    const definition = def({
      key: 'STATUS',
      optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
    });

    await expect(resolveFilterOptions(definition, 'report-key')).rejects.toThrow('boom');

    // Retry: succeeds
    const result = await resolveFilterOptions(definition, 'report-key');
    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ value: 'A' }]);
  });

  it('endpoint source accepts {items: [...]} envelope', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { items: [{ value: 'A' }, { value: 'B' }] },
    });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
      }),
      'report-key',
    );

    expect(result).toEqual([{ value: 'A' }, { value: 'B' }]);
  });

  it('endpoint source non-array, non-envelope data → empty array', async () => {
    const get = vi.fn().mockResolvedValue({ data: 'unexpected' });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        optionsSource: { type: 'endpoint', endpoint: '/v1/lookup/status' },
      }),
      'report-key',
    );

    expect(result).toEqual([]);
  });

  /* --------------------------------------------------------------------- */
  /*  Iter-4 normalization fixes (Codex 019e8074 findings #2 + #3)         */
  /* --------------------------------------------------------------------- */

  it('endpoint List<String> shape (DashboardController.filter-options) → normalized to {value}', async () => {
    // Backend signature: ResponseEntity<List<String>>
    // e.g. /v1/dashboards/hr-compensation/filter-options/department → ['Sales','HR']
    const get = vi.fn().mockResolvedValue({ data: ['Sales', 'HR', 'Engineering'] });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'DEPT',
        optionsSource: {
          type: 'endpoint',
          endpoint: '/v1/dashboards/hr-compensation/filter-options/department',
        },
      }),
      'report-key',
    );
    expect(result).toEqual([{ value: 'Sales' }, { value: 'HR' }, { value: 'Engineering' }]);
  });

  it('endpoint primitive array stringifies numbers and booleans', async () => {
    const get = vi.fn().mockResolvedValue({ data: [42, true, 'Sales'] });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'COL',
        optionsSource: { type: 'endpoint', endpoint: '/x' },
      }),
      'report-key',
    );
    expect(result).toEqual([{ value: '42' }, { value: 'true' }, { value: 'Sales' }]);
  });

  it('endpoint payload drops nulls + invalid entries', async () => {
    const get = vi.fn().mockResolvedValue({ data: ['A', null, undefined, { notValue: 'x' }, 'B'] });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'COL',
        optionsSource: { type: 'endpoint', endpoint: '/x' },
      }),
      'report-key',
    );
    expect(result).toEqual([{ value: 'A' }, { value: 'B' }]);
  });

  it('endpoint typed object array passes through with label/labelKey preserved', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        { value: 'A', label: 'Alpha' },
        { value: 'B', labelKey: 'options.b' },
      ],
    });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'COL',
        optionsSource: { type: 'endpoint', endpoint: '/x' },
      }),
      'report-key',
    );
    expect(result).toEqual([
      { value: 'A', label: 'Alpha', labelKey: undefined },
      { value: 'B', label: undefined, labelKey: 'options.b' },
    ]);
  });

  it('endpoint object with numeric value field → stringified', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ value: 7, label: 'Seven' }],
    });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'COL',
        optionsSource: { type: 'endpoint', endpoint: '/x' },
      }),
      'report-key',
    );
    expect(result).toEqual([{ value: '7', label: 'Seven', labelKey: undefined }]);
  });

  it('endpoint envelope {items: [...]} primitive array normalizes', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { items: ['Active', 'Inactive'] },
    });
    mockResolveHttpClient.mockReturnValue({ get });

    const result = await resolveFilterOptions(
      def({
        key: 'COL',
        optionsSource: { type: 'endpoint', endpoint: '/x' },
      }),
      'report-key',
    );
    expect(result).toEqual([{ value: 'Active' }, { value: 'Inactive' }]);
  });

  it('filter-values mode normalizes raw mixed values (drops nulls, stringifies primitives)', async () => {
    // Backend FilterValuesResult.values = Array<string|number|boolean|null>
    mockFetchFilterValues.mockResolvedValueOnce({
      values: ['Active', 42, true, null, 'Inactive'],
    });

    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        optionsSource: { type: 'filter-values', column: 'STATUS_COL' },
      }),
      'report-key',
    );
    expect(result).toEqual([
      { value: 'Active' },
      { value: '42' },
      { value: 'true' },
      // null dropped
      { value: 'Inactive' },
    ]);
  });

  it('filter-values mode handles empty backend payload', async () => {
    mockFetchFilterValues.mockResolvedValueOnce({ values: [] });
    const result = await resolveFilterOptions(
      def({
        key: 'STATUS',
        optionsSource: { type: 'filter-values', column: 'STATUS_COL' },
      }),
      'report-key',
    );
    expect(result).toEqual([]);
  });
});
