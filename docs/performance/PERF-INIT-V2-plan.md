# PERF-INIT-V2 — Project Management Document

> **Status:** active execution. This document describes the planned, in-progress,
> and merged work for the PERF-INIT-V2 performance initiative on the
> `platform-web` MFE host. It pairs with `docs/performance/bundle-taxonomy.md`
> (PR-A0) and `docs/performance/mf-shared-scope-audit.md` (PR-B2) for
> implementation detail.
>
> **Last update:** 2026-05-13. Autonomous run merged 11 platform-web PRs
> (M1, A0, G1, B1a, B1b, B2-prep, B3a, B2-rollout, B3e, B4a, B4b) at HEAD
> of `origin/main` plus PR-S1 in `platform-k8s-gitops` (cross-repo,
> tracked separately). PR-#435 (this doc) is the in-review PMD landing.

## §1. Goal

Reduce cold-cache initial JS download + critical-path execution time across
the public `/login`, `/home`, and authenticated `/admin/*` routes to "sector
excellent" — LCP < 1.5 s, INP < 100 ms, TBT < 50 ms (advisory) on the
testai cluster against the production-mode build.

Baseline (pre-V2): decoded JS ~50 MB across the eager chunk graph; the
same size on every route — strong duplicate-package signal.

## §2. KPI matrix

| Route                               | LCP target | INP target | TBT target (advisory) | Notes                                   |
| ----------------------------------- | ---------- | ---------- | --------------------- | --------------------------------------- |
| `/login`                            | 1.0 s      | 80 ms      | 30 ms                 | Public, smallest payload — leader route |
| `/home`                             | 1.2 s      | 100 ms     | 50 ms                 | Authenticated landing                   |
| `/admin/users`                      | 1.5 s      | 100 ms     | 50 ms                 | First admin route                       |
| `/admin/access/roles`               | 1.5 s      | 100 ms     | 50 ms                 | Permission graph                        |
| `/admin/reports/fin-muhasebe-detay` | 1.5 s      | 120 ms     | 70 ms                 | Largest data grid                       |

## §3. Phased plan

### Wave A — Measurement (instrumentation first, then optimise)

| PR    | Status | Owner                       | Deliverable                                                         |
| ----- | ------ | --------------------------- | ------------------------------------------------------------------- |
| PR-S1 | MERGED | cluster_secret_drift        | PG/Vault/Keycloak credential rotation + drift detector skeleton     |
| PR-M1 | MERGED | PerformanceObserver harness | Extended observers (INP, FCP, longtask, mark, resource) + RUM sinks |
| PR-A0 | MERGED | Bundle attribution          | Per-route taxonomy + duplicate-package detector + Playwright traces |
| PR-G1 | MERGED | Gate bootstrap              | CI workflow: route-budget + size-limit + lighthouse-ci advisory     |

### Wave B1 — High-impact splits

| PR     | Status | Deliverable                                                                                   |
| ------ | ------ | --------------------------------------------------------------------------------------------- |
| PR-B1a | MERGED | AG Grid Enterprise lazy split (~6 MB out of `/login` + `/home`)                               |
| PR-B1b | MERGED | `@mfe/design-system/light` slim subpath (primitives + tokens + theme + providers + `cn` only) |

### Wave B2 — Module Federation shared scope

| PR            | Status | Deliverable                                                                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| PR-B2         | MERGED | `federation-doctor` regex fix (was: 30 false-positive drifts) + `mf-shared-keys` diagnostic + canonical-provider pattern doc |
| PR-B2-rollout | MERGED | `@tanstack/react-query` `singleton()` → `hostOnly()` across 6 remotes (canonical provider in production)                     |

### Wave B3 — Idle deferral + delivery

| PR     | Status                                              | Deliverable                                                                                   |
| ------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| PR-B3a | MERGED                                              | Shell-services remote-import idle deferral (4 MFE-services off critical path)                 |
| PR-B3b | PLANNED (cross-repo, NOT a platform-web merge gate) | HTTP/2 + Brotli at the ingress — tracked in `platform-k8s-gitops` nginx-ingress overlay       |
| PR-B3c | PLANNED (cross-repo, NOT a platform-web merge gate) | Long-cache headers for hashed assets, short-cache for HTML — tracked in `platform-k8s-gitops` |
| PR-B3d | PLANNED (complex, platform-web scope)               | CSS critical extract + non-critical defer (consider `critters` or `vite-plugin-critical`)     |
| PR-B3e | MERGED                                              | `initOtel` + `initFeatureFlags` idle defer (~6 ms TBT win + cleaner critical path)            |

