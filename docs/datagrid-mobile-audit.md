# DataGrid Mobile Audit (a11y-pr1 follow-up)

> **Why this document:** Codex's plan-time review (2026-05-04) flagged
> the original "DataGrid mobile yatırımı yok" claim as PARTIAL. AG Grid
> v34 ships native mobile behaviour and the DS wrapper layer already
> exposes a `ColumnMeta.responsive.hideBelow` mechanism — but adoption
> across active grid consumers has not been measured. This audit
> measures both layers (infrastructure + adoption) and surfaces the
> gap.
>
> **Scope:** `@mfe/design-system/advanced/data-grid` wrapper + the
> active consumers (mfe-users `UsersGrid`, mfe-access `RolesGrid`,
> mfe-reporting grids that consume `ColumnMeta`).

---

## §0 Headline finding

DS DataGrid wrapper already has a **column-level mobile hide** primitive
that nobody uses. Infrastructure score: ✅. Adoption score: 0 / N.

| Layer                                | Surface                                                      | State                              |
| ------------------------------------ | ------------------------------------------------------------ | ---------------------------------- |
| AG Grid v34 native                   | column virtualization, horizontal scroll, density            | works at any viewport              |
| DS `ColumnMeta.responsive.hideBelow` | `'sm' \| 'md' \| 'lg' \| 'xl'` filter at `buildColDefs` time | infra ✅, adopters: **0**          |
| DS `GridShell` toolbar / pagination  | `<GridToolbar>`, `<TablePagination>`, status bar             | no mobile-specific behaviour found |
| Consumer column meta                 | `mfe-users/UsersGrid`, `mfe-access/RolesGrid`, etc.          | `responsive` field never set       |

The wrapper is mobile-aware in principle; the data inputs feeding it
aren't. That's the gap.

---

## §1 What the wrapper layer already does

### §1.1 Column-level responsive hide

`packages/design-system/src/advanced/data-grid/column-system/types.ts:67`

```ts
responsive?: { hideBelow?: 'sm' | 'md' | 'lg' | 'xl' };
```

Used by `buildColDefs` in `transformer.ts:40-68`:

```ts
const BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

export function buildColDefs<TRow>(
  columns: ColumnMeta[],
  t: TranslateFn,
  locale = 'tr-TR',
  permissions?: string[],
  viewportWidth?: number,
): ColumnDef<TRow>[] {
  const vw = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);

  return columns
    .filter((meta) => {
      if (meta.requiredPermission && permissions) {
        if (!permissions.includes(meta.requiredPermission)) return false;
      }
      if (meta.responsive?.hideBelow) {
        const bp = BREAKPOINTS[meta.responsive.hideBelow] ?? 0;
        if (vw < bp) return false;
      }
      return true;
    })
    .map((meta) => buildSingleColDef<TRow>(meta, t, locale));
}
```

**Two implementation gaps the wrapper itself has:**

1. **`viewportWidth` is read at `buildColDefs` call time.** No
   ResizeObserver wires the value into a recomputation, so a desktop
   user shrinking the window does NOT see columns hide; only an
   initial-mount mobile viewport gets the filter. For full
   responsive grid behaviour, consumers would need to call
   `buildColDefs` again on resize — which currently no one does.
2. **No way to mark a column "always visible on mobile."** The
   filter is opt-in (column hides if `hideBelow` set + viewport
   under breakpoint). There's no symmetric `showOnlyAt: 'mobile'`
   or "the most important column never disappears" guarantee.

### §1.2 GridShell toolbar / pagination

- `GridShell` renders the toolbar above the grid; no `flex-wrap` on
  the toolbar wrapper.
- `TablePagination` exposes a default arrangement; no breakpoint-
  driven "compact" mode (icons-only on mobile).
- Status bar / pinned rows / detail drawer: no mobile-specific
  behaviour.

### §1.3 What AG Grid handles natively

