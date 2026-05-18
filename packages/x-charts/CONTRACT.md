# @mfe/x-charts — API Contract v2.2

## Status: ACTIVE | Date: 2026-04-30

> **Engine:** Apache ECharts 5.x (primary). AG Charts Community used only for grid-linked
> embedded charts via `@mfe/x-data-grid`. Decision: `decisions/topics/chart-viz-engine-selection.v1.json`
>
> **v2.1 → v2.2 changes (Faz 21.5 + Faz 21.6 cycle, 2026-04-30+):**
>
> - **§1.1 "Common chart wrapper props" added.** All 13 canonical chart
>   wrappers now share opt-in `theme | decal | density | accent` props
>   (default `'auto'`) backed by `useChartTheme()` and a singleton
>   reactive store (Faz 21.5-A2/A3 + B3b). Backward compat: defaults are
>   identity → existing consumers see pixel-perfect identical output.
> - **§2 Density Support erratum.** v2.1 listed `spacious` as a third
>   density value, but the actual implementation in `theme/density-helpers.ts`
>   only accepts `comfortable | compact` (Faz 21.5-A3 + Codex iter-7..10
>   AGREE). v2.2 corrects the documented values to match shipped code.
> - **§N "Taxonomy & Boundaries" added (Faz 21.6 PR-D).** Canonical chart
>   catalogue, legacy duplicates (DS shim layer scope), composite/utility
>   wrappers (excluded from scorecard audit), and DS-only enterprise chart
>   migration roadmap (Faz 21.7+).
> - **Default-on a11y formalised.** ChartA11yShell + useChartA11y composer
>   (Faz 21.5-B1/B2) now part of the public chart wrapper invariant.
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

### 1.0 WHY no standalone `ChartTooltip` wrapper (v2.1 decision, restated by PR-E1 2026-05-03)

CONTRACT v2 (Faz 21.4-A) initially declared a public `ChartTooltip` component
in §1. CONTRACT v2.1 (Faz 21.4-E, 2026-04-30) **removed** that component
because its surface was completely redundant with the existing tooltip
configuration paths:

1. **Per-chart tooltip via ECharts `option.tooltip`.** Every chart wrapper
   already accepts a `valueFormatter` prop and forwards it to the ECharts
   `tooltip.formatter` callback. Themed presentation (background, border,
   font, shadow) is centralised in `buildDesignLabEChartsTheme()`
   (`packages/x-charts/src/theme/DesignLabEChartsTheme.ts`).
2. **Touch-specific tooltip via `MobileTooltip`.** Long-press touch
   interaction routes through `packages/x-charts/src/touch/MobileTooltip.tsx`
   which is already exported from the public barrel.
3. **No cross-chart tooltip composition use case.** The standalone wrapper
   would have offered a third API surface for the same job, with no
   improvement on testability, themability, or accessibility — and would
   have broken the **identity-transform invariant** declared in §1.1
   "Backward compat invariant": adding a wrapper component changes the
   DOM tree without changing user-visible pixels, which is a regression
   smell.

**Future direction (out of scope for this contract):** if the platform ever
needs cross-chart tooltip portal coordination (e.g. shared crosshair across
linked charts in a dashboard), the right place is a `ChartContainer`-level
prop or a portal singleton in `@mfe/x-charts/cross-filter`, NOT a per-chart
component wrapper.

PR-E1 (Faz 21.4) added this rationale here so future contributors and AI
agents do not re-introduce the wrapper based on stale roadmap audit rows.
Tracker entry: `docs/x-charts-ui-ux-tracker.md` (Faz 21.4 cycle).

### 1.1 Common chart wrapper props (v2.2, Faz 21.5 + 21.6 cycle)

All chart wrappers in `@mfe/x-charts` share four opt-in theme/visual
props (default `'auto'`):

| Prop      | Values                                                                                      | Default  |
| --------- | ------------------------------------------------------------------------------------------- | -------- |
| `theme`   | `'auto' \| 'light' \| 'default' \| 'dark' \| 'high-contrast' \| 'print'`                    | `'auto'` |
| `decal`   | `boolean \| 'auto'`                                                                         | `'auto'` |
| `density` | `'auto' \| 'comfortable' \| 'compact'`                                                      | `'auto'` |
| `accent`  | `'auto' \| 'light' \| 'dark' \| 'emerald' \| 'graphite' \| 'ocean' \| 'sunset' \| 'violet'` | `'auto'` |

**Resolution chain (Codex iter-1..14 AGREE):**

