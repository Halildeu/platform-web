# Bundle Margin Report (a11y-pr1 follow-up)

> **Why this document:** Codex's plan-time verdict review (2026-05-04)
> flagged that x-charts gzip bundle is **at 3.47% of its hard threshold**.
> Generic "let's optimize the bundle" is fake work; this report is the
> evidence base for deciding **whether** optimization is needed and
> **which lever** to pull when the next size-bumping feature lands.
>
> **Scope:** x-charts (deep, hard-blocking gate) + design-system
> (budget table, build-when-measured). MFE app bundles are out of scope
> for this report.

---

## §0 Headline numbers (snapshot)

Measured at branch `chore/bundle-margin-report` against pnpm build of
`packages/x-charts/src/index.ts`:

| Metric                             | Bytes (gzip) | Bytes (raw) |
| ---------------------------------- | ------------ | ----------- |
| `wrapperOnly` (ECharts external)   | **59,014**   | 195,019     |
| `contractTotal` (ECharts included) | **345,957**  | 1,044,982   |
| Baseline (committed)               | 343,564      | 1,037,274   |
| Hard threshold                     | **358,400**  | —           |
| **Margin to threshold**            | **12,443**   | —           |
| **% of cap consumed**              | **96.53 %**  | —           |

Source: `node scripts/ci/x-charts-bundle-check.mjs --json`.

> The **`contractTotal` margin is 12,443 gzip bytes — about 12 KB**.
> Every new feature that adds 12 KB of gzipped output to the public
> entry will trip the hard gate. For context, the wave 1-7 + PR3h
> work added ~2.4 KB total — comfortably inside the buffer, but the
> next non-trivial chart (e.g. an interactive matrix viewer or a
> heavy-locale dictionary) would not be.

---

## §1 What sits inside `contractTotal`

`contractTotal` = wrapper code + ECharts core + ECharts charts/components
the wrappers register. React, react-dom, and `@mfe/shared-types` are
external (consumer dedupes them).

Breakdown by source domain (rough, esbuild metafile):

| Domain                                                       | gzip share | What it is                            |
| ------------------------------------------------------------ | ---------- | ------------------------------------- |
| ECharts core + chart modules                                 | ≈ 75 %     | unavoidable; locked by feature parity |
| Locale dictionaries                                          | ≈ 5 %      | ECharts locale + our overrides        |
| x-charts wrappers (15 chart components)                      | ≈ 8 %      | this is where optimization can land   |
| x-charts cross-feature surfaces (toolbar, legend, dashboard) | ≈ 5 %      | shared, hot path                      |
| x-charts utils + helpers                                     | ≈ 4 %      | small contribution                    |
| Other (sanitization, telemetry, axe shim)                    | ≈ 3 %      | small                                 |

The largest movable region is the wrapper layer (≈ 8 % = ~28 KB gzip).
ECharts cannot be shrunk without breaking feature parity; locale
dictionaries cannot shrink without a feature trade-off.

---

## §2 Recent growth trajectory

Tracking the baseline file's `lastUpdated` field plus the commit log:

| Period                                               | Approx. growth (gzip) | Driver                   |
| ---------------------------------------------------- | --------------------- | ------------------------ |
| Faz 21.5 (cross-filter, drill-down)                  | +12 KB                | new wrapper surface      |
| Faz 21.6 (chart taxonomy + 24 enterprise components) | +18 KB                | new wrappers             |
| Faz 21.8 PR-X5/X6 (props sync + adoption matrix)     | <1 KB                 | metadata only            |
| Faz 21.9 (cross-filter wrappers, Stryker)            | +2 KB                 | wrapper polish           |
| Faz 21.10 wave 1-7 (composite responsive)            | +1 KB                 | className expansion only |
| PR3h (callback ref + mock fixture)                   | <1 KB                 | additive prop            |
| Wave 8 visual baseline / D30 runbook (this slice)    | 0                     | docs-only                |

Trajectory: post-Faz-21.6 the curve flattened. Recent waves grew the
bundle by **<3 KB total**, which means the 12 KB headroom should carry
the team through ~3-4 small features at the current pace. **It will not
carry one large new chart family (Sankey/Sunburst/Treemap-class
rewrite) without a buffer expansion.**

---

## §3 When does this become urgent?

Three thresholds to watch:

1. **Threshold breach — contractTotal gzip ≥ 358,400 bytes.** Hard
   block: PR fails CI, merge impossible until threshold is raised
   (manual baseline bump + Codex review) or feature trimmed.
2. **Margin warning — contractTotal gzip ≥ 350,000 bytes (≈ 97.65 % of
   cap).** Soft signal: open this report, audit the wrapper layer,
   start the optimization conversation in advance of the breach.
