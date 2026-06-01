import React from 'react';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';

import type {
  HotfixPostureSnapshot,
  HotfixPostureSnapshotSummary,
} from '../../../../../entities/endpoint-hotfix-posture/types';
import {
  isInstalledPossiblyTruncated,
  isPendingPossiblyTruncated,
} from '../../../../../entities/endpoint-hotfix-posture/truncation';

/**
 * Mock RTK Query hooks with vi.mock — Codex 019e8245 iter-2 P1 absorb.
 * Provider harness not required when the hooks themselves are stubbed.
 */
vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetHotfixPostureLatestQuery: vi.fn(),
    useGetHotfixPostureHistoryQuery: vi.fn(),
  },
}));

import { endpointAdminApi } from '../../../../../app/services/endpointAdminApi';
import { HotfixPostureView } from '../HotfixPostureView';

/**
 * Mock useEndpointAdminI18n — exposes a passthrough `t(key)` so we can
 * assert on key strings, plus i18n key resolution does not interfere
 * with render assertions.
 */
vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

const DEVICE_A = 'device-aaaa';
const DEVICE_B = 'device-bbbb';

const goldenSnapshot = (overrides: Partial<HotfixPostureSnapshot> = {}): HotfixPostureSnapshot => ({
  id: 'snap-1',
  tenantId: 'tenant-1',
  deviceId: DEVICE_A,
  sourceCommandResultId: null,
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  installedCount: 1,
  installedTruncated: false,
  maxInstalled: 512,
  installedPossiblyTruncated: false,
  pendingTotalCount: 1,
  pendingTruncated: false,
  maxPending: 20,
  pendingPossiblyTruncated: false,
  installedSourceUsed: 'wua',
  pendingSourceUsed: 'wua',
  healthSourceUsed: 'composite',
  probeDurationMs: 410,
  payloadHashSha256: 'a'.repeat(64),
  collectedAt: '2026-06-01T12:00:00Z',
  createdAt: '2026-06-01T12:00:01Z',
  installedHotfixes: [
    { kbId: 'KB5034122', installedOn: '2026-01-15T00:00:00Z', description: 'Security Update' },
  ],
  pendingUpdates: [{ kbIds: ['KB5036899'], primaryCategory: 'SECURITY', severity: 'CRITICAL' }],
  pendingByCategory: [{ category: 'SECURITY', count: 1 }],
  agentHealth: {
    wuaServiceState: 'RUNNING',
    bitsServiceState: 'RUNNING',
    lastDetectAt: '2026-05-31T08:00:00Z',
    lastInstallAt: '2026-05-30T22:00:00Z',
    autoUpdatePolicyEnabled: true,
    autoUpdateEffectiveEnabled: true,
    notificationLevel: '4',
  },
  probeErrors: [],
  ...overrides,
});

function mockLatest(opts: {
  currentData?: HotfixPostureSnapshot | null;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
}) {
  (endpointAdminApi.useGetHotfixPostureLatestQuery as Mock).mockReturnValue({
    currentData: opts.currentData,
    data: opts.currentData,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
    error: opts.error,
  });
}

function mockHistoryEmpty() {
  (endpointAdminApi.useGetHotfixPostureHistoryQuery as Mock).mockReturnValue({
    currentData: undefined,
    data: undefined,
    isLoading: false,
    isError: false,
  });
}

function renderView(deviceId: string = DEVICE_A) {
  return render(<HotfixPostureView deviceId={deviceId} active />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHistoryEmpty();
});

// ─────────────────────────────────────────────────────────────────
// 1. Truncation helper unit (12 tests — preserved from initial slice)
// ─────────────────────────────────────────────────────────────────

