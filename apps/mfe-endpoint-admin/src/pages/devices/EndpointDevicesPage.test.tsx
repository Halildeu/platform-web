import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { registerAuthTokenResolver } from '@mfe/shared-http';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import EndpointDevicesPage from './EndpointDevicesPage';

const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

const renderPage = () => {
  const store = buildStore();
  return render(
    <ReduxProvider store={store}>
      <MemoryRouter>
        <EndpointDevicesPage />
      </MemoryRouter>
    </ReduxProvider>,
  );
};

describe('EndpointDevicesPage', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    registerAuthTokenResolver(() => 'fake-token');
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    registerAuthTokenResolver(undefined);
    vi.restoreAllMocks();
  });

  it('renders the device list returned by /api/v1/admin/endpoint-devices', async () => {
    const payload = [
      {
        id: 'b1c2d3e4-1111-2222-3333-444455556666',
        tenantId: 't-1',
        hostname: 'workstation-001',
        displayName: 'Workstation 001',
        osType: 'WINDOWS',
        osVersion: '11 23H2',
        agentVersion: '1.4.0',
        machineFingerprint: 'abc',
        domainName: 'corp.local',
        status: 'ONLINE',
        lastSeenAt: '2026-05-05T08:00:00Z',
        enrolledAt: '2026-04-01T00:00:00Z',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-05-05T08:00:00Z',
      },
    ];

    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      expect(url).toContain('/api/v1/admin/endpoint-devices');
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('workstation-001')).toBeInTheDocument();
    });
    expect(screen.getByTestId('endpoint-admin-devices-table')).toBeInTheDocument();
    expect(screen.getByTestId('device-status-ONLINE')).toBeInTheDocument();
    expect(screen.getByText('1.4.0')).toBeInTheDocument();
  });

  it('shows the empty state when the device list is empty', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(screen.queryByText(/yükleniyor/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('endpoint-admin-devices-table')).not.toBeInTheDocument();
  });

  it('shows the forbidden state on 403 from the OpenFGA RequireModule interceptor', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toContain('403');
  });
});
