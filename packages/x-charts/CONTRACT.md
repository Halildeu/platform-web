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

```tsx
BarChart
  props: { data: ChartData[]; xKey: string; yKey: string | string[]; stacked?: boolean; horizontal?: boolean }

LineChart
  props: { data: ChartData[]; xKey: string; yKey: string | string[]; smooth?: boolean; area?: boolean }

AreaChart
  props: { data: ChartData[]; xKey: string; yKey: string | string[]; stacked?: boolean; gradient?: boolean }

PieChart
  props: { data: ChartData[]; angleKey: string; labelKey: string; donut?: boolean; innerRadius?: number }

ScatterChart
  props: { data: ChartData[]; xKey: string; yKey: string; sizeKey?: string; colorKey?: string }

RadarChart
  props: { data: ChartData[]; angleKey: string; radiusKey: string | string[] }

TreemapChart
  props: { data: TreemapNode[]; valueKey: string; labelKey: string; colorKey?: string }

SunburstChart
  props: { data: TreemapNode[]; valueKey: string; labelKey: string }

HeatmapChart
  props: { data: ChartData[]; xKey: string; yKey: string; valueKey: string; colorScale?: ColorScale }

FunnelChart
  props: { data: ChartData[]; categoryKey: string; valueKey: string; orientation?: 'vertical' | 'horizontal' }

SankeyChart
  props: { data: SankeyData; nodeKey: string; linkKey: string }

GaugeChart
  props: { value: number; min?: number; max?: number; segments?: GaugeSegment[] }

WaterfallChart
  props: { data: ChartData[]; categoryKey: string; valueKey: string }

ChartContainer
  props: { width?: number | string; height?: number | string; responsive?: boolean; children: ReactNode }

ChartLegend
  props: { position?: 'top' | 'bottom' | 'left' | 'right'; interactive?: boolean }
```

> **Note (v2.1):** Tooltip behaviour is configured through the per-chart
> theme (see `src/theme/buildDesignLabEChartsTheme`) and per-chart
> `formatter` props rather than a standalone `<ChartTooltip>` component.
> The v2 standalone component declaration was an aspiration that never
> shipped; v2.1 removes it from the public surface.

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
