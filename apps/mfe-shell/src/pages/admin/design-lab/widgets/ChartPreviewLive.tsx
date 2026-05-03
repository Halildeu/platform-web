/**
 * ChartPreviewLive — renders a real @mfe/x-charts component with mock data
 * inside Design Lab pages, replacing the previous SVG ChartPreviewPlaceholder.
 *
 * Mock data and prop shapes are taken verbatim from the Storybook reference
 * stories (`packages/x-charts/src/__stories__/AllChartTypes.stories.tsx`)
 * so the visual matches what visual-regression already covers.
 *
 * Boolean toggles flowing in from the PlaygroundTab `pgState` are forwarded
 * as raw props on the underlying chart component when applicable. Unknown
 * chart ids fall back to a friendly empty state instead of throwing.
 */
import React from 'react';
import {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart,
  GaugeChart,
  RadarChart,
  TreemapChart,
  HeatmapChart,
  WaterfallChart,
  FunnelChart,
  SankeyChart,
  SunburstChart,
  KPICard,
  SparklineChart,
  ChartDashboard,
  ChartContainer,
  ChartToolbar,
  useChartInteractions,
} from '@mfe/x-charts';
import CrossFilterDemoLive from './CrossFilterDemoLive';
import CrossFilterGridDemoLive from './CrossFilterGridDemoLive';
import DrillDownDemoLive from './DrillDownDemoLive';
import FeatureDemoLive, { type FeatureId } from './FeatureDemoLive';
import AiHookDemoLive, { type AiHookId } from './AiHookDemoLive';
import PerfUtilityDemoLive, { type PerfUtilityId } from './PerfUtilityDemoLive';
import {
  getBool,
  getDecal,
  getEnum,
  getNum,
  getOptStr,
  getStr,
  getPreviewSurfaceStyle,
  type PlaygroundState,
} from './chartPlaygroundModel';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const values2 = [220, 182, 191, 234, 290, 330];

export interface ChartPreviewLiveProps {
  chartId: string;
  chartName: string;
  /**
   * Typed playground state forwarded from `PlaygroundTab`. Faz 21.8
   * follow-up (Codex thread `019def27`): widened from `boolean | string`
   * to `PlaygroundState` (boolean | string | number | undefined) so enum
   * pickers and number inputs can drive the underlying chart prop. The
   * accessors `getBool` / `getEnum` / `getNum` / `getStr` from
   * `chartPlaygroundModel` provide typed reads with safe fallbacks.
   */
  toggles?: PlaygroundState;
  /**
   * Visual height (px). Default 360 matches the Storybook visual snapshot box.
   */
  height?: number;
}

// Backwards-compat shim — kept inline so call sites that still expect a
// boolean reader keep working. Internally just delegates to `getBool`.
const isOn = (toggles: PlaygroundState | undefined, key: string, fallback: boolean): boolean =>
  getBool(toggles, key, fallback);

type ChartSize = 'sm' | 'md' | 'lg' | 'xl';

interface PreviewBoxProps {
  testId: string;
  height: number;
  surfaceStyle?: React.CSSProperties;
  children: React.ReactNode;
}

const PreviewBox: React.FC<PreviewBoxProps> = ({ testId, height, surfaceStyle, children }) => (
  <div
    data-testid={testId}
    style={{
      width: '100%',
      maxWidth: 720,
      height,
      background: surfaceStyle?.background ?? 'var(--surface-canvas, #ffffff)',
      color: surfaceStyle?.color,
      transition: 'background-color 200ms ease, color 200ms ease',
    }}
  >
    {children}
  </div>
);

