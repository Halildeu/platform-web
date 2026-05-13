# PR-B5d0 Diagnostic — Share-Scope Topology PoC Findings

> **Critical negative result**: subpath shared entries (`@mfe/design-system/light`, `/primitives`, `/components`, `/patterns`) added to `shared:` block of both `apps/mfe-shell/vite.config.ts` AND `apps/mfe-suggestions/vite.config.ts` (canary remote) DO NOT cause the `@module-federation/vite` plugin to emit per-subpath `loadShare` wrappers.
>
> Measurement repeated with and without B5a consumer-side subpath imports applied. Same result both times.

## Build Evidence

### Shell `/apps/mfe-shell/dist/assets/` — design-system loadShare chunks

**Baseline (no B5d0, no B5a)**:

| Chunk | Size |
|---|---|
| `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs` | **6,512.1 KB** |
| `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.js` | 0.2 KB |
| Per-subpath wrappers | **(none)** |

**After B5d0 (subpath shared entries declared) + B5a (consumer deep imports)**:

| Chunk | Size |
|---|---|
| `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs` | **6,512.1 KB** (UNCHANGED) |
| `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.js` | 0.2 KB |
| Per-subpath wrappers (e.g. `loadShare__@mfe/design-system/components`) | **(none)** |

### Canary `/apps/mfe-suggestions/dist/assets/` — design-system loadShare chunks

| Chunk | Size |
|---|---|
| `__mfe_internal__mfe_suggestions__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs` | **5,959.3 KB** |
| Per-subpath wrappers | **(none)** |

## Architectural Conclusion

The `@module-federation/vite` plugin (current version) treats package subpath imports (`@mfe/design-system/light`, `/primitives`, etc.) as part of the **parent package's** share-scope identity. Declaring subpath keys in `shared:` block has NO effect:

1. The plugin resolves `share-scope identity` by package name lookup
2. Subpath imports `@mfe/design-system/X` map to the root `@mfe/design-system` shared identity
3. The runtime wrapper `loadShare__@mfe/design-system__loadShare__.mjs` aggregates ALL exports from ALL subpaths into one chunk
4. Tree-shake of unused subpaths CANNOT happen across this aggregate boundary

This means **B5d-a (per-subpath federation)** as planned in PMD v3 §3 Wave B5d is **architecturally infeasible** under the current MF plugin.

## Implications

Decoded JS reduction via federation-tweak is OFF THE TABLE. The remaining paths are:

| Approach | Mechanism | Estimated ROI | Status |
|---|---|---|---|
| **B5b MFE on-demand bootstrap** | Defer entire remote loadShare wrappers via runtime gating | 8-18 MB decoded (entire remotes drop) | OPEN — proceed |
| **Convert DS into separate npm packages** | `@mfe/ds-light`, `@mfe/ds-primitives` as 5+ distinct npm packages → 5+ distinct share-scopes | 4-8 MB possible | HIGH effort, breaking |
| **Build-time DS surgery** | Vite plugin to manually split the root barrel into multiple chunks before MF sees it | Unknown | Fragile, MF plugin compatibility risk |
| **B3b/c cross-repo brotli + cache** | Network-layer compression + warm cache | Transfer -15 to -30% | OPEN — parallel |
| **B3d CSS critical** | LCP early paint | LCP improvement, no decoded change | DEFERRED |
| **Accept current architecture** | Focus on perceived perf, idle defers, lazy routes | Marginal decoded gains via B4* | LIVE |

## Recommended Next Step

Codex iter-5 sequence updated:
1. **B5d-a ELIMINATED** (this PR's evidence)
2. **B5b1+ now becomes the primary decoded-reduction path** (8-18 MB potential)
3. **B3b/c cross-repo** parallel for transfer
4. **DS multi-package split** considered as architecture wave only after B5b results measured
5. Codex iter-7 needed to: (a) confirm finding, (b) update PMD v3 → v4, (c) re-prioritise B5b sequencing now that B5d-a is removed

## Reproduction

```bash
# Baseline (no B5d0, no B5a)
git stash
pnpm --filter mfe-shell build
ls -la apps/mfe-shell/dist/assets/*design_mf_2_system*

# With B5d0 + B5a applied
git stash pop
pnpm --filter mfe-shell build
ls -la apps/mfe-shell/dist/assets/*design_mf_2_system*

# Diff: NO new subpath wrappers; root wrapper IDENTICAL size.
```

## References

- PMD v3 §3 Wave B5d (this PR's parent plan): `docs/performance/PERF-INIT-V2-plan.md`
- Codex thread `019e20fa` iter-5 (B5d-a proposal that this PoC tests)
- PR-B5a (#438): consumer-side subpath migration (also produced 0 MB decoded delta)
- `@module-federation/vite` plugin: https://github.com/module-federation/vite (current version constraints)
