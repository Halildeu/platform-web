# Dynamic Report Migration — PR-D0 Parity Matrix + Schema Gap Analysis

> **Status**: Pre-implementation audit (docs only)
> **Owner**: Halildeu
> **Codex thread**: `019e7f8f` (cross-AI plan-time consensus)
> **Prior chain**: PR-A `e7048944` (grid contract code) + PR-B `f814f190` (CI gate) + PR-C `74d6818b` (rendering contract docs).
> **Context**: Grid-rendering contract (PR-A/B/C) made all `apps/` grids route through the single `ReportPage → EntityGridTemplate → GridShell → AgGridReact` chain. The remaining gap is the **source of column metadata**: 33 dynamic reports read it from `/api/v1/reports/{key}/metadata` (verified 2026-05-31 via `gh api .../reports --jq 'length'`) (backend definition); 7 static modules hardcode it in TS. The user's directive "dinamik rapor olmalı" ("they should be dynamic reports") makes the static path the obstacle to "rapora göre sütunlar değişecek yalnızca" (only column metadata changes per report; zero frontend code per new/changed report).
> **This document is docs-only.** No code changes ship in PR-D0. The deliverable is a verified parity matrix + ranked schema/contract proposals so PR-D1+ implementations do not discover blockers mid-PR.

---

## 1. Three contract layers (Codex iter-REVISE absorbed)

The "grid contract" is not a single object. Three distinct contracts cooperate; migration friction can sit at any of them. Each layer is documented separately throughout this file so blockers are not collapsed into prose.

| Layer                                    | File / path                                                                                        | Variant vocabulary                                                                                                                                                                  | Authority                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **(L1) Backend registry schema**         | `platform-backend/report-service/src/main/resources/contract/report-definition.schema.json`        | `type: "text" \| "number" \| "date"` — **3 variants**; `additionalProperties: false` (strict reject)                                                                                | Author-time JSON validation when report definitions are seeded              |
| **(L2) Frontend metadata transport DTO** | `platform-web/apps/mfe-reporting/src/modules/dynamic-report/types.ts` (`ReportColumnMeta`)         | `type` of **9 variants**: text/number/date/badge/status/currency/boolean/percent/enum + `variantMap` / `labelMap` / `statusMap` / `currencyCode` / `decimals` / `suffix` / `prefix` | Runtime shape returned by `/api/v1/reports/{key}/metadata`                  |
| **(L3) Design-system column-system**     | `platform-web/packages/design-system/src/advanced/data-grid/column-system/types.ts` (`ColumnMeta`) | **12 variants**: text / bold-text / badge / status / date / number / currency / enum / boolean / percent / link / actions                                                           | Internal render contract; `buildColDefs(meta, t)` produces AG Grid `ColDef` |

**Observed mismatches**:

- L1 → L2: backend schema rejects 6 of the 9 variants L2 already declares (badge, status, currency, boolean, percent, enum). Backend producers cannot emit them.
- L2 → L3: L2 is missing 3 variants present in L3 (bold-text, link, actions).
- L2 → L3: L2 also missing config fields present in L3 — `format` (date: short/long/datetime/relative), `defaultVariant` (badge / status fallback), `filterValues` (badge / status set filter override). Codex iter-2 absorbed: L2 `ReportColumnMeta` does NOT model these today; `metadata-cache.ts` mapper drops them silently.

**Decision proposal**:

- Extend **L1** to cover badge / status / currency / boolean / bold-text variants used by the 7 static modules + per-variant config objects: `variantMap` / `labelMap` / `statusMap` / `currencyCode` / `decimals` / `suffix` / **`format`** / **`defaultVariant`** / **`filterValues`** (Codex iter-2: do not drop the last three; modules use them today).
- Extend **L2** in lockstep — adding to L1 alone without updating `dynamic-report/types.ts` + the mapper leaves backend metadata produced-but-discarded.
- Keep legacy `variantMap` / `labelMap` / `statusMap` shape as `Record<string, string>` for backward compat; tighten via JSON Schema constraints (badge variant enum, statusMap value `{variant, labelKey}`, numeric raw keys accepted as string). Do NOT retire the legacy maps in this chain (Codex iter-2: retiring expands D scope unnecessarily).
- Decide explicitly whether to ALSO extend bold-text / link / actions to L1+L2 — **recommendation**: bold-text yes (used in 5 of 7 modules); link/actions explicitly out-of-scope unless a separate need arises (no migration target uses them).

**Required PR-D1+ work**:

- L1 JSON Schema extension + Java record producer updates + per-variant config object handling.
- L2 transport DTO extension (`ReportColumnMeta` type widening + mapper updates) — required for badge/status/currency/boolean/bold-text + the three missing config fields (format, defaultVariant, filterValues).
- L3 already supports the full 12 variants + config fields; no change.

---

## 2. Per-module parity matrix

Each module is documented in the canonical 5-section form: **Observed current state** → **Identity / persisted state** → **Gap / blocker** → **Decision proposal** → **Required PR-D1+ work**.

### 2.1 `users-report` (target: `users-overview` dynamic report)

**Observed current state**

- Route: `users` (from `getSharedReport('users-overview').webRouteSegment`)
- Backend data: `GET /v1/users` (NOT report-service)
- Filter UI: `search` (text input), `status` (select: ALL / ACTIVE / INACTIVE / INVITED / SUSPENDED)
- URL params read at init: `search`, `userId` (legacy alias), `status` (uppercase normalized)
- Columns: `fullName` (bold-text), `email` (text), `role` (badge with variantMap ADMIN/USER + labelMap shared.role.\*), `status` (status with statusMap 4-state), `lastLoginAt` (date), `createdAt` (date)
- Aliasing: backend emits `name`; static mapper rewrites to `fullName`. Sort colId `fullName` → backend `name`; `createdAt` → `createDate`; `lastLoginAt` → `lastLogin`.
- Row normalization: status uppercase if missing
- Export: not implemented (no `exportRows`)
- Permissions: none gated on the module itself; relies on `/v1/users` backend gate

**Identity / persisted state**

