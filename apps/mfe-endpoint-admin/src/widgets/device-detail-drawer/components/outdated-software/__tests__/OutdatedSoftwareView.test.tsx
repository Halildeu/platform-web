/**
 * WEB outdated-software view slice tests — Faz 22.5 Track C (AG-036).
 *
 * Pattern mirrors the AG-033 DeviceHealthView test approach: vi.mock the
 * RTK Query slice and drive each branch via the generated hooks' return
 * values directly. Route shape is enforced at compile time — the
 * generated useGetOutdatedSoftwareLatestQuery /
 * useGetOutdatedSoftwareHistoryQuery hooks only exist if the
 * builder.query URLs in endpointAdminApi.ts are correct; a route typo
 * fails the TypeScript build before this file runs.
 *
 * The with-upgrades / clean / unsupported snapshots are the contract's
 * golden examples loaded VERBATIM
 *   (schema/endpoint-outdated-software-payload-v1.schema.json `examples`),
 * which the contract designates as the cross-repo regression corpus
 * (backend ingest + web render MUST accept/render each). The golden
 * examples carry the upgradeable list under the wire key `upgrade`; the
 * view reads `packages ?? upgrade`, so the verbatim examples exercise the
 * same render path as the backend `packages` response shape.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OutdatedSoftwareView } from '../OutdatedSoftwareView';
import type { OutdatedSoftwareSnapshot } from '../../../../../entities/endpoint-outdated-software/types';

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetOutdatedSoftwareLatestQuery: vi.fn(),
    useGetOutdatedSoftwareHistoryQuery: vi.fn(),
  },
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { endpointAdminApi } from '../../../../../app/services/endpointAdminApi';

const mockedLatest = endpointAdminApi.useGetOutdatedSoftwareLatestQuery as ReturnType<typeof vi.fn>;
const mockedHistory = endpointAdminApi.useGetOutdatedSoftwareHistoryQuery as ReturnType<
  typeof vi.fn
>;

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
// the AG-036 v1 payload blocks; the backend folds a persistence envelope
// (deviceId / collectedAt) around them at ingest, which the type tolerates.
// The upgradeable list arrives under `upgrade` in the golden block (the
// view reads `packages ?? upgrade`).
// ---------------------------------------------------------------------------

/** Golden example #1 — supported, complete, two upgradeable packages. */
const GOLDEN_WITH_UPGRADES: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 2,
  upgrade: [
    { packageId: '7zip.7zip', installedVersion: '24.09', availableVersion: '25.01' },
    {
      packageId: 'Microsoft.VisualStudioCode',
      installedVersion: '1.89.0',
      availableVersion: '1.91.1',
    },
  ],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 45,
};

/** Golden example #2 — supported, complete, zero upgrades (clean). */
const GOLDEN_CLEAN: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 28,
};

/** Golden example #3 — non-Windows unsupported. */
const GOLDEN_UNSUPPORTED: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: false,
  probeComplete: false,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'none',
  probeErrors: [
    {
      source: 'none',
      code: 'UNSUPPORTED_PLATFORM',
      summary: 'outdated-software probe not supported on this runtime',
    },
  ],
  probeDurationMs: 0,
};

