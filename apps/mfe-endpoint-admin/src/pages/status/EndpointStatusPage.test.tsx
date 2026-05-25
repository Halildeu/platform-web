import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { registerAuthTokenResolver } from '@mfe/shared-http';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import EndpointStatusPage from './EndpointStatusPage';

const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

describe('EndpointStatusPage', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Reset shared-http resolver so other specs aren't poisoned.
    registerAuthTokenResolver(undefined);
    // Faz 22 #655 — clean up the localStorage-fallback token between tests
    // so the "omits Authorization" spec can't see a leftover from spec #1.
    try {
      window.localStorage.removeItem('token');
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('renders the agent service status returned by /api/v1/endpoint-agents/status', async () => {
    // Faz 22 #655 — `endpointAdminApi.ts` `readBearerToken` resolves the
    // Bearer from `localStorage.token` (the fallback after the
    // shell-injected `getShellServices().auth.getToken()`; the original
    // `@mfe/shared-http` `resolveAuthToken` path was dropped — MF
    // singleton sharing is not effective for this MFE, see #655).
    window.localStorage.setItem('token', 'fake-jwt-token');

    const payload = {
      service: 'endpoint-admin-service',
      status: 'UP',
      apiVersion: 'v1',
      deviceCredentialProvider: 'unsupported',
      timestamp: '2026-05-05T08:00:00Z',
    };
    let capturedAuthHeader: string | null = null;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      expect(url).toContain('/api/v1/endpoint-agents/status');
      // RTK Query may pass headers via the second arg or via a Request
      // constructor — capture from whichever path supplied them.
      // RTK Query çağrı şekli: `fetch(new Request(url, { headers, ... }))`.
      // Test fetch'i hem Request input + (boş) init alıyor; Authorization
      // header'ını Request nesnesinin kendi `.headers`'ı taşıyor.
      const requestHeaders =
        typeof input === 'string'
          ? init?.headers instanceof Headers
            ? init.headers
            : new Headers((init?.headers as HeadersInit | undefined) ?? {})
          : (input as Request).headers;
      capturedAuthHeader = requestHeaders.get('Authorization');
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const store = buildStore();
    render(
      <ReduxProvider store={store} context={endpointAdminReduxContext}>
        <MemoryRouter>
          <EndpointStatusPage />
        </MemoryRouter>
      </ReduxProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('endpoint-admin-service')).toBeInTheDocument();
    });
    expect(screen.getByText('UP')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('unsupported')).toBeInTheDocument();
    expect(capturedAuthHeader).toBe('Bearer fake-jwt-token');
  });

  it('omits the Authorization header when no token resolver is registered', async () => {
    registerAuthTokenResolver(undefined);

    let capturedAuthHeader: string | null = 'sentinel';
    globalThis.fetch = vi.fn(async (input, init) => {
      const requestHeaders =
        typeof input === 'string'
          ? init?.headers instanceof Headers
            ? init.headers
            : new Headers((init?.headers as HeadersInit | undefined) ?? {})
          : (input as Request).headers;
      capturedAuthHeader = requestHeaders.get('Authorization');
      return new Response(
        JSON.stringify({
          service: 'x',
          status: 'UP',
          apiVersion: 'v1',
          deviceCredentialProvider: 'x',
          timestamp: '2026-05-05T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const store = buildStore();
    render(
      <ReduxProvider store={store} context={endpointAdminReduxContext}>
        <MemoryRouter>
          <EndpointStatusPage />
        </MemoryRouter>
      </ReduxProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('UP')).toBeInTheDocument();
    });
    expect(capturedAuthHeader).toBeNull();
  });

  it('shows the error state when the backend rejects the request', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as typeof fetch;

    const store = buildStore();
    render(
      <ReduxProvider store={store} context={endpointAdminReduxContext}>
        <MemoryRouter>
          <EndpointStatusPage />
        </MemoryRouter>
      </ReduxProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toContain('401');
  });
});
