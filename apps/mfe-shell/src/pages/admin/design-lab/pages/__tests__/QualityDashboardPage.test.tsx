// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const MOCK_ITEMS = [
  {
    name: 'Button',
    kind: 'component',
    availability: 'exported',
    lifecycle: 'stable',
    group: 'general',
    subgroup: 'actions',
    taxonomyGroupId: 'general',
    taxonomySubgroup: 'actions',
    importStatement: '',
    whereUsed: [],
    tags: [],
    demoMode: 'live',
    description: 'Primary button',
    sectionIds: [],
    qualityGates: ['design_tokens', 'a11y_keyboard_support', 'ux_catalog_alignment'],
  },
  {
    name: 'Select',
    kind: 'component',
    availability: 'exported',
    lifecycle: 'beta',
    group: 'general',
    subgroup: 'inputs',
    taxonomyGroupId: 'general',
    taxonomySubgroup: 'inputs',
    importStatement: '',
    whereUsed: [],
    tags: [],
    demoMode: 'live',
    description: 'Select dropdown',
    sectionIds: [],
    qualityGates: ['design_tokens'],
  },
  {
    name: 'DataGrid',
    kind: 'component',
    availability: 'exported',
    lifecycle: 'stable',
    group: 'advanced',
    subgroup: 'data',
    taxonomyGroupId: 'advanced',
    taxonomySubgroup: 'data',
    importStatement: '',
    whereUsed: [],
    tags: [],
    demoMode: 'live',
    description: 'Grid component',
    sectionIds: [],
    qualityGates: [],
  },
];

vi.mock('../../DesignLabProvider', () => ({
  useDesignLab: () => ({
    t: (key: string) => key,
    index: {
      items: MOCK_ITEMS,
      pages: { currentFamilies: [] },
      recipes: { currentFamilies: [] },
      ecosystem: { currentFamilies: [] },
    },
    layer: 'components',
  }),
}));

vi.mock('../../DesignLabSidebarRouter', () => ({
  PRIMITIVE_NAMES: new Set(),
  ADVANCED_NAMES: new Set(['DataGrid']),
  API_NAMES: new Set(),
}));

vi.mock('../../components/QualityBadge', () => ({
  QualityBadge: ({ score }: { score: number }) => <span data-testid="quality-badge">{score}%</span>,
  getQualityTier: (score: number) =>
    score >= 90 ? 'platinum' : score >= 70 ? 'gold' : score >= 50 ? 'silver' : 'bronze',
  countByTier: () => ({ platinum: 0, gold: 1, silver: 1, bronze: 1 }),
}));

vi.mock('../../components/PackageQualityScore', () => ({
  PackageQualityScore: ({ packageName }: { packageName: string }) => (
    <div data-testid={`pkg-${packageName}`}>{packageName}</div>
  ),
}));

