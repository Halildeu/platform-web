// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { AppControlSnapshot } from '../../../../../entities/endpoint-app-control/types';

/* ------------------------------------------------------------------ */
/*  AG-041 — AppControlView unit tests (Faz 22.5).                     */
/*                                                                     */
/*  Inherits AG-038/AG-039/AG-040 precedents:                          */
/*   - Generic error cuts BEFORE snapshot fall-through                 */
/*   - Fail-closed branches keep meta + probeErrors visible inside     */
/*     app-control-view container                                      */
/*   - currentData-anchored stale-arg guard                            */
/*   - WdacMode 4-value badge tone vector                              */
/*   - AppLocker 5-collection per-rule chips                           */
/*   - AppIDSvc state + startup + present tri-state                    */
/*   - Plain-text XSS guards on summary + source                       */
/* ------------------------------------------------------------------ */

const useGetAppControlLatestQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetAppControlLatestQuery: (...args: unknown[]) => useGetAppControlLatestQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetAppControlLatestQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const GOLDEN_SNAPSHOT: AppControlSnapshot = {
  snapshotId: 'snap-01',
  deviceId: DEVICE_A,
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  wdacQueryable: true,
  appLockerQueryable: true,
  wdacMode: 'UNKNOWN',
  wdacBootEnforcementPresent: false,
  wdacActiveCipPolicyCount: 0,
  wdacLegacySipolicyPresent: false,
  wdacMultiPolicyMode: false,
  appLockerExeRule: 'NOT_CONFIGURED',
  appLockerDllRule: 'NOT_CONFIGURED',
  appLockerScriptRule: 'NOT_CONFIGURED',
  appLockerMsiRule: 'NOT_CONFIGURED',
  appLockerAppxRule: 'NOT_CONFIGURED',
  appLockerAppIdSvcState: 'STOPPED',
  appLockerAppIdSvcStartup: 'MANUAL',
  appLockerAppIdSvcPresent: true,
  probeDurationMs: 100,
  payloadHashSha256: 'a'.repeat(64),
  collectedAt: '2026-06-01T10:00:00Z',
  createdAt: '2026-06-01T10:00:01Z',
  probeErrors: [],
};

const FAIL_CLOSED_SNAPSHOT: AppControlSnapshot = {
  ...GOLDEN_SNAPSHOT,
  supported: false,
  probeComplete: false,
  wdacQueryable: false,
  appLockerQueryable: false,
  wdacMode: 'UNKNOWN',
  wdacBootEnforcementPresent: null,
  wdacActiveCipPolicyCount: null,
  wdacLegacySipolicyPresent: null,
  wdacMultiPolicyMode: null,
  appLockerExeRule: 'UNKNOWN',
  appLockerDllRule: 'UNKNOWN',
  appLockerScriptRule: 'UNKNOWN',
  appLockerMsiRule: 'UNKNOWN',
  appLockerAppxRule: 'UNKNOWN',
  appLockerAppIdSvcState: 'UNKNOWN',
  appLockerAppIdSvcStartup: 'UNKNOWN',
  appLockerAppIdSvcPresent: null,
  probeErrors: [{ rowOrdinal: 0, code: 'NO_EVIDENCE', source: null, summary: null }],
};

async function importAppControlView() {
  return await import('../AppControlView');
}

