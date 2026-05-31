# Component Selection Guide

Use this decision tree to find the right component for your use case. Each entry links to the relevant component documentation and package.

---

## "I need to display data in a table"

| Requirement                 | Component                                 | Package         |
| --------------------------- | ----------------------------------------- | --------------- |
| Simple read-only table      | `TableSimple`                             | `design-system` |
| Sortable / filterable table | `EntityGridTemplate`                      | `x-data-grid`   |
| Server-side paginated       | `EntityGridTemplate` + `ServerDataSource` | `x-data-grid`   |
| Master-detail (expand row)  | `MasterDetailGrid`                        | `x-data-grid`   |
| Tree / hierarchy            | `TreeDataGrid`                            | `x-data-grid`   |
| Pivot / grouping            | `PivotGrid`                               | `x-data-grid`   |
| Inline cell editing         | `EditableGrid`                            | `x-data-grid`   |

**Quick decision:** If you only need to display a few rows without interactivity, use `TableSimple`. For anything involving filtering, sorting, pagination, or editing, reach for `x-data-grid` components.

### Canonical Grid Decision — Adım 14 PR-4

> **Status:** Accepted · **Scope:** `apps/mfe-reporting` + all new reporting / result-grid screens · **Decision owner:** reporting refactor §7 Adım 14

