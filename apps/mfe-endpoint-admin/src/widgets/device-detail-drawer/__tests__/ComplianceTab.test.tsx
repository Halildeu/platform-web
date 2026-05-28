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
const useGetDeviceComplianceEvaluationsQueryMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetDeviceComplianceQuery: (...args: unknown[]) => useGetDeviceComplianceQueryMock(...args),
    useForceEvaluateDeviceComplianceMutation: () => useForceEvaluateDeviceComplianceMutationMock(),
    useGetDeviceComplianceEvaluationsQuery: (...args: unknown[]) =>
      useGetDeviceComplianceEvaluationsQueryMock(...args),
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

function mockHistory(
  result: {
    data?: {
      items: Array<{
        evaluationId: string;
        decision: 'COMPLIANT' | 'NON_COMPLIANT' | 'UNAUTHORIZED' | 'UNKNOWN';
        evaluatedAt: string;
        worstStaleness: 'FRESH' | 'SOFT' | 'HARD' | 'UNAVAILABLE';
        reasons: string[];
        blockingReasons: string[];
        warnings: string[];
        policyDrift: boolean | null;
        catalogPolicyHash: string | null;
      }>;
      page: number;
      size: number;
      totalElements: number;
      totalPages: number;
    };
    error?: { status: number };
    isLoading?: boolean;
    isFetching?: boolean;
  } = {},
): void {
  useGetDeviceComplianceEvaluationsQueryMock.mockReturnValue({
    data: result.data,
    error: result.error,
    isLoading: result.isLoading ?? false,
    isFetching: result.isFetching ?? false,
    isUninitialized: !(result.data || result.error || result.isLoading || result.isFetching),
  });
}

describe('ComplianceTab', () => {
  beforeEach(() => {
    useGetDeviceComplianceQueryMock.mockReset();
    useForceEvaluateDeviceComplianceMutationMock.mockReset();
    useGetDeviceComplianceEvaluationsQueryMock.mockReset();
    mockMutation();
    mockHistory();
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

  /* ---------------------------------------------------------------- */
  /*  WEB-014B — history accordion (lazy <details>)                    */
  /* ---------------------------------------------------------------- */

  it('renders history accordion in collapsed state by default', () => {
    mockQuery({ data: buildState() });
    render(<ComplianceTab deviceId="device-1" active />);
    const details = screen.getByTestId('compliance-history') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
  });

  it('skips history query while accordion is closed (lazy load)', () => {
    mockQuery({ data: buildState() });
    render(<ComplianceTab deviceId="device-1" active />);
    expect(useGetDeviceComplianceEvaluationsQueryMock).toHaveBeenCalled();
    // The skip flag is the SECOND argument; we assert it is true (skipped).
    const lastCallArgs = useGetDeviceComplianceEvaluationsQueryMock.mock.calls.at(-1) ?? [];
    const opts = lastCallArgs[1] as { skip?: boolean } | undefined;
    expect(opts?.skip).toBe(true);
  });

  it('fires history query when accordion opens (toggle event)', () => {
    mockQuery({ data: buildState() });
    render(<ComplianceTab deviceId="device-1" active />);
    const details = screen.getByTestId('compliance-history') as HTMLDetailsElement;
    // Simulate the operator expanding the accordion. JSDOM does not
    // dispatch a `toggle` event when `open` is mutated, so we fire it
    // ourselves with `currentTarget.open === true`.
    details.open = true;
    fireEvent(details, new Event('toggle'));
    // After the next render, the skip flag must be false (query fires).
    const lastCallArgs = useGetDeviceComplianceEvaluationsQueryMock.mock.calls.at(-1) ?? [];
    const opts = lastCallArgs[1] as { skip?: boolean } | undefined;
    expect(opts?.skip).toBe(false);
  });

  it('renders history rows + drift chip when items return', () => {
    mockQuery({ data: buildState() });
    mockHistory({
      data: {
        items: [
          {
            evaluationId: 'eval-1',
            decision: 'NON_COMPLIANT',
            evaluatedAt: '2026-05-28T10:00:00Z',
            worstStaleness: 'SOFT',
            reasons: [],
            blockingReasons: ['forbidden_app_installed'],
            warnings: [],
            policyDrift: true,
            catalogPolicyHash: 'a'.repeat(64),
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<ComplianceTab deviceId="device-1" active />);
    const details = screen.getByTestId('compliance-history') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByTestId('compliance-history-list')).toBeTruthy();
    expect(screen.getByTestId('compliance-history-row-eval-1')).toBeTruthy();
    expect(screen.getByTestId('compliance-history-drift-eval-1')).toBeTruthy();
  });

  it('renders history empty state when items=[]', () => {
    mockQuery({ data: buildState() });
    mockHistory({
      data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
    });
    render(<ComplianceTab deviceId="device-1" active />);
    const details = screen.getByTestId('compliance-history') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByTestId('compliance-history-empty')).toBeTruthy();
  });

  it('renders history forbidden state on 403', () => {
    mockQuery({ data: buildState() });
    mockHistory({ error: { status: 403 } });
    render(<ComplianceTab deviceId="device-1" active />);
    const details = screen.getByTestId('compliance-history') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByTestId('compliance-history-forbidden')).toBeTruthy();
  });
});