describe('AppControlView state precedence', () => {
  it('renders nothing when active is false', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    const { container } = render(<AppControlView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: true,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-loading')).toBeTruthy();
  });

  it('renders forbidden on 403', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: { status: 403 },
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-forbidden')).toBeTruthy();
  });

  it('renders empty + operator hint on 404', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: { status: 404 },
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-empty')).toBeTruthy();
  });

  it('error cuts before snapshot fall-through', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: GOLDEN_SNAPSHOT,
      isLoading: false,
      error: { status: 500 },
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-error')).toBeTruthy();
    expect(screen.queryByTestId('app-control-view')).toBeNull();
  });

  it('renders nothing when no error and no snapshot', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: undefined,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    const { container } = render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('AppControlView happy path', () => {
  it('renders golden snapshot with WDAC + AppLocker + meta', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: GOLDEN_SNAPSHOT,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('app-control-view');
    expect(root.getAttribute('data-supported')).toBe('true');
    expect(root.getAttribute('data-probe-complete')).toBe('true');
    expect(root.getAttribute('data-fully-evaluable')).toBe('true');
    expect(screen.getByTestId('app-control-view-meta')).toBeTruthy();
    expect(screen.getByTestId('app-control-view-wdac')).toBeTruthy();
    expect(screen.getByTestId('app-control-view-app-locker')).toBeTruthy();
  });

  it('renders all 5 AppLocker rule chips', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: GOLDEN_SNAPSHOT,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-applocker-exe')).toBeTruthy();
    expect(screen.getByTestId('app-control-view-applocker-dll')).toBeTruthy();
    expect(screen.getByTestId('app-control-view-applocker-script')).toBeTruthy();
    expect(screen.getByTestId('app-control-view-applocker-msi')).toBeTruthy();
    expect(screen.getByTestId('app-control-view-applocker-appx')).toBeTruthy();
  });

  it('renders WDAC evidence tri-state (null = "—")', async () => {
    const partialEvidence: AppControlSnapshot = {
      ...GOLDEN_SNAPSHOT,
      wdacBootEnforcementPresent: null,
      wdacActiveCipPolicyCount: null,
    };
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: partialEvidence,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-wdac-boot').textContent).toContain(
      'endpointAdmin.drawer.appControl.bool.null',
    );
    expect(screen.getByTestId('app-control-view-wdac-cip-count').textContent).toBe('—');
  });

  it('renders AppIDSvc startup AUTO_DELAYED via 5-value enum', async () => {
    const withDelayed: AppControlSnapshot = {
      ...GOLDEN_SNAPSHOT,
      appLockerAppIdSvcStartup: 'AUTO_DELAYED',
    };
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: withDelayed,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    const node = screen.getByTestId('app-control-view-appid-startup');
    expect(node.querySelector('[data-startup="AUTO_DELAYED"]')).not.toBeNull();
  });
});

describe('AppControlView fail-closed branches', () => {
  it('renders fail-closed notice when probeComplete=false', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: FAIL_CLOSED_SNAPSHOT,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    const root = screen.getByTestId('app-control-view');
    expect(root.getAttribute('data-fully-evaluable')).toBe('false');
    expect(screen.getByTestId('app-control-view-fail-closed')).toBeTruthy();
    // WDAC + AppLocker scalar grids hidden in fail-closed mode.
    expect(screen.queryByTestId('app-control-view-wdac')).toBeNull();
    expect(screen.queryByTestId('app-control-view-app-locker')).toBeNull();
    // probeErrors still visible AS evidence.
    expect(screen.getByTestId('app-control-view-probe-errors')).toBeTruthy();
  });

  it('renders fail-closed when supported=false (non-Windows stub)', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: { ...FAIL_CLOSED_SNAPSHOT, probeComplete: false },
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-fail-closed')).toBeTruthy();
  });
});

describe('AppControlView stale-arg guard', () => {
  it('warns when snapshot.deviceId differs from active deviceId', async () => {
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: { ...GOLDEN_SNAPSHOT, deviceId: DEVICE_B },
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    expect(screen.getByTestId('app-control-view-stale')).toBeTruthy();
    expect(screen.queryByTestId('app-control-view')).toBeNull();
  });
});

describe('AppControlView probe errors table', () => {
  it('renders probeErrors with row ordinal + code + source + summary', async () => {
    const withErrors: AppControlSnapshot = {
      ...GOLDEN_SNAPSHOT,
      probeErrors: [
        {
          rowOrdinal: 0,
          code: 'REGISTRY_DENIED',
          source: 'wdac',
          summary: 'CI policy key unreadable',
        },
        {
          rowOrdinal: 1,
          code: 'APP_ID_SVC_QUERY_FAILED',
          source: 'appLocker',
          summary: null,
        },
      ],
    };
    useGetAppControlLatestQueryMock.mockReturnValue({
      currentData: withErrors,
      isLoading: false,
      error: undefined,
    });
    const { AppControlView } = await importAppControlView();
    render(<AppControlView deviceId={DEVICE_A} active={true} />);
    const row0 = screen.getByTestId('app-control-view-probe-error-row-0');
    expect(row0.getAttribute('data-code')).toBe('REGISTRY_DENIED');
    expect(row0.textContent).toContain('CI policy key unreadable');
    expect(row0.textContent).toContain('wdac');
    const row1 = screen.getByTestId('app-control-view-probe-error-row-1');
    expect(row1.getAttribute('data-code')).toBe('APP_ID_SVC_QUERY_FAILED');
    // null summary renders as "—" placeholder.
    expect(row1.textContent).toContain('—');
  });
});
