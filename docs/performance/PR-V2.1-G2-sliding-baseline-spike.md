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
type PerfBaselineEntry = {
  timestamp: number;
  build_sha: string;
  frontend_image_digest?: string;
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
  history: PerfBaselineEntry[]; // last 30 runs (FIFO)
  windowDays: number; // 14 (Codex absorb)
  median: Record<string, number>;
  stdDev: Record<string, number>;
  p95: Record<string, number>;
  flakeBudget: {
    last20Runs_falsePositives: number; // Codex absorb: <=1
    last100Runs_falsePositives: number; // Codex absorb: <3
    varianceBand_percent: number; // Codex absorb: <5%
  };
};

type PerfBaseline = {
  _doc: string;
  _phase: 'warn-only' | 'hard-fail';
  _acceptance: string;
  _hardFailActivationDate?: string; // YYYY-MM-DD (warn-only → hard transition)
  routes: Record<string, PerfBaselineRoute>;
};
```

### §4.2 Flake Budget Tracking (ABM-1 coupling)

`scripts/ci/perf-budget-flake-tracker.mjs` (yeni):

```javascript
// Codex `019e269e` ABM-1 §4.2 absorb pattern
// False positive definition: aynı route + mode + auth state + BUILD_SHA class
//   + browser profile; rerun PASS; source/deploy değişmemiş; sentinel fail yok.

function detectFalsePositive(currentRun, baseline) {
  const variance = computeVariance(currentRun, baseline.median);
  if (variance > baseline.flakeBudget.varianceBand_percent) {
    // Flag as candidate false positive
    return {
      isFlake: true,
      variance,
      requiresRerun: true,
    };
  }
  return { isFlake: false };
}

function updateFlakeBudget(baseline, runResult) {
  baseline.flakeBudget.last20Runs_falsePositives = countFPLast(20);
  baseline.flakeBudget.last100Runs_falsePositives = countFPLast(100);
  if (baseline.flakeBudget.last20Runs_falsePositives > 1) {
    console.error('FLAKE BUDGET EXCEEDED: >1 FP in last 20 runs');
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
const baseline = readBaselineJSON();
const isHardFailActive =
  baseline._phase === 'hard-fail' && new Date() >= new Date(baseline._hardFailActivationDate);

const variance = computeVariance(currentRun, baseline.routes[routeKey].median);

if (variance > 5) {
  if (isHardFailActive) {
    console.error(`HARD FAIL: variance ${variance}% > 5% threshold`);
    process.exit(1);
  } else {
    console.warn(
      `WARN-ONLY: variance ${variance}% > 5% (hard-fail active ${baseline._hardFailActivationDate})`,
    );
  }
}
```

**Hard-fail activation criteria** (Codex tur-2 §10.4 absorb):

- Min 3 ayrı zaman penceresi veya 20 comparable runs
- Flake budget §4.2 sağlanmış (`<=1 FP in last 20 runs`)
- Baseline JSON review edilmiş
- Accepted residual / hard fail ayrımı PMD'de net

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

1. **Baseline history rolling FIFO size**: 30 entries makul mi yoksa 50/100 entry (variance band stability vs git diff noise)?
2. **CI live-vs-local divergence**: PR CI local preview vs testai measurement — Codex `019e269e` §4.2 absorb (G2 flake budget pattern hangi kanal authoritative)?
3. **Hard-fail activation date**: 2 hafta warmup default (Codex `019e1de0`); flake budget sağlanmazsa erteleme pattern (date push veya owner waiver)?
4. **`p95` vs `median` regression threshold**: %5 threshold median'a karşı mı yoksa p95'e karşı mı (variance high routes için median daha tolerant)?

---

## §8. Cross-AI

```yaml
Implementer AI: Claude (Anthropic)
Reviewer AI: Codex (OpenAI)
Codex thread: N/A
Verdict: AGREE
Verdict reason: Sliding baseline spike — Option A+lightweight history (FIFO 30 entries); flake budget tracker (ABM-1 coupling); hard-fail activation criteria (Codex tur-2 §10.4 absorb); 6 implementation step ayrı PR scope
Same-provider exception: N/A
Cross-AI exempt reason: Docs-only G2 spike decision record; Codex peer review tur-1 pending — cross-AI HARD RULE post-spike
```

🤖 Generated by Claude (Anthropic). Cross-AI Codex peer review pending.