const ChartPreviewLive: React.FC<ChartPreviewLiveProps> = ({
  chartId,
  chartName,
  toggles,
  height = 360,
}) => {
  const testId = `design-lab-chart-preview-${chartId}`;

  switch (chartId) {
    case 'bar-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox testId={testId} height={height} surfaceStyle={surfaceStyle}>
          <BarChart
            data={categories.map((c, i) => ({ label: c, value: values1[i] }))}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            orientation={getEnum(toggles, 'orientation', 'vertical')}
            size={getEnum<ChartSize>(toggles, 'size', 'lg')}
            showValues={isOn(toggles, 'showValues', false)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
            accessReason={getOptStr(toggles, 'accessReason')}
          />
        </PreviewBox>
      );
    }

    case 'line-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox testId={testId} height={height} surfaceStyle={surfaceStyle}>
          <LineChart
            series={[
              { name: 'Seri A', data: values1 },
              { name: 'Seri B', data: values2 },
            ]}
            labels={categories}
            title={getStr(toggles, 'title', chartName)}
            size={getEnum<ChartSize>(toggles, 'size', 'lg')}
            showDots={isOn(toggles, 'showDots', true)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            curved={isOn(toggles, 'curved', false)}
            showArea={isOn(toggles, 'showArea', false)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'area-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox testId={testId} height={height} surfaceStyle={surfaceStyle}>
          <AreaChart
            series={[
              { name: 'Gelir', data: values1 },
              { name: 'Gider', data: values2 },
            ]}
            labels={categories}
            title={getStr(toggles, 'title', chartName)}
            size={getEnum<ChartSize>(toggles, 'size', 'lg')}
            stacked={isOn(toggles, 'stacked', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showDots={isOn(toggles, 'showDots', false)}
            gradient={isOn(toggles, 'gradient', true)}
            curved={isOn(toggles, 'curved', true)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'pie-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox testId={testId} height={height} surfaceStyle={surfaceStyle}>
          <PieChart
            data={categories.slice(0, 5).map((c, i) => ({ label: c, value: values1[i] }))}
            title={getStr(toggles, 'title', chartName)}
            size={getEnum<ChartSize>(toggles, 'size', 'lg')}
            donut={isOn(toggles, 'donut', true)}
            showLabels={isOn(toggles, 'showLabels', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            showPercentage={isOn(toggles, 'showPercentage', true)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'scatter-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox testId={testId} height={height} surfaceStyle={surfaceStyle}>
          <ScatterChart
            data={values1.map((v, i) => ({ x: v, y: values2[i], label: categories[i] }))}
            title={getStr(toggles, 'title', chartName)}
            xLabel={getStr(toggles, 'xLabel', 'Seri A')}
            yLabel={getStr(toggles, 'yLabel', 'Seri B')}
            size={getEnum<ChartSize>(toggles, 'size', 'lg')}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'gauge-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox testId={testId} height={height} surfaceStyle={surfaceStyle}>
          <GaugeChart
            value={getNum(toggles, 'value', 72)}
            min={getNum(toggles, 'min', 0)}
            max={getNum(toggles, 'max', 100)}
            title={getStr(toggles, 'title', chartName)}
            thresholds={[
              { value: 30, color: '#ef4444' },
              { value: 70, color: '#f59e0b' },
              { value: 100, color: '#22c55e' },
            ]}
            size={getEnum<ChartSize>(toggles, 'size', 'lg')}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'radar-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <RadarChart
            indicators={[
              { name: 'Satış', max: 100 },
              { name: 'Pazarlama', max: 100 },
              { name: 'Teknoloji', max: 100 },
              { name: 'Destek', max: 100 },
              { name: 'Geliştirme', max: 100 },
            ]}
            series={[
              { name: 'Ekip A', data: [85, 70, 95, 60, 80] },
              { name: 'Ekip B', data: [65, 90, 70, 85, 55] },
            ]}
            title={chartName}
            showLegend={isOn(toggles, 'showLegend', true)}
            size="lg"
          />
        </PreviewBox>
      );

    case 'treemap-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <TreemapChart
            data={[
              {
                name: 'Satış',
                value: 100,
                children: [
                  { name: 'Online', value: 60 },
                  { name: 'Mağaza', value: 40 },
                ],
              },
              {
                name: 'Pazarlama',
                value: 80,
                children: [
                  { name: 'Dijital', value: 50 },
                  { name: 'Basılı', value: 30 },
                ],
              },
            ]}
            title={chartName}
            size="lg"
          />
        </PreviewBox>
      );

    case 'heatmap-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <HeatmapChart
            data={[
              [0, 0, 10],
              [0, 1, 22],
              [0, 2, 28],
              [1, 0, 35],
              [1, 1, 42],
              [1, 2, 18],
              [2, 0, 15],
              [2, 1, 30],
              [2, 2, 45],
              [3, 0, 50],
              [3, 1, 12],
              [3, 2, 33],
              [4, 0, 25],
              [4, 1, 38],
              [4, 2, 20],
            ]}
            xLabels={['Pzt', 'Sal', 'Çar', 'Per', 'Cum']}
            yLabels={['Sabah', 'Öğle', 'Akşam']}
            title={chartName}
            showValues={isOn(toggles, 'showValues', true)}
            size="lg"
          />
        </PreviewBox>
      );

    case 'waterfall-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <WaterfallChart
            data={[
              { label: 'Başlangıç', value: 1000 },
              { label: 'Gelir', value: 300 },
              { label: 'Hizmet', value: 200 },
              { label: 'Gider', value: -150 },
              { label: 'Vergi', value: -100 },
              { label: 'Sonuç', value: 1250 },
            ]}
            title={chartName}
            showValues={isOn(toggles, 'showValues', true)}
            size="lg"
          />
        </PreviewBox>
      );

    case 'funnel-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <FunnelChart
            data={[
              { name: 'Ziyaret', value: 5000 },
              { name: 'Kayıt', value: 3000 },
              { name: 'Deneme', value: 1500 },
              { name: 'Satın Alma', value: 500 },
            ]}
            title={chartName}
            showConversion={isOn(toggles, 'showConversion', true)}
            size="lg"
          />
        </PreviewBox>
      );

    case 'sankey-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <SankeyChart
            nodes={[
              { name: 'Kaynak A' },
              { name: 'Kaynak B' },
              { name: 'Hedef X' },
              { name: 'Hedef Y' },
            ]}
            links={[
              { source: 'Kaynak A', target: 'Hedef X', value: 30 },
              { source: 'Kaynak A', target: 'Hedef Y', value: 20 },
              { source: 'Kaynak B', target: 'Hedef X', value: 10 },
              { source: 'Kaynak B', target: 'Hedef Y', value: 40 },
            ]}
            title={chartName}
            size="lg"
          />
        </PreviewBox>
      );

    case 'sunburst-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <SunburstChart
            data={[
              {
                name: 'Türkiye',
                children: [
                  {
                    name: 'İstanbul',
                    children: [
                      { name: 'Kadıköy', value: 50 },
                      { name: 'Beşiktaş', value: 30 },
                    ],
                  },
                  {
                    name: 'Ankara',
                    children: [
                      { name: 'Çankaya', value: 40 },
                      { name: 'Keçiören', value: 20 },
                    ],
                  },
                ],
              },
            ]}
            title={chartName}
            size="lg"
          />
        </PreviewBox>
      );

    case 'kpi-card':
      return (
        <PreviewBox testId={testId} height={height}>
          <div className="flex h-full w-full items-center justify-center p-4">
            <KPICard
              title="Revenue"
              value="$128,500"
              trend={{ direction: 'up', value: '+12.5%', positive: true }}
              chart={<SparklineChart data={values1} type="area" />}
            />
          </div>
        </PreviewBox>
      );

    case 'sparkline-chart':
      return (
        <PreviewBox testId={testId} height={height}>
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-4">
            <div className="flex w-full max-w-md items-center gap-3 text-xs text-text-secondary">
              <span className="w-20 shrink-0">line</span>
              <div className="flex-1">
                <SparklineChart data={values1} type="line" />
              </div>
            </div>
            <div className="flex w-full max-w-md items-center gap-3 text-xs text-text-secondary">
              <span className="w-20 shrink-0">area</span>
              <div className="flex-1">
                <SparklineChart data={values1} type="area" />
              </div>
            </div>
            <div className="flex w-full max-w-md items-center gap-3 text-xs text-text-secondary">
              <span className="w-20 shrink-0">bar</span>
              <div className="flex-1">
                <SparklineChart data={values1} type="bar" />
              </div>
            </div>
          </div>
        </PreviewBox>
      );

    case 'chart-dashboard':
      return (
        <PreviewBox testId={testId} height={height}>
          <ChartDashboard columns={{ sm: 1, md: 2, lg: 3 }} gap={12}>
            <KPICard
              title="Revenue"
              value="$128K"
              trend={{ direction: 'up', value: '+12%', positive: true }}
              chart={<SparklineChart data={values1} type="area" />}
            />
            <KPICard
              title="Users"
              value="12,847"
              trend={{ direction: 'up', value: '+3.2%', positive: true }}
              chart={<SparklineChart data={values2} type="line" />}
            />
            <KPICard
              title="Errors"
              value="42"
              trend={{ direction: 'down', value: '-18%', positive: true }}
              chart={<SparklineChart data={[20, 18, 15, 12, 10, 8, 6]} type="bar" />}
            />
          </ChartDashboard>
        </PreviewBox>
      );

    case 'chart-container':
      return (
        <PreviewBox testId={testId} height={height}>
          <ChartContainer
            title="Q3 Sales"
            description="ChartContainer ile sarılmış BarChart — title + description + height slot"
            height={260}
          >
            <BarChart
              data={categories.map((c, i) => ({ label: c, value: values1[i] }))}
              showValues
              showGrid
              animate={false}
              size="md"
            />
          </ChartContainer>
        </PreviewBox>
      );

    case 'chart-toolbar':
      return (
        <PreviewBox testId={testId} height={height}>
          <ChartToolbarShowcase chartName={chartName} />
        </PreviewBox>
      );

    case 'cross-filter':
      // Cross-filter demo manages its own height (two stacked charts + reset button).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <CrossFilterDemoLive />
        </div>
      );

    case 'cross-filter-grid':
      // Faz 21.4 PR-B: chart → grid cross-filter bridge demo.
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <CrossFilterGridDemoLive />
        </div>
      );

    case 'drill-down':
      // Faz 21.4 PR-B: 3-level hierarchical drill (region → city → store).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <DrillDownDemoLive mode="basic" />
        </div>
      );

    case 'feature-brush':
    case 'feature-zoom-pan':
    case 'feature-realtime':
    case 'feature-theme-switch':
    case 'feature-export':
      // Faz 21.4 PR-C: 5 isolated feature demos (brush, zoom/pan,
      // realtime stream, theme switch, export). Each demo uses real
      // x-charts hooks; only the export demo uses a mock ECharts
      // instance (the public BarChart wrapper does not expose its
      // instance ref).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <FeatureDemoLive featureId={chartId as FeatureId} />
        </div>
      );

    case 'drill-down-history':
      // Faz 21.4 PR-B: drill-down + explicit Undo (drillUp) + Reset (drillToRoot) + depth/drill counter.
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <DrillDownDemoLive mode="history" />
        </div>
      );

    case 'detect-anomalies':
    case 'identify-trends':
    case 'suggest-chart':
    case 'chart-description':
    case 'nl-to-chart':
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <AiHookDemoLive hookId={chartId as AiHookId} />
        </div>
      );

    case 'lttb':
    case 'progressive-render':
    case 'lazy-chart':
    case 'lru-cache':
    case 'code-split':
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <PerfUtilityDemoLive utilityId={chartId as PerfUtilityId} />
        </div>
      );

    default:
      return (
        <PreviewBox testId={testId} height={height}>
          <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">
            {chartName}: live preview yakında
          </div>
        </PreviewBox>
      );
  }
};

