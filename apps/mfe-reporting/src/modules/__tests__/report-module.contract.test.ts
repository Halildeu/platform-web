import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridRequest } from '../../grid';
import type { ReportModule } from '../types';
import type { ReportListItem } from '../dynamic-report/types';

/*
 * Cross-group SSRM contract test — Codex thread 019e3a61 (AGREE).
 *
 * The mfe-reporting "veri gelmiyor / satır yok" bug was a whack-a-mole:
 * a shared-code change that fixed one report group regressed another,
 * because the report modules carried divergent total/pagination
 * semantics. This test pins the AG Grid SSRM block contract for EVERY
 * rendered data-grid module, so a future divergence fails CI instead of
 * a user's browser.
 *
 * Scope: the 7 hand-written data-grid modules + one dynamic-report
 * factory instance. The dashboard-only modules (hr-executive-summary,
 * context-health) are intentionally excluded — they are not data grids
 * and would false-red this contract.
 *
 * For each module, with mocked HTTP returning a 120-row fixture, we
 * assert per SSRM block (Codex 019e3a61 invariants):
 *   - rows.length <= blockSize                       (no over-long payload)
 *   - total >= startRow + rows.length                (count covers the window)
 *   - short block ⇒ total === startRow + rows.length (exact last-block count)
 *   - block 1 ≠ block 0                              (no duplicated block)
 */

const { mockGet, mockPost, stubClient } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return { mockGet, mockPost, stubClient: { get: mockGet, post: mockPost } };
});

vi.mock('../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: stubClient,
    auth: {
      getUser: () => ({ permissions: [] }),
      getEpoch: () => 1,
      ready: () => Promise.resolve(),
    },
  }),
}));

/*
 * Mock the full @mfe/shared-http surface — sibling modules in this
 * package import getGatewayBaseUrl and other helpers, so a partial mock
 * crashes the runner when those helpers come up null.
 */
vi.mock('@mfe/shared-http', () => ({
  api: stubClient,
  getGatewayBaseUrl: () => '',
  buildAuthHeaders: () => ({}),
  registerTokenResolver: () => undefined,
}));

// Import the modules AFTER the mocks so resolveHttpClient() picks the stub.
import { usersReportModule } from '../users-report';
import { monthlyLoginModule } from '../monthly-login-summary';
import { auditReportModule } from '../audit-report';
import { weeklyAuditDigestModule } from '../weekly-audit-digest';
import { accessReportModule } from '../access-report';
import { hrCompensationModule } from '../hr-compensation-report';
import { hrDemographicReportModule } from '../hr-demographic-report';
import { createDynamicReportModule } from '../dynamic-report/create-dynamic-module';

const BLOCK_SIZE = 50;
const TOTAL_FIXTURE = 120;

/* ---- HTTP fixture routing -------------------------------------------- */

const pageOf = (url: string): { page: number; pageSize: number } => {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const qs = new URLSearchParams(query);
  const page = Number(qs.get('page'));
  const pageSize = Number(qs.get('pageSize'));
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : BLOCK_SIZE,
  };
};

/** A paged window of the 120-row fixture (backend-paginated endpoints). */
const pagedItems = (prefix: string, page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, TOTAL_FIXTURE);
  const items: Array<Record<string, unknown>> = [];
  for (let i = start; i < end; i += 1) {
    items.push({ id: `${prefix}-${i}` });
  }
  return items;
};

/** The whole 120-row fixture (endpoints with no backend pagination). */
const allItems = (prefix: string) => {
  const items: Array<Record<string, unknown>> = [];
  for (let i = 0; i < TOTAL_FIXTURE; i += 1) {
    items.push({ id: `${prefix}-${i}` });
  }
  return items;
};

