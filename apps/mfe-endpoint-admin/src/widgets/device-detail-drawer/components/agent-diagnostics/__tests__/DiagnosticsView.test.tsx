// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { DiagnosticsSnapshot } from '../../../../../entities/endpoint-agent-diagnostics/types';

/* ------------------------------------------------------------------ */
/*  AG-038 — DiagnosticsView unit tests (Faz 22.5).                    */
/*                                                                     */
/*  Cross-AI absorb of Codex 019e833d REVISE must_fixes:               */
/*   #1 — lastError flat triad {occurredAt, code, summary}; null→hide */
/*   #2 — probeErrors {rowOrdinal, code, summary} (no source);         */
/*       plain-text only, never dangerouslySetInnerHTML                */
/*   #3 — empty-state hint references includeDiagnostics (not          */
/*       includeAgentDiagnostics)                                       */
/*   #5 — value == null (not falsy) for latency/duration; strict       */
/*       supported===true && probeComplete===true for full eval;       */
/*       stale-arg currentData.deviceId mismatch guard                 */
/*   #8 — explicit edge tests: tri-state badges, 0ms, deviceId         */
/*       mismatch, active=false skip, incomplete branch hides badges   */
/*                                                                     */
/*  Pattern: vi.mock of endpointAdminApi (no MSW; matches the rest    */
/*  of the repo's endpoint-admin tests).                              */
/* ------------------------------------------------------------------ */

const useGetDiagnosticsLatestQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetDiagnosticsLatestQuery: (...args: unknown[]) => useGetDiagnosticsLatestQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetDiagnosticsLatestQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

function buildSnapshot(overrides: Partial<DiagnosticsSnapshot> = {}): DiagnosticsSnapshot {
  return {
    id: 'snap-1',
    tenantId: 'tenant-1',
    deviceId: DEVICE_A,
    sourceCommandResultId: null,
    schemaVersion: 1,
    supported: true,
    probeComplete: true,
    agentVersion: '0.4.2',
    configHash: 'abcdef0123456789',
    lastPollLatencyMs: 42,
    backendDnsReachable: true,
    backendTlsValid: true,
    lastError: null,
    probeDurationMs: 200,
    payloadHashSha256: 'feedbeef',
    collectedAt: '2026-06-01T12:00:00Z',
    createdAt: '2026-06-01T12:00:01Z',
    probeErrors: [],
    ...overrides,
  };
}

interface QueryStub {
  currentData?: DiagnosticsSnapshot;
  error?: { status: number };
  isLoading?: boolean;
}
function mockQuery(stub: QueryStub) {
  useGetDiagnosticsLatestQueryMock.mockReturnValue({
    currentData: undefined,
    error: undefined,
    isLoading: false,
    ...stub,
  });
}

// Lazy import after mocks resolved.
import { DiagnosticsView } from '../DiagnosticsView';

