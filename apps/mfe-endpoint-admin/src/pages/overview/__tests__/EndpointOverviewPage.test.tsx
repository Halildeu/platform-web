// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import EndpointOverviewPage from '../EndpointOverviewPage';
import { createEndpointAdminT } from '../../../i18n';

/* ------------------------------------------------------------------ */
/*  Faz 22 slice S5 — EndpointOverviewPage unit tests.                  */
/*                                                                     */
/*  Mirrors the WEB-014B / compliance-gap pattern: mock the RTK api     */
/*  MODULE (no store, no network) and drive each hook's result. Focus:  */
/*   - all six cards render their headings;                             */
/*   - initial load shows an aria-busy skeleton and NO error;           */
/*   - a real successful `0`/value renders (never coerced from          */
/*     undefined);                                                      */
/*   - Codex data-integrity: one sub-query error is isolated to its     */
/*     own metric — siblings + other cards keep their values;           */
/*   - 403 maps to the forbidden message.                               */
/* ------------------------------------------------------------------ */

const useListEndpointDevicesQueryMock = vi.fn();
const useGetComplianceDeviceListQueryMock = vi.fn();
const useGetComplianceGapQueryMock = vi.fn();
const useListEndpointEnrollmentsQueryMock = vi.fn();
const useListAgentUpdateReleasesQueryMock = vi.fn();
const useListSoftwareBundlesQueryMock = vi.fn();
const useListEndpointAuditEventsQueryMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListEndpointDevicesQuery: (...args: unknown[]) => useListEndpointDevicesQueryMock(...args),
  useGetComplianceDeviceListQuery: (...args: unknown[]) =>
    useGetComplianceDeviceListQueryMock(...args),
  useGetComplianceGapQuery: (...args: unknown[]) => useGetComplianceGapQueryMock(...args),
  useListEndpointEnrollmentsQuery: (...args: unknown[]) =>
    useListEndpointEnrollmentsQueryMock(...args),
  useListAgentUpdateReleasesQuery: (...args: unknown[]) =>
    useListAgentUpdateReleasesQueryMock(...args),
  useListSoftwareBundlesQuery: (...args: unknown[]) => useListSoftwareBundlesQueryMock(...args),
  useListEndpointAuditEventsQuery: (...args: unknown[]) =>
    useListEndpointAuditEventsQueryMock(...args),
}));

// Resolve the SAME locale the component will (mirrors i18n resolveLocale) so
// assertions on translated text are environment-robust.
const locale =
  (typeof navigator !== 'undefined' ? navigator.language : 'tr').slice(0, 2).toLowerCase() === 'en'
    ? 'en'
    : 'tr';
const t = createEndpointAdminT(locale);

const refetch = vi.fn();

function loadingState() {
  return { data: undefined, error: undefined, isLoading: true, isFetching: true, refetch };
}
function okState(data: unknown) {
  return { data, error: undefined, isLoading: false, isFetching: false, refetch };
}
function errorState(status: number) {
  return { data: undefined, error: { status }, isLoading: false, isFetching: false, refetch };
}

const allMocks = [
  useListEndpointDevicesQueryMock,
  useGetComplianceDeviceListQueryMock,
  useGetComplianceGapQueryMock,
  useListEndpointEnrollmentsQueryMock,
  useListAgentUpdateReleasesQueryMock,
  useListSoftwareBundlesQueryMock,
  useListEndpointAuditEventsQueryMock,
];

