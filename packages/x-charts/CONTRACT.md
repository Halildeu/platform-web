# @mfe/x-charts — API Contract v2.1

## Status: ACTIVE | Date: 2026-04-30

> **Engine:** Apache ECharts 5.x (primary). AG Charts Community used only for grid-linked
> embedded charts via `@mfe/x-data-grid`. Decision: `decisions/topics/chart-viz-engine-selection.v1.json`
>
> **v2 → v2.1 changes (Faz 21.4-E, audit-driven 2026-04-30):**
>
> - **`ChartTooltip` standalone component removed from §1.** v2 declared a
>   public `ChartTooltip` component, but no implementation ever shipped.
>   Tooltip behaviour is configured per-chart through ECharts theme
>   tooltips (`buildDesignLabEChartsTheme` in `src/theme/`) and per-chart
>   `formatter` props on the chart wrappers themselves. The standalone
>   component would have duplicated that surface for no gain.
> - **`AccessControlledProps` integration moved to §3 → "Phase 2 — pending
>   integration".** v2 declared an `access`/`accessReason` API and a
>   four-state visibility ladder (full/readonly/disabled/hidden) on every
>   chart wrapper, but no wrapper carries those props today. The integration
>   is a real workstream — it is now tracked in the
>   `docs/x-charts-ui-ux-tracker.md` Faz 21.5 plan instead of being silently
>   declared but unimplemented in the contract.

## 1. Public API Surface

### Components

> **v2.1 prop-signature realignment (Codex review):** v2 listed an
> idealised `data: ChartData[]` + xKey/yKey/angleKey/etc. shape that
> was never how the wrappers actually shipped. v2.1 below mirrors the
> real exported `*Props` interfaces — see `packages/x-charts/src/<Chart>.tsx`
> for the canonical source.