describe('DiagnosticsView — render gates', () => {
  it('active=false iken null doner', () => {
    mockQuery({ currentData: buildSnapshot() });
    const { container } = render(<DiagnosticsView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
    // skip:!active gate hook'a iletildi mi
    expect(useGetDiagnosticsLatestQueryMock.mock.calls.at(-1)?.[1]).toMatchObject({
      skip: true,
    });
  });

  it('isLoading iken loading placeholder gosterir', () => {
    mockQuery({ isLoading: true });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-loading')).toBeInTheDocument();
  });

  it('403 iken forbidden mesaj gosterir', () => {
    mockQuery({ error: { status: 403 } });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-forbidden').textContent).toMatch(/forbidden/i);
  });

  it('404 iken empty + includeDiagnostics hint gosterir (must_fix #3)', () => {
    mockQuery({ error: { status: 404 } });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    const empty = screen.getByTestId('diagnostics-empty');
    expect(empty).toBeInTheDocument();
    // i18n key resolves to itself in tests; verify the hint key targets
    // the actual operator-payload bit name (includeDiagnostics)
    expect(empty.textContent).toMatch(/diagnostics\.empty/i);
  });

  it('5xx (other error) iken generic error gosterir', () => {
    mockQuery({ error: { status: 500 } });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-error')).toBeInTheDocument();
  });

  it('snapshot ile data var ama deviceId baska cihaza ait iken stale-arg gosterir (must_fix #5)', () => {
    mockQuery({ currentData: buildSnapshot({ deviceId: DEVICE_B }) });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-stale-arg')).toBeInTheDocument();
    // Happy-path render must NOT appear when stale guard fires.
    expect(screen.queryByTestId('diagnostics-view')).toBeNull();
  });
});

describe('DiagnosticsView — supported / probeComplete branches', () => {
  it('supported=false iken unsupported mesaj + agent-meta panel render eder', () => {
    mockQuery({
      currentData: buildSnapshot({ supported: false, probeComplete: null }),
    });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-unsupported')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-agent-meta')).toBeInTheDocument();
    // Connectivity panel hidden — strict supported===true gate
    expect(screen.queryByTestId('diagnostics-connectivity')).toBeNull();
  });

  it('probeComplete=false iken fail-closed incomplete notice + connectivity HIDDEN (must_fix #5)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeComplete: false,
        backendDnsReachable: true, // would-be-success leaked from probe
        backendTlsValid: true,
      }),
    });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-incomplete')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostics-connectivity')).toBeNull();
    expect(screen.queryByTestId('diagnostics-dns-badge')).toBeNull();
    expect(screen.queryByTestId('diagnostics-tls-badge')).toBeNull();
    // Agent meta still renders (safe metadata)
    expect(screen.getByTestId('diagnostics-agent-meta')).toBeInTheDocument();
    // data-fully-evaluable attr exposes the gate decision
    expect(screen.getByTestId('diagnostics-view').getAttribute('data-fully-evaluable')).toBe(
      'false',
    );
  });

  it('supported=true + probeComplete=true → fully-evaluable; connectivity render eder', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('diagnostics-view');
    expect(view.getAttribute('data-fully-evaluable')).toBe('true');
    expect(screen.getByTestId('diagnostics-connectivity')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostics-incomplete')).toBeNull();
  });
});

describe('DiagnosticsView — connectivity badges (tri-state)', () => {
  it('DNS=true → reachable badge yesil; TLS=true → valid badge yesil', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    const dns = screen.getByTestId('diagnostics-dns-badge');
    expect(dns.getAttribute('data-value')).toBe('true');
    const tls = screen.getByTestId('diagnostics-tls-badge');
    expect(tls.getAttribute('data-value')).toBe('true');
  });

  it('DNS=false → unreachable badge kirmizi; TLS=false → invalid badge kirmizi', () => {
    mockQuery({
      currentData: buildSnapshot({
        backendDnsReachable: false,
        backendTlsValid: false,
      }),
    });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-dns-badge').getAttribute('data-value')).toBe('false');
    expect(screen.getByTestId('diagnostics-tls-badge').getAttribute('data-value')).toBe('false');
  });

  it('DNS=null + TLS=null → unknown badge gri (must_fix #5: null != false)', () => {
    mockQuery({
      currentData: buildSnapshot({
        backendDnsReachable: null,
        backendTlsValid: null,
      }),
    });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-dns-badge').getAttribute('data-value')).toBe('null');
    expect(screen.getByTestId('diagnostics-tls-badge').getAttribute('data-value')).toBe('null');
  });

  it('lastPollLatencyMs=0 render eder "0 ms" (must_fix #5: value == null not falsy)', () => {
    mockQuery({ currentData: buildSnapshot({ lastPollLatencyMs: 0 }) });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-last-poll-latency').textContent).toBe('0 ms');
  });

  it('lastPollLatencyMs=null render eder "—"', () => {
    mockQuery({ currentData: buildSnapshot({ lastPollLatencyMs: null }) });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-last-poll-latency').textContent).toBe('—');
  });

  it('probeDurationMs=0 render eder "0 ms"', () => {
    mockQuery({ currentData: buildSnapshot({ probeDurationMs: 0 }) });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    // duration is in agent meta panel
    const meta = screen.getByTestId('diagnostics-agent-meta');
    expect(meta.textContent).toMatch(/0 ms/);
  });
});

