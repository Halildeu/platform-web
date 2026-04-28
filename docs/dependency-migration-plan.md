# Dependency Migration Plan — K7 Triage

> **Tarih:** 2026-04-28
> **Sprint:** K7 (post-K3 dependency maintenance)
> **Codex MCP iter:** 9 (`019dd2e2-...` thread)
> **Bu doc:** triage kontrol kulesi — kod migration YOK; karar dökümanı + dependabot policy.

---

## §1 Mevcut Repo State (lokal kanıt)

`package.json` analizi (root + workspaces):

| Dependency           | Root              | mfe-shell             | design-system         | x-form-builder |
| -------------------- | ----------------- | --------------------- | --------------------- | -------------- |
| typescript           | `^5.9.3`          | `^5.8.3` ⚠️ divergent | `^5.8.3` ⚠️ divergent | —              |
| @vitejs/plugin-react | `^6.0.1`          | (root)                | —                     | —              |
| @eslint/js           | `^9.39.1`         | —                     | —                     | —              |
| @sentry/react        | `^10.48.0`        | `^10.48.0`            | —                     | —              |
| zod                  | (none)            | `^3.25.76`            | `^3.0.0`              | uses           |
| react-router-dom     | `^6.27.0`         | `^6.27.0`             | —                     | —              |
| ag-grid-community    | `34.3.1` (PINNED) | —                     | `34.3.1`              | —              |
| ag-charts-community  | (none)            | —                     | `12.3.1`              | —              |

**Workspace divergence**: TypeScript root 5.9.3 vs workspaces 5.8.3 → tek ayrı micro-PR ile align edilmeli.

---

## §2 Açık Dependabot PR Listesi & Reconciliation

| PR# | Bump                         | Repo durumu                                                  | Karar                                                              |
| --- | ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| #6  | dev-deps grouped (24 update) | Çoğu lokalde zaten yapılmış (TS, Vite plugin, ESLint)        | **Close** — dependabot'u patch-only grouping'e çevir, yeniden açar |
| #7  | production-deps grouped      | İncelenecek — ne içeriyor net değil                          | **Triage** — açık tutup içerik kontrol                             |
| #8  | react-router-dom 6 → 7       | shell + 7 MFE etkilenir; v7 data loaders + action middleware | **Migrate later** — ayrı migration sprint                          |
| #9  | ag-charts 12 → 13            | PINNED kuralı (`.claude/rules/ag-grid.md`)                   | **Close + ignore**                                                 |
| #10 | typescript 5.7 → 5.9         | Root zaten `^5.9.3`                                          | **Close (stale)** + workspace convergence ayrı PR                  |
| #11 | ag-grid 34 → 35              | PINNED kuralı                                                | **Close + ignore**                                                 |
| #13 | @vitejs/plugin-react 4 → 6   | Root zaten `^6.0.1`                                          | **Close (stale)**                                                  |
| #14 | zod 3.25 → 4.3               | mfe-shell + design-system + x-form-builder etkilenir         | **Migrate later** — adapter compat PR önce                         |
| #15 | @eslint/js 9 → 10            | Root `^9.39.1`; v10 major                                    | **Migrate later** — lint config update gerekiyor                   |
| #16 | @sentry/react 10.48 → 10.50  | Patch, düşük risk                                            | **First migration PR** — bir sonraki sprint                        |

---

## §3 Per-Dependency Risk + Etki Analizi

### @sentry/react 10.48 → 10.50 (PATCH — ilk migration adayı)

- **Risk:** DÜŞÜK (patch)
- **Etki:** root + mfe-shell error reporting
- **Test:** `pnpm install --frozen-lockfile && pnpm -w build` smoke yeterli
- **Karar:** İlk migration PR (sıradaki sprint)

### TypeScript workspace convergence (5.8.3 → 5.9.3)

