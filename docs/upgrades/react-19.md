# React 19.2.6 Upgrade — Deferred (2026-05-07)

Tracking entry for the React 18.2.0 → 19.2.6 major upgrade currently
sitting in Dependabot PR #228 (`react`, `react-dom`, `@types/react`).

## Status

**Deferred to a dedicated upgrade sprint.**

## Failure triage (2026-05-07)

PR #228 CI on commit `28e1...` (dependabot bumps applied to main):

| Check                                              | Result | Notes                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unit (jsdom)`                                     | FAIL   | 65 tests fail with `TypeError: Cannot read properties of null (reading 'useState')` across `src/useExplainPermission.test.ts`, multiple consumer suites. Root cause is React internals being unavailable at hook-call time — typical of a peer-dep mismatch between `react@19.2.6` and a transitive consumer (`@testing-library/react`, jest-dom, x-charts internal `useId`). |
| `chart-component-baseline (PR-D regression guard)` | FAIL   | Cascades from the same root failure.                                                                                                                                                                                                                                                                                                                                          |
| `Web Test Gate (aggregator)`                       | FAIL   | Aggregator over the two above.                                                                                                                                                                                                                                                                                                                                                |

## Why deferred

Codex strategic consultation (thread `019e0352-3e12-7ae0-b714-dc3555e2c706`)
flagged two defer triggers from the failure log:

- 65 unit-test failures with `useState`-is-null is not a narrow
  test-fix surface. It's a peer-dep / testing-library compatibility
  problem that needs `@testing-library/react` (and likely
  `@testing-library/jest-dom`) bumped in the same PR. Dependabot's
  PR scope is package-only.
- Compatibility validation needs to clear AG Grid React 19 listing,
  Module Federation host/remote pin parity, and a Visual Invariant
  Matrix update before the upgrade can land safely.

The minimal next-action set the upgrade sprint would own:

1. Bump `@testing-library/react`, `@testing-library/jest-dom`,
   `@testing-library/user-event` to the React-19-compatible majors.
2. Verify `ag-grid-react@34.3.1` is React 19 compatible (release
   notes confirm "React 18+", but verify against the failing
   contract test, not just the README).
3. Drop the `inert={'' as never}` cast in
   `packages/x-charts/src/access/ChartAccessGate.tsx:80` — React 19
   types `inert` as a real boolean prop. Update the test in
   `__tests__/access.contract.test.tsx:522` to match (the
   `hasAttribute('inert')` assertion still works either way).
4. Audit `useId` snapshot consumers — React 19.2 changes the prefix
   from `:` to `_`. Anything snapshotting raw IDs regenerates.
5. Module Federation smoke after the bump: mfe-shell host plus all
   four MFE remotes mount on the same React 19 pin.
6. Visual Invariant Matrix re-baseline only after explicit
   per-snapshot review (drift should be expected to be near-zero;
   anything noisy needs a behavioural explanation, not a blanket
   accept).

## Out of scope for the upgrade sprint

- New React 19 APIs (`<Activity>`, `useEffectEvent`, `cacheSignal`).
- React Server Components (we are SPA + Module Federation only).
- Removing existing legacy patterns the codebase happens to use
  (`forwardRef` to `ref` prop migration, etc.). Those are separate
  refactors, not blockers for the version bump.

## Audit trail

- Dependabot PR: `Halildeu/platform-web#228`
- Triage thread: Codex `019e0352-3e12-7ae0-b714-dc3555e2c706`
- Sprint context: this entry was written while Claude was finalizing
  the mobile-audit propagation PRs (#290 / #292 / #293 / #294 / #295)
  and the related `var(--…))` static guard. The React 19 upgrade was
  the last open item on that sprint backlog and was popped off after
  the triage above.

## Reopening criteria

This deferral expires the moment any of the following are true:

- A teammate explicitly schedules the upgrade sprint.
- Dependabot opens a follow-up PR with the testing-library bumps
  bundled together with the React bumps.
- A security advisory lands in `react@18.x` that forces an
  out-of-band upgrade.

Until then, the failing PR #228 stays open with a comment pointing
back at this entry, and `react@18.2.0` remains the production pin.
