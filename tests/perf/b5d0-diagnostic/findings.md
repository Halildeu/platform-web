# PR-B5d0 Diagnostic — Share-Scope Topology PoC Findings

> **Critical negative result (Codex iter-7 corrected wording)**:
> explicit subpath shared entries (`@mfe/design-system/light`,
> `/primitives`, `/components`, `/patterns`) declared in `shared:`
> block of host + canary remote produce **0 MB** decoded reduction.
> The root `@mfe/design-system` loadShare wrapper (6,512.1 KB on
> shell, 5,959.3 KB on `mfe-suggestions`) remains UNCHANGED.
>
> Subpath shared keys are NOT silently ignored — they DO register
> in the MF share map and DO emit small subpath chunks. **However**,
> those subpath chunks proxy / re-export through the root
> `@mfe/design-system` loadShare wrapper while the root entry remains
> present. Net effect: ROI = 0 because the root wrapper is still
> present and still aggregates all DS bytes.

## Experiment Setup

- Added explicit subpath shared entries to:
  - `apps/mfe-shell/vite.config.ts` (host)
  - `apps/mfe-suggestions/vite.config.ts` (canary remote)
- Subpath keys declared: `@mfe/design-system/light`,
  `/primitives`, `/components`, `/patterns`
- Tested **without** AND **with** B5a consumer-side deep imports applied
- Build comparison: rolldown chunk graph before vs after

## Build Evidence (3 measurements, all consistent)

### Shell `/apps/mfe-shell/dist/assets/` — design-system loadShare chunks

| Measurement                                               | Root DS wrapper            | Separately emitted subpath wrappers |
| --------------------------------------------------------- | -------------------------- | ----------------------------------- |
| **Baseline** (no B5d0 config, no B5a consumer)            | **6,512.1 KB**             | 0                                   |
| **B5d0 only** (subpath shared declared, no consumer)      | **6,512.1 KB** (UNCHANGED) | 0                                   |
| **B5d0 + B5a** (subpath declared + consumer deep imports) | **6,512.1 KB** (UNCHANGED) | 0                                   |

### Canary `/apps/mfe-suggestions/dist/assets/`

| Chunk                                                                                            | Size           |
| ------------------------------------------------------------------------------------------------ | -------------- |
| `__mfe_internal__mfe_suggestions__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs` | **5,959.3 KB** |
| Separately emitted subpath wrappers                                                              | 0              |

## Architectural Conclusion (Codex iter-7 corrected)

`@module-federation/vite` plugin registers subpath shared keys in the
runtime share map. **However**, the generated subpath providers proxy
or re-export through the root `@mfe/design-system` loadShare wrapper
while the root shared entry itself remains in place. Result: subpath
share identities exist at the map level but **cannot break free of
the root provider** while the root entry coexists.

This means **B5d-a (per-subpath federation as an incremental
decoded-reduction tactic) is not viable** under the current plugin +
existing root shared entry.

The only way to genuinely separate decoded boundaries appears to be:

- **Root shared retirement** (remove the root `@mfe/design-system`
  shared entry entirely; force all consumers to subpaths) — high
  blast-radius architecture change. This PoC did NOT test that path.
- **DS multi-package split** (`@mfe/ds-light`, `@mfe/ds-primitives`,
  etc. as 5+ distinct npm packages, each becoming its own
  share-scope identity) — high effort, breaking for all DS consumers

Both move out of PERF-INIT-V2 scope into a separate architecture
initiative (Wave B5d-arch backlog).

## Implications for PMD v3 Wave B5d

- **B5d0** CLOSED / NEGATIVE — this PR's evidence
- **B5d1** CANCELLED — no independent subpath providers possible
  under the current root shared topology
- **B5d2** CANCELLED — replaced by B5d-arch backlog candidate
- **B5d3** DEFERRED — federation-doctor extension only needed if
  topology migration proceeds

## Path Forward (Codex iter-7 consensus)