- `theme='auto'` → DOM signal priority: `data-appearance` > `data-theme`
  (normalize: `serban-*`, `*-hc`, `*-dark` suffixes) > `data-mode`
  (`light\|dark` only) > `prefers-contrast: more` > `prefers-color-scheme: dark` > `light` default.
  `'print'` is never auto-detected — explicit-only.
- `decal='auto'` → enabled iff resolved theme is `high-contrast` or `print`.
- `density='auto'` → `data-density` attribute (`compact` | `comfortable` default).
- `accent='auto'` → `data-accent` attribute (`'neutral'` alias maps to `'light'`).

**Backward compat invariant:** all defaults are `'auto'` and resolve to
identity transforms when no DOM signals are set → existing consumers see
**pixel-perfect identical output** vs pre-v2.2.

**Implementation:**

- `useChartTheme()` hook in `@mfe/x-charts/theme/useChartTheme`.
- Singleton `MutationObserver` + `matchMedia` listener pair on
  `documentElement` (per-chart observer is forbidden — one shared
  store via `theme/themeReactiveStore`).
- `useSyncExternalStore`-compatible API: `subscribeThemeStore` /
  `getThemeSnapshot` / `getServerThemeSnapshot` (SSR-safe).
- 7-color accent palette dict in `theme/accent-palettes.ts` (Faz 21.5-A2).
- Density multipliers in `theme/density-helpers.ts` with **a11y clamp at 10px**
  (`scaleFontSize(base, mul) = Math.max(10, Math.round(base*mul))`).

**Semantic preservation (Codex iter-13):** Chart-level semantic colors
are accent-IMMUNE:

- `GaugeChart` thresholds (success/warning/danger)
- `HeatmapChart` gradient colors (low/high)
- `WaterfallChart` `increase` (success) and `decrease` (danger) — only
  the `total` color binds to accent primary

The other 10 chart wrappers use `effectivePalette` (from the resolved
accent or the HC/Print theme builder) as the series color fallback.

**Default-on a11y (Faz 21.5-B1/B2):** All chart wrappers compose with
`useChartA11y` + `<ChartA11yShell>` providing:

- `role="region"`, `tabIndex=0`, `aria-describedby` linkage to the hidden data table
- Visually-hidden `<table>` with `<caption>` + `scope="col"` headers (data fallback for screen readers)
- `aria-live="polite"` `role="status"` announcement region
- Keyboard navigation: ArrowLeft/Right/Up/Down + Home/End + Enter/Space + Escape
- ECharts `dispatchAction` sync (highlight/downplay/showTip)

axe-core severity gate (Faz 21.5-B3a): every wrapper passes with **zero
serious/critical violations**.

### Components

> **v2.1 prop-signature realignment (Codex review):** v2 listed an
> idealised `data: ChartData[]` + xKey/yKey/angleKey/etc. shape that
> was never how the wrappers actually shipped. v2.1 below mirrors the
> real exported `*Props` interfaces — see `packages/x-charts/src/<Chart>.tsx`
> for the canonical source.
>
> **v2.2 note:** every wrapper below also accepts the four common props
> from §1.1 (`theme | decal | density | accent`). They are omitted from
> per-chart prop blocks to avoid duplication.

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
    markups?: ChartMarkup[];                       // PR #350 — markup overlay (full)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
    markups?: ChartMarkup[];                       // PR #350 — markup overlay (full)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — cross-filter sweep
    markups?: ChartMarkup[];                       // PR #350 — markup overlay (full)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP (dev warning)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — cross-filter sweep
    markups?: ChartMarkup[];                       // PR #350 — markup overlay (full)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
  }

RadarChart
  props: {
    indicators: RadarIndicator[];                  // required, [{ name, max }]
    series: RadarSeriesItem[];                     // required, [{ name, data }] — data: number[] aligned with indicator order
    size?: 'sm' | 'md' | 'lg';
    shape?: 'polygon' | 'circle';                  // default 'polygon'
    showArea?: boolean;                            // fill area under series
    showLabels?: boolean;                          // axis name labels, default true
    showLegend?: boolean;                          // default false
    splitNumber?: number;                          // concentric rings, default 5
    title?: string;
    animate?: boolean;
    valueFormatter?: (v: number) => string;
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #345 — Radar v2 indicator-level enrichment
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP (Radar indicator anchor v2 backlog)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
  }

