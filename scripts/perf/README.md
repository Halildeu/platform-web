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
- `flake-budget-tracker.mjs` — rerun-confirmed false-positive ledger appender.
- `__tests__/sliding-baseline.test.mjs` — node assertion suite (no framework dep).
- `__fixtures__/` — baseline + current run JSON fixtures used by tests.

## Run locally

```bash
# 1. Capture current run (existing PR-M1 runner)
node scripts/ci/route-performance-budget.mjs --target local --runs 3 --warn-only --routes /login

# 2. Run drift gate
node scripts/perf/sliding-baseline-check.mjs \
  --baseline tests/perf/baseline.json \
  --current tests/perf/last-run.json \
  --ledger docs/performance/measurements/perf-budget-fp-ledger.jsonl

# 3. Tests
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
- main pushes (opt-in via `inputs.append_history=1`): FIFO append + recompute stats.
- Both publish artifacts (last-run.json + baseline snapshot + ledger).
