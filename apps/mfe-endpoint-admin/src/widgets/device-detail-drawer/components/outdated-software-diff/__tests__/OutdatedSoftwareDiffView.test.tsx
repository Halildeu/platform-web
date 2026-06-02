// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { OutdatedSoftwareDiffSnapshot } from '../../../../../entities/endpoint-outdated-software-diff/types';

/* ------------------------------------------------------------------ */
/*  BE-024b — OutdatedSoftwareDiffView unit tests (Faz 22.5 P2-A      */
/*  slice-3b). Inherits AG-038..AG-041 + BE-024 + BE-025 precedents.  */
/*                                                                     */
/*  Codex 019e8542 invariants pinned:                                  */
/*   - 4-status enum distinct render (NEVER collapse NO_CHANGE /       */
/*     INSUFFICIENT_HISTORY / NO_HISTORY)                              */
/*   - 4 ChangeType lists rendered as separate hidden-when-empty       */
/*     tables                                                          */
/*   - VERSION_CHANGED entries carry BOTH installed + available        */
/*     deltas on the wire (NOT duplicated into                         */
/*     availableVersionBumped)                                         */
/*   - possiblyTruncated single-source backend hint triggers UI        */
/*     truncation notice                                               */
/* ------------------------------------------------------------------ */

const useGetOutdatedSoftwareDiffQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetOutdatedSoftwareDiffQuery: (...args: unknown[]) =>
    useGetOutdatedSoftwareDiffQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetOutdatedSoftwareDiffQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const SNAPSHOT_OK: OutdatedSoftwareDiffSnapshot = {
  deviceId: DEVICE_A,
  status: 'OK',
  fromSnapshotId: 'from-id',
  toSnapshotId: 'to-id',
  fromCollectedAt: '2026-05-30T10:00:00Z',
  toCollectedAt: '2026-06-01T10:00:00Z',
  fromUpgradeCount: 50,
  toUpgradeCount: 51,
  fromPossiblyTruncated: false,
  toPossiblyTruncated: false,
  added: [
    {
      packageId: 'Microsoft.PowerToys',
      fromInstalledVersion: null,
      toInstalledVersion: '0.83.0',
      fromAvailableVersion: null,
      toAvailableVersion: '0.84.0',
      changeType: 'ADDED',
    },
  ],
  removed: [
    {
      packageId: 'Old.Package',
      fromInstalledVersion: '1.0.0',
      toInstalledVersion: null,
      fromAvailableVersion: '1.2.0',
      toAvailableVersion: null,
      changeType: 'REMOVED',
    },
  ],
  versionChanged: [
    {
      packageId: 'Google.Chrome',
      fromInstalledVersion: '124.0.6367.207',
      toInstalledVersion: '126.0.6478.182',
      fromAvailableVersion: '127.0.0.0',
      toAvailableVersion: '128.0.0.0',
      changeType: 'VERSION_CHANGED',
    },
  ],
  availableVersionBumped: [
    {
      packageId: 'Notion.Notion',
      fromInstalledVersion: '3.0.0',
      toInstalledVersion: '3.0.0',
      fromAvailableVersion: '3.1.0',
      toAvailableVersion: '3.2.0',
      changeType: 'AVAILABLE_VERSION_BUMPED',
    },
  ],
};

const SNAPSHOT_NO_HISTORY: OutdatedSoftwareDiffSnapshot = {
  deviceId: DEVICE_A,
  status: 'NO_HISTORY',
  fromSnapshotId: null,
  toSnapshotId: null,
  fromCollectedAt: null,
  toCollectedAt: null,
  fromUpgradeCount: null,
  toUpgradeCount: null,
  fromPossiblyTruncated: null,
  toPossiblyTruncated: null,
  added: [],
  removed: [],
  versionChanged: [],
  availableVersionBumped: [],
};

const SNAPSHOT_INSUFFICIENT: OutdatedSoftwareDiffSnapshot = {
  ...SNAPSHOT_NO_HISTORY,
  status: 'INSUFFICIENT_HISTORY',
  toSnapshotId: 'to-id',
  toCollectedAt: '2026-06-01T10:00:00Z',
  toUpgradeCount: 50,
  toPossiblyTruncated: false,
};

const SNAPSHOT_NO_CHANGE: OutdatedSoftwareDiffSnapshot = {
  ...SNAPSHOT_OK,
  status: 'NO_CHANGE',
  added: [],
  removed: [],
  versionChanged: [],
  availableVersionBumped: [],
};

async function importView() {
  return await import('../OutdatedSoftwareDiffView');
}

describe('OutdatedSoftwareDiffView state precedence', () => {
  it('renders nothing when active is false', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    const { container } = render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: true,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('outdated-software-diff-view-loading')).toBeTruthy();
  });

  it('renders forbidden on 403', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: { status: 403 },
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('outdated-software-diff-view-forbidden')).toBeTruthy();
  });

  it('renders error on generic 5xx and cuts before snapshot fall-through', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: { status: 500 },
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('outdated-software-diff-view-error')).toBeTruthy();
    expect(screen.queryByTestId('outdated-software-diff-view')).toBeNull();
  });
});