```tsx
BarChart
  props: {
    data: ChartDataPoint[];                        // { label, value, color? }
    orientation?: 'vertical' | 'horizontal';
    size?: 'sm' | 'md' | 'lg';
    showValues?: boolean;                          // default false
    showGrid?: boolean;                            // default true
    showLegend?: boolean;                          // default false
    valueFormatter?: (v: number) => string;
    animate?: boolean;                             // default true
    colors?: string[];
    title?: string;
    series?: ChartSeries[];                        // multi-series grouping
    onDataPointClick?: (e: ChartClickEvent) => void;
  }

LineChart
  props: {
    series: ChartSeries[];                         // required
    labels: string[];                              // required, x-axis
    size?: 'sm' | 'md' | 'lg';
    showDots?: boolean;                            // default true
    showGrid?: boolean;                            // default true
    showLegend?: boolean;                          // default false
    showArea?: boolean;                            // fill area under lines
    curved?: boolean;                              // bezier interpolation
    valueFormatter?: (v: number) => string;
    animate?: boolean;
    title?: string;
    onDataPointClick?: (e: ChartClickEvent) => void;
  }

AreaChart
  props: {
    series: ChartSeries[];                         // required
    labels: string[];                              // required
    size?: 'sm' | 'md' | 'lg';
    stacked?: boolean;                             // default false
    showDots?: boolean;
    showGrid?: boolean;
    showLegend?: boolean;
    gradient?: boolean;                            // default true
    curved?: boolean;
    animate?: boolean;
    title?: string;
  }

PieChart
  props: {
    data: ChartDataPoint[];                        // { label, value, color? }
    size?: 'sm' | 'md' | 'lg';
    donut?: boolean;
    showLabels?: boolean;
    showLegend?: boolean;
    showPercentage?: boolean;
    animate?: boolean;
    title?: string;
    onDataPointClick?: (e: ChartClickEvent) => void;
  }

ScatterChart
  props: {
    data: ScatterDataPoint[];                      // { x, y, size?, label?, color? }
    size?: 'sm' | 'md' | 'lg';
    showGrid?: boolean;
    showLegend?: boolean;
    title?: string;
    description?: string;
    xLabel?: string;
    yLabel?: string;
  }

RadarChart
  props: {
    indicators: RadarIndicator[];                  // required, [{ name, max }]
    series: RadarSeriesItem[];                     // required, [{ name, values }]
    size?: 'sm' | 'md' | 'lg';
    shape?: 'polygon' | 'circle';                  // default 'polygon'
    showArea?: boolean;                            // fill area under series
    showLabels?: boolean;                          // axis name labels, default true
    showLegend?: boolean;                          // default false
    splitNumber?: number;                          // concentric rings, default 5
    title?: string;
    animate?: boolean;
    valueFormatter?: (v: number) => string;
    onDataPointClick?: (e: unknown) => void;
  }

TreemapChart
  props: {
    data: TreemapNode[];                           // hierarchical { name, value?, children? }
    size?: 'sm' | 'md' | 'lg';
    title?: string;
  }

SunburstChart
  props: {
    data: SunburstNode[];                          // hierarchical
    size?: 'sm' | 'md' | 'lg';
    title?: string;
  }

HeatmapChart
  props: {
    data: HeatmapTupleData[] | HeatmapObjectData[]; // [x, y, value] or { x, y, value }
    xLabels?: string[];                              // optional category labels
    yLabels?: string[];                              // optional category labels
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    min?: number;                                    // color scale min (auto-detected)
    max?: number;                                    // color scale max (auto-detected)
    colors?: [string, string];                       // gradient endpoints, default ['#f5f5f5', '#3b82f6']
    showValues?: boolean;                            // value text per cell
    valueFormatter?: (v: number) => string;
    cellSize?: number | 'auto';                      // default 'auto'
    showLegend?: boolean;                            // visualMap legend, default true
    animate?: boolean;
    onCellClick?: (params: { x: number; y: number; value: number }) => void;
  }

FunnelChart
  props: {
    data: FunnelDataPoint[];                       // [{ label, value }]
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    sort?: 'descending' | 'ascending' | 'none';    // default 'descending'
    gap?: number;                                  // pixel gap, default 2
    showLabels?: boolean;                          // default true
    labelPosition?: 'inside' | 'outside' | 'left' | 'right'; // default 'inside'
    showConversion?: boolean;                      // %-between-stages, default false
    orientation?: 'vertical' | 'horizontal';
    funnelAlign?: 'left' | 'center' | 'right';     // default 'center'
    showLegend?: boolean;
    valueFormatter?: (v: number) => string;
    animate?: boolean;
    onDataPointClick?: (params: unknown) => void;
  }

SankeyChart
  props: {
    nodes: { name: string }[];
    links: { source: string; target: string; value: number }[];
    size?: 'sm' | 'md' | 'lg';
    title?: string;
  }

GaugeChart
  props: {
    value: number;
    min?: number;                                  // default 0
    max?: number;                                  // default 100
    size?: 'sm' | 'md' | 'lg';
    thresholds?: { value: number; color: string }[];
    title?: string;
  }

WaterfallChart
  props: {
    data: WaterfallDataPoint[];                    // [{ label, value }] negative flows down
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    colors?: { increase?: string; decrease?: string; total?: string };
    showConnector?: boolean;                       // dashed connector lines, default true
    showValues?: boolean;                          // value labels on bars, default true
    valueFormatter?: (v: number) => string;
    orientation?: 'vertical' | 'horizontal';
    showLegend?: boolean;
    animate?: boolean;
    onDataPointClick?: (params: unknown) => void;
  }

ChartContainer
  props: {
    children: ReactNode;
    title?: string;
    description?: string;
    loading?: boolean;
    error?: string;
    empty?: boolean;
    emptyLabel?: string;
    height?: number | string;                      // default 300
    actions?: ReactNode;
  }

ChartLegend
  props: {
    items: { label: string; color: string; value?: string }[];
    direction?: 'horizontal' | 'vertical';
    maxItems?: number;
  }
```

> **Note (v2.1):** Tooltip behaviour is configured through the per-chart
> theme (see `src/theme/buildDesignLabEChartsTheme`) and the
> `valueFormatter` prop on each chart wrapper, not a standalone
> `<ChartTooltip>` component. The v2 standalone declaration was an
> aspiration that never shipped; v2.1 removes it from the public surface.

### Hooks

- `useChartTheme()` — returns resolved chart color palette and typography from design tokens
- `useChartResize(containerRef)` — returns `{ width, height }` with debounced resize observer

### Utilities

- `createColorScale(domain, range)` — builds a color interpolation function
- `formatChartValue(value, format)` — locale-aware number/date formatting for axes and tooltips
- `sanitizeChartText(text)` — XSS sanitization for all user-provided text in charts

### Type Exports

- `ChartData`, `TreemapNode`, `SankeyData`, `ColorScale`, `ChartTheme`, `GaugeSegment`
- Props interfaces for all chart components
- `ChartSpec` (engine-agnostic declarative format)

