# Grid Rendering Contract

> **Authority**: This document is the source-of-truth for how data grids
> render across `apps/mfe-reporting` and other catalog reports.
> **Owner**: Halildeu (Codex thread `019e7f8f` cross-AI plan-time
> consensus, 2026-05-31).
> **Enforcement baseline**: PR-A removed the last catalog-app raw
> `AgGridReact` usage (CompensationDashboard mini-tables); PR-B added
> the hard Vitest grid-architecture contract gate; live testai
> smoke verified CompensationDashboard mini-tables render through
> `GridShell` with no row-group panel or floating-filter chrome leaks.

## Source of Truth — canonical paths

### Standard catalog report (grid)

```text
ReportingApp → ReportPage → EntityGridTemplate → GridShell → AgGridReact
```

- Every dynamic report and every static `ReportModule` with a
  `getColumnMeta`-shaped grid follows this chain.
- `ReportPage` is a single shared shell at `apps/mfe-reporting/src/app/reporting/ReportPage.tsx`; the shell's source comment line 161 explicitly states: _"Both dynamic and static reports use the same ReportPage skeleton"_.

### Backend dashboard catalog entry (no grid)

```text
ReportingApp → DashboardPage
```

- Grid path: **none**.
- Reserved for dashboard-only catalog entries fed by the backend
  dashboard registry (KPI + chart compositions, no row data set).

### Static `ReportModule` dashboard fallback (no grid or internal GridShell)

```text
ReportingApp → ReportPage → renderDashboard()
```

- Used when a static module exposes `renderDashboard` but no
  `getColumnMeta`-driven grid.
- Internal mini-panels inside `renderDashboard` may render through
  `GridShell` directly (NOT `EntityGridTemplate`) when toolbar /
  variant / export are intentionally absent. They MUST NOT render
  through raw `AgGridReact`.

### Karma module (grid + dashboard)

```text
ReportingApp → ReportPage → (EntityGridTemplate main grid)
                          → renderDashboard() → (optional GridShell mini-tables)
```

- Currently: `hr-compensation-report`, `hr-demografik-yapi`.
- Main grid path is the standard chain. Dashboard side may host
  charts, KPIs, maps, and `GridShell` mini-tables.

---

## Enforcement

| Layer                   | Mechanism                                                                                 | Authority                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| IDE / dev-time feedback | ESLint `no-restricted-syntax` rule for `ag-grid-react` import (eslint.config.mjs:220-296) | Advisory — root lint step in `ci-web-check.yml` swallows failures (Faz 19.6 baseline) |
| **CI hard gate**        | **Vitest source-AST scan** — `pnpm --filter mfe-reporting run test:grid-contract`         | **Authoritative — exit code propagates, no `\|\| echo`, no `--if-present`**           |
| Exceptions              | `apps/mfe-reporting/src/__tests__/grid-architecture-exceptions.json`                      | CODEOWNERS-gated, expiring escape hatch (see below)                                   |
| Cross-AI peer review    | Codex (OpenAI) reviews Claude (Anthropic) impl; provider-level isolation                  | HARD RULE — implementer ≠ reviewer at provider level                                  |

### Exception registry

`apps/mfe-reporting/src/__tests__/grid-architecture-exceptions.json`
is an opt-in escape hatch — **not the default answer**. Entries
require:

| Field       | Constraint                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| `path`      | `^apps/[^*?\[\]]+\.(ts\|tsx)$`, no wildcards                               |
| `kind`      | `direct-ag-grid` or `direct-x-data-grid`                                   |
| `reason`    | Free-text ≥ 20 chars explaining why the canonical contract is insufficient |
| `owner`     | `@user` or `@org/team`, resolvable in this repo's CODEOWNERS / membership  |
| `expiresAt` | ISO `YYYY-MM-DD`, NOT in the past                                          |

The registry ships **empty** as of 2026-05-31 — PR-A retired the
last app-level exemption (`CompensationDashboard.tsx`).

---

## Report Classes (2026-05-31 audit snapshot)

| Class                                               | Examples                                                                                        | Render path                                      | Grid path                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic (backend metadata-driven)                   | snapshot count: **32** (varies with backend catalog)                                            | `ReportingApp → ReportPage`                      | `EntityGridTemplate` driven by `/api/v1/reports/{key}/metadata`                                                                         |
| Static pure-grid (`ReportModule` + `getColumnMeta`) | `users-report`, `monthly-login-summary`, `audit-report`, `weekly-audit-digest`, `access-report` | `ReportingApp → ReportPage`                      | `EntityGridTemplate` driven by TS-declared `ColumnMeta[]`                                                                               |
| Karma (grid + dashboard)                            | `hr-compensation-report`, `hr-demografik-yapi`                                                  | `ReportingApp → ReportPage`                      | `EntityGridTemplate` main + optional `GridShell` mini-tables in `renderDashboard`                                                       |
| Dashboard-only static                               | `hr-executive-summary`                                                                          | `ReportingApp → ReportPage` (dashboard fallback) | none                                                                                                                                    |
| Observability / internal                            | `context-health`                                                                                | `ReportingApp → ReportPage` (dashboard fallback) | internal debug panels use `GridShell` directly; outside catalog data-grid contract scope but still subject to the raw `AgGridReact` ban |

---

## Column Contract — `ColumnMeta` discriminated union

The contract column metadata type is `ColumnMeta` from
`@mfe/design-system/advanced/data-grid` (defined in
`packages/design-system/src/advanced/data-grid/column-system/types.ts`).
**12 variants**:

