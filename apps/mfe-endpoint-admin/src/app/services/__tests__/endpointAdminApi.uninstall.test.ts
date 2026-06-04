/**
 * AG-028 Phase 3 — endpointAdminApi uninstall endpoint contract tests
 * (Codex 019e93a4 plan point #2 + #7).
 *
 * Verifies the four new RTK Query uninstall endpoints exist + are typed as
 * mutation/query, and (critically) that they build the correct gateway-
 * EXTERNAL `/endpoint-admin/...` URL + method + body. The keystone-bug
 * surface was the gateway slug path vs. the internal `/admin/...` path, so
 * the path contract is asserted by dispatching each endpoint through a real
 * store with a spied `fetch` and inspecting the outgoing Request — no
 * `.query` introspection (RTK does not expose the raw query builder on the
 * public endpoint object) and no live wire.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { endpointAdminApi } from '../endpointAdminApi';

function freshStore() {
  return configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (gdm) => gdm().concat(endpointAdminApi.middleware),
  });
}

type Captured = { url: string; method: string; body: string };

/**
 * Dispatch an endpoint through a fresh store with a spied global fetch and
 * capture the outgoing Request's url/method/body. fetchBaseQuery calls
 * `fetch(Request)`; we resolve it with a benign empty JSON array so the
 * thunk settles.
 */
async function capture(endpoint: string, arg: unknown): Promise<Captured> {
  const store = freshStore();
  let captured: Captured | null = null;
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      captured = {
        url: req.url,
        method: req.method,
        body: req.method === 'GET' || req.method === 'HEAD' ? '' : await req.clone().text(),
      };
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  await store.dispatch(
    (
      endpointAdminApi.endpoints as unknown as Record<string, { initiate: (a: unknown) => unknown }>
    )[endpoint].initiate(arg) as never,
  );
  spy.mockRestore();
  if (!captured) throw new Error(`fetch was not called for endpoint ${endpoint}`);
  return captured;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('endpointAdminApi uninstall — endpoint existence + hooks', () => {
  it('createUninstall is a mutation endpoint + hook exported', () => {
    expect(typeof endpointAdminApi.endpoints.createUninstall.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.createUninstall.matchFulfilled).toBe('function');
    expect(typeof endpointAdminApi.useCreateUninstallMutation).toBe('function');
  });

  it('approveUninstall is a mutation endpoint + hook exported', () => {
    expect(typeof endpointAdminApi.endpoints.approveUninstall.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.approveUninstall.matchFulfilled).toBe('function');
    expect(typeof endpointAdminApi.useApproveUninstallMutation).toBe('function');
  });

  it('listUninstallRequests is a query endpoint + hook exported', () => {
    expect(typeof endpointAdminApi.endpoints.listUninstallRequests.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.listUninstallRequests.select).toBe('function');
    expect(typeof endpointAdminApi.useListUninstallRequestsQuery).toBe('function');
  });

  it('listUninstallAudits is a query endpoint + hook exported', () => {
    expect(typeof endpointAdminApi.endpoints.listUninstallAudits.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.listUninstallAudits.select).toBe('function');
    expect(typeof endpointAdminApi.useListUninstallAuditsQuery).toBe('function');
  });
});

describe('endpointAdminApi uninstall — URL / method / body contract (spied fetch)', () => {
  const pathOf = (url: string) => new URL(url).pathname;

  it('createUninstall POSTs the gateway-external slug path with the body verbatim', async () => {
    const c = await capture('createUninstall', {
      deviceId: 'dev-1',
      body: {
        catalogItemId: 'be026-smoke-7zip-registry',
        idempotencyKey: 'idem-123',
        reason: 'license revoked',
      },
    });
    expect(c.method).toBe('POST');
    expect(pathOf(c.url)).toMatch(/\/endpoint-admin\/endpoint-devices\/dev-1\/uninstalls$/);
    // Body forwarded verbatim — the slug (not a UUID) is what the backend
    // resolves; idempotencyKey + reason pass straight through.
    expect(JSON.parse(c.body)).toEqual({
      catalogItemId: 'be026-smoke-7zip-registry',
      idempotencyKey: 'idem-123',
      reason: 'license revoked',
    });
  });

  it('createUninstall url-encodes the deviceId path segment', async () => {
    const c = await capture('createUninstall', {
      deviceId: 'dev/with space',
      body: { catalogItemId: 'x' },
    });
    expect(c.url).toContain('/endpoint-devices/dev%2Fwith%20space/uninstalls');
  });

  it('approveUninstall POSTs the {requestId}/approve sub-path with the reason body', async () => {
    const c = await capture('approveUninstall', {
      deviceId: 'dev-1',
      requestId: 'req-9',
      body: { reason: 'approved by security' },
    });
    expect(c.method).toBe('POST');
    expect(pathOf(c.url)).toMatch(/\/endpoint-devices\/dev-1\/uninstalls\/req-9\/approve$/);
    expect(JSON.parse(c.body)).toEqual({ reason: 'approved by security' });
  });

  it('approveUninstall sends an empty object body when no reason supplied', async () => {
    // Backend declares the approve body @RequestBody(required=false); the
    // builder always sends an object so Content-Type is set + Jackson binds.
    const c = await capture('approveUninstall', { deviceId: 'dev-1', requestId: 'req-9' });
    expect(JSON.parse(c.body)).toEqual({});
  });

  it('approveUninstall url-encodes both path segments', async () => {
    const c = await capture('approveUninstall', { deviceId: 'd 1', requestId: 'r/2' });
    expect(c.url).toContain('/endpoint-devices/d%201/uninstalls/r%2F2/approve');
  });

  it('listUninstallRequests GETs the device uninstalls list with default paging', async () => {
    const c = await capture('listUninstallRequests', { deviceId: 'dev-1' });
    expect(c.method).toBe('GET');
    const u = new URL(c.url);
    expect(u.pathname).toMatch(/\/endpoint-devices\/dev-1\/uninstalls$/);
    expect(u.searchParams.get('page')).toBe('0');
    expect(u.searchParams.get('size')).toBe('50');
  });

  it('listUninstallRequests honours explicit paging', async () => {
    const c = await capture('listUninstallRequests', { deviceId: 'dev-1', page: 2, size: 10 });
    const u = new URL(c.url);
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('size')).toBe('10');
  });

  it('listUninstallAudits GETs the /uninstalls/history sub-path', async () => {
    const c = await capture('listUninstallAudits', { deviceId: 'dev-1' });
    expect(c.method).toBe('GET');
    const u = new URL(c.url);
    expect(u.pathname).toMatch(/\/endpoint-devices\/dev-1\/uninstalls\/history$/);
    expect(u.searchParams.get('page')).toBe('0');
    expect(u.searchParams.get('size')).toBe('10');
  });
});

describe('endpointAdminApi uninstall — store integration', () => {
  it('createUninstall initiate dispatches through the middleware', () => {
    const store = freshStore();
    const handle = store.dispatch(
      endpointAdminApi.endpoints.createUninstall.initiate({
        deviceId: 'dev-1',
        body: { catalogItemId: 'app-x', idempotencyKey: 'k', reason: 'r' },
      }) as never,
    );
    expect(handle).toBeDefined();
    if (handle && typeof (handle as { abort?: () => void }).abort === 'function') {
      (handle as { abort: () => void }).abort();
    }
  });
});