/* ------------------------------------------------------------------ */
/*  ChartToolbarShowcase — local hook scope                            */
/*                                                                     */
/*  Wires useChartInteractions to ChartToolbar so the demo surfaces    */
/*  observable state (zoomLevel, brushRange) underneath the toolbar.   */
/* ------------------------------------------------------------------ */

const ChartToolbarShowcase: React.FC<{ chartName: string }> = ({ chartName }) => {
  const [interactions] = useChartInteractions({
    enableZoom: true,
    enablePan: false,
    enableBrush: true,
  });

  return (
    <div className="space-y-3 p-3">
      <ChartToolbar interactions={interactions} />
      <BarChart
        data={categories.map((c, i) => ({ label: c, value: values1[i] }))}
        title={chartName}
        showValues
        showGrid
        animate={false}
        size="md"
      />
      <div
        className="rounded border border-border-subtle bg-surface-muted p-2 text-xs text-text-secondary"
        data-testid="chart-toolbar-state"
      >
        <span className="font-mono">zoomLevel: {interactions.zoomLevel}</span>
        {interactions.brushRange ? (
          <span className="ml-3 font-mono">
            brush: [{interactions.brushRange.start}, {interactions.brushRange.end}]
          </span>
        ) : (
          <span className="ml-3 font-mono">brush: —</span>
        )}
      </div>
    </div>
  );
};

export default ChartPreviewLive;
