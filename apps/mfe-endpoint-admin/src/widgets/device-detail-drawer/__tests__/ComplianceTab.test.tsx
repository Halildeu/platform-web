// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ComplianceStateResponse } from '../../../entities/endpoint-device-compliance/types';
import { ComplianceTab } from '../tabs/ComplianceTab';

/* ------------------------------------------------------------------ */
/*  WEB-014A — ComplianceTab unit tests (Faz 22.5).                    */
/*                                                                     */
/*  Component contract:                                                 */
/*   - Skips queries when `!active || !deviceId`.                      */
/*   - 404 → "never evaluated" empty state + Evaluate CTA.             */
/*   - 403 → forbidden state.                                          */
/*   - Other errors → error state.                                     */
/*   - Happy: renders decision badge + reasons + staleness banner +    */
/*     policyDrift banner.                                              */
/*   - POST evaluate happy → success toast.                            */
/*   - POST evaluate 409 → cooldown toast + button disabled 5s.        */
/*   - POST evaluate 403 → permission toast.                           */
/*                                                                     */
/*  Mirrors the WEB-011 InventoryTab vi.mock RTK Query pattern.        */
/* ------------------------------------------------------------------ */

const useGetDeviceComplianceQueryMock = vi.fn();
const useForceEvaluateDeviceComplianceMutationMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetDeviceComplianceQuery: (...args: unknown[]) => useGetDeviceComplianceQueryMock(...args),
    useForceEvaluateDeviceComplianceMutation: () => useForceEvaluateDeviceComplianceMutationMock(),
  },
}));

type QueryResult = {
  data?: ComplianceStateResponse;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
  isUninitialized?: boolean;
};

function mockQuery(result: QueryResult): void {
  const isUninitialized =
    result.isUninitialized ??
    !(result.data || result.error || result.isLoading || result.isFetching);
  useGetDeviceComplianceQueryMock.mockReturnValue({
    data: result.data,
    error: result.error,
    isLoading: result.isLoading ?? false,
    isFetching: result.isFetching ?? false,
    isUninitialized,
  });
}

function mockMutation(
  options: {
    unwrap?: () => Promise<ComplianceStateResponse>;
    isLoading?: boolean;
  } = {},
): { trigger: ReturnType<typeof vi.fn> } {
  const trigger = vi.fn(() => ({
    unwrap:
      options.unwrap ??
      ((): Promise<ComplianceStateResponse> =>
        Promise.resolve(buildState({ decision: 'COMPLIANT' }))),
  }));
  useForceEvaluateDeviceComplianceMutationMock.mockReturnValue([
    trigger,
    { isLoading: options.isLoading ?? false },
  ]);
  return { trigger };
}

function buildState(overrides: Partial<ComplianceStateResponse> = {}): ComplianceStateResponse {
  return {
    deviceId: 'device-1',
    latestEvaluationId: 'eval-1',
    decision: 'COMPLIANT',
    evaluatedAt: '2026-05-28T10:00:00Z',
    staleness: {
      summary: 'FRESH',
      apps: 'FRESH',
      wingetEgress: 'UNAVAILABLE',
      worst: 'FRESH',
    },
    reasons: [],
    blockingReasons: [],
    warnings: [],
    evidence: {
      inventorySnapshotId: null,
      inventorySnapshotRowVersion: null,
      inventoryUpdatedAt: null,
      summaryCollectedAt: null,
      appsCollectedAt: null,
      latestSummaryCommandResultId: null,
      latestFullCommandResultId: null,
      latestWingetEgressCommandResultId: null,
      wingetEgressCollectedAt: null,
      wingetEgressSchemaVersion: null,
      matchedItems: {},
    },
    catalogPolicyHash: '0'.repeat(64),
    catalogPolicyHashCurrent: '0'.repeat(64),
    policyDrift: false,
    catalogRowVersionMax: 1,
    policyRowVersionMax: 1,
    ...overrides,
  };
}