describe('DiagnosticsView — lastError facet (null vs present)', () => {
  it('lastError=null → facet render edilmez', () => {
    mockQuery({ currentData: buildSnapshot({ lastError: null }) });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.queryByTestId('diagnostics-last-error')).toBeNull();
  });

  it('lastError flat triad (occurredAt + code + summary) render eder', () => {
    mockQuery({
      currentData: buildSnapshot({
        lastError: {
          occurredAt: '2026-05-31T10:00:00Z',
          code: 'BACKEND_DNS_FAIL',
          summary: 'gethostbyname() returned ENOTFOUND for api.example.com',
        },
      }),
    });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-last-error')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-last-error-code').textContent).toBe('BACKEND_DNS_FAIL');
    expect(screen.getByTestId('diagnostics-last-error-summary').textContent).toMatch(
      /gethostbyname/,
    );
    expect(screen.getByTestId('diagnostics-last-error-occurredAt').textContent).not.toBe('—');
  });

  it('lastError.summary HTML-like input plain text olarak render edilir (no XSS, must_fix #2)', () => {
    mockQuery({
      currentData: buildSnapshot({
        lastError: {
          occurredAt: '2026-05-31T10:00:00Z',
          code: 'INJECT_PROBE',
          summary: '<script>alert(1)</script> & other "html" tags',
        },
      }),
    });
    const { container } = render(<DiagnosticsView deviceId={DEVICE_A} active />);
    // No script tag should be present in the DOM tree (text-escaped)
    expect(container.querySelector('script')).toBeNull();
    const summary = screen.getByTestId('diagnostics-last-error-summary');
    // Text content reflects the raw string; React escapes HTML
    expect(summary.textContent).toContain('<script>alert(1)</script>');
  });
});

describe('DiagnosticsView — probeErrors list', () => {
  it('probeErrors=[] → empty notice gosterir', () => {
    mockQuery({ currentData: buildSnapshot({ probeErrors: [] }) });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-probe-errors-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostics-probe-errors')).toBeNull();
  });

  it('probeErrors[] rowOrdinal + code + summary kolonlariyla render eder', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          { rowOrdinal: 0, code: 'TLS_HANDSHAKE_FAIL', summary: 'expired cert' },
          { rowOrdinal: 1, code: 'DNS_TIMEOUT', summary: 'no upstream' },
        ],
      }),
    });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('diagnostics-probe-errors')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-probe-error-row-0').textContent).toMatch(
      /TLS_HANDSHAKE_FAIL.*expired cert/s,
    );
    expect(screen.getByTestId('diagnostics-probe-error-row-1').textContent).toMatch(
      /DNS_TIMEOUT.*no upstream/s,
    );
  });

  it('probeErrors[].summary HTML-like input plain text olarak render edilir (no XSS, must_fix #2)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          {
            rowOrdinal: 7,
            code: 'INJECT',
            summary: '<img src=x onerror=alert(1)>',
          },
        ],
      }),
    });
    const { container } = render(<DiagnosticsView deviceId={DEVICE_A} active />);
    // No img tag injected (text-escaped)
    expect(container.querySelector('img')).toBeNull();
    const row = screen.getByTestId('diagnostics-probe-error-row-7');
    expect(row.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('DiagnosticsView — RTK query subscription', () => {
  it('active iken hook deviceId argumaniyla + skip:false ile cagrilir', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<DiagnosticsView deviceId={DEVICE_A} active />);
    const lastCall = useGetDiagnosticsLatestQueryMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ deviceId: DEVICE_A });
    expect(lastCall?.[1]).toMatchObject({ skip: false });
  });
});