- Current `SharedReportId`: `users-overview`
- Current route: `/admin/reports/users`
- Capabilities catalog: `webRouteSegment: 'users'`, `webModuleId: 'reports.users'`, `reportGroup: 'HR_REPORTS'`
- Dynamic key candidate: `users-overview` (preserve SharedReportId identity)
- Favorite / saved-filter key: **Resolved by §3 Identity migration plan** — favorites + saved filters key off SharedReportId (verified at `report-preferences.ts:48,56`); dynamic list item carries `sharedReportId: 'users-overview'` to preserve.

**Gap / blocker**

- L1: badge + status variants not supported.
- L1: `variantMap` / `labelMap` / `statusMap` config objects not modeled.
- Backend data not in report-service: requires either (a) report-service SQL/view that joins users table or (b) virtual report adapter delegating to `/v1/users`.
- Field aliasing (`name` → `fullName`): if migrated via SQL/view, alias as `fullName` directly; if migrated via virtual adapter, adapter must rename.
- Filter UI: `status` is a fixed enum (5 values), not metadata-driven. Static module hand-codes the select.

**Decision proposal**

- Data source: (a) report-service SQL/view over the users table. The columns are stable enough that pivot-mode and SSRM grouping are not needed; a plain `SELECT id, name AS fullName, email, role, status, last_login AS lastLoginAt, created_at AS createdAt FROM users` view fits.
- L1 extension: add `badge`, `status` variants + `variantMap` (Record<string, string>) + `labelMap` (Record<string, string>) + `statusMap` (Record<string, { variant, labelKey }>).
- Filter: add backend-driven `filterDefinitions` (§4) with one `enum-select` entry for `status`.
- SharedReportId: keep `users-overview` to preserve favorites / sidebar default; add backend `routeSegment: 'users'` (§3).

**Required PR-D1+ work**

- Backend: SQL view + `users-overview.json` ReportDefinition (currently absent).
- Backend: L1 schema extension PR.
- Frontend: ensure metadata-cache mapper handles badge/status variants without downgrade (verify before delete).
- Acceptance: route preserved at `/admin/reports/users`, status enum filter renders identical UX, ADMIN badge red / USER badge blue parity verified browser-side.

### 2.2 `monthly-login-summary` (target: candidate for consolidation OR separate dynamic)

**Observed current state**

- Route: `monthly-login-summary` (from `getSharedReport('monthly-login-summary').webRouteSegment`)
- Backend data: `GET /v1/users?status=ACTIVE&...` — **same `/v1/users` endpoint as users-report, just hardcoded `status=ACTIVE` and default sort `lastLogin,desc`**
- Filter UI: `search` (text) + `month` (`<input type="month">`, value defaults to current month, **but the value is never sent to the backend** — UI-only filter)
- Columns: identical shape to users-report (fullName bold-text, email, role badge, status only 2-state ACTIVE/INACTIVE, lastLoginAt date, createdAt date)
- Default sort: `lastLogin,desc`

**Identity / persisted state**

- Current `SharedReportId`: `monthly-login-summary`
- Current route: `/admin/reports/monthly-login-summary`

**Gap / blocker**

- The "month" filter does nothing — Codex iter-REVISE observation confirmed by reading `api.ts`: the `month` value is in initial filters but `buildQueryString` does not read it.
- This is effectively a filtered view of users-overview (status=ACTIVE + sorted by lastLogin desc).
- Same L1 gaps as users-report (badge, status variants).

**Decision proposal**

- Two paths to evaluate before PR-D1:
  - **Path A**: keep as separate dynamic report; backend `monthly-login-summary.json` reuses the users view with a WHERE `status='ACTIVE'` + ORDER BY `lastLogin DESC`. Frontend month filter dropped (it does nothing today) OR made truly month-aggregating via backend month parameter.
  - **Path B**: drop the module entirely; treat as a default saved filter / variant of users-overview. Users navigate `/admin/reports/users-overview?status=ACTIVE&sort=lastLogin,desc`. Sidebar entry preserved by routing to that URL.
- Identity / sidebar / favorites impact: differs per path. Path A keeps the entry as-is; Path B requires sidebar rewriting.

**Required PR-D1+ work**

- Decision: A or B (recommend deferring to PR-D1 planning; document trade-off).
- If A: same L1 work as users-report.
- If B: sidebar / capability catalog cleanup + Codex re-iter on path A vs B.

### 2.3 `audit-report` (target: `audit-activity` dynamic report)

**Observed current state**

- Route: `audit` (from `getSharedReport('audit-activity').webRouteSegment`)
- Backend data: `GET /audit/events` — NOT report-service
- Filter UI: `search` (text) + `level` (select ALL / INFO / WARN / ERROR)
- Columns: `id` (text), `userEmail` (text), `service` (text), `action` (text), `level` (badge with variantMap INFO=info/WARN=warning/ERROR=danger), `timestamp` (date)
- Sort alias: `timestamp` → `occurredAt`; default sort `occurredAt,desc`
- Row normalization: id → string, level uppercase, fallback timestamp = now, fallback userEmail / service / action = `—`
- Export: special — UI offers `csv`/`excel`, backend endpoint is `GET /audit/events/export?format={csv|json}`; the static module maps `excel → json` (backend emits JSON, NOT xlsx)

**Identity / persisted state**

- Current `SharedReportId`: `audit-activity`
- Current route: `/admin/reports/audit`

**Gap / blocker**

- L1: badge variant not supported.
- Backend data not in report-service (different service entirely).
- Export semantics: `excel → json` translation is a frontend hack; the dynamic factory's exportRows passes `format` straight to backend.
- Row normalization is non-trivial (level uppercase, fallback values for missing fields).

**Decision proposal**

- Data source: virtual report adapter delegating to `/audit/events` is more likely correct than trying to put audit events in report-service SQL (the audit service owns the data). Document the virtual adapter pattern in PR-D1.
- Export: long-term, rename backend export format `json` → `excel` (actually emit xlsx) so the frontend translation goes away. Short-term, allow the dynamic factory to map per-key.
- L1 extension: same badge variant work as users-overview.

**Required PR-D1+ work**

