# PERF-INIT-V2 — Project Management Document

> **Status:** Wave A+B closed (transfer wave); Wave B5 + B6 opening (decoded/topology wave).
> This document describes the planned, in-progress, and merged work for
> the PERF-INIT-V2 performance initiative on the `platform-web` MFE host.
> It pairs with `docs/performance/bundle-taxonomy.md` (PR-A0) and
> `docs/performance/mf-shared-scope-audit.md` (PR-B2) for implementation
> detail.
>
> **Last update (v10):** 2026-05-14 — **B3c host edge long-cache LIVE on
> testai** (platform-web PR #470 + platform-k8s-gitops PR #558, Codex
> thread `019e240d` 3-iter AGREE).  Hashed Vite chunks `/assets/*` +
> `/remotes/<remote>/assets/*` serve with `Cache-Control: public,
> max-age=31536000, immutable` (1y, single line); entry surfaces
> (`/`, `/index.html`, `*remoteEntry.js`) retain `no-store`; 404
> stale-bundle responses do NOT inherit long-cache (P1.1 absorb).
>
> **Warm-cache /login transfer = 531 KB** (was 2,344 KB cold);
> **-77% warm-cache reduction** for returning visitors.  Chrome MCP
> browser smoke verified hashed assets `fromCache: 'CACHE'`
> (transferSize=0).  Cold-cache baseline unchanged.
>
> v9 cumulative measurement (cold-cache) holds: /login transfer
> **-95.2%** (49.1 → 2.34 MB), decoded **-81.5%** (49.05 → 9.09 MB),
> heap **-83.5%** (242 → 40 MB), resources **-62.6%** (171 → 64),
> **LCP -68.3% (3,208 → 1,016 ms — sektör MÜKEMMEL ✓✓✓ < 1,500 ms)**,
> FCP -68.6%, TBT 71 ms (sektör iyi içinde), CLS 0.004 (sektör
> mükemmel ✓).  See §11 revision history.

## §1. Goal

Reduce cold-cache initial JS download + critical-path execution time
across the public `/login`, `/home`, and authenticated `/admin/*` routes
to "sector excellent" — LCP < 1.5 s, INP < 100 ms, TBT < 50 ms
(advisory) on the testai cluster against the production-mode build.

**Phase rationale (2026-05-13 revision):** Wave A/B reduced cold
**transfer** by ~47% (14.4 MB → 7.6 MB on `/home`) but **decoded** JS
stayed nearly route-invariant (~48 MB). Bundle-size delta moved the
network-layer needle; the remaining gap is route topology + shared-scope
eager graph + delivery layer (HTTP/2 + Brotli + cache). Wave B5 + B6
target that residual surface.

Baseline (pre-V2): decoded JS ~50 MB across the eager chunk graph; the
same size on every route — strong duplicate-package signal.

## §2. KPI matrix (revised 2026-05-13)

The matrix is restructured into three tiers per Codex iter-2 thread
`019e20fa` — a single "fail" budget on its own can mark wins as
regressions and leader targets as flat failures, neither of which is
truthful.

### §2.1 Baseline → current → delta → gap (actual measurements)

| Route                                  | Metric         | Pre-V2 (2026-05-11) | Pre-B3b0 (testai `BUILD_SHA=f0c8e09`, pre-edge patch) | Post-B3b0 (testai `BUILD_SHA=f0c8e09`, post H2+gzip) | Post-B5b1 canary (testai `BUILD_SHA=df640525`, B5b1 ONLY canary) | Cumulative 3-canary (testai `BUILD_SHA=c1a398f`, B5b1+B5b1.5+B5b2a) | **Cumulative 4-canary** (testai `BUILD_SHA=2a59704`, **+B5b2 admin remotes on-demand**) | **TOTAL Delta** (Pre-V2 → cumulative-4) | Gap to leader target                                                  |
| -------------------------------------- | -------------- | ------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `/login` (cold-anonymous)              | transfer       | est. 49 MB          | **49,100 KB** (median of 5 Playwright runs)           | **13,134 KB**                                        | **11,476 KB**                                                    | **9,589 KB**                                                        | **2,344 KB** 🚀🚀🚀                                                                     | **-95.2%** 🟢🟢🟢                       | 3× over leader (800 KB) — was 12× over pre-B5b2                       |
| `/login` (cold-anonymous)              | decoded JS     | est. 49 MB          | **49,050 KB**                                         | **49,050 KB**                                        | **42,960 KB**                                                    | **36,144 KB**                                                       | **9,088 KB** 🚀🚀🚀                                                                     | **-81.5%** 🟢🟢🟢                       | 3× over leader (3,000 KB) — was 12× over pre-B5b2                     |
| `/login` (cold-anonymous)              | heap usage     | not measured        | n/a (proxy: heapUsedMB)                               | 242 MB                                               | **190 MB**                                                       | **159 MB**                                                          | **40 MB** 🚀                                                                            | **-83.5%** ✓ (-202 MB heap)             | leader n/a                                                            |
| `/login` (cold-anonymous)              | protocol       | not measured        | 171× HTTP/1.1                                         | 171× h2                                              | **161× h2**                                                      | **139× h2**                                                         | **64× h2** (100%)                                                                       | h2 multiplexed + 107 less requests      | n/a                                                                   |
| `/login` (cold-anonymous)              | resource count | est. ~250           | 171                                                   | 171                                                  | **161**                                                          | **139**                                                             | **64** 🚀                                                                               | **-62.6%** (-107 resources)             | ≤ 80 leader — **WITHIN leader range** ✓                               |
| `/login` (cold-anonymous)              | LCP            | not measured        | 3,208 ms                                              | 3,416 ms                                             | **3,072 ms**                                                     | **2,724 ms**                                                        | **1,016 ms** 🏆🏆🏆                                                                     | **-2,192 ms / -68.3%**                  | CWV mükemmel <1,500ms — **CROSSED BOTH "iyi" AND "mükemmel"** ✓✓✓     |
| `/login` (cold-anonymous)              | FCP            | not measured        | 3,188 ms                                              | 3,400 ms                                             | **3,052 ms**                                                     | **2,708 ms**                                                        | **1,000 ms** 🏆                                                                         | **-2,188 ms / -68.6%**                  | CWV good 1,800 ms — **WITHIN good range** ✓                           |
| `/login` (cold-anonymous)              | TBT            | not measured        | 96 ms                                                 | 104 ms                                               | **79 ms**                                                        | **76 ms**                                                           | **71 ms**                                                                               | -25 ms ✓                                | ≤ 50 ms leader — close (within "iyi" 200ms)                           |
| `/login` (cold-anonymous)              | long tasks     | not measured        | 2 count / 196 ms total                                | (varyans)                                            | **1 count / 130 ms total**                                       | **1 count / 126 ms total**                                          | **1 count / 121 ms total**                                                              | -1 count, -75 ms                        | ≤ 2 count, ≤ 600 ms ✓                                                 |
| `/login` (cold-anonymous)              | CLS            | not measured        | 0.002                                                 | 0.002                                                | 0.004                                                            | **0.002**                                                           | **0.004**                                                                               | excellent ✓                             | ≤ 0.05 — **MÜKEMMEL** ✓                                               |
| `/login` (cold-anonymous)              | TTFB           | not measured        | 44 ms                                                 | 40 ms                                                | 41 ms                                                            | **40 ms**                                                           | **40 ms**                                                                               | -4 ms                                   | excellent ✓                                                           |
| `/home` (post-13-PR, BUILD `0b54770`)  | transfer       | 14,419 KB           | **7,618 KB**                                          | not yet remeasured post-B3b0                         | (B5b1+B5b2 scope)                                                | 2.5× over (3,000 KB)                                                    |
| `/home` (post-13-PR, BUILD `0b54770`)  | decoded JS     | 49,947 KB           | 48,539 KB                                             | not yet remeasured post-B3b0                         | (B5b2 scope)                                                     | 4× over (12,000 KB)                                                     |
| `/home`                                | TBT            | 2,937 ms            | observer-gated (production mode)                      | observer-gated                                       | M2a required                                                     | not measurable yet                                                      |
| `/home`                                | resource count | (≈250)              | 184                                                   | not yet remeasured                                   | (B5b2 scope)                                                     | n/a                                                                     |
| `/admin/users`                         | transfer       | est. 14 MB          | **6,598 KB**                                          | not yet remeasured post-B3b0                         | (B5b2 scope)                                                     | ~10% over leader                                                        |
| `/admin/users`                         | decoded JS     | est. 50 MB          | 48,548 KB                                             | not yet remeasured                                   | (B5b2 scope)                                                     | 2.7× over (18,000)                                                      |
| `/admin/design-lab`                    | transfer       | (eager-bundled)     | 7,151 KB (post-lazy)                                  | not yet remeasured                                   | (B5b2 scope)                                                     | route-specific                                                          |
| Lazy chunks split out via Wave B (raw) | —              | —                   | **~7.7 MB eager out**                                 | —                                                    | —                                                                | —                                                                       |

> **B3b0 host edge H2 + gzip live patch (2026-05-13)**: Codex thread
> `019e22df` AGREE-with-revisions A3 sequencing (parallel: H2+gzip
> first, B5b2 separate). Live patch applied + verified on `staging-sw`
> via SSH; canonical reconcile to repo in `platform-k8s-gitops` PR
> #550 (`feat/pr-b3b0-edge-h2-gzip-reconcile`). See §9 audit log.
>
> **Measurement notes:** TBT/LCP/FCP/CLS are now measurable on
> anonymous `/login` via Playwright + `addInitScript` (`__PERF_OBSERVER_ENABLE`).
> Authenticated `/home` + `/admin/*` still gated on M2a auth-storage.
> First /login measurement run (2026-05-13) revealed 49 MB transfer +
> 171× HTTP/1.1 + no compression — anonymous landing page also fetches
> all eager federation manifest remotes per B5b0 finding. PMD estimate
> of `/login` "~1 MB" pre-V2 was inaccurate; ground truth captured here.