describe('isInstalledPossiblyTruncated', () => {
  it('OR fires when agent-authoritative installedTruncated=true', () => {
    expect(
      isInstalledPossiblyTruncated(
        goldenSnapshot({
          installedTruncated: true,
          installedCount: 0,
          installedPossiblyTruncated: false,
        }),
      ),
    ).toBe(true);
  });
  it('OR fires when backend-computed installedPossiblyTruncated=true', () => {
    expect(
      isInstalledPossiblyTruncated(
        goldenSnapshot({
          installedTruncated: false,
          installedCount: 0,
          installedPossiblyTruncated: true,
        }),
      ),
    ).toBe(true);
  });
  it('OR fires when installedCount >= maxInstalled (defence-in-depth)', () => {
    expect(
      isInstalledPossiblyTruncated(
        goldenSnapshot({
          installedTruncated: false,
          installedPossiblyTruncated: false,
          installedCount: 512,
          maxInstalled: 512,
        }),
      ),
    ).toBe(true);
  });
  it('OR fires when installedCount > maxInstalled', () => {
    expect(
      isInstalledPossiblyTruncated(
        goldenSnapshot({
          installedTruncated: false,
          installedPossiblyTruncated: false,
          installedCount: 600,
          maxInstalled: 512,
        }),
      ),
    ).toBe(true);
  });
  it('NO hint when all three legs false', () => {
    expect(
      isInstalledPossiblyTruncated(
        goldenSnapshot({
          installedTruncated: false,
          installedPossiblyTruncated: false,
          installedCount: 10,
          maxInstalled: 512,
        }),
      ),
    ).toBe(false);
  });
});