- Backend: virtual report adapter design (`audit-activity.json` definition that points the dynamic engine at `/audit/events` rather than a SQL query).
- Backend: decision on export format rename (separate PR).
- Frontend: metadata-cache mapper must produce identical normalization to current static (id stringification, level uppercase, fallbacks).

### 2.4 `weekly-audit-digest` (target: consolidation candidate OR separate dynamic)

**Observed current state**

- Route: `weekly-audit-digest` (from `getSharedReport('weekly-audit-digest').webRouteSegment`)
- Backend data: `GET /audit/events` — **same endpoint as audit-report**, no time window in code despite "weekly" name
- Filter UI: `search` + `level` (identical to audit-report)
- Columns: identical shape to audit-report
- Default sort: `occurredAt,desc`
- SSRM total math: special "short block last block" handling

**Identity / persisted state**

- Current `SharedReportId`: `weekly-audit-digest`
- Current route: `/admin/reports/weekly-audit-digest`

**Gap / blocker**

- Same L1 / data-source gaps as audit-report.
- Two reports backed by the same endpoint with no observable behavioral difference — consolidation candidate.

**Decision proposal**

- Path A: keep separate; backend `weekly-audit-digest.json` adds a default time window (e.g., last 7 days) via SQL or backend param. Frontend month-equivalent control optionally exposed.
- Path B: drop the module; sidebar entry deep-links into audit-activity with a time-range default.
- Path C: ship both as dynamic but tag them as "audit-activity" with different default filter sets at the variant level (saved variant pattern).

**Required PR-D1+ work**

- Decision: A / B / C.
- If A or C: time window backend param contract.
- If B: sidebar / capability cleanup.

### 2.5 `access-report` (target: `roles-access` dynamic report)

**Observed current state**

- Route: `access` (from `getSharedReport('roles-access').webRouteSegment`)
- Backend data: `GET /v1/roles` — NOT report-service; backend has NO pagination
- Filter UI: `search` only (text)
- Columns: `roleName` (bold-text), `memberCount` (number), `moduleSummary` (text, **computed client-side**), `updatedAt` (date)
- Client-side work: builds `moduleSummary` by joining `dto.policies[].moduleLabel ?? moduleKey` (slice 2 + " +N" remaining); client-side filter (`search` in roleName + moduleSummary); client-side sort (turkish locale aware); client-side pagination
- `total` = filteredRows.length (post-filter, pre-paginate)
- Aliasing: `dto.lastModifiedAt` → `updatedAt`; `dto.id` → string; description nullable
- Export: not implemented

**Identity / persisted state**

- Current `SharedReportId`: `roles-access`
- Current route: `/admin/reports/access`

**Gap / blocker**

- L1: bold-text not in L1 (also missing from L2 transport DTO).
- Heavy client-side computation: `moduleSummary` joins role policies in TS. Migration via SQL requires a derived column that joins role_policies + module_labels and aggregates to a single string (`STUFF(... FOR XML PATH)` or `STRING_AGG`).
- Client-side filter + sort + paginate is the data engine. Migrating to backend requires either (a) `/v1/roles` adds pagination + sort + filter params or (b) virtual adapter wraps the existing endpoint.
- Codex iter-REVISE specifically flagged this as "not trivially SQL" — confirmed.

**Decision proposal**

- Data source: defer the decision. Two options:
  - (a) Extend `/v1/roles` to accept page / pageSize / sort / search + return SQL-computed `moduleSummary`. Larger backend change but cleaner.
  - (b) Virtual report adapter wraps current `/v1/roles` and runs the existing client-side logic server-side (filter + sort + paginate from the full result). Smaller change but moves the slowness from browser to server.
- L1 extension: bold-text variant if accepted, OR map `roleName` to `text` (lose the visual emphasis).

**Required PR-D1+ work**

- Decide bold-text policy.
- Decide (a) vs (b) for data source.
- Backend: implement chosen data source.
- Acceptance: same UX as today including `moduleSummary +N` truncation pattern.

### 2.6 `hr-compensation-report` — karma (grid path: target `hr-compensation-detay`)

**Observed current state**

- Route: `hr-compensation` (from `getSharedReport('hr-compensation').webRouteSegment`)
- Backend grid data: `GET /v1/reports/hr-compensation-detay/data?...` — **ALREADY USES report-service DYNAMIC endpoint**
- Backend dashboard data: `GET /v1/dashboards/hr-compensation/{kpis|charts|filter-options/<key>}` — separate dashboard service
- Filter UI sidebar: `search`, `department` (dynamic select fetched from `/v1/dashboards/hr-compensation/filter-options/department`), `collarType` (select 1/2), `gender` (select 0/1), `education` (select 5 fixed values)
- Grid filters (via advancedFilter JSON): sidebar values translate to AG Grid filter model (FULL_NAME contains, DEPARTMENT_NAME contains, COLLAR_TYPE/GENDER equals, EDUCATION equals)
- Columns: **19** — many currency (GROSS_SALARY, NET_SALARY, TOTAL_EMPLOYER_COST, SSK_EMPLOYER, INCOME_TAX, OVERTIME_PAY, SEVERANCE_AMOUNT all `currency: TRY, decimals: 0`); COLLAR_TYPE + GENDER are badge with numeric keys 0/1/2; IS_CRITICAL is boolean; rest text/number
- Default sort: `GROSS_SALARY,desc`
- Backend definition (`hr-compensation-detay.json`) exists and has SQL + columns, but L1 schema forces backend columns to type `number` for all salary fields; static frontend module overrides to `currency`.
- Renders custom `CompensationDashboard` (charts + KPIs + 10 mini-tables — PR-A migrated mini-tables to GridShell)

**Identity / persisted state**

- Current `SharedReportId`: `hr-compensation`
- Current route: `/admin/reports/hr-compensation`
- Backend data key: `hr-compensation-detay`
- **Route ≠ backend key** — current route alias is hardcoded in static module's api.ts (`DASHBOARD_KEY = 'hr-compensation'` vs `REPORT_KEY = 'hr-compensation-detay'`).
- Saved filters / sidebar default route: **Resolved by §3 Identity migration plan** — saved filters key off SharedReportId `hr-compensation` (verified at `report-preferences.ts:48,56`); dynamic list item carries `routeSegment: 'hr-compensation'` + `sharedReportId: 'hr-compensation'` to preserve URL + persistent state.