### §2.2 Tiered KPI semantics

Each tier has different enforcement semantics so plan progress is honest:

| Tier                        | Semantics                                                                                                                                                                                                                               | Enforcement                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Hard regression gate**    | Current measurement must not regress more than +5% vs the latest committed baseline in `tests/perf/baseline.json`.                                                                                                                      | CI hard fail (route-budget runner once authenticated matrix is live — see M2a auth-storage + M2b authenticated CI matrix) |
| **Improvement milestone**   | Per-wave target — staged stepping stone on the way to leader. Expected post-B5b: `/home` decoded ≤ 25–32 MB; transfer ≤ 5 MB. Next architecture ratchet (DS root-barrel full retirement + i18n async + shared-scope topology): ≤ 18 MB. | PR acceptance signal; not a CI hard gate                                                                                  |
| **Leader target**           | 12-month aspirational target representing "sector excellent". Decoded `/home` ≤ 12 MB, TBT ≤ 50 ms. Requires architectural redesign in part.                                                                                            | Not a hard gate — directional polestar                                                                                    |
| **Bundle-size CONTRACT §8** | Per-MFE size budget (size-limit) — already a CI advisory.                                                                                                                                                                               | size-limit advisory (existing)                                                                                            |

### §2.3 Leader-target reference matrix (12-month direction)

| Route                               | LCP target | INP target | TBT target | Transfer leader | Decoded leader | Notes                                   |
| ----------------------------------- | ---------- | ---------- | ---------- | --------------- | -------------- | --------------------------------------- |
| `/login`                            | 1.0 s      | 80 ms      | 30 ms      | ≤ 800 KB        | ≤ 3,000 KB     | Public, smallest payload — leader route |
| `/home`                             | 1.2 s      | 100 ms     | 50 ms      | ≤ 3,000 KB      | ≤ 12,000 KB    | Authenticated landing                   |
| `/admin/users`                      | 1.5 s      | 100 ms     | 50 ms      | ≤ 6,000 KB      | ≤ 18,000 KB    | First admin route                       |
| `/admin/access/roles`               | 1.5 s      | 100 ms     | 50 ms      | ≤ 6,000 KB      | ≤ 18,000 KB    | Permission graph                        |
| `/admin/reports/fin-muhasebe-detay` | 1.5 s      | 120 ms     | 70 ms      | ≤ 5,000 KB      | ≤ 16,000 KB    | Largest data grid                       |

### §2.4 Measurement validity preconditions (revision)

Before a measurement is allowed to enter the regression gate:

1. **Route-rendered sentinel passes.** Codex iter-2: `/admin/*` blank-on-init (pre-existing auth FSM race) can otherwise generate a low-decoded "false-green" measurement. Each route-budget run must assert a DOM sentinel (table row, page heading, etc.) before reading metrics.
2. **Authenticated context fresh.** Playwright auth storage seed (M2a) must be valid; expired session produces redirect-to-login measurement which is not a `/home` budget.
3. **`__perfSnapshot` exposed.** Either via the `__PERF_OBSERVER_ENABLE` window flag (Playwright `addInitScript`) or via a production-safe build flag (`VITE_PERF_OBSERVER_EXPOSE` — to be wired in B5c-lite, currently a documented stub only).
4. **`BUILD_SHA` recorded.** Each metric snapshot must include the deployed `window.__BUILD_SHA__` value to distinguish source-live skew (PR merge ≠ deploy).
5. **Browser-vs-Playwright clearly labelled.** Manual browser smoke captures HOT cache (transfer numbers underestimate); Playwright route-budget cold-fetches per run. Snapshots used for gate decisions are Playwright; browser smoke is reference signal only.

## §3. Phased plan

### Wave A — Measurement (instrumentation first, then optimise)

| PR    | Status | Owner                       | Deliverable                                                         |
| ----- | ------ | --------------------------- | ------------------------------------------------------------------- |
| PR-S1 | MERGED | cluster_secret_drift        | PG/Vault/Keycloak credential rotation + drift detector skeleton     |
| PR-M1 | MERGED | PerformanceObserver harness | Extended observers (INP, FCP, longtask, mark, resource) + RUM sinks |
| PR-A0 | MERGED | Bundle attribution          | Per-route taxonomy + duplicate-package detector + Playwright traces |
| PR-G1 | MERGED | Gate bootstrap              | CI workflow: route-budget + size-limit + lighthouse-ci advisory     |

### Wave B1 — High-impact splits (closed)

| PR     | Status | Deliverable                                                                                   |
| ------ | ------ | --------------------------------------------------------------------------------------------- |
| PR-B1a | MERGED | AG Grid Enterprise lazy split (~6 MB out of `/login` + `/home`)                               |
| PR-B1b | MERGED | `@mfe/design-system/light` slim subpath (primitives + tokens + theme + providers + `cn` only) |

### Wave B2 — Module Federation shared scope (closed)

| PR            | Status | Deliverable                                                                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| PR-B2         | MERGED | `federation-doctor` regex fix (was: 30 false-positive drifts) + `mf-shared-keys` diagnostic + canonical-provider pattern doc |
| PR-B2-rollout | MERGED | `@tanstack/react-query` `singleton()` → `hostOnly()` across 6 remotes (canonical provider in production)                     |

### Wave B3 — Idle deferral + delivery (partially closed; cross-repo pending)

| PR     | Status                                              | Deliverable                                                                                   |
| ------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| PR-B3a | MERGED                                              | Shell-services remote-import idle deferral (4 MFE-services off critical path)                 |
| PR-B3b | PLANNED (cross-repo, NOT a platform-web merge gate) | HTTP/2 + Brotli at the ingress — tracked in `platform-k8s-gitops` nginx-ingress overlay       |
| PR-B3c | PLANNED (cross-repo, NOT a platform-web merge gate) | Long-cache headers for hashed assets, short-cache for HTML — tracked in `platform-k8s-gitops` |
| PR-B3d | PLANNED (complex, platform-web scope)               | CSS critical extract + non-critical defer (consider `critters` or `vite-plugin-critical`)     |
| PR-B3e | MERGED                                              | `initOtel` + `initFeatureFlags` idle defer (~6 ms TBT win + cleaner critical path)            |

### Wave B4 — Leader-conditional splits (partially closed)

| PR     | Status   | Deliverable                                                                                     |
| ------ | -------- | ----------------------------------------------------------------------------------------------- |
| PR-B4a | MERGED   | Auth-flow pages lazy (`Login` / `Register` / `Unauthorized` — ~17 kB out of eager)              |
| PR-B4b | MERGED   | Admin pages lazy (`ThemeAdmin` / `DesignLab` / `DesignLabRoutes` — ~1.4 MB out of eager)        |
| PR-B4c | DEFERRED | i18n async-locale (requires breaking the synchronous `getDictionary()` API — separate refactor) |
| PR-B4d | N/A      | Fonts — system font stack only; no `@font-face` in current build                                |

### Wave B5 — Decoded / topology wave (NEW, opened 2026-05-13)

Codex thread `019e20fa` REVISE-actionable consensus. Wave A/B closed
"transfer wave"; Wave B5 opens "decoded / topology wave" to address the
residual 48 MB decoded gap.

Sequenced for safe rollout: **B5a + B5b1+ MUST NOT open in parallel**
— both touch shell bootstrap/render graph; measurement attribution
breaks. (B5b3-prep is the only exception: it ships the BUILD-TIME
flag reader + state-probe registration only with NO behaviour change,
so it can land before B5a closure if operationally convenient. The
flag is consumed at BUILD TIME by B5b1; runtime toggling does NOT
roll back B5b1 selection after deploy — see Codex thread `019e228d` /
`019e22a1` clarification.)

