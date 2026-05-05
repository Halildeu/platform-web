# STRICT_GATES Cheat Sheet

> Operational reference for the `web-test-gate-required` aggregator's
> STRICT_GATES toggle. Architectural rationale lives in
> [`adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md)
> §L5. Cutover checklist (when to flip the toggle on) lives in
> [`d30-cutover-runbook.md`](../d30-cutover-runbook.md) §1.1.

## What STRICT_GATES does

`STRICT_GATES` is a **repo-level Actions variable** read by the
`web-test-gate-required` aggregator job in
[`.github/workflows/web-test-gate.yml`](../../.github/workflows/web-test-gate.yml).

| `STRICT_GATES`                 | Aggregator behavior                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **unset** or `false` (default) | Aggregator passes if **required** jobs pass. Advisory failures are visible in PR comments / step summaries but do not block merge. |
| `true`                         | Aggregator additionally fails if any of the **strict-promoted advisory** infra checks trip. See blocker classes below.             |

The aggregator is the **only** check pinned in branch protection (post-cutover plan in d30-runbook §1.1). Individual required jobs are not pinned — adding/renaming required jobs only requires updating the aggregator's `needs:` block.

## Blocker classes (under `STRICT_GATES=true`)

For each advisory job, the aggregator runs three independent checks
that are NOT combined with boolean AND (PR-1 lessons — install-crash
edge case `result=failure + outcome=skipped` slipped through the
combined check):

1. **Job result not in `{success, skipped}`** — install / setup
   crash, runner OOM, network drop, etc. (The job ran but its
   environment died before the lint/test step.)
2. **Step outcome `== failure`** — the actual measurement step ran
   and reported a failure under `continue-on-error`.
3. **Step outcome not in `{success, skipped}`** — `cancelled` and
   any future Actions outcome value that is neither success nor
   skipped.

For `lint-warn-visibility-advisory` specifically:

- The lint step runs ESLint with `|| true`, so ESLint's exit code
  never bubbles up. Severity-2 ESLint diagnostics are counted as
  `ignored_errors` and labelled separate debt — **NOT a STRICT_GATES
  blocker** (current baseline ~800 warnings would lock every PR).
- What STRICT_GATES catches for the lint advisory: install crash,
  missing/empty/invalid `eslint-report.json`, summarize/comment
  script crash.

## Local dry-run

Simulate the aggregator's logic without a CI cycle:

```bash
# Smoke (all-green fixture)
pnpm gate:dry-run:smoke

# Custom fixture
pnpm gate:dry-run scripts/ci/fixtures/strict-gates/cssom-full-step-failure.json
```

Exit codes:

- `0` — aggregator would pass
- `1` — aggregator would fail (one or more conditions tripped)
- `2` — invalid input (missing fixture, bad JSON, missing required fields)

### Fixture schema

```json
{
  "strict_gates": "true" | "false",
  "required": {
    "unit": { "result": "success" | "failure" | "cancelled" | ... },
    "token_drift": { "result": ... },
    "cssom_canary": { "result": ... },
    "visual_invariant": { "result": ... }
  },
  "advisory": {
    "cssom_full": { "result": ..., "outcome": ... },
    "lint": { "result": ..., "outcome": ... }
  }
}
```

`result` mirrors GitHub Actions `needs.<job>.result`. `outcome`
mirrors `needs.<job>.outputs.*_outcome` (the per-step outcome
exposed via the advisory job's outputs block).

### Bundled fixtures

Located in `scripts/ci/fixtures/strict-gates/`:

| Fixture                            | What it simulates                                            | Expected exit |
| ---------------------------------- | ------------------------------------------------------------ | ------------: |
| `all-green.json`                   | Everything passes, STRICT_GATES on                           |             0 |
| `cssom-full-step-failure.json`     | A `*.cssom.test.tsx` failed; advisory step outcome `failure` |             1 |
| `cssom-full-install-crash.json`    | Advisory job crashed before its run step (install/setup)     |             1 |
| `lint-advisory-infra-failure.json` | Lint advisory's summarize/comment script crashed             |             1 |
| `strict-off-advisory-broken.json`  | Both advisory broken, STRICT_GATES off — default mode        |             0 |

## Pre-cutover verification (D30 runbook §1.1)

Before flipping `STRICT_GATES=true` at cutover, run the dry-run
suite locally:

```bash
for fixture in scripts/ci/fixtures/strict-gates/*.json; do
  echo "=== $(basename "$fixture") ==="
  pnpm gate:dry-run "$fixture" || echo "(expected fail)"
done
```

Then trigger a real CI run with one of the fail-class fixtures by:

1. Set `STRICT_GATES=true` repo Actions variable (Settings → Secrets
   and variables → Actions → Variables).
2. Push a no-op PR that intentionally breaks the cssom-full
   advisory (e.g., add a deliberately failing assertion in a
   non-canary `*.cssom.test.tsx`).
3. Verify the aggregator status check turns red on the PR.
4. Revert the deliberate break and the variable. Document the trial
   in `docs/d30-cutover-decisions.md`.

## What STRICT_GATES does NOT promote

Intentional gaps:

- **Lint warning count** — current baseline is high. Promoting
  warning count would lock every PR until a baseline-shrink work
  stream completes. The advisory job tracks the count over time
  (PR comment + step summary) so the trend is visible without
  blocking.
- **Visual invariant baselines** — already a hard required gate
  (`visual-invariant-required`); STRICT_GATES doesn't add anything
  here.
- **`cssom-full-advisory` test count drift** — if the full suite
  shrinks (somebody deletes tests) the advisory passes, but the
  curated `cssom-canary-required` manifest catches structural
  regressions on the locked primitives. Drift detection on the
  advisory set is a separate idea, not implemented.

## When NOT to use the dry-run

The dry-run is a **logic** simulator. It does NOT:

- Run any actual tests
- Inspect git state
- Talk to GitHub
- Verify branch protection rules

For real "would this PR merge under strict mode" verification, the
only ground truth is a real CI run with the variable flipped. The
dry-run is a fast precondition check that the aggregator script's
**logic** is what you expect — useful when reviewing a YAML edit to
the aggregator, or when documenting the cutover behavior to ops.

## References

- ADR §L5 (architectural rationale): [`adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md)
- Cutover checklist: [`d30-cutover-runbook.md`](../d30-cutover-runbook.md) §1.1
- Aggregator script: [`.github/workflows/web-test-gate.yml`](../../.github/workflows/web-test-gate.yml) lines 487-564
- Dry-run script: [`scripts/ci/strict-gates-dry-run.mjs`](../../scripts/ci/strict-gates-dry-run.mjs)
- Codex thread `019dfa07` (PR-9 manifest cutover) recommended this dry-run
- Codex thread `019df9b2` (PR-6 cutover readiness) simulated the same logic in bash 7/7 scenarios