Decoded-reduction primary path shifts to **Wave B5b (MFE on-demand
bootstrap)**. B5b's ROI is in **remote loadShare wrappers + remoteEntry**
deferral, NOT in shrinking the DS root wrapper. Expectation reset for
B5b acceptance:

- Acceptance metrics: remote count on `/home`, remoteEntry transfer,
  shell-services contract regression smoke
- NOT credited with: DS root wrapper size reduction

| PR            | Status         | Mechanism                                                                                                                           |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **B5b3-prep** | SHIPPED (#444) | `MFE_ON_DEMAND_BOOTSTRAP` BUILD-TIME flag reader (consumed at build by B5b1; no runtime rollback after deploy), NO behaviour change |
| **B5b0**      | PARALLEL       | RemoteEntry initiator-attribution diagnostic                                                                                        |
| **B5b1**      | THEN           | Single MFE on-demand canary                                                                                                         |
| **B5b2**      | THEN           | Admin remotes rollout                                                                                                               |
| **B5b3**      | THEN           | federation-doctor + nightly smoke                                                                                                   |
| **B3b/c**     | PARALLEL       | cross-repo brotli + cache (transfer ROI, no decoded change)                                                                         |

## Wave B5d-arch (NEW — out of PERF-INIT-V2 scope, backlog only)

| Candidate              | Description                                                                         | Status                                             |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Root shared retirement | Remove root `@mfe/design-system` shared entry; force all consumers to subpaths      | Architecture spike — needs blast-radius assessment |
| DS multi-package split | Split DS into `@mfe/ds-light` + `@mfe/ds-primitives` + ... as separate npm packages | Architecture initiative — separate planning round  |
| Build-time DS surgery  | Custom Vite plugin to manually split root barrel pre-MF                             | Reject unless no alternative                       |
| Accept DS root cost    | Current PERF-INIT-V2 path                                                           | LIVE — accepted                                    |

## PR #439 Disposition (Codex iter-7)

**Diagnostic config changes MUST NOT merge into production config.**
Subpath share-map entries add runtime surface without ROI. PR scope
reduced to documentation only:

- DROP: `apps/mfe-shell/vite.config.ts` + `apps/mfe-suggestions/vite.config.ts`
  subpath shared entries (reverted in this PR)
- KEEP: `tests/perf/b5d0-diagnostic/findings.md` (this doc with
  corrected wording)
- ADD: PMD v3 → v4 inline update (B5d truncation + B5b primary path)

## Reproduction

```bash
# To reproduce the experiment, apply subpath shared entries:
#   apps/mfe-shell/vite.config.ts — under sharedProdOnly add:
#     '@mfe/design-system/light': { singleton: true, requiredVersion: false },
#     '@mfe/design-system/primitives': { singleton: true, requiredVersion: false },
#     '@mfe/design-system/components': { singleton: true, requiredVersion: false },
#     '@mfe/design-system/patterns': { singleton: true, requiredVersion: false },
#   apps/mfe-suggestions/vite.config.ts — under sharedProdOnly add same.
#
# Then build:
pnpm --filter mfe-shell build
pnpm --filter mfe-suggestions build

# Compare root DS wrapper chunk size and presence of subpath wrappers:
ls -la apps/mfe-shell/dist/assets/ | grep -iE "design.*system|loadShare.*system"
ls -la apps/mfe-suggestions/dist/assets/ | grep -iE "design.*system|loadShare.*system"

# Expected: root wrapper UNCHANGED in size. No genuinely independent
# subpath wrappers emerge. Diagnostic complete.
```

## References

- PMD v3 §3 Wave B5d (parent plan): `docs/performance/PERF-INIT-V2-plan.md`
- Codex thread `019e20fa`:
  - iter-5 — B5d-a per-subpath federation proposal
  - **iter-7 — B5d-a infeasibility finding + wording correction + PMD v4 outline**
- PR-B5a (#438): consumer-side subpath migration (also produced 0 MB decoded delta)
- `@module-federation/vite` plugin: current behaviour observed in
  rolldown build output (subpath shared keys register in share-map
  but providers depend on root entry)
