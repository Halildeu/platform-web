import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import DeviceBulkActionsMenu, { type BulkSelectableDevice } from './DeviceBulkActionsMenu';

/**
 * Toolbar bulk-action menu (left of İndir). Uses the real RTK Query
 * endpointAdminApi with a mocked `fetch` (same harness as
 * EndpointDevicesPage.test.tsx) so the COLLECT_INVENTORY / compliance-evaluate
 * dispatch contract is exercised end-to-end through the slice.
 */
const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

const renderMenu = (
  getSelectedDevices: () => BulkSelectableDevice[],
  onNotice: ReturnType<typeof vi.fn> = vi.fn(),
  onAfterRun: ReturnType<typeof vi.fn> = vi.fn(),
) => {
  const store = buildStore();
  render(
    <ReduxProvider store={store} context={endpointAdminReduxContext}>
      <DeviceBulkActionsMenu
        getSelectedDevices={getSelectedDevices}
        onNotice={onNotice}
        onAfterRun={onAfterRun}
      />
    </ReduxProvider>,
  );
  return { onNotice, onAfterRun };
};

describe('DeviceBulkActionsMenu', () => {
  let originalFetch: typeof fetch;
  let calls: { url: string; method: string }[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.localStorage.setItem('token', 'fake-token');
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
      return new Response(JSON.stringify({ id: 'cmd-1', status: 'QUEUED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem('token');
    vi.restoreAllMocks();
  });

  it('renders the trigger and opens the menu with both actions', () => {
    renderMenu(() => []);
    const trigger = screen.getByTestId('device-bulk-actions-trigger');
    expect(trigger).toHaveTextContent(/İşlemler|Actions/);
    fireEvent.click(trigger);
    expect(screen.getByTestId('device-bulk-actions-menu')).toBeInTheDocument();
    expect(screen.getByTestId('device-bulk-collect')).toBeInTheDocument();
    expect(screen.getByTestId('device-bulk-evaluate')).toBeInTheDocument();
  });

  it('dispatches COLLECT_INVENTORY for every selected device and notifies success', async () => {
    const devices: BulkSelectableDevice[] = [
      { device_id: 'dev-1', hostname: 'h1' },
      { device_id: 'dev-2', hostname: 'h2' },
    ];
    const { onNotice, onAfterRun } = renderMenu(() => devices);
    fireEvent.click(screen.getByTestId('device-bulk-actions-trigger'));
    fireEvent.click(screen.getByTestId('device-bulk-collect'));

    await waitFor(() => {
      const cmdCalls = calls.filter((c) => c.url.includes('/commands') && c.method === 'POST');
      expect(cmdCalls.length).toBe(2);
    });
    await waitFor(() => expect(onNotice).toHaveBeenCalled());
    const lastCall = onNotice.mock.calls.at(-1)!;
    expect(lastCall[1]).toBe('success');
    expect(String(lastCall[0])).toMatch(/2/);
    expect(onAfterRun).toHaveBeenCalled();
  });

  it('dispatches compliance evaluate for every selected device', async () => {
    const { onNotice } = renderMenu(() => [{ device_id: 'dev-9', hostname: 'h9' }]);
    fireEvent.click(screen.getByTestId('device-bulk-actions-trigger'));
    fireEvent.click(screen.getByTestId('device-bulk-evaluate'));

    await waitFor(() => {
      const evalCalls = calls.filter(
        (c) => c.url.includes('/compliance/evaluate') && c.method === 'POST',
      );
      expect(evalCalls.length).toBe(1);
    });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.any(String), 'success'));
  });

  it('no-ops with an info notice and zero POSTs when nothing is selected', async () => {
    const { onNotice } = renderMenu(() => []);
    fireEvent.click(screen.getByTestId('device-bulk-actions-trigger'));
    fireEvent.click(screen.getByTestId('device-bulk-collect'));

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.any(String), 'info'));
    expect(calls.filter((c) => c.method === 'POST').length).toBe(0);
  });
});
