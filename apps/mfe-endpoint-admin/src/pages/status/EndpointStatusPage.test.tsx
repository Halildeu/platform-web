import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
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
    vi.restoreAllMocks();
  });

  it('renders the agent service status returned by /api/v1/endpoint-agents/status', async () => {
    const payload = {
      service: 'endpoint-admin-service',
      status: 'UP',
      apiVersion: 'v1',
      deviceCredentialProvider: 'unsupported',
      timestamp: '2026-05-05T08:00:00Z',
    };
    globalThis.fetch = vi.fn(async (url) => {
      const target = typeof url === 'string' ? url : (url as Request).url;
      expect(target).toContain('/api/v1/endpoint-agents/status');
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const store = buildStore();
    render(
      <ReduxProvider store={store}>
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
      <ReduxProvider store={store}>
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