- Horizontal scroll on overflow.
- Column virtualization (off-screen columns aren't rendered).
- Touch event handling, scroll inertia.
- Density mode is a manual toggle, not an automatic mobile policy.

This is real and meaningful — it's why "AG Grid bare wrapper on
mobile" doesn't crash. But "doesn't crash" ≠ "good UX."

---

## §2 Adoption measurement

Searched every `ColumnMeta` consumer in the repo for `responsive:` /
`hideBelow:` usage:

```bash
grep -rEn 'responsive:|hideBelow' apps/ \
  --include='*.tsx' --include='*.ts' \
  | grep -v __tests__
```

**Result: zero hits in app-level code.** The only matches are the
type definition itself and the transformer that consumes it. No
consumer has ever set `meta.responsive`.

Active grid consumers identified:

| File                                                             | Grid name                                                        | Column count (est.)              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| `apps/mfe-users/src/widgets/user-management/ui/UsersGrid.ui.tsx` | `UsersGrid`                                                      | ~10-15 (user management columns) |
| `apps/mfe-access/src/widgets/roles-grid/RolesGrid.ui.tsx`        | `RolesGrid`                                                      | ~6-8 (role columns)              |
| `apps/mfe-reporting/src/visualization/chartTypeInference.ts`     | (consumes `ColumnMeta` for chart inference, not for grid render) | —                                |

Both `UsersGrid` and `RolesGrid` would benefit from `hideBelow` on
secondary columns (last-updated timestamps, audit metadata, role
descriptions) so a 375px viewport sees only the essential 3-4
columns.

---

## §3 Recommended remediation

### §3.1 Wrapper hardening (DS-level, single PR)

Address the two gaps in §1.1:

1. **Make column visibility re-compute on viewport resize.** Either:
   - Wire a `ResizeObserver` inside `GridShell` that re-runs
     `buildColDefs` and calls `gridApi.setGridOption('columnDefs', ...)`
     when the viewport crosses a breakpoint, OR
   - Pass `viewportWidth` as a hook (`useViewportWidth()`) and let
     consumers re-derive `colDefs` reactively.
   - Recommendation: latter. Keeps the wrapper unopinionated; lets
     consumers control update frequency.
2. **Add an explicit "essential column" marker.** Either via an
   `essential: true` field on `ColumnMeta`, or by documenting that
   the first column in the array is treated as essential. Either
   way, prevents accidental "all columns hidden on mobile" footgun.

### §3.2 Consumer adoption (per-MFE, sequenced)

PR-A `UsersGrid`: tag user management columns:

- essential: name, email, status
- `hideBelow: 'md'`: role, department
- `hideBelow: 'lg'`: created-at, last-login, audit metadata

PR-B `RolesGrid`: tag role columns:

- essential: name, scope
- `hideBelow: 'md'`: assigned-count, description

PR-C optional polish: add a `density: 'compact' | 'comfortable'`
override that flips automatically on mobile (manual today).

### §3.3 Visual verification

Same caveat as the MFE mobile audit: prefix counting is a proxy.
Real validation requires a Playwright + emulator pass on a 375px
viewport against the actual UsersGrid / RolesGrid screens, **after**
the consumer adoption PRs land.

---

## §4 What this audit is NOT

- **Not a "ship now" prescription.** §3 sketches the work; the
  team should sequence it against actual user volume + bug reports.
- **Not a dismissal of AG Grid.** AG Grid v34's native behaviour
  carries significant mobile load already. The audit is about the
  wrapper-layer policy that sits on top of AG Grid, where opt-in
  configuration is the bottleneck.
- **Not a Tailwind responsive prefix story.** GridShell uses AG
  Grid's CSS surface, not Tailwind responsive primitives, so
  `grep sm:|md:|lg:` is the wrong measurement here.

---

## §5 Cross-references

- [`mfe-mobile-audit.md` §1.1 / §6](./mfe-mobile-audit.md) — UsersGrid
  parent layout audit depends on the consumer-side adoption in §3.2.
- [`mfe-reporting-chart-shell-audit.md`](./mfe-reporting-chart-shell-audit.md)
  — different problem (chart shells), shares the "DS infra exists,
  adoption is the gap" pattern.

---

## §6 Reproducibility

```bash
# Wrapper-side responsive primitive
grep -A 5 'responsive\?:' \
  packages/design-system/src/advanced/data-grid/column-system/types.ts

# Wrapper-side filter implementation
grep -A 20 'BREAKPOINTS' \
  packages/design-system/src/advanced/data-grid/column-system/transformer.ts

# Consumer adoption
grep -rEn 'responsive:|hideBelow' apps/ \
  --include='*.tsx' --include='*.ts' \
  | grep -v __tests__

# Active grid consumer files
grep -rEn 'ColumnMeta' apps/ --include='*.tsx' --include='*.ts' \
  | grep -v __tests__ \
  | grep -v 'visualization/chartTypeInference'
```
