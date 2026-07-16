// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EndpointOverviewPage from '../EndpointOverviewPage';
import { EndpointAdminRouter } from '../../../app/router/EndpointAdminRouter';
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

/**
 * A successful ComplianceGapResponse okState with a valid `filterEcho` +
 * `computedAt` (the card reads both). Defaults echo P7D + both gap types so
 * fixtures that don't care about the echo still render without crashing.
 */
function gapOk(
  overrides: {
    total?: number;
    computedAt?: string;
    filterEcho?: { freshnessWindow: string; gapTypes: string[]; page: number; pageSize: number };
  } = {},
) {
  return okState({
    items: [],
    total: overrides.total ?? 0,
    page: 1,
    pageSize: 1,
    computedAt: overrides.computedAt ?? '2026-07-10T10:00:00Z',
    filterEcho: overrides.filterEcho ?? {
      freshnessWindow: 'P7D',
      gapTypes: ['rdp_enabled', 'pending_security_updates'],
      page: 1,
      pageSize: 1,
    },
  });
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
  useGetComplianceGapQueryMock.mockReturnValue(gapOk({ total: 4 }));
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

beforeAll(() => {
  // jsdom implements neither; keep them stubbed so any child that reaches for
  // them (e.g. when the full router mounts a page) doesn't throw.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

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
    // Kind comes from the shared classifier (403 → forbidden) — no local status map.
    expect(gapsError.textContent).toContain(t('endpointAdmin.capabilityState.forbidden.title'));
    // A forbidden card offers NO retry (retrying can't change authorization).
    expect(gapsError.querySelector('button')).toBeNull();
  });

  /* ---------------- MUST-FIX 3: exact query args ---------------- */

  it('calls each card query with its exact contract args', () => {
    setAllReady();
    renderPage();
    // Card 2 — three independent server-total counts (size:1 = cheap count).
    expect(useGetComplianceDeviceListQueryMock).toHaveBeenCalledWith({
      decision: 'NON_COMPLIANT',
      page: 0,
      size: 1,
    });
    expect(useGetComplianceDeviceListQueryMock).toHaveBeenCalledWith({
      decision: 'UNAUTHORIZED',
      page: 0,
      size: 1,
    });
    expect(useGetComplianceDeviceListQueryMock).toHaveBeenCalledWith({
      decision: 'UNKNOWN',
      page: 0,
      size: 1,
    });
    // Card 5 — the two draft counts.
    expect(useListAgentUpdateReleasesQueryMock).toHaveBeenCalledWith({
      status: 'DRAFT',
      page: 0,
      size: 1,
    });
    expect(useListSoftwareBundlesQueryMock).toHaveBeenCalledWith({
      status: 'DRAFT',
      page: 0,
      size: 1,
    });
    // Card 6 — recent activity (limit 5).
    expect(useListEndpointAuditEventsQueryMock).toHaveBeenCalledWith({ limit: 5 });
    // Card 3 — gap count over observed devices. pageSize:1 (total only, never items).
    expect(useGetComplianceGapQueryMock).toHaveBeenCalledWith({
      gapTypes: ['pending_security_updates', 'rdp_enabled'],
      freshnessWindow: 'PT168H',
      page: 1,
      pageSize: 1,
    });
  });

  /* ---------------- MUST-FIX 3: real zero vs undefined ---------------- */

  it('renders a real 0 for a successful zero/empty, never coercing undefined', () => {
    useListEndpointDevicesQueryMock.mockReturnValue(okState([])); // plain [] → real 0
    useListEndpointEnrollmentsQueryMock.mockReturnValue(okState([])); // plain [] → real 0
    useGetComplianceDeviceListQueryMock.mockReturnValue(okState({ totalElements: 0 }));
    useGetComplianceGapQueryMock.mockReturnValue(gapOk({ total: 0 }));
    useListAgentUpdateReleasesQueryMock.mockReturnValue(okState({ totalElements: 0 }));
    useListSoftwareBundlesQueryMock.mockReturnValue(okState({ totalElements: 0 }));
    useListEndpointAuditEventsQueryMock.mockReturnValue(okState([]));
    renderPage();
    expect(screen.getByTestId('overview-fleet-managed-total').textContent).toBe('0');
    expect(screen.getByTestId('overview-enrollment-pending').textContent).toBe('0');
    expect(screen.getByTestId('overview-compliance-non-compliant-value').textContent).toBe('0');
    expect(screen.getByTestId('overview-gaps-total').textContent).toBe('0');
    expect(screen.getByTestId('overview-drafts-total').textContent).toBe('0'); // 0 + 0
    // A successful empty audit list → the "no activity" empty state (not a skeleton/error).
    expect(screen.getByTestId('overview-activity-empty')).toBeTruthy();
  });

  it('undefined data shows a skeleton and never a 0', () => {
    // Default beforeEach = loading (data undefined) on every card.
    renderPage();
    expect(screen.getByTestId('overview-fleet-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('overview-fleet-managed-total')).toBeNull();
    expect(screen.queryByTestId('overview-drafts-total')).toBeNull();
  });

  it('a 404 shows the not-enabled message (no data), never a 0', () => {
    setAllReady();
    useGetComplianceGapQueryMock.mockReturnValue(errorState(404));
    renderPage();
    const gapsError = screen.getByTestId('overview-gaps-error');
    // 404 under the fleet-capability policy → notEnabled (not a generic error).
    expect(gapsError.textContent).toContain(t('endpointAdmin.capabilityState.notEnabled.title'));
    // notEnabled is not retryable either.
    expect(gapsError.querySelector('button')).toBeNull();
    expect(screen.queryByTestId('overview-gaps-total')).toBeNull();
  });

  /* ---------------- MUST-FIX 3: draft partial failure ---------------- */

  it('draft card: agent ok + bundles error → agent count, bundle —, no combined, isolated retry', () => {
    setAllReady();
    useListAgentUpdateReleasesQueryMock.mockReturnValue(okState({ totalElements: 5 }));
    const bundleRefetch = vi.fn();
    useListSoftwareBundlesQueryMock.mockReturnValue({
      data: undefined,
      error: { status: 500 },
      isLoading: false,
      isFetching: false,
      refetch: bundleRefetch,
    });
    renderPage();
    expect(screen.getByTestId('overview-drafts-agent-updates-value').textContent).toBe('5');
    const bundleError = screen.getByTestId('overview-drafts-software-bundles-error');
    expect(bundleError.textContent).toContain('—');
    // Combined total hidden while a sub-source has no value.
    expect(screen.queryByTestId('overview-drafts-total')).toBeNull();
    // Retry refetches ONLY the bundle sub-query (the shared `refetch` is untouched).
    fireEvent.click(within(bundleError).getByRole('button'));
    expect(bundleRefetch).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  /* ---------------- MUST-FIX 1 / 3: filterEcho response-echo ---------------- */

  it('gaps card renders the RESPONSE filterEcho window + gap types, not the request constant', () => {
    setAllReady();
    // Response echoes P7D even though the request sent PT168H.
    useGetComplianceGapQueryMock.mockReturnValue(
      gapOk({
        total: 4,
        filterEcho: {
          freshnessWindow: 'P7D',
          gapTypes: ['rdp_enabled', 'pending_security_updates'],
          page: 1,
          pageSize: 1,
        },
      }),
    );
    renderPage();
    const freshness = screen.getByTestId('overview-gaps-freshness');
    // The P7D-derived window is shown...
    expect(freshness.textContent).toContain(
      t('endpointAdmin.overview.gaps.window.days').replace('{n}', '7'),
    );
    // ...and the request constant (PT168H → "168 hours/saat") is NOT — proving the
    // card reads the echo, not the 'PT168H' request literal.
    expect(freshness.textContent).not.toContain(
      t('endpointAdmin.overview.gaps.window.hours').replace('{n}', '168'),
    );
    expect(freshness.textContent).not.toContain('168');
    // Gap-type labels come from filterEcho.gapTypes (translated via the shared keys).
    const types = screen.getByTestId('overview-gaps-types');
    expect(types.textContent).toContain(
      t('endpointAdmin.complianceGap.filter.gapType.rdp_enabled'),
    );
    expect(types.textContent).toContain(
      t('endpointAdmin.complianceGap.filter.gapType.pending_security_updates'),
    );
  });

  /* ---------------- MUST-FIX 2: cached refetch error (stale-error) ---------------- */

  it('renderQueryBody card: cached value + errored refetch keeps value + polite stale warning + retry', () => {
    setAllReady();
    const fleetRefetch = vi.fn();
    useListEndpointDevicesQueryMock.mockReturnValue({
      data: [{ status: 'ONLINE' }, { status: 'STALE' }, { status: 'OFFLINE' }],
      error: { status: 500 },
      isLoading: false,
      isFetching: false,
      refetch: fleetRefetch,
    });
    renderPage();
    // The value stays on screen (managed = 3)...
    expect(screen.getByTestId('overview-fleet-managed-total').textContent).toBe('3');
    // ...alongside a polite (not assertive) stale-error warning.
    const stale = screen.getByTestId('overview-fleet-stale-error');
    expect(stale.getAttribute('aria-live')).toBe('polite');
    expect(stale.textContent).toContain(t('endpointAdmin.overview.state.staleError'));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(within(stale).getByRole('button'));
    expect(fleetRefetch).toHaveBeenCalledTimes(1);
  });

  it('NumberStat: cached value + errored refetch keeps value + stale warning + isolated retry', () => {
    setAllReady();
    const ncRefetch = vi.fn();
    useGetComplianceDeviceListQueryMock.mockImplementation((args?: { decision?: string }) =>
      args?.decision === 'NON_COMPLIANT'
        ? {
            data: { totalElements: 7 },
            error: { status: 500 },
            isLoading: false,
            isFetching: false,
            refetch: ncRefetch,
          }
        : okState({ totalElements: 3 }),
    );
    renderPage();
    expect(screen.getByTestId('overview-compliance-non-compliant-value').textContent).toBe('7');
    const stale = screen.getByTestId('overview-compliance-non-compliant-stale-error');
    expect(stale.textContent).toContain(t('endpointAdmin.overview.state.staleError'));
    fireEvent.click(within(stale).getByRole('button'));
    expect(ncRefetch).toHaveBeenCalledTimes(1);
  });

  it('draft card hides the combined total when a sub-source is in the stale-error state', () => {
    setAllReady();
    useListAgentUpdateReleasesQueryMock.mockReturnValue(okState({ totalElements: 2 }));
    useListSoftwareBundlesQueryMock.mockReturnValue({
      data: { totalElements: 3 },
      error: { status: 500 },
      isLoading: false,
      isFetching: false,
      refetch,
    });
    renderPage();
    // Combined hidden (bundle stale-errored) but BOTH per-metric values remain.
    expect(screen.queryByTestId('overview-drafts-total')).toBeNull();
    expect(screen.getByTestId('overview-drafts-agent-updates-value').textContent).toBe('2');
    expect(screen.getByTestId('overview-drafts-software-bundles-value').textContent).toBe('3');
    expect(screen.getByTestId('overview-drafts-software-bundles-stale-error')).toBeTruthy();
  });

  /* ---------------- MUST-FIX 3: audit view-all href is mount-aware ---------------- */

  it('audit view-all href respects the shell mount vs standalone', () => {
    setAllReady();
    render(
      <MemoryRouter initialEntries={['/endpoint-admin/overview']}>
        <Routes>
          <Route path="/endpoint-admin/*" element={<EndpointOverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('overview-activity-viewall').getAttribute('href')).toBe(
      '/endpoint-admin/audit',
    );
    cleanup();
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <EndpointOverviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('overview-activity-viewall').getAttribute('href')).toBe('/audit');
  });

  /* ---------------- MUST-FIX 3: index landing (behavioral) ---------------- */

  it('mounting the router at /endpoint-admin lands on the overview page', async () => {
    setAllReady();
    render(
      <MemoryRouter initialEntries={['/endpoint-admin']}>
        <Routes>
          <Route path="/endpoint-admin/*" element={<EndpointAdminRouter />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('endpoint-admin-overview-page')).toBeTruthy();
  });
});
