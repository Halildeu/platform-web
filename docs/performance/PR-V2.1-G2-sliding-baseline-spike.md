# PR-V2.1-G2 — Sliding Baseline Drift Gate + Flake Budget Spike

> **Belge kodu**: `PR-V2.1-G2-spike`
> **Tarih**: 2026-05-14
> **Sprint**: PERF-INIT-V2.1 prod-readiness sub-wave
> **PMD parent**: `platform-k8s-gitops/docs/performance/PERF-INIT-V2-prod-readiness-v9.1.md` §2.7 G2

---

## §1. Amaç

`tests/perf/baseline.json` mevcut **single-snapshot baseline** (PR-G1 #420; timestamp 1778716452886; `/login::cold-anonymous` 1 entry). G2 = **sliding baseline** = 7/14 günlük median + variance band + flake budget — yanlış hard-fail önler.

PMD v9.1 §2.7 G2 DoD:

> `tests/perf/baseline.json` 7/14 günlük median + variance band; live-vs-CI ayrımı; warn-only 2 hafta → hard gate (Codex tur-2 EXPAND: **flake budget şartı** — son N run false positive rate < threshold)

Codex tur-1 ABM-1 §4.2 flake budget thresholds:

- `<=1 false positive in last 20 comparable runs`
- `<3 false positives / 100 runs`
- `budget delta variance < %5`

---

## §2. Mevcut Durum

`tests/perf/baseline.json` (PR-G1 #420):

```json
{
  "_phase": "INITIAL EMPTY — first PR-M1/PR-G1 run on main will populate",
  "_acceptance": "Codex thread 019e1de0 AGREE — warmup 2 weeks warn-only, then 5% hard fail.",
  "timestamp": 1778716452886,
  "routes": {
    "/login::cold-anonymous": { ... single snapshot }
  }
}
```

**Tek snapshot** — sliding window yok, variance band yok, flake counter yok. Hard fail çalışıyorsa false positive riski yüksek (run-to-run jitter).

---

## §3. Pattern Selection (2 option)

### §3.1 Option A — Baseline Time-Series Append

Her PR run'da `baseline.json` extend; rolling window'la `current vs median(last N)` compare:

```json
{
  "routes": {
    "/login::cold-anonymous": {
      "history": [
        { "timestamp": ..., "build_sha": ..., "transferKB": 2343, ... },
        { "timestamp": ..., "build_sha": ..., "transferKB": 2350, ... },
        ...
      ],
      "windowDays": 14,
      "median": { "transferKB": 2347, ... },
      "stdDev": { "transferKB": 12, ... },
      "p95": { ... }
    }
  }
}
```

**Avantaj**: tek dosya, git diff readable, sliding window self-contained
**Dezavantaj**: file size churn (her commit append → diff noise), git history pollution

### §3.2 Option B — External Time-Series (Prometheus/JSONL)

`baseline.json` sadece **last-known reference**; full history Prometheus push veya JSONL artifact'lerde:

```json
// tests/perf/baseline.json (lightweight, reference only)
{
  "current": { "/login::cold-anonymous": { "transferKB": 2343, ... } },
  "history_source": "docs/performance/measurements/perf-budget-soak-<date>.jsonl"
}
```

**Avantaj**: file size stable, history append-only artifact
**Dezavantaj**: cross-file lookup, CI workflow complexity

**Tercih**: **Option A + lightweight history** (last 30 runs only — rolling FIFO; eski entries git history'de archive)

---

## §4. Implementation Contract

### §4.1 Baseline Schema Extension

```typescript
// Codex `019e26f9` tur-1 absorb: full join-key schema (ABM-1 §4.2 align)
type PerfBaselineEntry = {
  timestamp: number;
  build_sha: string;
  frontend_image_ref: string;
  frontend_image_digest: string;
  route: string;
  mode: string; // 'cold-anonymous' | 'cold-authenticated' | 'warm-fresh'
  authState: string; // 'anonymous' | 'test-perf-persona' | ...
  cacheMode: string; // 'cold' | 'warm-fresh' | 'warm-cached'
  browserProfile: string; // 'playwright-chromium-bundled'
  browserVersion: string;
  target: 'local' | 'testai';
  metrics: {
    transferKB: number;
    decodedKB: number;
    resourceCount: number;
    tbtMs: number;
    longTaskTotalMs: number;
    lcpMs: number;
    fcpMs: number;
  };
};

type PerfBaselineRoute = {
  history: PerfBaselineEntry[]; // FIFO last 30 comparable accepted baseline entries per route key
  //   (raise to 50 if cadence > 2/day; Codex tur-1 absorb)
  windowDays: number; // 14
  median: Record<string, number>;
  stdDev: Record<string, number>;
  p95: Record<string, number>;
  flakeBudget: {
    last20Runs_falsePositives: number; // <=1
    last100Runs_falsePositives: number; // <3 (sourced from external ledger, not FIFO 30)
    varianceBand_percent: number; // 5%
    falsePositiveLedgerPath: string; // 'docs/performance/measurements/perf-budget-fp-ledger.jsonl'
    //   (Codex tur-1 absorb: FIFO 30 cannot derive <3/100)
  };
};

type HardFailActivationEvidence = {
  windowsSatisfied: number; // min 3 ayrı zaman penceresi
  comparableRuns: number; // min 20 comparable runs
  flakeBudgetSatisfied: boolean;
  baselineReviewSha: string; // PR/commit reviewer-approved baseline snapshot
  acceptedResidualsRef: string; // V3 deferred items + waiver references
  activatedBy: string; // owner identifier
  activatedAt: string; // YYYY-MM-DDTHH:MM:SSZ
};

type OwnerWaiver = {
  owner: string;
  reason: string;
  accepted_risk: string;
  waived_criteria: string[];
  expires_at: string; // YYYY-MM-DD
};

type PerfBaseline = {
  _doc: string;
  _phase: 'warn-only' | 'hard-fail';
  _acceptance: string;
  _hardFailActivationDate?: string; // earliest eligible date (not proof)
  _hardFailActivation?: HardFailActivationEvidence; // proof block
  _hardFailWaiver?: OwnerWaiver; // owner waiver if criteria not met
  routes: Record<string, PerfBaselineRoute>;
};
```

### §4.2 Flake Budget Tracking (ABM-1 coupling)

`scripts/ci/perf-budget-flake-tracker.mjs` (yeni):

```javascript
// Codex `019e269e` ABM-1 §4.2 absorb pattern
// False positive definition: aynı route + mode + auth state + BUILD_SHA class
//   + browser profile; rerun PASS; source/deploy değişmemiş; sentinel fail yok.

// Codex `019e26f9` tur-1 absorb: variance spike != confirmed FP; separate paths
function detectOutlierCandidate(currentRun, baseline) {
  const variance = computeVariance(currentRun.metrics, baseline.median);
  if (variance > baseline.flakeBudget.varianceBand_percent) {
    return {
      isOutlierCandidate: true,
      variance,
      requiresRerun: true,
    };
  }
  return { isOutlierCandidate: false };
}

function confirmFalsePositiveAfterRerun(originalRun, rerunRun, baseline) {
  // Codex ABM-1 §4.2 false positive definition (5-part context equality):
  //   - same route + mode + auth state + BUILD_SHA class + browser profile
  //   - rerun PASS
  //   - source/deploy unchanged
  //   - no status writer veya browser sentinel fail
  const sameContext =
    originalRun.route === rerunRun.route &&
    originalRun.mode === rerunRun.mode &&
    originalRun.authState === rerunRun.authState &&
    originalRun.build_sha === rerunRun.build_sha &&
    originalRun.browserProfile === rerunRun.browserProfile;
  const rerunPassedBudget =
    computeVariance(rerunRun.metrics, baseline.median) <= baseline.flakeBudget.varianceBand_percent;
  if (sameContext && rerunPassedBudget) {
    appendToFalsePositiveLedger(baseline, originalRun);
    return { confirmedFalsePositive: true };
  }
  return { confirmedFalsePositive: false };
}

function appendToFalsePositiveLedger(baseline, run) {
  // Append JSONL line to external ledger (FIFO 30 cannot derive <3/100)
  // ledgerPath: baseline.flakeBudget.falsePositiveLedgerPath
}

function updateFlakeBudget(baseline) {
  baseline.flakeBudget.last20Runs_falsePositives = countFPFromLedger(20);
  baseline.flakeBudget.last100Runs_falsePositives = countFPFromLedger(100);
  if (baseline.flakeBudget.last20Runs_falsePositives > 1) {
    console.error('FLAKE BUDGET EXCEEDED: >1 FP in last 20 comparable runs');
    process.exit(1);
  }
  if (baseline.flakeBudget.last100Runs_falsePositives >= 3) {
    // Codex tur-1 absorb: contract says <3/100, so >=3 fail
    console.error('FLAKE BUDGET EXCEEDED: >=3 FP in last 100 comparable runs');
    process.exit(1);
  }
}
```

### §4.3 Sliding Window Median Computation

```javascript
function computeSlidingBaseline(route, windowDays = 14) {
  const cutoff = Date.now() - windowDays * 86400000;
  const recentHistory = route.history.filter((e) => e.timestamp >= cutoff);
  if (recentHistory.length < 3) {
    return { median: null, reason: 'insufficient_history' };
  }
  const metrics = Object.keys(recentHistory[0].metrics);
  const median = {};
  const stdDev = {};
  const p95 = {};
  for (const metric of metrics) {
    const values = recentHistory.map((e) => e.metrics[metric]).sort((a, b) => a - b);
    median[metric] = values[Math.floor(values.length / 2)];
    stdDev[metric] = standardDeviation(values);
    p95[metric] = values[Math.floor(values.length * 0.95)];
  }
  return { median, stdDev, p95 };
}
```

### §4.4 Hard-Fail Activation Gate

```javascript
// scripts/ci/route-performance-budget.mjs extension
// Codex `019e26f9` tur-1 absorb: median primary; p95/stdDev variance band
const baseline = readBaselineJSON();
const isHardFailActive =
  baseline._phase === 'hard-fail' &&
  new Date() >= new Date(baseline._hardFailActivationDate) &&
  baseline._hardFailActivation?.windowsSatisfied >= 3 &&
  baseline._hardFailActivation?.comparableRuns >= 20 &&
  baseline._hardFailActivation?.flakeBudgetSatisfied === true;

const routeKey = `${currentRun.route}::${currentRun.mode}::${currentRun.authState}`;
const baselineMedian = baseline.routes[routeKey].median;
const baselineP95 = baseline.routes[routeKey].p95;
const baselineStdDev = baseline.routes[routeKey].stdDev;

// Hard-fail rule: current median > baseline median * 1.05 AND outside variance band
const medianRatio = currentRun.metrics.transferKB / baselineMedian.transferKB;
const outsideVarianceBand =
  currentRun.metrics.transferKB > baselineP95.transferKB ||
  currentRun.metrics.transferKB > baselineMedian.transferKB + 2 * baselineStdDev.transferKB;

if (medianRatio > 1.05) {
  if (outsideVarianceBand) {
    if (isHardFailActive) {
      console.error(
        `HARD FAIL: median ratio ${medianRatio.toFixed(3)} > 1.05 AND outside variance band`,
      );
      process.exit(1);
    } else {
      console.warn(
        `WARN-ONLY: median ratio ${medianRatio.toFixed(3)} > 1.05 (hard-fail eligibility: ${baseline._hardFailActivationDate})`,
      );
    }
  } else {
    console.warn(
      `WARN/RERUN candidate: median ratio ${medianRatio.toFixed(3)} > 1.05 but inside variance band → flake tracker decide`,
    );
  }
}
```

**Hard-fail activation criteria** (Codex `019e26f9` tur-1 absorb — `_hardFailActivationDate` earliest eligible date, evidence block proof):

- Min 3 ayrı zaman penceresi (`windowsSatisfied >= 3`)
- 20 comparable runs (`comparableRuns >= 20`)
- Flake budget §4.2 sağlanmış (`flakeBudgetSatisfied === true`)
- Baseline JSON reviewer-approved snapshot (`baselineReviewSha`)
- Accepted residuals / waivers explicit (`acceptedResidualsRef`)
- Owner activation (`activatedBy`, `activatedAt`)

**Owner waiver pattern** (PMD §10.6 + ABM waiver shape reuse):

```yaml
_hardFailWaiver:
  owner: 'Halil'
  reason: 'Faz G cutover-freeze öncesi 20 run threshold sağlanamadı'
  accepted_risk: 'False-fail riski mevcut; manuel review fallback'
  waived_criteria: ['comparableRuns_min_20']
  expires_at: '2026-06-01'
```

---

## §5. PMD v9.1 V2.1 Closure Coupling

| #   | Madde                      | G2 katkı                                                                                            |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 5   | Baseline ratchet active    | **Primary deliverable** — sliding median + variance band + flake budget + hard-fail activation date |
| 6   | Status writer 24-72h clean | ABM-1 soak input cross-coupling (G2 flake budget ABM-1 reproducibility soak'tan input)              |

ABM-1 ↔ G2 join key: `build_sha + frontend_image_digest + route/mode/browser profile` (Codex `019e269e` tur-2 absorb)

---

## §6. Implementation Scope (Ayrı PR)

| Step | Status | Scope                                                                                            |
| ---- | :----: | ------------------------------------------------------------------------------------------------ |
| 1    |   ⏳   | Baseline schema extension (`tests/perf/baseline.json` rolling FIFO 30 entries)                   |
| 2    |   ⏳   | Sliding window median + stdDev + p95 computation (`scripts/ci/perf-budget-sliding-baseline.mjs`) |
| 3    |   ⏳   | Flake budget tracker (`scripts/ci/perf-budget-flake-tracker.mjs`)                                |
| 4    |   ⏳   | Hard-fail activation gate (`route-performance-budget.mjs` extension)                             |
| 5    |   ⏳   | CI workflow extension (`.github/workflows/perf-budget.yml` warn-only → hard-fail transition)     |
| 6    |   ⏳   | Documentation: hard-fail activation date + flake budget thresholds explicit                      |

**Bu PR scope**: Spike decision record only.

---

## §7. Open Questions

### §7.1 Resolved (Codex `019e26f9` tur-1)

| #                           | Resolution                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| FIFO 30 vs 50/100           | FIFO **30 comparable accepted baseline entries per route key**; cadence > 2/day → 50; min compute 3 entries                         |
| 100-run flake budget source | **External JSONL ledger** (`docs/performance/measurements/perf-budget-fp-ledger.jsonl`) — FIFO 30 cannot derive `<3/100`            |
| p95 vs median               | **Median primary** baseline; p95/stdDev variance band; hard-fail: `currentMedian > baselineMedian * 1.05 AND outside variance band` |
| Hard-fail activation        | `_hardFailActivationDate` = earliest eligible; activation evidence block proof; owner waiver pattern (PMD §10.6 reuse)              |

### §7.2 Carried (Implementation PR scope)

| #   | Question                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CI live-vs-local divergence: PR CI `local` vs `workflow_dispatch testai` — hangi kanal authoritative for baseline? Local cheaper + reproducible; testai deploy proof signal |
| 2   | Same provider exception for rerun confirm: `confirmFalsePositiveAfterRerun()` aynı CI runner'da mı yoksa farklı runner ile mi (rerun environment parity)                    |
| 3   | False positive ledger retention: `<3/100` rolling 100-run window — ledger ne kadar tarihçe tutmalı (90 gün?)                                                                |

---

## §8. Cross-AI

```yaml
Implementer AI: Claude (Anthropic)
Reviewer AI: Codex (OpenAI)
Codex thread: 019e26f9-5c6d-7bb1-a81e-5fdf403a80bf
Verdict: AGREE
Verdict reason: Tur-1 5 revision absorbed (detectFalsePositive split, 100-run external ledger, schema join key extend, hard-fail activation evidence + owner waiver, median primary + p95/stdDev variance band); tur-2 AGREE final ready_for_merge:true; CI live-vs-local + rerun parity + ledger retention answers resolved Carried Questions
Same-provider exception: N/A
```

🤖 Generated by Claude (Anthropic) + Codex (OpenAI) cross-AI peer review chain.
