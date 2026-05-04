# MFE Mobile Audit (a11y-pr1 follow-up)

> **Why this document:** Codex's plan-time review (2026-05-04) flagged
> the original "5 MFE mobile'da çalışmıyor" claim as too coarse. Two
> of those MFEs (`ethic`, `suggestions`) are placeholder shells —
> doing a "responsive audit" on them is fake work. The other three
> (`users`, `audit`, `access`) are active product surfaces with real
> mobile drift. This document is the narrowed, evidence-based audit
> for the three that matter.
>
> **Out of scope:** `mfe-shell` (already 7% Tailwind responsive
> coverage, internal navigation surface), `mfe-reporting` (covered by
> [`mfe-reporting-chart-shell-audit.md`](./mfe-reporting-chart-shell-audit.md)),
> `mfe-suggestions` and `mfe-ethic` (placeholder shells; product-scope
> question first, not a responsive question).

---

## §0 Headline finding

| MFE          | Tailwind responsive prefixes       | overflow-x / min-w escape                          | Verdict                                |
| ------------ | ---------------------------------- | -------------------------------------------------- | -------------------------------------- |
| `mfe-users`  | **0**                              | **0**                                              | needs audit + remediation              |
| `mfe-audit`  | **0**                              | **0**                                              | needs audit + remediation              |
| `mfe-access` | **1** site (`md:flex-row` toolbar) | 1 site (`overflow-x-auto` + `min-w-[640px]` table) | partially handled; needs audit on rest |

`mfe-users` and `mfe-audit` are the most exposed: zero responsive
classes anywhere, zero AG-Grid overflow handling. `mfe-access` has the
beginning of a pattern (`PermissionRegistryPanel.ui.tsx`) but the rest
of the surface inherits no responsive policy.

**Important caveat (Codex framing):** Tailwind prefix density is a
proxy, not proof. Responsive behaviour can come from `flex-wrap`,
`overflow-x-auto`, AG Grid native column-sizing, or `PageLayout`
internals — none of which need a `sm:` prefix. The numbers below
say "no audit has happened here," not "definitely broken."

---

## §1 mfe-users (highest priority)

**Surface area:** UsersPage (the main route), UsersGrid (AG Grid
embed), UserActions toolbar, UserDetailDrawer, related cross-filter
test fixtures. Several files under `pages/users/` and
`widgets/user-management/ui/`.

**Responsive evidence found:** none. Zero Tailwind breakpoint
prefixes, zero `overflow-x-auto`, zero `min-w-[…]` overrides.

### §1.1 Likely mobile breakage points

1. **UsersGrid (AG Grid table)** — AG Grid v34 renders horizontal
   scroll natively, so the grid itself does not crash on a 375px
   viewport. But:
   - the grid wrapper in `UsersGrid.ui.tsx` has no `min-w-0` /
     `flex-1` policy, so a parent flex container with a long action
     toolbar can squeeze the grid to 0px width.
   - column visibility presets (which columns hide first on narrow
     viewports) aren't wired through `ColumnMeta.responsive.hideBelow`
     even though the DS layer supports it (DataGrid audit, §6 below).
2. **UserActions toolbar** — flex layout without `flex-wrap` or
   responsive icons-only mode collapses badly on mobile (similar to
   the wave 3 ChartToolbar problem before fix).
3. **UserDetailDrawer** — drawer width is likely fixed; on a mobile
   viewport it should be `w-full sm:w-[480px]` or similar.
4. **UsersPage container** — no `Container` (DS responsive max-width)
   wrapper found; likely full-bleed on every viewport.

### §1.2 Recommended audit plan

Single-step audit: load each major route on a 375×812 device and
record what breaks. Convert findings into a list of small targeted
PRs (likely 3-5):

