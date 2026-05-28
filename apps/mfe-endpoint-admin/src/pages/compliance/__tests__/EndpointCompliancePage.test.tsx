// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { EndpointCompliancePage } from '../EndpointCompliancePage';
import type {
  ComplianceEvaluationListResponse,
  ComplianceStateResponse,
} from '../../../entities/endpoint-device-compliance/types';

/* ------------------------------------------------------------------ */
/*  WEB-014B — EndpointCompliancePage unit tests (Faz 22.5).           */
/*                                                                     */
/*  Component contract:                                                 */
/*   - Default state queries page 0, no decision filter.                */
/*   - Decision <select> change resets page to 0 + re-queries.          */
/*   - 403 -> forbidden state.                                          */
/*   - Other error -> error state.                                      */
/*   - Empty -> empty state.                                            */
/*   - Row click -> opens DeviceDetailDrawer with initialTab="compliance" */
/*   - Pagination prev/next nudges advance page state.                  */
/*                                                                     */
/*  Mirrors the WEB-011/014A vi.mock RTK Query pattern.                */
/* ------------------------------------------------------------------ */

const useGetComplianceDeviceListQueryMock = vi.fn();
const useListEndpointDevicesQueryMock = vi.fn();
const DeviceDetailDrawerMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useGetComplianceDeviceListQuery: (...args: unknown[]) =>
    useGetComplianceDeviceListQueryMock(...args),
  useListEndpointDevicesQuery: (...args: unknown[]) => useListEndpointDevicesQueryMock(...args),
}));

vi.mock('../../../widgets/device-detail-drawer', () => ({
  DeviceDetailDrawer: (props: Record<string, unknown>) => {
    DeviceDetailDrawerMock(props);
    if (!props.open) return null;
    return (
      <div data-testid="drawer-mock" data-initial-tab={String(props.initialTab ?? '')}>
        drawer open
      </div>
    );
  },
}));

type ListResult = {
  data?: ComplianceEvaluationListResponse<ComplianceStateResponse>;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
};

function mockList(result: ListResult): void {
  useGetComplianceDeviceListQueryMock.mockReturnValue({
    data: result.data,
    error: result.error,
    isLoading: result.isLoading ?? false,
    isFetching: result.isFetching ?? false,
  });
}

/**
 * Build a `ComplianceStateResponse` fixture in the EXACT shape BE-023
 * returns (Codex 019e6dd9 iter-1 absorb — invented sibling DTOs in
 * the prior fixture set caused the post-impl RED). `hostname` is NOT
 * part of `ComplianceStateResponse`; the cross-device list page
 * resolves it from `useListEndpointDevicesQuery` cache.
 */
function buildItem(overrides: Partial<ComplianceStateResponse> = {}): ComplianceStateResponse {
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

describe('EndpointCompliancePage', () => {
  beforeEach(() => {
    useGetComplianceDeviceListQueryMock.mockReset();
    useListEndpointDevicesQueryMock.mockReset();
    DeviceDetailDrawerMock.mockReset();
    useListEndpointDevicesQueryMock.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('queries page 0 with no decision filter by default', () => {
    mockList({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } });
    render(<EndpointCompliancePage />);
    const lastCallArgs = useGetComplianceDeviceListQueryMock.mock.calls.at(-1) ?? [];
    const args = lastCallArgs[0] as { decision?: string; page?: number; size?: number };
    expect(args.page).toBe(0);
    expect(args.decision).toBeUndefined();
  });

  it('renders forbidden state on 403', () => {
    mockList({ error: { status: 403 } });
    render(<EndpointCompliancePage />);
    expect(screen.getByTestId('compliance-list-forbidden')).toBeTruthy();
  });

  it('renders error state on non-403 error', () => {
    mockList({ error: { status: 500 } });
    render(<EndpointCompliancePage />);
    expect(screen.getByTestId('compliance-list-error')).toBeTruthy();
  });

  it('renders loading state', () => {
    mockList({ isLoading: true });
    render(<EndpointCompliancePage />);
    expect(screen.getByTestId('compliance-list-loading')).toBeTruthy();
  });

  it('renders empty state when items=[]', () => {
    mockList({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } });
    render(<EndpointCompliancePage />);
    expect(screen.getByTestId('compliance-list-empty')).toBeTruthy();
  });

  it('renders table rows and decision badge for each item', () => {
    mockList({
      data: {
        items: [
          buildItem({ deviceId: 'd1', decision: 'NON_COMPLIANT' }),
          buildItem({ deviceId: 'd2', decision: 'COMPLIANT' }),
        ],
        page: 0,
        size: 20,
        totalElements: 2,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePage />);
    expect(screen.getByTestId('compliance-list-table')).toBeTruthy();
    expect(screen.getByTestId('compliance-list-row-d1')).toBeTruthy();
    expect(screen.getByTestId('compliance-list-row-d2')).toBeTruthy();
  });

  it('renders drift chip when policyDrift=true', () => {
    mockList({
      data: {
        items: [buildItem({ deviceId: 'd1', policyDrift: true })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePage />);
    expect(screen.getByTestId('compliance-list-drift-d1')).toBeTruthy();
  });

  it('decision filter change resets page to 0 + re-queries with decision', () => {
    mockList({
      data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
    });
    render(<EndpointCompliancePage />);
    const select = screen.getByTestId('compliance-list-decision-filter') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'NON_COMPLIANT' } });
    const lastCallArgs = useGetComplianceDeviceListQueryMock.mock.calls.at(-1) ?? [];
    const args = lastCallArgs[0] as { decision?: string; page?: number };
    expect(args.decision).toBe('NON_COMPLIANT');
    expect(args.page).toBe(0);
  });

  it('row click opens drawer with initialTab="compliance"', () => {
    mockList({
      data: {
        items: [buildItem({ deviceId: 'd1' })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePage />);
    fireEvent.click(screen.getByTestId('compliance-list-row-d1'));
    const drawer = screen.getByTestId('drawer-mock');
    expect(drawer.getAttribute('data-initial-tab')).toBe('compliance');
  });

  it('pagination next nudges page state forward', () => {
    mockList({
      data: {
        items: [buildItem({ deviceId: 'd1' })],
        page: 0,
        size: 20,
        totalElements: 40,
        totalPages: 2,
      },
    });
    render(<EndpointCompliancePage />);
    const nextBtn = screen.getByTestId('compliance-list-next') as HTMLButtonElement;
    fireEvent.click(nextBtn);
    const lastCallArgs = useGetComplianceDeviceListQueryMock.mock.calls.at(-1) ?? [];
    const args = lastCallArgs[0] as { page?: number };
    expect(args.page).toBe(1);
  });

  it('pagination hidden when totalPages <= 1', () => {
    mockList({
      data: {
        items: [buildItem({ deviceId: 'd1' })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePage />);
    expect(screen.queryByTestId('compliance-list-pagination')).toBeNull();
  });
});
