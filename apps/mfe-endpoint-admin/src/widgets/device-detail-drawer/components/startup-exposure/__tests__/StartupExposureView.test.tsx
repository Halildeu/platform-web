// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type {
  StartupApp,
  StartupExposureSnapshot,
} from '../../../../../entities/endpoint-startup-exposure/types';

/* ------------------------------------------------------------------ */
/*  AG-040 — StartupExposureView unit tests (Faz 22.5).                */
/*                                                                     */
/*  Inherits AG-038/AG-039 precedents:                                 */
/*   - DICT_EN parity (separate file: startup-exposure-i18n.test.ts)   */
/*   - Generic error cuts BEFORE snapshot fall-through                 */
/*   - Fail-closed branches keep meta + exposure-summary + probeErrors */
/*     visible inside startup-exposure-view container                  */
/*   - currentData-anchored stale-arg guard                            */
/*   - Tri-state badges (rdpEnabled / windowsFirewallEventLogEnabled / */
/*     per-app enabled)                                                */
/*   - Plain-text XSS guards on name + source + summary                */
/* ------------------------------------------------------------------ */

const useGetStartupExposureLatestQueryMock = vi.fn();

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetStartupExposureLatestQuery: (...args: unknown[]) =>
    useGetStartupExposureLatestQueryMock(...args),
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

