// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { EndpointComplianceGapPage } from '../EndpointComplianceGapPage';
import type {
  ComplianceGapResponse,
  DeviceComplianceGap,
} from '../../../entities/endpoint-compliance-gap/types';

/* ------------------------------------------------------------------ */
/*  Faz 22.7 D3 — EndpointComplianceGapPage unit tests.                 */
/*                                                                     */
/*  Component contract (mirrors WEB-014B test pattern):                 */
/*   - Default state: all gap types selected, P7D window, page=1.       */
/*   - Gap-type toggle resets page to 1.                                */
/*   - 403 -> forbidden state.                                          */
/*   - Other error -> error state.                                      */
/*   - Empty items -> empty state.                                      */
/*   - Row click -> opens DeviceDetailDrawer with initialTab=compliance.*/
/*   - Pagination prev/next nudges advance page state.                  */
/*   - filterEcho renders the canonical sample boundary.                */
/* ------------------------------------------------------------------ */

const useGetComplianceGapQueryMock = vi.fn();
const useListEndpointDevicesQueryMock = vi.fn();
const DeviceDetailDrawerMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useGetComplianceGapQuery: (...args: unknown[]) => useGetComplianceGapQueryMock(...args),
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

type GapResult = {
  data?: ComplianceGapResponse;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
};

function mockGap(result: GapResult): void {
  useGetComplianceGapQueryMock.mockReturnValue({
    data: result.data,
    error: result.error,
    isLoading: result.isLoading ?? false,
    isFetching: result.isFetching ?? false,
  });
}

function buildDeviceGap(overrides: Partial<DeviceComplianceGap> = {}): DeviceComplianceGap {
  return {
    deviceId: 'device-1',
    deviceName: 'host-1',
    lastSeen: '2026-06-02T10:00:00Z',
    gapCount: 1,
    gapStrength: 'strong',
    gaps: [
      {
        type: 'rdp_enabled',
        label: 'RDP açık',
        sourceSnapshotCollectedAt: '2026-06-02T09:55:00Z',
        stale: false,
        details: { rdpEnabled: true },
      },
    ],
    staleComponents: [],
    ...overrides,
  };
}

function buildResponse(items: DeviceComplianceGap[], total = items.length): ComplianceGapResponse {
  return {
    items,
    total,
    page: 1,
    pageSize: 20,
    filterEcho: {
      gapTypes: ['pending_security_updates', 'rdp_enabled'],
      freshnessWindow: 'PT168H',
      page: 1,
      pageSize: 20,
    },
    computedAt: '2026-06-02T10:01:00Z',
  };
}

describe('EndpointComplianceGapPage', () => {
  beforeEach(() => {
    useGetComplianceGapQueryMock.mockReset();
    useListEndpointDevicesQueryMock.mockReset();
    DeviceDetailDrawerMock.mockReset();
    useListEndpointDevicesQueryMock.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state initially', () => {
    mockGap({ isLoading: true });
    render(<EndpointComplianceGapPage />);
    expect(screen.getByTestId('compliance-gap-loading')).toBeTruthy();
  });

  it('renders empty state when no items match the filter', () => {
    mockGap({ data: buildResponse([], 0) });
    render(<EndpointComplianceGapPage />);
    expect(screen.getByTestId('compliance-gap-empty')).toBeTruthy();
  });

  it('renders forbidden state on 403', () => {
    mockGap({ error: { status: 403 } });
    render(<EndpointComplianceGapPage />);
    expect(screen.getByTestId('compliance-gap-forbidden')).toBeTruthy();
  });

  it('renders generic error state on non-403 error', () => {
    mockGap({ error: { status: 500 } });
    render(<EndpointComplianceGapPage />);
    expect(screen.getByTestId('compliance-gap-error')).toBeTruthy();
  });

  it('renders a single-device row with the gap badge and strength label', () => {
    mockGap({ data: buildResponse([buildDeviceGap()]) });
    render(<EndpointComplianceGapPage />);
    const row = screen.getByTestId('compliance-gap-row-device-1');
    expect(row).toBeTruthy();
    expect(screen.getByTestId('compliance-gap-badge-rdp_enabled')).toBeTruthy();
    expect(screen.getByTestId('compliance-gap-filter-echo')).toBeTruthy();
  });

  it('opens DeviceDetailDrawer with initialTab=compliance on row click', () => {
    mockGap({ data: buildResponse([buildDeviceGap()]) });
    render(<EndpointComplianceGapPage />);
    fireEvent.click(screen.getByTestId('compliance-gap-row-device-1'));
    expect(DeviceDetailDrawerMock).toHaveBeenCalled();
    const drawer = screen.getByTestId('drawer-mock');
    expect(drawer.getAttribute('data-initial-tab')).toBe('compliance');
  });

  it('toggle gap-type filter resets the page to 1 and updates the query args', () => {
    mockGap({ data: buildResponse([buildDeviceGap()]) });
    render(<EndpointComplianceGapPage />);
    // Initial call: all gap types + P7D + page=1
    const initialCall = useGetComplianceGapQueryMock.mock.calls.at(-1)?.[0];
    expect(initialCall.gapTypes).toEqual(['pending_security_updates', 'rdp_enabled']);
    expect(initialCall.page).toBe(1);

    fireEvent.click(screen.getByTestId('compliance-gap-filter-rdp_enabled'));
    const next = useGetComplianceGapQueryMock.mock.calls.at(-1)?.[0];
    expect(next.gapTypes).toEqual(['pending_security_updates']);
    expect(next.page).toBe(1);
  });

  it('advances page via Sonraki/Önceki', () => {
    mockGap({ data: { ...buildResponse([buildDeviceGap()], 60), page: 1, pageSize: 20 } });
    render(<EndpointComplianceGapPage />);
    fireEvent.click(screen.getByTestId('compliance-gap-next'));
    const next = useGetComplianceGapQueryMock.mock.calls.at(-1)?.[0];
    expect(next.page).toBe(2);
  });

  it('disables Önceki on first page', () => {
    mockGap({ data: buildResponse([buildDeviceGap()]) });
    render(<EndpointComplianceGapPage />);
    const prev = screen.getByTestId('compliance-gap-prev') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });
});