TreemapChart
  props: {
    data: TreemapNode[];                           // hierarchical { name, value?, children? }
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    onNodeClick?: (params: { name: string; value: number; data: unknown }) => void; // legacy
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — canonical, fires FIRST then legacy
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP (hierarchical, no x/y axis)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
  }

SunburstChart
  props: {
    data: SunburstNode[];                          // hierarchical
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    onNodeClick?: (params: { name: string; value: number; data: unknown }) => void; // legacy
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — canonical, fires FIRST then legacy onNodeClick
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP (hierarchical)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
    onCellClick?: (params: { x: number; y: number; value: number }) => void; // legacy (numeric indices)
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — canonical, datum: { x, y, xLabel, yLabel, value, label }
    markups?: ChartMarkup[];                       // PR #350 + v2 follow-up — markup overlay (full); LabelMarkup accepts { x, y }, { dataIndex, seriesIndex? } (cell-tuple resolution), or { xLabel, yLabel } shorthand
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
  }

FunnelChart
  props: {
    data: FunnelDataPoint[];                       // [{ name, value }] — name flows through to label/tooltip via formatter
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
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — datum: { label, value, percent, conversionPercent? }
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
  }

SankeyChart
  props: {
    nodes: { name: string }[];
    links: { source: string; target: string; value: number }[];
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    onNodeClick?: (params: { name: string; data: unknown }) => void; // legacy (node-only — edge clicks NEVER fire this)
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — canonical: node click fires FIRST then legacy onNodeClick; edge click fires only this (no legacy)
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP (network, no x/y axis)
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
  }