3. **Wave-level signal — any single PR adding more than ~5 KB gzip to
   the wrapper layer.** Flag it; the burn-down rate should match the
   team's planning cadence.

---

## §4 Optimization levers (ordered by effort × payoff)

These are the actual options if/when bundle growth becomes urgent.

### §4.1 Lazy chart loading (highest payoff)

- Move heavy chart families (Sankey, Sunburst, Treemap, Heatmap with
  visualMap) behind `import()` boundaries so consumers that only render
  Bar/Line/Pie don't pay for them in the initial bundle.
- Effort: 2-3 PRs, breaking change for direct named imports (mitigated
  by re-export shim that returns a Suspense-wrapped component).
- Payoff: ~30-50 KB gzip removed from `contractTotal` initial chunk.

### §4.2 Locale on-demand

- ECharts ships locale dictionaries that load on registration. Today
  we register everything up-front. Switch to `import.meta.glob`
  (Vite-native) so each consumer pulls only the locale(s) it asks for.
- Effort: 1 PR.
- Payoff: ~10-15 KB gzip on `contractTotal`.

### §4.3 Wrapper deduplication

- Inspect wrappers for shared option-builder helpers that landed
  inline. ChartContainer/ChartDashboard/ChartToolbar share theme
  resolution and mobile classNames; some of this is duplicated.
- Effort: 1 PR, low risk.
- Payoff: ~3-5 KB gzip.

### §4.4 Tree-shake hardening (lowest payoff, lowest effort)

- Audit the public `index.ts` for re-exports that pull in named members
  the consumer never uses. Move the rarely-used surfaces (cross-filter
  utilities, drill-down state machine) to subpath exports.
- Effort: 1 PR.
- Payoff: ~2-4 KB gzip.

---

## §5 Design-system bundle budget snapshot

DS ships through tsup → real `dist/`, so margins are budget-based and
measured per-module. The committed budget lives at
`packages/design-system/scripts/ci/bundle-budget.json`:

| Module                       | Budget (KB) | Notes                                 |
| ---------------------------- | ----------- | ------------------------------------- |
| primitives                   | 425         | foundational; rarely shrinks          |
| components                   | 2,140       | largest by far; chart shims live here |
| patterns                     | 255         | medium                                |
| advanced                     | 420         | data grid + filter-builder            |
| internal                     | 215         | access controller, telemetry          |
| utils                        | 50          | tight                                 |
| tokens                       | 40          | tight                                 |
| icons                        | 120         | shared                                |
| theme                        | 170         | medium                                |
| providers                    | 25          | tight                                 |
| a11y                         | 120         | medium                                |
| lib                          | 100         | tight                                 |
| mcp                          | 100         | tight                                 |
| performance                  | 810         | medium-large                          |
| catalog                      | 200         | medium                                |
| legacy                       | 200         | shrinking over time                   |
| **\_root (everything-else)** | **11,000**  | umbrella                              |
| **total_max**                | **15,000**  | aggregate cap                         |

Budgets were set at "current measured + ~20 %" in March 2026; we have
not re-measured since then. **DS-side action item:** at the next
milestone, build DS, run `node scripts/ci/bundle-size.mjs --budget`,
and refresh the comments in `bundle-budget.json` so the 20 % buffer
claim is verifiable.

---

## §6 Explicit non-goals

- **No optimization PR is shipping with this report.** Picking up §4.1
  lazy-loading without a real margin pressure would be premature; the
  PR3h-class refactors needed to land lazy chart loading without
  breaking consumer ergonomics deserve a focused sprint.
- **No DS budget bumps shipping with this report.** The numbers are a
  snapshot — bump only with measured evidence.

---

## §7 Action items (recommended; not blocking)

1. Add a `gzip-trend.json` artifact to `x-charts-bundle-check.mjs`
   output and have CI publish it so future reports can compare points
   on a graph instead of guessing trajectory.
2. At margin-warning threshold (350 KB gzip), open this document and
   pull a §4 lever before the hard gate fires.
3. Re-run the DS-side measurement at the end of the current sprint and
   update §5 with real numbers + buffer percentages.

---

## §8 Reproducibility

Every number in this report can be regenerated:

```bash
# x-charts (this is the hard gate)
node scripts/ci/x-charts-bundle-check.mjs --json

# DS budget config
cat packages/design-system/scripts/ci/bundle-budget.json

# DS measurement (requires `dist/`; run after `pnpm --filter @mfe/design-system build`)
node packages/design-system/scripts/ci/bundle-size.mjs --budget --json
```

The baseline file at `packages/x-charts/.bundle-baseline.json` records
the committed reference point; CI compares against it on every PR.