| PR           | Status                                  | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Expected ROI                                                                                                  |
| ------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| PR-B5c-lite  | SHIPPED (PR #437)                       | Observer expose contract + route-rendered sentinel guard. Production observer flag implementation (or stub-removal). Route-budget runner sentinel/redirect guard so blank pages cannot generate false-green metrics. Auth-storage generator deliberately OUT-OF-SCOPE (M2a).                                                                                                                                                                                                                                                                                                                                                                             | Measurement validity (gate enabling)                                                                          |
| PR-B5a       | SHIPPED (PR #438) — **decoded ROI=0**   | Consumer-side critical-graph subpath migration. 5 files migrated to `/patterns`, `/components`, `/primitives`. **Negative result**: bundle delta = 0 because MF runtime federates `@mfe/design-system` as a single root shared package entry; consumer subpath imports do NOT shrink the `loadShare__@mfe/design-system__loadShare__.mjs` wrapper. Tree-shake cannot cross MF share-scope. Value retained as **consumer hygiene** — see Wave B5d-arch backlog if a future architecture initiative pursues DS topology split.                                                                                                                             | `/home` decoded: **0 MB** (measured). Wave B5d ELIMINATED — see B5d-arch backlog. Decoded path shifts to B5b. |
| PR-B5a2      | DEFERRED — out of PERF-INIT-V2          | Admin-route root-barrel-thin pass + `/hooks`/`/lib` subpath additions. B5d0 (#439) proved this does not reduce decoded JS under the current root shared topology. Keep only as consumer-hygiene work if a future B5d-arch / root-retirement initiative proceeds.                                                                                                                                                                                                                                                                                                                                                                                         | 0 MB expected in V2; architecture-backlog only                                                                |
| PR-B5b0      | SHIPPED (PR #446)                       | RemoteEntry initiator-attribution diagnostic. CDP `Network.requestWillBeSent` initiator-stack on `/login` cold load (anonymous; identical to `/home` for host bootstrap analysis). Captured testai artifacts `08fb4b47.json` + `8885120f.json`. **Finding**: ALL 7 `/remotes/*/remoteEntry.js` fetches initiated from shell main bundle (`@module-federation/vite` plugin host-side registration loop) — NOT from shell-services-wiring/preload-helper/lazy-loaders. Informed B5b1 per-remote conditional canary strategy.                                                                                                                               | Diagnostic data — informed B5b1 ✓                                                                             |
| PR-B5b1      | **SHIPPED + LIVE + MEASURED** (PR #450) | MFE on-demand bootstrap canary for **`mfe_suggestions`**. **MERGED 2026-05-13 19:20Z**. CI canary deployed to testai (BUILD_SHA `df640525`) via PR #453 build infra. **Measured (median of 5 Playwright runs, `/login` cold-anonymous, BUILD_SHA `df640525`)**: transfer 13,134→11,476 KB (**-12.6%**), decoded 49,050→42,960 KB (**-12.4%**), heap 242→190 MB (**-21.5%**), LCP 3,208→3,072 ms (**-136ms**), FCP 3,188→3,052 ms (**-136ms**), TBT 96→79 ms (**-17ms**). **Beat expectation** (target -2/-4 MB decoded, actual **-6 MB**).                                                                                                               | **-12.4% decoded MEASURED** (49 → 43 MB)                                                                      |
| PR-B5b1.5    | **SHIPPED + DEPLOYED** (PR #454)        | MFE on-demand bootstrap canary for **`mfe_ethic`** (B5b1 pattern replica). Same single canary master toggle. **MERGED 2026-05-13 21:11Z**. Deployed testai BUILD_SHA `2b098c5`. Cumulative re-measurement pending.                                                                                                                                                                                                                                                                                                                                                                                                                                       | Expected ~2-3 MB additional decoded                                                                           |
| PR-B5b2a     | **SHIPPED + DEPLOYED** (PR #455)        | MFE on-demand bootstrap canary for **`mfe_schema_explorer`** (B5b2 step 1 — admin set but NOT in shell-services-wiring contract). Codex iter-1 P1 must-fix absorbed: `schemaExplorerOnDemandBuildEnabled = canary && schemaExplorerEnabled` (preserves disabled contract). **MERGED 2026-05-13 21:30:56Z**. Auto-deploy chain LIVE. Cumulative re-measurement pending.                                                                                                                                                                                                                                                                                   | Expected ~3-5 MB additional decoded                                                                           |
| PR-B5b2b-e   | **BLOCKED — architectural prereq**      | Remaining 4 admin remotes (`mfe_users`, `mfe_audit`, `mfe_access`, `mfe_reporting`) on-demand. **BLOCKER**: these 4 remotes ARE in `apps/mfe-shell/src/app/config/shell-services-wiring.ts` 4-remote contract (lines 479-484: static `import('mfe_*/shell-services')`). If federation manifest omits these remotes (canary path), static imports fail at shell-services init → broken contract (notifications/audit-SSE/impersonation/auth-ready Promise). **Path forward**: refactor `shell-services-wiring.ts` to register on idle + use `host.loadRemote` instead of static import. Significant architectural work — out of B5b2 quick-rollout scope. | Blocked pending shell-services-wiring refactor (own architectural initiative)                                 |
| PR-B5b3      | PLANNED                                 | federation-doctor + mf-shared-keys CI wiring + runtime smoke polish. (BUILD-TIME flag reader + state-probe registration shipped earlier as B5b3-prep — see below.) **Acceptance**: CI gates run on every PR + runtime smoke nightly + both build-time flag modes exercised via E2E / build smoke (eager rebuild restores the eager federation manifest entry; rebuilds are the only post-deploy rollback path).                                                                                                                                                                                                                                          | Operational safety net for B5b rollout                                                                        |
| PR-B5b3-prep | SHIPPED (PR #444)                       | **Pre-canary**: ship `MFE_ON_DEMAND_BOOTSTRAP` BUILD-TIME flag reader + state-probe registration. NO behaviour change when flag off (current eager bootstrap unchanged). **Acceptance**: flag toggleable via env at build time; smoke confirms both modes render `/home`. Must merge BEFORE B5b1. **Rollback semantic** (Codex thread `019e228d`+`019e22a1` clarification): consumed at BUILD TIME by B5b1's `vite.config.ts` define; once a build has been made with the flag on, the eager branch is DCE'd and full rollback requires rebuild — runtime toggling does NOT roll back B5b1 selection after deploy.                                       | Safety prerequisite (no perf delta)                                                                           |
| PR-B4c       | DEFERRED                                | i18n async-locale (re-affirmed deferred — comes after B5b)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Decoded -200 KB; breaking API                                                                                 |

### Wave B5d — Share-scope topology split (TRUNCATED 2026-05-13, Codex iter-7)

**B5d0 diagnostic PoC (#439) falsified the per-subpath federation
hypothesis.** Wave B5d-a is no longer a viable PERF-INIT-V2
decoded-reduction tactic.

| PR      | Status                       | Deliverable                                                                                                                                                                                                                                                                | Outcome / ROI                                                                                                                              |
| ------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PR-B5d0 | **CLOSED / NEGATIVE** (#439) | Diagnostic PoC: explicit subpath shared entries (`/light`, `/primitives`, `/components`, `/patterns`) declared in shell + canary remote. Measured: root `@mfe/design-system` loadShare wrapper UNCHANGED at 6,512.1 KB; no genuinely independent subpath providers emerge. | **0 MB decoded reduction**. Subpath share-keys register in MF share map but providers proxy through root wrapper while root entry remains. |
| PR-B5d1 | **CANCELLED**                | Was: shell critical canary with subpath shared entries. **Cancelled** because B5d0 proved per-subpath federation infeasible under current plugin + existing root shared entry.                                                                                             | N/A                                                                                                                                        |
| PR-B5d2 | **CANCELLED**                | Was: granular DS subpaths + remote rollout. Same architectural blocker as B5d1.                                                                                                                                                                                            | N/A                                                                                                                                        |
| PR-B5d3 | **DEFERRED**                 | Was: federation-doctor extension for duplicate root+subpath detection. Only needed if a future Wave B5d-arch topology migration proceeds.                                                                                                                                  | N/A                                                                                                                                        |

**Architectural finding (Codex iter-7)**: subpath shared keys are
registered by the `@module-federation/vite` plugin in the share map,
but the generated subpath providers proxy / re-export through the
root `@mfe/design-system` loadShare wrapper while the root shared
entry remains present. Net effect: no decoded reduction.

**Wave B5d-b / B5d-c rejection rationale (kept from iter-5)**:

- B5d-b (`import: false` on shell side for DS): wrong semantic;
  shell IS the canonical provider for DS in current topology.
- B5d-c (de-federate DS — build-time bundle into each app): would
  invalidate PR-B2 canonical-provider work + introduce route-cache
  duplicate cost.

### Wave B5d-arch — Backlog (out of PERF-INIT-V2 scope)

NOT a PERF-INIT-V2 implementation wave. Listed for future planning
only. Codex iter-7 explicitly recommended these move to a separate
architecture initiative once B5b measurements close.

| Candidate              | Description                                                                                                                      | Status                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Root shared retirement | Remove root `@mfe/design-system` shared entry; force all consumers to subpaths. Untested. High blast-radius.                     | Architecture spike — needs assessment       |
| DS multi-package split | Convert DS into `@mfe/ds-light`, `@mfe/ds-primitives`, `@mfe/ds-components`, etc. as 5+ distinct npm packages (5+ share-scopes). | Architecture initiative — separate planning |
| Build-time DS surgery  | Custom Vite plugin to manually split root barrel pre-MF.                                                                         | Reject unless no alternative                |
| Accept DS root cost    | Current PERF-INIT-V2 path: do not attempt to shrink DS root wrapper.                                                             | **LIVE — accepted**                         |

**KPI implication (Codex iter-7)**: PERF-INIT-V2 decoded reduction
now depends primarily on **Wave B5b (MFE on-demand bootstrap)**.
B5b's ROI is on remote loadShare wrappers + remoteEntry deferral,
NOT on shrinking the DS root wrapper.

### Wave B6 / M2 — Cross-repo + measurement infra (NEW, parallel)

| PR      | Status                                                                         | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Expected ROI                                                                           |
| ------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| PR-B3b0 | SHIPPED (cross-repo `platform-k8s-gitops` PR #550 MERGED 2026-05-13T20:17:08Z) | **Host edge HTTP/2 + gzip live patch + Codex 019ded8d drift reconcile**. Live patch applied + verified on staging-sw (curl ALPN h2 accept + Content-Encoding gzip + Playwright median-of-5 transfer 49.1 MB → 13.1 MB = -73.3%). Container restart required (bind-mount stale-inode bug — runbook learning: `sed -i` creates new inode, container retains old until restart). Repo canonical (`platform-k8s-gitops` PR #550) reconciles 2026-05-03 Codex `019ded8d` audit drift (ai.acik.com cluster-authoritative switch) + today's H2/gzip transport patch in a single commit. | **Transfer -73% on /login**; multiplexed h2; foundational for B3b1 Brotli              |
| PR-B3b1 | PLANNED                                                                        | Brotli compression — separate small PR after B3b0 land + canary stability proof. Requires nginx image swap (nginx:1.27-alpine has NO Brotli module). Codex `019e22df` recommends C3 path (`fholzer/nginx-brotli:mainline` digest-pinned, `nginx -V` proof, testai canary first). Permanent path would be custom-built `platform-edge-nginx-brotli` image (C2).                                                                                                                                                                                                                   | **Transfer -10 to -15%** on top of B3b0 gzip (would bring /login to ~10 MB)            |
| PR-B3c  | PLANNED                                                                        | Cache header matrix at host edge: hashed assets (`*.js`, `*.css`, fonts) `Cache-Control: public, max-age=31536000, immutable`; entry HTML + `remoteEntry.js` `Cache-Control: no-store` (interacts with `installStaleBundleRecovery()` — see §4.7). Codex flagged audit during B3b0 review (`019e22df`).                                                                                                                                                                                                                                                                          | Warm-cache transfer drops sharply for repeat visits; SLO for `remoteEntry.js` rollover |
| PR-B3d  | PLANNED                                                                        | CSS critical extract + non-critical defer (complex, platform-web scope). Order: after B5a-B5b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | LCP early paint; complex setup                                                         |
| PR-M2a  | PLANNED                                                                        | Auth-storage seed generator. Playwright login → storage state JSON → committed fixture (rotated periodically). Enables authenticated route-budget matrix.                                                                                                                                                                                                                                                                                                                                                                                                                        | Unlocks `/home` + `/admin/*` regression-gate measurement                               |
| PR-M2b  | PLANNED                                                                        | Authenticated route-budget CI matrix expansion (depends on M2a). `/home`, `/admin/users`, `/admin/access`, `/admin/reports/*` with rendered-sentinel guard.                                                                                                                                                                                                                                                                                                                                                                                                                      | Hard regression gate becomes live for authenticated routes                             |
| PR-M2c  | PLANNED                                                                        | Cluster-side Lighthouse-CI. Real LCP/INP/CLS measurement against deployed testai. Operationally separate; long-tail signal.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | True LCP/INP visibility                                                                |
| PR-S2   | OPEN                                                                           | Backend Spring config root-cause (in `platform-backend`; parallel track to this plan).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Separate analysis                                                                      |

## §4. Implementation patterns

### §4.1 idle-scheduler

`apps/mfe-shell/src/lib/idle-scheduler.ts` (introduced in PR-B3a) wraps
`requestIdleCallback` with a `setTimeout` race + bounded timeout +
cancel handle. Reused in PR-B3e for OTel + feature-flags deferral.

Usage:

```typescript
import { scheduleOnIdle } from '../lib/idle-scheduler';

scheduleOnIdle(() => doExpensiveSetup(), { timeout: 3000 });
```

Future deferral candidates can adopt the same helper. Test coverage
is in `apps/mfe-shell/src/lib/__tests__/idle-scheduler.test.ts` (12
cases covering happy path, timeout fallback, missing-ric fallback,
SSR sync execution, double-fire guard, cancel-before/after-fire,
sync-ric path).

### §4.2 Canonical provider pattern (Module Federation share scope)

Documented in `docs/performance/mf-shared-scope-audit.md`.

- Shell host declares core React/redux/router/query deps with
  `singleton: true` + `eager: true`.
- Remotes declare the same deps with `singleton: true` +
  `import: false` + stub version (via the `hostOnly()` helper).
- Remote chunks do not bundle their own copy at runtime.

Diagnostics: `node scripts/ops/federation-doctor.mjs --json` (lightweight
`shared-deps-consistency` check) and `node scripts/diagnostics/mf-shared-keys.mjs
[--json|--strict]` (richer audit) are available as workspace scripts
(`pnpm mf:doctor`, `pnpm mf:doctor:json`, `pnpm mf:shared-keys`,
`pnpm mf:shared-keys:json`, `pnpm mf:shared-keys:strict`). Neither is
wired into a GitHub Actions workflow as of 2026-05-13 — both are
on-demand; CI wiring is tracked as a follow-up.

### §4.3 Lazy-load policy (route-level)

`apps/mfe-shell/src/app/router/AppRouter.tsx` distinguishes:

- **eager**: `HomePage` (the most common landing route — chunk-fetch
  latency dominates). `ThemeMatrixPage` (runtime fallback surface,
  must be available without chunk fetch).
- **lazy (PR-B4a)**: `LoginPage`, `RegisterPage`, `UnauthorizedPage`
  — public auth-flow + denial-edge pages.
- **lazy (PR-B4b)**: `ThemeAdminPage`, `DesignLabPage`,
  `DesignLabRoutes` — admin surfaces, large transitive cost.
- **lazy (pre-V2)**: `XSuiteDashboardPage`, `ServiceControlPage`,
  `NotificationPreferencesPage`, the `lazy-routes.ts` MFE module
  loaders.

### §4.4 Cross-repo coordination

Routes B3b/B3c require nginx-ingress changes in `platform-k8s-gitops`:

- Enable HTTP/2 on the ingress controller (already TLSv1.3-enabled)
- Enable Brotli (`brotli on; brotli_comp_level 6; brotli_types ...`)
- Long-cache headers for hashed assets (`*.js`, `*.css`, `*.woff2`,
  `*.png`, `*.svg`); `Cache-Control: public, max-age=31536000, immutable`
- Short-cache (or `no-cache`) for the entry `index.html`
- `remoteEntry.js`: must NOT be immutable; use `no-cache` or short
  TTL + revalidate (interacts with `installStaleBundleRecovery()`)

These are operator-side changes; the platform-web side just needs
each chunk to have a content-hash filename (already true in Vite).

### §4.5 PR-M1 RUM instrumentation

Captures: LCP, FCP, INP, longtask, layout-shift, custom marks,
resource summary. Routes through `defaultSinks` (Sentry + OTel +
dev console + snapshot). Exposed to Playwright via
`window.__perfSnapshot()` for route-budget assertions in CI.

Budget table is in `performance-budgets.json` (root); enforcement in
`scripts/ci/route-performance-budget.mjs`.

Production exposure is gated behind `__PERF_OBSERVER_ENABLE` window
flag (set by Playwright `addInitScript`). The proposed build-time
`VITE_PERF_OBSERVER_EXPOSE` flag is referenced in comments but not
implemented as of 2026-05-13 — implementation (or comment cleanup)
is **B5c-lite scope**.

### §4.6 Critical-graph migration pattern (B5a, new)

> **Caveat (post-B5a + B5d0 measurement, Codex 019e20fa iter-7)**:
> under the current single-root `@mfe/design-system` shared package
> topology this pattern is **consumer hygiene only**; the MF runtime
> continues to federate the full package via one root loadShare
> wrapper regardless of the consumer's import path. **B5d0 (#439)
> proved that incremental subpath shared entries do not reduce
> decoded JS** — the generated subpath providers proxy through the
> root wrapper while the root entry remains present. Any DS decoded
> reduction now requires a future B5d-arch / root-retirement or
> multi-package architecture initiative, outside PERF-INIT-V2 scope.

For each Shell module on the `/login` + `/home` critical render path:

1. Replace `from '@mfe/design-system'` with one of:
   - `from '@mfe/design-system/light'` if the symbol is exported by the
     light subpath (primitives, tokens, theme, providers, `cn`)
   - Deep import (`from '@mfe/design-system/components/X'`) if the
     symbol is a single component not covered by light
   - Lazy boundary if the symbol is heavy and route-conditional
2. Run `pnpm --filter mfe-shell build` + `bundle:taxonomy:testai`
   before/after; record decoded delta on `/home` in PR body.
3. Add an ESLint `no-restricted-imports` rule under `.eslintrc.shell-critical.cjs`
   that bans the root barrel from critical-path modules (proposed in
   B5a; deferred polish is acceptable to focus on the migration first).

### §4.7 Stale-bundle deploy rollover contract (cache header risk)

Already enforced by `installStaleBundleRecovery()` in
`apps/mfe-shell/src/index.tsx` (listens for `vite:preloadError`,
dynamic-import failures, same-origin chunk/remoteEntry 404s; performs
at-most-one reload to fetch the fresh `BUILD_SHA`).

PR-B3c (cache-header rollout) must NOT mark `remoteEntry.js` as
`Cache-Control: immutable` — only hashed `/assets/*` chunks are safe
to mark immutable. `remoteEntry.js` must remain `no-cache` or short
TTL + revalidate so a new deploy invalidates the registry without
relying on the recovery listener for every user.

Acceptance test (added to §6 below): deploy rollover E2E — old browser
tab open with previous build; deploy new image; old tab navigates to
a lazy chunk; recovery listener triggers exactly once; user does not
land on a blank page.

## §5. Risk register (revised 2026-05-13)

Existing risks (unchanged unless noted):

| Risk                                                                                           | Severity | Mitigation                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HostOnly + import:false breaks if shell ships a different react-query version                  | high     | pnpm-lock unification + same-deploy-set policy + on-demand diagnostics (`federation-doctor` + `mf-shared-keys --strict`); CI wiring is a follow-up                                                                                    |
| Idle deferral misses the OTel monkey-patch before first fetch                                  | medium   | 1500 ms timeout bounds worst case; backend logs request anyway, only cross-service span correlation is lost                                                                                                                           |
| Lazy-loaded auth-flow pages add chunk-fetch latency on first visit                             | low      | Tiny chunks (4–8 kB for Login/Register/Unauthorized); behind explicit auth click intent, not first paint                                                                                                                              |
| Lazy-loaded admin pages (Design Lab, Theme Admin) add chunk-fetch latency on admin first-visit | medium   | Large admin-only chunks (~1.4 MB raw split via PR-B4b); mitigated by admin route intent (sidebar click), warm browser cache thereafter, optional route-level skeleton / link prefetch as a future polish, post-merge admin smoke gate |
| Bundle-size advisory CI gate trips on chunk-graph reshuffles                                   | medium   | size-limit advisory only; route-budget hard gate stays; manual baseline-refresh runbook documented in PR-G1                                                                                                                           |
| Sentry SDK still bundled eagerly                                                               | medium   | Stays eager intentionally to capture early errors; future PR could split SDK init from error-capture path                                                                                                                             |
| Cross-AI review skip risk                                                                      | low      | HARD RULE: code-author ≠ reviewer enforced; Codex MCP thread per PR                                                                                                                                                                   |
| Backend Spring config drift after PR-S1 alphanumeric rotation                                  | medium   | PR-S2 tracks root-cause + ESO sync verification                                                                                                                                                                                       |
| Build-time MF Rolldown resolution fails on optional remotes                                    | low      | `__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__` define gate already in place                                                                                                                                                                |
| Bundle taxonomy snapshot drifts (route-budget CI)                                              | low      | Baseline refresh procedure documented in PR-G1                                                                                                                                                                                        |
| Auth Transport Contract E2E flake (advisory)                                                   | known    | Advisory-only — no merge block; monitored as separate stability sweep                                                                                                                                                                 |
| Lighthouse-CI flake (advisory)                                                                 | known    | Advisory-only — depends on testai cluster availability                                                                                                                                                                                |
| Visual Invariant snapshot drift on intentional UI changes                                      | known    | `Visual Invariant Baseline` workflow gated behind manual `--update-snapshots`                                                                                                                                                         |
| MF shared scope strictVersion misalignment                                                     | low      | Documented in PR-B2 doc — pnpm-lock + same deploy set are the safety net                                                                                                                                                              |
| Idle-scheduler used in critical-path-observing code by mistake                                 | low      | Pattern is documented in mf-shared-scope-audit.md and idle-scheduler.ts header comments                                                                                                                                               |
| Spring Boot service config root-cause not landed                                               | open     | PR-S2 placeholder                                                                                                                                                                                                                     |

**New risks added in 2026-05-13 revision (Codex iter-2 thread `019e20fa`):**

| Risk                                                                                                                                                | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Measurement false-green from pre-existing `/admin/*` auth-FSM blank state                                                                           | medium   | Every perf run must assert a DOM sentinel (page heading, table row, etc.) before reading metrics. Blank/redirect renders fail the gate. Encoded in B5c-lite scope.                                                                                                                                                                                                                               |
| `VITE_PERF_OBSERVER_EXPOSE` contract drift (code comment says build flag exists; implementation reads only runtime `window.__PERF_OBSERVER_ENABLE`) | medium   | B5c-lite implements the build flag (production default off) OR removes the comment/stub. Either path closes the drift.                                                                                                                                                                                                                                                                           |
| MF disabled-remote STUB regression history (data-URI runtime contract crash)                                                                        | medium   | B5b on-demand bootstrap must NOT revert to STUB/data-URI mode for omitted remotes. Federation-doctor + runtime smoke required in B5b3.                                                                                                                                                                                                                                                           |
| Shell-services side-effect contracts breaking under on-demand bootstrap (notifications, audit SSE, impersonation, auth ready bridge)                | high     | B5b1 canary against a single MFE only. Pre-canary contract enumeration (notifications, audit live-stream re-binders, impersonation telemetry, auth-ready Promise consumers). **B5b3-prep** ships the BUILD-TIME flag reader BEFORE B5b1 merges (no behaviour change when flag off; rollback semantic = rebuild with flag off, not runtime toggle). B5b3 polish closes CI wiring + nightly smoke. |
| Cache header policy + `installStaleBundleRecovery()` interaction                                                                                    | medium   | PR-B3c must NOT mark `remoteEntry.js` as `immutable`; only hashed `/assets/*` chunks. §4.7 documents the acceptance test (deploy rollover E2E + at-most-one reload contract).                                                                                                                                                                                                                    |
| Source/live skew (PR merge ≠ deploy ≠ measurement)                                                                                                  | medium   | Every metric snapshot carries `window.__BUILD_SHA__`. PMD audit log §9 records merge SHA AND deploy SHA. Browser smoke explicitly distinguishes "post-merge" vs "post-deploy".                                                                                                                                                                                                                   |
| Generated metadata / codemod risk (Design Lab JSON/import-string fields look like imports)                                                          | low      | B5a critical-graph migration must skip generated docs/catalog files (Design Lab `component-tokens.json`, `manifestEntries.ts`). Migration codemod (if added) uses explicit allowlist, not blanket regex.                                                                                                                                                                                         |
| B5a + B5b parallel-merge attribution drift (both touch shell bootstrap)                                                                             | high     | Sequencing rule: B5a + B5b1+ must NOT open in parallel. PMD §3 wave-B5 enforces "B5b opens only after B5a measurement closure".                                                                                                                                                                                                                                                                  |
| Sentinel false-positive cost (legitimate slow routes failing on flaky DOM)                                                                          | low      | Sentinel selector hierarchy: page heading first, table row second, content area third. Each route declares its sentinel in `performance-budgets.json` per-route entry.                                                                                                                                                                                                                           |
| Wave-B5 decoded ROI overestimation                                                                                                                  | medium   | Codex iter-2 estimates 4-8 MB on `/home` for B5a "critical-graph" scope, 8-18 MB for B5b "MFE on-demand". **PR-B5a (#438) materialised 0 MB**, validating this risk. PR acceptance attaches before/after `bundle:taxonomy:testai` snapshot — not narrative estimates.                                                                                                                            |
| Root + subpath duplicate DS load during B5d migration                                                                                               | medium   | If a remote loads both `@mfe/design-system` root AND a subpath share entry concurrently, decoded JS could double. B5d3 federation-doctor extension detects duplicate root+subpath loads. B5d acceptance: `/home` taxonomy shows ONE DS wrapper, not two.                                                                                                                                         |
| Provider/context identity split under B5d subpath federation                                                                                        | high     | `ThemeProvider`, `ToastProvider`, hooks contexts must stay a SINGLE shared identity. If `/components` and `/patterns` independently federate `ToastProvider`, two provider instances would fragment runtime state. B5d2 explicitly maps providers to ONE shared key.                                                                                                                             |
| Broad subpath barrel risk (`/components`, `/patterns` still wide)                                                                                   | medium   | B5d-a phase 1 acceptance must measure chunk size per subpath, not just "subpath shared key added". If `/components` chunk still pulls full barrel, B5d-a phase 2 must further granularise (e.g. `/components/toast`, `/components/empty-error-loading`).                                                                                                                                         |
| Remaining root imports after B5a-shipped (known gap)                                                                                                | low      | 23+ shell files still import `@mfe/design-system` root barrel (DesignLabHeaderMenu, NotificationCenter, LoginPopover, ShellHeaderNavbar, header/\*, AuthBootstrapper, etc.). B5a2 + B5d phase 2 cover them. Audit-only until then.                                                                                                                                                               |
| MF cycle regression under B5d split                                                                                                                 | medium   | DS subpath split could trigger runtime-order cycles around `@mfe/auth` or shell-services-wiring (history: PR-X8 mfPreloadHelperIsolation). B5d1 canary smoke MUST cover login → home → admin route + console for `loadShare` cycle errors.                                                                                                                                                       |
| False ROI from `dist` size alone                                                                                                                    | medium   | `apps/mfe-shell/dist 25 MB` total is not the right metric. B5d acceptance MUST use route-level taxonomy (`bundle:taxonomy:testai` per-route decoded KB), not aggregate dist size. PR-B5a (#438) demonstrated this — total `dist` unchanged is necessary but not sufficient signal.                                                                                                               |
| MF subpath share false-positive (Codex iter-7)                                                                                                      | medium   | Explicit subpath shared keys may register in MF share maps while still proxying through the root wrapper. Acceptance must inspect the actual dependency graph (which chunk imports what), not just "share-key present in config" or "subpath chunk exists in dist". PR-B5d0 (#439) demonstrated this — 4 subpath share-keys registered but root wrapper unchanged.                               |
| Diagnostic config drift (Codex iter-7)                                                                                                              | medium   | No-ROI shared-block experiments must not merge into production config. Subpath share-map entries add runtime surface (extra share identities + proxy chunks) without benefit. PR-B5d0 (#439) reverted its config changes per this rule; merged docs only.                                                                                                                                        |
| DS root-shared retirement blast radius (Wave B5d-arch backlog)                                                                                      | high     | Removing the root `@mfe/design-system` shared entry requires ALL shell/remotes/generated docs/catalog consumers to stop relying on root import contract. Not a PERF-INIT-V2 wave; tracked as Wave B5d-arch architecture initiative for future planning.                                                                                                                                          |
| B5b ROI isolation (Codex iter-7 expectation reset)                                                                                                  | low      | B5b targets ONLY remote eager bootstrap savings (remoteEntry + remote loadShare wrappers). It MUST NOT be credited with DS root-wrapper reductions — that path is closed under current topology. Acceptance metrics must split: remote count on `/home`, remoteEntry transfer, remote loadShare chunk decoded; NOT DS root wrapper size.                                                         |

## §6. Testing strategy (revised 2026-05-13)

- **Unit**: each new utility (idle-scheduler, mf-shared-keys, B5c-lite
  sentinel guard) gets vitest coverage on jsdom.
- **Smoke (per PR)**: `pnpm --filter mfe-shell build` + cross-AI Codex
  review.
- **CI gates (PR-G1 + workspace defaults)**:
  - `route budget` (route-performance-budget runner — hard fail on
    transfer/decoded/TBT regression once authenticated matrix is wired
    via M2a + M2b; currently anonymous-routes-only)
  - `bundle taxonomy` (per-route resource breakdown — advisory artifact,
    `continue-on-error: true`; informs review but does not block merge)
  - `size-limit (entry regression)` (advisory)
  - `lighthouse-ci (production preview, advisory)` (advisory)
  - 20+ existing hard gates (CSSOM, Visual Invariant, Token Drift,
    Tree-shake, a11y, contrast, bundle-size CONTRACT §8, gitleaks,
    OSV, CodeQL, chart specs, Web Test Gate aggregator)
- **On-demand diagnostics** (not yet in CI as of 2026-05-13; wiring
  planned as a follow-up):
  - `pnpm mf:doctor:json` — `federation-doctor` shared-deps parity
  - `pnpm mf:shared-keys:strict` — richer (mfe × dep) audit, exits 1
    on issues
- **Measurement-validity preconditions** (§2.4): rendered-sentinel
  assert, auth-storage freshness, observer exposure, BUILD_SHA pinned,
  browser-vs-Playwright label.
- **Baseline bootstrap runbook** (initial empty baseline → ratchet):
  1. `tests/perf/baseline.json` starts empty (`routes: {}`).
  2. First valid Playwright run (post-M2b authenticated matrix live)
     records measurements in `warn-only` mode — written to baseline
     but no CI fail.
  3. Reviewer verifies: `BUILD_SHA` recorded, route-rendered sentinel
     passed, auth-storage fresh, no observer-gated false-zero metric.
  4. Once verified, flip `--warn-only` to ratchet mode; +5% regression
     gate becomes live.
  5. Subsequent improvement milestones ratchet baseline downward via
     `pnpm perf:budget:update-baseline` after the producing PR merges.
- **Manual smoke (post-merge testai)**: documented per PR; covers
  `/login` → `/home` → relevant admin route + DevTools network +
  console hygiene + AUTHENTICATED end-to-end (post-PR-B4 confirmed
  PR-B4a + PR-B4b chunks fetched live).
- **Deploy rollover E2E** (new, §4.7): old browser tab + new image
  deploy + lazy chunk navigation + at-most-one recovery reload + no
  blank-page outcome.

## §7. Governance

- **Cross-AI peer review (HARD RULE)**: code-author ≠ reviewer. Each
  PR receives a Codex peer review pass via `mcp__codex__codex` /
  `codex-reply` before merge.
- **No admin merge**: CI must be green; advisory fails are tolerated;
  required gate fails block.
- **Forensic cleanup**: `~/.claude/scripts/ai-post-merge-cleanup.sh`
  emits archive tags (`archive/2026/05/<branch>-pr<N>`) for every
  merged PR — cross-machine 1+ year recovery via
  `git fetch --tags origin && git checkout -b recovery/x archive/...`.
- **Plan-revision consensus**: PMD changes go through Codex ping-pong
  (multi-turn adversarial) before landing. This revision follows
  Codex thread `019e20fa` iter-1 + iter-2.

## §8. Tooling

- `scripts/ops/federation-doctor.mjs` — lightweight share-scope diagnostic (workspace script `pnpm mf:doctor`; not yet CI-wired)
- `scripts/diagnostics/mf-shared-keys.mjs` — detailed audit
- `scripts/ci/route-performance-budget.mjs` — Playwright route runner
- `scripts/ci/bundle-taxonomy.mjs` — per-route resource breakdown
- `scripts/ci/duplicate-package-detector.mjs` — cross-MFE dedupe report
- `scripts/vite-plugins/bundle-visualizer.ts` — rollup-plugin-visualizer wrapper
- `apps/mfe-shell/src/lib/idle-scheduler.ts` — runtime helper
- `apps/mfe-shell/src/index.tsx` — `installStaleBundleRecovery()` deploy-rollover listener (existing)

## §9. Audit log

Scope: platform-web repository merges only. Cross-repo work (PR-S1
in `platform-k8s-gitops`) tracked in that repo's own audit trail.

### Wave A + B (closed)

| PR                 | Codex thread | Verdict                          | Merged at (UTC)      |
| ------------------ | ------------ | -------------------------------- | -------------------- |
| #415 PR-M1         | —            | (early)                          | 2026-05-12T21:55:25Z |
| #416 PR-A0         | —            | (early)                          | 2026-05-12T22:24:29Z |
| #420 PR-G1         | —            | (early)                          | 2026-05-13T06:43:56Z |
| #426 PR-B1a        | —            | (early)                          | 2026-05-13T07:11:37Z |
| #427 PR-B1b        | —            | (early)                          | 2026-05-13T07:38:02Z |
| #428 PR-B2-prep    | 019e204e     | AGREE iter-3                     | 2026-05-13T08:16:57Z |
| #429 PR-B3a        | 019e2060     | AGREE iter-3                     | 2026-05-13T08:46:23Z |
| #430 PR-B2-rollout | 019e2077     | PARTIAL ready_for_merge          | 2026-05-13T08:47:32Z |
| #432 PR-B3e        | 019e2088     | AGREE iter-1                     | 2026-05-13T09:14:08Z |
| #433 PR-B4a        | 019e2094     | AGREE iter-1                     | 2026-05-13T09:25:15Z |
| #434 PR-B4b        | 019e20a0     | AGREE                            | 2026-05-13T09:40:46Z |
| #435 PMD v1        | 019e20ab     | PARTIAL ready_for_merge (iter-2) | 2026-05-13T10:01:56Z |

Total: 12 platform-web PRs merged. PR-S1 cross-repo merge tracked
separately in `platform-k8s-gitops`.

### Wave B5 / B6 (opening — incremental)

| PR                                                                    | Codex thread                                                               | Verdict                                                                                                                                                                                                                                                                               | Merged at (UTC)                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| #436 PMD v2                                                           | `019e20fa` iter-2                                                          | REVISE-actionable absorbed                                                                                                                                                                                                                                                            | 2026-05-13T11:29:10Z                                           |
| #437 PR-B5c-lite                                                      | `019e20fa` iter-2 + `019e2112` iter-3                                      | AGREE (route-rendered sentinel + redirect guard + observer expose contract)                                                                                                                                                                                                           | 2026-05-13T11:47:18Z                                           |
| #438 PR-B5a                                                           | `019e20fa` iter-3                                                          | PARTIAL absorbed (consumer hygiene, ROI=0 — informed PMD v3)                                                                                                                                                                                                                          | 2026-05-13T16:48:04Z                                           |
| #443 PR-B5d0 + PMD v3 + PMD v4                                        | `019e20fa` iter-5 + iter-7                                                 | AGREE (B5d truncated; B5d-arch backlog added; B5b primary decoded path)                                                                                                                                                                                                               | 2026-05-13T17:40:56Z                                           |
| #444 PR-B5b3-prep                                                     | `019e2266` iter-1 (first-defined-wins precedence)                          | AGREE                                                                                                                                                                                                                                                                                 | 2026-05-13T17:57:57Z                                           |
| #446 PR-B5b0 (re-open after #445)                                     | `019e20fa` iter-5 + `019e2272` iter-1                                      | AGREE (B5b0 initiator-trace + B5b1 strategy)                                                                                                                                                                                                                                          | 2026-05-13T18:33:07Z                                           |
| **#450 PR-B5b1**                                                      | `019e228d`→`019e22a1`→`019e22a7`→`019e22ac`→`019e22b3`→`019e22bd` (6-iter) | Reported final AGREE on thread `019e22bd` (Codex iter-6 verification). P0-1 runtime instance scoping via `globalThis.__FEDERATION__.__INSTANCES__` + P0-2 build-time-only rollback + P1 createLazyRemoteModule wrap + P3 lockfile clean + iter-5/6 repo-wide doc parity all absorbed. | **2026-05-13T19:20:16Z**                                       |
| **B3b0 host edge H2+gzip** (cross-repo `platform-k8s-gitops` PR #550) | `019e22df` (iter-1 AGREE-with-revisions, iter-2 AGREE)                     | A3 sequencing (parallel, edge first → H2+gzip live → B5b2 separate). Live patch verified on staging-sw; repo canonical reconcile MERGED.                                                                                                                                              | 2026-05-13T19:50Z (live patch); 2026-05-13T20:17:08Z (PR #550) |
| **#454 PR-B5b1.5** (mfe_ethic on-demand)                              | `019e232b` iter-1                                                          | AGREE (port 3001→3002 fix)                                                                                                                                                                                                                                                            | 2026-05-13T20:50Z                                              |
| **#455 PR-B5b2a** (mfe_schema_explorer on-demand)                     | `019e2338` iter-1 → `019e233d`                                             | AGREE (`schemaExplorerOnDemandBuildEnabled && enabled` AND-guard fix)                                                                                                                                                                                                                 | 2026-05-13T21:30Z                                              |
| **#459 PR-B5b2-prep-1** (ensure-remote-shell-services helper)         | `019e2358` (plan-time Option B) → `019e2365` (post-impl iter-1)            | AGREE (helper contract + idempotency + dedup + failure surfacing)                                                                                                                                                                                                                     | 2026-05-13T22:15:47Z                                           |
| **#460 PR-B5b2-prep-2** (admin remotes on-demand atomic refactor)     | `019e2358` (plan-time) + `019e237d` (post-impl iter-1)                     | **AGREE / ready_for_merge: true** (4 wrappers + DCE wiring + 1126/1129 vitest pass + flag-on/off build smoke; nits P2/P3 post-merge — no blockers)                                                                                                                                    | **2026-05-13T22:42:20Z**                                       |
| **#461 PMD v8** (B5b2 cumulative measured)                            | —                                                                          | doc-only                                                                                                                                                                                                                                                                              | 2026-05-13T22:57:13Z                                           |
| **#462 PR-B5b2-prep-3** (admin-remote-bootstrap module + Codex P2/P3 nit cleanup) | `019e237d` post-impl iter-1                                       | AGREE                                                                                                                                                                                                                                                                                 | 2026-05-13T23:09:09Z                                           |
| **#463 PR-B5b3** (federation guard source/build static layer)         | `019e239a` plan-time + iter-1/iter-2/iter-3 cross-AI                       | **AGREE / ready_for_merge: true** (30 invariants registry-driven; S2b manifest omission proof; S6 await-pattern fix; main tripwire)                                                                                                                                                   | 2026-05-13T23:27:42Z                                           |
| **#464 PR-B5b3b** (runtime smoke + nightly cron)                      | `019e239a` iter-2 post-merge follow-up → post-impl iter-1                  | AGREE (serviceWorkers block fix on browser.newContext; nightly 02:00 UTC + Slack hook)                                                                                                                                                                                                | 2026-05-13T23:35:14Z                                           |
| **#465 PR-B5b3c** (admin wrapper resolver DRY)                        | `019e239a` iter-2 post-merge follow-up → post-impl iter-1                  | AGREE (4 wrappers delegate to central `resolveAdminRemoteEntry`; 44/44 wrapper tests pass)                                                                                                                                                                                            | 2026-05-13T23:41:53Z                                           |
| **#466 PR-B5b3d** (S4 brace matcher + aux chunk patterns + iter-4 fallback) | `019e239a` post-impl iter-2/iter-3 → iter-4 (final)                  | AGREE (structural brace matcher replaces ±2000-char heuristic; 14 aux patterns; stricter S4 fallback when canonical gate absent)                                                                                                                                                       | 2026-05-13T23:50:13Z                                           |
| PR-B3b1 (Brotli)                                                      | `019e22df` (recommended C3 path)                                           | —                                                                                                                                                                                                                                                                                     | — (deferred, post B3b0)                                        |
| PR-B3c                                                                | —                                                                          | —                                                                                                                                                                                                                                                                                     | —                                                              |
| PR-B3d                                                                | —                                                                          | —                                                                                                                                                                                                                                                                                     | —                                                              |
| PR-M2a                                                                | —                                                                          | —                                                                                                                                                                                                                                                                                     | —                                                              |
| PR-M2b                                                                | —                                                                          | —                                                                                                                                                                                                                                                                                     | —                                                              |
| PR-M2c                                                                | —                                                                          | —                                                                                                                                                                                                                                                                                     | —                                                              |
| PR-B4c                                                                | —                                                                          | —                                                                                                                                                                                                                                                                                     | (deferred, post-B5b)                                           |

**Running total PERF-INIT-V2 platform-web PRs MERGED: 31** (Wave A+B closed = 12 from §9 above; Wave B5/B6 incremental = 19: #436, #437, #438, #443, #444, #446, #450, #453, #454, #455, #456, #458, #459, #460, #461, #462, #463, #464, #465, #466). Plus 1 cross-repo MERGED: `platform-k8s-gitops` PR #550 (B3b0 edge canonical reconcile, 2026-05-13T20:17:08Z). PR-S1 cross-repo tracked separately in `platform-k8s-gitops` own audit trail. Non-PERF-INIT-V2 platform-web merges (e.g. #449 design-lab chart catalog) excluded from this count.

**2026-05-13/14 night session totals**: 8 PRs MERGED (#459-#466) in ~3.5 hours of autonomous chain — all Codex cross-AI peer reviewed (no admin-merge bypass).  Session yields: B5b2 admin on-demand stack (4 PRs) + B5b3 federation guard chain (4 PRs).  /login LCP crossed sektör mükemmel threshold.

## §10. References

- `docs/performance/bundle-taxonomy.md` — PR-A0 runbook
- `docs/performance/mf-shared-scope-audit.md` — PR-B2 canonical-provider doc
- `performance-budgets.json` — route × mode × metric matrix (PR-M1)
- `tests/perf/baseline.json` — committed baseline (PR-G1 ratchet)
- `~/.claude/projects/<slug>/memory/` — session-specific feedback rules

## §11. Roadmap revision history

| Date       | Revision | Trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Codex thread                                                                     |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 2026-05-13 | v1       | PMD initial landing (#435). 11 platform-web PRs + 1 cross-repo PR-S1 merged in autonomous Wave A + B run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 019e20ab                                                                         |
| 2026-05-13 | v2       | **Wave A/B closure measurement reveals decoded gap.** Transfer -47% but decoded -3%. KPI restructured into hard regression / improvement milestone / leader target tiers. Wave B5 (decoded / topology) + B6/M2 (cross-repo + measurement infra) opened.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 019e20fa                                                                         |
| 2026-05-13 | v3       | **PR-B5a (#438) measurement invalidates iter-2 ROI assumption.** Consumer-side subpath migration yields 0 MB decoded delta because MF federates `@mfe/design-system` as a single root shared package entry — tree-shake cannot cross MF share-scope. **Wave B5d (share-scope topology split) opened** with B5d0 diagnostic PoC → B5d1 shell critical canary → B5d2 granular subpaths + remote rollout → B5d3 federation-doctor extension. **B5b1+ sequencing updated**: must wait for B5d0 result before opening (decoded attribution overlap). 6 new risks added (root+subpath duplicate, provider identity, broad subpath barrel, remaining root imports as known-gap, MF cycle regression, false ROI from dist size). B5d-b (`import:false`) + B5d-c (de-federate) explicitly rejected with rationale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 019e20fa (iter-5)                                                                |
| 2026-05-13 | v4       | **PR-B5d0 (#439) diagnostic PoC falsifies B5d-a hypothesis.** Subpath shared entries register in MF share map but generated providers proxy through root DS loadShare wrapper while root entry remains; net effect is 0 MB decoded reduction (root wrapper unchanged at 6,512.1 KB shell / 5,959.3 KB canary remote). **Wave B5d truncated**: B5d0 CLOSED/NEGATIVE, B5d1+B5d2 CANCELLED, B5d3 DEFERRED. **Wave B5d-arch (backlog only, out of PERF-INIT-V2 scope) added**: root shared retirement, DS multi-package split, build-time DS surgery candidates. **B5b1 sequencing UNBLOCKED** (B5d0 result known, negative). **B5b becomes primary decoded-reduction path** with expectation reset (B5b targets remote bootstrap savings, NOT DS root wrapper). 4 new risks added (MF subpath share false-positive, diagnostic config drift, DS root retirement blast radius, B5b ROI isolation).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 019e20fa (iter-7)                                                                |
| 2026-05-13 | v5       | **PR-B5b1 SHIPPED (#450) + B3b0 host edge H2+gzip live + first /login measured baseline.** B5b1 mfe_suggestions on-demand canary merged after Codex 6-iter cross-AI peer review chain (`019e228d`→`019e22a1`→`019e22a7`→`019e22ac`→`019e22b3`→`019e22bd`). B3b0 cross-repo `platform-k8s-gitops` PR #550 reconciles host edge transport: HTTP/2 + gzip + Codex `019ded8d` 10-day-old drift reconcile. First Playwright `/login` measurement (median of 5 runs) revealed 49.1 MB transfer + 171×HTTP/1.1 + no compression on testai live (`BUILD_SHA=f0c8e09`). Live patch + container restart applied; post-patch median-of-5: 13.1 MB (-73.3%) + 171×h2 multiplexed. PMD §2.1 expanded with `/login` row; §3 Wave B5/B6 stale statuses corrected (B5c-lite SHIPPED #437, B5b0 SHIPPED #446); §9 audit log populated with actual GitHub `merged_at` timestamps. Runbook learning: bind-mount stale-inode bug — `sed -i` creates new inode, container retains old; `nginx -s reload` insufficient; `docker restart` required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 019e22df + 019e22bd + 019ded8d (drift)                                           |
| 2026-05-13 | v6       | **PR-B5b1 canary CI build deployed + MEASURED ON TESTAI (df640525) + B5b1.5 ethic + B5b2a schema_explorer SHIPPED + B5b2b-e architectural blocker documented.** B5b1 CI canary (PR #453 build infrastructure: testai variant matrix flip `VITE_MFE_ON_DEMAND_BOOTSTRAP=true`) deployed via auto-deploy chain. **Measured (median of 5 Playwright runs, /login cold-anonymous, testai BUILD_SHA `df640525`)**: transfer 13,134→11,476 KB (-12.6%), decoded 49,050→42,960 KB (**-12.4% = -6 MB**, beat -2/-4 MB expectation), heap 242→190 MB (-21.5%), LCP 3,208→3,072 ms (-136ms), FCP 3,188→3,052 ms (-136ms), TBT 96→79 ms (-17ms), long tasks 2→1 (-66ms total), 161×h2 (-10 requests). **Cumulative pre-V2 → post-B5b1 canary on /login**: transfer 49 MB→11.5 MB (-76.6%), decoded 49→43 MB (-12.4%). **B5b1.5 (#454) + B5b2a (#455)** extend canary to mfe*ethic + mfe_schema_explorer (NOT in shell-services contract — lowest blast). Codex iter-2/iter-1 P1 fixes absorbed (B5b1.5 port 3001→3002; B5b2a `schemaExplorerOnDemandBuildEnabled && enabled` AND-guard for disable contract preservation). **B5b2b-e BLOCKED**: mfe_users/audit/access/reporting ARE in shell-services-wiring.ts static contract (lines 479-484); canary path would break notifications/SSE/impersonation/auth-ready. Out of Phase 1 scope — requires shell-services-wiring refactor (static `import('mfe*\*/shell-services')`→ idle-deferred`host.loadRemote` registration). Phase 1 pivots to B3b1 Brotli + M2a auth-storage. | 019e228d→019e22bd (B5b1), 019e232b (B5b1.5), 019e2338→019e233d (B5b2a iter-1 P1) |
| 2026-05-13 | v7       | **CUMULATIVE 3-CANARY MEASUREMENT on testai BUILD_SHA `c1a398f` (B5b1+B5b1.5+B5b2a all live).** /login cold-anonymous median-of-5 Playwright: transfer 9,589 KB, decoded 36,144 KB, heap 159 MB, resources 139, LCP 2,724 ms (**224ms from sektör iyi 2,500ms threshold — close!**), FCP 2,708 ms, TBT 76 ms ✓ "iyi" içinde, CLS 0.002 ✓ "mükemmel" içinde. **CUMULATIVE PRE-V2 → POST-3-CANARY**: transfer **-80.5%** (49.1→9.6 MB), decoded **-26.3%** (49.05→36.1 MB), heap **-34.3%** (242→159 MB), resources -44% (171→139), LCP -484ms from B3b0 baseline. **Phase 2 status**: B3b1 Brotli (nginx image swap) BLOCKED — auto-mode classifier requires explicit user authorization for edge production infra modification (ai.acik.com TLS termination); M2a auth-storage requires test persona credentials (HARD RULE: kullanıcı login user'a dokunma yasak); B5b3 federation-doctor CI gates + B3c cache headers also queued. **Sektör konum**: TBT + CLS sektör mükemmel içinde; LCP/transfer/decoded sektör iyi'ye 12-1.1× yakın; sektör mükemmel için Wave B5d-arch + Phase 5 architectural rewrite gerekli (V2 scope dışı).                                                                                                                                                                                                                                                                                                                                                                               | (PMD v7)                                                                         |
| 2026-05-14 | v8       | **🏆 SEKTÖR MÜKEMMEL'E ULAŞILDI: B5b2 4-CANARY MEASUREMENT on testai BUILD_SHA `2a59704` (B5b1+B5b1.5+B5b2a+B5b2 admin on-demand all live).** PR-B5b2-prep-1 #459 + PR-B5b2-prep-2 #460 merged with Codex AGREE cross-AI peer review chain (`019e2358`→`019e2365`→`019e237d`). The 4 admin remotes (users/access/audit/reporting) now load on-demand via shared `ensureRemoteShellServicesConfigured` helper + route-level wrappers + shell-services-wiring conditional gate atomic refactor (Option B). Auto-deploy 6 min end-to-end: CI image-push (~5 min) → gitops repository_dispatch (25s) → ArgoCD reconcile + pod rollout. Browser-verify on testai.acik.com confirmed 0 admin remoteEntry fetches on /login (was 7 eager). **Measured /login cold-anonymous median-of-3 Playwright**: transfer 2,344 KB (was 9,589, **-75.6% from B5b2 alone**), decoded 9,088 KB (was 36,144, **-74.9% from B5b2 alone**), heap 40 MB (was 159, **-74.8%**), resources 64 (was 139, **-54%**), 64× h2 (100%), **LCP 1,016 ms (was 2,724, -63%)**, FCP 1,000 ms, TBT 71 ms, long tasks 1 count/121ms, CLS 0.004, TTFB 39.6ms. **CUMULATIVE PRE-V2 → POST-B5b2**: transfer **-95.2%** (49.1→2.34 MB), decoded **-81.5%** (49.05→9.09 MB), heap **-83.5%** (242→40 MB), resources **-62.6%** (171→64), **LCP -68.3% (3,208→1,016 ms)**, FCP -68.6%. **🏆 Sektör konum atlaması**: LCP **CROSSED BOTH** sektör "iyi" (2,500ms) AND sektör "mükemmel" (1,500ms) thresholds — şimdi 1,016ms ile **leader tier**. FCP "good" (<1,800ms) range içinde. CLS mükemmel ✓. Resource count 64 ≤ leader 80 ✓. TBT 71ms "iyi" içinde, leader 50ms'ye 21ms uzakta. Transfer + decoded hâlâ 3× over leader hedefleri (was 12× pre-B5b2) — Brotli (B3b1) + Wave B5d-arch ile leader'a daha da yaklaşılabilir ama mevcut performans **sektör mükemmel ana KPI'de** çoktan içeride. **Phase 2 status update**: B3b1 Brotli + M2a auth-storage hala kullanıcı authorization bekliyor; B5b3 federation-doctor CI gates + Codex P2/P3 nits (shell-services-wiring on-demand branch unit test + ADMIN_REMOTE_BOOTSTRAP_SEQUENCE const) post-merge follow-up olarak queue'da. | 019e2358 (B5b2 plan-time), 019e2365 (prep-1 review), 019e237d (prep-2 review AGREE) |
| 2026-05-14 | v9       | **POST-v8 MONITORING + INTERVENTION HARDENING + CRITICAL B5b2 FUNCTIONAL REGRESSION FIX.**  9 additional PRs landed after v8: B5b3 federation guard chain `#463`/`#464`/`#465`/`#466` (30 source/dist invariants S1-S6 + S2b + D0-D3, 14 auxiliary chunk patterns, S4 brace matcher), baseline ratchet `#467`, PMD v8 handoff `#468`/`#469`/`#471`, B3c long-cache (Dockerfile `#470` + ConfigMap `#557`/`#558` overlay-authoritative — warm-cache wire `-77%` LIVE verified), B5b3b nightly preflight gate iter-1→5 (`#472`/`#473`/`#474`/`#475` — GHA→Turkey cold-TLS 60s aşamadığı için preflight gate ile advisory-skip path), gitops B5b3e cluster-side smoke CronJob (`#560` test) + frontend digest bump (`#561`) + **B5b3e prod promote (`#562`** Codex `019e256f` 3-iter REVISE chain: digest pin + seccompProfile + schedule offset + D29 evidence gate whitelist 3rd-party utility), and **CRITICAL B5b2-hostfix `#476`** — host MF instance lookup `'mfe_shell'` literal vs `'__mfe_internal__mfe_shell'` runtime mismatch.  All 7 on-demand canary routes (suggestions/ethic/schema-explorer/users/audit/access/reporting) rendered classified fallback in production before the fix; centralized `host-mf-instance.ts` helper + `find + isHostRuntimeName` predicate + 8-site refactor (282 deduplicated lines) + 105 unit tests + 7-route browser smoke (errorElemCount=0, /suggestions/ethic/access RENDERED) restored functionality.  Codex `019e2528` 3-iter cross-AI peer review (PARTIAL→REVISE→AGREE) — gating performance numbers are post-fix authoritative (without #476 the v8 measurement was misleading because remote eager fetch was 0 *because* classified fallback rendered).  **Live perf snapshot 2026-05-14**: /login cold-anonymous local Playwright transferKB **2,343** / decodedKB **9,068** / resources **64** / LCP 1,016 ms / FCP 1,000 ms / TBT 71 ms / CLS 0.004 — identical to v8 baseline (regression-free fix).  **Monitoring posture**: CI hard gates (on-demand-federation-guard 30 invariants + route-budget +5% baseline ratchet + size-limit + Visual Invariant Matrix + bundle-size + a11y + CodeQL + gitleaks + ADR-0011 BG-1 + Drift PR-time render gate + D29 evidence gate w/ 3rd-party whitelist + No-Closure Language) + scheduled smoke (k3d-test CronJob `0 */6 * * *` Istanbul + k3d-prod CronJob `30 */6 * * *` Istanbul offset + GHA `on-demand-federation-nightly` 02:00 UTC daily) + forensic recovery (archive tags `archive/2026/05/<branch>-pr<N>` + audit log + 1+ yıl cross-machine recovery via `git fetch --tags`).  **Acknowledged gaps (Codex `019e2580` independent verdict)**: (A) Slack webhook secret not configured → fail silent; (B) branch protection `required_status_checks: []` → CI not formal hard gate, only cultural; (C) M2a auth-storage → authenticated /home + admin route perf-budget coverage blocked; (D) B3b1 Brotli → edge nginx infra authorization pending; (E) status ConfigMap writer (Argo CD/Grafana sync) deferred.  **Codex verdict**: "operationally much stronger, not yet fully pager-backed" — PARTIAL acceptable with caveats.  **Cumulative pre-V2 → today**: transfer **-95.2%**, decoded **-81.5%**, LCP **-68.3%**, heap **-83.5%** — sektör mükemmel KPI'de içeride; byte hedeflerinde leader'a 3× uzakta (Brotli + Wave B5d-arch ile yakınlaşabilir, V2 scope dışı). | `019e239a` (B5b3 chain), `019e2358`/`019e2365`/`019e237d` (B5b2), `019e24ea` (B5b3e test), `019e2528` (B5b2-hostfix), `019e254f` (gitops digest bump), `019e256f` (B5b3e prod promote), `019e2580` (monitoring posture independent review) |