beforeEach(() => {
  useGetStartupExposureLatestQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const SAMPLE_APPS: StartupApp[] = [
  {
    rowOrdinal: 0,
    name: 'OneDriveSetup',
    location: 'HKLM_RUN',
    enabled: true,
    probeOrigin: 'REGISTRY',
  },
  {
    rowOrdinal: 1,
    name: 'EdgeUpdate',
    location: 'HKLM_RUNONCE',
    enabled: true,
    probeOrigin: 'REGISTRY',
  },
  {
    rowOrdinal: 2,
    name: 'UserStartup-Task',
    location: 'TASK_SCHEDULER:CUSTOM',
    enabled: false,
    probeOrigin: 'SCHEDULED_TASK',
  },
];

function buildSnapshot(overrides: Partial<StartupExposureSnapshot> = {}): StartupExposureSnapshot {
  return {
    id: 'snap-se-1',
    tenantId: 'tenant-1',
    deviceId: DEVICE_A,
    sourceCommandResultId: null,
    schemaVersion: 1,
    supported: true,
    probeComplete: true,
    rdpEnabled: false,
    windowsFirewallEventLogEnabled: true,
    probeDurationMs: 480,
    payloadHashSha256: 'feedbeef',
    collectedAt: '2026-06-01T15:00:00Z',
    createdAt: '2026-06-01T15:00:01Z',
    startupApps: [...SAMPLE_APPS],
    probeErrors: [],
    ...overrides,
  };
}

interface QueryStub {
  currentData?: StartupExposureSnapshot;
  error?: { status: number };
  isLoading?: boolean;
}
function mockQuery(stub: QueryStub) {
  useGetStartupExposureLatestQueryMock.mockReturnValue({
    currentData: undefined,
    error: undefined,
    isLoading: false,
    ...stub,
  });
}

import { StartupExposureView } from '../StartupExposureView';

describe('StartupExposureView — render gates', () => {
  it('active=false iken null + skip:true', () => {
    mockQuery({ currentData: buildSnapshot() });
    const { container } = render(<StartupExposureView deviceId={DEVICE_A} active={false} />);
    expect(container.firstChild).toBeNull();
    expect(useGetStartupExposureLatestQueryMock.mock.calls.at(-1)?.[1]).toMatchObject({
      skip: true,
    });
  });

  it('isLoading iken loading placeholder', () => {
    mockQuery({ isLoading: true });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-loading')).toBeInTheDocument();
  });

  it('403 iken forbidden', () => {
    mockQuery({ error: { status: 403 } });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-forbidden')).toBeInTheDocument();
  });

  it('404 iken empty + includeStartupExposure hint key', () => {
    mockQuery({ error: { status: 404 } });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const empty = screen.getByTestId('startup-exposure-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toMatch(/startupExposure\.empty/i);
  });

  it('5xx + currentData mevcut iken error testid + stale snapshot render edilmez', () => {
    mockQuery({ error: { status: 502 }, currentData: buildSnapshot() });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-error')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-exposure-view')).toBeNull();
  });

  it('stale arg (deviceId mismatch) gosterir', () => {
    mockQuery({ currentData: buildSnapshot({ deviceId: DEVICE_B }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-stale-arg')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-exposure-view')).toBeNull();
  });
});

describe('StartupExposureView — supported / probeComplete (AG-039 P1 precedent)', () => {
  it('supported=false: services-view container + data-fully-evaluable=false + meta + exposure + probeErrors VISIBLE, table HIDDEN', () => {
    mockQuery({
      currentData: buildSnapshot({
        supported: false,
        probeComplete: null,
        probeErrors: [{ rowOrdinal: 0, code: 'NON_WINDOWS_RUNTIME', summary: 'macOS' }],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('startup-exposure-view');
    expect(view.getAttribute('data-fully-evaluable')).toBe('false');
    expect(screen.getByTestId('startup-exposure-unsupported')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-meta')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-summary')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-probe-errors')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-exposure-table')).toBeNull();
    expect(screen.queryByTestId('startup-exposure-incomplete')).toBeNull();
  });

  it('probeComplete=false: incomplete + meta + exposure + probeErrors VISIBLE, table HIDDEN', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeComplete: false,
        startupApps: [...SAMPLE_APPS],
        probeErrors: [
          { rowOrdinal: 0, code: 'TASK_SCHEDULER_TIMEOUT', summary: 'enumerate timed out' },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('startup-exposure-view');
    expect(view.getAttribute('data-fully-evaluable')).toBe('false');
    expect(screen.getByTestId('startup-exposure-incomplete')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-meta')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-summary')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-probe-errors')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-exposure-table')).toBeNull();
  });

  it('supported=true + probeComplete=true: fully-evaluable + table + apps render', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('startup-exposure-view');
    expect(view.getAttribute('data-fully-evaluable')).toBe('true');
    expect(screen.getByTestId('startup-exposure-table')).toBeInTheDocument();
    for (const app of SAMPLE_APPS) {
      expect(screen.getByTestId(`startup-exposure-row-${app.rowOrdinal}`)).toBeInTheDocument();
    }
  });
});

describe('StartupExposureView — redaction-only partial-visible (AG-040 v1, Codex 019ea174)', () => {
  it('redaction-only (all errors NAME_VALUE_REDACTED) + survivors → table + banner VISIBLE, incomplete HIDDEN, data-fully-evaluable=false', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeComplete: false,
        startupApps: [...SAMPLE_APPS],
        probeErrors: [
          {
            rowOrdinal: 0,
            code: 'NAME_VALUE_REDACTED',
            source: 'TASK_SCHEDULER:CUSTOM',
            summary: 'Autorun entry name(s) redacted under this anchor (forbidden value pattern)',
          },
          {
            rowOrdinal: 1,
            code: 'NAME_VALUE_REDACTED',
            source: 'TASK_SCHEDULER:ROOT',
            summary: 'Autorun entry name(s) redacted under this anchor (forbidden value pattern)',
          },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const view = screen.getByTestId('startup-exposure-view');
    // Stays NOT fully-evaluable — survivors shown as partial, privacy-preserving evidence.
    expect(view.getAttribute('data-fully-evaluable')).toBe('false');
    expect(screen.getByTestId('startup-exposure-redaction-banner')).toBeInTheDocument();
    expect(screen.getByTestId('startup-exposure-table')).toBeInTheDocument();
    for (const app of SAMPLE_APPS) {
      expect(screen.getByTestId(`startup-exposure-row-${app.rowOrdinal}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('startup-exposure-incomplete')).toBeNull();
    expect(screen.getByTestId('startup-exposure-probe-errors')).toBeInTheDocument();
  });

  it('redaction-only but NO survivors → table HIDDEN, incomplete shown (nothing safe to render)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeComplete: false,
        startupApps: [],
        probeErrors: [
          {
            rowOrdinal: 0,
            code: 'NAME_VALUE_REDACTED',
            source: 'TASK_SCHEDULER:ROOT',
            summary: 'redacted',
          },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.queryByTestId('startup-exposure-table')).toBeNull();
    expect(screen.queryByTestId('startup-exposure-redaction-banner')).toBeNull();
    expect(screen.getByTestId('startup-exposure-incomplete')).toBeInTheDocument();
  });

  it('MIXED redaction + real probe failure → table HIDDEN, incomplete shown (fail-closed)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeComplete: false,
        startupApps: [...SAMPLE_APPS],
        probeErrors: [
          {
            rowOrdinal: 0,
            code: 'NAME_VALUE_REDACTED',
            source: 'TASK_SCHEDULER:CUSTOM',
            summary: 'redacted',
          },
          { rowOrdinal: 1, code: 'TASK_SCHEDULER_QUERY_FAILED', summary: 'json decode failed' },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.queryByTestId('startup-exposure-table')).toBeNull();
    expect(screen.queryByTestId('startup-exposure-redaction-banner')).toBeNull();
    expect(screen.getByTestId('startup-exposure-incomplete')).toBeInTheDocument();
  });
});

describe('StartupExposureView — exposure tri-state badges (Codex iter-2 must_fix #1+#2)', () => {
  it('rdpEnabled=true → data-polarity=rdp + warning toned', () => {
    mockQuery({ currentData: buildSnapshot({ rdpEnabled: true }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const rdp = screen.getByTestId('startup-exposure-rdp-badge');
    expect(rdp.getAttribute('data-value')).toBe('true');
    expect(rdp.getAttribute('data-polarity')).toBe('rdp');
    expect(rdp.className).toMatch(/state-warning/);
  });

  it('rdpEnabled=false → success toned (RDP disabled = safe)', () => {
    mockQuery({ currentData: buildSnapshot({ rdpEnabled: false }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const rdp = screen.getByTestId('startup-exposure-rdp-badge');
    expect(rdp.getAttribute('data-value')).toBe('false');
    expect(rdp.className).toMatch(/state-success/);
  });

  it('firewallEventLog=true → SUCCESS toned (logging is good audit signal)', () => {
    mockQuery({ currentData: buildSnapshot({ windowsFirewallEventLogEnabled: true }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const fw = screen.getByTestId('startup-exposure-firewall-badge');
    expect(fw.getAttribute('data-value')).toBe('true');
    expect(fw.getAttribute('data-polarity')).toBe('firewall-event-log');
    expect(fw.className).toMatch(/state-success/);
  });

  it('firewallEventLog=false → WARNING toned (operator should notice missing audit)', () => {
    mockQuery({ currentData: buildSnapshot({ windowsFirewallEventLogEnabled: false }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const fw = screen.getByTestId('startup-exposure-firewall-badge');
    expect(fw.getAttribute('data-value')).toBe('false');
    expect(fw.className).toMatch(/state-warning/);
  });

  it('RDP_PROBE_FAILED → RDP badge unknown even though rdpEnabled=false (fail-closed)', () => {
    mockQuery({
      currentData: buildSnapshot({
        rdpEnabled: false,
        windowsFirewallEventLogEnabled: true,
        probeErrors: [{ rowOrdinal: 0, code: 'RDP_PROBE_FAILED', summary: 'access denied' }],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-rdp-badge').getAttribute('data-value')).toBe(
      'null',
    );
    expect(screen.getByTestId('startup-exposure-firewall-badge').getAttribute('data-value')).toBe(
      'true',
    );
  });

  it('FIREWALL_PROBE_FAILED → firewall badge unknown only', () => {
    mockQuery({
      currentData: buildSnapshot({
        rdpEnabled: true,
        windowsFirewallEventLogEnabled: true,
        probeErrors: [{ rowOrdinal: 0, code: 'FIREWALL_PROBE_FAILED', summary: 'reg denied' }],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-firewall-badge').getAttribute('data-value')).toBe(
      'null',
    );
    expect(screen.getByTestId('startup-exposure-rdp-badge').getAttribute('data-value')).toBe(
      'true',
    );
  });

  it('NO_EVIDENCE → BOTH badges unknown', () => {
    mockQuery({
      currentData: buildSnapshot({
        rdpEnabled: false,
        windowsFirewallEventLogEnabled: false,
        probeErrors: [{ rowOrdinal: 0, code: 'NO_EVIDENCE', summary: 'overall timeout' }],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-rdp-badge').getAttribute('data-value')).toBe(
      'null',
    );
    expect(screen.getByTestId('startup-exposure-firewall-badge').getAttribute('data-value')).toBe(
      'null',
    );
  });

  it('supported=false → BOTH badges unknown (non-Windows stub guard)', () => {
    mockQuery({
      currentData: buildSnapshot({
        supported: false,
        probeComplete: null,
        rdpEnabled: false,
        windowsFirewallEventLogEnabled: false,
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-rdp-badge').getAttribute('data-value')).toBe(
      'null',
    );
    expect(screen.getByTestId('startup-exposure-firewall-badge').getAttribute('data-value')).toBe(
      'null',
    );
  });

  it('rdpEnabled=null + firewall=null → unknown (data-value=null distinct from false)', () => {
    mockQuery({
      currentData: buildSnapshot({
        rdpEnabled: null,
        windowsFirewallEventLogEnabled: null,
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-rdp-badge').getAttribute('data-value')).toBe(
      'null',
    );
    expect(screen.getByTestId('startup-exposure-firewall-badge').getAttribute('data-value')).toBe(
      'null',
    );
  });
});

describe('StartupExposureView — per-app row attributes', () => {
  it('every row carries data-location + data-probe-origin', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const row0 = screen.getByTestId('startup-exposure-row-0');
    expect(row0.getAttribute('data-location')).toBe('HKLM_RUN');
    expect(row0.getAttribute('data-probe-origin')).toBe('REGISTRY');
    const row2 = screen.getByTestId('startup-exposure-row-2');
    expect(row2.getAttribute('data-location')).toBe('TASK_SCHEDULER:CUSTOM');
    expect(row2.getAttribute('data-probe-origin')).toBe('SCHEDULED_TASK');
  });

  it('enabled tri-state data-enabled per row', () => {
    mockQuery({
      currentData: buildSnapshot({
        startupApps: [
          {
            rowOrdinal: 0,
            name: 'A',
            location: 'HKLM_RUN',
            enabled: true,
            probeOrigin: 'REGISTRY',
          },
          {
            rowOrdinal: 1,
            name: 'B',
            location: 'HKCU_RUN',
            enabled: false,
            probeOrigin: 'REGISTRY',
          },
          {
            rowOrdinal: 2,
            name: 'C',
            location: 'TASK_SCHEDULER:ROOT',
            enabled: null,
            probeOrigin: 'SCHEDULED_TASK',
          },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-enabled-0').getAttribute('data-enabled')).toBe(
      'true',
    );
    expect(screen.getByTestId('startup-exposure-enabled-1').getAttribute('data-enabled')).toBe(
      'false',
    );
    expect(screen.getByTestId('startup-exposure-enabled-2').getAttribute('data-enabled')).toBe(
      'null',
    );
  });
});

describe('StartupExposureView — startupApps empty + XSS guard', () => {
  it('startupApps=[] (fully-evaluable yet empty) → table-empty notice', () => {
    mockQuery({ currentData: buildSnapshot({ startupApps: [] }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-table-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-exposure-table')).toBeNull();
  });

  it('app.name HTML-like input plain text olarak render edilir (no XSS)', () => {
    mockQuery({
      currentData: buildSnapshot({
        startupApps: [
          {
            rowOrdinal: 0,
            name: '<script>alert(1)</script>',
            location: 'HKLM_RUN',
            enabled: true,
            probeOrigin: 'REGISTRY',
          },
        ],
      }),
    });
    const { container } = render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByTestId('startup-exposure-row-0').textContent).toContain(
      '<script>alert(1)</script>',
    );
  });
});

describe('StartupExposureView — probeErrors', () => {
  it('probeErrors=[] → empty notice', () => {
    mockQuery({ currentData: buildSnapshot({ probeErrors: [] }) });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-probe-errors-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-exposure-probe-errors')).toBeNull();
  });

  it('probeErrors.source = StartupAppLocation enum renders via location i18n key (must_fix #2/P2)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          { rowOrdinal: 0, code: 'NAME_VALUE_REDACTED', source: 'HKLM_RUN', summary: 'bounded' },
          {
            rowOrdinal: 1,
            code: 'STARTUP_FOLDER_UNREADABLE',
            source: 'STARTUP_FOLDER_USER',
            summary: 'access denied',
          },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-probe-error-row-0').textContent).toMatch(
      /location\.HKLM_RUN/,
    );
    expect(screen.getByTestId('startup-exposure-probe-error-row-1').textContent).toMatch(
      /location\.STARTUP_FOLDER_USER/,
    );
  });

  it('probeErrors source + summary null+absent → "—" fallback', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          { rowOrdinal: 0, code: 'GENERIC', source: null, summary: null },
          { rowOrdinal: 1, code: 'NO_FIELDS' /* source + summary omitted */ },
        ],
      }),
    });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(screen.getByTestId('startup-exposure-probe-error-row-0').textContent).toMatch(
      /GENERIC.*—.*—/s,
    );
    expect(screen.getByTestId('startup-exposure-probe-error-row-1').textContent).toMatch(
      /NO_FIELDS.*—.*—/s,
    );
  });

  it('probeErrors source + summary HTML-like → plain text (no XSS)', () => {
    mockQuery({
      currentData: buildSnapshot({
        probeErrors: [
          {
            rowOrdinal: 7,
            code: 'INJECT',
            source: '<img src=x onerror=alert(1)>',
            summary: '<svg/onload=alert(2)>',
          },
        ],
      }),
    });
    const { container } = render(<StartupExposureView deviceId={DEVICE_A} active />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    const row = screen.getByTestId('startup-exposure-probe-error-row-7');
    expect(row.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(row.textContent).toContain('<svg/onload=alert(2)>');
  });
});

describe('StartupExposureView — RTK subscription', () => {
  it('hook deviceId + skip:false', () => {
    mockQuery({ currentData: buildSnapshot() });
    render(<StartupExposureView deviceId={DEVICE_A} active />);
    const last = useGetStartupExposureLatestQueryMock.mock.calls.at(-1);
    expect(last?.[0]).toMatchObject({ deviceId: DEVICE_A });
    expect(last?.[1]).toMatchObject({ skip: false });
  });
});