### Base

- Apache ECharts 5.x (runtime dependency)
- Tree-shakeable per chart type
- Renderer auto-detect: <5K SVG, 5K-50K Canvas, >50K WebGL

## 2. Theme / Token Integration

### Consumed Tokens

- `--chart-palette-1` through `--chart-palette-12` (categorical color palette)
- `--chart-bg`, `--chart-grid-color`, `--chart-axis-color`
- `--chart-label-color`, `--chart-label-font-size`
- `--chart-tooltip-bg`, `--chart-tooltip-fg`, `--chart-tooltip-border`
- Typography: `--font-family-data`, `--font-size-axis`, `--font-size-legend`

### Dark Mode

- Palette auto-adjusts via luminance-aware token set
- Grid lines, axis text, and tooltip chrome switch via `[data-theme="dark"]`
- ECharts theme preset: `DesignLabEChartsDarkTheme` + token overrides

### High Contrast Mode

- ECharts theme preset: `DesignLabEChartsHighContrastTheme`
- Decal patterns for non-color differentiation
- 4.5:1 minimum contrast ratio enforced

### Density Support

- `compact` — reduced padding, smaller legend items, thinner axis lines
- `comfortable` — default spacing
- `spacious` — larger labels, wider legend spacing, thicker lines

## 3. Access Control — Phase 2 (pending integration)

> **Status (v2.1):** The shape below is the **target** API. No chart
> wrapper currently accepts `access` / `accessReason` props. Integration
> is tracked in `docs/x-charts-ui-ux-tracker.md` (Faz 21.5 lift roadmap).
> Until it ships, callers should gate chart rendering at the page level
> using the existing Zanzibar guards (e.g. `useZanzibarAccess`).

### Target API: AccessControlledProps Integration

```tsx
<BarChart
  access={resolveZanzibarAccessProps('can_view', 'report', reportId)}
  accessReason="Bu raporu goruntuleme yetkiniz yok"
/>
```

### Target Policy-Based Visibility States

- `full` — interactive with tooltips, legend click, export, drill-down
- `readonly` — rendered with tooltips but no interactive actions
- `disabled` — chart rendered with overlay, no interaction
- `hidden` — component not rendered, space collapsed

> **D-007 compliance (current):** Chart layer does NOT filter data. Data
> authorization is handled by the backend/query pipeline via OpenFGA. The
> UI controls visibility/affordance at the page boundary today; per-chart
> visibility states will arrive with the Phase 2 integration above.

## 4. SSR / Client Boundary

### Client-Only (`'use client'`)

- ECharts canvas/SVG rendering engine
- All interactive features: tooltips, legend toggle, zoom, pan
- Resize observer and responsive recalculation

### Hydration Strategy

- SSR renders a sized placeholder `<div>` matching chart dimensions
- ECharts instance mounts on client, renders into placeholder

## 5. Security

- `sanitizeChartText()` applied to all user-provided text
- URL whitelist validation for image/link content
- No `innerHTML` usage — all text via ECharts text API

## 6. Accessibility (WCAG AA)

- Keyboard navigation: Tab, Arrow, Enter, Escape
- Data table fallback via `aria-describedby`
- Colorblind-safe palettes with decal patterns
- Screen reader announcements for chart type, data summary, point values
- Focus ring on chart container and legend items

## 7. Performance Budget

### Bundle Size

- **< 350 KB** gzipped total (ECharts + x-charts wrapper)
- Each chart type tree-shakeable independently
- CI gate enforces bundle limit

### Render Targets

- 1,000 data points: < 100ms
- 10,000 data points: < 300ms
- 100,000+ data points: WebGL renderer auto-selected
- Tooltip: < 16ms (single frame)

## 8. Test & Docs Exit Criteria

### Tests

- Unit tests: data transforms, color scale, theme resolution, format utilities, XSS sanitization
- Integration tests: full chart render per type, responsive resize, theme switching
- Visual regression: each chart type default, dark mode, high contrast
- Accessibility: axe-core audit, keyboard navigation, screen reader

### CI Gates

- bundle-size-check (< 350KB gzip)
- a11y-axe-audit
- contrast-ratio-check (4.5:1)
- xss-sanitization-check
- memory-leak-test (100-cycle mount/unmount)
- chart-spec-validation
- visual-regression
- tree-shaking-verify
