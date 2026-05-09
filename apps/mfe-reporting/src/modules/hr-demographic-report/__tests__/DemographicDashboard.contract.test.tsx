// @vitest-environment jsdom
/**
 * DemographicDashboard contract test (Faz 21.10 Wave 4 reporting
 * fixture — ChartDashboard.Item migration unblock).
 *
 * Codex iter-2 absorb (REVISE → AGREE-pending):
 *   - Use `importOriginal + ...actual` so the mock automatically
 *     surfaces ChartDashboard / ChartDashboard.Item / useChartTheme
 *     etc. when Wave 4 introduces them. Targeted overrides ONLY for
 *     the rendering layer (PieChart / BarChart / TreemapChart) so we
 *     can capture series shapes without invoking ECharts.
 *   - Treemap is now HARD-required (no `if (treemap)` escape hatch).
 *   - Six primary KPIs asserted by name + value (was 2).
 *   - BarChart contract pinned to the age-groups distribution
 *     specifically (was "any non-empty bar").
 *   - Department treemap pinned to FIXTURE_SUMMARY.departments
 *     label/value set.
 *   - Required chart count floor lifted from `>= 5` to `>= 7`
 *     (current dashboard renders 7 chart elements; lower than that
 *     means a section was dropped).
 *
 * Mutation discipline (each assertion would fail under a plausible
 * regression):
 *   - "drop avg age KPI"           → kpiBlockReadsSummaryKeys
 *   - "rename `genderDistribution`" → pieReceivesGenderSlices
 *   - "drop department treemap"    → treemapReceivesDeptHierarchy
 *   - "skip getSummary call"        → mountReadsSummarySync
 *   - "drop age groups bar"         → barReceivesAgeGroups
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FIXTURE_ROWS, FIXTURE_SUMMARY } from '../__fixtures__/demographic.fixture';

/* ---------------------------------------------------------------- */
/*  Mock the api module — return fixture summary synchronously and  */
/*  stub the live-data fetchers so they don't surprise the suite.   */
/* ---------------------------------------------------------------- */

vi.mock('../api', () => ({
  getSummary: vi.fn(() => FIXTURE_SUMMARY),
  getLiveKPIs: vi.fn().mockResolvedValue(null),
  getLiveCharts: vi.fn().mockResolvedValue(null),
  isLiveDataAvailable: vi.fn(() => false),
  refreshLiveData: vi.fn(),
  // GridResponse shape in this repo is `{ rows, total }` — see
  // `apps/mfe-reporting/src/grid/index.ts`. Codex iter-1 verified.
  fetchHrDemographicRows: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

/* ---------------------------------------------------------------- */
/*  Mock @mfe/x-charts — capture chart props into a registry. We     */
/*  inherit every other named export from the real module via       */
/*  importOriginal so future ChartDashboard / useChartTheme /        */
/*  ChartContainer-Item additions survive without test edits        */
/*  (Codex iter-2 absorb).                                           */
/* ---------------------------------------------------------------- */

interface CapturedChart {
  type: 'pie' | 'bar' | 'treemap';
  title?: string;
  data?: unknown;
  series?: unknown;
  labels?: unknown;
}

const chartRegistry: CapturedChart[] = [];

interface CapturedKpi {
  title: string;
  value: string | number;
}
const kpiRegistry: CapturedKpi[] = [];

vi.mock('@mfe/x-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mfe/x-charts')>();

  const PieChart = (props: { data?: unknown; title?: string }) => {
    chartRegistry.push({ type: 'pie', title: props.title, data: props.data });
    return <div data-testid="x-pie" data-title={props.title ?? ''} />;
  };
  const BarChart = (props: {
    data?: unknown;
    series?: unknown;
    labels?: unknown;
    title?: string;
  }) => {
    chartRegistry.push({
      type: 'bar',
      title: props.title,
      data: props.data,
      series: props.series,
      labels: props.labels,
    });
    return <div data-testid="x-bar" data-title={props.title ?? ''} />;
  };
  const TreemapChart = (props: { data?: unknown; title?: string }) => {
    chartRegistry.push({ type: 'treemap', title: props.title, data: props.data });
    return <div data-testid="x-treemap" data-title={props.title ?? ''} />;
  };
  const ChartContainer = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="x-chart-container">{children}</div>
  );
  const KPICard = (props: { title: string; value: string | number }) => {
    kpiRegistry.push({ title: props.title, value: props.value });
    return (
      <div data-testid="x-kpi-card" data-kpi-title={props.title}>
        <span data-testid="x-kpi-value">{String(props.value)}</span>
      </div>
    );
  };

  return {
    ...actual,
    PieChart,
    BarChart,
    TreemapChart,
    ChartContainer,
    KPICard,
  };
});

