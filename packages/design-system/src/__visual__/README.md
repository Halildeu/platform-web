# Visual Regression Tests

Playwright-based visual regression testing for design-system components via Storybook.

## Status (PR-3, 2026-05)

Three distinct lanes live in this directory:

1. **`invariants/`** — **Authoritative L4 lane** (PR-3). 9 chromium-only matrix snapshots covering theme/focus/density/RTL invariants. Gated by `web-test-gate.yml` `visual-invariant-required` (hard gate). New visual snapshots must go here. Run via `pnpm test:visual:invariants` (uses `playwright.invariants.config.ts` + `.storybook-invariants`).
2. **`x-charts*.visual.ts`** — Component-level chart gate, governed by `.github/workflows/x-charts-visual-gate.yml`. Exempt from the L4 boundary; remains a hard merge gate. Uses `.storybook-k5`.
3. **All other `*.visual.ts` files** (primitives, components, patterns, dark-mode, rtl, providers, interactions, internals, enterprise, performance, app-sidebar, components-extra) — **Deprecated, non-authoritative, manual-only**. Predate the L4 invariant matrix pattern. Not CI-owned. Will be archived in a separate cleanup PR. **Do not add new files** to this lane — the CI guard `scripts/ci/check-visual-invariant-boundary.mjs` enforces this on touched files.

See [`docs/architecture/frontend/adr-test-environment-strategy.md`](../../../../docs/architecture/frontend/adr-test-environment-strategy.md) §L4 for the full boundary contract.

## L4 Invariant Matrix (authoritative — PR-3)

```bash
# From repo root: build the dedicated minimal Storybook
pnpm --filter @mfe/design-system run build:invariants

# Then run the chromium-only invariant matrix:
pnpm --filter @mfe/design-system run test:visual:invariants

# Update baselines (Linux baseline must come from CI workflow_dispatch
# — see web-test-gate.yml mode=invariant-baseline). Local
# --update-snapshots regenerates macOS pixels which will fail on the
# Linux gate.
pnpm --filter @mfe/design-system run test:visual:invariants:update
```

## Legacy manual sweep (deprecated, non-authoritative)

> The commands below are for the **legacy `*.visual.ts` lane**
> (`primitives`, `components`, `patterns`, `dark-mode`, `rtl`, etc.) —
> they predate the L4 invariant matrix and are NOT CI-gated. Use them
> only to inspect existing legacy baselines; do not add new files to
> this lane (the CI guard `scripts/ci/check-visual-invariant-boundary.mjs`
> blocks new entries on touched files).

### Prerequisites

- Storybook running on port 6006 (`npm run storybook`)
- Playwright installed (`npx playwright install chromium`)

### Running legacy tests

```bash
# Auto-starts Storybook if not already running
npx playwright test

# Or use the CI script
./scripts/ci/visual-regression.sh
```

### Updating legacy snapshots (manual only — not CI-gated)

```bash
npx playwright test --update-snapshots

# Or via CI script
./scripts/ci/visual-regression.sh --update
```

## Test Structure (legacy)

| File                     | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `components.visual.ts`   | Static screenshots of 21 components + dark mode |
| `interactions.visual.ts` | Hover, focus, checked, toggled states           |

## Snapshots

- Stored in `__snapshots__/` (committed to git)
- Test artifacts in `test-results/` (gitignored)
- `maxDiffPixelRatio: 0.01` threshold (1% pixel tolerance)

## Story IDs

Story IDs are derived from the Storybook `title` field and export name:

```
title: 'Components/Primitives/Button'  +  export Default
  =>  components-primitives-button--default
```

If a story ID changes (e.g. component is reorganized), update the corresponding
entry in `components.visual.ts`.

## CI Integration

The `webServer` config in `playwright.config.ts` auto-starts Storybook in CI.
Set `CI=true` to enforce single-worker execution and retry on failure.
