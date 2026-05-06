# ADR: Test Environment Strategy & CSSOM Boundary

## Status

**Accepted** — 2026-05-05

## Decision

Test files declare their target environment through naming. Every file maps to exactly one runner. CSSOM, computed style, theme switch, real cascade and WCAG contrast belong to a real browser environment; jsdom is reserved for DOM logic, ARIA semantics, hooks and prop contract. The boundary is enforced by lint, not by convention alone.

| Suffix                     | Environment                        | What it tests                                                            | Default gate                                    |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `*.unit.test.{ts,tsx}`     | jsdom (Vitest)                     | DOM structure, ARIA, hooks, prop contract, event dispatch                | required                                        |
| `*.contract.test.tsx`      | jsdom (Vitest)                     | Public API surface, displayName, ref forwarding                          | required                                        |
| `*.cssom.test.{ts,tsx}`    | Chromium (Vitest browser provider) | Resolved CSS, token variables, theme switch, focus ring, container query | required (canary) + advisory (full)             |
| `*.visual.test.ts`         | Playwright                         | Invariant matrices (theme/focus/density/RTL)                             | required (invariant); x-charts has its own gate |
| `*.e2e.test.ts`            | Playwright + dev server            | User journeys against `apps/`                                            | nightly                                         |
| `*.test.{ts,tsx}` (legacy) | jsdom (Vitest)                     | Legacy unit, treated as `unit` until renamed                             | required                                        |

## Context

Test infrastructure had drifted into an environment-confused state:

- jsdom cannot parse Tailwind 4 `@layer`, container queries, `:has()`, CSS nesting, or `@property`. CSS variables resolve to empty strings. (Setup.ts pattern list confirms: `"Could not parse CSS"`, `"tailwind"`, `"content layer"` are suppressed.)
- axe-core `color-contrast` is disabled in unit tests because resolved values are unavailable. (`packages/design-system/src/__tests__/a11y-utils.ts:20`)
- Two real call sites (`a11y-guardian.test.ts`, `useAutoThemeAdapter.test.ts`) mock `window.getComputedStyle` to inject synthetic values.
- Of 1031 unit-style tests, only three use `toHaveStyle`. CSSOM-driven assertions are effectively absent.
- 99 `*.browser.test.tsx` files exist and target a real Chromium provider via `@vitest/browser-playwright`, but the CI workflow that runs them has never been created. The `npm run test:browser` script is not invoked by any workflow.
- 194 `*.visual.test.ts` / `*.visual.ts` files existed at the time of this audit; only the `x-charts` subset was enforced as a hard gate (`x-charts-visual-gate.yml`). The remainder was dormant. _(Inventory at PR-1 commit; PR-4b later removed the dormant non-x-charts files. Current `__visual__/` tree is `invariants/` (4 files) + `x-charts*.visual.ts`.)_

The result: token rename, theme switch, real cascade conflicts, container queries and WCAG contrast regressions are not caught by any automated gate before merge.

## Solution

### L1 — Environment Boundary Contract

Each test file declares its environment via filename suffix. The mapping is canonical and enforced by ESLint:

- A file ending in `*.unit.test.{ts,tsx}` may not import `getComputedStyle`, `window.getComputedStyle`, `toHaveStyle`, or any CSSOM-only matcher. It runs in jsdom.
- A file ending in `*.cssom.test.{ts,tsx}` may not rely on jsdom-only stubs (e.g. canvas mocks, `Path2D` shims, `matchMedia` mocks). It runs in Chromium via the Vitest browser provider.
- Visual snapshots live in `*.visual.test.ts` and target the Playwright runner; they are forbidden from importing component sources directly to discourage component-level snapshot drift (one snapshot per matrix page, not per component — see L4).
- E2E specs live under `e2e/` (existing layout) and remain Playwright-only.

Migration is gradual:

1. Lint emits warnings for new violations only (touched-file enforcement; legacy `*.test.tsx` files keep their current behavior).
2. Touched files in PRs are upgraded as opportunity arises.
3. A scheduled audit (separate workstream) renames legacy `*.test.tsx` to `*.unit.test.tsx` per package, in PRs no larger than one package at a time.

### L2 — Token Drift Gate (build-time)

`tokens:build --check` and `tokens:build:theme --check` already exist (both scripts support `--check` mode and exit non-zero on drift). PR-1 wires them into CI as a required job. Output drift, semantic token presence in `generated-theme-inline.css`, and `theme.css` alias resolution are validated. Token rename is detected at build time, not at runtime.

A second-wave PR adds the impacted-component map (which components consume which token); PR-1 covers only drift detection.

### L3 — CSSOM Harness API

A small, taste-driven matcher set lives at `packages/design-system/src/__tests__/cssom-harness.ts`:

- `expectToken(el, property, tokenName)` — reads computed style, compares to the resolved CSS variable for `--{tokenName}`.
- `withTheme(themeName, fn)` — toggles `data-mode` on `documentElement` (the attribute the Tailwind 4 `dark` variant reads in this repo), runs assertions, restores.
- `expectFocusRing(el)` — asserts non-empty box-shadow / outline after `focus-visible`.

