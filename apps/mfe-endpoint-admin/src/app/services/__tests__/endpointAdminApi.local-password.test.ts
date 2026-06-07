/**
 * AG-042 — endpointAdminApi local password command endpoint contract.
 *
 * The local-password path is deliberately separate from the generic
 * `/commands` mutation: the backend generates the one-time password and
 * returns it in the create response, while the browser sends only
 * username/reason/idempotency metadata.
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
      return new Response(
        JSON.stringify({
          command: { id: 'cmd-1', approvalStatus: 'PENDING', type: 'CHANGE_LOCAL_PASSWORD' },
          oneTimePassword: 'Generated-By-Backend-Only',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
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

describe('endpointAdminApi local password command — endpoint existence + hook', () => {
  it('createLocalPasswordChange is a mutation endpoint + hook exported', () => {
    expect(typeof endpointAdminApi.endpoints.createLocalPasswordChange.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.createLocalPasswordChange.matchFulfilled).toBe(
      'function',
    );
    expect(typeof endpointAdminApi.useCreateLocalPasswordChangeMutation).toBe('function');
  });
});

describe('endpointAdminApi local password command — URL / method / body contract', () => {
  it('POSTs the dedicated local-password path and never sends password material', async () => {
    const c = await capture('createLocalPasswordChange', {
      deviceId: 'dev-1',
      body: {
        username: 'localadmin',
        idempotencyKey: 'idem-local-1',
        reason: 'break-glass recovery',
      },
    });
    const u = new URL(c.url);
    expect(c.method).toBe('POST');
    expect(u.pathname).toMatch(
      /\/endpoint-admin\/endpoint-devices\/dev-1\/local-password-changes$/,
    );
    expect(JSON.parse(c.body)).toEqual({
      username: 'localadmin',
      idempotencyKey: 'idem-local-1',
      reason: 'break-glass recovery',
    });
    expect(c.body).not.toMatch(/newPassword|password|secret|credential/i);
  });

  it('url-encodes the deviceId path segment', async () => {
    const c = await capture('createLocalPasswordChange', {
      deviceId: 'dev/with space',
      body: { username: 'localadmin', reason: 'r' },
    });
    expect(c.url).toContain('/endpoint-devices/dev%2Fwith%20space/local-password-changes');
  });
});