- PR-A: `UsersGrid` parent layout — `min-w-0`, drawer width.
- PR-B: `UserActions` toolbar — `flex-wrap` or icons-only mobile mode.
- PR-C: column visibility presets via `ColumnMeta.responsive.hideBelow`
  (depends on the DataGrid audit's findings).

---

## §2 mfe-audit

**Surface area:** AuditApp (event feed page), AuditDetailDrawer,
AuditEventFeed, JsonPreview component. Smaller surface than
mfe-users.

**Responsive evidence found:** none. Zero Tailwind breakpoint
prefixes, zero overflow handling.

### §2.1 Likely mobile breakage points

1. **AuditEventFeed** — likely a list view; readability on 375px
   should be acceptable as-is, but timestamp/actor/severity column
   wrapping needs verification.
2. **AuditDetailDrawer** — same drawer-width concern as mfe-users.
3. **JsonPreview** — JSON preview in a tight viewport tends to break
   horizontally; needs `max-w-full overflow-x-auto` and a font-size
   policy.

### §2.2 Recommended audit plan

Single PR likely sufficient:

- Drawer width breakpoints + JsonPreview overflow.
- Event feed verification (no fix expected; just visual smoke).

---

## §3 mfe-access (partially handled)

**Surface area:** PermissionRegistryPanel, AssignmentsTab, data-access
pages. Some surfaces have started using responsive primitives.

**Responsive evidence found:**

- `PermissionRegistryPanel.ui.tsx:63` — `flex flex-col gap-3 md:flex-row md:items-start md:justify-between`
- `PermissionRegistryPanel.ui.tsx:86-87` — `mt-4 overflow-x-auto` + `w-full min-w-[640px]` table
- `AssignmentsTab.tsx:89` — `min-w-[280px]` input

These are the _correct_ shapes for mobile-first responsive — the panel
header collapses to a stacked column on mobile, the table gets a
horizontal scroll wrapper, and inputs get a sensible min width.

### §3.1 Remaining gaps

1. The pattern is only applied to `PermissionRegistryPanel`. Other
   pages under `pages/data-access/` have not adopted it.
2. AssignmentsTab is the only file using `min-w-[…]` — assignments
   tables and chip lists elsewhere likely overflow on mobile.

### §3.2 Recommended audit plan

Single PR pattern propagation:

- Apply the `PermissionRegistryPanel` mobile pattern to remaining
  pages under `data-access/`.
- Audit AssignmentsTab → if the chip cluster doesn't already wrap,
  add `flex flex-wrap`.

---

## §4 What this audit is NOT

- **Not a regression discovery.** No production bug report has cited
  any of these MFEs as broken on mobile; the audit is preventive.
- **Not a responsive prefix counting exercise.** The numbers above
  mean "no audit has happened here," not "definitely broken." Real
  proof requires a Playwright + emulator pass.
- **Not a Tailwind-or-bust prescription.** PageLayout, AG Grid native
  behaviour, drawer presets, and form inputs all have responsive
  knobs that don't need a `sm:` prefix to work. The right fix per
  module depends on what's already there.

---

## §5 Recommended sequencing (not blocking)

If/when the team picks up MFE mobile work:

1. **mfe-users first.** Highest user volume, AG Grid wrapper layout
   issues are the most likely real bug.
2. **mfe-audit next.** Smaller surface, easier to wrap up.
3. **mfe-access last.** Already partially handled; pattern propagation
   only.

Each MFE should get its own focused PR (not a mega-audit). Rationale:
mobile audit needs viewport-level visual verification per route; one
PR per MFE keeps the snapshot diff scoped.

---

## §6 Reference: DataGrid runtime audit linkage

`mfe-users` and parts of `mfe-access` use AG Grid via the DS
`GridShell` wrapper. The `ColumnMeta.responsive.hideBelow` mechanism
already exists in DS (per Codex's #6 verdict), but adoption hasn't
been measured. Tracked separately by
[`docs/datagrid-mobile-audit.md`](./datagrid-mobile-audit.md) (planned).

---

## §7 Reproducibility

```bash
# Tailwind responsive prefix density
for app in mfe-users mfe-audit mfe-access mfe-shell; do
  total=$(grep -rE 'className=' "apps/$app/src" --include='*.tsx' | wc -l)
  responsive=$(grep -rE '(sm:|md:|lg:|xl:)' "apps/$app/src" --include='*.tsx' | wc -l)
  echo "$app: total=$total responsive=$responsive"
done

# overflow-x escapes (signals responsive table wrapping)
grep -rEn 'overflow-x|min-w-\[' apps/mfe-users/src apps/mfe-audit/src apps/mfe-access/src \
  --include='*.tsx'
```