**Gap / blocker**

- L1: badge + currency + boolean variants not supported; `variantMap` / `labelMap` / `currencyCode` / `decimals` config objects not modeled.
- Route alias: dynamic factory builds route as `report.key` (`hr-compensation-detay`); current users expect `/hr-compensation`. URL break.
- Sidebar filters (`department` dynamic options + `collarType` / `gender` / `education` fixed enums): not metadata-driven today.
- Custom dashboard composition (`renderDashboard`): out of scope for D0 grid migration; `DashboardDefinition` is a separate sub-chain (D4 or later).

**Decision proposal**

- L1 extension is required (currency + badge + boolean + config objects).
- Route alias: see §3 — Option B (backend list item adds `routeSegment`) is the cleanest path for hr-compensation.
- Filter UI: backend `filterDefinitions` (§4) carries each sidebar entry. `department` becomes `{kind: 'enum-select', optionsSource: 'endpoint:/v1/dashboards/hr-compensation/filter-options/department'}`. Collar / gender / education become static-options enum-selects.
- Karma scope marker: **migration target = main grid path only**. The `renderDashboard()` side stays static TS until a `DashboardDefinition` contract lands; this PR does NOT claim "hr-compensation is fully dynamic".

**Required PR-D1+ work**

- Backend: extend `hr-compensation-detay.json` with the proper variant types + filterDefinitions + routeSegment field.
- Backend: L1 schema extension PR.
- Frontend: drop the static module's `getColumnMeta` + `renderFilters` + sort default + fetchRows; KEEP `renderDashboard` (separate TS component still registered through a thinner wrapper, OR move into a dashboard-only side channel).
- Browser smoke: currency formatting (₺ Turkish dot-thousands, 0 decimals) parity verified; badge variants for collar / gender render identical.

### 2.7 `hr-demographic-report` — karma (grid path: target `hr-demografik-yapi`)

**Observed current state**

- Route: `hr-demografik-yapi` — **route == backend key** (matches)
- Backend grid data: already delegates to dynamic-report path via `fetchReportData('hr-demografik-yapi', ...)` (see api.ts:11 import from `../dynamic-report/api`)
- Backend dashboard data: `GET /v1/dashboards/hr-demografik/{kpis|charts}`
- Filter UI sidebar: `search`, `department` (text contains), `location` (text contains), `gender` (select Erkek/Kadın), `employmentType` (select 4 fixed values)
- Columns: 11 — `fullName` (bold-text), `department` (text), `position` (text), `gender` (badge variantMap Erkek=info/Kadın=primary), `age` (number), `education` (text), `employmentType` (badge 4-state), `location` (text), `tenureYears` (number with suffix 'yıl'), `hireDate` (date format short), `generation` (text)
- Field aliasing: backend UPPER_SNAKE columns → frontend camelCase (FULL_NAME → fullName, DEPARTMENT_NAME → department, etc.)
- Mock fallback: dev/staging only — `mockRows` array of 2545 generated employees. **NOTE (Codex iter-2 accuracy)**: `fetchHrDemographicRows` does NOT catch fetchReportData errors today — failures propagate upward. Prod's `mockRows = []` only suppresses the seeded demo dataset; an actual data-fetch failure surfaces as an error. Verify error-handling acceptance before drop.

**Identity / persisted state**

- Current `SharedReportId`: `hr-demografik-yapi`
- Current route: `/admin/reports/hr-demografik-yapi`
- Route == backend key — no alias needed

**Gap / blocker**

