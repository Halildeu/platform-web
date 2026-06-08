import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import '@mfe/design-system/advanced/data-grid/setup';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import EndpointDevicesPage, {
  DEFAULT_PRESET,
  withDefaultStatusFilter,
} from './EndpointDevicesPage';

/**
 * #1154 PR-3 — the devices grid is now SERVER-mode (SSRM datasource →
 * POST /query) with the report-style İndir export. These tests are a
 * render smoke + a regression that the retired client-side export button
 * is gone; the fetch/auth/error contract is covered by the AG-Grid-free
 * gridApi.test.ts.
 */
const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

const renderPage = () => {
  const store = buildStore();
  return render(
    <ReduxProvider store={store} context={endpointAdminReduxContext}>
      <MemoryRouter>
        <EndpointDevicesPage />
      </MemoryRouter>
    </ReduxProvider>,
  );
};

const mockFetch = () =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/endpoint-devices/query')) {
      return new Response(JSON.stringify({ rows: [], lastRow: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // EntityGridTemplate variant-listing + anything else → empty.
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

describe('EndpointDevicesPage (server mode)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.localStorage.setItem('token', 'fake-token');
    globalThis.fetch = mockFetch();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem('token');
    vi.restoreAllMocks();
  });

  it('mounts the server-mode grid page', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('endpoint-admin-devices-page')).toBeInTheDocument();
    });
    expect(screen.getByText(/Uç Birimler|Endpoint Devices/)).toBeInTheDocument();
  });

  it('no longer renders the retired client-side inventory export button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('endpoint-admin-devices-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('inventory-export-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-snapshot-columns-notice')).not.toBeInTheDocument();
  });
});

describe('EndpointDevicesPage default status filter (Aktif/Pasif)', () => {
  it('defaults the grid to ACTIVE devices — status set-filter hides DECOMMISSIONED ("Pasif")', () => {
    const fm = DEFAULT_PRESET.initialFilterModel as
      | { status?: { filterType?: string; values?: string[] } }
      | undefined;
    expect(fm).toBeTruthy();
    expect(fm?.status?.filterType).toBe('set');
    const values = fm?.status?.values ?? [];
    // DECOMMISSIONED ("Pasif"/Hizmet dışı) is hidden by default…
    expect(values).not.toContain('DECOMMISSIONED');
    // …while every other (active) lifecycle status is shown, so the default
    // list is not accidentally empty.
    expect(values).toEqual(
      expect.arrayContaining(['PENDING_ENROLLMENT', 'ONLINE', 'STALE', 'OFFLINE']),
    );
  });
});

/**
 * #782 follow-up (Codex 019ea960 AGREE Option A) — the default ACTIVE status
 * floor is enforced at the SSRM datasource layer via `withDefaultStatusFilter`,
 * NOT onGridReady, because the EntityGridTemplate variant system owns the live
 * filterModel and would clobber a UI-level default (a saved variant with an
 * empty `{}` filterModel re-showed DECOMMISSIONED — the live bug this fixes).
 */
describe('withDefaultStatusFilter (datasource default-active floor)', () => {
  const statusDefault = { filterType: 'set', values: ['PENDING_ENROLLMENT', 'ONLINE'] };

  it('injects the default status filter when the caller has NO status key', () => {
    const out = withDefaultStatusFilter({}, statusDefault);
    expect(out.status).toEqual(statusDefault);
  });

  it('preserves other filters while injecting the status floor', () => {
    const out = withDefaultStatusFilter(
      { os_type: { filterType: 'set', values: ['WINDOWS'] } },
      statusDefault,
    );
    expect(out.os_type).toEqual({ filterType: 'set', values: ['WINDOWS'] });
    expect(out.status).toEqual(statusDefault);
  });

  it('respects an explicit status filter that re-includes DECOMMISSIONED (does NOT override)', () => {
    const explicit = { status: { filterType: 'set', values: ['ONLINE', 'DECOMMISSIONED'] } };
    const out = withDefaultStatusFilter(explicit, statusDefault);
    expect(out.status).toEqual({ filterType: 'set', values: ['ONLINE', 'DECOMMISSIONED'] });
  });

  it('respects an explicit EMPTY status set (values:[] = match nothing, NOT a fallback)', () => {
    const explicitEmpty = { status: { filterType: 'set', values: [] as string[] } };
    const out = withDefaultStatusFilter(explicitEmpty, statusDefault);
    expect(out.status).toEqual({ filterType: 'set', values: [] });
  });

  it('is non-mutating (returns a fresh object; input untouched)', () => {
    const input = { os_type: { filterType: 'set', values: ['LINUX'] } };
    const out = withDefaultStatusFilter(input, statusDefault);
    expect(out).not.toBe(input);
    expect(input).toEqual({ os_type: { filterType: 'set', values: ['LINUX'] } });
    expect('status' in input).toBe(false);
  });

  it('no-ops when statusDefault is nullish (returns the input unchanged)', () => {
    const input = { os_type: { filterType: 'set', values: ['MACOS'] } };
    expect(withDefaultStatusFilter(input, undefined)).toBe(input);
    expect(withDefaultStatusFilter(input, null)).toBe(input);
  });
});

