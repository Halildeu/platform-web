# MF Shared-Scope Audit (PR-B2)

> **Status:** PR-B2-prep (audit + diagnostic + doc) merged 2026-05-13.
> Follow-up canary (`@tanstack/react-query` hostOnly conversion) tracked
> separately as PR-B2-rollout.
>
> **Owners:** PERF-INIT-V2 working group (Claude + Codex peer review).
> **Related:** `docs/performance/PERF-INIT-V2-plan.md` (§B2).

## TL;DR

The platform follows the **canonical provider** pattern for Module
Federation shared dependencies:

- **Shell (`mfe_shell`)** is the singleton provider — every core
  React/router/redux/query dependency is declared with
  `singleton: true` + `eager: true`. The host bundle initialises the
  share-scope before any remote `remoteEntry.js` loads.
- **Remotes** declare the same dependency with `singleton: true` +
  `import: false` + a stub version (`hostOnly()` helper). They do
  **not** ship their own copy — at runtime the shared instance comes
  from the host.

Earlier, `federation-doctor` reported 30 spurious "missing shared
singleton" drifts because its regex required both _quoted_ keys and
the literal `singleton(` factory call — neither was true for the
canonical provider pattern. PR-B2 fixed the regex (now recognises
unquoted keys AND `hostOnly()` calls) and added a richer diagnostic.

## Why canonical provider (vs. mutual singleton on both sides)?

| Concern                     | Mutual `singleton()` on both sides               | `eager` host + `hostOnly()` remote             |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| First-paint race            | Host & remote both initialise share-scope → race | Host pre-initialises before any remote loads ✓ |
| Remote bundle size          | Each remote ships its own copy                   | Remote chunk omits the dep (`import: false`) ✓ |
| Runtime instance count      | MF dedups at load — one instance wins            | Same: one instance, sourced from host          |
| Version drift detection     | `strictVersion: true` catches it at load         | Same                                           |
| Cold-cache initial download | Larger remote chunks                             | Smaller remote chunks ✓                        |
| Failure mode                | Soft (MF resolves to host instance)              | Hard (remote fails if host missing dep)        |

**Conclusion:** for our topology (mfe-shell is the only host; every
remote is consumed exclusively through it), canonical provider is the
right pattern. Bundle savings compound across 6 remotes.

## Current state (post-PR-B2-prep)

Run `node scripts/diagnostics/mf-shared-keys.mjs` to refresh the table.
As of 2026-05-13 the audit emits:

```text
Shell: mfe_shell
Singletons declared: 7
  - react                       singleton  eager
  - react-dom                   singleton  eager
  - react-router                singleton  eager
  - react-router-dom            singleton  eager
  - @reduxjs/toolkit            singleton  eager
  - react-redux                 singleton  eager
  - @tanstack/react-query       singleton  eager

Remotes: 6 (suggestions, ethic, users, access, audit, reporting)
  All 6 core React/Redux/router singletons → hostOnly()                  OK
  @tanstack/react-query                     → singleton()                ⚠ remote-bundles-canonical
```

federation-doctor (lightweight CI gate):

```text
"shared-deps-consistency": "pass — All remotes share 7 core singletons with shell"
```

## Known remaining drift — PR-B2-rollout backlog

| Dependency              | Shell side                     | Remote side                            | Issue                                                                                        | Owner         |
| ----------------------- | ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| `@tanstack/react-query` | `singleton: true, eager: true` | `singleton: true` (no `import: false`) | Remote bundles its own copy even though host is canonical → wasted KB on every remote chunk. | PR-B2-rollout |

**Fix plan:** convert each remote's `@tanstack/react-query` entry from
`singleton('@tanstack/react-query')` to `hostOnly('@tanstack/react-query')`,
verify `pnpm build` works for at least one remote (canary:
`mfe_suggestions` — lowest blast radius), then propagate to the rest.

Why not in PR-B2-prep: any change that touches a remote's runtime
share-scope must be paired with a build + smoke verification. We keep
behaviour-changing edits out of the regex/diagnostic PR so reviewers
can sign off on each concern in isolation.

## Diagnostic tools

### `scripts/ops/federation-doctor.mjs`

Lightweight CI check covering six concerns:

1. circular remote dependencies
2. import/expose alignment
3. **shared-deps parity** (PR-B2 regex fix)
4. port collisions
5. shell enable/disable env flag coverage
6. `remoteEntry.js` HTTP reachability (best-effort)

Outputs human or `--json` mode. Exit 1 on `fail`, exit 0 on `pass` or
`warn`. Wired into the CI gate.

### `scripts/diagnostics/mf-shared-keys.mjs` (NEW in PR-B2)

Detailed (mfe × dep) audit table. Surfaces:

- **missing-in-remote** — remote does not declare the dep at all.
- **remote-bundles-canonical** — remote uses `singleton()` while shell
  is canonical with `eager: true`. Bundle-size waste.
- **both-sides-import-no-eager** — both bundle the dep AND host does
  not pre-initialise → race risk.
- **shell-not-eager** — host singleton missing `eager: true`.
- **version-mismatch** — `package.json` version differs between shell
  and remote (share-scope strictVersion will reject the mismatch).

`--json` mode is suitable for CI artifact upload. `--strict` exits 1
if any issue is found.

## Operator runbook — adding a new shared dependency

1. Add the entry to **shell** `sharedCore`:
   ```ts
   newDep: singleton('newDep', 'newDep', false, true),  // eager:true
   ```
2. Add the package to `apps/mfe-shell/package.json` `dependencies` so
   the version key resolves.
3. Add the entry to every remote `sharedCore`:
   ```ts
   newDep: hostOnly('newDep'),
   ```
4. Run `node scripts/ops/federation-doctor.mjs --json` — expect
   `shared-deps-consistency: pass`.
5. Run `node scripts/diagnostics/mf-shared-keys.mjs --strict` — expect
   exit 0.
6. Build at least one remote (`pnpm --filter mfe-suggestions build`)
   and verify the dep does **not** appear in the remote chunk graph.

## Adversarial review notes

Codex peer review (cross-AI requirement, code-author ≠ reviewer)
covered:

- regex correctness for edge cases (unquoted identifier vs. quoted
  scope: `'@scope/pkg'`)
- false-negative avoidance (`hostOnly()` is a wrapper around
  `singleton()` — semantically equivalent for share-scope; regex must
  match both)
- diagnostic exit-code contract (CI usage)
- documentation completeness vs. the broader PERF-INIT-V2 plan

PR-B2-rollout will request a fresh review focused on the runtime
behaviour change (`@tanstack/react-query` hostOnly conversion).