vi.mock('../../components/AlertPanel', () => ({
  AlertPanel: ({ alerts }: { alerts: Array<{ title: string }> }) => (
    <div data-testid="alert-panel">
      {alerts.map((a, i) => (
        <div key={i}>{a.title}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../components/SLOTracker', () => ({
  SLOTracker: ({ metrics }: { metrics: Array<{ name: string }> }) => (
    <div data-testid="slo-tracker">
      {metrics.map((m, i) => (
        <div key={i}>{m.name}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../components/CoverageMatrix', () => ({
  CoverageMatrix: ({ items }: { items: unknown[] }) => (
    <div data-testid="coverage-matrix">{items.length} items</div>
  ),
}));

vi.mock('../../components/QualityGatesOverview', () => ({
  QualityGatesOverview: () => <div data-testid="quality-gates-overview">Quality Gates</div>,
}));

vi.mock('../../components/SecurityPosture', () => ({
  SecurityPosture: () => <div data-testid="security-posture">Security Posture</div>,
}));

vi.mock('../../components/DataProvenanceBadge', () => ({
  DataProvenanceBadge: ({ level }: { level: string }) => (
    <span data-testid="provenance-badge">{level}</span>
  ),
}));

vi.mock('../../evidence/useEvidence', () => ({
  useEvidence: () => ({ status: 'no_data' }),
  FALLBACK_REGISTRY: {
    tests: {},
    benchmarks: { workflow_exists: false, threshold_enforced: false, last_run: null, results: {} },
    visual_regression: {
      provider: 'none',
      workflow_exists: false,
      last_run: null,
      status: 'no_data',
      stats: { pass: 0, fail: 0, changed: 0, new: 0, skipped: 0 },
    },
    security: {},
  },
  // K2-3: getEvidenceProvenance helper — test mock no_data döndürür (W1.5 fake guarantee).
  getEvidenceProvenance: () => 'no_data',
}));

vi.mock('../../docs/guideRegistry', () => ({ hasGuide: () => false }));
vi.mock('../../tabs/componentTokenMap', () => ({ hasTokens: () => false }));
vi.mock('../../examples/registry', () => ({ hasExamples: () => false }));
vi.mock('../../playground', () => ({ hasPlayground: () => false }));

import QualityDashboardPage from '../QualityDashboardPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <QualityDashboardPage />
    </MemoryRouter>,
  );
}

describe('QualityDashboardPage', () => {
  it('renders the page title "Quality Command Center"', () => {
    renderPage();
    expect(screen.getByText('Quality Command Center')).toBeInTheDocument();
  });

  it('shows SLO Tracker section with metric names', () => {
    renderPage();
    expect(screen.getByText('SLO Tracker')).toBeInTheDocument();
    expect(screen.getByTestId('slo-tracker')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
    expect(screen.getByText('Latency P95')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
  });

  it('shows the alert panel', () => {
    renderPage();
    expect(screen.getByTestId('alert-panel')).toBeInTheDocument();
  });

  it('renders Security Posture section', () => {
    renderPage();
    expect(screen.getByTestId('security-posture')).toBeInTheDocument();
  });

  it('renders Quality Gates Overview', () => {
    renderPage();
    expect(screen.getByTestId('quality-gates-overview')).toBeInTheDocument();
  });

  it('renders the coverage matrix with scored component count', () => {
    renderPage();
    expect(screen.getByTestId('coverage-matrix')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('shows Quality Distribution section with tier labels', () => {
    renderPage();
    expect(screen.getByText('Quality Distribution')).toBeInTheDocument();
    expect(screen.getAllByText('Platinum').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gold').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Silver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bronze').length).toBeGreaterThan(0);
  });

  it('renders Bottom 20 section title', () => {
    renderPage();
    expect(screen.getByText(/Bottom 20/)).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- */
/*  Faz 21.6 PR-B2 — CI Scorecard canonical filter + legacy badge    */
/* ---------------------------------------------------------------- */

import { fireEvent } from '@testing-library/react';
import { waitFor } from '@testing-library/react';

const SCORECARD_FIXTURE = [
  // 5 canonical entries
  {
    name: 'Button',
    path: 'components/Button.tsx',
    dir: 'components',
    packageId: 'design-system',
    packageName: '@mfe/design-system',
    canonicalId: '@mfe/design-system/Button',
    status: 'canonical',
    replacedBy: null,
    lineCount: 200,
    scores: {
      testDepth: 80,
      api: 90,
      a11y: 80,
      testCoverage: 90,
      accessControl: 100,
      storyCompleteness: 90,
      i18n: 100,
      documentation: 90,
    },
    totalScore: 88,
    grade: 'A',
    improvements: [],
  },
  {
    name: 'BarChart',
    path: 'BarChart.tsx',
    dir: '.',
    packageId: 'x-charts',
    packageName: '@mfe/x-charts',
    canonicalId: '@mfe/x-charts/BarChart',
    status: 'canonical',
    replacedBy: null,
    lineCount: 300,
    scores: {
      testDepth: 60,
      api: 80,
      a11y: 60,
      testCoverage: 80,
      accessControl: 100,
      storyCompleteness: 70,
      i18n: 100,
      documentation: 80,
    },
    totalScore: 75,
    grade: 'A',
    improvements: [],
  },
  {
    name: 'OrgChart',
    path: 'blocks/org-chart/OrgChart.tsx',
    dir: 'blocks',
    packageId: 'design-system',
    packageName: '@mfe/design-system',
    canonicalId: '@mfe/design-system/OrgChart',
    status: 'canonical',
    replacedBy: null,
    lineCount: 400,
    scores: {
      testDepth: 50,
      api: 70,
      a11y: 0,
      testCoverage: 60,
      accessControl: 80,
      storyCompleteness: 70,
      i18n: 100,
      documentation: 70,
    },
    totalScore: 55,
    grade: 'B',
    improvements: [],
  },
  {
    name: 'Modal',
    path: 'components/Modal.tsx',
    dir: 'components',
    packageId: 'design-system',
    packageName: '@mfe/design-system',
    canonicalId: '@mfe/design-system/Modal',
    status: 'canonical',
    replacedBy: null,
    lineCount: 250,
    scores: {
      testDepth: 70,
      api: 80,
      a11y: 80,
      testCoverage: 80,
      accessControl: 100,
      storyCompleteness: 80,
      i18n: 100,
      documentation: 80,
    },
    totalScore: 80,
    grade: 'A',
    improvements: [],
  },
  {
    name: 'Tooltip',
    path: 'components/Tooltip.tsx',
    dir: 'components',
    packageId: 'design-system',
    packageName: '@mfe/design-system',
    canonicalId: '@mfe/design-system/Tooltip',
    status: 'canonical',
    replacedBy: null,
    lineCount: 150,
    scores: {
      testDepth: 50,
      api: 70,
      a11y: 50,
      testCoverage: 70,
      accessControl: 100,
      storyCompleteness: 60,
      i18n: 100,
      documentation: 60,
    },
    totalScore: 65,
    grade: 'B',
    improvements: [],
  },
  // 2 legacy entries (DS BarChart + DS GaugeChart, both replaced by x-charts)
  {
    name: 'BarChart',
    path: 'components/charts/BarChart.tsx',
    dir: 'components',
    packageId: 'design-system',
    packageName: '@mfe/design-system',
    canonicalId: '@mfe/x-charts/BarChart',
    status: 'legacy',
    replacedBy: '@mfe/x-charts/BarChart',
    lineCount: 200,
    scores: {
      testDepth: 20,
      api: 60,
      a11y: 0,
      testCoverage: 40,
      accessControl: 80,
      storyCompleteness: 50,
      i18n: 100,
      documentation: 50,
    },
    totalScore: 40,
    grade: 'C',
    improvements: [],
  },
  {
    name: 'GaugeChart',
    path: 'enterprise/GaugeChart.tsx',
    dir: 'enterprise',
    packageId: 'design-system',
    packageName: '@mfe/design-system',
    canonicalId: '@mfe/x-charts/GaugeChart',
    status: 'legacy',
    replacedBy: '@mfe/x-charts/GaugeChart',
    lineCount: 350,
    scores: {
      testDepth: 30,
      api: 70,
      a11y: 0,
      testCoverage: 60,
      accessControl: 80,
      storyCompleteness: 70,
      i18n: 100,
      documentation: 70,
    },
    totalScore: 50,
    grade: 'B',
    improvements: [],
  },
];

describe('QualityDashboardPage — CI Scorecard legacy filter (Faz 21.6 PR-B2)', () => {
  beforeEach(() => {
    // Mock fetch /scorecard.json with 5 canonical + 2 legacy
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SCORECARD_FIXTURE,
    }) as unknown as typeof fetch;
  });

  it('default render: legacy entries hidden, total === 5 canonical', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ci-scorecard-section')).toBeInTheDocument();
    });
    // Heading shows "CI Scorecard — 5 Bilesen"
    await waitFor(() => {
      expect(screen.getByText(/CI Scorecard — 5 Bilesen/)).toBeInTheDocument();
    });
    // "(2 legacy gizli)" hint
    expect(screen.getByText(/2 legacy gizli/)).toBeInTheDocument();
  });

  it('toggle button shows count of legacy entries', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('toggle-legacy')).toBeInTheDocument();
    });
    expect(screen.getByText(/Show legacy \(2\)/)).toBeInTheDocument();
  });

  it('clicking toggle shows legacy entries (total goes from 5 to 7)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('toggle-legacy')).toBeInTheDocument();
    });
    const toggle = screen.getByTestId('toggle-legacy');
    fireEvent.click(toggle);
    // After click: total === 7
    await waitFor(() => {
      expect(screen.getByText(/CI Scorecard — 7 Bilesen/)).toBeInTheDocument();
    });
    // Hide button text now
    expect(screen.getByText(/Hide legacy \(2\)/)).toBeInTheDocument();
  });

  it('Bottom 10 scorecard list renders with legacy badge when toggled on', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('bottom-10-scorecard')).toBeInTheDocument();
    });
    // Default: legacy badges hidden (legacy entries filtered out)
    expect(screen.queryAllByTestId('legacy-badge')).toHaveLength(0);
    // Toggle on
    fireEvent.click(screen.getByTestId('toggle-legacy'));
    // Now legacy badges visible (2 legacy entries)
    await waitFor(() => {
      expect(screen.queryAllByTestId('legacy-badge').length).toBeGreaterThan(0);
    });
  });

  it('legacy badge shows replacedBy target (x-charts/BarChart)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('toggle-legacy')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('toggle-legacy'));
    await waitFor(() => {
      const badges = screen.queryAllByTestId('legacy-badge');
      expect(badges.length).toBe(2);
      const text = badges.map((b) => b.textContent).join(' ');
      expect(text).toContain('x-charts/BarChart');
      expect(text).toContain('x-charts/GaugeChart');
    });
  });
});