- L1: bold-text + badge variants + `variantMap` config not supported.
- L1: `suffix` not in L1 (used on tenureYears).
- L1: `format` config for date variant ('short' / 'long' / 'datetime' / 'relative') not in L1.
- Field name case: backend UPPER_SNAKE, frontend camelCase. Either backend definition aliases columns as camelCase in SQL, or metadata-cache mapper handles the case mapping declaratively (today it's hardcoded in api.ts).
- Karma marker: same as hr-compensation — dashboard side static, grid side migrate-able.

**Decision proposal**

- L1 extension: bold-text + badge + suffix + date format.
- Field case: lowercase camelCase aliases in the backend SQL view (cleanest); metadata-cache mapper for legacy backends as fallback.
- Filter UI: 5 entries via filterDefinitions; department + location as `text-search`; gender + employmentType as `enum-select`.
- Drop the camelCase mapping in api.ts (move into SQL).
- Karma scope: same as hr-compensation — grid-only migration; renderDashboard stays.

**Required PR-D1+ work**

- Backend: update `hr-demografik-yapi.json` columns with bold-text + badge + suffix + format + camelCase aliases.
- Frontend: drop static module's mapBackendRow + sidebar filter UI + sort translation; KEEP renderDashboard.
- Acceptance: badge variants render, suffix "yıl" appears on tenure column, date format "short" parity.

---

## 3. Identity + route alias — two options

> **Codex iter-2 finding (High)**: `routeSegment` alone does NOT preserve the catalog's existing identity model. Frontend uses `SharedReportId` (not route) as the key for favorites, saved filters, export mode, sidebar default, and capability lookup. Without a parallel `sharedReportId` carry on the dynamic list item, migrations will silently break user-persistent state.

### Identity surfaces (verified) that depend on `SharedReportId`, not route

| Surface                                     | Authority                                            | File / line                                                              |
| ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Favorites persistence sanitizer             | `isSharedReportId(item)` filter on stored favorites  | `apps/mfe-reporting/src/lib/report-preferences/report-preferences.ts:48` |
| Saved filter scope binding                  | `isSharedReportId(item.reportId)` filter             | `apps/mfe-reporting/src/lib/report-preferences/report-preferences.ts:56` |
| Saved filter grid id template               | `reports.saved-filters.${channel}.${reportId}`       | `packages/platform-capabilities/src/index.ts:1037`                       |
| Export mode lookup                          | `getSharedReportExportMode(sharedReportId)`          | `apps/mfe-reporting/src/app/reporting/ReportPage.tsx`                    |
| Sidebar default route + capability metadata | `getSharedReport(id).webRouteSegment`, `webModuleId` | `packages/platform-capabilities/src/index.ts`                            |

### Catalog dedupe surface (verified)

| Surface                              | Key used                     | File / line                                                                  |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| ReportingApp `allRoutes` dedupe      | `report.key`                 | `apps/mfe-reporting/src/app/reporting/ReportingApp.tsx:108`                  |
| `useCatalog` static-vs-dynamic split | `report.key`                 | `apps/mfe-reporting/src/app/reporting/useCatalog.ts:142`                     |
| Dynamic factory `sharedReportId`     | `dynamic:${report.key}` cast | `apps/mfe-reporting/src/modules/dynamic-report/create-dynamic-module.tsx:48` |
| Dynamic factory `route`              | `report.key`                 | `apps/mfe-reporting/src/modules/dynamic-report/create-dynamic-module.tsx:53` |

**Conclusion**: a backend rename or pure `routeSegment` addition cannot preserve favorites, saved filters, or export-mode lookups. The dynamic list item must carry the existing `SharedReportId` so the factory can mint stable identity AND so the dedupe surfaces can match against the legacy module's `getSharedReport(...).id`.

### Decision — dynamic `ReportListItem` extension (Codex iter-2 absorbed)

Extend backend `ReportListItemDto` with TWO optional fields, NOT one:

```ts
type ReportListItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  /** Optional: backend hints at the web route segment when it differs from key. */
  routeSegment?: string;
  /** Optional: backend hints at the legacy SharedReportId so favorites + saved filters + export mode + sidebar default survive migration. */
  sharedReportId?: SharedReportId; // e.g., 'users-overview', 'hr-compensation'
};
```

Dynamic factory then resolves:

```ts
const route = report.routeSegment ?? report.key;
const sharedReportId = report.sharedReportId ?? (`dynamic:${report.key}` as SharedReportId);
```

ReportingApp + useCatalog dedupe surfaces must also be updated to dedupe against `routeSegment ?? key` (not raw `key`) so the migrated dynamic entry replaces the legacy static module instead of shadowing it.

### Option A — backend report key equals current web route segment

**Mechanism**: Rename backend keys so each matches its current web route exactly.

| Current SharedReportId | Current backend data key  | Renames to                                          |
| ---------------------- | ------------------------- | --------------------------------------------------- |
| users-overview         | (none — would create new) | `users` (matches `/admin/reports/users`)            |
| roles-access           | (none)                    | `access`                                            |
| audit-activity         | (none)                    | `audit`                                             |
| monthly-login-summary  | (none)                    | `monthly-login-summary` (already matches route)     |
| weekly-audit-digest    | (none)                    | `weekly-audit-digest` (already matches)             |
| hr-compensation        | hr-compensation-detay     | `hr-compensation` (renames data key to match route) |
| hr-demografik-yapi     | hr-demografik-yapi        | `hr-demografik-yapi` (already matches)              |

**Pros**: Dynamic factory stays simple (`route: report.key`).
**Cons**:

- Decouples backend semantic key from saved data (`hr-compensation-detay` already has historical SQL + tests + permission seeds — renaming forces backend migration).
- Loses semantic clarity: `users` is less descriptive than `users-overview`.
- Risk of key collision with existing dynamic catalog (33 keys today (2026-05-31 verified)).

### Option B — backend report key stays semantic; list item adds `routeSegment`

**Mechanism**: Extend backend `ReportListItemDto` with optional `routeSegment?: string` and have the dynamic factory prefer it.

**Pros**:

- Preserves old URLs without renaming backend keys.
- Keeps semantic backend keys readable.
- Backend definitions already in production keep their existing filenames / SQL / tests.
- Backward compat: 33 existing dynamic reports where route == key continue working when `routeSegment` is absent.

**Cons**:

- Requires DTO + factory change.
- Adds a small piece of state to remember (which item uses alias).

**Recommendation**: **Option B + sharedReportId carry** — preserves old URLs + semantic keys + minimal backend churn + persistent state.

**Required PR-D1+ work** (Option B + identity):

- Backend: `ReportListItemDto` adds `routeSegment?: string` AND `sharedReportId?: string`.
- Backend: per-key opt-in mechanism (fields in the JSON file).
- Frontend: dynamic-factory uses `report.routeSegment ?? report.key` for route AND `report.sharedReportId ?? 'dynamic:${report.key}'` for SharedReportId.
- Frontend: ReportingApp + useCatalog dedupe against `routeSegment ?? key`.
- Migration table for the 7 static modules: which use the alias + which use SharedReportId carry (all 7 should set both).

---

## 4. `filterDefinitions` — metadata-driven filter UI

### Current state

Dynamic factory renders only a `<CompanyPicker>` + generic `<input>` search box. Module-level filters (status, level, month, department, collarType, gender, education, location, employmentType) are hand-coded in each static module's `renderFilters`.

### Proposed contract

Backend `ReportDefinition.filterDefinitions: FilterDefinition[]` — each entry describes one filter widget:

```ts
type FilterDefinition = {
  /** Unique key inside the report's filter state */
  key: string;
  /** Backend field this filter targets (defaults to key) */
  targetField?: string;
  /** Widget kind */
  kind:
    | 'text-search'
    | 'enum-select'
    | 'date-range'
    | 'number-range'
    | 'company-picker'
    | 'month-picker';
  /** Comparison operator emitted into the advanced filter model */
  operator?: 'contains' | 'equals' | 'between' | 'gte' | 'lte';
  /** Default value used by createInitialFilters */
  defaultValue?: unknown;
  /** URL search-param key (e.g. ?department=...) — preserves deep-link behavior */
  urlParam?: string;
  /** i18n key for the label */
  i18nLabelKey: string;
  /** Optional i18n key for the placeholder */
  i18nPlaceholderKey?: string;
  /** Inline options (for static enums) */
  options?: Array<{ value: string; labelKey?: string; label?: string }>;
  /** Dynamic options source (for backend-fetched dropdowns) */
  optionsSource?: {
    type: 'static' | 'endpoint' | 'filter-values';
    endpoint?: string;
    column?: string;
  };
  /** Override for how the value is translated into the advancedFilter model */
  advancedFilterTarget?: string;
};
```

### Per-module filterDefinitions (proposed)

| Module                | Filter entries                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users-overview        | `search` (text-search, FULL_NAME contains); `status` (enum-select, 5 options, urlParam=status)                                                                   |
| audit-activity        | `search` (text-search); `level` (enum-select INFO/WARN/ERROR)                                                                                                    |
| weekly-audit-digest   | same as audit-activity + optional `range` (date-range, last 7 days default)                                                                                      |
| roles-access          | `search` (text-search across roleName + moduleSummary)                                                                                                           |
| hr-compensation-detay | `search`; `department` (enum-select, optionsSource endpoint); `collarType` (enum-select 2 opts); `gender` (enum-select 2 opts); `education` (enum-select 5 opts) |
| hr-demografik-yapi    | `search`; `department` (text-search contains); `location` (text-search contains); `gender` (enum-select Erkek/Kadın); `employmentType` (enum-select 4 opts)      |
| monthly-login-summary | TBD — depends on Path A/B decision (§2.2)                                                                                                                        |

### Why URL/deep-link is a first-class field

Static modules read URL params at init (`createInitialFilters(context)` uses `context.searchParams`). The dynamic factory currently reads only `?search=`. Without `urlParam` per filter entry, every existing deep link (e.g., `?status=ACTIVE`, `?department=...`) breaks on migration. The proposed contract preserves these.

### Frontend execution path — required acceptance pieces (Codex iter-2 absorbed)

> A backend `filterDefinitions` contract alone does NOTHING. The frontend currently renders only `CompanyPicker + search` and has no machinery to consume metadata-driven filters. Without these pieces wired BEFORE the first migration slice, PR-D1+D2 will land with dead filters.

| Layer                | Required change                                                                                                                                                                                       | Verified gap                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| L2 transport DTO     | `ReportMetadata.filterDefinitions: FilterDefinition[]` field added; mapper preserves it through metadata-cache                                                                                        | currently absent in `dynamic-report/types.ts`                                                                         |
| L2 filter state type | `DynamicReportFilters` widened beyond `{ search }` to dynamic Record keyed by each `FilterDefinition.key`                                                                                             | currently `{ search: string }` only                                                                                   |
| Renderer             | Dynamic factory `renderFilters` reads `getCachedFilterDefinitions(report.key)` and emits per-kind widgets (text-search / enum-select / date-range / number-range / company-picker / month-picker)     | currently hand-codes CompanyPicker + search                                                                           |
| Init                 | `createInitialFilters(context)` reads `urlParam` per FilterDefinition; populates default values from `defaultValue` + URL search params                                                               | currently reads only `?search=`                                                                                       |
| Translator           | `buildAdvancedFilter` (or new `buildAdvancedFilterFromDefinitions`) translates sidebar values + grid filterModel into the backend's advancedFilter JSON, honoring `operator` + `advancedFilterTarget` | currently passes sidebar state through unchanged; advancedFilter wiring lives in static modules, not the dynamic path |
| Dynamic options      | `optionsSource: { type: 'endpoint' }` fetched at mount with cache; `type: 'filter-values'` delegates to existing `fetchFilterValues(report.key, column)`                                              | currently no dynamic-options machinery in dynamic factory                                                             |
| Tests                | Per-kind renderer test + URL-param round-trip test + advancedFilter translator test + optionsSource cache test                                                                                        | currently absent                                                                                                      |

**Acceptance** (must land before PR-D2 frontend module deletion can be safe):

- All 7 module's `renderFilters` shapes producible by the dynamic factory from `filterDefinitions` JSON.
- All 7 module's URL-deep-link parameters preserved.
- Per-module visual smoke + browser-verified deep-link round trip.

---

## 5. Data-source strategy (verify, don't assume)

For each of the 5 non-report-service modules, the data source needs explicit decision before backend impl. The current document records possible paths and the verification each needs.

| Module                | Today's endpoint            | Candidate path                                                                                          | Verification needed before PR-D1                                                                                                                                                                                              |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users-overview        | `/v1/users`                 | (a) Report-service SQL view over `users` table                                                          | Confirm: does report-service have access to the users-table schema? Are role / status enum values stable enough for an SSRM-paginated view?                                                                                   |
| roles-access          | `/v1/roles` (no pagination) | (a) Report-service SQL with computed `moduleSummary` column OR (b) Virtual adapter wrapping `/v1/roles` | (a) requires SQL `STRING_AGG` over role_policies + module_labels — verify backend dialect supports it. (b) requires deciding if "virtual adapter" is part of the report-service contract; no precedent in current 33 reports. |
| audit-activity        | `/audit/events`             | (b) Virtual adapter (audit data lives in a separate service with its own DB)                            | Audit service ownership: does platform-backend expose audit data via SQL? Or is audit service Kafka-streamed-only?                                                                                                            |
| weekly-audit-digest   | `/audit/events` (same)      | Same as audit-activity OR consolidate into audit-activity with default filter                           | Path A/B/C decision per §2.4                                                                                                                                                                                                  |
| monthly-login-summary | `/v1/users?status=ACTIVE`   | Same as users-overview, possibly with default filter                                                    | Path A/B decision per §2.2                                                                                                                                                                                                    |

For the 2 karma modules (hr-compensation-detay, hr-demografik-yapi), the data source is already report-service SQL — only the L1 schema + filter + route work remains.

---

## 6. Migration ordering

### Lowest-risk first

1. **hr-demografik-yapi** (already 90% dynamic) — main grid already uses `fetchReportData`; static module is mostly camelCase mapper + sidebar UI + dashboard host. Migration touches L1 schema for badge + bold-text + suffix, no route alias work, no data-source work.
2. **hr-compensation-detay** (already report-service backed) — grid already uses `/v1/reports/...`; main work is L1 schema for currency + badge + boolean, route alias (`routeSegment`), and sidebar filter migration. Dashboard scope stays out.
3. **Audit consolidation decision** (weekly-audit-digest + audit-activity) — both share endpoint; decide A / B / C before either migration.
4. **users-overview** (smallest non-report-service module) — only after the virtual-adapter or SQL-view path is chosen.
5. **roles-access** (most client-side work) — last among pure-grid migrations.
6. **monthly-login-summary** — depends on path decision; could ride users-overview's migration or be retired entirely.

### Why this order

- D1 schema work pays dividends most on hr-compensation (7 currency columns) — getting that right validates the full L1 extension before pure-grid modules need it.
- Audit consolidation forces the data-source question for the audit service, which is the hardest non-report-service decision.
- users-overview lets us validate the SQL-view vs virtual-adapter choice on a simple module before tackling roles-access.

### PR slicing (Codex iter-2 absorbed)

D1 is split into two PRs (see §9): **D1a contract slice** (backend Java records + schema + registry tests — NO module migration) then **D1b frontend transport DTO + dynamic factory** (parallel L2 work + renderer + identity dedupe + filter execution path). PR-D2 (first actual module migration on `hr-demografik-yapi`) requires BOTH D1a and D1b to be merged first. This split prevents discovering filter-rendering or identity-dedupe gaps mid-migration.

---

## 7. Karma dashboard scope (D4 / separate sub-chain)

The karma modules' `renderDashboard()` side is **out of scope** for the D series PRs.

| Module               | Dashboard surface                                                             |
| -------------------- | ----------------------------------------------------------------------------- |
| hr-compensation      | KPIs + 13 charts + 10 GridShell mini-tables + cross-filter + 5-filter sidebar |
| hr-demografik-yapi   | KPIs + charts + LocationGeoMap + summary panels                               |
| hr-executive-summary | Pure dashboard (KPIs + charts + summary; no grid)                             |

A `DashboardDefinition` declarative composition layer (backend layout JSON → frontend renderer) would be needed to make these "zero TS per report". That is a multi-PR sub-chain on its own. PR-D series **does not claim "hr-compensation is fully dynamic"**; we claim "the catalog grid for hr-compensation reads its metadata from the backend dynamic-report contract."

---

## 8. D0 acceptance criteria

This document is ready to ship when:

- [x] All 7 modules have a filled row in §2 (Observed / Identity / Gap / Decision / Required work).
- [x] Each module has an explicit blocker list.
- [x] Each module has a proposed first dynamic key and route preservation strategy.
- [x] Each module has a data-source decision status (SQL candidate, virtual adapter candidate, or "unknown / needs backend discovery").
- [x] Existing backend definitions (`hr-compensation-detay`, `hr-demografik-yapi`) are marked as existing, NOT to-be-created.
- [x] The doc ends with a ranked PR-D1 candidate list and rationale for the first candidate.
- [x] High-risk claims cite file/path evidence (frontend modules + backend schema file + backend report JSON sampled).
- [ ] Cross-AI Codex post-impl review of this matrix' accuracy + schema-extension proposal (post-commit).

---

## 9. Next steps — split PR-D1 into D1a (contract slice) + D1b (apply slice)

Codex iter-2 absorbed: do not collapse contract + first migration into one PR. Two slices:

### PR-D1a — Backend contract slice (NO module migration yet)

Backend-only contract widening so PR-D1b has a stable producer to author against.

1. Extend backend L1 (`report-definition.schema.json`) ColumnDefinition vocabulary:
   - Variants: `badge`, `status`, `currency`, `boolean`, `bold-text` (plus retained `text`, `number`, `date`).
   - Per-variant config: `variantMap` / `labelMap` / `statusMap` / `defaultVariant` / `filterValues` / `currencyCode` / `decimals` / `suffix` / `format`.
   - `additionalProperties: false` retained; new fields opt-in with strict typing (badge variant enum, statusMap value `{variant, labelKey}` schema).
2. Update backend Java records: `ReportDefinition.java` / `ColumnDefinition.java` (or nested per-variant config records) + DTOs (`ReportListItemDto.java`, `ReportMetadataDto.java`).
3. Add `ReportListItemDto.routeSegment?: string` + `ReportListItemDto.sharedReportId?: string` (§3).
4. Add `ReportDefinition.filterDefinitions: FilterDefinition[]` (§4).
5. Extend the schema-validation contract tests + registry sweep — all 33 existing dynamic reports must continue to validate.
6. **NO** report definitions are modified; NO frontend changes; NO module migration.

### PR-D1b — Frontend transport DTO + dynamic factory extension

Frontend pieces required before any module can be migrated. Lands AFTER PR-D1a.

1. Extend L2 `ReportColumnMeta`: 4 new variants (badge, status, currency, boolean) + bold-text + 3 new config fields (format, defaultVariant, filterValues). `link` and `actions` variants are explicitly OUT of D-chain scope unless a future migration target needs them.
2. Extend L2 `ReportMetadata`: add `filterDefinitions?: FilterDefinition[]`.
3. Extend L2 `ReportListItem`: add `routeSegment?`, `sharedReportId?`.
4. Update `metadata-cache.ts` mapper to preserve all new fields end-to-end.
5. Extend `DynamicReportFilters` from `{ search }` to dynamic Record keyed per FilterDefinition.
6. Implement `renderFilters` dispatcher that reads `getCachedFilterDefinitions(report.key)` and emits per-kind widgets.
7. Implement `createInitialFilters` URL-param round-trip per FilterDefinition.
8. Implement advancedFilter translator (sidebar values + grid filterModel → backend JSON, honoring `operator` + `advancedFilterTarget`).
9. Implement `optionsSource` resolver (`endpoint` + `filter-values` modes; cache; tenant-aware).
10. ReportingApp + useCatalog dedupe against `routeSegment ?? key` (§3 identity).
11. Dynamic factory `sharedReportId` uses `report.sharedReportId ?? 'dynamic:${report.key}'` (§3 identity).
12. Tests: per-kind renderer + URL-param round-trip + advancedFilter translator + optionsSource cache.

### PR-D2 — First migration slice (hr-demografik-yapi)

After D1a + D1b land, the smallest backend definition update + frontend module drop:

1. Update `hr-demografik-yapi.json` columns with the new variant types + camelCase aliases (move case mapping into SQL).
2. Author `filterDefinitions` array for hr-demografik's 5 sidebar entries.
3. Set `routeSegment: 'hr-demografik-yapi'` + `sharedReportId: 'hr-demografik-yapi'`.
4. Frontend: drop `apps/mfe-reporting/src/modules/hr-demographic-report/` (grid path); keep `DemographicDashboard` only if registered through a thinner wrapper or moved to dashboard-only side channel.
5. testai deploy + browser smoke: route preserved, badge variants render, suffix "yıl" appears, date format short parity, favorites/saved filters survive (capability binding tested).

PR-D2 sets the migration pattern; subsequent module migrations (PR-D2.x) follow it.

---

## 10. PR-D1 backend touchpoints

Files in `platform-backend` that PR-D1a + PR-D1b will modify (Codex iter-2 absorbed: enumerate ahead of time to prevent D1 scope sprawl).

### Backend Java records (D1a)

| File                                                      | Change                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `report-service/src/main/java/.../ReportDefinition.java`  | Extend column shape; add `filterDefinitions` field                                              |
| `report-service/src/main/java/.../ColumnDefinition.java`  | Widen `type` to 8 variants (+ bold-text); add per-variant config nested records                 |
| `report-service/src/main/java/.../ReportListItemDto.java` | Add `routeSegment?`, `sharedReportId?`                                                          |
| `report-service/src/main/java/.../ReportMetadataDto.java` | Carry `filterDefinitions` + extended ColumnDefinition shape                                     |
| `report-service/src/main/java/.../FilterDefinition.java`  | NEW record per §4 contract                                                                      |
| `report-service/src/main/java/.../FilterKind.java`        | NEW enum: text-search / enum-select / date-range / number-range / company-picker / month-picker |
| `report-service/src/main/java/.../ReportController.java`  | List + metadata constructors return new fields                                                  |

### Backend JSON contracts (D1a)

| File                                                                       | Change                       |
| -------------------------------------------------------------------------- | ---------------------------- |
| `report-service/src/main/resources/contract/report-definition.schema.json` | Schema extension per §1 + §4 |

### Backend tests (D1a)

| File                                 | Change                                                           |
| ------------------------------------ | ---------------------------------------------------------------- |
| Contract validation test             | All 33 existing reports must continue to validate post-extension |
| Registry sweep test                  | Verifies no regression in catalog                                |
| New: filterDefinitions contract test | Schema-validates new FilterDefinition shape                      |

### Frontend types + mapper (D1b)

| File                                                                      | Change                                                                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/mfe-reporting/src/modules/dynamic-report/types.ts`                  | Extend `ReportColumnMeta` + `ReportMetadata` + `ReportListItem` + add FilterDefinition types + widen `DynamicReportFilters` |
| `apps/mfe-reporting/src/modules/dynamic-report/metadata-cache.ts`         | Mapper carries new fields end-to-end without downgrade                                                                      |
| `apps/mfe-reporting/src/modules/dynamic-report/create-dynamic-module.tsx` | `renderFilters` dispatcher; identity resolution (route + sharedReportId); createInitialFilters URL-param round-trip         |
| `apps/mfe-reporting/src/modules/dynamic-report/api.ts`                    | advancedFilter translator extension; optionsSource resolver                                                                 |
| `apps/mfe-reporting/src/app/reporting/ReportingApp.tsx`                   | Dedupe against `routeSegment ?? key`                                                                                        |
| `apps/mfe-reporting/src/app/reporting/useCatalog.ts`                      | Dedupe against `routeSegment ?? key`                                                                                        |

### Frontend tests (D1b)

| File                                                                                        | Change                                        |
| ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `apps/mfe-reporting/src/modules/dynamic-report/__tests__/filter-renderer.test.tsx`          | NEW — per-kind widget render                  |
| `apps/mfe-reporting/src/modules/dynamic-report/__tests__/createInitialFilters.test.ts`      | NEW — URL-param round-trip                    |
| `apps/mfe-reporting/src/modules/dynamic-report/__tests__/advancedFilter-translator.test.ts` | NEW — sidebar + grid model → backend JSON     |
| `apps/mfe-reporting/src/modules/dynamic-report/__tests__/optionsSource-resolver.test.ts`    | NEW — endpoint cache + filter-values delegate |
| `apps/mfe-reporting/src/app/reporting/__tests__/dedupe.test.tsx`                            | Extend — dedupe against routeSegment          |

---

## 11. roles-access — multi-field search decision (Codex iter-2 raised)

Static `access-report` filters on `${row.roleName} ${row.moduleSummary}` lowercased substring (api.ts:111-113). Backend SQL has no precedent for multi-column free-text search, and `moduleSummary` is computed (not a stored column). Three options for migration:

- **(a)** Add a SQL computed column `search_blob = roleName + ' ' + COALESCE(STRING_AGG(module_label), '')` in the view; advancedFilter targets it with `contains`.
- **(b)** Virtual adapter wrapping `/v1/roles` with the same client-side join logic moved server-side.
- **(c)** Drop multi-field search; UX regression — search only matches `roleName`.

PR-D2 (or its access slice) must record which is chosen. Recommended path (a) if dialect supports STRING_AGG; (b) otherwise.

---

## References

- PR-A `e7048944`: grid-rendering contract — code (CompensationDashboard mini-tables → GridShell)
- PR-B `f814f190`: grid-architecture vitest CI gate
- PR-C `74d6818b`: grid-rendering contract — docs (`docs/architecture/grid-rendering.md`)
- Codex thread `019e7f8f` — cross-AI plan-time consensus + REVISE absorption
- Backend schema: `platform-backend/report-service/src/main/resources/contract/report-definition.schema.json`
- Backend reports directory: `platform-backend/report-service/src/main/resources/reports/`
- Frontend ReportColumnMeta (L2): `apps/mfe-reporting/src/modules/dynamic-report/types.ts:42`
- Frontend ColumnMeta (L3): `packages/design-system/src/advanced/data-grid/column-system/types.ts:287`
- Frontend module ReportModule contract: `apps/mfe-reporting/src/modules/types.ts:33`
- Dynamic factory: `apps/mfe-reporting/src/modules/dynamic-report/create-dynamic-module.tsx`
