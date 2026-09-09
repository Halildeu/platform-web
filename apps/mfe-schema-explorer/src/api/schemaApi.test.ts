import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({
  default: { create: () => ({ get, interceptors: { request: { use: vi.fn() } } }) },
}));

import { schemaApi, scopedUrl } from './schemaApi';

/**
 * gitops#3605 — the service reads several catalogs. Every call must carry the
 * source the user picked; a call that drops it lands on Workcube and shows
 * Workcube's answer under an IFS name. That failure is silent, so it is pinned.
 */
describe('schema explorer API scope contract', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: [] });
  });

  it('lists sources, and lists schemas per source', async () => {
    await schemaApi.getSources();
    await schemaApi.getSchemas('ifs');
    await schemaApi.getSchemas(undefined);

    expect(get).toHaveBeenNthCalledWith(1, '/sources');
    expect(get).toHaveBeenNthCalledWith(2, '/schemas', { params: { source: 'ifs' } });
    expect(get).toHaveBeenNthCalledWith(3, '/schemas', { params: { source: undefined } });
  });

  it('carries source and schema on every snapshot-backed call', async () => {
    const scope = { source: 'ifs', schema: 'IFSAPP' };
    await schemaApi.getSnapshot(scope);
    await schemaApi.getTable('TRYPE_ALL_VOUCHER_QRY', scope);
    await schemaApi.searchColumns('VOUCHER', scope);
    await schemaApi.getImpact('X', 2, scope);
    await schemaApi.getDomains(scope);

    const scoped = { schema: 'IFSAPP', source: 'ifs' };
    expect(get).toHaveBeenNthCalledWith(1, '/snapshot', { params: scoped });
    expect(get).toHaveBeenNthCalledWith(2, '/tables/TRYPE_ALL_VOUCHER_QRY', { params: scoped });
    expect(get).toHaveBeenNthCalledWith(3, '/search/columns', { params: { q: 'VOUCHER', ...scoped } });
    expect(get).toHaveBeenNthCalledWith(4, '/impact/X', { params: { hops: 2, ...scoped } });
    expect(get).toHaveBeenNthCalledWith(5, '/domains', { params: scoped });
  });

  it('an absent scope stays on the primary lane with no source parameter', async () => {
    await schemaApi.getSnapshot(undefined);
    expect(get).toHaveBeenCalledWith('/snapshot', { params: { schema: undefined, source: undefined } });
  });

  it('scopedUrl keeps existing query parameters for the raw-fetch panels', () => {
    expect(scopedUrl('/path?from=A&to=B&limit=3', { source: 'ifs' }))
      .toBe('/api/v1/schema/path?from=A&to=B&limit=3&source=ifs');
    expect(scopedUrl('/health-score', { source: 'ifs', schema: 'IFSAPP' }))
      .toBe('/api/v1/schema/health-score?source=ifs&schema=IFSAPP');
    expect(scopedUrl('/drift', undefined)).toBe('/api/v1/schema/drift');
  });
});
