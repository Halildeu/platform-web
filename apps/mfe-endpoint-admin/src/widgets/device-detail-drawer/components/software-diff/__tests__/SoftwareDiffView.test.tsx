// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { SoftwareInventoryDiffSnapshot } from '../../../../../entities/endpoint-software-inventory-diff/types';

/* ------------------------------------------------------------------ */
/*  BE-024 — SoftwareDiffView unit tests (Faz 22.5 P2-A).              */
/*                                                                     */
/*  Inherits AG-038/AG-039/AG-040/AG-041 precedents:                   */
/*   - Generic error cuts BEFORE snapshot fall-through                 */
/*   - currentData-anchored stale-arg guard                            */
/*   - 4-status enum distinct render (NEVER collapse NO_CHANGE /       */
/*     INSUFFICIENT_HISTORY / NO_HISTORY into a single state)          */
/*   - Plain-text XSS guards on displayName + publisher + fromVersion  */
/*     + toVersion                                                     */
/* ------------------------------------------------------------------ */

const useGetSoftwareInventoryDiffQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetSoftwareInventoryDiffQuery: (...args: unknown[]) =>
    useGetSoftwareInventoryDiffQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetSoftwareInventoryDiffQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const SNAPSHOT_OK: SoftwareInventoryDiffSnapshot = {
  deviceId: DEVICE_A,
  status: 'OK',
  fromCapturedAt: '2026-05-30T10:00:00Z',
  toCapturedAt: '2026-06-01T10:00:00Z',
  fromAppCount: 100,
  toAppCount: 102,
  added: [
    {
      appKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayName: '7-Zip',
      publisher: 'Igor Pavlov',
      fromVersion: null,
      toVersion: '24.07',
      changeType: 'ADDED',
    },
  ],
  removed: [
    {
      appKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      displayName: 'TeamViewer',
      publisher: 'TeamViewer GmbH',
      fromVersion: '15.30.0',
      toVersion: null,
      changeType: 'REMOVED',
    },
  ],
  versionChanged: [
    {
      appKey: 'cccccccccccccccccccccccccccccccccccc',
      displayName: 'Google Chrome',
      publisher: 'Google LLC',
      fromVersion: '124.0.6367.207',
      toVersion: '126.0.6478.182',
      changeType: 'VERSION_CHANGED',
    },
  ],
};

const SNAPSHOT_NO_HISTORY: SoftwareInventoryDiffSnapshot = {
  deviceId: DEVICE_A,
  status: 'NO_HISTORY',
  fromCapturedAt: null,
  toCapturedAt: null,
  fromAppCount: null,
  toAppCount: null,
  added: [],
  removed: [],
  versionChanged: [],
};

const SNAPSHOT_INSUFFICIENT: SoftwareInventoryDiffSnapshot = {
  deviceId: DEVICE_A,
  status: 'INSUFFICIENT_HISTORY',
  fromCapturedAt: null,
  toCapturedAt: '2026-06-01T10:00:00Z',
  fromAppCount: null,
  toAppCount: 100,
  added: [],
  removed: [],
  versionChanged: [],
};

const SNAPSHOT_NO_CHANGE: SoftwareInventoryDiffSnapshot = {
  ...SNAPSHOT_OK,
  status: 'NO_CHANGE',
  added: [],
  removed: [],
  versionChanged: [],
};

async function importView() {
  return await import('../SoftwareDiffView');
}

describe('SoftwareDiffView state precedence', () => {
  it('renders nothing when active is false', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    const { container } = render(<SoftwareDiffView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: true,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('software-diff-view-loading')).toBeTruthy();
  });

  it('renders forbidden on 403', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: { status: 403 },
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('software-diff-view-forbidden')).toBeTruthy();
  });

  it('renders error on generic 5xx and cuts before snapshot fall-through', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: { status: 500 },
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('software-diff-view-error')).toBeTruthy();
    expect(screen.queryByTestId('software-diff-view')).toBeNull();
  });
});

