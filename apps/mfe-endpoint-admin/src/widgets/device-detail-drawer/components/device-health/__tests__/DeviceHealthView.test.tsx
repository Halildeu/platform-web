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
 * SHAPE (the #705 real-data crash fix): these fixtures are the FLAT
 * `AdminDeviceHealthSnapshotResponse` projection the latest/history
 * endpoints actually return — flat `memoryUsedPercent` /
 * `memoryHighPressure` / `uptimeDays` / `longUptimeWarning` scalar
 * columns + a `disks[]` child list — NOT the agent-wire nested
 * `memory:{…}` / `uptime:{…}` / `fixedDisks:[…]` contract block.
 *
 * The OLD fixtures used the nested contract shape, so the deployed view's
 * `const { memory, uptime } = snapshot` passed the tests while crashing on
 * real flat-DTO data (`Cannot read properties of undefined (reading
 * 'usedPercent')`). The healthy / warning data VALUES are the contract
 * golden examples (same used %, uptime days, disk free %, warning flags),
 * now carried under the real DTO field names; the new "real-data render"
 * test exercises a fully-populated supported+complete snapshot end to end
 * and would have caught the crash.
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
// FLAT DTO fixtures (AdminDeviceHealthSnapshotResponse). The latest endpoint
// returns the flat projection — scalar memory/uptime columns + a disks[]
// child list, folded around the persistence envelope (id / deviceId /
// collectedAt). The data VALUES mirror the contract golden examples.
// ---------------------------------------------------------------------------

/** Fixture #1 — healthy (flat DTO; contract golden-example values). */
const GOLDEN_HEALTHY: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  disks: [
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
  memoryUsedPercent: 42,
  memoryHighPressure: false,
  uptimeDays: 3,
  uptimeSeconds: 259200,
  lastBootEpochSec: 1748275200,
  longUptimeWarning: false,
  anyLowDisk: false,
  sourceUsed: 'win32',
  probeDurationMs: 12,
};

/** Fixture #2 — low-disk + high-pressure + long-uptime (flat DTO). */
const GOLDEN_WARNING: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  disks: [
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
  memoryUsedPercent: 95,
  memoryHighPressure: true,
  uptimeDays: 33,
  uptimeSeconds: 2851200,
  lastBootEpochSec: 1745683200,
  longUptimeWarning: true,
  anyLowDisk: true,
  sourceUsed: 'win32',
  probeDurationMs: 18,
};

/** Fixture #3 — non-Windows unsupported (flat DTO; nullable columns null). */
const GOLDEN_UNSUPPORTED: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: false,
  probeComplete: false,
  disks: [],
  fixedDiskCount: 0,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memoryUsedPercent: null,
  memoryHighPressure: null,
  uptimeDays: null,
  uptimeSeconds: null,
  lastBootEpochSec: null,
  longUptimeWarning: null,
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

  it('renders REAL backend flat-DTO data (#705 regression) without crashing', () => {
    // #705 real-data crash repro: the deployed view destructured
    // `const { memory, uptime } = snapshot` and read `memory.usedPercent`
    // against a flat AdminDeviceHealthSnapshotResponse (no nested
    // memory/uptime), throwing
    // `Cannot read properties of undefined (reading 'usedPercent')`. This
    // fixture is EXACTLY the flat DTO the live latest endpoint returns —
    // scalar memory/uptime columns + a disks[] child list, folded around
    // the persistence envelope (id / deviceId / collectedAt). It is
    // supported=true + probeComplete=true with a populated memory % +
    // disks + uptime, i.e. the real-data path that crashed.
    const realFlatDto: DeviceHealthSnapshot = {
      id: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      deviceId: 'dev-real',
      sourceCommandResultId: '33333333-3333-3333-3333-333333333333',
      schemaVersion: 1,
      supported: true,
      probeComplete: true,
      anyLowDisk: false,
      fixedDiskCount: 2,
      fixedDisksTruncated: false,
      maxFixedDisks: 64,
      memoryUsedPercent: 67,
      memoryHighPressure: false,
      uptimeDays: 12,
      uptimeSeconds: 1036800,
      lastBootEpochSec: 1748275200,
      longUptimeWarning: false,
      sourceUsed: 'win32',
      probeDurationMs: 23,
      payloadHashSha256: 'a'.repeat(64),
      collectedAt: '2026-05-29T10:00:00Z',
      createdAt: '2026-05-29T10:00:01Z',
      disks: [
        {
          driveLetter: 'C:',
          totalBytes: 1099511627776,
          freeBytes: 549755813888,
          freePercent: 50,
          lowDiskWarning: false,
        },
        {
          driveLetter: 'D:',
          totalBytes: 2199023255552,
          freeBytes: 1099511627776,
          freePercent: 50,
          lowDiskWarning: false,
        },
      ],
      probeErrors: [],
    };
    mockedLatest.mockReturnValue(latestOk(realFlatDto));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-real" active />);

    // The panel renders (no crash, no error boundary).
    expect(screen.getByTestId('device-health-panel')).toBeInTheDocument();
    // Flat scalar memory column renders the used %.
    expect(screen.getByTestId('device-health-memory-usedPercent')).toHaveTextContent('67%');
    // Flat scalar uptime column renders the days.
    expect(screen.getByTestId('device-health-uptime-days')).toHaveTextContent('12');
    // Both disks from the `disks[]` child list render.
    expect(screen.getByTestId('device-health-disk-row-C:')).toBeInTheDocument();
    expect(screen.getByTestId('device-health-disk-row-D:')).toBeInTheDocument();
    expect(screen.getByTestId('device-health-disk-freePercent-C:')).toHaveTextContent('50%');
    // Meta row reads the flat scalar columns.
    expect(screen.getByTestId('device-health-meta-sourceUsed')).toHaveTextContent('win32');
    // The DTO does NOT carry memory byte totals (total / available /
    // commit live only in redacted_payload, which the DTO does not
    // surface) — the view must render ONLY the fields the DTO returns, so
    // those rows are absent (not a crash, not an undefined render).
    const memoryGrid = screen.getByTestId('device-health-memory-grid');
    expect(memoryGrid.textContent).not.toMatch(/Total physical|Toplam Fiziksel|memory\.total/);
    expect(memoryGrid.textContent).not.toMatch(/Available|Kullanılabilir|memory\.available/);
    expect(memoryGrid.textContent).not.toMatch(/Commit|memory\.commit/);
  });

  it('null-guards a supported+complete snapshot with null scalar columns (no crash)', () => {
    // Defensive: every flat DTO scalar is a nullable boxed type. A
    // supported+complete snapshot whose nullable columns are null must
    // render the panel with em-dash placeholders, never throw.
    const sparse: DeviceHealthSnapshot = {
      deviceId: 'dev-sparse',
      schemaVersion: 1,
      supported: true,
      probeComplete: true,
      anyLowDisk: false,
      fixedDiskCount: 0,
      fixedDisksTruncated: false,
      maxFixedDisks: 64,
      memoryUsedPercent: null,
      memoryHighPressure: null,
      uptimeDays: null,
      uptimeSeconds: null,
      lastBootEpochSec: null,
      longUptimeWarning: null,
      sourceUsed: 'win32',
      probeDurationMs: null,
      disks: [],
      probeErrors: [],
    };
    mockedLatest.mockReturnValue(latestOk(sparse));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<DeviceHealthView deviceId="dev-sparse" active />);

    expect(screen.getByTestId('device-health-panel')).toBeInTheDocument();
    // Null used % / uptime days render as the em-dash sentinel, no badge.
    expect(screen.getByTestId('device-health-memory-usedPercent')).toHaveTextContent('—');
    expect(screen.queryByTestId('device-health-memory-pressure-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('device-health-uptime-days')).toHaveTextContent('—');
    expect(screen.queryByTestId('device-health-uptime-long-badge')).not.toBeInTheDocument();
    // No disks → the disks-empty placeholder.
    expect(screen.getByTestId('device-health-disks-empty')).toBeInTheDocument();
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
