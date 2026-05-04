# mfe-reporting Chart Shell Audit (a11y-pr1 follow-up)

> **Why this document:** Codex's plan-time review (2026-05-04) flagged
> that the original "mfe-reporting composite adoption düşük" claim was
> too coarse. Real finding: mfe-reporting uses x-charts atomic charts
> heavily but **almost none of the wave 1-7 composite primitives**.
> Local `ChartCard` and `KPICard` shells live in two HR reporting
> modules and ignore the responsive contract that ships in
> `@mfe/x-charts/{ChartContainer,KPICard}`. This document captures
> what is actually drift-prone and what migration would cost.
>
> **Scope:** mfe-reporting only. Other MFE adoption is tracked by the
> auto-generated `docs/x-charts-adoption-matrix.{md,json}`.

---

## §0 Headline finding

mfe-reporting has **two production-grade local chart-shell wrappers**
that re-implement what `@mfe/x-charts` already provides:

1. **`CompensationDashboard.tsx` — local `KPICard`** (line 86)
   - File: `apps/mfe-reporting/src/modules/hr-compensation-report/CompensationDashboard.tsx`
   - Used: 1 site (line 555, in a `kpis.map(...)` row)
   - Inherits from x-charts? **No.** Builds its own `<div className={cardClass}>`
     with inline padding/typography. Does not pick up wave 2 mobile
     padding (`p-3 sm:p-5`) or wave 2 value font (`text-xl sm:text-2xl`).

2. **`DemographicDashboard.tsx` — local `ChartCard`** (line 83)
   - File: `apps/mfe-reporting/src/modules/hr-demographic-report/DemographicDashboard.tsx`
   - Used: **53 sites** across the dashboard
   - Inherits from x-charts? **No.** Inline `<div style={{ padding: 20, borderRadius: 12, ... }}>`
     with hard-coded numbers. Does not pick up:
     - wave 2 ChartContainer header (`px-3 py-2 sm:px-5 sm:py-3`)
     - wave 2 title truncate
     - wave 2 actions slot shrink-0
     - wave 4 actions slot mobile shrink/wrap
     - wave 7 ChartLegend mobile gap

The `<KPICard>` JSX entries from `@mfe/x-charts` (8 total) all live
elsewhere — `CompensationDashboard.tsx:555` (1 — that's the local one
shadowing the import), `DemographicDashboard.tsx:1088-1113` (6, real
@mfe/x-charts KPICard), and `visualization/ChartRenderer.tsx:186`
(1). Composite ratio is therefore "atomic charts everywhere, real
@mfe/x-charts composites in 7 places, two local wrappers everywhere
else."

This matches the corrected Codex framing: it's not a global adoption
problem, it's a **local-shell-wrapper drift problem** in two specific
HR reporting files.

---

## §1 What the local wrappers cover

### §1.1 `CompensationDashboard.tsx` local `KPICard`

```tsx
const KPICard: React.FC<{ kpi: DashboardKPI; onClick?; active? }> = ({ kpi, onClick, active }) => {
  // …toneClass, trendIcon, interactiveClass, activeClass…
  return (
    <div
      className={`${cardClass} flex flex-col gap-1 …`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="text-xs text-text-subtle truncate">{kpi.title}</span>
      <span className={`text-lg font-semibold ${toneClass}`}>{value}</span>
      {kpi.trend && (
        <span className="text-xs">
          {trendIcon} {percent}
        </span>
      )}
    </div>
  );
};
```

Drift vs `@mfe/x-charts/KPICard`:

- value font: `text-lg` (locked) vs the wave 2 `text-xl sm:text-2xl`
  responsive primitive.
- padding: comes from `cardClass` constant (single value) vs the
  wave 2 `p-3 sm:p-5` mobile-first split.
- trend signal: arrow + percent string vs x-charts `<KPICardTrend>`
  with semantic color tokens.
- click handler accessibility: handles Enter/Space manually, but
  `aria-label` is missing — x-charts KPICard auto-derives one from
  title + value.

### §1.2 `DemographicDashboard.tsx` local `ChartCard`

```tsx
const ChartCard: React.FC<{ title; children; span?; }> = ({ title, children, span = 1 }) => (
  <div
    style={{
      gridColumn: `span ${span}`,
      padding: 20,
      borderRadius: 12,
      border: '1px solid var(--border-subtle)',
      background: 'var(--surface-default)',
    }}
  >
    <h3 style={{ fontSize: 14, fontWeight: 600, …}}>{title}</h3>
    {children}
  </div>
);
```

Drift vs `@mfe/x-charts/ChartContainer`:

- inline `style` instead of Tailwind classes — completely escapes the
  wave 2 `px-3 py-2 sm:px-5 sm:py-3` responsive header.
- no `actions` slot, no description slot, no `loading|error|empty`
  state placeholders that ChartContainer exposes.
- header is `<h3>` with hard-coded font size/weight; ChartContainer
  uses `<Text variant>` so dark theme + token swap inherit.
- no min-w-0 / truncate on title — long title pushes content offscreen
  on a 375px viewport.
- 53 call sites means a single regression here is amplified across
  the whole demographic dashboard.

---

## §2 Migration sketch (out of scope for this PR)

