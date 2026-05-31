import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { registerAuthTokenResolver } from '@mfe/shared-http';
import '@mfe/design-system/advanced/data-grid/setup';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import EndpointDevicesPage from './EndpointDevicesPage';

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

const DEVICE_FIXTURE = {
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
    try {
      window.localStorage.removeItem('token');
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('mounts the EntityGridTemplate when devices are returned from the gateway', async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      calledUrls.push(url);
      // The endpoint-admin devices list is the only route this test cares
      // about. EntityGridTemplate also fires variant-listing requests
      // against /api/v1/variants — let those return empty arrays.
      return new Response(
        JSON.stringify(url.includes('endpoint-devices') ? [DEVICE_FIXTURE] : []),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('endpoint-admin-devices-page')).toBeInTheDocument();
    });
    expect(screen.getByText(/Uç Birimler|Endpoint Devices/)).toBeInTheDocument();
    expect(calledUrls.some((u) => u.includes('/api/v1/endpoint-admin/endpoint-devices'))).toBe(
      true,
    );
  });

  it('shows the empty state when the gateway returns an empty list', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(screen.queryByText(/yükleniyor|Loading/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Henüz kayıtlı cihaz yok|No devices enrolled yet/)).toBeInTheDocument();
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

  it('sends Authorization: Bearer from localStorage when shell services are not configured (#655 fallback)', async () => {
    let capturedAuthHeader: string | null = null;
    try {
      window.localStorage.setItem('token', 'ls-fallback-jwt-xyz');
    } catch {
      // ignore
    }
    globalThis.fetch = vi.fn(async (input, init) => {
      const requestHeaders =
        typeof input === 'string'
          ? init?.headers instanceof Headers
            ? init.headers
            : new Headers((init?.headers as HeadersInit | undefined) ?? {})
          : (input as Request).headers;
      capturedAuthHeader = requestHeaders.get('Authorization');
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderPage();

    await waitFor(() => {
      expect(capturedAuthHeader).toBe('Bearer ls-fallback-jwt-xyz');
    });

    try {
      window.localStorage.removeItem('token');
    } catch {
      // ignore
    }
  });

  // ── #1146: bulk-snapshot CSV-export v2 column wiring ────────────────

  /** Build a fetch mock that answers the devices list AND the
   *  /snapshots/latest bulk route distinctly (the snapshot URL also
   *  contains "endpoint-devices", so it must be matched FIRST). */
  const fetchMockWithSnapshots = (snapshotResponse: () => Response) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('snapshots/latest')) return snapshotResponse();
      return new Response(
        JSON.stringify(url.includes('endpoint-devices') ? [DEVICE_FIXTURE] : []),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

  it('surfaces a snapshot-columns notice when the bulk snapshots fetch fails (#1146)', async () => {
    globalThis.fetch = fetchMockWithSnapshots(
      () =>
        new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('export-snapshot-columns-notice')).toBeInTheDocument();
    });
    expect(screen.getByTestId('export-snapshot-columns-notice').textContent).toMatch(
      /alınamadı|could not be loaded/,
    );
  });

  it('surfaces a truncation notice when a snapshot group exceeds the cap (#1146)', async () => {
    globalThis.fetch = fetchMockWithSnapshots(
      () =>
        new Response(
          JSON.stringify({
            deviceHealth: [],
            deviceHealthTruncated: true,
            outdatedSoftware: [],
            outdatedSoftwareTruncated: false,
            limit: 10000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('export-snapshot-columns-notice')).toBeInTheDocument();
    });
    expect(screen.getByTestId('export-snapshot-columns-notice').textContent).toMatch(
      /limit|aşıldı|exceeded/,
    );
  });

  it('shows no notice and enables export when snapshots load cleanly (#1146)', async () => {
    globalThis.fetch = fetchMockWithSnapshots(
      () =>
        new Response(
          JSON.stringify({
            deviceHealth: [
              {
                deviceId: DEVICE_FIXTURE.id,
                supported: true,
                probeComplete: true,
                anyLowDisk: false,
                memoryUsedPercent: 42,
                memoryHighPressure: false,
                uptimeDays: 3,
                longUptimeWarning: false,
                collectedAt: '2026-05-30T12:00:00Z',
              },
            ],
            deviceHealthTruncated: false,
            outdatedSoftware: [
              {
                deviceId: DEVICE_FIXTURE.id,
                supported: true,
                probeComplete: true,
                upgradeCount: 2,
                upgradeTruncated: false,
                maxUpgrade: 512,
                possiblyTruncated: false,
                collectedAt: '2026-05-30T12:00:00Z',
              },
            ],
            outdatedSoftwareTruncated: false,
            limit: 10000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('endpoint-admin-devices-page')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('inventory-export-button')).not.toBeDisabled();
    });
    expect(screen.queryByTestId('export-snapshot-columns-notice')).not.toBeInTheDocument();
  });
});