describe('isPendingPossiblyTruncated', () => {
  it('OR fires when pendingTruncated=true', () => {
    expect(
      isPendingPossiblyTruncated(
        goldenSnapshot({
          pendingTruncated: true,
          pendingTotalCount: 0,
          pendingPossiblyTruncated: false,
        }),
      ),
    ).toBe(true);
  });
  it('OR fires when pendingPossiblyTruncated=true', () => {
    expect(
      isPendingPossiblyTruncated(
        goldenSnapshot({
          pendingTruncated: false,
          pendingPossiblyTruncated: true,
          pendingTotalCount: 0,
        }),
      ),
    ).toBe(true);
  });
  it('OR fires when pendingTotalCount >= maxPending', () => {
    expect(
      isPendingPossiblyTruncated(
        goldenSnapshot({
          pendingTotalCount: 20,
          maxPending: 20,
          pendingTruncated: false,
          pendingPossiblyTruncated: false,
        }),
      ),
    ).toBe(true);
  });
  it('OR fires when pendingTotalCount > maxPending (rollup may exceed)', () => {
    expect(
      isPendingPossiblyTruncated(
        goldenSnapshot({
          pendingTotalCount: 25,
          maxPending: 20,
          pendingTruncated: false,
          pendingPossiblyTruncated: false,
        }),
      ),
    ).toBe(true);
  });
  it('NO hint when total < cap and both flags false', () => {
    expect(
      isPendingPossiblyTruncated(
        goldenSnapshot({
          pendingTotalCount: 5,
          maxPending: 20,
          pendingTruncated: false,
          pendingPossiblyTruncated: false,
        }),
      ),
    ).toBe(false);
  });
  it('installed truncation does NOT bleed into pending hint', () => {
    const snap = goldenSnapshot({
      installedTruncated: true,
      installedPossiblyTruncated: true,
      installedCount: 512,
      pendingTotalCount: 3,
      maxPending: 20,
      pendingTruncated: false,
      pendingPossiblyTruncated: false,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(true);
    expect(isPendingPossiblyTruncated(snap)).toBe(false);
  });
});

describe('Truncation helper works on summary projection', () => {
  it('summary OR fires the same way as snapshot truncation', () => {
    const summary: HotfixPostureSnapshotSummary = {
      id: 'sum-1',
      deviceId: DEVICE_A,
      schemaVersion: 1,
      supported: true,
      probeComplete: true,
      installedCount: 512,
      installedTruncated: true,
      maxInstalled: 512,
      installedPossiblyTruncated: true,
      pendingTotalCount: 25,
      pendingTruncated: true,
      maxPending: 20,
      pendingPossiblyTruncated: true,
      installedSourceUsed: 'wua',
      pendingSourceUsed: 'wua',
      healthSourceUsed: 'composite',
      installedChildCount: 512,
      pendingChildCount: 20,
      probeErrorCount: 0,
      payloadHashSha256: 'b'.repeat(64),
      collectedAt: '2026-05-30T00:00:00Z',
      createdAt: '2026-05-30T00:00:01Z',
    };
    expect(isInstalledPossiblyTruncated(summary)).toBe(true);
    expect(isPendingPossiblyTruncated(summary)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. State precedence (Codex 019e8245 iter-2 P1 — render-tree tests)
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView state precedence', () => {
  it('renders loading state when isLoading=true', () => {
    mockLatest({ currentData: null, isLoading: true });
    renderView();
    expect(screen.getByTestId('hotfix-posture-loading')).toBeInTheDocument();
  });

  it('renders 404 empty state', () => {
    mockLatest({ currentData: null, isError: true, error: { status: 404 } });
    renderView();
    expect(screen.getByTestId('hotfix-posture-empty')).toBeInTheDocument();
  });

  it('renders 403 forbidden state', () => {
    mockLatest({ currentData: null, isError: true, error: { status: 403 } });
    renderView();
    expect(screen.getByTestId('hotfix-posture-forbidden')).toBeInTheDocument();
  });

  it('renders generic error for non-404/403', () => {
    mockLatest({ currentData: null, isError: true, error: { status: 500 } });
    renderView();
    expect(screen.getByTestId('hotfix-posture-error')).toBeInTheDocument();
  });

  it('renders unsupported when supported=false (wins over probeComplete=false)', () => {
    mockLatest({
      currentData: goldenSnapshot({
        supported: false,
        probeComplete: false,
        agentHealth: {
          wuaServiceState: 'UNKNOWN',
          bitsServiceState: 'UNKNOWN',
          lastDetectAt: null,
          lastInstallAt: null,
          autoUpdatePolicyEnabled: null,
          autoUpdateEffectiveEnabled: null,
          notificationLevel: null,
        },
      }),
    });
    renderView();
    expect(screen.getByTestId('hotfix-posture-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('hotfix-posture-incomplete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hotfix-posture-panel')).not.toBeInTheDocument();
  });

  it('renders incomplete when supported=true + probeComplete=false', () => {
    mockLatest({ currentData: goldenSnapshot({ probeComplete: false }) });
    renderView();
    expect(screen.getByTestId('hotfix-posture-incomplete')).toBeInTheDocument();
    expect(screen.queryByTestId('hotfix-posture-panel')).not.toBeInTheDocument();
  });

  it('renders full panel when supported + probeComplete both true', () => {
    mockLatest({ currentData: goldenSnapshot() });
    renderView();
    expect(screen.getByTestId('hotfix-posture-panel')).toBeInTheDocument();
    expect(screen.getByTestId('hotfix-posture-installed-table')).toBeInTheDocument();
    expect(screen.getByTestId('hotfix-posture-pending-table')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. Stale-guard — deviceId mismatch rejects render
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView stale-guard', () => {
  it('does NOT render panel when currentData.deviceId mismatches active deviceId', () => {
    mockLatest({ currentData: goldenSnapshot({ deviceId: DEVICE_B }) });
    renderView(DEVICE_A);
    expect(screen.queryByTestId('hotfix-posture-panel')).not.toBeInTheDocument();
  });

  it('renders panel when snapshot deviceId is null (golden-example shape)', () => {
    const snap = goldenSnapshot({ deviceId: null as unknown as string });
    mockLatest({ currentData: snap });
    renderView(DEVICE_A);
    expect(screen.getByTestId('hotfix-posture-panel')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────
// 4. agentHealth nullable + AUOptions matrix
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView agentHealth edge cases', () => {
  it('renders health unknown when agentHealth is null', () => {
    mockLatest({ currentData: goldenSnapshot({ agentHealth: null }) });
    renderView();
    expect(screen.getByTestId('hotfix-posture-health-unknown')).toBeInTheDocument();
  });

  it.each([
    ['1', 'auOptions.1'],
    ['2', 'auOptions.2'],
    ['3', 'auOptions.3'],
    ['4', 'auOptions.4'],
  ])('AUOptions exact-string match for %s', (level, expectedKeyFragment) => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: { ...goldenSnapshot().agentHealth!, notificationLevel: level },
      }),
    });
    renderView();
    const node = screen.getByTestId('hotfix-posture-health-notification-level');
    expect(node.textContent).toContain(level);
    expect(node.textContent).toContain(expectedKeyFragment);
  });

  it.each(['0', '00', '1000'])(
    'AUOptions GPO variant %s renders raw + unrecognized (NO parseInt)',
    (level) => {
      mockLatest({
        currentData: goldenSnapshot({
          agentHealth: { ...goldenSnapshot().agentHealth!, notificationLevel: level },
        }),
      });
      renderView();
      const node = screen.getByTestId('hotfix-posture-health-notification-level');
      expect(node.textContent).toContain(level);
      expect(node.textContent).toContain('unrecognized');
    },
  );

  it('AUOptions null renders unknown', () => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: { ...goldenSnapshot().agentHealth!, notificationLevel: null },
      }),
    });
    renderView();
    const node = screen.getByTestId('hotfix-posture-health-notification-level');
    expect(node.textContent).toContain('unknown');
  });

  it('AUOptions empty string normalizes to unknown', () => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: { ...goldenSnapshot().agentHealth!, notificationLevel: '' },
      }),
    });
    renderView();
    const node = screen.getByTestId('hotfix-posture-health-notification-level');
    expect(node.textContent).toContain('unknown');
  });

  it('AU policy + effective render independently (tri-state)', () => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: {
          ...goldenSnapshot().agentHealth!,
          autoUpdatePolicyEnabled: true,
          autoUpdateEffectiveEnabled: false,
        },
      }),
    });
    renderView();
    const policy = screen.getByTestId('hotfix-posture-health-au-policy');
    const effective = screen.getByTestId('hotfix-posture-health-au-effective');
    expect(policy.textContent).toContain('enabled');
    expect(effective.textContent).toContain('disabled');
  });
});

