import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import '@mfe/design-system/advanced/data-grid/setup';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import EndpointDevicesPage from './EndpointDevicesPage';

/**
 * #1154 PR-3 — the devices grid is now SERVER-mode (SSRM datasource →
 * POST /query) with the report-style İndir export. These tests are a
 * render smoke + a regression that the retired client-side export button
 * is gone; the fetch/auth/error contract is covered by the AG-Grid-free
 * gridApi.test.ts.
 */
const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

const renderPage = () => {
  const store = buildStore();
  return render(
    <ReduxProvider store={store} context={endpointAdminReduxContext}>
      <MemoryRouter>
        <EndpointDevicesPage />
      </MemoryRouter>
    </ReduxProvider>,
  );
};

const mockFetch = () =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/endpoint-devices/query')) {
      return new Response(JSON.stringify({ rows: [], lastRow: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // EntityGridTemplate variant-listing + anything else → empty.
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

describe('EndpointDevicesPage (server mode)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.localStorage.setItem('token', 'fake-token');
    globalThis.fetch = mockFetch();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem('token');
    vi.restoreAllMocks();
  });

  it('mounts the server-mode grid page', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('endpoint-admin-devices-page')).toBeInTheDocument();
    });
    expect(screen.getByText(/Uç Birimler|Endpoint Devices/)).toBeInTheDocument();
  });

  it('no longer renders the retired client-side inventory export button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('endpoint-admin-devices-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('inventory-export-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-snapshot-columns-notice')).not.toBeInTheDocument();
  });
});