describe('SoftwareDiffView 4-status enum distinct render', () => {
  it('OK with all 3 lists populated', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('software-diff-view');
    expect(root.getAttribute('data-status')).toBe('OK');
    expect(root.getAttribute('data-total-entries')).toBe('3');
    expect(screen.getByTestId('software-diff-view-added')).toBeTruthy();
    expect(screen.getByTestId('software-diff-view-removed')).toBeTruthy();
    expect(screen.getByTestId('software-diff-view-version-changed')).toBeTruthy();
  });

  it('NO_HISTORY hides all 3 tables but keeps the container visible with status badge', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_NO_HISTORY,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('software-diff-view');
    expect(root.getAttribute('data-status')).toBe('NO_HISTORY');
    expect(root.getAttribute('data-total-entries')).toBe('0');
    expect(screen.queryByTestId('software-diff-view-added')).toBeNull();
    expect(screen.queryByTestId('software-diff-view-removed')).toBeNull();
    expect(screen.queryByTestId('software-diff-view-version-changed')).toBeNull();
    expect(screen.getByTestId('software-diff-view-status-badge')).toBeTruthy();
  });

  it('INSUFFICIENT_HISTORY shows status badge + toCapturedAt but no fromCapturedAt', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_INSUFFICIENT,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('software-diff-view');
    expect(root.getAttribute('data-status')).toBe('INSUFFICIENT_HISTORY');
    expect(screen.getByTestId('software-diff-view-from-captured-at').textContent).toContain('—');
    expect(screen.getByTestId('software-diff-view-to-captured-at').textContent).not.toContain('—');
  });

  it('NO_CHANGE shows status badge but all 3 tables hidden', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_NO_CHANGE,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('software-diff-view');
    expect(root.getAttribute('data-status')).toBe('NO_CHANGE');
    expect(root.getAttribute('data-total-entries')).toBe('0');
    expect(screen.queryByTestId('software-diff-view-added')).toBeNull();
  });
});

describe('SoftwareDiffView entry rendering', () => {
  it('added entry renders displayName + publisher + toVersion', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const addedTable = screen.getByTestId('software-diff-view-added');
    expect(addedTable.textContent).toContain('7-Zip');
    expect(addedTable.textContent).toContain('Igor Pavlov');
    expect(addedTable.textContent).toContain('24.07');
  });

  it('removed entry renders fromVersion', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const removedTable = screen.getByTestId('software-diff-view-removed');
    expect(removedTable.textContent).toContain('TeamViewer');
    expect(removedTable.textContent).toContain('15.30.0');
  });

  it('versionChanged renders both fromVersion and toVersion', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const vcTable = screen.getByTestId('software-diff-view-version-changed');
    expect(vcTable.textContent).toContain('Google Chrome');
    expect(vcTable.textContent).toContain('124.0.6367.207');
    expect(vcTable.textContent).toContain('126.0.6478.182');
  });

  it('null publisher falls back to "—" placeholder', async () => {
    const snapshot: SoftwareInventoryDiffSnapshot = {
      ...SNAPSHOT_OK,
      added: [
        {
          ...SNAPSHOT_OK.added[0],
          publisher: null,
        },
      ],
      removed: [],
      versionChanged: [],
    };
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: snapshot,
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    const addedTable = screen.getByTestId('software-diff-view-added');
    expect(addedTable.textContent).toContain('—');
  });
});

describe('SoftwareDiffView stale-arg guard', () => {
  it('warns when snapshot.deviceId differs from active deviceId', async () => {
    useGetSoftwareInventoryDiffQueryMock.mockReturnValue({
      currentData: { ...SNAPSHOT_OK, deviceId: DEVICE_B },
      isLoading: false,
      error: undefined,
    });
    const { SoftwareDiffView } = await importView();
    render(<SoftwareDiffView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('software-diff-view-stale')).toBeTruthy();
    expect(screen.queryByTestId('software-diff-view')).toBeNull();
  });
});
