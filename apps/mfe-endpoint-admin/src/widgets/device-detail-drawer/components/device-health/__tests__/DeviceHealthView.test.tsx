/**
 * WEB device-health view slice tests — Faz 22.5 second wave (AG-033).
 *
 * Pattern mirrors the WEB-013 HardwareInventoryView test approach:
 * vi.mock the RTK Query slice and drive each branch via the generated
 * hooks' return values directly. Route shape is enforced at compile
 * time — the generated useGetDeviceHealthLatestQuery /
 * useGetDeviceHealthHistoryQuery hooks only exist if the builder.query
 * URLs in endpointAdminApi.ts are correct; a route typo fails the
 * TypeScript build before this file runs.
 *
 * The three healthy/warning/unsupported snapshots are the contract's
 * golden examples loaded VERBATIM
 *   (schema/endpoint-device-health-payload-v1.schema.json `examples`),
 * which the contract designates as the cross-repo regression corpus
 * (backend ingest + web render MUST accept/render each).
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeviceHealthView } from '../DeviceHealthView';
import type { DeviceHealthSnapshot } from '../../../../../entities/endpoint-device-health/types';

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetDeviceHealthLatestQuery: vi.fn(),
    useGetDeviceHealthHistoryQuery: vi.fn(),
  },
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { endpointAdminApi } from '../../../../../app/services/endpointAdminApi';

const mockedLatest = endpointAdminApi.useGetDeviceHealthLatestQuery as ReturnType<typeof vi.fn>;
const mockedHistory = endpointAdminApi.useGetDeviceHealthHistoryQuery as ReturnType<typeof vi.fn>;

function emptyHistoryResult() {
  return {
    data: undefined,
    currentData: undefined,
    error: undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    isUninitialized: true,
  };
}

// ---------------------------------------------------------------------------
// Contract golden examples (schema `examples`), loaded verbatim. These are
// the AG-033 v1 payload blocks; the backend folds a persistence envelope
// (deviceId / collectedAt) around them at ingest, which the type tolerates.
// ---------------------------------------------------------------------------

/** Golden example #1 — healthy. */
const GOLDEN_HEALTHY: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  fixedDisks: [
    {
      driveLetter: 'C:',
      totalBytes: 536870912000,
      freeBytes: 268435456000,
      freePercent: 50,
      lowDiskWarning: false,
    },
  ],
  fixedDiskCount: 1,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memory: {
    totalPhysicalBytes: 17179869184,
    availableBytes: 9663676416,
    usedPercent: 42,
    highPressureWarning: false,
    commitLimitBytes: 25769803776,
    commitUsedBytes: 10307921920,
  },
  uptime: {
    lastBootEpochSec: 1748275200,
    uptimeSeconds: 259200,
    uptimeDays: 3,
    longUptimeWarning: false,
  },
  anyLowDisk: false,
  sourceUsed: 'win32',
  probeDurationMs: 12,
};

/** Golden example #2 — low-disk + high-pressure + long-uptime. */
const GOLDEN_WARNING: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  fixedDisks: [
    {
      driveLetter: 'C:',
      totalBytes: 536870912000,
      freeBytes: 5368709120,
      freePercent: 1,
      lowDiskWarning: true,
    },
  ],
  fixedDiskCount: 1,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memory: {
    totalPhysicalBytes: 17179869184,
    availableBytes: 1073741824,
    usedPercent: 95,
    highPressureWarning: true,
    commitLimitBytes: 34359738368,
    commitUsedBytes: 25769803776,
  },
  uptime: {
    lastBootEpochSec: 1745683200,
    uptimeSeconds: 2851200,
    uptimeDays: 33,
    longUptimeWarning: true,
  },
  anyLowDisk: true,
  sourceUsed: 'win32',
  probeDurationMs: 18,
};

/** Golden example #3 — non-Windows unsupported. */
const GOLDEN_UNSUPPORTED: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: false,
  probeComplete: false,
  fixedDisks: [],
  fixedDiskCount: 0,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memory: {
    totalPhysicalBytes: 0,
    availableBytes: 0,
    usedPercent: 0,
    highPressureWarning: false,
    commitLimitBytes: 0,
    commitUsedBytes: 0,
  },
  uptime: { lastBootEpochSec: 0, uptimeSeconds: 0, uptimeDays: 0, longUptimeWarning: false },
  anyLowDisk: false,
  sourceUsed: 'none',
  probeErrors: [
    {
      source: 'none',
      code: 'UNSUPPORTED_PLATFORM',
      summary: 'device-health probe not supported on this runtime',
    },
  ],
  probeDurationMs: 0,
};

function latestOk(snapshot: DeviceHealthSnapshot) {
  return {
    data: snapshot,
    currentData: snapshot,
    error: undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    isUninitialized: false,
  };
}