GaugeChart
  props: {
    value: number;
    min?: number;                                  // default 0
    max?: number;                                  // default 100
    size?: 'sm' | 'md' | 'lg';
    thresholds?: { value: number; color: string }[];
    title?: string;
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — datum: { label, name, value, min, max }
    markups?: ChartMarkup[];                       // PR #350 — accepted, NO-OP
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
    onDataPointClick?: (e: ChartClickEvent) => void; // PR #338 — datum: { label, value, rawValue, type }
    markups?: ChartMarkup[];                       // PR #350 — partial: line/area MERGE with existing connector markLine; base series untouched
    onMarkupClick?: (e: ChartMarkupClickEvent) => void;
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
- 4.5:1 minimum contrast ratio enforced **at the static fallback hex layer** (41 assertions in `chart-contrast.contract.test.ts`, Faz 21.4 PR-F1). Runtime browser CSS-var resolution + canvas pixel ratio gate is **not yet active** — runtime contrast gate is tracked as Faz 21.8 PR-X3b (deferred from this PR cycle; static layer kept the existing assertions intact).

### Density Support

> **v2.2 erratum:** v2.1 listed three density values; the shipped
> implementation in `theme/density-helpers.ts` only accepts two. The
> third value (`spacious`) is removed in v2.2.

- `compact` — fontSize ×0.875, spacing ×0.75, padding ×0.75 (a11y clamp at 10px floor)
- `comfortable` — default (fontSize ×1.0, spacing ×1.0, padding ×1.0)

Resolution chain: explicit `density` prop > `data-density` attribute on
documentElement > `'comfortable'` default. See §1.1 for the full opt-in
prop surface.

## 3. Access Control — ACTIVE (v2.3, Faz 21.4 PR-E2)

> **Status (v2.3, 2026-05-03):** ACTIVE. All chart wrappers now extend
> `AccessControlledProps` and accept `access` / `accessReason`
> props at runtime via `<ChartAccessGate>` (PR-E2 #166). The shape
> below is the canonical surface; default `access === undefined`
> follows the identity-transform path (zero DOM wrapper). For
> permission lookups, use `useZanzibarAccessProps` from `@mfe/auth`
> (PR-E2) which adapts `useZanzibarAccess` results into this shape.

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

### Subpath strategy (Faz 21.8 PR-X2)

Three package entry points:

| Subpath                | Purpose                                                                                                                                                                                                                                      | RSC-safe?                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `@mfe/x-charts`        | Default barrel — back-compat for current Vite consumers, re-exports everything from the workspace root                                                                                                                                       | No (mixed)                                                |
| `@mfe/x-charts/client` | All chart wrappers + composites (`ChartContainer`, `ChartDashboard`, `KPICard`, `StatWidget`, `ChartLegend`, `ChartToolbar`, `MiniChart`, `SparklineChart`). Every leaf carries `'use client'` at the top of the file plus the barrel itself | **No** — must be imported from a client component         |
| `@mfe/x-charts/ssr`    | Public types (chart props, cross-filter / drill-down types, AccessControlledProps) + theme tokens. **No runtime React components.**                                                                                                          | **Yes** — safe to import from any RSC / Node-only context |

### Client-Only (`'use client'`)

- ECharts canvas/SVG rendering engine
- All interactive features: tooltips, legend toggle, zoom, pan
- Resize observer and responsive recalculation
- Every chart wrapper file (`AreaChart.tsx` … `WaterfallChart.tsx`) starts
  with `'use client';` so individual deep imports stay safe in RSC trees.

### Hydration Strategy

- SSR renders a sized placeholder `<div>` matching chart dimensions
- ECharts instance mounts on client, renders into placeholder
- The boundary is verified by a smoke test
  (`packages/x-charts/src/__tests__/ssr-boundary.test.ts`) which asserts
  `@mfe/x-charts/ssr` carries no runtime React components and every chart
  wrapper has `'use client'` as its first statement.

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
- CI gate enforces bundle limit (PR-F2 active; HARD on contractTotal incl. ECharts via esbuild source analyze, observability on wrapperOnly; baseline at `packages/x-charts/.bundle-baseline.json`)

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

PR-F (Faz 21.4) closes the 8 chart-CI gates listed below. The 9th item
(`component-scorecard`) is a separate workflow that landed earlier in
Faz 21.6 PR-A; PR-F's "8/8" target intentionally excludes it.

PR-F1 activated 7/8 (chart-spec, xss, memory, axe, contrast, tree-shake,
visual). PR-F2 activates the 8th (bundle) — **8/8 gates now HARD-block**.

- **bundle-size-check** (< 350KB gzip HARD on `contractTotal` including
  ECharts; soft observability on `wrapperOnly`. Esbuild source analyze
  via `scripts/ci/x-charts-bundle-check.mjs`; baseline at
  `packages/x-charts/.bundle-baseline.json`. Threshold:
  `min(350KB, baseline × 1.2)`. Manual rotate via `--update-baseline`
  flag + commit; CI NEVER auto-rotates the baseline. PR-F2 — ACTIVE.)
- **a11y-axe-audit** (zero serious/critical violations; `chart-axe.test.tsx`
  with `color-contrast` rule disabled because jsdom cannot resolve CSS
  variables. The PR-F1 contrast gate below covers ONLY the CSS-absent
  static fallback theme-object layer. Runtime browser/OKLCH token
  contrast is a separate Playwright follow-up — PR-F1)
- **contrast-ratio-check** (STATIC fallback theme-object text/control
  4.5:1 across 5 themes × 7 surfaces in `chart-contrast.contract.test.ts`.
  This does NOT measure runtime shell `theme.css` / `oklch(...)` token
  resolution — that requires a real browser and is a planned Playwright
  follow-up. The fallback layer is what consumers see during initial
  paint flash, in Storybook standalone, and in snapshot tools when CSS
  hasn't loaded. Series-palette adjacency NOT gated by ratio math —
  see `chart-theme-decal.test.tsx` for HC structural fallback — PR-F1)
- **xss-sanitization-check** (`security.contract.test.tsx` — already active)
- **memory-leak-test** (100-cycle mount/unmount; `memory-leak.test.tsx`
  — already active)
- **chart-spec-validation** (`spec-transform.contract.test.tsx` — already
  active)
- **visual-regression** (`x-charts-visual-gate.yml` workflow,
  `maxDiffPixelRatio: 0.02` HARD; file renamed from `-visual-advisory`
  in PR-F1 to reflect actual hard-block behaviour)
- **tree-shaking-verify** (descriptor-driven `verify-tree-shaking.mjs`;
  x-charts uses `mode: 'source'` with `sideEffects` allowlist for
  `./src/i18n/locale-store.ts` and CSS — PR-F1)

Adjacent CI workflow (CONTRACT §8 9th item, separate from PR-F's 8):

- **component-scorecard** (Faz 21.6 PR-A: multi-package scan,
  x-charts 13 chart audit) — `scorecard-gate.yml`, already active.

`x-charts-quality-gates.yml` also runs a `chart-component-baseline` job
covering smoke + options-shape + access-contract tests as a PR-D
regression guard. That job is NOT one of PR-F's 8 gates — it's a
defensive layer below the contract gates above.

## 9. Taxonomy & Boundaries (v2.2, Faz 21.6 PR-D)

### Canonical chart catalogue (13 wrappers)

`Bar`, `Line`, `Area`, `Pie`, `Scatter`, `Gauge`, `Radar`, `Treemap`,
`Heatmap`, `Waterfall`, `Funnel`, `Sankey`, `Sunburst` — all in
`packages/x-charts/src/<Name>Chart.tsx`. These are the canonical chart
types audited in `scorecard.json` (component-scorecard.mjs SCAN_PACKAGES
allowlist deterministic 13).

### Legacy duplicates (DS shim layer in PR-C)

9 chart names live in `@mfe/design-system` but `@mfe/x-charts` is the
canonical source of truth (Codex iter-19 absorb):

| Chart          | DS path                           | Status (scorecard.json)                             |
| -------------- | --------------------------------- | --------------------------------------------------- |
| BarChart       | `components/charts/BarChart.tsx`  | `legacy`, replacedBy `@mfe/x-charts/BarChart`       |
| LineChart      | `components/charts/LineChart.tsx` | `legacy`, replacedBy `@mfe/x-charts/LineChart`      |
| AreaChart      | `components/charts/AreaChart.tsx` | `legacy`, replacedBy `@mfe/x-charts/AreaChart`      |
| PieChart       | `components/charts/PieChart.tsx`  | `legacy`, replacedBy `@mfe/x-charts/PieChart`       |
| FunnelChart    | `enterprise/FunnelChart.tsx`      | `legacy`, replacedBy `@mfe/x-charts/FunnelChart`    |
| GaugeChart     | `enterprise/GaugeChart.tsx`       | `legacy`, replacedBy `@mfe/x-charts/GaugeChart`     |
| RadarChart     | `enterprise/RadarChart.tsx`       | `legacy`, replacedBy `@mfe/x-charts/RadarChart`     |
| TreemapChart   | `enterprise/TreemapChart.tsx`     | `legacy`, replacedBy `@mfe/x-charts/TreemapChart`   |
| WaterfallChart | `enterprise/WaterfallChart.tsx`   | `legacy`, replacedBy `@mfe/x-charts/WaterfallChart` |

PR-C scope (DS shim + codemod): re-export DS chart wrappers from
`@mfe/x-charts` with deprecation JSDoc + dev-only `console.warn`,
then jscodeshift codemod to migrate consumers (mfe-shell widgets etc.).

### Composite & utility wrappers (in `@mfe/x-charts`, outside the 13-chart audit)

`MiniChart`, `SparklineChart`, `CrossFilterChart`, `ChartContainer`,
`ChartDashboard`, `ChartLegend`, `ChartToolbar`, `KPICard`, `StatWidget`
— scaffolding around the 13 canonicals, not chart types themselves.
Excluded from `scorecard.json` audit (deterministic 13-chart allowlist).
May be promoted to canonical status in future minor versions if the
catalogue grows.

### DS-only enterprise chart candidates (Faz 21.7+ migration scope)

| Chart          | DS path                                     | x-charts plan | Decision                                                                                |
| -------------- | ------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| BulletChart    | `blocks/bullet-chart/BulletChart.tsx`       | candidate     | migrate as `BulletChart` in Faz 21.7                                                    |
| ControlChart   | `blocks/control-chart/ControlChart.tsx`     | candidate     | migrate as `ControlChart` in Faz 21.7                                                   |
| HistogramChart | `blocks/histogram-chart/HistogramChart.tsx` | candidate     | migrate as `HistogramChart` in Faz 21.7                                                 |
| ParetoChart    | `blocks/pareto-chart/ParetoChart.tsx`       | candidate     | migrate as `ParetoChart` in Faz 21.7                                                    |
| MicroChart     | `blocks/micro-chart/MicroChart.tsx`         | consolidate   | superseded by `MiniChart` + `SparklineChart` in `@mfe/x-charts`; deprecate in PR-C      |
| OrgChart       | `blocks/org-chart/OrgChart.tsx`             | OUT-OF-SCOPE  | hierarchy visualization, not a chart type. Future `@mfe/hierarchy-viz` package proposal |

### Runtime Dependency Boundary (Faz 21.6 PR-C0)

`@mfe/x-charts` MUST NOT import `@mfe/design-system` at runtime. Chart
wrappers are the canonical implementation layer; design-system chart
entries may depend on `@mfe/x-charts` as legacy shims (PR-C1/PR-C2),
but the dependency direction must not be reversed.

Small visual helpers consumed by x-charts (`cn`, internal `Text`,
internal `Spinner`) live locally in `packages/x-charts/src/utils` and
`packages/x-charts/src/components` so the package graph stays acyclic.
These are intentionally NOT exported from the public root barrel
(`src/index.ts`) — they are implementation details of x-charts.

Verification (CI gate suggestion):

```bash
rg "@mfe/design-system" packages/x-charts/src   # must be 0 hits
npx madge --circular packages/x-charts/src      # must be 0 cycles
```

### ChartMarkup Overlay Layer (PR #350 — Highcharts annotation parity)

> **Full consumer guide:** [`docs/markup-overlay.md`](../../docs/markup-overlay.md)
> — type catalog, support matrix per chart, click-vs-data dispatch,
> AI overlay hooks (`useTrendOverlay` / `useAnomalyOverlay`), perf
> gates, and v2 backlog. The §1 prop blocks above already list
> `markups` + `onMarkupClick` per chart for quick API reference;
> this section keeps the architectural summary.

Every chart shim above accepts two ADDITIONAL public props on top of
its existing surface — wired uniformly via `useMarkupAdapter` +
`mergeMarkupPatches`:

```ts
markups?: ChartMarkup[];
onMarkupClick?: (event: ChartMarkupClickEvent) => void;
```

`ChartMarkup` is a discriminated union (`type: 'line' | 'segment' |
'area' | 'point' | 'label'`) re-exported from `@mfe/x-charts` root
along with `ChartMarkupClickEvent`, `BaseMarkup`, the per-variant
shapes (`LineMarkup`, `SegmentMarkup`, `AreaMarkup`, `PointMarkup`,
`LabelMarkup`), the pure adapter (`adaptToEcharts`,
`DEFAULT_SUPPORT_MATRIX`, `mergeMarkupPatches`), and the AI overlay
helpers (`computeTrendOverlay` / `useTrendOverlay`,
`computeAnomalyOverlay` / `useAnomalyOverlay`).

Distinct from two pre-existing `Annotation` surfaces in the package
(spec-level `ChartAnnotation` in `spec/ChartSpec.ts`; collaboration
`Annotation` in `collaboration/chart-annotations.ts`) — Codex iter-1
absorb (thread `019e0df1`).

Support matrix (Codex iter-3 contract — 5 full + 1 partial + 7 no-op):

| Chart                                                      |   line   | segment |   area   | point  | label  |
| ---------------------------------------------------------- | :------: | :-----: | :------: | :----: | :----: |
| BarChart, LineChart, AreaChart, ScatterChart, HeatmapChart |   full   |  full   |   full   |  full  |  full  |
| WaterfallChart                                             | partial¹ |  full   | partial¹ |  full  |  full  |
| PieChart, GaugeChart, RadarChart, FunnelChart              |  no-op²  | no-op²  |  no-op²  | no-op² | no-op² |
| TreemapChart, SankeyChart, SunburstChart                   |  no-op³  | no-op³  |  no-op³  | no-op³ | no-op³ |

¹ Waterfall: connector `markLine` data items now carry per-endpoint
`silent: true`; user markups append on the SAME `markLine` and
keep their default clickable behaviour. `__waterfall_base__`
series stays untouched.
² Non-cartesian (Pie/Gauge/Funnel) and polar (Radar) — adapter
emits a dev warning and routes nothing through ECharts. Native
series-label patches + Radar indicator anchor are v2 backlog.
³ Hierarchical / network charts — no x/y axis semantics; markup
layer intentionally returns no patches and surfaces a dev
warning.

`LabelMarkup.anchor` accepts three variants:

1. `{ x, y }` — explicit data coordinate (any chart, any axis type).
2. `{ dataIndex, seriesIndex? }` — resolved against the chart shim's
   `dataContext`. Cartesian charts (Bar single-series / Line / Area)
   read `labels[i]` + `series[s].data[i]`. **Heatmap** is now also
   supported: the shim feeds `dataContext.series[0].data[i]` as the
   cell-tuple `{ x: <xCat>, y: <yCat>, value }`, so the resolver
   hands `[xCat, yCat]` directly to ECharts (closes Codex thread
   `019e0e20` iter-2 v2 backlog).
3. `{ xLabel, yLabel }` — Heatmap-friendly categorical shorthand
   that bypasses `dataContext` entirely. Use when the consumer
   already knows the cell labels and wants a one-liner anchor. The
   adapter forwards `[xLabel, yLabel]` to ECharts unchanged; whether
   the chart can render it is up to the underlying coordinate
   system (numeric axis + string label = ECharts mismatch).
