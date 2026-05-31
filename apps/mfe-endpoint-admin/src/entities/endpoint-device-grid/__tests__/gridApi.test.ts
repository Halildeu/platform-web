import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportDevices, queryDevices } from '../../../app/services/endpointAdminApi';
import { DeviceGridExportError } from '../types';

/**
 * #1154 PR-3 — contract tests for the server-mode device grid fetchers.
 * No AG Grid: assert the request shape (URL, method, auth header, body),
 * the response parsing, and the structured-error handling against a mocked
 * global fetch.
 */
describe('device grid API (queryDevices / exportDevices)', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // readBearerToken falls back to localStorage when shell services aren't
    // configured (the test env) — see endpointAdminApi #655 rationale.
    window.localStorage.setItem('token', 'test-jwt');
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem('token');
    vi.restoreAllMocks();
  });

  it('queryDevices POSTs to /query with auth + body and returns the parsed page', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url;
      capturedInit = init;
      return new Response(
        JSON.stringify({ rows: [{ device_id: 'd1', hostname: 'h1' }], lastRow: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const res = await queryDevices({
      startRow: 0,
      endRow: 100,
      filterModel: { status: { filterType: 'set', values: ['ONLINE'] } },
      sortModel: [{ colId: 'hostname', sort: 'asc' }],
      quickFilterText: 'lab',
    });

    expect(capturedUrl).toContain('/api/v1/endpoint-admin/endpoint-devices/query');
    expect(capturedInit?.method).toBe('POST');
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-jwt');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({
      startRow: 0,
      endRow: 100,
      quickFilterText: 'lab',
    });
    expect(res.lastRow).toBe(1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].device_id).toBe('d1');
  });

  it('queryDevices throws DeviceGridExportError carrying the status code on 403', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as typeof fetch;

    await expect(
      queryDevices({
        startRow: 0,
        endRow: 50,
        filterModel: {},
        sortModel: [],
        quickFilterText: '',
      }),
    ).rejects.toMatchObject({ code: '403' });
  });

  it('exportDevices POSTs to /export and returns the blob + deterministic filename', async () => {
    let capturedBody: unknown;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response('col;col2\n1;2\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      });
    }) as typeof fetch;

    const { blob, filename } = await exportDevices({
      format: 'csv',
      exportMode: 'raw',
    });

    expect(capturedBody).toMatchObject({ format: 'csv', exportMode: 'raw' });
    expect(filename).toBe('endpoint-devices-raw.csv');
    expect(await blob.text()).toContain('col;col2');
  });

  it('exportDevices xlsx view filename + body carries filter/columns', async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      // jsdom's Response can't wrap a Blob (Blob.stream is unimplemented);
      // a string body is enough — this test only asserts filename + body.
      return new Response('xlsx-bytes', { status: 200 });
    }) as typeof fetch;

    const { filename } = await exportDevices({
      format: 'xlsx',
      exportMode: 'view',
      filterModel: { hostname: { filterType: 'text', type: 'contains', filter: 'lab' } },
      sortModel: [{ colId: 'hostname', sort: 'desc' }],
      quickFilterText: 'x',
      columns: ['hostname', 'status'],
    });

    expect(filename).toBe('endpoint-devices-view.xlsx');
    expect(capturedBody.exportMode).toBe('view');
    expect(capturedBody.columns).toEqual(['hostname', 'status']);
  });

  it('exportDevices throws DeviceGridExportError with code + limit on 422', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 'EXPORT_ROW_LIMIT_EXCEEDED', message: 'too many', limit: 50000 }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as typeof fetch;

    try {
      await exportDevices({ format: 'csv', exportMode: 'raw' });
      throw new Error('expected exportDevices to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceGridExportError);
      expect((error as DeviceGridExportError).code).toBe('EXPORT_ROW_LIMIT_EXCEEDED');
      expect((error as DeviceGridExportError).limit).toBe(50000);
    }
  });
});