describe('DeviceHealthView', () => {
  it('renders nothing while the tab is inactive', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: true,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { container } = render(<DeviceHealthView deviceId="dev-1" active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state when the backend returns 404', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: { status: 404 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);
    expect(screen.getByTestId('device-health-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('device-health-panel')).not.toBeInTheDocument();
  });

  it('shows the forbidden message on 403 (RBAC tuple lost)', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: { status: 403 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);
    expect(screen.getByTestId('device-health-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('device-health-panel')).not.toBeInTheDocument();
  });

  it('shows the generic error on a non-404/403 failure', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: { status: 500 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);
    expect(screen.getByTestId('device-health-error')).toBeInTheDocument();
  });

  it('renders the healthy golden example: disks, memory, uptime — no warning badges', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_HEALTHY));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);

    expect(screen.getByTestId('device-health-panel')).toBeInTheDocument();
    // Per-disk free % surfaces.
    expect(screen.getByTestId('device-health-disk-freePercent-C:')).toHaveTextContent('50%');
    // Healthy disk = OK chip, no low-disk badge.
    expect(screen.getByTestId('device-health-disk-ok-C:')).toBeInTheDocument();
    expect(screen.queryByTestId('device-health-disk-lowDisk-badge-C:')).not.toBeInTheDocument();
    expect(screen.queryByTestId('device-health-anyLowDisk-badge')).not.toBeInTheDocument();
    // Memory used %, no high-pressure badge.
    expect(screen.getByTestId('device-health-memory-usedPercent')).toHaveTextContent('42%');
    expect(screen.queryByTestId('device-health-memory-pressure-badge')).not.toBeInTheDocument();
    // Uptime days, no long-uptime badge.
    expect(screen.getByTestId('device-health-uptime-days')).toHaveTextContent('3');
    expect(screen.queryByTestId('device-health-uptime-long-badge')).not.toBeInTheDocument();
    // Source surfaces.
    expect(screen.getByTestId('device-health-meta-sourceUsed')).toHaveTextContent('win32');
  });

  it('renders the warning golden example: low-disk + high-pressure + long-uptime badges', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WARNING));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);

    expect(screen.getByTestId('device-health-panel')).toBeInTheDocument();
    // Low-disk badge per disk + the section-level anyLowDisk badge.
    expect(screen.getByTestId('device-health-disk-freePercent-C:')).toHaveTextContent('1%');
    expect(screen.getByTestId('device-health-disk-lowDisk-badge-C:')).toBeInTheDocument();
    expect(screen.getByTestId('device-health-anyLowDisk-badge')).toBeInTheDocument();
    // High-pressure memory badge.
    expect(screen.getByTestId('device-health-memory-usedPercent')).toHaveTextContent('95%');
    expect(screen.getByTestId('device-health-memory-pressure-badge')).toBeInTheDocument();
    // Long-uptime badge.
    expect(screen.getByTestId('device-health-uptime-days')).toHaveTextContent('33');
    expect(screen.getByTestId('device-health-uptime-long-badge')).toBeInTheDocument();
  });

  it('renders the unsupported state for the non-Windows golden example (probe not supported)', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_UNSUPPORTED));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);

    // supported=false wins → unsupported state, NOT the healthy panel
    // (must not render the zero-values as a healthy device).
    expect(screen.getByTestId('device-health-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('device-health-panel')).not.toBeInTheDocument();
    // The probe error is surfaced.
    expect(screen.getByText('UNSUPPORTED_PLATFORM')).toBeInTheDocument();
  });

  it('renders the incomplete (evidence-incomplete) state when probeComplete=false but supported', () => {
    // Fail-closed: a supported probe that did not complete must render
    // "evidence incomplete", never the (potentially degenerate) values.
    const incomplete: DeviceHealthSnapshot = {
      ...GOLDEN_HEALTHY,
      probeComplete: false,
      probeErrors: [
        { source: 'win32', code: 'DISK_ENUM_FAILED', summary: 'disk enumeration failed' },
      ],
    };
    mockedLatest.mockReturnValue(latestOk(incomplete));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);

    expect(screen.getByTestId('device-health-incomplete')).toBeInTheDocument();
    expect(screen.queryByTestId('device-health-panel')).not.toBeInTheDocument();
    expect(screen.getByText('DISK_ENUM_FAILED')).toBeInTheDocument();
  });

  it('history hook is skipped while the accordion is closed', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_HEALTHY));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-1" active />);
    // Lazy contract: history hook is invoked with skip=true while the
    // <details> stays collapsed.
    expect(mockedHistory).toHaveBeenCalled();
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ skip: true });
  });

  it('resets history page/open when the device id changes', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_HEALTHY));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { rerender } = render(<DeviceHealthView deviceId="dev-1" active />);
    rerender(<DeviceHealthView deviceId="dev-2" active />);

    // The history hook must always be called with the current deviceId
    // and the page reset to 0 after a device switch.
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[0]).toMatchObject({ deviceId: 'dev-2', page: 0 });
  });

  it('does not render a stale snapshot when currentData belongs to a previous device', () => {
    // Stale-guard regression: data (the last successful result) belongs
    // to dev-1, but currentData (the result for the active arg dev-2) is
    // still undefined while the refetch is in flight. The view MUST NOT
    // render the dev-1 snapshot under the dev-2 drawer.
    const dev1Snapshot: DeviceHealthSnapshot = {
      ...GOLDEN_HEALTHY,
      deviceId: 'dev-1',
    };
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

    render(<DeviceHealthView deviceId="dev-2" active />);

    // Loading branch wins; no stale snapshot panel.
    expect(screen.getByTestId('device-health-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('device-health-panel')).not.toBeInTheDocument();
  });

  it('rejects a currentData snapshot whose deviceId mismatches the active device', () => {
    // Stale-guard precision: currentData is populated but its envelope
    // deviceId belongs to dev-1 while the drawer is on dev-2. The guard
    // must drop it (render nothing in the latest slot), not show dev-1's
    // panel under dev-2.
    const dev1Snapshot: DeviceHealthSnapshot = {
      ...GOLDEN_WARNING,
      deviceId: 'dev-1',
    };
    mockedLatest.mockReturnValue({
      data: dev1Snapshot,
      currentData: dev1Snapshot,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-2" active />);

    // The mismatched snapshot is dropped — no panel, no warning badges.
    expect(screen.queryByTestId('device-health-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('device-health-anyLowDisk-badge')).not.toBeInTheDocument();
  });
});