/* ---------------------------------------------------------------- */
/*  Component import — AFTER the mocks are hoisted by vi.mock        */
/* ---------------------------------------------------------------- */

import DemographicDashboard from '../DemographicDashboard';
import { getSummary } from '../api';

describe('DemographicDashboard — contract test against fixture summary', () => {
  beforeEach(() => {
    chartRegistry.length = 0;
    kpiRegistry.length = 0;
    vi.clearAllMocks();
    (getSummary as unknown as ReturnType<typeof vi.fn>).mockReturnValue(FIXTURE_SUMMARY);
  });

  it('mountReadsSummarySync: dashboard mounts and reads getSummary at least once', () => {
    expect(() => render(<DemographicDashboard />)).not.toThrow();
    expect(getSummary).toHaveBeenCalled();
  });

  it('kpiBlockReadsSummaryKeys: six primary KPI cards each receive a fixture-derived value', () => {
    render(<DemographicDashboard />);

    // Six primary KPIs at the top of the dashboard
    // (DemographicDashboard.tsx:1158-1186). Codex iter-2: assert all
    // six by label substring (Turkish without diacritics + diacritics
    // both accepted) so a partial drop trips the test even if the
    // remaining cards still render.
    const KPI_CONTRACTS: Array<{ name: string; pattern: RegExp; expectedValue: string }> = [
      {
        name: 'totalHeadcount',
        pattern: /toplam|headcount|calisan|çalışan/i,
        expectedValue: String(FIXTURE_SUMMARY.totalHeadcount),
      },
      {
        name: 'genderRatio',
        pattern: /kadin|erkek|kadın|gender/i,
        expectedValue: `${FIXTURE_SUMMARY.genderRatio.female}/${FIXTURE_SUMMARY.genderRatio.male}`,
      },
      {
        name: 'avgAge',
        pattern: /\bortalama\s*ya[sş]\b|avg\s*age/i,
        // The dashboard formats avg age via `.toFixed(1)`.
        expectedValue: FIXTURE_SUMMARY.avgAge.toFixed(1),
      },
      {
        name: 'avgTenure',
        pattern: /kidem|tenure/i,
        expectedValue: FIXTURE_SUMMARY.avgTenure.toFixed(1),
      },
      {
        name: 'turnoverRate',
        pattern: /devir|turnover/i,
        expectedValue: `${FIXTURE_SUMMARY.turnoverRate}`,
      },
      {
        name: 'deiScore',
        pattern: /dei|equity|inclus/i,
        expectedValue: `${FIXTURE_SUMMARY.deiScore}`,
      },
    ];

    for (const contract of KPI_CONTRACTS) {
      const kpi = kpiRegistry.find((k) => contract.pattern.test(k.title));
      expect(kpi, `KPI not found: ${contract.name}`).toBeDefined();
      expect(
        String(kpi!.value),
        `KPI ${contract.name} expected to contain "${contract.expectedValue}", got "${String(
          kpi!.value,
        )}"`,
      ).toContain(contract.expectedValue);
    }
  });

  it('pieReceivesGenderSlices: a PieChart receives the genderDistribution series with summed total = headcount', () => {
    render(<DemographicDashboard />);

    const fixtureLabels = FIXTURE_SUMMARY.genderDistribution.map((g) => g.label).sort();

    const matchingPie = chartRegistry.find(
      (c) =>
        c.type === 'pie' &&
        Array.isArray(c.data) &&
        (c.data as Array<{ label: string }>)
          .map((d) => d.label)
          .sort()
          .join('|') === fixtureLabels.join('|'),
    );
    expect(
      matchingPie,
      'No PieChart matched FIXTURE_SUMMARY.genderDistribution labels',
    ).toBeDefined();
    const pieData = matchingPie!.data as Array<{ label: string; value: number }>;
    const totalPieValue = pieData.reduce((s, d) => s + d.value, 0);
    expect(totalPieValue).toBe(FIXTURE_ROWS.length);
  });

  it('barReceivesAgeGroups: a BarChart receives the ageGroups distribution', () => {
    render(<DemographicDashboard />);

    const ageLabels = FIXTURE_SUMMARY.ageGroups.map((a) => a.label).sort();

    const ageBar = chartRegistry.find(
      (c) =>
        c.type === 'bar' &&
        Array.isArray(c.data) &&
        (c.data as Array<{ label: string }>)
          .map((d) => d.label)
          .sort()
          .join('|') === ageLabels.join('|'),
    );
    expect(ageBar, 'No BarChart matched FIXTURE_SUMMARY.ageGroups labels').toBeDefined();
    const ageBarData = ageBar!.data as Array<{ label: string; value: number }>;
    const totalAgeBarValue = ageBarData.reduce((s, d) => s + d.value, 0);
    expect(totalAgeBarValue).toBe(FIXTURE_ROWS.length);
  });

  it('treemapReceivesDeptHierarchy: a TreemapChart MUST be rendered for the department breakdown', () => {
    render(<DemographicDashboard />);

    // Codex iter-2: HARD requirement (was optional). The current
    // dashboard renders one Treemap for `summary.departments`; if
    // Wave 4 drops it, that's a Wave-4 scope reduction we want to
    // surface, not silently swallow.
    const treemap = chartRegistry.find((c) => c.type === 'treemap');
    expect(treemap, 'TreemapChart for department breakdown was not rendered').toBeDefined();

    const treemapData = treemap!.data as Array<{ label: string; value: number }>;
    expect(Array.isArray(treemapData)).toBe(true);

    const treemapLabels = treemapData.map((d) => d.label).sort();
    const fixtureDeptLabels = FIXTURE_SUMMARY.departments.map((d) => d.label).sort();
    expect(treemapLabels).toEqual(fixtureDeptLabels);

    // Sum of treemap leaves must equal headcount (every employee
    // belongs to exactly one department).
    const totalTreemapValue = treemapData.reduce((s, d) => s + d.value, 0);
    expect(totalTreemapValue).toBe(FIXTURE_ROWS.length);
  });

  it('chartRegistryHasMultipleEntries: dashboard renders the full chart strip (>= 7 charts)', () => {
    render(<DemographicDashboard />);
    // Codex iter-2: floor lifted from `>= 5` to `>= 7`. The current
    // dashboard renders 7 chart elements (4 pie/bar/treemap top-row +
    // 3 inside lower sections). Anything below means a Wave-4 layout
    // dropped a chart — flag it.
    expect(chartRegistry.length).toBeGreaterThanOrEqual(7);
  });

  it('semanticDomLandmarksPresent: dashboard exposes at least one heading for screen readers', () => {
    render(<DemographicDashboard />);

    const headings = screen.getAllByRole('heading', { hidden: true });
    expect(headings.length).toBeGreaterThan(0);
  });

  it('chartContainersWrapEveryChart: every captured chart sits inside an XChartContainer', () => {
    const { container } = render(<DemographicDashboard />);

    const containers = container.querySelectorAll('[data-testid="x-chart-container"]');
    const chartElements = container.querySelectorAll(
      '[data-testid="x-pie"], [data-testid="x-bar"], [data-testid="x-treemap"]',
    );
    expect(containers.length).toBeGreaterThan(0);
    expect(chartElements.length).toBe(chartRegistry.length);

    for (const ch of Array.from(chartElements)) {
      const ancestorContainer = ch.closest('[data-testid="x-chart-container"]');
      expect(ancestorContainer, `Chart ${ch.tagName} escaped XChartContainer scope`).not.toBeNull();
    }
  });

  it('fixtureSummaryIsCanonical: FIXTURE_SUMMARY agePyramid uses canonical 9-bucket zero-fill', () => {
    // Codex iter-2 parity check: `mock-data.ts → computeSummary` zero-
    // fills the agePyramid against AGE_PYRAMID_ORDER (9 buckets:
    // 20-24 .. 60+). We assert the canonical shape directly so any
    // future drift in `computeSummary` (or accidental reintroduction
    // of a hand-duplicated `computeFixtureSummary`) trips the test.
    const expectedBuckets = [
      '20-24',
      '25-29',
      '30-34',
      '35-39',
      '40-44',
      '45-49',
      '50-54',
      '55-59',
      '60+',
    ];
    expect(FIXTURE_SUMMARY.agePyramid.map((p) => p.ageGroup)).toEqual(expectedBuckets);
    // Every bucket should expose a numeric male+female pair (zero-filled).
    for (const bucket of FIXTURE_SUMMARY.agePyramid) {
      expect(typeof bucket.male).toBe('number');
      expect(typeof bucket.female).toBe('number');
    }
    // Sum of male+female across buckets must equal headcount.
    const total = FIXTURE_SUMMARY.agePyramid.reduce((s, p) => s + p.male + p.female, 0);
    expect(total).toBe(FIXTURE_ROWS.length);
  });
});
