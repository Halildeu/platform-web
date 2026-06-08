import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import { FULL_COLLECT_INVENTORY_PAYLOAD } from '../../entities/endpoint-command/collectInventory';
import DeviceBulkActionsMenu, { type BulkSelectableDevice } from './DeviceBulkActionsMenu';

/**
 * Toolbar bulk-action menu (left of İndir). Uses the real RTK Query
 * endpointAdminApi with a mocked `fetch` (same harness as
 * EndpointDevicesPage.test.tsx) so the COLLECT_INVENTORY / compliance-evaluate
 * dispatch contract is exercised end-to-end through the slice — including the
 * canonical full-snapshot payload and the ONLINE-only collect guard
 * (Codex 019ea756 must-fix #1 + #2).
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

type Call = { url: string; method: string; body?: Record<string, unknown> };

const commandPosts = (calls: Call[]) =>
  calls.filter((c) => c.url.includes('/commands') && c.method === 'POST');

describe('DeviceBulkActionsMenu', () => {
  let originalFetch: typeof fetch;
  let calls: Call[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.localStorage.setItem('token', 'fake-token');
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // Mirror endpointAdminApi.uninstall.test.ts: wrap into a Request so the
      // body is readable whether fetch is called as fetch(Request) OR the
      // unwrapped fetch(url, init) form (endpointAdminApi uses
      // unwrapRequestFetchFn — the body then lives on `init`).
      const req = input instanceof Request ? input : new Request(String(input), init);
      const url = req.url;
      const method = req.method.toUpperCase();
      let body: Record<string, unknown> | undefined;
      try {
        if (method !== 'GET' && method !== 'HEAD') {
          const text = await req.clone().text();
          body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
        }
      } catch {
        body = undefined;
      }
      calls.push({ url, method, body });
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

  it('does NOT open on hover; opens only on click and toggles closed (matches İndir)', () => {
    renderMenu(() => []);
    const trigger = screen.getByTestId('device-bulk-actions-trigger');
    const wrapper = trigger.closest('[data-component="device-bulk-actions-menu"]') as HTMLElement;

    // hover over the trigger / wrapper must NOT open the menu
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseOver(trigger);
    expect(screen.queryByTestId('device-bulk-actions-menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // a click opens it
    fireEvent.click(trigger);
    expect(screen.getByTestId('device-bulk-actions-menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // mouse-leaving does NOT close it (no hover-driven close timer anymore)
    fireEvent.mouseLeave(wrapper);
    expect(screen.getByTestId('device-bulk-actions-menu')).toBeInTheDocument();

    // a second click toggles it closed
    fireEvent.click(trigger);
    expect(screen.queryByTestId('device-bulk-actions-menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('dispatches a FULL-snapshot COLLECT_INVENTORY per ONLINE device with distinct idempotency keys', async () => {
    const devices: BulkSelectableDevice[] = [
      { device_id: 'dev-1', hostname: 'h1', status: 'ONLINE' },
      { device_id: 'dev-2', hostname: 'h2', status: 'ONLINE' },
    ];
    const { onNotice, onAfterRun } = renderMenu(() => devices);
    fireEvent.click(screen.getByTestId('device-bulk-actions-trigger'));
    fireEvent.click(screen.getByTestId('device-bulk-collect'));

    await waitFor(() => expect(commandPosts(calls).length).toBe(2));
    const posts = commandPosts(calls);
    for (const c of posts) {
      expect(c.body?.type).toBe('COLLECT_INVENTORY');
      // canonical full-snapshot payload (every opt-in probe bit), same as drawer
      expect(c.body?.payload).toMatchObject(FULL_COLLECT_INVENTORY_PAYLOAD);
      expect(c.body?.idempotencyKey).toEqual(expect.any(String));
    }
    // distinct idempotency key per device
    expect(new Set(posts.map((c) => c.body?.idempotencyKey)).size).toBe(2);

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.any(String), 'success'));
    expect(onAfterRun).toHaveBeenCalled();
  });

  it('skips non-ONLINE devices for collect and reports the skip (info)', async () => {
    const devices: BulkSelectableDevice[] = [
      { device_id: 'on-1', hostname: 'on1', status: 'ONLINE' },
      { device_id: 'off-1', hostname: 'off1', status: 'OFFLINE' },
    ];
    const { onNotice } = renderMenu(() => devices);
    fireEvent.click(screen.getByTestId('device-bulk-actions-trigger'));
    fireEvent.click(screen.getByTestId('device-bulk-collect'));

    await waitFor(() => expect(commandPosts(calls).length).toBe(1));
    expect(commandPosts(calls)[0].url).toContain('on-1'); // only the ONLINE device
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.any(String), 'info'));
  });

  it('refuses collect when no selected device is ONLINE (info, zero POSTs)', async () => {
    const { onNotice } = renderMenu(() => [
      { device_id: 'off-9', hostname: 'o', status: 'OFFLINE' },
    ]);
    fireEvent.click(screen.getByTestId('device-bulk-actions-trigger'));
    fireEvent.click(screen.getByTestId('device-bulk-collect'));

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.any(String), 'info'));
    expect(calls.filter((c) => c.method === 'POST').length).toBe(0);
  });

  it('dispatches compliance evaluate for every selected device regardless of status', async () => {
    const { onNotice } = renderMenu(() => [
      { device_id: 'dev-9', hostname: 'h9', status: 'OFFLINE' },
    ]);
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