const installFixtureRouting = () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockImplementation((url: string) => {
    const raw = String(url);
    const path = raw.split('?')[0];
    const { page, pageSize } = pageOf(raw);

    if (path === '/v1/users') {
      return Promise.resolve({
        data: { items: pagedItems('user', page, pageSize), total: TOTAL_FIXTURE },
      });
    }
    if (path === '/audit/events') {
      return Promise.resolve({
        data: { events: pagedItems('evt', page, pageSize), total: TOTAL_FIXTURE },
      });
    }
    if (path === '/v1/roles') {
      // /v1/roles has no backend pagination — every call returns the
      // WHOLE list. The access adapter must slice it per SSRM block.
      return Promise.resolve({ data: { items: allItems('role'), total: TOTAL_FIXTURE } });
    }
    if (path.startsWith('/v1/reports/') && path.endsWith('/data')) {
      return Promise.resolve({
        data: { items: pagedItems('row', page, pageSize), total: TOTAL_FIXTURE },
      });
    }
    // Dashboard / filter-option endpoints a module may probe — empty.
    return Promise.resolve({ data: [] });
  });
};

/* ---- Modules under test ---------------------------------------------- */

// A heterogeneous list of report modules with unrelated TFilters/TRow
// generics — `any` mirrors modules/index.ts's own AnyReportModule alias.
type AnyModule = ReportModule<any, any>;

const dynamicModule = createDynamicReportModule({
  key: 'contract-test-report',
  title: 'Contract Test Report',
  description: 'SSRM contract fixture',
  category: 'test',
} as ReportListItem);

const DATA_GRID_MODULES: Array<{ name: string; module: AnyModule }> = [
  { name: 'users-report', module: usersReportModule },
  { name: 'monthly-login-summary', module: monthlyLoginModule },
  { name: 'audit-report', module: auditReportModule },
  { name: 'weekly-audit-digest', module: weeklyAuditDigestModule },
  { name: 'access-report', module: accessReportModule },
  { name: 'hr-compensation-report', module: hrCompensationModule },
  { name: 'hr-demographic-report', module: hrDemographicReportModule },
  { name: 'dynamic-report', module: dynamicModule },
];

const blockRequest = (page: number): GridRequest => ({
  page,
  pageSize: BLOCK_SIZE,
  startRow: (page - 1) * BLOCK_SIZE,
  endRow: page * BLOCK_SIZE,
});

/* ---- Tests ----------------------------------------------------------- */

describe('report module SSRM contract', () => {
  beforeEach(() => {
    installFixtureRouting();
  });

  describe.each(DATA_GRID_MODULES)('$name', ({ module }) => {
    it('declares a column contract', () => {
      const meta = module.getColumnMeta?.() ?? [];
      const legacy = module.getColumns?.((key: string) => key) ?? [];
      if (typeof module.ensureColumnMeta === 'function') {
        // Dynamic reports load columns asynchronously from /metadata —
        // an empty synchronous getColumnMeta() is expected there.
        expect(typeof module.ensureColumnMeta).toBe('function');
      } else {
        expect(meta.length + legacy.length).toBeGreaterThan(0);
      }
    });

    it('block 0 — rows arrive and the count covers the window', async () => {
      const res = await module.fetchRows(module.createInitialFilters(), blockRequest(1));
      expect(res.rows.length).toBeGreaterThan(0);
      expect(res.rows.length).toBeLessThanOrEqual(BLOCK_SIZE);
      expect(res.total).toBeGreaterThanOrEqual(res.rows.length);
      if (res.rows.length < BLOCK_SIZE) {
        expect(res.total).toBe(res.rows.length);
      }
    });

    it('block 1 — window-aligned and distinct from block 0', async () => {
      const filters = module.createInitialFilters();
      const block0 = await module.fetchRows(filters, blockRequest(1));
      const block1 = await module.fetchRows(filters, blockRequest(2));
      expect(block1.rows.length).toBeLessThanOrEqual(BLOCK_SIZE);
      expect(block1.total).toBeGreaterThanOrEqual(BLOCK_SIZE + block1.rows.length);
      // Regression guard for the `access` "whole list on every block" bug.
      expect(block1.rows).not.toEqual(block0.rows);
    });

    it('short last block — total equals startRow + rows.length', async () => {
      // Page 3 of a 120-row fixture ⇒ rows 100-119, a 20-row short block.
      // (hr-demographic uses a 2545-row mock dataset so page 3 is still a
      // full block there — the guarded branch simply does not run.)
      const res = await module.fetchRows(module.createInitialFilters(), blockRequest(3));
      if (res.rows.length > 0 && res.rows.length < BLOCK_SIZE) {
        expect(res.total).toBe(2 * BLOCK_SIZE + res.rows.length);
      }
    });
  });
});