/**
 * WEB-015 v2-a (Codex 019e87aa AGREE) — schema/registry contract pins
 * for the 5 new DeviceGrid columns. The page-level grid test only smokes
 * mount; the registry contract is asserted by reading the module's
 * SOURCE so we can pin GRID_SCHEMA_VERSION + the 5 colIds + the i18n
 * keys WITHOUT booting AG Grid for every assertion (which the
 * EntityGridTemplate test setup makes prohibitively slow + flaky).
 *
 * <p>This complements the i18n drift detector (device-grid-v2a-i18n.test.ts)
 * and the row shape pin (deviceGridRowV3Shape.test.ts).
 */
describe('EndpointDevicesPage v2-a column registry (WEB-015 v2-a)', () => {
  // We read the file as text rather than dynamic-importing the component:
  // EntityGridTemplate's lazy ag-grid bootstrap fights the test harness and
  // hand-rolling a smoke per column is enormously more flaky than asserting
  // the canonical registry. AG Grid behaviour itself is already covered by
  // the v0 PR-3 mount test above.
  let source = '';
  beforeEach(async () => {
    if (!source) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const here = path.dirname(new URL(import.meta.url).pathname);
      source = await fs.readFile(path.join(here, 'EndpointDevicesPage.tsx'), 'utf8');
    }
  });

  it('GRID_SCHEMA_VERSION is bumped to 5 (WEB-015 v2-d invalidates persisted v4 column state)', () => {
    expect(source).toMatch(/const GRID_SCHEMA_VERSION = 5;/);
    // Negative drift detectors — v2/v3/v4 literals may NOT survive.
    expect(source).not.toMatch(/const GRID_SCHEMA_VERSION = 2;/);
    expect(source).not.toMatch(/const GRID_SCHEMA_VERSION = 3;/);
    expect(source).not.toMatch(/const GRID_SCHEMA_VERSION = 4;/);
  });

  it('9 new v2-d cache colIds appear in the source (raw export sequence parity with backend SCHEMA_VERSION=5)', () => {
    // Codex 019e8a39 iter-1 web acceptance: backend appended 9 cache-fed
    // colIds after services_critical_stopped_count. Mirror them here.
    const expectedV2dColIds = [
      'software_diff_status',
      'software_diff_added_count',
      'software_diff_removed_count',
      'software_diff_version_changed_count',
      'outdated_diff_status',
      'outdated_diff_added_count',
      'outdated_diff_removed_count',
      'outdated_diff_version_changed_count',
      'outdated_diff_available_version_bumped_count',
    ];
    for (const colId of expectedV2dColIds) {
      expect(source).toContain(`field: '${colId}'`);
    }
  });

  it('5 new DeviceGrid colIds appear in the source (raw export sequence parity with backend)', () => {
    const expectedColIds = [
      'prohibited_status',
      'prohibited_decision',
      'prohibited_findings_count',
      'app_control_wdac_mode',
      'app_control_app_id_svc_state',
    ];
    for (const colId of expectedColIds) {
      expect(source).toContain(`field: '${colId}'`);
    }
  });

  it('5 new i18n header keys are wired through the t() resolver', () => {
    const expectedHeaderKeys = [
      'endpointAdmin.devices.col.prohibitedStatus',
      'endpointAdmin.devices.col.prohibitedDecision',
      'endpointAdmin.devices.col.prohibitedFindingsCount',
      'endpointAdmin.devices.col.wdacMode',
      'endpointAdmin.devices.col.appIdSvcState',
    ];
    for (const key of expectedHeaderKeys) {
      expect(source).toContain(key);
    }
  });

  it('domain enum tuples preserve backend-canonical raw codes (Set Filter contract)', () => {
    // The Set Filter sends RAW backend enum codes upstream (i18n labels are
    // for display only); the raw tuples must match DeviceGridColumns
    // SQL CASE/JOIN domains exactly.
    expect(source).toMatch(/PROHIBITED_STATUS_VALUES = \['NO_EVALUATION', 'OK'\]/);
    // WEB-015 v2-a fast-follow (LIVE finding): tuple normalized to the
    // backend `ComplianceDecision` enum (COMPLIANT, NON_COMPLIANT,
    // UNAUTHORIZED, UNKNOWN). The v0 draft `INSUFFICIENT_DATA` was never
    // emitted by `EndpointComplianceService.decide()`.
    // Tuple may be prettier-wrapped onto multiple lines once it crosses the
    // 100-col print width — match either form by tolerating whitespace +
    // optional trailing comma.
    expect(source).toMatch(
      /PROHIBITED_DECISION_VALUES = \[\s*'COMPLIANT',\s*'NON_COMPLIANT',\s*'UNAUTHORIZED',\s*'UNKNOWN',?\s*\]/,
    );
    expect(source).toMatch(/WDAC_MODE_VALUES = \['OFF', 'AUDIT', 'ENFORCE', 'UNKNOWN'\]/);
    expect(source).toMatch(
      /APP_ID_SVC_STATE_VALUES = \['RUNNING', 'STOPPED', 'DISABLED', 'UNKNOWN'\]/,
    );
  });

  it('all 5 v2-a columns default to hide:true (Codex guardrail #1 — toggleable surfacing)', () => {
    // The 5 v2-a column blocks appear AFTER the existing
    // 'outdated_upgrade_truncated' column. Each block declares hide:true.
    // We don't assert "exactly 5 hide:true beyond this index" (other v2
    // toggleables — uptime / longUptime / domain — also hide:true and we
    // do not want to fight that), only that every v2-a colId block has a
    // hide:true near its field declaration.
    const colIds = [
      'prohibited_status',
      'prohibited_decision',
      'prohibited_findings_count',
      'app_control_wdac_mode',
      'app_control_app_id_svc_state',
    ];
    for (const colId of colIds) {
      const idx = source.indexOf(`field: '${colId}'`);
      expect(idx).toBeGreaterThan(0);
      // Look at the next ~600 chars (one ColDef block); hide:true must appear.
      const block = source.slice(idx, idx + 600);
      expect(block).toContain('hide: true');
    }
  });

  it('domain_name column is surfaced by default + text-filterable for the cross-fleet domain filter (#517)', () => {
    // Faz 22.5 #517: the AD-domain column must be visible (NOT hide:true)
    // and text-filterable so operators can filter the device fleet by
    // domain. It is fed by the backend endpoint_devices.domain_name filter
    // cache (inventory-projected). Guards against an accidental re-hide.
    const idx = source.indexOf("field: 'domain_name'");
    expect(idx).toBeGreaterThan(0);
    const block = source.slice(idx, idx + 400);
    expect(block).toContain("filter: 'agTextColumnFilter'");
    expect(block).not.toContain('hide: true');
  });

  it('prohibited_status uses a cellRenderer (badge), enum columns use valueFormatter (Codex guardrail #2)', () => {
    // prohibited_status block must contain BOTH cellRenderer + valueFormatter
    // (cell render = badge, formatter = Set Filter / CSV value).
    const startIdx = source.indexOf("field: 'prohibited_status'");
    expect(startIdx).toBeGreaterThan(0);
    const block = source.slice(startIdx, startIdx + 1200);
    expect(block).toContain('cellRenderer');
    expect(block).toContain('valueFormatter');
    // The other 4 enum columns use valueFormatter (no badge).
    for (const colId of [
      'prohibited_decision',
      'app_control_wdac_mode',
      'app_control_app_id_svc_state',
    ]) {
      const fIdx = source.indexOf(`field: '${colId}'`);
      const fBlock = source.slice(fIdx, fIdx + 800);
      expect(fBlock).toContain('valueFormatter');
    }
  });
});