// ─────────────────────────────────────────────────────────────────
// 5. kbIds + severity static tone class
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView pending render', () => {
  it('renders kbIds comma-joined', () => {
    mockLatest({
      currentData: goldenSnapshot({
        pendingUpdates: [
          { kbIds: ['KB5036899', 'KB5036900'], primaryCategory: 'SECURITY', severity: 'CRITICAL' },
        ],
      }),
    });
    renderView();
    const cell = screen.getByTestId('hotfix-posture-pending-kbids-0');
    expect(cell.textContent).toBe('KB5036899, KB5036900');
  });

  it('renders kbIds empty-array fallback as —', () => {
    mockLatest({
      currentData: goldenSnapshot({
        pendingUpdates: [{ kbIds: [], primaryCategory: 'UNCATEGORIZED', severity: 'UNSPECIFIED' }],
      }),
    });
    renderView();
    const cell = screen.getByTestId('hotfix-posture-pending-kbids-0');
    expect(cell.textContent).toBe('—');
  });

  it('severity chip carries design-system static tone class (NO animation)', () => {
    mockLatest({ currentData: goldenSnapshot() });
    renderView();
    const chip = screen.getByTestId('hotfix-posture-pending-severity-0');
    expect(chip.className).toContain('bg-state-danger-subtle');
    expect(chip.className).toContain('text-state-danger-text');
    expect(chip.className).not.toMatch(/animate|pulse|flash/);
  });
});

