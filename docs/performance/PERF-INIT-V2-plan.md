# PERF-INIT-V2 — Project Management Document

> **Status:** Wave A+B closed (transfer wave); Wave B5 + B6 opening (decoded/topology wave).
> This document describes the planned, in-progress, and merged work for
> the PERF-INIT-V2 performance initiative on the `platform-web` MFE host.
> It pairs with `docs/performance/bundle-taxonomy.md` (PR-A0) and
> `docs/performance/mf-shared-scope-audit.md` (PR-B2) for implementation
> detail.
>
> **Last update:** 2026-05-13 (post-13-PR run + Codex plan-revision
> ping-pong, threads `019e20fa`/iter-1 REVISE, iter-2 REVISE-actionable).
> Wave-B closure measurements + Codex revision drive the §2 tiered KPI
> restructure and the new B5 wave below.

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

| Route                                  | Metric         | Pre-V2 (2026-05-11) | Current (post-13-PR, testai live `BUILD_SHA=0b54770`) | Delta vs baseline | Gap to leader target |
| -------------------------------------- | -------------- | ------------------- | ----------------------------------------------------- | ----------------- | -------------------- |
| `/home`                                | transfer       | 14,419 KB           | **7,618 KB**                                          | **-47%** ✓        | 2.5× over (3,000 KB) |
| `/home`                                | decoded JS     | 49,947 KB           | 48,539 KB                                             | -3%               | 4× over (12,000 KB)  |
| `/home`                                | TBT            | 2,937 ms            | observer-gated (production mode)                      | not measured      | not measurable yet   |
| `/home`                                | resource count | (≈250)              | 184                                                   | better            | n/a                  |
| `/admin/users`                         | transfer       | est. 14 MB          | **6,598 KB**                                          | better            | ~10% over leader (6,000 KB); improvement-milestone target 4,000 KB |
| `/admin/users`                         | decoded JS     | est. 50 MB          | 48,548 KB                                             | minor             | 2.7× over (18,000)   |
| `/admin/design-lab`                    | transfer       | (eager-bundled)     | 7,151 KB (post-lazy)                                  | large drop        | route-specific       |
| Lazy chunks split out via Wave B (raw) | —              | —                   | **~7.7 MB eager out**                                 | —                 | —                    |

> **Measurement notes:** TBT/LCP cannot be read from the live browser
> session because `window.__perfSnapshot` is intentionally gated behind
> `__PERF_OBSERVER_ENABLE` in production builds (PR-M1 security
> contract). Playwright `route-performance-budget.mjs` injects the flag
> via `addInitScript`, but it needs an authenticated storage state to
> exercise `/admin/*`. Wiring that storage state and a route-rendered
> sentinel is the **B5c-lite** scope (see §3 wave-B5 below).

### §2.2 Tiered KPI semantics

Each tier has different enforcement semantics so plan progress is honest:

| Tier                       | Semantics                                                                                                                                    | Enforcement                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Hard regression gate**   | Current measurement must not regress more than +5% vs the latest committed baseline in `tests/perf/baseline.json`.                           | CI hard fail (route-budget runner once authenticated matrix is live — see M2a auth-storage + M2b authenticated CI matrix) |
| **Improvement milestone**  | Per-wave target — staged stepping stone on the way to leader. Expected post-B5b: `/home` decoded ≤ 25–32 MB; transfer ≤ 5 MB. Next architecture ratchet (DS root-barrel full retirement + i18n async + shared-scope topology): ≤ 18 MB.  | PR acceptance signal; not a CI hard gate                                   |
| **Leader target**          | 12-month aspirational target representing "sector excellent". Decoded `/home` ≤ 12 MB, TBT ≤ 50 ms. Requires architectural redesign in part. | Not a hard gate — directional polestar                                     |
| **Bundle-size CONTRACT §8** | Per-MFE size budget (size-limit) — already a CI advisory.                                                                                    | size-limit advisory (existing)                                             |

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
breaks. (B5b3-prep is the only exception: it ships the rollback flag
only with NO behaviour change, so it can land before B5a closure if
operationally convenient.)