- **Risk:** DÜŞÜK (minor; root zaten 5.9.3)
- **Etki:** mfe-shell + design-system devDep
- **Test:** `pnpm -w typecheck` workspace-level
- **Karar:** Ayrı micro-PR; @sentry sonrası

### zod 3 → 4 (MAJOR)

- **Risk:** ORTA-YÜKSEK
- **Etki yüzeyi:** `packages/design-system/src/form/validation/zodResolver.ts`, `packages/x-form-builder/src/zodAdapter.ts`, `apps/mfe-shell/src/app/manifest/pageManifestSchema.ts`
- **Breaking changes:** schema parsing API, `.parse()`/`.safeParse()` davranışı
- **Migration sırası:**
  1. Adapter compatibility test PR (mevcut zod 3 ile yeni 4 API kombinasyonu mümkün mü)
  2. Sonra dep bump + tüm callers update
- **Karar:** Migrate later (ayrı sprint)

### react-router-dom 6 → 7 (MAJOR)

- **Risk:** YÜKSEK
- **Etki yüzeyi:** apps/mfe-shell/src/app/router/\* + MFE'lerin route consumer'ları
- **Breaking changes:** Data loaders + action middleware + `<Route>` API
- **Migration sırası:**
  1. v7 docs survey + repo'da etkilenen pattern envanteri
  2. Shell router pilot migration
  3. MFE'ler staged
- **Karar:** Migrate later (ayrı major sprint, K8 olabilir)

### AG Grid 34 → 35 + AG Charts 12 → 13 (PINNED)

- **Risk:** YÜKSEK + repo kuralı
- **Etki:** `.claude/rules/ag-grid.md` "do NOT upgrade without explicit approval"
- **Karar:** **Dependabot ignore** — major version-update'leri otomatik dışlanmalı

---

## §4 Dependabot Policy Update

`.github/dependabot.yml`'de:

1. **Dev-deps grouping daraltıldı**: `patch` only (önceden `patch + minor`). Minor bump'lar ayrı PR olur, 24-update'lik mega PR'lar tekrar oluşmaz.
2. **AG Grid/Charts major ignore**: `version-update:semver-major` eklendi. Pinned kuralı CI'da enforce edilir.
3. **Production-deps grouping** patch-only kalıyor (zaten daraltılmış).

---

## §5 Sprint K7 Closure (bu PR sonrası)

- ✅ Açık dependabot PR listesi reconcile edildi
- ✅ Per-dep karar + risk dökümante
- ✅ Dependabot policy güncellendi
- ⏸️ İlk migration PR: @sentry/react 10.48 → 10.50 (sonraki sprint)
- ⏸️ TS workspace convergence (sonraki micro-PR)

**Ne YOK bu PR'da:** kod değişikliği, lockfile değişikliği, dependency bump.

---

## §6 Önemli Not — Dependabot PR'ları stale

Lokal repo'da TS, Vite plugin, ESLint zaten **dependabot'un önerdiği versiyonlarla aynı veya yakın**. Bu durumda:

- **#10 TS 5.7→5.9**: zaten 5.9.3 → close stale
- **#13 Vite plugin 4→6**: zaten 6.0.1 → close stale
- **#15 ESLint/js 9→10**: 9.39.1 mevcut, v10 ayrı major, açık tutulabilir

Bu kontrol her dependabot triage'da yapılmalı: GitHub PR vs lokal `package.json` cross-check.

---

## §7 Referanslar

- Codex MCP iter-9 (`019dd2e2-...` threadId) — bu plan onaylandı (5/5 karar AGREE/REVISE)
- [.github/dependabot.yml](../.github/dependabot.yml) — policy update bu PR'da
- [docs/ROADMAP.md](ROADMAP.md) — K1+K2+K3 closure note bu PR'da
- [.claude/rules/ag-grid.md](../.claude/rules/ag-grid.md) — AG Grid PINNED kuralı

---

_Bu doc 2026-04-28 K7 sprint kapsamında oluşturuldu. Sonraki dependency migration'larda referans alınır._