// ─────────────────────────────────────────────────────────────────
// 6. pendingByCategory FULL distribution renders (capped vs rollup invariant)
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView pendingByCategory rollup', () => {
  it('renders all categories even when pendingUpdates is per-item capped', () => {
    mockLatest({
      currentData: goldenSnapshot({
        pendingTotalCount: 25,
        pendingTruncated: true,
        pendingUpdates: Array.from({ length: 20 }, (_, i) => ({
          kbIds: [`KB${1000000 + i}`],
          primaryCategory: 'SECURITY' as const,
          severity: 'IMPORTANT' as const,
        })),
        pendingByCategory: [
          { category: 'SECURITY', count: 18 },
          { category: 'DRIVER', count: 5 },
          { category: 'OPTIONAL', count: 2 },
        ],
      }),
    });
    renderView();
    expect(screen.getByTestId('hotfix-posture-by-category-SECURITY')).toBeInTheDocument();
    expect(screen.getByTestId('hotfix-posture-by-category-DRIVER')).toBeInTheDocument();
    expect(screen.getByTestId('hotfix-posture-by-category-OPTIONAL')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────
// 7. Meta row — sources + collectedAt + duration
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView meta row', () => {
  it('renders 3 sourceUsed + collectedAt + duration', () => {
    mockLatest({ currentData: goldenSnapshot() });
    renderView();
    expect(screen.getByTestId('hotfix-posture-meta-installed-source').textContent).toContain('wua');
    expect(screen.getByTestId('hotfix-posture-meta-pending-source').textContent).toContain('wua');
    expect(screen.getByTestId('hotfix-posture-meta-health-source').textContent).toContain(
      'composite',
    );
    expect(screen.getByTestId('hotfix-posture-meta-duration').textContent).toContain('410');
  });
});

// ─────────────────────────────────────────────────────────────────
// 8. ServiceState design-system tones
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView ServiceState design-system tones', () => {
  it('RUNNING renders success tone', () => {
    mockLatest({ currentData: goldenSnapshot() });
    renderView();
    const wua = screen.getByTestId('hotfix-posture-health-wua');
    expect(wua.className).toContain('bg-state-success-subtle');
  });

  it('STOPPED renders danger tone', () => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: { ...goldenSnapshot().agentHealth!, wuaServiceState: 'STOPPED' },
      }),
    });
    renderView();
    const wua = screen.getByTestId('hotfix-posture-health-wua');
    expect(wua.className).toContain('bg-state-danger-subtle');
  });

  it('DISABLED renders warning tone (distinguishable from STOPPED)', () => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: { ...goldenSnapshot().agentHealth!, wuaServiceState: 'DISABLED' },
      }),
    });
    renderView();
    const wua = screen.getByTestId('hotfix-posture-health-wua');
    expect(wua.className).toContain('bg-state-warning-subtle');
  });

  it('UNKNOWN renders muted neutral tone', () => {
    mockLatest({
      currentData: goldenSnapshot({
        agentHealth: { ...goldenSnapshot().agentHealth!, wuaServiceState: 'UNKNOWN' },
      }),
    });
    renderView();
    const wua = screen.getByTestId('hotfix-posture-health-wua');
    expect(wua.className).toContain('bg-surface-muted');
  });
});

// ─────────────────────────────────────────────────────────────────
// 9. probeError text-only (no dangerouslySetInnerHTML)
// ─────────────────────────────────────────────────────────────────

describe('HotfixPostureView probeError rendering', () => {
  it('renders probeError fields as plain text (no HTML injection)', () => {
    const summary = '<script>alert(1)</script>';
    mockLatest({
      currentData: goldenSnapshot({
        probeComplete: false,
        probeErrors: [{ code: 'COM_FAILED', source: 'wua', summary }],
      }),
    });
    renderView();
    // probeErrors render block in incomplete state.
    const li = screen.getByTestId('hotfix-posture-probe-error-0');
    // textContent contains the literal characters; no script element exists.
    expect(li.textContent).toContain('<script>alert(1)</script>');
    expect(li.querySelector('script')).toBeNull();
  });
});