The audit ships separately from any migration. Sketching the move so
the next sprint has an actionable plan:

### §2.1 `CompensationDashboard.tsx` → `@mfe/x-charts/KPICard`

Estimated effort: 1 PR, 1-2h, low risk.

```tsx
// before
<KPICard kpi={kpi} onClick={…} active={…} />

// after — using @mfe/x-charts public KPICard
import { KPICard as XKPICard } from '@mfe/x-charts';

<XKPICard
  title={kpi.title}
  value={formatValue(kpi.value, kpi.format)}
  trend={kpi.trend ? {
    direction: kpi.trend.direction,
    value: `${kpi.trend.percentage > 0 ? '+' : ''}${kpi.trend.percentage}%`,
    positive: kpi.trend.direction === 'up',
  } : undefined}
  onClick={onClick}
  className={active ? 'ring-2 ring-action-primary' : undefined}
/>
```

Risk surface: cross-filter `active` state. Local wrapper renders a
ring around active KPIs; x-charts KPICard's `className` prop merges
into the root, so this should compose cleanly.

Caveat: `kpi.benchmark?.label` rendering happens inside the local
KPICard (line 129). x-charts KPICard does not expose a benchmark
slot. Either pass it via `subtitle` (lossy — flattens label) or
extend x-charts KPICard with an explicit `benchmark` slot in a
separate sprint.

### §2.2 `DemographicDashboard.tsx` → `@mfe/x-charts/ChartContainer`

Estimated effort: 1 PR, 2-3h, medium risk.

```tsx
// before
<ChartCard title="Cinsiyet Dagilimi">
  <SVGPie data={genderDist} />
</ChartCard>;

// after
import { ChartContainer } from '@mfe/x-charts';

<ChartContainer title="Cinsiyet Dagilimi" height={320}>
  <SVGPie data={genderDist} />
</ChartContainer>;
```

Risk surface: `span` prop. Local wrapper does `gridColumn: span N`;
x-charts ChartContainer doesn't accept span — it's the parent grid's
job. This means migration also has to either:

- Wrap the ChartContainer in a styled span div, or
- Move the dashboard from inline grid to `<ChartDashboard>` which
  already understands span via `<ChartDashboard.Item span={N}>`.

The second option is the cleaner end state and would let the
demographic dashboard inherit wave 2 per-breakpoint columns + wave 7
mobile gap automatically.

Test surface: the demographic dashboard has no test file today (per
mfe-reporting policy of leaning on Playwright at the gate level).
Migration risk is therefore **visual-regression-bound** — adding
this dashboard's two largest screens to the visual fixture before
migrating would be a sensible safety net.

---

## §3 What is NOT broken

Things this audit checked and intentionally found _no_ issue with:

- `ChartRenderer.tsx` (line 186) uses real `<KPICard>` with
  title/value props. Fine.
- The 6 `<KPICard>` calls in `DemographicDashboard.tsx` (line 1088
  cluster) all use real `@mfe/x-charts/KPICard`. Fine.
- Atomic chart usage (`<BarChart>`, `<LineChart>`, `<PieChart>`,
  etc.) is the dominant pattern and **is the right tool** for raw
  chart rendering — composite primitives are for layout/shell, not
  for replacing the chart itself.

The audit's only target is the two local wrappers in §1.

---

## §4 Recommended next steps

1. **Visual fixture coverage first.** Before touching either local
   wrapper, add the two HR dashboard pages to a Playwright visual
   fixture (mobile-pixel5 + desktop). This locks the current pixels
   so migration drift is caught on PR review.
2. **CompensationDashboard KPICard migration** (small PR, §2.1
   sketch). Easy win that recovers wave 2 KPICard mobile primitives
   for the comp dashboard.
3. **DemographicDashboard ChartCard → ChartDashboard.Item migration**
   (medium PR, §2.2 sketch). Bigger payoff, larger blast radius;
   visual fixture from step 1 is the regression net.
4. **Optional: x-charts KPICard `benchmark` slot extension.** Only
   if the migration in step 2 needs lossless benchmark rendering and
   the team agrees the slot belongs in the public KPICard API.

---

## §5 Reproducibility

Every claim in this report is grep-able:

```bash
# Composite x-charts usage in mfe-reporting
grep -rEn '<(KPICard|ChartContainer|ChartDashboard|SparklineChart|StatWidget|ChartLegend)' \
  apps/mfe-reporting/src --include='*.tsx'

# Local wrappers shadowing the x-charts primitives
grep -n "^const KPICard\|^const ChartCard" \
  apps/mfe-reporting/src/modules/hr-compensation-report/CompensationDashboard.tsx \
  apps/mfe-reporting/src/modules/hr-demographic-report/DemographicDashboard.tsx

# Drift quantification: how many call sites of each local wrapper
grep -c 'ChartCard' \
  apps/mfe-reporting/src/modules/hr-demographic-report/DemographicDashboard.tsx
```

Numbers as of audit run (commit at branch tip):

```
Local KPICard call sites:    1 (CompensationDashboard.tsx:555)
Local ChartCard call sites: 53 (DemographicDashboard.tsx)
Real @mfe/x-charts/KPICard:  8 (across 3 files)
```
