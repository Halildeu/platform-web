// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type {
  ServiceEntry,
  ServicesSnapshot,
} from '../../../../../entities/endpoint-services/types';

/* ------------------------------------------------------------------ */
/*  AG-039 — ServicesView unit tests (Faz 22.5).                       */
/*                                                                     */
/*  Cross-AI absorb of Codex 019e8389 PARTIAL must_fixes:              */
/*   #1 — IslemlerTab default payload includeServices:true (separate   */
/*       test file: IslemlerTab.test.tsx covers it)                    */
/*   #2 — Fail-closed branches keep probeErrors VISIBLE; only the      */
/*       services TABLE is hidden when not fully-evaluable             */
/*   #3 — startupMode=DISABLED danger chip (data-startup attribute     */
/*       drives the assertion + CSS class check via DOM)               */
/*   #4 — i18n parity test (separate file: services-i18n.test.ts)      */
/*   #5 — probeErrors[].serviceName + summary null+absent fallback     */
/* ------------------------------------------------------------------ */

const useGetServicesLatestQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetServicesLatestQuery: (...args: unknown[]) => useGetServicesLatestQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetServicesLatestQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const SIX_SERVICES: ServiceEntry[] = [
  { rowOrdinal: 0, name: 'WinDefend', present: true, state: 'RUNNING', startupMode: 'AUTO' },
  { rowOrdinal: 1, name: 'wuauserv', present: true, state: 'RUNNING', startupMode: 'AUTO_DELAYED' },
  { rowOrdinal: 2, name: 'BITS', present: true, state: 'RUNNING', startupMode: 'AUTO_DELAYED' },
  { rowOrdinal: 3, name: 'EventLog', present: true, state: 'RUNNING', startupMode: 'AUTO' },
  {
    rowOrdinal: 4,
    name: 'EndpointAgent',
    present: true,
    state: 'RUNNING',
    startupMode: 'AUTO_DELAYED',
  },
  { rowOrdinal: 5, name: 'MpsSvc', present: true, state: 'RUNNING', startupMode: 'AUTO' },
];

function buildSnapshot(overrides: Partial<ServicesSnapshot> = {}): ServicesSnapshot {
  return {
    id: 'snap-svc-1',
    tenantId: 'tenant-1',
    deviceId: DEVICE_A,
    sourceCommandResultId: null,
    schemaVersion: 1,
    supported: true,
    probeComplete: true,
    probeDurationMs: 312,
    payloadHashSha256: 'feedbeef',
    collectedAt: '2026-06-01T13:00:00Z',
    createdAt: '2026-06-01T13:00:01Z',
    services: [...SIX_SERVICES],
    probeErrors: [],
    ...overrides,
  };
}

interface QueryStub {
  currentData?: ServicesSnapshot;
  error?: { status: number };
  isLoading?: boolean;
}
function mockQuery(stub: QueryStub) {
  useGetServicesLatestQueryMock.mockReturnValue({
    currentData: undefined,
    error: undefined,
    isLoading: false,
    ...stub,
  });
}

import { ServicesView } from '../ServicesView';

