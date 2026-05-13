# PR-B5b0 Initiator Attribution Trace — Findings

> **Diagnostic captured 2026-05-13 against testai live (`BUILD_SHA=08fb4b47`).**
> Artifact: `08fb4b4.json`. Route: `/login` (anonymous, pre-auth — chosen
> because remoteEntry.js fetches fire BEFORE the SSO redirect and we
> wanted the pre-rendered MF bootstrap path without auth-storage
> dependency).

## Key Finding (informs PR-B5b1 canary choice)

**ALL 7 `/remotes/*/remoteEntry.js` fetches are initiated from the
shell's main app bundle** (`/assets/dist-CMSO7Him.js`), not from:

- `shell-services-wiring.ts` (PR-B3a deferred via idle-scheduler) ❌
- `<link rel="modulepreload">` HTML preload helper ❌
- `createLazyRemoteModule` lazy route loaders ❌
- `hostInit-*.js` / `mf-entry-bootstrap-*.js` (these load the bundle but don't issue remoteEntry.js fetches themselves) ❌

The initiator is the `@module-federation/vite` plugin's generated
runtime code inside the shell's main app bundle. The plugin reads the
`federation({ remotes: { ... } })` block in `apps/mfe-shell/vite.config.ts`
and emits a runtime call that **eagerly registers all declared remotes
at host bootstrap**, which triggers an HTTP fetch for each
`remoteEntry.js`.

## Summary

```json
{
  "remoteEntryCount": 7,
  "loadShareCount": 32,
  "byInitiatorType": {
    "script": 7
  },
  "byInitiatorSource": {
    "mf-runtime-shell-bundle": 7
  }
}
```

7 remoteEntries fetched on `/login` cold load:

| Remote | Initiator script | Stack (top frame) |
|---|---|---|
| suggestions | `dist-CMSO7Him.js` | line 3 col 13645 |
| ethic | `dist-CMSO7Him.js` | line 3 col 13645 |
| users | `dist-CMSO7Him.js` | line 3 col 13645 |
| access | `dist-CMSO7Him.js` | line 3 col 13645 |
| audit | `dist-CMSO7Him.js` | line 3 col 13645 |
| reporting | `dist-CMSO7Im.js` | line 3 col 13645 |
| schema-explorer | `dist-CMSO7Him.js` | line 3 col 13645 |

All 7 stack frames identical → single emission site in the bundle =
@module-federation/vite registration loop.

Plus 32 loadShare chunks fired from related shell-bundle frames.

## Implication for PR-B5b1 Canary Strategy

The currently planned PR-B5b1 "single-MFE on-demand bootstrap" cannot
work by deferring `shell-services-wiring` alone, because the primary
remoteEntry.js fetch happens **before** shell-services-wiring runs.

Three approaches considered (Codex iter-7 consensus expected):

### Option A — Dynamic federation config (recommended)

`federation()` plugin call in `vite.config.ts` accepts a `remotes`
object. Make it conditionally exclude opt-in remotes at build-time
via the `MFE_ON_DEMAND_BOOTSTRAP` flag (B5b3-prep). Consumer code
then registers the remote via the MF runtime API
(`@module-federation/runtime` `registerRemotes`) only when the route
that needs it becomes reachable.

**Effort**: medium. Requires:
- Conditional `remotes` block in `vite.config.ts` (build flag)
- Runtime registration shim that uses `MFE_ON_DEMAND_BOOTSTRAP` to
  choose static vs dynamic registration
- Routing-aware registration trigger (e.g. inside the route loader
  or `<Suspense>` boundary)

**Risk**: medium. Touches shell bootstrap + MF runtime; need full
rollback flag coverage. Canary candidate: `mfe_suggestions` (smallest
blast radius, 0 direct `@tanstack/react-query` imports, the cleanest
profile per PR-B2-rollout audit).

### Option B — `import: false` on host side (NO — Codex iter-7 rejected)

Already documented as wrong semantic for shell-as-consumer. Skip.

### Option C — De-federate (Wave B5d-arch backlog)

Build-time bundle each MFE inline. Architecturally invalidates
PR-B2 canonical-provider work. Reserved for B5d-arch initiative.

## Recommended Canary Selection for PR-B5b1

**`mfe_suggestions`** — lowest blast radius:
- 0 direct `@tanstack/react-query` imports (PR-B2-rollout audit)
- Single exposed module (`./SuggestionsApp`)
- No shell-services contract dependencies (per `shell-services-wiring.ts`
  the 4 wired services are access/audit/users/reporting; suggestions
  is NOT in that list)
- Smallest production loadShare chunk (5.96 MB raw on canary build
  vs. ~6.5 MB on shell)

If `mfe_suggestions` canary succeeds (measurable `/home` decoded
delta + no smoke regression), roll out to `mfe_ethic` (also not
in shell-services list) as B5b1.5, then admin remotes (`mfe_users`,
`mfe_access`, `mfe_audit`, `mfe_reporting`) in B5b2.

## Reproduction

```bash
pnpm install
node scripts/diagnostics/remote-entry-initiator-trace.mjs \
  --target testai --route /login

# Output: tests/perf/initiator-trace/<BUILD_SHA>.json
# Inspect: jq '.summary' tests/perf/initiator-trace/<BUILD_SHA>.json
```

For an authenticated route trace (e.g. `/home`), pass `--auth-storage
<path-to-playwright-storage-state.json>` (requires PR-M2a).

## References

- `scripts/diagnostics/remote-entry-initiator-trace.mjs` — diagnostic
- PMD v4 §3 Wave B5b — `docs/performance/PERF-INIT-V2-plan.md`
- Codex thread `019e20fa` iter-5/iter-7 (path forward after B5d
  truncation)
- PR-B3a #429 — shell-services idle defer (secondary fetch path,
  already merged)
- PR-B5b3-prep #444 — rollback feature flag