**Audit note:** the reporting-refactor plan's Adım 14 DoD item 4 ("canonical
grid karar dokümante") was previously reported as delivered via a
non-existent `PR #662` / `ADR-0019` (referenced in the body of merged
PR #524). No such PR or ADR exists. This section is the actual DoD
item 4 closure — no new numbered ADR is created.

**The two grid layers are not competitors — they are layered.**

- **`EntityGridTemplate`** (`packages/design-system/src/advanced/data-grid/EntityGridTemplate.tsx`)
  is the canonical grid implementation. It is the "main public API for
  grid consumers": it bundles the toolbar, column variants, pagination,
  server / client datasource modes, export, and accessibility behaviour
  that reporting screens need repeatedly.
- **`@mfe/x-data-grid`** is the grid **package boundary**: its
  `src/index.ts` re-exports `EntityGridTemplate` from design-system and
  adds specialized recipes (`MasterDetailGrid`, `TreeDataGrid`,
  `PivotGrid`, `EditableGrid`) plus composition hooks
  (`useColumnBuilder`, `useGridExport`).

Repo signal (2026-05-31, post PR-A + PR-B): across `apps/` + `packages/`
source, `EntityGridTemplate` / `GridShell` is referenced in dozens of
files and **zero `apps/` files import `ag-grid-react` directly**. The
unified-grid invariant is machine-enforced by the Vitest CI gate (PR-B
`grid-architecture.contract.test.ts`), so any future drift fails CI
instead of code review.

**Decision**

| Context                                         | Canonical choice                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard reporting / result grid                | `EntityGridTemplate`                                                                                                                                          |
| Inside `apps/mfe-reporting`                     | import via the reporting facade `apps/mfe-reporting/src/grid` (re-exports `EntityGridTemplate` + `normalizeServerSideRequest` + `buildEntityGridQueryParams`) |
| Read-only mini-table inside `renderDashboard()` | `GridShell` (toolbar / variant intentionally absent) via `@mfe/design-system/advanced/data-grid`                                                              |
| Cross-package consumer                          | `@mfe/x-data-grid` public exports — package internals only; **not** consumable from `apps/mfe-reporting/**`                                                   |
| Master-detail / tree / pivot / inline-edit      | the matching `x-data-grid` recipe (`MasterDetailGrid` / `TreeDataGrid` / `PivotGrid` / `EditableGrid`) configured through `GridShell`                         |
| Raw `AgGridReact` from `ag-grid-react`          | **YASAK in `apps/`.** Only legitimate locations: `packages/design-system/src/advanced/data-grid/**` (the wrapper itself) and `packages/x-data-grid/**`        |

**Enforcement**

- IDE / dev-time: ESLint `no-restricted-syntax` rule
  (`eslint.config.mjs:220-296`) reports the import as `error`. Root lint
  step in `ci-web-check.yml:41` swallows lint failures (`|| echo "Lint
warnings tolerated"`), so this layer is advisory only.
- CI hard gate: `pnpm --filter mfe-reporting run test:grid-contract`
  (`apps/mfe-reporting/src/__tests__/grid-architecture.contract.test.ts`)
  — Vitest source-AST scan catches static `import`, dynamic `import()`,
  `require()`, re-export (`export ... from`), and TypeScript
  `import = require()` forms.
- Escape hatch: `apps/mfe-reporting/src/__tests__/grid-architecture-
exceptions.json` — CODEOWNERS-gated, schema-validated (path, kind,
  reason ≥ 20 chars, owner @user / @org/team, expiresAt ISO date NOT
  in past). Empty as of 2026-05-31.

**Historical note — retired exceptions**

Two reporting modules previously mounted `AgGridReact` directly:

- `apps/mfe-reporting/src/modules/hr-compensation-report/CompensationDashboard.tsx`
  — chart-summary mini-tables. Migrated to `GridShell` in PR #711
  (commit `e7048944`) on 2026-05-31 (Codex thread `019e7f8f`
  cross-AI plan-time consensus); browser-verified live on testai.
- `apps/mfe-reporting/src/modules/context-health/grids/GridTabPanel.tsx`
  — observability debug grids. Migrated to `GridShell` earlier (Codex
  thread `019e2f86`); the only `ag-grid-react` import surviving in
  reporting was the bootstrap Enterprise-license comment in
  `apps/mfe-reporting/src/app/bootstrap.tsx`, which is a comment, not
  a grid mount.

Both exceptions are retired. The full canonical contract lives in
[`docs/architecture/grid-rendering.md`](../../architecture/grid-rendering.md).

---

## "I need charts"

| Requirement              | Component                             | Package    |
| ------------------------ | ------------------------------------- | ---------- |
| Single bar / line / pie  | `BarChart` / `LineChart` / `PieChart` | `x-charts` |
| Dashboard with KPIs      | `KPICard` + `ChartDashboard`          | `x-charts` |
| Inline sparkline         | `SparklineChart`                      | `x-charts` |
| Interactive (zoom / pan) | Use `useChartInteractions` hook       | `x-charts` |
| Real-time streaming data | Use `useRealTimeData` hook            | `x-charts` |
| Funnel / waterfall       | `FunnelChart` / `WaterfallChart`      | `x-charts` |

**Quick decision:** Start with the named chart component for your visualization type. Add interaction hooks only when the user needs to explore the data.

---

## "I need a form"

| Requirement                  | Component                                                   | Package          |
| ---------------------------- | ----------------------------------------------------------- | ---------------- |
| Simple form (few fields)     | Design-system form primitives (`TextField`, `Select`, etc.) | `design-system`  |
| Schema-driven form           | `FormRenderer`                                              | `x-form-builder` |
| Multi-step wizard            | `MultiStepForm`                                             | `x-form-builder` |
| Zod validation               | `useZodForm` hook                                           | `x-form-builder` |
| Conditional field visibility | `useConditionalLogic` hook                                  | `x-form-builder` |
| Drag-and-drop form designer  | `FormDesigner`                                              | `x-form-builder` |

**Quick decision:** For fewer than 5 fields, use design-system primitives directly. For dynamic or configurable forms, use `x-form-builder`.

---

## "I need rich text editing"

| Requirement                            | Component                    | Package    |
| -------------------------------------- | ---------------------------- | ---------- |
| Basic formatting (bold, italic, lists) | `RichTextEditor`             | `x-editor` |
| Slash commands (`/heading`, `/image`)  | `SlashCommandMenu` extension | `x-editor` |
| @mentions                              | `MentionList` extension      | `x-editor` |
| Collaborative editing                  | `CollaborativeEditor`        | `x-editor` |
| Markdown source mode                   | Toggle via `useEditorMode`   | `x-editor` |

**Quick decision:** Always start with `RichTextEditor` and add extensions as needed. Extensions are tree-shakeable.

---

## "I need task / project management"

| Requirement         | Component                | Package    |
| ------------------- | ------------------------ | ---------- |
| Kanban board        | `KanbanBoard`            | `x-kanban` |
| With swimlanes      | `KanbanSwimlane`         | `x-kanban` |
| With column metrics | `KanbanMetrics`          | `x-kanban` |
| Drag-and-drop cards | Built into `KanbanBoard` | `x-kanban` |

---

## "I need a calendar / scheduler"

| Requirement                      | Component            | Package       |
| -------------------------------- | -------------------- | ------------- |
| Event calendar (day/week/month)  | `Scheduler`          | `x-scheduler` |
| Agenda / list view               | `AgendaView`         | `x-scheduler` |
| Resource booking (rooms, people) | `ResourceView`       | `x-scheduler` |
| Timeline (Gantt-style)           | `TimelineView`       | `x-scheduler` |
| Recurring events                 | `useRecurrence` hook | `x-scheduler` |

---

## "I need a full page template"

| Requirement        | Component               | Package  |
| ------------------ | ----------------------- | -------- |
| Dashboard page     | `DashboardPageTemplate` | `blocks` |
| CRUD list + detail | `CrudPageTemplate`      | `blocks` |
| Settings page      | `SettingsPageTemplate`  | `blocks` |
| Custom composition | `PageBuilder`           | `blocks` |
| Login / auth pages | `AuthPageTemplate`      | `blocks` |

**Quick decision:** Use a page template when starting a new route. Customize via slot props rather than building from scratch.

---

## Cross-Cutting Concerns

| Concern             | Solution                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| Theming / dark mode | All components respect `ThemeProvider` tokens                                   |
| i18n / localization | Pass locale via `I18nProvider`; all labels accept translation keys              |
| Accessibility       | Every component ships with ARIA roles and keyboard navigation                   |
| Server components   | Data-fetching wrappers are RSC-compatible; interactive parts use `"use client"` |
| Performance         | Heavy components (`DataGrid`, `Scheduler`) lazy-load by default                 |