function setAllReady(): void {
  // 4 devices → managed (ONLINE+STALE+OFFLINE) = 3, pendingEnrollment = 1.
  useListEndpointDevicesQueryMock.mockReturnValue(
    okState([
      { status: 'ONLINE' },
      { status: 'STALE' },
      { status: 'OFFLINE' },
      { status: 'PENDING_ENROLLMENT' },
    ]),
  );
  useGetComplianceDeviceListQueryMock.mockReturnValue(okState({ totalElements: 3 }));
  useGetComplianceGapQueryMock.mockReturnValue(
    okState({ total: 4, computedAt: '2026-07-10T10:00:00Z' }),
  );
  useListEndpointEnrollmentsQueryMock.mockReturnValue(
    okState([{ status: 'PENDING' }, { status: 'CONSUMED' }]),
  );
  useListAgentUpdateReleasesQueryMock.mockReturnValue(okState({ totalElements: 1 }));
  useListSoftwareBundlesQueryMock.mockReturnValue(okState({ totalElements: 2 }));
  useListEndpointAuditEventsQueryMock.mockReturnValue(
    okState([
      {
        id: 'e1',
        action: 'DEVICE_ENROLLED',
        eventType: 'ENROLLMENT',
        occurredAt: '2026-07-10T09:00:00Z',
        performedBySubject: 'admin',
        deviceId: null,
      },
    ]),
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EndpointOverviewPage />
    </MemoryRouter>,
  );
}

const CARD_TEST_IDS = [
  'overview-card-fleet',
  'overview-card-compliance',
  'overview-card-gaps',
  'overview-card-enrollment',
  'overview-card-drafts',
  'overview-card-activity',
];

describe('EndpointOverviewPage', () => {
  beforeEach(() => {
    allMocks.forEach((m) => m.mockReset());
    refetch.mockReset();
    // Default: every card mid-initial-load unless a test overrides.
    allMocks.forEach((m) => m.mockReturnValue(loadingState()));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all six independent cards with their headings', () => {
    setAllReady();
    renderPage();
    for (const id of CARD_TEST_IDS) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // Heading resolves via i18n (no raw-key leak).
    expect(
      screen.getByRole('heading', { name: t('endpointAdmin.overview.fleet.title') }),
    ).toBeTruthy();
    // Never hits the network — the mocked hook was consulted.
    expect(useListEndpointDevicesQueryMock).toHaveBeenCalled();
  });

  it('shows an aria-busy skeleton on initial load and no error', () => {
    // Default beforeEach state is loading for every card.
    renderPage();
    const skeleton = screen.getByTestId('overview-fleet-skeleton');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    // Shells still render so headings are visible while loading.
    for (const id of CARD_TEST_IDS) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a real server total (managed = ONLINE+STALE+OFFLINE) not array length', () => {
    setAllReady();
    renderPage();
    expect(screen.getByTestId('overview-fleet-managed-total').textContent).toBe('3');
    expect(screen.getByTestId('overview-gaps-total').textContent).toBe('4');
    // Card 5 combined only when both succeed: 1 + 2 = 3.
    expect(screen.getByTestId('overview-drafts-total').textContent).toBe('3');
    expect(screen.getByTestId('overview-activity-list')).toBeTruthy();
    expect(screen.queryByTestId('overview-fleet-skeleton')).toBeNull();
  });

  it('isolates one failing sub-query: siblings and other cards keep their values', () => {
    setAllReady();
    // Only the NON_COMPLIANT compliance sub-query errors.
    useGetComplianceDeviceListQueryMock.mockImplementation((args: { decision?: string }) =>
      args?.decision === 'NON_COMPLIANT' ? errorState(500) : okState({ totalElements: 3 }),
    );
    renderPage();
    // Failed metric shows its own alert...
    expect(screen.getByTestId('overview-compliance-non-compliant-error')).toBeTruthy();
    // ...while sibling metrics keep their values...
    expect(screen.getByTestId('overview-compliance-unauthorized-value').textContent).toBe('3');
    expect(screen.getByTestId('overview-compliance-unknown-value').textContent).toBe('3');
    // ...and an unrelated card is untouched.
    expect(screen.getByTestId('overview-fleet-managed-total').textContent).toBe('3');
  });

  it('maps a 403 to the forbidden message (not a generic error)', () => {
    setAllReady();
    useGetComplianceGapQueryMock.mockReturnValue(errorState(403));
    renderPage();
    const gapsError = screen.getByTestId('overview-gaps-error');
    expect(gapsError.getAttribute('role')).toBe('alert');
    expect(gapsError.textContent).toContain(t('endpointAdmin.overview.state.forbidden'));
  });
});
