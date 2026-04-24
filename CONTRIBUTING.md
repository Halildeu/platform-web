# Contributing to platform-web

**Authority**: Bu repo platform-web MFE + design-system kaynağı.
**ADR**: [ADR-0004 split-repo authority transfer](https://github.com/Halildeu/platform-k8s-gitops/blob/main/docs/adr/0004-split-repo-authority-transfer.md)
**Canonical manifest**: [platform-k8s-gitops](https://github.com/Halildeu/platform-k8s-gitops)
**Sibling repo**: [platform-backend](https://github.com/Halildeu/platform-backend)

---

## Repo sınırı

- **platform-web** (bu): MFE shell + mfe-* + design-system + i18n-dicts + packages (+ design-tokens + e2e)
- **platform-backend** (kardeş): Java mikroservis + Zanzibar plane
- **platform-k8s-gitops** (canonical): manifest + docs + ops + host-compose
- **platform-ssot** (deprecated, Faz 19.10'da archive)

## Frontend delivery (Faz 18.11.a canonical)

**Option B canonical**: `staging-sw` host üstünde `platform-web-nginx` (prod) + `platform-web-nginx-stage` (test) reverse-proxy. K8s frontend authoritative DEĞİL (Option A Faz 19.10+ karar kapısı).

- `ai.acik.com` → K8s prod NodePort `127.0.0.1:30443` (auth chain K8s)
- `testai.acik.com` → K8s test NodePort `127.0.0.1:31080` + `127.0.0.1:5545`

Bu repo sadece MFE source + build otoritesi olur. Edge nginx routing gitops'ta.

## Geliştirme döngüsü

### Lokal

```bash
pnpm install --frozen-lockfile
pnpm run -w lint
pnpm run -w build
```

Node 22.12+ + pnpm 10.12.4 gerekli (root package.json packageManager).

### PR açma

1. Branch: `feat/<short-desc>` veya `fix/<short-desc>`
2. Commit pattern: `<type>(<scope>): <summary>`
3. PR template otomatik dolduruluyor (`.github/PULL_REQUEST_TEMPLATE.md`)
4. `ci-web-check` PASS olmadan merge yok

### Dual-build dönem (Faz 19.8'e kadar)

Platform-ssot CI aynı image'ları build ediyor (paralel). platform-web CI aynı GHCR image adına push edecek (minimum hareket). Faz 19.9 cutover'da gitops digest pin değişir.

## Image registry

- GHCR: `ghcr.io/halildeu/platform-ssot-frontend:<tag>` (isimlendirme korundu, değişiklik Faz 19.8+)
- Tag: `sha-<short>` immutable (D30, ADR-0002)

## Branch protection

- `main` branch protected
- PR required (admin bypass OK)
- `ci-web-check` required status check
- Direct push blocked

## 16 legacy workflow (disabled)

Initial push sonrası 16 workflow `workflows-legacy/` altına taşındı (case-by-case 19.8+'da re-enable):
- audit-quality, benchmark-gate, chromatic, codeql, compatibility-matrix
- design-system-doctor, design-system-gate, i18n-smoke, npm-publish, release
- scorecard-gate, secret-scan, security-guardrails, stale, token-drift-check, ui-kit-ci

## Kaynak migration geçmişi

Bu repo `platform-ssot` `web/` subdirectory'sinden `git filter-repo` ile migrate edildi (Faz 19.1, 2026-04-24):
- 2,696 ssot commit → 739 filtered commit (106M packed)
- sha-map: [platform-k8s-gitops/docs/faz-19-evidence/sha-map-platform-web.txt](https://github.com/Halildeu/platform-k8s-gitops/blob/main/docs/faz-19-evidence/sha-map-platform-web.txt)

**Large file warning**: 2 dosya >50MB (`.next/cache/webpack/*.pack` 2026-03 artefaktları). Faz 19.8+'da BFG/`filter-repo --strip-blobs-bigger-than 50M` değerlendirilebilir.

## Referans

- ADR-0004 split-repo authority transfer
- platform-k8s-gitops PLAN.md §Faz 19
- Codex thread 019dc0ac (10-step AGREE)
- Faz 18.11.a frontend canonical truth seal (host-static)
