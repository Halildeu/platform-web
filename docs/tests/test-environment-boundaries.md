# Test Environment Boundaries — Cheat Sheet

> Operational reference. Architectural rationale lives in
> [`docs/architecture/frontend/adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md).

## Pick the right suffix

| If you are testing…                                       | Use suffix            | Runner                    | Example                       |
| --------------------------------------------------------- | --------------------- | ------------------------- | ----------------------------- |
| DOM structure, ARIA, hooks, prop contract, event dispatch | `*.unit.test.tsx`     | Vitest jsdom              | `Button.unit.test.tsx`        |
| Public API surface, displayName, ref forwarding           | `*.contract.test.tsx` | Vitest jsdom              | `Button.contract.test.tsx`    |
| Resolved CSS, token variables, theme switch, focus ring   | `*.cssom.test.tsx`    | Vitest browser (Chromium) | `Button.cssom.test.tsx`       |
| Invariant snapshot (theme/focus/density/RTL matrix)       | `*.visual.test.ts`    | Playwright                | `theme-matrix.visual.test.ts` |
| End-to-end user journey                                   | `*.e2e.test.ts`       | Playwright + dev server   | placed under `e2e/`           |
| Legacy untyped unit (existing files)                      | `*.test.tsx`          | Vitest jsdom              | retained as-is                |

## What you may NOT do

### In `*.unit.test.{ts,tsx}`

- ❌ `getComputedStyle(...)` / `window.getComputedStyle(...)` — jsdom returns empty strings; mocked values are not real.
- ❌ `expect(...).toHaveStyle({...})` — same reason.
- ❌ Resolved CSS variable assertions (`expect(root).toHaveStyle({ '--token': ... })`).
- ❌ Importing `cssom-harness` or any browser-only matcher.
- ✅ ARIA roles, hook state, event handlers, prop forwarding, conditional render branches.

### In `*.cssom.test.{ts,tsx}`

- ❌ `vi.spyOn(window, 'getComputedStyle')` or any mock of resolved style.
- ❌ jsdom-only stubs (canvas mock, `Path2D` shim, fake `matchMedia`). The real Chromium environment provides them.
- ❌ Component-level visual snapshots — those go in `*.visual.test.ts` invariant matrices.
- ✅ `expectToken`, `withTheme`, `expectFocusRing` from `cssom-harness`.

### In production source (Tailwind class names)

- ❌ Template-literal-built class names (e.g. `` `bg-${color}` ``, `` `ring-${width}` ``). Tailwind 4 content scanner cannot detect these and silently drops the rule. cssom canary catches the resulting "class on DOM but CSS not emitted" bug.
- ✅ Literal class strings — pre-register every dynamic choice in a `Record<Key, string>` lookup table. See [`docs/operations/tailwind-literal-class-rule.md`](../operations/tailwind-literal-class-rule.md) for full patterns.

### In `*.visual.test.ts`

- ❌ Per-component snapshots outside `x-charts`. One snapshot per matrix page.
- ❌ Importing component sources directly to render — render through Storybook (`.storybook-invariants` config) or a standalone Playwright fixture page.
- ❌ Adding new files outside `packages/design-system/src/__visual__/invariants/` (CI guard `scripts/ci/check-visual-invariant-boundary.mjs` blocks this on touched files).
- ✅ Theme/focus/density/RTL matrix snapshots that consolidate many primitives onto one page.

**Legacy non-x-charts `*.visual.ts` files** were removed in PR-4b (12 spec files + 588 PNG baselines). Two CI-gated lanes remain in `__visual__/`: `invariants/` (this gate) and `x-charts*.visual.ts` (separate `x-charts-visual-gate.yml` workflow). New visual snapshots **must** go under `invariants/`.

## How the gate sees you

CI workflow `web-test-gate.yml` wires each suffix to a static-named job:

| Job                             | Suffix it runs                                                                                                                                     | Status   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `unit-required`                 | `*.unit.test.{ts,tsx}` + legacy `*.test.tsx` + `*.contract.test.tsx`                                                                               | required |
| `token-drift-required`          | `tokens:build --check` + `tokens:build:theme --check`                                                                                              | required |
| `cssom-canary-required`         | curated manifest: Tailwind sentinel + ThemeProvider + 10 primitives (Button, Input, Checkbox, Switch, Radio, Card, Dialog, Drawer, Tooltip, Alert) | required |
| `cssom-full-advisory`           | full `*.cssom.test.{ts,tsx}`                                                                                                                       | advisory |
| `lint-warn-visibility-advisory` | DS ESLint warning report (severity 1 only)                                                                                                         | advisory |
| `visual-invariant-required`     | `*.visual.test.ts` under `__visual__/invariants/`                                                                                                  | required |
| `web-test-gate-required`        | aggregator (`needs:` against the required set + STRICT_GATES guard)                                                                                | required |

`x-charts*.visual.ts` runs in its own workflow (`x-charts-visual-gate.yml`), not in `web-test-gate.yml`. Legacy non-x-charts `*.visual.ts` specs were removed in PR-4b; there is no `visual-full-advisory` lane.

Branch protection requires only the aggregator `web-test-gate-required`. To promote advisory → required, set repo variable `STRICT_GATES=true`; the aggregator reads `cssom-full-advisory` and `lint-warn-visibility-advisory` job outputs and fails on advisory infra failure (NOT on lint warning count — see ADR §L5). This is an aggregator script, not a literal `needs:` mutation, because GitHub Actions does not allow runtime `needs:` injection.

## Migration policy

- **New tests** — use the new suffix. Lint emits a warning if you author a `*.test.tsx` without a more specific suffix.
- **Touched legacy files** — opportunistic upgrade; not mandatory in the same PR as a feature change.
- **Bulk rename** — out of scope for PR-1. Scheduled per package, single PR per package, after the gate is established.

## When you violate the boundary

ESLint emits a warning. The aggregator does not fail on lint warnings. CI keeps moving; the warning surfaces in the lint job summary and the PR review feedback. After adoption stabilizes (monitored quarterly), the rule flips from `warn` to `error`.