function latestOk(snapshot: OutdatedSoftwareSnapshot) {
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

describe('OutdatedSoftwareView', () => {
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

    const { container } = render(<OutdatedSoftwareView deviceId="dev-1" active={false} />);
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

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    expect(screen.getByTestId('outdated-software-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
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

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    expect(screen.getByTestId('outdated-software-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
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

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    expect(screen.getByTestId('outdated-software-error')).toBeInTheDocument();
  });

  it('renders the with-upgrades golden example: package rows + count badge, contract fields only', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WITH_UPGRADES));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-panel')).toBeInTheDocument();
    // "N upgradeable" count badge surfaces the upgrade count.
    expect(screen.getByTestId('outdated-software-upgradeCount-badge')).toHaveTextContent('2');
    // Per-package rows: packageId + installed → available.
    expect(screen.getByTestId('outdated-software-package-id-7zip.7zip')).toHaveTextContent(
      '7zip.7zip',
    );
    expect(screen.getByTestId('outdated-software-package-installed-7zip.7zip')).toHaveTextContent(
      '24.09',
    );
    expect(screen.getByTestId('outdated-software-package-available-7zip.7zip')).toHaveTextContent(
      '25.01',
    );
    expect(
      screen.getByTestId('outdated-software-package-id-Microsoft.VisualStudioCode'),
    ).toHaveTextContent('Microsoft.VisualStudioCode');
    expect(
      screen.getByTestId('outdated-software-package-installed-Microsoft.VisualStudioCode'),
    ).toHaveTextContent('1.89.0');
    expect(
      screen.getByTestId('outdated-software-package-available-Microsoft.VisualStudioCode'),
    ).toHaveTextContent('1.91.1');
    // Source surfaces; not possibly-truncated at 2/512.
    expect(screen.getByTestId('outdated-software-meta-sourceUsed')).toHaveTextContent('winget');
    expect(screen.queryByTestId('outdated-software-possiblyTruncated')).not.toBeInTheDocument();

    // Redaction: the only table columns are the 3 contract keys.
    const headers = screen
      .getByTestId('outdated-software-packages-table')
      .querySelectorAll('thead th');
    expect(headers).toHaveLength(3);
    // No off-contract field text leaks into the rendered DOM. (None of
    // these exist on the wire; this guards against any future widening.)
    const dom = screen.getByTestId('outdated-software-panel').textContent ?? '';
    for (const forbidden of ['publisher', 'license', 'installLocation', 'downloadUrl']) {
      expect(dom.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('renders the clean golden example: zero upgrades, packages-empty state, no panel crash', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_CLEAN));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-panel')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-upgradeCount-badge')).toHaveTextContent('0');
    // Zero upgrades → packages-empty message, no table.
    expect(screen.getByTestId('outdated-software-packages-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-packages-table')).not.toBeInTheDocument();
  });

  it('renders the unsupported state for the non-Windows golden example (probe not supported)', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_UNSUPPORTED));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    // supported=false wins → unsupported state, NOT the panel (must not
    // render the empty upgrade list as a fully-up-to-date device).
    expect(screen.getByTestId('outdated-software-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
    // The probe error is surfaced.
    expect(screen.getByText('UNSUPPORTED_PLATFORM')).toBeInTheDocument();
  });

  it('renders the incomplete (evidence-incomplete) state when probeComplete=false but supported', () => {
    // Fail-closed: a supported probe that did not complete must render
    // "evidence incomplete", never the (possibly empty) upgrade list as
    // "fully up to date".
    const incomplete: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      probeComplete: false,
      probeErrors: [
        { source: 'winget', code: 'WINGET_TIMEOUT', summary: 'winget upgrade timed out' },
      ],
    };
    mockedLatest.mockReturnValue(latestOk(incomplete));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-incomplete')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
    expect(screen.getByText('WINGET_TIMEOUT')).toBeInTheDocument();
  });

  it('renders the possibly-truncated hint when upgradeCount == maxUpgrade (512)', () => {
    // Known v1 limitation: upgradeCount==maxUpgrade → "possibly truncated"
    // even though upgradeTruncated stayed false. Use the backend-derived
    // possiblyTruncated flag.
    const truncated: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 512,
      maxUpgrade: 512,
      possiblyTruncated: true,
    };
    mockedLatest.mockReturnValue(latestOk(truncated));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toHaveTextContent('512');
  });

  it('history hook is skipped while the accordion is closed', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WITH_UPGRADES));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    // Lazy contract: history hook is invoked with skip=true while the
    // <details> stays collapsed.
    expect(mockedHistory).toHaveBeenCalled();
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ skip: true });
  });

  it('resets history page/open when the device id changes', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WITH_UPGRADES));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { rerender } = render(<OutdatedSoftwareView deviceId="dev-1" active />);
    rerender(<OutdatedSoftwareView deviceId="dev-2" active />);

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
    const dev1Snapshot: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
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

    render(<OutdatedSoftwareView deviceId="dev-2" active />);

    // Loading branch wins; no stale snapshot panel.
    expect(screen.getByTestId('outdated-software-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
  });

  it('rejects a currentData snapshot whose deviceId mismatches the active device', () => {
    // Stale-guard precision: currentData is populated but its envelope
    // deviceId belongs to dev-1 while the drawer is on dev-2. The guard
    // must drop it (render nothing in the latest slot), not show dev-1's
    // panel under dev-2.
    const dev1Snapshot: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
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

    render(<OutdatedSoftwareView deviceId="dev-2" active />);

    // The mismatched snapshot is dropped — no panel, no package rows.
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-package-row-7zip.7zip')).not.toBeInTheDocument();
  });
});