describe('OutdatedSoftwareDiffView 4-status distinct render', () => {
  it('OK with all 4 lists populated', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('outdated-software-diff-view');
    expect(root.getAttribute('data-status')).toBe('OK');
    expect(root.getAttribute('data-total-entries')).toBe('4');
    expect(screen.getByTestId('outdated-software-diff-view-added')).toBeTruthy();
    expect(screen.getByTestId('outdated-software-diff-view-removed')).toBeTruthy();
    expect(screen.getByTestId('outdated-software-diff-view-version-changed')).toBeTruthy();
    expect(screen.getByTestId('outdated-software-diff-view-available-version-bumped')).toBeTruthy();
  });

  it('NO_HISTORY hides all 4 tables but keeps container visible', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_NO_HISTORY,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('outdated-software-diff-view');
    expect(root.getAttribute('data-status')).toBe('NO_HISTORY');
    expect(root.getAttribute('data-total-entries')).toBe('0');
    expect(screen.queryByTestId('outdated-software-diff-view-added')).toBeNull();
    expect(screen.queryByTestId('outdated-software-diff-view-removed')).toBeNull();
    expect(screen.queryByTestId('outdated-software-diff-view-version-changed')).toBeNull();
    expect(screen.queryByTestId('outdated-software-diff-view-available-version-bumped')).toBeNull();
  });

  it('INSUFFICIENT_HISTORY shows from="—" + to filled', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_INSUFFICIENT,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('outdated-software-diff-view');
    expect(root.getAttribute('data-status')).toBe('INSUFFICIENT_HISTORY');
    expect(
      screen.getByTestId('outdated-software-diff-view-from-captured-at').textContent,
    ).toContain('—');
    expect(
      screen.getByTestId('outdated-software-diff-view-to-captured-at').textContent,
    ).not.toContain('—');
  });

  it('NO_CHANGE shows badge + hides all 4 tables', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_NO_CHANGE,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('outdated-software-diff-view');
    expect(root.getAttribute('data-status')).toBe('NO_CHANGE');
    expect(root.getAttribute('data-total-entries')).toBe('0');
    expect(screen.queryByTestId('outdated-software-diff-view-added')).toBeNull();
  });
});

describe('OutdatedSoftwareDiffView entry rendering', () => {
  it('versionChanged renders BOTH installed + available deltas on a single row', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const table = screen.getByTestId('outdated-software-diff-view-version-changed');
    expect(table.textContent).toContain('Google.Chrome');
    expect(table.textContent).toContain('124.0.6367.207');
    expect(table.textContent).toContain('126.0.6478.182');
    expect(table.textContent).toContain('127.0.0.0');
    expect(table.textContent).toContain('128.0.0.0');
    // Codex iter-2 invariant: VERSION_CHANGED NOT duplicated into
    // availableVersionBumped list.
    const avbTable = screen.getByTestId('outdated-software-diff-view-available-version-bumped');
    expect(avbTable.textContent).not.toContain('Google.Chrome');
  });

  it('AVAILABLE_VERSION_BUMPED renders single installed column (no delta)', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const table = screen.getByTestId('outdated-software-diff-view-available-version-bumped');
    expect(table.textContent).toContain('Notion.Notion');
    expect(table.textContent).toContain('3.0.0');
    expect(table.textContent).toContain('3.1.0');
    expect(table.textContent).toContain('3.2.0');
  });

  it('added entry uses null fallback "—" for fromVersion fields', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const addedTable = screen.getByTestId('outdated-software-diff-view-added');
    expect(addedTable.textContent).toContain('Microsoft.PowerToys');
    expect(addedTable.textContent).toContain('0.83.0');
    expect(addedTable.textContent).toContain('0.84.0');
  });
});

describe('OutdatedSoftwareDiffView truncation hint', () => {
  it('renders truncation notice when toPossiblyTruncated=true', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: { ...SNAPSHOT_OK, toPossiblyTruncated: true },
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('outdated-software-diff-view-truncation-hint')).toBeTruthy();
  });

  it('does NOT render truncation notice when both flags false', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.queryByTestId('outdated-software-diff-view-truncation-hint')).toBeNull();
  });
});

describe('OutdatedSoftwareDiffView stale-arg guard', () => {
  it('warns when snapshot.deviceId differs from active deviceId', async () => {
    useGetOutdatedSoftwareDiffQueryMock.mockReturnValue({
      currentData: { ...SNAPSHOT_OK, deviceId: DEVICE_B },
      isLoading: false,
      error: undefined,
    });
    const { OutdatedSoftwareDiffView } = await importView();
    render(<OutdatedSoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('outdated-software-diff-view-stale')).toBeTruthy();
    expect(screen.queryByTestId('outdated-software-diff-view')).toBeNull();
  });
});