describe('ComplianceTab', () => {
  beforeEach(() => {
    useGetDeviceComplianceQueryMock.mockReset();
    useForceEvaluateDeviceComplianceMutationMock.mockReset();
    mockMutation();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing while inactive', () => {
    mockQuery({ isUninitialized: true });
    const { container } = render(<ComplianceTab deviceId="device-1" active={false} />);
    expect(container.textContent).toBe('');
  });

  it('renders loading state', () => {
    mockQuery({ isLoading: true });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(screen.getByTestId('compliance-tab-loading')).toBeTruthy();
  });

  it('renders 404 empty state with evaluate CTA', () => {
    mockQuery({ error: { status: 404 } });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(screen.getByTestId('compliance-tab-empty')).toBeTruthy();
    expect(screen.getByTestId('compliance-evaluate-button-empty')).toBeTruthy();
  });

  it('renders 403 forbidden state', () => {
    mockQuery({ error: { status: 403 } });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(screen.getByTestId('compliance-tab-forbidden')).toBeTruthy();
  });

  it('renders COMPLIANT decision badge', () => {
    mockQuery({ data: buildState({ decision: 'COMPLIANT' }) });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(screen.getByTestId('compliance-decision-compliant')).toBeTruthy();
  });

  it('renders UNAUTHORIZED decision with forbidden_app_installed reason', () => {
    mockQuery({
      data: buildState({
        decision: 'UNAUTHORIZED',
        reasons: ['forbidden_app_installed'],
        blockingReasons: ['forbidden_app_installed'],
      }),
    });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(screen.getByTestId('compliance-decision-unauthorized')).toBeTruthy();
    expect(screen.getByTestId('compliance-blocking-list')).toBeTruthy();
  });

  it('renders staleness HARD banner with alert role', () => {
    mockQuery({
      data: buildState({
        decision: 'UNKNOWN',
        staleness: { summary: 'FRESH', apps: 'HARD', wingetEgress: 'UNAVAILABLE', worst: 'HARD' },
        reasons: ['inventory_stale_hard'],
      }),
    });
    render(<ComplianceTab deviceId="device-1" active />);
    const banner = screen.getByTestId('compliance-staleness-hard');
    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('renders policyDrift banner when hashes differ', () => {
    mockQuery({
      data: buildState({
        policyDrift: true,
        catalogPolicyHash: '0'.repeat(64),
        catalogPolicyHashCurrent: 'f'.repeat(64),
      }),
    });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(screen.getByTestId('compliance-policy-drift')).toBeTruthy();
  });

  it('disables evaluate button + shows cooldown toast on 409', async () => {
    mockQuery({ data: buildState() });
    const conflictTrigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 409 }),
    }));
    useForceEvaluateDeviceComplianceMutationMock.mockReturnValue([
      conflictTrigger,
      { isLoading: false },
    ]);

    render(<ComplianceTab deviceId="device-1" active />);
    fireEvent.click(screen.getByTestId('compliance-evaluate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('compliance-toast-error')).toBeTruthy();
    });
    const button = screen.getByTestId('compliance-evaluate-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('shows forbidden toast on 403 evaluate response', async () => {
    mockQuery({ data: buildState() });
    const forbiddenTrigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 403 }),
    }));
    useForceEvaluateDeviceComplianceMutationMock.mockReturnValue([
      forbiddenTrigger,
      { isLoading: false },
    ]);

    render(<ComplianceTab deviceId="device-1" active />);
    fireEvent.click(screen.getByTestId('compliance-evaluate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('compliance-toast-error')).toBeTruthy();
    });
  });

  it('shows success toast after happy evaluate', async () => {
    mockQuery({ data: buildState() });
    const happyTrigger = vi.fn(() => ({
      unwrap: () => Promise.resolve(buildState({ decision: 'COMPLIANT' })),
    }));
    useForceEvaluateDeviceComplianceMutationMock.mockReturnValue([
      happyTrigger,
      { isLoading: false },
    ]);

    render(<ComplianceTab deviceId="device-1" active />);
    fireEvent.click(screen.getByTestId('compliance-evaluate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('compliance-toast-success')).toBeTruthy();
    });
  });
});
