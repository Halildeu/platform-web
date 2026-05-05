# Test Environment Boundaries — Cheat Sheet

> Operational reference. Architectural rationale lives in
> [`docs/architecture/frontend/adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md).

## Pick the right suffix

| If you are testing…                                       | Use suffix            | Runner                    | Example                    |
| --------------------------------------------------------- | --------------------- | ------------------------- | -------------------------- |
| DOM structure, ARIA, hooks, prop contract, event dispatch | `*.unit.test.tsx`     | Vitest jsdom              | `Button.unit.test.tsx`     |
| Public API surface, displayName, ref forwarding           | `*.contract.test.tsx` | Vitest jsdom              | `Button.contract.test.tsx` |
| Resolved CSS, token variables, theme switch, focus ring   | `*.cssom.test.tsx`    | Vitest browser (Chromium) | `Button.cssom.test.tsx`    |
| Invariant snapshot (theme/focus/density/RTL matrix)       | `*.visual.test.ts`    | Playwright                | `theme-matrix.visual.ts`   |
| End-to-end user journey                                   | `*.e2e.test.ts`       | Playwright + dev server   | placed under `e2e/`        |
| Legacy untyped unit (existing files)                      | `*.test.tsx`          | Vitest jsdom              | retained as-is             |

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

### In `*.visual.test.ts`

- ❌ Per-component snapshots outside `x-charts`. One snapshot per matrix page.
- ❌ Importing component sources directly to render — render through Storybook (`.storybook-invariants` config) or a standalone Playwright fixture page.
- ❌ Adding new files outside `packages/design-system/src/__visual__/invariants/` (CI guard `scripts/ci/check-visual-invariant-boundary.mjs` blocks this on touched files).
- ✅ Theme/focus/density/RTL matrix snapshots that consolidate many primitives onto one page.

**Legacy `*.visual.ts` files** (`__visual__/{components,patterns,primitives,...}.visual.ts`): retained for history, **not CI-gated**, no new additions or baseline updates. These pre-date the L4 invariant matrix pattern and will be archived in a separate cleanup PR.

## How the gate sees you

CI workflow `web-test-gate.yml` wires each suffix to a static-named job:

| Job                         | Suffix it runs                                                       | Status             |
| --------------------------- | -------------------------------------------------------------------- | ------------------ |
| `unit-required`             | `*.unit.test.{ts,tsx}` + legacy `*.test.tsx` + `*.contract.test.tsx` | required           |
| `token-drift-required`      | `tokens:build --check` + `tokens:build:theme --check`                | required           |
| `cssom-canary-required`     | curated canary subset of `*.cssom.test.{ts,tsx}`                     | required           |
| `cssom-full-advisory`       | full `*.cssom.test.{ts,tsx}`                                         | advisory           |
| `visual-invariant-required` | `*.visual.test.ts` under `__visual__/invariants/`                    | required (post-L4) |
| `visual-full-advisory`      | remaining `*.visual.test.ts`                                         | advisory           |

Branch protection requires only the aggregator `web-test-gate-required`. To promote advisory → required, set repo variable `STRICT_GATES=true`; the aggregator script reads advisory job results and fails if any required-by-strict-mode job failed. See ADR for why this is not a literal `needs:` mutation.

## Migration policy

- **New tests** — use the new suffix. Lint emits a warning if you author a `*.test.tsx` without a more specific suffix.
- **Touched legacy files** — opportunistic upgrade; not mandatory in the same PR as a feature change.
- **Bulk rename** — out of scope for PR-1. Scheduled per package, single PR per package, after the gate is established.

## When you violate the boundary

ESLint emits a warning. The aggregator does not fail on lint warnings. CI keeps moving; the warning surfaces in the lint job summary and the PR review feedback. After adoption stabilizes (monitored quarterly), the rule flips from `warn` to `error`.
