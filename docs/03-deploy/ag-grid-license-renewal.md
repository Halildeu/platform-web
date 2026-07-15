# AG Grid + AG Charts Enterprise — License Model & Renewal Runbook

> Scope: how the AG Grid / AG Charts Enterprise license key reaches the deployed
> frontend, and the exact steps to rotate it (trial → perpetual, or renewal).

## License model — build-time, single source of truth

The Enterprise license key is **baked into the frontend bundle at build time**. It
is **not** a runtime Kubernetes Secret/ConfigMap and **not** delivered via
Vault/ESO (the frontend deployment has no `ExternalSecret`; ESO only serves
backend services).

Flow:

```
GitHub Actions Secret  AG_GRID_LICENSE_KEY        (Halildeu/platform-web)
  → Dockerfile build-arg  VITE_AG_GRID_LICENSE_KEY (ci-web-image-push.yml)
  → Vite DefinePlugin inlines process.env.VITE_AG_GRID_LICENSE_KEY into the bundle
  → bootstrap.tsx mirrors it onto window.__env__
  → packages/design-system/src/lib/ag-grid-license.ts → LicenseManager.setLicenseKey()
```

- **Single source of truth:** GitHub Actions repository secret `AG_GRID_LICENSE_KEY`.
  Both image variants (`platform-web-frontend` = prod, `platform-web-frontend-testai`
  = test) read the same secret at build time.
- **Single code touch point:** `LicenseManager.setLicenseKey()` is global; once the
  key is correct in the bundle, every Enterprise grid (devices, users, reporting,
  audit, access — all `EntityGridTemplate` consumers) is licensed at once.
- **Not sensitive:** the key ships inside the client bundle and is visible in browser
  DevTools (`window.__env__`). Treat it as a public, non-secret value. This is why it
  lives in a build secret rather than Vault — a deliberate, documented exception to
  the otherwise Vault-canonical secret model used by backend services.

## History

| Date | Key | Note |
|------|-----|------|
| 2026-04-30 | trial `AG-127779` | First build-time injection (PR #131); replaced the temporary host-nginx HTML patch. |
| 2026-06-02 | trial expired | Trial period ended → console error + watermark on all Enterprise grids (rows still render, degraded). |
| 2026-06-08 | perpetual | Perpetual Enterprise Bundle key (Grid + Charts) set in `AG_GRID_LICENSE_KEY`; rebuild rolled to test then prod. Perpetual keys do not expire (versions released within the support window keep working). |

## Renewal / rotation runbook

Because the key is build-time, updating the secret alone does **not** fix live grids.
A rebuild + redeploy is required.

1. **Update the secret.** `Halildeu/platform-web` → Settings → Secrets and variables →
   Actions → `AG_GRID_LICENSE_KEY` → Update (or `gh secret set AG_GRID_LICENSE_KEY
   --repo Halildeu/platform-web`).
2. **Trigger a rebuild with a fresh immutable tag.** Land a commit on `main` (the
   image tag is `sha-<commit-short>`; reusing a commit would overwrite an existing
   tag — forbidden by the immutable-artifact rule). `ci-web-image-push.yml` rebuilds
   **both** variants with the new key. The license layer cache is busted automatically
   because the `VITE_AG_GRID_LICENSE_KEY` build-arg changed.
3. **Test (testai) deploys automatically.** On a successful `testai` build,
   `ci-web-image-push.yml` fires a `repository_dispatch (testai-deploy)` to
   `platform-k8s-gitops`; `deploy-testai.yml` runs `kubectl set image` (digest pin)
   on `k3d-test`. For durability, also bump the testai digest in
   `kustomize/overlays/test/kustomization.yaml` so a later `apply -k` does not revert.
4. **Prod is manual + gated.** Bump the prod digest in
   `kustomize/overlays/prod/kustomization.yaml` and deploy via the prod cutover path.
5. **Verify in the browser.** Open `/endpoint-admin/devices`; confirm the
   "Trial Period Expired" console error and the watermark are gone and grids render
   normally.

## Optional hardening — runtime-injectable key (rebuild-free renewals)

To align the key with the Vault-canonical model and remove the rebuild requirement,
the key could be served at runtime: `kv/platform/web` → `ExternalSecret` → mounted
`env.js` → `window.__env__`. Renewals would then be a Vault update + pod restart with
no image rebuild. Tracked separately; not required for the build-time model above.

## Renewal log

| Date | Action |
|---|---|
| 2026-06-02 | Trial expired; watermark on all Enterprise grids. |
| 2026-06-08 | Perpetual key added to `AG_GRID_LICENSE_KEY`; rebuild → testai `0e85fab` + prod `b85ca389` LIVE (browser-verified). |
| 2026-07-15 | License **renewed** (updates/support term); key rotated in `AG_GRID_LICENSE_KEY` secret. This commit triggers the rebuild that bakes the renewed key into both frontend variants. |