| PR        | Status   | Deliverable                                                                                                                                                                                                                                                                       | Expected ROI                                                                            |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| PR-B5c-lite | NEXT   | Observer expose contract + route-rendered sentinel guard. Production observer flag implementation (or stub-removal). Route-budget runner sentinel/redirect guard so blank pages cannot generate false-green metrics. Auth-storage generator deliberately OUT-OF-SCOPE (M2a).      | Measurement validity (gate enabling)                                                    |
| PR-B5a    | SHIPPED (PR #438) — **decoded ROI=0** | Consumer-side critical-graph subpath migration. 5 files migrated to `/patterns`, `/components`, `/primitives`. **Negative result**: bundle delta = 0 because MF runtime federates `@mfe/design-system` as a single root shared package entry; consumer subpath imports do NOT shrink the `loadShare__@mfe/design-system__loadShare__.mjs` wrapper. Tree-shake cannot cross MF share-scope. Value retained as **consumer hygiene** — see Wave B5d-arch backlog if a future architecture initiative pursues DS topology split. | `/home` decoded: **0 MB** (measured). Wave B5d ELIMINATED — see B5d-arch backlog. Decoded path shifts to B5b. |
| PR-B5a2   | DEFERRED — out of PERF-INIT-V2 | Admin-route root-barrel-thin pass + `/hooks`/`/lib` subpath additions. B5d0 (#439) proved this does not reduce decoded JS under the current root shared topology. Keep only as consumer-hygiene work if a future B5d-arch / root-retirement initiative proceeds. | 0 MB expected in V2; architecture-backlog only |
| PR-B5b0   | PLANNED  | RemoteEntry initiator-attribution diagnostic. CDP `Network.requestWillBeSent` initiator-stack on `/home` cold load. Identifies whether eager remote fetch source is shell-services-wiring, MF runtime preload, or static link preload. Mergeable diagnostic; informs B5b1 canary. **Acceptance**: artifact `tests/perf/initiator-trace/<BUILD_SHA>.json` committed; PMD §3 row updated with finding. | Diagnostic data — not user-facing perf delta                                            |
| PR-B5b1   | UNBLOCKED (B5d0 result known) | MFE on-demand bootstrap canary — single MFE based on B5b0 finding. If shell-services source: `mfe_audit` or `mfe_access`. If MF runtime source: `mfe_suggestions`. **Preconditions**: (1) `MFE_ON_DEMAND_BOOTSTRAP` rollback flag LIVE (B5b3-prep). (2) **B5d0 PoC result understood** — DONE: B5d0 closed negative (#439); B5d-a infeasible; B5b becomes primary decoded path. **Acceptance**: `/home` remoteEntry count drops by 1 + decoded delta recorded + canary route smoke pass. **NOT credited with**: DS root wrapper size reduction (Codex iter-7 expectation reset — B5b targets remote bootstrap savings, not DS root). | Canary decoded -2 to -4 MB on remote bootstrap; informs B5b2 ramp |
| PR-B5b2   | PLANNED  | MFE on-demand rollout to admin remotes (`access`, `audit`, `users`, `reporting`, `schema-explorer`). Route-scoped bootstrap; remote loads only when its route is reachable. **Precondition**: rollback flag still LIVE; B5b1 canary measurement closure landed. **Acceptance**: admin smoke matrix (`/admin/users`, `/admin/access/roles`, `/admin/audit/events`, `/admin/reports/*`) all render correctly + no shell-services contract regression (notifications, audit SSE, impersonation, auth-ready Promise). | `/home` decoded **-8 to -18 MB** (post-PR target: ~25-32 MB)                            |
| PR-B5b3   | PLANNED  | federation-doctor + mf-shared-keys CI wiring + runtime smoke polish. (Rollback feature flag itself shipped earlier as B5b3-prep — see below.) **Acceptance**: CI gates run on every PR + runtime smoke nightly + flag toggle exercised via E2E. | Operational safety net for B5b rollout                                                  |
| PR-B5b3-prep | PLANNED | **Pre-canary**: ship `MFE_ON_DEMAND_BOOTSTRAP` rollback feature flag + env-driven kill switch. NO behaviour change when flag off (current eager bootstrap unchanged). **Acceptance**: flag toggleable via env; smoke confirms both modes render `/home`. Must merge BEFORE B5b1. | Safety prerequisite (no perf delta) |
| PR-B4c    | DEFERRED | i18n async-locale (re-affirmed deferred — comes after B5b)                                                                                                                                                                                                                        | Decoded -200 KB; breaking API                                                           |

### Wave B5d — Share-scope topology split (TRUNCATED 2026-05-13, Codex iter-7)

**B5d0 diagnostic PoC (#439) falsified the per-subpath federation
hypothesis.** Wave B5d-a is no longer a viable PERF-INIT-V2
decoded-reduction tactic.

| PR        | Status              | Deliverable                                                                                                                                                                                                                                       | Outcome / ROI                                                        |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| PR-B5d0   | **CLOSED / NEGATIVE** (#439) | Diagnostic PoC: explicit subpath shared entries (`/light`, `/primitives`, `/components`, `/patterns`) declared in shell + canary remote. Measured: root `@mfe/design-system` loadShare wrapper UNCHANGED at 6,512.1 KB; no genuinely independent subpath providers emerge. | **0 MB decoded reduction**. Subpath share-keys register in MF share map but providers proxy through root wrapper while root entry remains. |
| PR-B5d1   | **CANCELLED**       | Was: shell critical canary with subpath shared entries. **Cancelled** because B5d0 proved per-subpath federation infeasible under current plugin + existing root shared entry. | N/A |
| PR-B5d2   | **CANCELLED**       | Was: granular DS subpaths + remote rollout. Same architectural blocker as B5d1.                                                                                              | N/A |
| PR-B5d3   | **DEFERRED**        | Was: federation-doctor extension for duplicate root+subpath detection. Only needed if a future Wave B5d-arch topology migration proceeds.                                     | N/A |

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

| Candidate                  | Description                                                                                                                | Status                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Root shared retirement     | Remove root `@mfe/design-system` shared entry; force all consumers to subpaths. Untested. High blast-radius.               | Architecture spike — needs assessment |
| DS multi-package split     | Convert DS into `@mfe/ds-light`, `@mfe/ds-primitives`, `@mfe/ds-components`, etc. as 5+ distinct npm packages (5+ share-scopes). | Architecture initiative — separate planning |
| Build-time DS surgery      | Custom Vite plugin to manually split root barrel pre-MF.                                                                  | Reject unless no alternative        |
| Accept DS root cost        | Current PERF-INIT-V2 path: do not attempt to shrink DS root wrapper.                                                       | **LIVE — accepted**                 |

**KPI implication (Codex iter-7)**: PERF-INIT-V2 decoded reduction
now depends primarily on **Wave B5b (MFE on-demand bootstrap)**.
B5b's ROI is on remote loadShare wrappers + remoteEntry deferral,
NOT on shrinking the DS root wrapper.

### Wave B6 / M2 — Cross-repo + measurement infra (NEW, parallel)

| PR        | Status   | Deliverable                                                                                                                                                                       | Expected ROI                                                                          |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PR-B3b/c  | PLANNED  | (re-affirmed) HTTP/2 + Brotli + cache headers at `platform-k8s-gitops` nginx-ingress overlay. Parallel to B5; not a platform-web merge gate.                                      | Transfer KB **-15 to -30%** with no decoded impact; warm cache transfer drops sharply |
| PR-B3d    | PLANNED  | CSS critical extract + non-critical defer (complex, platform-web scope). Order: after B5a-B5b.                                                                                    | LCP early paint; complex setup                                                        |
| PR-M2a    | PLANNED  | Auth-storage seed generator. Playwright login → storage state JSON → committed fixture (rotated periodically). Enables authenticated route-budget matrix.                         | Unlocks `/home` + `/admin/*` regression-gate measurement                              |
| PR-M2b    | PLANNED  | Authenticated route-budget CI matrix expansion (depends on M2a). `/home`, `/admin/users`, `/admin/access`, `/admin/reports/*` with rendered-sentinel guard.                       | Hard regression gate becomes live for authenticated routes                            |
| PR-M2c    | PLANNED  | Cluster-side Lighthouse-CI. Real LCP/INP/CLS measurement against deployed testai. Operationally separate; long-tail signal.                                                       | True LCP/INP visibility                                                               |
| PR-S2     | OPEN     | Backend Spring config root-cause (in `platform-backend`; parallel track to this plan).                                                                                            | Separate analysis                                                                     |

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

| Risk                                                                                                                                       | Severity | Mitigation                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Measurement false-green from pre-existing `/admin/*` auth-FSM blank state                                                                  | medium   | Every perf run must assert a DOM sentinel (page heading, table row, etc.) before reading metrics. Blank/redirect renders fail the gate. Encoded in B5c-lite scope.                                                                                       |
| `VITE_PERF_OBSERVER_EXPOSE` contract drift (code comment says build flag exists; implementation reads only runtime `window.__PERF_OBSERVER_ENABLE`) | medium   | B5c-lite implements the build flag (production default off) OR removes the comment/stub. Either path closes the drift.                                                                                                                                  |
| MF disabled-remote STUB regression history (data-URI runtime contract crash)                                                               | medium   | B5b on-demand bootstrap must NOT revert to STUB/data-URI mode for omitted remotes. Federation-doctor + runtime smoke required in B5b3.                                                                                                                  |
| Shell-services side-effect contracts breaking under on-demand bootstrap (notifications, audit SSE, impersonation, auth ready bridge)        | high     | B5b1 canary against a single MFE only. Pre-canary contract enumeration (notifications, audit live-stream re-binders, impersonation telemetry, auth-ready Promise consumers). **B5b3-prep** ships rollback feature flag BEFORE B5b1 merges (no behaviour change when flag off); B5b3 polish closes CI wiring + nightly smoke. |
| Cache header policy + `installStaleBundleRecovery()` interaction                                                                            | medium   | PR-B3c must NOT mark `remoteEntry.js` as `immutable`; only hashed `/assets/*` chunks. §4.7 documents the acceptance test (deploy rollover E2E + at-most-one reload contract).                                                                            |
| Source/live skew (PR merge ≠ deploy ≠ measurement)                                                                                         | medium   | Every metric snapshot carries `window.__BUILD_SHA__`. PMD audit log §9 records merge SHA AND deploy SHA. Browser smoke explicitly distinguishes "post-merge" vs "post-deploy".                                                                          |
| Generated metadata / codemod risk (Design Lab JSON/import-string fields look like imports)                                                 | low      | B5a critical-graph migration must skip generated docs/catalog files (Design Lab `component-tokens.json`, `manifestEntries.ts`). Migration codemod (if added) uses explicit allowlist, not blanket regex.                                                |
| B5a + B5b parallel-merge attribution drift (both touch shell bootstrap)                                                                    | high     | Sequencing rule: B5a + B5b1+ must NOT open in parallel. PMD §3 wave-B5 enforces "B5b opens only after B5a measurement closure".                                                                                                                          |
| Sentinel false-positive cost (legitimate slow routes failing on flaky DOM)                                                                 | low      | Sentinel selector hierarchy: page heading first, table row second, content area third. Each route declares its sentinel in `performance-budgets.json` per-route entry.                                                                                  |
| Wave-B5 decoded ROI overestimation                                                                                                         | medium   | Codex iter-2 estimates 4-8 MB on `/home` for B5a "critical-graph" scope, 8-18 MB for B5b "MFE on-demand". **PR-B5a (#438) materialised 0 MB**, validating this risk. PR acceptance attaches before/after `bundle:taxonomy:testai` snapshot — not narrative estimates. |
| Root + subpath duplicate DS load during B5d migration                                                                                       | medium   | If a remote loads both `@mfe/design-system` root AND a subpath share entry concurrently, decoded JS could double. B5d3 federation-doctor extension detects duplicate root+subpath loads. B5d acceptance: `/home` taxonomy shows ONE DS wrapper, not two. |
| Provider/context identity split under B5d subpath federation                                                                                | high     | `ThemeProvider`, `ToastProvider`, hooks contexts must stay a SINGLE shared identity. If `/components` and `/patterns` independently federate `ToastProvider`, two provider instances would fragment runtime state. B5d2 explicitly maps providers to ONE shared key. |
| Broad subpath barrel risk (`/components`, `/patterns` still wide)                                                                            | medium   | B5d-a phase 1 acceptance must measure chunk size per subpath, not just "subpath shared key added". If `/components` chunk still pulls full barrel, B5d-a phase 2 must further granularise (e.g. `/components/toast`, `/components/empty-error-loading`). |
| Remaining root imports after B5a-shipped (known gap)                                                                                         | low      | 23+ shell files still import `@mfe/design-system` root barrel (DesignLabHeaderMenu, NotificationCenter, LoginPopover, ShellHeaderNavbar, header/*, AuthBootstrapper, etc.). B5a2 + B5d phase 2 cover them. Audit-only until then. |
| MF cycle regression under B5d split                                                                                                          | medium   | DS subpath split could trigger runtime-order cycles around `@mfe/auth` or shell-services-wiring (history: PR-X8 mfPreloadHelperIsolation). B5d1 canary smoke MUST cover login → home → admin route + console for `loadShare` cycle errors. |
| False ROI from `dist` size alone                                                                                                             | medium   | `apps/mfe-shell/dist 25 MB` total is not the right metric. B5d acceptance MUST use route-level taxonomy (`bundle:taxonomy:testai` per-route decoded KB), not aggregate dist size. PR-B5a (#438) demonstrated this — total `dist` unchanged is necessary but not sufficient signal. |
| MF subpath share false-positive (Codex iter-7)                                                                                                | medium   | Explicit subpath shared keys may register in MF share maps while still proxying through the root wrapper. Acceptance must inspect the actual dependency graph (which chunk imports what), not just "share-key present in config" or "subpath chunk exists in dist". PR-B5d0 (#439) demonstrated this — 4 subpath share-keys registered but root wrapper unchanged. |
| Diagnostic config drift (Codex iter-7)                                                                                                        | medium   | No-ROI shared-block experiments must not merge into production config. Subpath share-map entries add runtime surface (extra share identities + proxy chunks) without benefit. PR-B5d0 (#439) reverted its config changes per this rule; merged docs only. |
| DS root-shared retirement blast radius (Wave B5d-arch backlog)                                                                                | high     | Removing the root `@mfe/design-system` shared entry requires ALL shell/remotes/generated docs/catalog consumers to stop relying on root import contract. Not a PERF-INIT-V2 wave; tracked as Wave B5d-arch architecture initiative for future planning. |
| B5b ROI isolation (Codex iter-7 expectation reset)                                                                                            | low      | B5b targets ONLY remote eager bootstrap savings (remoteEntry + remote loadShare wrappers). It MUST NOT be credited with DS root-wrapper reductions — that path is closed under current topology. Acceptance metrics must split: remote count on `/home`, remoteEntry transfer, remote loadShare chunk decoded; NOT DS root wrapper size. |

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

### Wave B5 / B6 (opening)

PRs not yet opened. This audit-log section will be populated as PRs
are merged.

| PR              | Codex thread | Verdict       | Merged at (UTC)         |
| --------------- | ------------ | ------------- | ----------------------- |
| (this PR) PMD v2 | 019e20fa     | iter-2 ack    | (in-review)             |
| PR-B5c-lite     | —            | —             | —                       |
| PR-B5a          | —            | —             | —                       |
| PR-B5b0         | —            | —             | —                       |
| PR-B5b3-prep    | —            | —             | — (precondition for B5b1) |
| PR-B5b1         | —            | —             | —                       |
| PR-B5b2         | —            | —             | —                       |
| PR-B5b3         | —            | —             | —                       |
| PR-B3b/c        | —            | —             | (cross-repo)            |
| PR-B3d          | —            | —             | —                       |
| PR-M2a          | —            | —             | —                       |
| PR-M2b          | —            | —             | —                       |
| PR-M2c          | —            | —             | —                       |
| PR-B4c          | —            | —             | (deferred, post-B5b)    |

## §10. References

- `docs/performance/bundle-taxonomy.md` — PR-A0 runbook
- `docs/performance/mf-shared-scope-audit.md` — PR-B2 canonical-provider doc
- `performance-budgets.json` — route × mode × metric matrix (PR-M1)
- `tests/perf/baseline.json` — committed baseline (PR-G1 ratchet)
- `~/.claude/projects/<slug>/memory/` — session-specific feedback rules

## §11. Roadmap revision history

| Date       | Revision | Trigger                                                                                                                                                                                                                                | Codex thread |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-05-13 | v1       | PMD initial landing (#435). 11 platform-web PRs + 1 cross-repo PR-S1 merged in autonomous Wave A + B run.                                                                                                                              | 019e20ab     |
| 2026-05-13 | v2       | **Wave A/B closure measurement reveals decoded gap.** Transfer -47% but decoded -3%. KPI restructured into hard regression / improvement milestone / leader target tiers. Wave B5 (decoded / topology) + B6/M2 (cross-repo + measurement infra) opened. | 019e20fa     |
| 2026-05-13 | v3       | **PR-B5a (#438) measurement invalidates iter-2 ROI assumption.** Consumer-side subpath migration yields 0 MB decoded delta because MF federates `@mfe/design-system` as a single root shared package entry — tree-shake cannot cross MF share-scope. **Wave B5d (share-scope topology split) opened** with B5d0 diagnostic PoC → B5d1 shell critical canary → B5d2 granular subpaths + remote rollout → B5d3 federation-doctor extension. **B5b1+ sequencing updated**: must wait for B5d0 result before opening (decoded attribution overlap). 6 new risks added (root+subpath duplicate, provider identity, broad subpath barrel, remaining root imports as known-gap, MF cycle regression, false ROI from dist size). B5d-b (`import:false`) + B5d-c (de-federate) explicitly rejected with rationale.                  | 019e20fa (iter-5) |
| 2026-05-13 | v4       | **PR-B5d0 (#439) diagnostic PoC falsifies B5d-a hypothesis.** Subpath shared entries register in MF share map but generated providers proxy through root DS loadShare wrapper while root entry remains; net effect is 0 MB decoded reduction (root wrapper unchanged at 6,512.1 KB shell / 5,959.3 KB canary remote). **Wave B5d truncated**: B5d0 CLOSED/NEGATIVE, B5d1+B5d2 CANCELLED, B5d3 DEFERRED. **Wave B5d-arch (backlog only, out of PERF-INIT-V2 scope) added**: root shared retirement, DS multi-package split, build-time DS surgery candidates. **B5b1 sequencing UNBLOCKED** (B5d0 result known, negative). **B5b becomes primary decoded-reduction path** with expectation reset (B5b targets remote bootstrap savings, NOT DS root wrapper). 4 new risks added (MF subpath share false-positive, diagnostic config drift, DS root retirement blast radius, B5b ROI isolation).                                       | 019e20fa (iter-7) |
