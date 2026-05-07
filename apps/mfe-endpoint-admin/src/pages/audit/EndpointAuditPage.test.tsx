import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { registerAuthTokenResolver } from '@mfe/shared-http';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import EndpointAuditPage from './EndpointAuditPage';

const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

const renderPage = () =>
  render(
    <ReduxProvider store={buildStore()}>
      <MemoryRouter>
        <EndpointAuditPage />
      </MemoryRouter>
    </ReduxProvider>,
  );

describe('EndpointAuditPage', () => {
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

  it('renders the audit event list with the default limit query', async () => {
    const payload = [
      {
        id: 'aaaa1111-2222-3333-4444-555566667777',
        tenantId: 't-1',
        deviceId: 'b1c2d3e4-1111-2222-3333-444455556666',
        commandId: null,
        eventType: 'DEVICE_ENROLLED',
        action: 'CREATE',
        performedBySubject: 'user:9001',
        correlationId: null,
        metadata: null,
        beforeState: null,
        afterState: null,
        occurredAt: '2026-05-05T09:00:00Z',
      },
    ];

    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('DEVICE_ENROLLED')).toBeInTheDocument();
    });
    expect(capturedUrl).toContain('/api/v1/admin/endpoint-audit-events');
    expect(capturedUrl).toContain('limit=50');
    expect(screen.getByTestId('endpoint-admin-audit-table')).toBeInTheDocument();
  });

  it('passes the device-id filter through to the backend query string', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url;
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderPage();
    const input = await screen.findByTestId('endpoint-admin-audit-filter-device');
    fireEvent.change(input, {
      target: { value: 'b1c2d3e4-1111-2222-3333-444455556666' },
    });

    await waitFor(() => {
      expect(capturedUrl).toContain('deviceId=b1c2d3e4-1111-2222-3333-444455556666');
    });
  });

  it('shows the forbidden state on 403', async () => {
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
