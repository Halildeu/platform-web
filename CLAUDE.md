# platform-web — Canonical Frontend Repo

> **Halildeu/platform-web** is the canonical web monorepo (Faz 19, ADR-0004). MFE shell + mfe-reporting + mfe-* + design-system + i18n-dicts + packages. Backend is `platform-backend`; ops is `platform-k8s-gitops`.

---

## HARD RULE — `platform-ssot` is DEPRECATED, code there is YASAK (2026-05-06)

`Halildeu/platform-ssot` is **DEPRECATED, audit-only**. Faz 19 split-repo authority transfer completed 2026-04-25.

**Do NOT:**
- commit code to `platform-ssot`
- open PRs against `platform-ssot`
- modify workflow files in `platform-ssot`
- add governance contracts to `platform-ssot`

**Why:** ssot's GHCR push rights for `platform-web-*` packages have been **revoked** (403 Forbidden — same pattern as `platform-backend-*`). Any image build in ssot is orphaned and never reaches the cluster.

**Repo mapping:**

| Old (`platform-ssot`) | Canonical |
|---|---|
| `web/apps/mfe-shell/` | `platform-web/apps/mfe-shell/` (this repo) |
| `web/apps/mfe-reporting/` | `platform-web/apps/mfe-reporting/` |
| `web/packages/` | `platform-web/packages/` |
| `backend/` | `platform-backend/<service>/` |
| `kustomize/` | `platform-k8s-gitops/` |

**Existing ssot residue (audit-only):**

- ssot PR #564: backend X-Company-Id selector + frontend `dynamic-report/api.ts` X-Company-Id helpers
- ssot PR #570: muavin v3 CompanyPicker dropdown + filter forwarding (`buildAdvancedFilter`)
- ssot PR #569: frontend-image GHA cache scope rotation

These never shipped — `platform-web` GHCR push from ssot returns 403. Re-applied in canonical:
- platform-web PR #257: muavin v3 X-Company-Id + filter pushdown + CompanyPicker (preserves canonical `ensureColumnMeta` fix from PR #222 — the "grid renders zero rows despite total" bug)

---

## Build / deploy

- Module Federation, Vite production build, Docker → GHCR `ghcr.io/halildeu/platform-web-frontend-{testai,prod}`
- Workflow: `.github/workflows/frontend-image.yml`
- Deploy: `platform-k8s-gitops` overlay digest pin

---

## Cross-AI work

- Code Claude wrote → review by separate channel (Codex new thread, third-AI, or human). Self-review is forbidden (CNS-011 self-fulfilling loop).
- Live smoke after deploy: bundle hash visible in Network tab, expected request shapes (X-Company-Id header, advancedFilter param).
- AG Grid / module-federation regressions are highest-risk: always verify `ensureColumnMeta` race fix (PR #222) is preserved on dynamic-report changes.
