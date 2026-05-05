# Visual Regression Tests

Playwright-based visual regression testing for design-system components via Storybook.

## Status (PR-4b, 2026-05)

Two CI-gated lanes live in this directory:

1. **`invariants/`** — **Authoritative L4 lane** (PR-3). 9 chromium-only matrix snapshots covering theme/focus/density/RTL invariants. Gated by `web-test-gate.yml` `visual-invariant-required` (hard gate). New visual snapshots **must** go here. Run via `pnpm test:visual:invariants` (uses `playwright.invariants.config.ts` + `.storybook-invariants`).
2. **`x-charts*.visual.ts`** — Component-level chart gate, governed by `.github/workflows/x-charts-visual-gate.yml`. Exempt from the L4 boundary; remains a hard merge gate. Uses `.storybook-k5`.

The legacy non-x-charts visual specs (12 spec files + 588 baselines) were removed in PR-4b after PR-3 established the L4 invariant matrix as the authoritative DS-wide visual gate. The forward-looking guard `scripts/ci/check-visual-invariant-boundary.mjs` blocks new visual snapshot files outside these two lanes on touched files.

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

## x-charts visual gate (manual sweep only)

`x-charts.visual.ts` and `x-charts-mobile.visual.ts` use the legacy
`playwright.config.ts` runner (now scoped to `testMatch:
'x-charts*.visual.ts'`). The hard gate runs in CI under
`x-charts-visual-gate.yml`, not under `web-test-gate.yml`.

Local manual sweep (rare — usually only when debugging a baseline
mismatch flagged by the gate):

```bash
# Storybook on port 6006 (full config is heavy; the gate uses
# .storybook-k5 instead — match that locally to mirror CI):
pnpm --filter @mfe/design-system run start

# Run x-charts visual specs:
pnpm --filter @mfe/design-system run test:visual

# Update baselines: NEVER do this from macOS — Linux baselines come
# from the workflow_dispatch pattern in x-charts-visual-gate.yml.
```

## Snapshots

- Stored in `__snapshots__/` (committed to git, two CI-gated subtrees only)
- Test artifacts in `test-results/` (gitignored)
- L4 invariant `maxDiffPixelRatio: 0.01` — tighter than x-charts 0.02; matrix is small enough to tolerate the strict threshold

## Story IDs

L4 invariant matrix story IDs follow the `Visual/Invariants/<Matrix>--<variant>` Storybook convention:

```
title: 'Visual/Invariants/ThemeMatrix'  +  export Light
  =>  visual-invariants-themematrix--light
```

x-charts gate story IDs are documented inline in `x-charts.visual.ts`.

## CI Integration

The `webServer` config in `playwright.config.ts` auto-starts Storybook in CI.
Set `CI=true` to enforce single-worker execution and retry on failure.