### Wave B4 — Leader-conditional splits

| PR     | Status   | Deliverable                                                                                     |
| ------ | -------- | ----------------------------------------------------------------------------------------------- |
| PR-B4a | MERGED   | Auth-flow pages lazy (`Login` / `Register` / `Unauthorized` — ~17 kB out of eager)              |
| PR-B4b | MERGED   | Admin pages lazy (`ThemeAdmin` / `DesignLab` / `DesignLabRoutes` — ~1.4 MB out of eager)        |
| PR-B4c | DEFERRED | i18n async-locale (requires breaking the synchronous `getDictionary()` API — separate refactor) |
| PR-B4d | N/A      | Fonts — system font stack only; no `@font-face` in current build                                |

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
- Long-cache headers for `*.js`, `*.css`, `*.woff2`, `*.png`, `*.svg`
  (the hashed-name assets from Vite output)
- Short-cache (or no-cache) for the entry `index.html`

These are operator-side changes; the platform-web side just needs
each chunk to have a content-hash filename (already true in Vite).

### §4.5 PR-M1 RUM instrumentation

Captures: LCP, FCP, INP, longtask, layout-shift, custom marks,
resource summary. Routes through `defaultSinks` (Sentry + OTel +
dev console + snapshot). Exposed to Playwright via
`window.__perfSnapshot()` for route-budget assertions in CI.

Budget table is in `performance-budgets.json` (root); enforcement in
`scripts/ci/route-performance-budget.mjs`.

## §5. Risk register

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

## §6. Testing strategy

- **Unit**: each new utility (idle-scheduler, mf-shared-keys) gets
  vitest coverage on jsdom.
- **Smoke (per PR)**: `pnpm --filter mfe-shell build` + cross-AI
  Codex review.
- **CI gates (PR-G1 + workspace defaults)**:
  - `route budget + bundle taxonomy` (hard)
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
- **Manual smoke (post-merge testai)**: documented per PR; covers
  /login → /home → relevant admin route + DevTools network +
  console hygiene.

## §7. Governance

- **Cross-AI peer review (HARD RULE)**: code-author ≠ reviewer.
  Each PR receives a Codex peer review pass via
  `mcp__codex__codex` / `codex-reply` before merge.
- **No admin merge**: CI must be green; advisory fails are tolerated;
  required gate fails block.
- **Forensic cleanup**: `~/.claude/scripts/ai-post-merge-cleanup.sh`
  emits archive tags (`archive/2026/05/<branch>-pr<N>`) for every
  merged PR — cross-machine 1+ year recovery via
  `git fetch --tags origin && git checkout -b recovery/x archive/...`.

## §8. Tooling

- `scripts/ops/federation-doctor.mjs` — lightweight share-scope diagnostic (workspace script `pnpm mf:doctor`; not yet CI-wired)
- `scripts/diagnostics/mf-shared-keys.mjs` — detailed audit
- `scripts/ci/route-performance-budget.mjs` — Playwright route runner
- `scripts/ci/bundle-taxonomy.mjs` — per-route resource breakdown
- `scripts/ci/duplicate-package-detector.mjs` — cross-MFE dedupe report
- `scripts/vite-plugins/bundle-visualizer.ts` — rollup-plugin-visualizer wrapper
- `apps/mfe-shell/src/lib/idle-scheduler.ts` — runtime helper

## §9. Audit log

Scope: platform-web repository merges only. Cross-repo work (PR-S1
in `platform-k8s-gitops`) tracked in that repo's own audit trail.

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
| #435 PMD doc       | 019e20ab     | PARTIAL ready_for_merge (iter-2) | (this PR, in-review) |

Total: 11 platform-web PRs merged + 1 PMD doc in-review (this PR).
PR-S1 cross-repo merge tracked separately in `platform-k8s-gitops`.

## §10. References

- `docs/performance/bundle-taxonomy.md` — PR-A0 runbook
- `docs/performance/mf-shared-scope-audit.md` — PR-B2 canonical-provider doc
- `performance-budgets.json` — route × mode × metric matrix (PR-M1)
- `~/.claude/projects/<slug>/memory/` — session-specific feedback rules
