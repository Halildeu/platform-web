// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { DeviceProhibitedSoftwareSnapshot } from '../../../../../entities/endpoint-prohibited-software/types';

/* ------------------------------------------------------------------ */
/*  BE-025 — ProhibitedSoftwareView unit tests (Faz 22.5 P2-A slice-2).*/
/*                                                                     */
/*  Adversarial guardrails (Codex 019e84ca slice-2):                   */
/*   - NO "automatic uninstall" / "remediation" CTA rendered           */
/*   - 2-status enum distinct render (OK vs NO_EVALUATION)             */
/*   - OK + empty findings → distinct "no matches" copy (NOT a 3rd     */
/*     state — backend has only 2-status enum but the UI needs a       */
/*     copy for the "evaluator ran, nothing matched" case)             */
/* ------------------------------------------------------------------ */

const useGetProhibitedSoftwareQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetProhibitedSoftwareQuery: (...args: unknown[]) => useGetProhibitedSoftwareQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetProhibitedSoftwareQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const SNAPSHOT_OK_WITH_FINDINGS: DeviceProhibitedSoftwareSnapshot = {
  deviceId: DEVICE_A,
  status: 'OK',
  decision: 'UNAUTHORIZED',
  evaluatedAt: '2026-06-01T12:00:00Z',
  inventorySnapshotId: '11111111-2222-3333-4444-555555555555',
  findings: [
    {
      ruleId: '99999999-aaaa-bbbb-cccc-dddddddddddd',
      matchType: 'NAME',
      matchMode: 'EXACT',
      matchedName: 'Banned-RAT',
      matchedPublisher: 'Suspicious Vendor',
      matchedVersion: '1.0.0',
    },
    {
      ruleId: '00000000-1111-2222-3333-444444444444',
      matchType: 'NAME_AND_PUBLISHER',
      matchMode: 'CONTAINS',
      matchedName: 'TeamViewer',
      matchedPublisher: null,
      matchedVersion: null,
    },
  ],
};

const SNAPSHOT_OK_NO_FINDINGS: DeviceProhibitedSoftwareSnapshot = {
  ...SNAPSHOT_OK_WITH_FINDINGS,
  decision: 'COMPLIANT',
  findings: [],
};

const SNAPSHOT_NO_EVAL: DeviceProhibitedSoftwareSnapshot = {
  deviceId: DEVICE_A,
  status: 'NO_EVALUATION',
  decision: null,
  evaluatedAt: null,
  inventorySnapshotId: null,
  findings: [],
};

async function importView() {
  return await import('../ProhibitedSoftwareView');
}

describe('ProhibitedSoftwareView state precedence', () => {
  it('renders nothing when active is false', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    const { container } = render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: true,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('prohibited-software-view-loading')).toBeTruthy();
  });

  it('renders forbidden on 403', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: { status: 403 },
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('prohibited-software-view-forbidden')).toBeTruthy();
  });

  it('renders error on generic 5xx and cuts before snapshot fall-through', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK_WITH_FINDINGS,
      isLoading: false,
      error: { status: 500 },
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('prohibited-software-view-error')).toBeTruthy();
    expect(screen.queryByTestId('prohibited-software-view')).toBeNull();
  });
});

describe('ProhibitedSoftwareView 2-status enum distinct render', () => {
  it('NO_EVALUATION shows distinct copy + status badge + hides decision badge', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_NO_EVAL,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('prohibited-software-view');
    expect(root.getAttribute('data-status')).toBe('NO_EVALUATION');
    expect(root.getAttribute('data-findings-count')).toBe('0');
    expect(root.getAttribute('data-unauthorized')).toBe('false');
    expect(screen.getByTestId('prohibited-software-view-status-badge')).toBeTruthy();
    expect(screen.getByTestId('prohibited-software-view-no-eval')).toBeTruthy();
    expect(screen.queryByTestId('prohibited-software-view-decision-badge')).toBeNull();
    expect(screen.queryByTestId('prohibited-software-view-findings')).toBeNull();
  });

  it('OK with empty findings shows distinct "no matches" copy + hides findings table', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK_NO_FINDINGS,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('prohibited-software-view');
    expect(root.getAttribute('data-status')).toBe('OK');
    expect(root.getAttribute('data-findings-count')).toBe('0');
    expect(root.getAttribute('data-unauthorized')).toBe('false');
    expect(screen.getByTestId('prohibited-software-view-no-findings')).toBeTruthy();
    expect(screen.queryByTestId('prohibited-software-view-findings')).toBeNull();
    expect(screen.queryByTestId('prohibited-software-view-no-eval')).toBeNull();
  });

  it('OK with findings shows findings table + decision badge', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK_WITH_FINDINGS,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('prohibited-software-view');
    expect(root.getAttribute('data-status')).toBe('OK');
    expect(root.getAttribute('data-findings-count')).toBe('2');
    expect(root.getAttribute('data-unauthorized')).toBe('true');
    expect(screen.getByTestId('prohibited-software-view-findings')).toBeTruthy();
    expect(screen.getByTestId('prohibited-software-view-decision-badge')).toBeTruthy();
  });
});

describe('ProhibitedSoftwareView findings rendering', () => {
  it('finding row carries data-rule-id + data-match-type + data-match-mode', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK_WITH_FINDINGS,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    const row0 = screen.getByTestId('prohibited-software-view-finding-row-0');
    expect(row0.getAttribute('data-rule-id')).toBe('99999999-aaaa-bbbb-cccc-dddddddddddd');
    expect(row0.getAttribute('data-match-type')).toBe('NAME');
    expect(row0.getAttribute('data-match-mode')).toBe('EXACT');
    expect(row0.textContent).toContain('Banned-RAT');
    expect(row0.textContent).toContain('Suspicious Vendor');
    expect(row0.textContent).toContain('1.0.0');
  });

  it('null publisher and version fall back to "—" placeholder', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK_WITH_FINDINGS,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    const row1 = screen.getByTestId('prohibited-software-view-finding-row-1');
    expect(row1.textContent).toContain('TeamViewer');
    expect(row1.textContent).toContain('—');
  });
});

describe('ProhibitedSoftwareView adversarial guardrails', () => {
  it('view does NOT render an automatic-uninstall or remediation CTA', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: SNAPSHOT_OK_WITH_FINDINGS,
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    const { container } = render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    const text = container.textContent ?? '';
    // Adversarial guardrails: never advertise actions the backend cannot perform.
    expect(text.toLowerCase()).not.toMatch(/automatic uninstall|otomatik kaldır/);
    expect(text.toLowerCase()).not.toMatch(/remediate|onar/);
    expect(text.toLowerCase()).not.toMatch(/blok|block now/);
    // No actionable button at all on this read-only view.
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

describe('ProhibitedSoftwareView stale-arg guard', () => {
  it('warns when snapshot.deviceId differs from active deviceId', async () => {
    useGetProhibitedSoftwareQueryMock.mockReturnValue({
      currentData: { ...SNAPSHOT_OK_WITH_FINDINGS, deviceId: DEVICE_B },
      isLoading: false,
      error: undefined,
    });
    const { ProhibitedSoftwareView } = await importView();
    render(<ProhibitedSoftwareView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('prohibited-software-view-stale')).toBeTruthy();
    expect(screen.queryByTestId('prohibited-software-view')).toBeNull();
  });
});
