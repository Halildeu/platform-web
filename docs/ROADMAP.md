# ROADMAP — Konsolide Durum Özeti

> **Son senkronizasyon:** 2026-04-28 (Codex denetimi sonrası revize)
> **Amaç:** 4+ paralel yol haritası belgesini tek görünümde topla, çatışmaları işaretle, bu haftanın kritik yolunu netleştir.
> **Bu doc kaynak değildir** — TRUTH-SUMMARY'dir. Detay her zaman kaynak belgelerde tutulur (§9). Bu doc ile kaynak çelişirse → kaynak güncellenir, sonra bu doc senkronlanır.
> **Codex denetimi 2026-04-28 (threadId `019dd2e2-...`): dürüstlük skoru %70.** F5/F6/F7/F8 ile ilgili bazı PHASE-GOVERNANCE iddiaları repo gerçeğine göre stale; bu doc revize edildi. Detay §11.

---

## §1 Tek-Cümle Durum (2026-04-28)

**F4 ✅ DONE (2026-03-24)** — F5/F6/F7 🟡 KISMEN — **F8 🟡 BAŞLADI** (intelligence/ source + 3 CI script seed; PHASE-GOVERNANCE'ın "sırada" ifadesi stale) · **Wave 0.5 + Wave 4 ✅ DONE**, geri kalan Wave'ler kısmî · **Quality-Sprint M1+M2+M3 deadline kaçtı** (status hâlâ `open`) · **Aktif CI gate yüzeyi zayıf** (scorecard/a11y/PR-comment workflow'ları legacy altında) · 6 belge senkron değil; bu doc onları toplar.

---

## §2 Faz Tablosu — F0…F8 (PHASE-GOVERNANCE)

> Kaynak: [packages/design-system/docs/PHASE-GOVERNANCE.md](../packages/design-system/docs/PHASE-GOVERNANCE.md) — kendini SSOT ilan eder (line 7). Aşağıdaki "Eksik" sütunu Codex denetimi sonrası repo gerçeğine göre güncellendi (📌 = PHASE-GOVERNANCE iddiası stale, repo daha ileride).

| Faz    | Başlık                        | Durum          | Son doğrulama     | Eksik (repo doğrulamalı)                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------- | -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F0** | Release Truth                 | ✅ DONE        | 2026-03-20        | 13/13 gate PASS                                                                                                                                                                                                                                                                                                                   |
| **F1** | Package Topology              | ✅ DONE        | 2026-03-20        | 15 deep imports + boundary                                                                                                                                                                                                                                                                                                        |
| **F2** | Foundation                    | ✅ DONE        | 2026-03-20        | 51 icon + 8 hook + token + axe-core                                                                                                                                                                                                                                                                                               |
| **F3** | Core Completeness             | ✅ DONE        | 2026-03-20        | 0 deprecated, 5,321 test                                                                                                                                                                                                                                                                                                          |
| **F4** | Gap Closer + Enterprise Suite | ✅ DONE        | 2026-03-24        | Form + Motion + RTL + 📌 ≈41 enterprise comp (PHASE 38 der; gerçek 41 — sayım stale)                                                                                                                                                                                                                                              |
| **F5** | AI-First Leapfrog             | 🟡 KISMEN      | 2026-03-24        | 📌 MCP **21 tool** (PHASE 18/20 der — stale; `mcp/server.ts:132-271`) · 📌 `useAdaptiveLayout` ✓ (`hooks/useAdaptiveLayout.ts:24`) · 📌 `AdaptiveForm` ✓ (`components/adaptive-form/AdaptiveForm.tsx:315`) · **Kalan**: VS Code ext, privacy audit, fallback test, SmartDashboard v2 progression, AdaptiveForm v2 progression     |
| **F6** | DX & Ecosystem                | 🟡 KISMEN      | 2026-03-24        | 📌 Astro/Starlight portal scaffold ✓ (`packages/design-system/docs-portal/`) · 📌 Figma sync scriptleri ✓ (`scripts/figma-sync.mjs`, `figma-sync-reverse.mjs`) · **Kalan**: portal içerik (planned), CI entegrasyonu, API ref auto, search, versioned, TR+EN, token diff · 📌 blocks **9 `*Block.tsx`** (PHASE 48 der — kanıtsız) |
| **F7** | Commercial Hardening          | 🟡 KISMEN      | 2026-03-24        | 📌 LTS policy ✓ (`docs/lts-policy.md`) · 📌 RFC template ✓ (`packages/design-system/docs/RFC-TEMPLATE.md`) · Semver check + migration tool ✓ · **Kalan**: gerçek LTS release, npm dist-tag, tamamlanmış RFC süreci, adoption telemetry                                                                                            |
| **F8** | AI Runtime Intelligence       | 🟡 **BAŞLADI** | 2026-04 (denetim) | 📌 `intelligence/predictive-engine.ts`, `intelligence/a11y-runtime-guardian.ts` ✓ · 📌 `scripts/ci/pr-design-review.mjs`, `component-predictor.mjs`, `a11y-guardian.mjs` ✓ · **Kalan**: gate enforcement (aktif CI'da değil), false-positive tuning, runtime perf doğrulama                                                       |

---

## §3 Wave Tablosu — W0.5…W8 (Operasyonel İş Paketleri)

> Kaynak: [docs/world-class-roadmap.md](world-class-roadmap.md) (2026-03-22). F-fazları "ürün vizyonu", Wave'ler "operasyonel iş paketleri".

| Wave     | Başlık                       | Durum          | İçerik özeti                                                                                                                                                                       | F-faz örtüşmesi |
| -------- | ---------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **W0.5** | Capability Inventory Auto    | ✅ DONE        | `capability-inventory.mjs`, Vitest Browser, Workspace, DevTools                                                                                                                    | Tümü            |
| **W1**   | Truth Plane                  | 🟡 PARTIAL     | Evidence registry tip-hazır (`evidence/useEvidence.ts`), CI ingestion eksik · `scripts/collect-evidence.mjs` var ama aktif workflow entegre değil · Provenance Live/Derived/NoData | F4 + F8         |
| **W2**   | Token Pipeline + Design Sync | 🟡 P0          | Style Dictionary v4 · Figma Code Connect · Variables API sync · Token lint · Drift detection                                                                                       | F2 + F6         |
| **W3**   | Quality Gates Hardening      | 🟡 PARTIAL     | size-limit hard gate · Bench threshold · Visual approval flow · A11y e2e gate · Story governance                                                                                   | F5 + F7         |
| **W4**   | Engine Productization        | ✅ DONE        | Tiptap canonical · dnd-kit swimlane/touch/keyboard · Editor collab strategy                                                                                                        | F4              |
| **W5**   | Governance Plane             | 🟡 PARTIAL     | RBAC · Audit trail · Approval workflow · Owner assignment · Exception management                                                                                                   | F7              |
| **W6**   | Observability + Resilience   | 🟡 PARTIAL     | Web Vitals RUM · Synthetic monitoring · OpenTelemetry · MF resilience · Compat matrix · Flaky classifier                                                                           | F7 + F8         |
| **W7**   | Impact Intelligence + AI     | ⬜ NOT_STARTED | Blast-radius graph · Migration impact · Consumer heatmap · AI grounded assistant · Codegen sandbox · MCP export                                                                    | F5 + F8         |
| **W8**   | Leadership Proof             | ⬜ NOT_STARTED | Reproducible benchmark · Reference apps · Certified compat · Public badges · Viewer portal · Analytics · ROI                                                                       | F7 + F8         |

**P0 etiketleri (world-class-roadmap.md gap tablosu):** Chromatic ingestion (W1), Tokens/Style Dictionary (W2), Figma sync (W2).

---

## §4 Quality-Sprint M1…M5 (Tarihli Execution)

> Kaynak: [docs/quality-sprint/project.manifest.v1.json](quality-sprint/project.manifest.v1.json). Success metrics: scorecard 87→92+, a11y:0 14→0, story 85→%95, gate warn→block.

| ID     | Hedef                               | Tarih      | Status | Sapma + repo gerçeği                                                                                                                                  |
| ------ | ----------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | 16 D/F bileşen → C+ notu            | 2026-04-19 | open   | 🔴 **9 gün gecikti.** `apps/mfe-shell/public/scorecard.json` → 218 component, **F=1**, **D=15**, toplam 16 D/F (DoD ile birebir örtüşüyor)            |
| **M2** | A11y compliance gate (CI block ≥40) | 2026-04-26 | open   | 🔴 **2 gün gecikti.** ⚠️ **Spec uyumsuzluğu**: manifest "≥40" (yüz/100) der; `a11y-gate.mjs:16` threshold **0.7** (oran). Plus aktif CI'da koşulmuyor |
| **M3** | Scorecard CI auto (PR comment)      | 2026-04-26 | open   | 🔴 **2 gün gecikti.** ⚠️ Workflow var ama `.github/workflows-legacy/scorecard-gate.yml` altında — **disabled**. Aktif CI'da değil                     |
| M4     | Story coverage %95                  | 2026-05-03 | open   | 🟡 5 gün kaldı                                                                                                                                        |
| M5     | Quality gate block mode             | 2026-06-30 | open   | 🟢 9 hafta kaldı (M1+M2 önkoşul); şu an `component-scorecard.mjs:595-601` sadece F grade'i blokluyor, D'leri değil                                    |

**Risk:** M1-M3 gecikmesinin nedeni + yeni hedef tarih dokümante değil. Manifest `status`/`target_date` alanları manuel güncellenmiyor.

---

## §5 Sprint A…D (Post-F4 Sprint Planı)

> Kaynak: [packages/design-system/docs/SPRINT-TRACKER.md](../packages/design-system/docs/SPRINT-TRACKER.md) (2026-03-24).

| Sprint | Süre | Hedef                                                              | F-faz                |
| ------ | ---- | ------------------------------------------------------------------ | -------------------- |
| **A**  | 1 hf | Dark mode polish (audit + visual reg + Design Lab toggle)          | Tüm fazlarda enforce |
| **B**  | 2 hf | F8 AI Runtime — PR review bot · predictive · a11y guardian         | **F8**               |
| **C**  | 2 hf | F6 Public Docs Portal — Astro/Starlight · API ref · search · TR+EN | **F6**               |
| **D**  | 1 hf | FlowBuilder (no-code akış tasarımcısı)                             | F4 yan-meyvesi       |

**Tutarsızlık:** SPRINT-TRACKER bunları "şimdi sırada" sunuyor ama F8 "Sprint B" için aslında script + kod seed mevcut; Sprint B "yeniden başlat" değil "aktive et + tune" olmalı. Plus F5'in kalan işleri (VS Code ext, privacy audit, fallback) kapatılmadan F8 gate enforcement'a geçmek riskli.

---

## §6 Çatışma Raporu

| #   | Konu                            | Çelişki                                                                                              | Çözüm (bu doc)                                                                                                                                                                                                                                                     |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **F5 status**                   | PLATFORM-ROADMAP.md:541 ✅ DONE der; PHASE-GOVERNANCE.md:17 🟡 KISMEN der                            | ✅ **ÇÖZÜLDÜ (2026-04-28)**: PLATFORM-ROADMAP F4-F8 satırları + PHASE-GOVERNANCE F5 satırı düzeltildi (gerçek: MCP 21 tool, runtime SEED'lendi).                                                                                                                   |
| 2   | **F-numbering çakışması**       | PHASE/PLATFORM F0-F8 (ürün vizyonu) ≠ design-platform-roadmap F0-F6 (foundation trust)               | İki ayrı taksonomi. Tek-doğru: PHASE F0-F8. design-platform-roadmap zaten bu seansta "bağımsız Foundation Trust Track" diye düzeltildi.                                                                                                                            |
| 3   | **F4 isim çakışması**           | design-platform-roadmap F4 = "Docs Trust Surface" / PHASE F4 = "Gap Closer + Enterprise Suite"       | İki farklı F4. Bu doc'ta sadece **PHASE F4** kullanılır.                                                                                                                                                                                                           |
| 4   | **W0.5 ✅ DONE kanıtı**         | world-class-roadmap.md:30-33 ✅ işareti var                                                          | `capability-inventory.mjs` mevcut → işin varlığı doğrulandı, "kapatma kanıtı" zayıf — KPI registry yok                                                                                                                                                             |
| 5   | **Sprint A-D iki yerde**        | PHASE-GOVERNANCE.md:166-184 özet · SPRINT-TRACKER.md:25-142 detay                                    | Aynı plan, tek kaynak (SPRINT-TRACKER) yeterli; PHASE özetinin senkron tutulması gerekli                                                                                                                                                                           |
| 6   | **M1-M3 gecikme**               | Manifest target geçmiş, status `open`                                                                | Manifest güncellenmeli; yeni hedef §7'de                                                                                                                                                                                                                           |
| 7   | ~~**Mirror iddiası**~~          | ~~design-platform-roadmap "mirror" der~~                                                             | ✅ **ÇÖZÜLDÜ** (bu seansta header düzeltildi)                                                                                                                                                                                                                      |
| 8   | **M2 spec uyumsuzluğu**         | Manifest "a11y ≥40" (yüz/100) · `a11y-gate.mjs:16` threshold **0.7** (oran)                          | ✅ **ÇÖZÜLDÜ (2026-04-28)**: Manifest M2 DoD'u "a11y test coverage < %70 altinda PR bloklaniyor" olarak düzeltildi (script ile uyumlu).                                                                                                                            |
| 9   | **F8 status stale**             | PHASE F8 ⬜ "sırada" der · `intelligence/` + 3 CI script mevcut                                      | ✅ **ÇÖZÜLDÜ (2026-04-28)**: PHASE-GOVERNANCE F8 satırı + Ozet tablosu 🟡 BAŞLADI olarak güncellendi.                                                                                                                                                              |
| 10  | **PHASE 38 enterprise iddiası** | "38 enterprise component" der · `enterprise/` altında **41** dosya                                   | ✅ **ÇÖZÜLDÜ (2026-04-28)**: PHASE F4 4D + PLATFORM F4 satırı 41 olarak düzeltildi.                                                                                                                                                                                |
| 11  | **PHASE 48 block iddiası**      | F6 "blocks 48 tamamlandı" der · `packages/blocks/src/blocks/` altında **9 \*Block.tsx + 3 template** | ✅ **ÇÖZÜLDÜ (2026-04-28)**: PHASE F6 6A + kabul kriteri 9+3 olarak düzeltildi.                                                                                                                                                                                    |
| 12  | **CI gate yüzeyi**              | scorecard, a11y, PR comment workflow'ları yazılı · ama `.github/workflows-legacy/` altında, disabled | 🟡 **KISMEN ÇÖZÜLDÜ (2026-04-28)**: `scorecard-gate.yml` + `codeql.yml` aktif `.github/workflows/`'a taşındı (hardened). `chromatic.yml` (CHROMATIC_PROJECT_TOKEN secret + npm bağımlılığı), `audit-quality.yml` (npm bağımlılığı) SKIP — ayrı sprint'e ertelendi. |

---

## §7 Bu Hafta Kritik Yolu (2026-04-28, Codex revize)

3-boyutlu kritiklik (R: roadmap-uyum, E: etki, B: engelleyici-lik):

| Sıra   | İş                                                                                  | R      | E      | B      | Eylem                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------- | ------ | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1** | **M1+M2+M3 toparlama + Aktif CI gate yüzeyi geri yükle** (Codex'in 1. sıra önerisi) | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | (a) 16 D/F bileşen → C+ test depth (`*.depth.test.tsx` üret/koş) · (b) `a11y-gate` threshold spec'i çöz (0.7 vs ≥40) · (c) **scorecard-gate / chromatic / codeql workflow'larını `.github/workflows-legacy/` → `.github/workflows/`'a geri al** · (d) PR comment artifact'ı aktif CI'a bağla. **Yeni hedef:** 2026-05-09. |
| **K2** | Evidence registry pipeline (W1.1)                                                   | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐   | `scripts/collect-evidence.mjs` çıktısını CI'da `evidence-registry.json`'a kalıcı yaz + Design Lab `useEvidence`'a besle. Tek hamle, 7 panel canlanır.                                                                                                                                                                     |
| **K3** | F5 Kalan İşler (revize: MCP zaten 21 tool)                                          | ⭐⭐   | ⭐⭐   | ⭐⭐⭐ | Kalan iş: VS Code ext · Privacy audit (zero external data) · Fallback test (AI off → standard behavior) · SmartDashboard v2 + AdaptiveForm v2 progression. **Sprint B (F8 aktive et) → bunlar kapanmadan başlamamalı.**                                                                                                   |
| **K4** | W2 P0 (Style Dictionary + Figma Code Connect)                                       | ⭐⭐⭐ | ⭐⭐   | ⭐⭐   | `scripts/figma-sync*.mjs` tabanı mevcut; CI entegre et + token diff PR. F6 Sprint C ön-koşulu.                                                                                                                                                                                                                            |
| K5     | Charts visual baseline                                                              | ⭐     | ⭐⭐   | ⭐     | 6 tab × 13 chart Apr'da eklendi (commit `10363c87`); snapshot baseline yok → regresyon riski.                                                                                                                                                                                                                             |

**Bağımlılık zinciri:**

```
K1 (M1+M2+M3 + aktif CI gate'leri) ──→ M5 block mode + tüm quality enforcement
K2 (Evidence) ──→ W1 closure ──→ Design Lab Truth Plane
K3 (F5 kapat) ──→ Sprint B (F8 aktive) ön-koşul
K4 (Tokens)  ──→ Sprint C (F6 Docs Portal) ön-koşul
```

**Bu hafta odak:** **K1**. Codex denetimi gösterdi ki en büyük risk komponent kalitesi değil, **kalite işlerinin aktif CI'da çalışmaması** — script yazılı, kod yazılı, ama merge davranışına etkisi yok. K1'i bu yönüyle genişletmeden K2-K5 yine doc'ta kalır.

---

## §8 Süreç Boşlukları

1. **6+ belge senkron tutulmuyor** — Mart 22-24'ten beri update yok; Apr'daki Faz 19.x serisi (CI/observability) hangi Wave'e ait belgelenmedi.
2. **Faz 19.x → Wave kesişimi yok** — PR #24-#34 (apiLogger, security gates, playwright, mfe-access PR-E) hiçbir roadmap doc'una yansımadı.
3. **Quality-sprint manifest auto-update yok** — `status`/`target_date` manuel; CI hook ile otomatikleştirilmeli.
4. **PLATFORM-ROADMAP ↔ PHASE-GOVERNANCE ayrı yaşıyor** — F5 status farkı gibi çelişkiler kalıcı; ya birleşmeli ya açıkça "summary" işaretlenmeli.
5. **Design Lab özelinde roadmap yok** — 92K LOC + 345 dosya tek MFE'de; ayrı `design-lab/ROADMAP.md` aday.
6. **Aktif CI gate yüzeyi zayıf (KRİTİK)** — `.github/workflows/ci-web-check.yml:37-41` aktif CI'da sadece lint koşar (warning toleransı). Scorecard, a11y, chromatic, codeql, PR-comment scriptleri repo'da yazılı **ama** `.github/workflows-legacy/` altında disabled. Quality enforcement merge davranışını değiştirmiyor.
7. **mfe-suggestions hâlâ stub** — `apps/mfe-suggestions/src/App.tsx:3-10` placeholder; production milestone roadmap'lerde yok.
8. **F-faz status iddiaları repo'dan otomatik türetilmiyor** — PHASE-GOVERNANCE'ın 38 enterprise / 18 MCP tool / 48 block sayıları stale; gerçek 41 / 21 / 9. Doğrulama yok.

---

## §9 Kaynak Belgeler

| Belge                                                                                                                           | Rol                                              | Sahibi (önerilen) | Notlar                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [packages/design-system/docs/PHASE-GOVERNANCE.md](../packages/design-system/docs/PHASE-GOVERNANCE.md)                           | F-faz durumu, kabul kriterleri, anti-drift gates | DS lead           | ✅ 2026-04-28: 8 sayım/status düzeltmesi (38→41, 18→21 ×2, ✅21/20, 48→9+3 ×2, F5/F8 status, Ozet F8)                                     |
| [docs/world-class-roadmap.md](world-class-roadmap.md)                                                                           | Wave detayı, KPI hedefleri (30/60/90/180g)       | Platform lead     | —                                                                                                                                         |
| [docs/quality-sprint/project.manifest.v1.json](quality-sprint/project.manifest.v1.json)                                         | M1-M5, tarihli + DoD                             | Quality lead      | ✅ 2026-04-28: M2 a11y birim spec düzeltildi (≥40 → < %70). M1+M2+M3 status hâlâ `open` (yeni hedef: 2026-05-09) — manuel update bekliyor |
| [packages/design-system/docs/SPRINT-TRACKER.md](../packages/design-system/docs/SPRINT-TRACKER.md)                               | Sprint A-D, haftalık iş paketleri                | DS lead           | —                                                                                                                                         |
| [packages/design-system/docs/PLATFORM-ROADMAP.md](../packages/design-system/docs/PLATFORM-ROADMAP.md)                           | Paket vizyon + katman mimarisi                   | DS lead           | ✅ 2026-04-28: F4-F8 satırları repo gerçeğiyle hizalandı (F5/F6/F7 KISMEN, F8 BAŞLADI)                                                    |
| [docs/architecture/frontend/design-platform-roadmap.md](architecture/frontend/design-platform-roadmap.md)                       | Foundation Trust track (F0-F6)                   | DS lead           | ✅ Bu seansta "mirror" iddiası düzeltildi                                                                                                 |
| [docs/architecture/frontend/grid-template-roadmap.md](architecture/frontend/grid-template-roadmap.md)                           | Grid template özel                               | x-data-grid lead  | —                                                                                                                                         |
| [docs/architecture/frontend/design-platform-roadmap-v1-archive.md](architecture/frontend/design-platform-roadmap-v1-archive.md) | Arşiv                                            | (read-only)       | —                                                                                                                                         |

---

## §10 Güncelleme Protokolü

**Bu doc 2 haftada bir senkronlanır.** Tetikleyiciler:

- F-faz durumu değişti (PHASE-GOVERNANCE) → §1 + §2 güncelle
- Yeni Wave faaliyeti (world-class-roadmap) → §3 güncelle
- Milestone status değişti (quality-sprint manifest) → §4 güncelle
- Yeni sprint başladı (SPRINT-TRACKER) → §5 güncelle
- Yeni çatışma fark edildi → §6'ya satır ekle
- Repo gerçeği ile faz iddiası ayrıştı → §2 "Eksik" sütunu güncelle + §6 + §11 not ekle

**Bu doc ile kaynak çelişirse:** Önce kaynak güncellenir, sonra bu doc senkronlanır. Bu doc kaynak değildir.

**Yeni yol haritası belgesi eklenirse:** §9'a satır + §6'da çatışma kontrolü.

---

## §11 Codex Denetim İzi (2026-04-28)

**threadId:** `019dd2e2-804f-7fb0-b210-efda83da9c70`
**Mod:** MCP read-only sandbox, approval-policy=never
**Genel skor:** ROADMAP.md dürüstlük %70

**Verdict özeti (16 madde):**

| Kapsam            | AGREE              | REVISE         | REJECT |
| ----------------- | ------------------ | -------------- | ------ |
| A. F-fazları      | —                  | F4, F5, F6, F7 | F8     |
| B. Quality-Sprint | M1                 | M2, M3         | —      |
| C. Çatışmalar     | C.1, C.3, C.5, C.6 | C.2, C.4       | C.7    |
| D. Kritik yol     | —                  | D              | —      |
| E. Boşluklar      | E.1, E.2, E.3      | —              | —      |
| F. Genel          | —                  | F              | —      |

**Codex'in 3 ana bulgusu:**

1. **Kritik nokta (kaçırılan)**: Aktif CI yüzeyi çok zayıf. Scorecard/a11y/PR comment mantığı repo'da var ama legacy workflow altında. Aktif `.github/workflows` sadece lint koşar (warning toleransı). **Quality gate enforcement merge davranışını değiştirmiyor.**
2. **Doğrulanmış konkret stale iddialar**: MCP 18/20 → **21**, 38 enterprise → **41**, 48 block → **9**, F8 ⬜ sırada → **🟡 başladı** (intelligence/ + 3 CI script mevcut), `useAdaptiveLayout`/`AdaptiveForm` zaten var, Astro portal scaffold zaten var, LTS policy + RFC template zaten var.
3. **Bu haftanın 1. sırası**: K1 — ama kapsamı genişletilmeli: 16 D/F + a11y birim spec + **scorecard/a11y/PR-comment workflow'unu legacy → aktif CI'a geri al**. Bu yapılmadan K2-K5 sadece dokümanda kalır.

**Bu denetim sonrası uygulanan ROADMAP revize'leri:**

- §1: F8 ⬜ → 🟡 BAŞLADI; aktif CI gate uyarısı eklendi
- §2: F4-F8 "Eksik" sütunu repo gerçeğine göre güncellendi (📌 işaretiyle stale iddialar gösterildi)
- §4: M2 spec uyumsuzluğu (≥40 vs 0.7) + M3 legacy workflow notu eklendi
- §6: 5 yeni çatışma satırı (madde 8-12); madde 7 (mirror) çözüldü işaretlendi
- §7: K1 genişletildi (aktif CI gate yüzeyi geri al); K3 yeniden yazıldı (MCP 18→20 yanlıştı)
- §8: 3 yeni boşluk (aktif CI zayıf, mfe-suggestions stub, faz status auto-türetme yok)

**Bu seansta (2026-04-28) uygulanan kaynak-belge düzeltmeleri:**

- ✅ PHASE-GOVERNANCE.md: 8 düzeltme (F4 38→41, F5 MCP 18→21 ×2, F5 kriter 18/20→✅21/20, F6 6A 48→9+3, F6 kriter 48→9+3, F8 status 🟡 BAŞLADI, Ozet tablosu F8)
- ✅ PLATFORM-ROADMAP.md: F4-F8 satırları repo gerçeğiyle hizalandı (F5/F6/F7 🟡 KISMEN, F8 🟡 BAŞLADI)
- ✅ Quality-sprint manifest: M2 a11y birim spec çözüldü (≥40 → < %70, a11y-gate.mjs ile uyumlu)
- ✅ `.github/workflows/scorecard-gate.yml` aktive edildi (legacy → active, hardened: setup-node cache pattern düzeltildi, packageManager pnpm v10, pull-requests:write permission, manual cache step)
- ✅ `.github/workflows/codeql.yml` aktive edildi (security gate üçlüsü tamamlandı: gate-secrets + gate-osv-scan + codeql)

**Kalan iş:**

- 🟡 Quality-sprint manifest M1+M2+M3 `status` ve `target_date` alanları manuel güncellenmeli (yeni hedef: 2026-05-09)
- 🟡 chromatic.yml + audit-quality.yml + benchmark-gate + design-system-gate workflow'ları (legacy altında) — sıradaki sprint'te case-by-case değerlendir
- ✅ K2 (Evidence registry pipeline) — PR #37 + #39 + #40 ile tamamlandı (§12 closure)
- ✅ K1a — ShellHeader F→B (PR #36) ile tamamlandı; taze scorer'da F=0 D=0 (§12 closure)

---

## §12 Sprint K1 + K2 + K3 Closure (2026-04-28)

**Bu seansda 8 PR ile K1, K2 ve K3 sprint'leri kapatıldı:**

| PR  | Sprint       | Konu                                                                    |
| --- | ------------ | ----------------------------------------------------------------------- |
| #35 | (foundation) | docs roadmap konsolidasyon + scorecard-gate + codeql workflow           |
| #36 | K1a          | ShellHeader F→B (54) — depth tests + a11y + displayname                 |
| #37 | K2-1         | Evidence registry pipeline (collect-evidence + sync wrapper + workflow) |
| #38 | K1-M2a       | A11y-gate aktif CI + manifest M1/M3 completed                           |
| #39 | K2-2         | useEvidence helper + provenance UI (3 consumer)                         |
| #40 | K2-3         | QualityDashboardPage direct provenance completion                       |
| #41 | K3-1         | F5 fallback contract (16 test useAdaptiveLayout + AdaptiveForm)         |
| #42 | K3-2         | F5 privacy audit hard gate (23 file scan, 0 violation)                  |

### Sprint kapanma özeti

- ✅ **K1**: Quality-sprint M1 (16→0 D/F, ShellHeader F→B) + M3 (scorecard-gate aktif) + M2 (a11y-gate aktif, 73.5% coverage)
- ✅ **K2**: Evidence pipeline + 3 Design Lab consumer (VisualRegressionPage + SecurityPosture + QualityDashboardPage) + scorecard public sync (Truth Plane W1 hedef)
- ✅ **K3**: PHASE F5 fallback (K3-1) + privacy audit hard gate (K3-2). 5/7 kriter ✅; v2 progressions açık (Adaptive components v2 + AI test generation hardening).

### Codex MCP istişareleri

`019dd2e2-...` thread, 9 iter:

1. ROADMAP denetim · 2. Commit timing · 3. K1a · 4. K2-1 · 5. K1-M2a + K2-2 · 6. Sıradaki sprint · 7. K3-1 fallback · 8. K3-2 privacy · 9. K7 dependency triage

Toplam ~40 verdict, hepsi AGREE/REVISE direct impl.

### Aktif workflow yüzeyi 11 (önceki 6 → şimdiki 11)

ci-web-check · ci-web-image-push (pre-build sync) · gate-secrets · gate-osv-scan · web-playwright-{smoke,nightly} · codeql · **scorecard-gate** · **evidence-collect** · **a11y-gate** · **privacy-audit**

(Bold = bu seans aktive edildi)

### PHASE F5 progress

| Kriter                 | Önceki   | Şimdi               |
| ---------------------- | -------- | ------------------- |
| MCP tools (≥20)        | ✅ 21/20 | ✅ 21/20            |
| CLI komutları          | ✅       | ✅                  |
| Grounding              | ✅       | ✅                  |
| AI test generation     | 🟡       | 🟡                  |
| Adaptive components v2 | ⬜       | ⬜ (gelecek sprint) |
| **Privacy**            | ⬜       | **✅ K3-2**         |
| **Fallback**           | ⬜       | **✅ K3-1**         |

### Sıradaki

- **PR #43 K7** (bu doc'la birlikte): dependency triage spike (kod migration YOK)
- **K8 (gelecek)**: ilk gerçek dependency migration — @sentry/react patch
- **Kalan F5**: Adaptive components v2 progressions + AI test generation hardening

---

_Bu konsolidasyon dokümanı 2026-04-28'de oluşturuldu, aynı gün Codex denetimi sonrası §1-§8 revize edildi, §11 denetim izi olarak eklendi, §12 sprint K1+K2+K3 closure log eklendi._