| Code literal | Renderer                                                                          |
| ------------ | --------------------------------------------------------------------------------- |
| `text`       | Plain text cell                                                                   |
| `bold-text`  | Semibold label (`font-semibold text-text-primary` default)                        |
| `badge`      | Coloured badge with `variantMap: Record<raw, BadgeVariant>`                       |
| `status`     | Badge + i18n label (`statusMap: Record<raw, { variant, labelKey }>`)              |
| `date`       | Date formatter (`format: 'short' \| 'long' \| 'datetime' \| 'relative'`)          |
| `number`     | `Intl.NumberFormat` numeric (decimals/suffix/prefix)                              |
| `currency`   | `Intl.NumberFormat` currency (`currencyCode` default `'TRY'`, decimals default 2) |
| `enum`       | Set filter + label map (`labelMap: Record<raw, string>`)                          |
| `boolean`    | Icon/text (`trueLabel` / `falseLabel`, default `Evet` / `Hayır`)                  |
| `percent`    | Decimal-as-percent (with optional progress bar)                                   |
| `link`       | Cell rendered as `<a href>` (template or field-driven)                            |
| `actions`    | Pinned-right action menu (`actions: ActionItem[]`)                                |

Columns are transformed to AG Grid `ColDef[]` via `buildColDefs(metas,
translate, locale?, permissions?, viewportWidth?)`. Numeric columns
(`number`, `currency`, `percent`) auto-right-align via the column-
system transformer (`type: 'rightAligned'`).

---

## Adding a report

### Option A — backend `ReportDefinition` (preferred, zero frontend code)

1. Add a `ReportDefinition` (column meta + SQL) to platform-backend's
   report registry.
2. Ensure `/api/v1/reports/{key}/metadata` returns 200 with a valid
   `ReportMetadata` payload.
3. ReportingApp auto-routes the new key through the dynamic-report renderer (equivalent to `<DynamicReport reportKey={key} />`) — no frontend code change.

### Option B — static `ReportModule` (TS hand-written column meta)

1. Add a directory under `apps/mfe-reporting/src/modules/<your-report>/`.
2. Implement `ReportModule<F, R>`:
   - `route`, `navKey`, `titleKey`, `descriptionKey`,
     `breadcrumbKeys`
   - `createInitialFilters`, `renderFilters`
   - `getColumnMeta(): ColumnMeta[]`
   - `fetchRows(filters, request): Promise<GridResponse<R>>`
   - optional: `renderDashboard()` for karma modules
3. Register the module in
   `apps/mfe-reporting/src/modules/index.ts`.
4. ReportingApp routes the module through `<ReportPage module={...} />`
   — same `EntityGridTemplate` chain as dynamic reports.

In both cases, you write zero AG Grid / `AgGridReact` code.

### Migrating an existing raw grid

1. Replace raw `AgGridReact` with `EntityGridTemplate` for report result grids.
2. Use `GridShell` for dashboard mini-tables that intentionally do not need toolbar / export / variant UI.
3. Express columns as `ColumnMeta[]`, then call `buildColDefs(metas, translate)`.
4. Run `pnpm --filter mfe-reporting run test:grid-contract` — the gate must stay green.
5. Browser-smoke the route for grid chrome and formatter parity.

---

## Forbidden patterns (CI hard gate)

### Forbidden — raw `AgGridReact` in `apps/`

```ts
// ❌ FAILS the grid-architecture contract test in CI.
import { AgGridReact } from 'ag-grid-react';

// ❌ Also caught: dynamic, re-export, require(), import = require()
const X = await import('ag-grid-react');
export * from 'ag-grid-react';
const Y = require('ag-grid-react');
import Z = require('ag-grid-react');
```

Fix: route through `GridShell` (read-only, no toolbar) or
`EntityGridTemplate` (full toolbar).

### Forbidden — `@mfe/x-data-grid` consumption in `apps/mfe-reporting/`

```ts
// ❌ FAILS the contract test.
import { TreeDataGrid } from '@mfe/x-data-grid';
```

`@mfe/x-data-grid` is the enterprise grid kit (pivot / tree /
master-detail). Reporting apps consume those features via
`GridShell` configuration, not via direct package import. Package
internals (`packages/x-data-grid/**`) remain outside the scan
scope.

### Forbidden — dashboard mini-table with raw grid

Even inside `renderDashboard()`, mini-tables must use `GridShell`
(PR-A precedent: `CompensationDashboard.ChartDataGrid`). The
exception that previously documented this pattern was retired by
PR-A.

### Forbidden — silent fallback to another grid

When a metadata endpoint returns 404 or a `ReportModule` is
missing, the frontend must surface a typed error, not silently
fall back to an alternative grid implementation. The unified-grid
invariant relies on every report key resolving to the same chain.

---

## Backlog (out of PR-C scope)

- **`platform-backend` `ReportColumnMeta` contract mirror** — the
  producer side of the metadata-driven column shape. Cross-repo
  follow-up; PR-C is platform-web-scoped.
- **Lint baseline / ratchet** — `ci-web-check.yml:41` root-lint
  `|| echo "Lint warnings tolerated"` swallow is deferred to a
  separate PR; advisory ESLint stays IDE-time only until that lands.

## References

- PR-A `e7048944`: CompensationDashboard mini-tables → GridShell
- PR-B `f814f190`: vitest grid-architecture contract hard gate
- Codex cross-AI plan-time consensus thread `019e7f8f-c386-7ca0-b8cf-fce7b7df0752`
- `eslint.config.mjs:220-296`: `no-restricted-syntax` rule for `ag-grid-react`
- `apps/mfe-reporting/src/__tests__/grid-architecture.contract.test.ts`: CI authority
- `apps/mfe-reporting/src/__tests__/grid-architecture-exceptions.json`: empty registry baseline
- `apps/mfe-reporting/src/__tests__/grid-architecture-exceptions.schema.json`: informational JSON Schema