/**
 * WEB-015 v2-b (Codex 019e87bc iter-3 AGREE) — schema v4 column
 * registry pins for the 6 new DeviceGrid columns. Same source-text
 * pattern as the v2-a test block above (AG Grid bootstrap is too slow
 * for per-column smoke; behaviour itself is covered by the page mount
 * test).
 */
describe('EndpointDevicesPage v2-b column registry (WEB-015 v2-b)', () => {
  let source = '';
  beforeEach(async () => {
    if (!source) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const here = path.dirname(new URL(import.meta.url).pathname);
      source = await fs.readFile(path.join(here, 'EndpointDevicesPage.tsx'), 'utf8');
    }
  });

  it('6 new v2-b colIds appear in the source (raw export sequence parity with backend)', () => {
    const expectedColIds = [
      'diagnostics_last_poll_latency_ms',
      'diagnostics_last_error_code',
      'diagnostics_last_error_at',
      'startup_rdp_enabled',
      'startup_windows_firewall_event_log_enabled',
      'services_critical_stopped_count',
    ];
    for (const colId of expectedColIds) {
      expect(source).toContain(`field: '${colId}'`);
    }
  });

  it('6 new v2-b i18n header keys are wired through the t() resolver', () => {
    const expectedKeys = [
      'endpointAdmin.devices.col.diagnosticsLatency',
      'endpointAdmin.devices.col.diagnosticsLastErrorCode',
      'endpointAdmin.devices.col.diagnosticsLastErrorAt',
      'endpointAdmin.devices.col.startupRdpEnabled',
      'endpointAdmin.devices.col.startupFirewallEventLog',
      'endpointAdmin.devices.col.servicesCriticalStopped',
    ];
    for (const key of expectedKeys) {
      expect(source).toContain(key);
    }
  });

  it('all 6 v2-b columns default to hide:true (toggleable surfacing)', () => {
    const colIds = [
      'diagnostics_last_poll_latency_ms',
      'diagnostics_last_error_code',
      'diagnostics_last_error_at',
      'startup_rdp_enabled',
      'startup_windows_firewall_event_log_enabled',
      'services_critical_stopped_count',
    ];
    for (const colId of colIds) {
      const idx = source.indexOf(`field: '${colId}'`);
      expect(idx).toBeGreaterThan(0);
      const block = source.slice(idx, idx + 600);
      expect(block).toContain('hide: true');
    }
  });

  it('last_error_code uses agTextColumnFilter (NOT a closed set tuple — Codex iter-1 #2)', () => {
    const idx = source.indexOf("field: 'diagnostics_last_error_code'");
    expect(idx).toBeGreaterThan(0);
    const block = source.slice(idx, idx + 700);
    expect(block).toContain("filter: 'agTextColumnFilter'");
    // Negative: must NOT use a closed Set Filter (would drop unmodelled codes).
    expect(block).not.toContain("filter: 'agSetColumnFilter'");
  });

  it('numeric sentinels use agNumberColumnFilter and preserve null vs 0 in the formatter', () => {
    for (const colId of ['diagnostics_last_poll_latency_ms', 'services_critical_stopped_count']) {
      const idx = source.indexOf(`field: '${colId}'`);
      expect(idx).toBeGreaterThan(0);
      const block = source.slice(idx, idx + 700);
      expect(block).toContain("filter: 'agNumberColumnFilter'");
      // null ⇒ '—' (the Codex iter-1 #4 / iter-1 #5 not-measurable-yet branch).
      expect(block).toContain("p.value == null ? '—'");
    }
  });
});