describe('ServicesView — render gates', () => {
  it('active=false iken null doner + skip:true', () => {
    mockQuery({ currentData: buildSnapshot() });
    const { container } = render(<ServicesView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
    expect(useGetServicesLatestQueryMock.mock.calls.at(-1)?.[1]).toMatchObject({
      skip: true,
    });
  });

  it('isLoading iken loading placeholder', () => {
    mockQuery({ isLoading: true });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-loading')).toBeInTheDocument();
  });

  it('403 iken forbidden', () => {
    mockQuery({ error: { status: 403 } });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-forbidden')).toBeInTheDocument();
  });

  it('404 iken empty + includeServices hint key (must_fix #4)', () => {
    mockQuery({ error: { status: 404 } });
    render(<ServicesView deviceId={DEVICE_A} active />);
    const empty = screen.getByTestId('services-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toMatch(/services\.empty/i);
  });

  it('5xx + currentData mevcut iken error testid + stale snapshot render edilmez (AG-038 precedent)', () => {
    mockQuery({
      error: { status: 502 },
      currentData: buildSnapshot(),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-error')).toBeInTheDocument();
    expect(screen.queryByTestId('services-view')).toBeNull();
    expect(screen.queryByTestId('services-table')).toBeNull();
  });

  it('stale arg (currentData.deviceId mismatch) gosterir, happy path render edilmez', () => {
    mockQuery({ currentData: buildSnapshot({ deviceId: DEVICE_B }) });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-stale-arg')).toBeInTheDocument();
    expect(screen.queryByTestId('services-view')).toBeNull();
  });
});

describe('ServicesView — supported / probeComplete branches', () => {
  it('supported=false iken unsupported + meta + probeErrors render INSIDE services-view container (Codex iter-2 P1 + must_fix #2)', () => {
    // Iter-2 P1 absorb: supported=false must live inside the
    // services-view DOM contract with data-fully-evaluable="false",
    // same as probeComplete=false. Earlier impl had it as an early-
    // return cousin which left the contract half-implemented.
    mockQuery({
      currentData: buildSnapshot({
        supported: false,
        probeComplete: null,
        probeErrors: [{ rowOrdinal: 0, code: 'NON_WINDOWS_RUNTIME', summary: 'macOS' }],
      }),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('services-view');
    expect(view).toBeInTheDocument();
    expect(view.getAttribute('data-fully-evaluable')).toBe('false');
    expect(screen.getByTestId('services-unsupported')).toBeInTheDocument();
    expect(screen.getByTestId('services-meta')).toBeInTheDocument();
    expect(screen.getByTestId('services-probe-errors')).toBeInTheDocument();
    expect(screen.queryByTestId('services-table')).toBeNull();
    expect(screen.queryByTestId('services-incomplete')).toBeNull();
  });

  it('probeComplete=false iken incomplete + meta + probeErrors VISIBLE; table HIDDEN (must_fix #2)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeComplete: false,
        services: [...SIX_SERVICES], // would-be-success rows
        probeErrors: [{ rowOrdinal: 0, code: 'SCM_TIMEOUT', summary: 'enumerate timed out' }],
      }),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-incomplete')).toBeInTheDocument();
    expect(screen.getByTestId('services-meta')).toBeInTheDocument();
    expect(screen.getByTestId('services-probe-errors')).toBeInTheDocument();
    expect(screen.queryByTestId('services-table')).toBeNull();
    expect(screen.getByTestId('services-view').getAttribute('data-fully-evaluable')).toBe('false');
  });

  it('supported=true + probeComplete=true → fully-evaluable; table + 6 rows render', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<ServicesView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('services-view');
    expect(view.getAttribute('data-fully-evaluable')).toBe('true');
    expect(screen.getByTestId('services-table')).toBeInTheDocument();
    for (const svc of SIX_SERVICES) {
      expect(screen.getByTestId(`services-row-${svc.name}`)).toBeInTheDocument();
    }
  });
});

describe('ServicesView — state + startup badge attributes', () => {
  it('per-service state attribute (RUNNING / STOPPED / DISABLED / UNKNOWN)', () => {
    mockQuery({
      currentData: buildSnapshot({
        services: [
          { rowOrdinal: 0, name: 'A', present: true, state: 'RUNNING', startupMode: 'AUTO' },
          { rowOrdinal: 1, name: 'B', present: true, state: 'STOPPED', startupMode: 'MANUAL' },
          { rowOrdinal: 2, name: 'C', present: true, state: 'DISABLED', startupMode: 'DISABLED' },
          { rowOrdinal: 3, name: 'D', present: true, state: 'UNKNOWN', startupMode: 'UNKNOWN' },
        ],
      }),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-state-A').getAttribute('data-state')).toBe('RUNNING');
    expect(screen.getByTestId('services-state-B').getAttribute('data-state')).toBe('STOPPED');
    expect(screen.getByTestId('services-state-C').getAttribute('data-state')).toBe('DISABLED');
    expect(screen.getByTestId('services-state-D').getAttribute('data-state')).toBe('UNKNOWN');
  });

  it('per-service startup attribute distinguishes AUTO / AUTO_DELAYED + DISABLED chip class is danger (must_fix #3)', () => {
    mockQuery({
      currentData: buildSnapshot({
        services: [
          { rowOrdinal: 0, name: 'A', present: true, state: 'RUNNING', startupMode: 'AUTO' },
          {
            rowOrdinal: 1,
            name: 'B',
            present: true,
            state: 'RUNNING',
            startupMode: 'AUTO_DELAYED',
          },
          { rowOrdinal: 2, name: 'C', present: true, state: 'STOPPED', startupMode: 'DISABLED' },
        ],
      }),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-startup-A').getAttribute('data-startup')).toBe('AUTO');
    expect(screen.getByTestId('services-startup-B').getAttribute('data-startup')).toBe(
      'AUTO_DELAYED',
    );
    const disabledChip = screen.getByTestId('services-startup-C');
    expect(disabledChip.getAttribute('data-startup')).toBe('DISABLED');
    // must_fix #3: startupMode=DISABLED carries the danger semantic
    // class (red), distinct from state=DISABLED runtime state.
    expect(disabledChip.className).toMatch(/state-danger/);
  });

  it('present=null distinct dom data-present="null" (tri-state)', () => {
    mockQuery({
      currentData: buildSnapshot({
        services: [
          { rowOrdinal: 0, name: 'A', present: true, state: 'RUNNING', startupMode: 'AUTO' },
          { rowOrdinal: 1, name: 'B', present: false, state: 'UNKNOWN', startupMode: 'UNKNOWN' },
          { rowOrdinal: 2, name: 'C', present: null, state: 'UNKNOWN', startupMode: 'UNKNOWN' },
        ],
      }),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-present-A').getAttribute('data-present')).toBe('true');
    expect(screen.getByTestId('services-present-B').getAttribute('data-present')).toBe('false');
    expect(screen.getByTestId('services-present-C').getAttribute('data-present')).toBe('null');
  });
});

describe('ServicesView — probeErrors null+absent fallback (must_fix #5)', () => {
  it('probeErrors=[] → empty notice', () => {
    mockQuery({ currentData: buildSnapshot({ probeErrors: [] }) });
    render(<ServicesView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('services-probe-errors-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('services-probe-errors')).toBeNull();
  });

  it('probeErrors[].serviceName null → "—" fallback', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          { rowOrdinal: 0, code: 'GENERIC_FAILURE', serviceName: null, summary: null },
          { rowOrdinal: 1, code: 'NO_SERVICE_FIELD' /* serviceName + summary omitted */ },
        ],
      }),
    });
    render(<ServicesView deviceId={DEVICE_A} active />);
    const r0 = screen.getByTestId('services-probe-error-row-0');
    expect(r0.textContent).toMatch(/GENERIC_FAILURE.*—.*—/s);
    const r1 = screen.getByTestId('services-probe-error-row-1');
    expect(r1.textContent).toMatch(/NO_SERVICE_FIELD.*—.*—/s);
  });

  it('probeErrors[].summary + serviceName HTML-like input plain text olarak render edilir (XSS guard)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          {
            rowOrdinal: 7,
            code: 'INJECT',
            serviceName: '<svg/onload=alert(1)>',
            summary: '<script>alert(2)</script>',
          },
        ],
      }),
    });
    const { container } = render(<ServicesView deviceId={DEVICE_A} active />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    const row = screen.getByTestId('services-probe-error-row-7');
    expect(row.textContent).toContain('<script>alert(2)</script>');
    expect(row.textContent).toContain('<svg/onload=alert(1)>');
  });
});

describe('ServicesView — RTK query subscription', () => {
  it('hook deviceId argumaniyla + skip:false', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<ServicesView deviceId={DEVICE_A} active />);
    const lastCall = useGetServicesLatestQueryMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ deviceId: DEVICE_A });
    expect(lastCall?.[1]).toMatchObject({ skip: false });
  });
});
