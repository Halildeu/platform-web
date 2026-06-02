import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import '@mfe/design-system/advanced/data-grid/setup';
import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../app/services/redux-context';
import EndpointDevicesPage from './EndpointDevicesPage';

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

  it('GRID_SCHEMA_VERSION is bumped to 4 (WEB-015 v2-b invalidates persisted v3 column state)', () => {
    expect(source).toMatch(/const GRID_SCHEMA_VERSION = 4;/);
    // Negative drift detectors — neither v2 nor v3 literal may survive.
    expect(source).not.toMatch(/const GRID_SCHEMA_VERSION = 2;/);
    expect(source).not.toMatch(/const GRID_SCHEMA_VERSION = 3;/);
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
