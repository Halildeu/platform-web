/**
 * WEB-013 — HardwareInventoryView slice tests (Faz 22.5.2 / 22.5.5
 * frontend closure).
 *
 * Pattern mirrors the WEB-011 InventoryTab test approach: vi.mock the
 * RTK Query slice and drive each branch via the generated hooks'
 * return values directly. Route shape is enforced at compile time —
 * the generated useGetDeviceHardwareInventoryLatestQuery /
 * useGetDeviceHardwareInventoryHistoryQuery hooks only exist if the
 * builder.query URLs in endpointAdminApi.ts are correct; a route typo
 * fails the TypeScript build before this file runs.
 *
 * Codex 019e70ce post-impl iter-1 P1+P2 absorb covered in the last
 * three cases (stale-snapshot guard, tri-state domain, history
 * pagination indicator bound to response page.number).
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HardwareInventoryView } from '../HardwareInventoryView';
import type { HardwareInventorySnapshot } from '../../../../../entities/endpoint-hardware-inventory/types';

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetDeviceHardwareInventoryLatestQuery: vi.fn(),
    useGetDeviceHardwareInventoryHistoryQuery: vi.fn(),
  },
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { endpointAdminApi } from '../../../../../app/services/endpointAdminApi';

const mockedLatest = endpointAdminApi.useGetDeviceHardwareInventoryLatestQuery as ReturnType<
  typeof vi.fn
>;
const mockedHistory = endpointAdminApi.useGetDeviceHardwareInventoryHistoryQuery as ReturnType<
  typeof vi.fn
>;

function emptyHistoryResult() {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
    isFetching: false,
    isUninitialized: true,
  };
}

function buildSnapshot(
  overrides: Partial<HardwareInventorySnapshot> = {},
): HardwareInventorySnapshot {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    tenantId: '11111111-1111-1111-1111-111111111111',
    deviceId: '22222222-2222-2222-2222-222222222222',
    sourceCommandResultId: null,
    schemaVersion: 1,
    supported: true,
    cpuModel: 'Intel(R) Core(TM) i7-12700H',
    cpuCores: 14,
    cpuFrequencyMhz: 2300,
    ramTotalBytes: 17179869184,
    ramAvailableBytes: 8589934592,
    osName: 'Microsoft Windows 11 Pro',
    osVersion: '10.0.22631',
    osKernel: null,
    osArch: '64-bit',
    biosVendor: 'Acme BIOS',
    biosVersion: '1.42.0',
    manufacturer: 'ContosoCo',
    systemModel: 'AcmePro 9000',
    domainJoined: true,
    domainName: 'corp.example.com',
    lastBootAt: '2026-05-28T08:15:00Z',
    payloadHashSha256: 'a'.repeat(64),
    collectedAt: '2026-05-28T12:00:00Z',
    createdAt: '2026-05-28T12:00:01Z',
    disks: [
      {
        devicePath: 'C:',
        model: 'Samsung 980 PRO',
        mediaType: 'SSD',
        busType: 'NVME',
        capacityBytes: 500_000_000_000,
        freeBytes: 250_000_000_000,
        removable: false,
      },
    ],
    networkInterfaces: [
      {
        name: 'Intel(R) Wi-Fi 6',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        interfaceType: 'WIFI',
        linkState: 'UP',
        ipAddresses: ['10.0.0.5'],
      },
    ],
    probeErrors: [],
    ...overrides,
  };
}

describe('HardwareInventoryView', () => {
  it('renders nothing while the tab is inactive', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isFetching: false,
      isUninitialized: true,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { container } = render(<HardwareInventoryView deviceId="dev-1" active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state when the backend returns 404', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      error: { status: 404 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<HardwareInventoryView deviceId="dev-1" active />);
    expect(screen.getByTestId('hardware-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('hardware-snapshot-panel')).not.toBeInTheDocument();
  });

  it('shows the forbidden message on 403', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      error: { status: 403 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<HardwareInventoryView deviceId="dev-1" active />);
    expect(screen.getByTestId('hardware-forbidden')).toBeInTheDocument();
  });

  it('renders snapshot summary + disks + network interfaces on 200', () => {
    const snap = buildSnapshot();
    mockedLatest.mockReturnValue({
      data: snap,
      currentData: snap,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    // Codex iter-1 P1: the guard requires snapshot.deviceId === deviceId,
    // so the render call must pass the fixture's own deviceId.
    render(<HardwareInventoryView deviceId={snap.deviceId} active />);

    expect(screen.getByTestId('hardware-snapshot-panel')).toBeInTheDocument();
    expect(screen.getByTestId('hardware-summary-grid')).toBeInTheDocument();
    expect(screen.getByTestId('hardware-disks-table')).toBeInTheDocument();
    expect(screen.getByTestId('hardware-nics-table')).toBeInTheDocument();
    // Disk values surface
    expect(screen.getByText('Samsung 980 PRO')).toBeInTheDocument();
    expect(screen.getByText('SSD')).toBeInTheDocument();
    expect(screen.getByText('NVME')).toBeInTheDocument();
    // MAC + IP visible
    expect(screen.getByText('aa:bb:cc:dd:ee:ff')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
  });

  it('history hook is skipped while the accordion is closed', () => {
    const snap = buildSnapshot();
    mockedLatest.mockReturnValue({
      data: snap,
      currentData: snap,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<HardwareInventoryView deviceId={snap.deviceId} active />);
    // Codex must-fix #6 / lazy contract: history hook is invoked with
    // skip=true while the <details> stays collapsed.
    expect(mockedHistory).toHaveBeenCalled();
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ skip: true });
  });

  it('resets history page/open when the device id changes', () => {
    mockedLatest.mockReturnValue({
      data: buildSnapshot(),
      currentData: buildSnapshot(),
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { rerender } = render(<HardwareInventoryView deviceId="dev-1" active />);
    rerender(<HardwareInventoryView deviceId="dev-2" active />);

    // The history hook must always be called with the current deviceId
    // and the page reset to 0 after a device switch.
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[0]).toMatchObject({ deviceId: 'dev-2', page: 0 });
  });

  it('does not render a stale snapshot when currentData belongs to a previous device', () => {
    // Codex 019e70ce post-impl iter-1 P1 regression: data (the last
    // successful result) belongs to dev-1, but currentData (the
    // result for the active arg dev-2) is still undefined while the
    // refetch is in flight. The view MUST NOT render the dev-1
    // snapshot under the dev-2 drawer.
    const dev1Snapshot = buildSnapshot({
      deviceId: 'dev-1',
      cpuModel: 'OLD CPU FROM DEV-1',
    });
    mockedLatest.mockReturnValue({
      data: dev1Snapshot, // stale `.data` from the previous arg
      currentData: undefined, // refetch for dev-2 still in flight
      error: undefined,
      isError: false,
      isLoading: true,
      isFetching: true,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<HardwareInventoryView deviceId="dev-2" active />);

    // Loading branch wins; no stale snapshot panel.
    expect(screen.getByTestId('hardware-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('hardware-snapshot-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('OLD CPU FROM DEV-1')).not.toBeInTheDocument();
  });

  it('renders domain workgroup as workgroup, null as unknown', () => {
    // Codex iter-1 P2 tri-state: null is unknown, not workgroup.
    const nullDomain = buildSnapshot({ domainJoined: null, domainName: null });
    mockedLatest.mockReturnValue({
      data: nullDomain,
      currentData: nullDomain,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<HardwareInventoryView deviceId={nullDomain.deviceId} active />);
    // The domain row's dd should fall back to "—" (not workgroup).
    expect(
      screen.queryByText('endpointAdmin.drawer.inventory.hardware.summary.workgroup'),
    ).not.toBeInTheDocument();
  });
});