Container query support is deferred to a follow-up: the API requires a host element with `container-type: inline-size` and explicit width transitions, which warrants a separate harness rather than a one-liner.

The harness is gated by the Tailwind 4 layer build sentinel, which proves on every CI run that the Vitest browser provider's Vite plugin chain emits resolved CSS variables for the document root. Without this sentinel, Chromium would silently render token-less surfaces.

**Project rule — Tailwind 4 "class on DOM but CSS not emitted" prevention.** Two distinct failure modes share the same symptom: (A) the content scanner can't see template-literal-built class names so the utility never compiles (PR-10 peer-focus-visible helpers, PR-15 color-override lookup); (B) a literal class references a token that isn't in the `@theme inline` registry, so Tailwind drops the rule despite the literal being scanner-visible (PR-12 backdrop sweep — `bg-surface-inverse` was unregistered while `bg-surface-overlay` was). The cssom canary catches both because `expectToken` / `expectFocusRing` / `className.toContain` read computed style and class strings, both of which fail when CSS isn't emitted. Full pattern catalog + when to use literal lookup tables vs theme-registry promotion: [`docs/operations/tailwind-literal-class-rule.md`](../../operations/tailwind-literal-class-rule.md).

### L4 — Visual Diff Economy

Visual snapshots are limited to invariant matrix pages. Component-level snapshots are forbidden outside `x-charts` (which has its own gate established in K5). Matrix pages live under `packages/design-system/src/__visual__/invariants/` and consolidate primitives, form controls, overlays, and theme into a small set of pages (9 snapshots in PR-3, target 8–12 total). One token change produces one expected diff, not a per-component fan-out.

**PR-3 implementation** (Codex thread `019df8eb`):

- Dedicated `playwright.invariants.config.ts` (chromium-only, snapshot dir `__snapshots__/invariants/`)
- Dedicated `.storybook-invariants/` minimal config (K5 pattern: zero addons, autodocs false, reactDocgen false)
- Four matrix files in `packages/design-system/src/__visual__/invariants/`:
  - `theme-matrix.visual.test.ts` — 2 snapshots (light + dark)
  - `focus-matrix.visual.test.ts` — 2 snapshots (light + dark, focus ring)
  - `density-matrix.visual.test.ts` — 3 snapshots (compact + comfortable + spacious)
  - `rtl-matrix.visual.test.ts` — 2 snapshots (LTR + RTL)
- Total: 9 chromium snapshots
- Test suffix: `*.visual.test.ts` (Vitest convention parity, not legacy `*.visual.ts`)
- `maxDiffPixelRatio: 0.01` (tighter than x-charts 0.02; invariant scope is small enough to tolerate the strict threshold)
- Baseline production: `gh workflow run web-test-gate.yml -f mode=invariant-baseline` → Linux artifact → maintainer commit (no auto-commit), pattern shared with x-charts

**Legacy non-x-charts visual specs** (`packages/design-system/src/__visual__/*.visual.ts` excluding `x-charts*.visual.ts`):

**Removed in PR-4b** after PR-3 established the L4 invariant matrix. The 12 legacy spec files (`primitives`, `components`, `patterns`, `dark-mode`, `rtl`, `providers`, `interactions`, `internals`, `enterprise`, `performance`, `app-sidebar`, `components-extra`) and their 588 committed baselines were deleted. Two CI-gated lanes remain in `__visual__/`: `invariants/` (L4) and `x-charts*.visual.ts` (chart gate). `playwright.config.ts` `testMatch` was narrowed to `x-charts*.visual.ts`.

**Forward-looking guard** (`scripts/ci/check-visual-invariant-boundary.mjs`):

A changed-files audit script fails CI when a PR introduces:

- New `*.visual.test.ts` outside `__visual__/invariants/`
- New `*.visual.ts` outside the existing `x-charts.visual.ts` / `x-charts-mobile.visual.ts` allowlist
- New `*.visual.test.tsx` colocated with components

The script is touched-files-aware (uses `origin/main...HEAD` diff) so the existing legacy file inventory does not trigger a fail at install time.

### L5 — CI Orchestration

A single workflow `web-test-gate.yml` runs:

- `unit-required` — Vitest jsdom across the workspace.
- `token-drift-required` — `tokens:build --check` and `tokens:build:theme --check`.
- `cssom-canary-required` — Vitest browser provider, **curated manifest** (Tailwind 4 sentinel + ThemeProvider + 10 primitives: Button, Input, Checkbox, Switch, Radio, Card, Dialog, Drawer, Tooltip, Alert). Manifest is an explicit list in `package.json` `test:cssom:canary` rather than a glob, so the gate stays fast (≈1m20s) and additions are deliberate. PR-9 cutover to manifest pattern; PR-10 added Radio (a11y follow-up); PR-11 added Card (variant-token cascade); PR-12 added Dialog + Drawer (overlay panel + backdrop cascade — also caught and fixed a production bug where `bg-surface-inverse/40` never compiled because `--color-surface-inverse` wasn't registered as a Tailwind theme color); PR-14 added Tooltip + Alert (inverted-color cascade + state-variant matrix). New primitive cssom tests should be added to the manifest as the foundation expands, balanced against the canary's runtime budget.
- `cssom-full-advisory` — Vitest browser provider, full `*.cssom.test` set (when populated).
- `lint-warn-visibility-advisory` — DS ESLint warning report (PR-2B-3): surfaces touched-file warning counts and rule top-10 in a sticky PR comment, fails only on ESLint infra errors, never on warning count.
- `visual-invariant-required` — Playwright on `__visual__/invariants/` matrices (post-L4).
- `visual-invariant-baseline` — manual `workflow_dispatch` (mode=`invariant-baseline`) for Linux baseline regeneration; uploads artifact, no auto-commit.

`x-charts*.visual.ts` is gated by a separate workflow (`x-charts-visual-gate.yml`); it is intentionally not part of this aggregator because chart pixel-diff economics differ from invariant matrix economics. There is no `visual-full-advisory` job — legacy non-x-charts visual specs were removed in PR-4b.

Each job uses a static name so branch protection rules can require the desired set. An aggregator job `web-test-gate-required` declares `needs:` against the required set; branch protection requires only the aggregator. `STRICT_GATES` lifts advisory checks into required by routing them through a small results script in the aggregator (advisory job results are read from the workflow context; failures fail the aggregator). The "single env-var toggle" framing is intentionally a strict-gates aggregator script, not a literal `needs:` mutation, because GitHub Actions does not allow runtime `needs:` injection. For `lint-warn-visibility-advisory` specifically, the strict-gates aggregator catches **infra** failures only — install crash, missing/empty/invalid `eslint-report.json`, or a crash in the summarize/comment script. The lint step itself runs ESLint with `|| true` so its exit code never bubbles up; severity-2 ESLint diagnostics are counted as `ignored_errors` and labelled separate debt. Warning _count_ is intentionally NOT a strict-gates blocker (current baseline ~800 would lock every PR).

The aggregator's branch logic is simulated locally by `pnpm gate:dry-run <fixture>` (PR-13). The dry-run reads a JSON fixture describing per-job result/outcome and applies the same conditions the YAML applies — including the **asymmetry** between `cssom-full-advisory` (3 checks) and `lint-warn-visibility-advisory` (2 checks; no `outcome != success/skipped` rule). Bundled fixtures cover all-green, cssom-full step failure, cssom-full install crash, cssom-full cancelled, lint summarize-step crash, lint step failure, lint cancelled (passes — demonstrates the asymmetry), required-job failure, and the strict-off default mode (9 fixtures total). `pnpm gate:dry-run:all` runs them all and asserts each matches its declared `_expected_exit`, catching script-vs-YAML drift. See [`docs/operations/strict-gates-cheat-sheet.md`](../../operations/strict-gates-cheat-sheet.md) for the full operator workflow.

## Consequences

### What this enables

- Token rename, theme switch, real cascade, focus ring, and container query regressions become detectable before merge.
- New tests author against a single, taste-driven harness. CSSOM assertions stop being copy-pasted mocks.
- Snapshot maintenance cost stays constant in component count (matrix pages, not per-component).
- Cutover toggle is a single CI variable change, not a workflow rewrite.

### What this trades off

- One extra CI lane (Chromium browser provider). Cost rises with `cssom-full` adoption; the canary lane stays fast.
- Authors must learn the suffix convention. Lint rule emits warnings on touched files until adoption is broad enough to flip to errors.
- Legacy `*.test.tsx` files are not renamed in PR-1. They remain on jsdom, and the CSSOM gap they leave is filled by new `*.cssom.test` files written against the harness, not by mass renames.
- Container query coverage is deferred. PR-1 is scoped to make the gate work; the more ambitious matchers come after the sentinel proves the harness.

### What this rejects

- Switching the unit runner from jsdom to happy-dom. Tailwind 4 `:has()`, `@property`, container queries and real WCAG contrast require a real browser engine; happy-dom is a partial CSSOM polyfill that produces false confidence.
- Component-level visual snapshots outside `x-charts`. The maintenance cost is linear in component count and produces low-signal diffs on token changes.
- Extending AG Grid/data-grid wrappers into the CSSOM canary set. AG Grid Enterprise has its own browser test infrastructure; wrapping it adds flake (ResizeObserver, virtualization, license init) without proportional signal. A small Playwright smoke for theme/density/container surfaces is sufficient and lives in its own job.

## References

- Existing token build pipeline: `scripts/tokens/build-tokens.mjs`, `scripts/theme/generate-theme-css.mjs`, `scripts/tokens/validate-tokens.mjs`.
- Existing visual gate (preserved): `.github/workflows/x-charts-visual-gate.yml`.
- Existing browser config: `packages/design-system/vitest.browser.config.ts`.
- Adversarial review thread: Codex thread `019df733-973c-7793-bb55-936c46d6c167`, iter-2 verdict `Small PARTIAL`.
- Cross-AI peer review rule: `~/.claude/CLAUDE.md` — AI Reviewer ≠ AI Implementer.
