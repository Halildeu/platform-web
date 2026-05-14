# `scripts/perf/` — Sliding baseline drift gate (G2)

PERF-INIT-V2.1 G2 implementation. Companion to `scripts/ci/route-performance-budget.mjs` (G1 = single-snapshot regression). G2 introduces:

- 14-day sliding median + p95 + stdDev per route+mode key
- variance band classification (inside → warn/rerun; outside → fail eligible)
- flake budget tracking (external JSONL ledger; <=1 FP/20 + <3 FP/100)
- hard-fail activation gate (phase + eligibility date + evidence block)
- owner waiver support

Spike contract: `docs/performance/PR-V2.1-G2-sliding-baseline-spike.md`.
Codex thread: `019e26f9-5c6d-7bb1-a81e-5fdf403a80bf` (AGREE final).

## Scripts

- `sliding-baseline-check.mjs` — drift gate (CI + local).
- `flake-budget-tracker.mjs` — rerun-confirmed false-positive ledger appender (5-part context, fail-closed).
- `run-outcome-recorder.mjs` — per-run outcome (`pass`|`fail`) ledger appender; builds denominator for `last N comparable runs` flake budget contract.
- `__tests__/sliding-baseline.test.mjs` — node assertion suite (42 tests, no framework dep).
- `__fixtures__/` — baseline + current run JSON fixtures used by tests.

## Run locally

```bash
# 1. Capture current run (existing PR-M1 runner; emits ABM-1 join key fields)
node scripts/ci/route-performance-budget.mjs --target local --runs 3 --warn-only --routes /login

# 2. Record pass/fail outcome to flake-budget ledger (denominator)
node scripts/perf/run-outcome-recorder.mjs \
  --run tests/perf/last-run.json \
  --ledger docs/performance/measurements/perf-budget-fp-ledger.jsonl \
  --build-sha "$(git rev-parse HEAD)"

# 3. Run drift gate
node scripts/perf/sliding-baseline-check.mjs \
  --baseline tests/perf/baseline.json \
  --current tests/perf/last-run.json \
  --ledger docs/performance/measurements/perf-budget-fp-ledger.jsonl

# 4. Tests
node scripts/perf/__tests__/sliding-baseline.test.mjs
```

## Phases

`tests/perf/baseline.json._phase`:

- `warn-only` (default): regressions surface as warnings, gate never fails.
- `hard-fail`: regressions outside variance band exit 1 when **all** of:
  - `_hardFailActivationDate` is in the past
  - `_hardFailActivation.windowsSatisfied >= 3`
  - `_hardFailActivation.comparableRuns >= 20`
  - `_hardFailActivation.flakeBudgetSatisfied === true`
  - `_hardFailActivation.baselineReviewSha` set
  - `_hardFailActivation.activatedBy + activatedAt` set

## Activation procedure (owner)

1. Confirm history >= 20 entries across >= 3 separate time windows.
2. Confirm flake budget over last 100 runs: <=1 FP/20 + <3 FP/100.
3. Set `_phase: "hard-fail"`, `_hardFailActivationDate`, and `_hardFailActivation` block via PR.
4. Cross-AI peer review (Codex/Claude opposite of writer) verdict AGREE before merge.

## Owner waiver

Temporary bypass when hard-fail eligibility is blocked (e.g. cutover freeze window):

```json
"_hardFailWaiver": {
  "owner": "Halil",
  "reason": "Faz G cutover-freeze öncesi 20 run threshold sağlanamadı",
  "accepted_risk": "False-fail riski mevcut; manuel review fallback",
  "waived_criteria": ["comparableRuns_min_20"],
  "expires_at": "2026-06-01"
}
```

Drift gate honors waivers only when called with `--waiver` (CI workflow opts in
explicitly when override is needed).

## Variance band

Outside band iff:

- `current > p95` of sliding window, OR
- `current > median + 2 * stdDev`

Inside band + >5% drift → WARN tag + rerun candidate. Flake tracker confirms
false positive via `flake-budget-tracker.mjs` when rerun PASSes in 5-part
identical context (route + mode + auth + build_sha + browser profile).

## CI integration

`.github/workflows/gate-perf-drift.yml`:

- PR runs: `--warn-only` mode (read-only against committed baseline).
- main push: read-only (no auto-append; ratchet remains owner-triggered).
- `workflow_dispatch` on `main` with `append_history=1`: FIFO append +
  recompute stats + `perf-baseline-bot` commit back to `main` (uses
  `contents: write`).
- All triggers run `run-outcome-recorder.mjs` so the ledger denominator stays
  current.
- Artifacts published every run: last-run.json + baseline snapshot + ledger.

## Flake budget semantics (iter-2 update)

Spike contract uses **last N comparable RUNS** (not entries):

- `<=1` FP in last 20 comparable runs (where comparable = same route+mode +
  same 5-part context tracked at append time)
- `<3` FP in last 100 comparable runs

`run-outcome-recorder.mjs` writes one ledger line per route per CI run
(`outcome: 'pass'|'fail'`, `is_fp: false`). `flake-budget-tracker.mjs` only
appends when a manual rerun reproduces an identical 5-part context PASS
(`outcome: 'confirmed_fp'`, `is_fp: true`). Legacy fp-only entries
(`confirmed_fp:true` without `outcome`) normalize automatically.

## G1 backward compatibility

`scripts/ci/route-performance-budget.mjs` reads either legacy single-snapshot
or extended schema baselines:

1. `base.<metric>` (legacy snapshot — preserved when route key has no `.history[]`)
2. `base.median.<metric>` (G2 extended schema)
3. latest `base.history[].metrics.<metric>` (fallback when `.median` empty)

`--update-baseline` preserves extended schema entries; it never collapses an
extended route back to a flat snapshot.
