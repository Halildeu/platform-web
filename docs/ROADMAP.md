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

| ID     | Hedef                                | Tarih      | Status | Sapma + repo gerçeği                                                                                                                                                                                                                 |
| ------ | ------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M1** | 16 D/F bileşen → C+ notu             | 2026-04-19 | done   | ✅ Manifest `completed`. Mevcut scorecard: **F=0, D=0**, 231 component (A=163, B=55, C=13). ROADMAP row stale idi (2026-05-03 refresh).                                                                                              |
| **M2** | A11y compliance gate (CI block ≥70%) | 2026-04-26 | done   | ✅ Workflow aktif `.github/workflows/a11y-gate.yml`. `a11y-gate.mjs` THRESHOLD=0.7. Mevcut: **71.7% PASS**. Manifest "≥40" notu legacy/typo idi; gerçek script %70 + workflow CI hard-block. Manifest `open → completed` 2026-05-03. |
| **M3** | Scorecard CI auto (PR comment)       | 2026-04-26 | done   | ✅ Manifest `completed` (2026-04-26). Workflow `.github/workflows/scorecard-gate.yml` aktif (legacy değil). PR'da artifact + auto-comment + F-grade block. ROADMAP row stale idi.                                                    |
| M4     | Story coverage %95                   | 2026-05-03 | done   | ✅ Avg 95.53 (target ≥95). 13 x-charts stories landed 2026-05-03 (regression fix after PR-D2 enrichment). Manifest "completed" since 2026-04-28; this entry now reflects current scorecard reality.                                  |
| M5     | Quality gate block mode              | 2026-06-30 | open   | 🟢 9 hafta kaldı (M1+M2 önkoşul); şu an `component-scorecard.mjs:595-601` sadece F grade'i blokluyor, D'leri değil                                                                                                                   |

**Risk:** ✅ ÇÖZÜLDÜ (2026-05-03). M1+M3 manifest zaten `completed`; M2 DoD'ları (workflow + 70% threshold + 71.7% current PASS) tümü met — manifest `open → completed` refresh edildi.

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

- **K7 + K8 + A1 + A3 ✅ tamamlandı** — detay §13
- **Kalan F5**: Adaptive components v2 progressions + AI test generation hardening (gelecek seans)

---

## §13 Sprint K7 + K8 + GHA-bumps Closure (2026-04-28, seans 2)

**Bu seansda 4 PR ile K7 (dependency triage), K8 (ilk gerçek dep migration), A1 (checkout v6) ve A3 (docker v7) tamamlandı:**

| PR  | Sprint | Konu                                                                                                                             | Merge |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| #43 | K7     | Dependency triage spike + dependabot policy + sprint closure                                                                     | ✅    |
| #45 | K8     | @sentry/react 10.48→10.50 minor + TS workspace convergence (mfe-schema-explorer ~5.7→^5.9.3 real upgrade + 9 manifest alignment) | ✅    |
| #46 | A1     | actions/checkout v4→v6 (7 active workflows)                                                                                      | ✅    |
| #47 | A3     | docker/build-push-action v6→v7 (ci-web-image-push)                                                                               | ✅    |

### Closed dependabot PRs (supersede + obsolete)

| PR  | Konu                         | Sebep                                                                              |
| --- | ---------------------------- | ---------------------------------------------------------------------------------- |
| #3  | actions/checkout 4→6         | Superseded by A1 PR #46 (broader scope, 7 workflow)                                |
| #6  | dev-deps grouped 24 update   | K7 dependabot policy değişti (patch-only grouping); auto-closed                    |
| #9  | ag-charts 12→13              | PINNED — repo kuralı; K7'de dependabot ignore eklendi                              |
| #10 | typescript 5.7→5.9           | Superseded by narrower K8 PR #45 (workspace TS convergence; x-\* `^5.0.0` korundu) |
| #11 | ag-grid 34→35                | PINNED — repo kuralı; K7'de dependabot ignore eklendi                              |
| #16 | @sentry/react 10.50          | Superseded by K8 PR #45 (broader workspace test coverage)                          |
| #20 | docker/build-push-action 6→7 | Superseded by A3 PR #47                                                            |

### Codex MCP istişaresi

threadId `019dd3c3-f710-7583-ab3f-549173f3dbd8`, 3 iter:

1. K8 plan istişaresi (sentry + TS convergence) — REVISE × 2 → AGREE
2. K8 son revize teyit ("patch" → "minor" relabel + exact lockfile resolution asserts) — AGREE
3. Sıradaki sprint plan (A0+A1+A2+A3 split) — REVISE → A0 ertele, A1 önce; A2 A0 sonrası gelir

### Aktif workflow yüzeyi (11 consistency)

11/11 active workflow `checkout@v6` hizalandı (önceki: 4 v4 + 7 mix). `docker/build-push-action@v7` ci-web-image-push'da. `setup-node` + `cache` + `pnpm/action-setup` hâlâ v4 (A2 lane'i; A0 sonrası).

### Sıradaki (gelecek seans)

- **A0**: web-playwright workflow repair (`web/` path archaeology + pnpm v10 alignment + script migration; Codex iter-4 detaylı plan gerekli)
- **A2**: setup-node + cache + pnpm/action-setup install-stack bump (A0 sonrası; supersede #21, #22, #23)
- **K5**: Charts visual baseline (snapshot + advisory→hard gate progression)
- **F5 K3-3**: AI test generation hardening
- **F5 K3-4**: Adaptive components v2 progressions

### K8 lockfile + test verification (kanıt)

```
pnpm install --frozen-lockfile=false  ✓ (4.6s)
pnpm install --frozen-lockfile        ✓ (469ms)
pnpm --filter mfe-schema-explorer exec tsc --noEmit  ✓
pnpm --filter mfe-schema-explorer exec tsc --version ✓ (5.9.3)
pnpm --filter mfe-schema-explorer build              ✓ (190 modules, 474ms)
pnpm --filter mfe-shell test          ✓ (433 pass / 3 skip / 99 files)
pnpm --filter @mfe/i18n-dicts test    ✓ (9 pass)
! rg 'typescript@5\.7\.3' pnpm-lock.yaml             ✓ (TS 5.7 absent)
rg "@sentry/react@10\.50\.0" pnpm-lock.yaml          ✓ (exact resolution)
! rg "@sentry/react@10\.(5[1-9]|[6-9][0-9])"         ✓ (no 10.51+ drift)
```

### A3 post-merge observability

`ci-web-image-push.yml` `push: main` triggered run for commit `6d4c00ba` (A3 merge): IN_PROGRESS at closure time. Önceki 2 main commit (`1480b918` A1, `1671a3f1` K8) SUCCESS. `docker/build-push-action@v7` build path verification post-merge'de devam ediyor.

---

## §14 Sprint A0 + A2 + Storybook + K5 Attempt (2026-04-28, seans 4)

**Bu seansta 3 PR merged + 1 PR DRAFT (K5 blocker):**

| PR  | Konu                                                                             | Sonuç                                                  |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| #49 | A0 web-playwright workflow repair (`web/` path archaeology + pnpm v10 alignment) | ✅ merged `07af3faa`                                   |
| #50 | A2 install-stack bumps (setup-node v6 + cache v5 + pnpm/action-setup v6, 8 wf)   | ✅ merged `6e9aadf6`                                   |
| #51 | Storybook fix (6 stories.tsx parse errors + lint-staged --no-warn-ignored)       | ✅ merged `b4ea36e4`                                   |
| #52 | K5 charts visual baseline                                                        | ⚠️ **DRAFT** — Storybook Vite production build CI hang |

### Closed dependabot PRs (this seans)

| PR  | Konu                     | Sebep                   |
| --- | ------------------------ | ----------------------- |
| #21 | pnpm/action-setup 4 → 6  | Superseded by A2 PR #50 |
| #22 | actions/cache 4 → 5      | Superseded by A2 PR #50 |
| #23 | actions/setup-node 4 → 6 | Superseded by A2 PR #50 |

### Codex MCP istişaresi (extension of `019dd3c3-...` thread)

3 ek iter:

4. A0 detayed plan — REVISE (web-playwright self-hosted job korunmalı, pnpm exec over npx, pw-local kept) → AGREE
5. K5 plan — REVISE (component-isolation, x-charts stories, mevcut **visual** pattern) → AGREE
6. K5 v2 — REVISE (Mac baseline + advisory red CI fake; Linux-first + 2-job split; static Storybook build) → AGREE

### K5 BLOCKER detail (`workflow_dispatch` run `25054093464`)

\`pnpm exec storybook build --output-dir storybook-static\` (Storybook v10.3.5 + builder-vite + 5 addons) **CI'da 25-minute timeout'a kadar hang** oldu. Last log: \`Vite v8.0.7 building client environment for production\` then 24 dakika silence then cancel. Dev mode alternatifi de fail (story başına 1-2 dk lazy compile, page.goto 30s timeout fail).

**Bu blocker K5'i bu seansta tamamlanamaz hâle getirdi.** PR #52 v2 revize content (stories+spec+config+workflow) committed; sadece Linux baseline PNG'leri eksik.

### Açılması gereken sprint: \"Storybook CI build optimization\"

Detay PR #52 yorumunda. Olası rotalar:

1. \`NODE_OPTIONS=--max-old-space-size=4096\` (memory pressure)
2. Addon disable matrix (hangi addon Vite production hang'inin nedeni)
3. Storybook v10 → v9 fallback
4. Storybook dev mode + warm-up wait + persistent server (production build atla)

K5 v3 ancak bu sprint sonuçlandığında devam edebilir.

### Aktif workflow yüzeyi (this seans değişimi)

- A0: web-playwright-{smoke,nightly}.yml — \`web/\` path → root, pnpm v10 alignment
- A2: 8 workflow → \`setup-node@v6\` + \`cache@v5\` + \`pnpm/action-setup@v6\`
- Storybook: \`npm run storybook\` artık çalışıyor (\`http://localhost:6006/\`, 759ms manager + 156ms preview)

### Sıradaki (gelecek seans)

- **Storybook CI build optimization** sprint (K5 önkoşulu)
- Sonrası **K5 v3** (Linux baseline gen + compare-baseline yeşil + merge)
- **F5 K3-3** AI test generation hardening (orta-uzun vade, multi-iter)
- **F5 K3-4** Adaptive components v2 progressions (orta-uzun vade, 2-3 hafta)
- Sprint A: Dark mode polish
- Sprint B: F8 AI Runtime aktive
- Sprint C: F6 Public Docs Portal

---

## §15 Sprint K5 v3 + Storybook Scoped Fix Closure (2026-04-28, seans 5)

**Bu seansda K5 visual baseline blocker'ı çözüldü ve gerçek Linux-baseline ile compare yeşil PR merged:**

| PR  | Konu                                                            | Sonuç                         |
| --- | --------------------------------------------------------------- | ----------------------------- |
| #52 | K5 v1+v2 (full Storybook + Mac baseline)                        | ⛔ closed (superseded by #54) |
| #54 | K5 v3 — scoped Storybook (.storybook-k5) + Linux-first baseline | ✅ merged `978de69f`          |

### Storybook full build hang root cause

§14'te keşfedilen full Storybook build hang (yerel Mac 21+ dk + CI Linux 25 dk timeout) **bu seansda root cause analysis ile gerçek behavior aldı**:

- **Hang noktası**: Vite production "Building preview" phase
- **Yapı**: 5 addons (a11y, docs, themes, onboarding, design-token) + 229 story files + autodocs `'tag'` + reactDocgen `'react-docgen-typescript'`
- **Kanıt**: scoped config (`.storybook-k5/main.ts`) — sadece AllChartTypes story, zero addons, autodocs+docgen kapalı — **yerel 1.23s + CI <2 dk** build
- **Tek değişken**: scope. Stories sayısı 229 → 1, addons 5 → 0, docgen on → off. Yapısal sorun ya 229 story import graph üzerinde rolldown deadlock'u, ya bir addon'un Vite plugin'i, ya da react-docgen-typescript devasa scope'ta inifinite loop.

Full Storybook hang RCA **devam ediyor (ayrı sprint)**; bu seans sadece K5'i unblock'ladı.

### K5 v3 yapısı

1. **`.storybook-k5/main.ts`** (NEW) — minimal Storybook config:
   - Stories: yalnızca `packages/x-charts/src/__stories__/AllChartTypes.stories.tsx`
   - Addons: `[]`
   - `autodocs: false`, `reactDocgen: false`, `tags: []`
   - `viteFinal` alias: `@mfe/design-system` → `packages/design-system/src/index.ts` (x-charts peerDep çözümü)

2. **`.github/workflows/x-charts-visual-gate.yml`** (NEW) — 2-job split:
   - `compare-baseline` (pull_request): scoped Storybook build → Playwright compare against committed Linux baseline. Advisory mode (continue-on-error).
   - `generate-baseline` (workflow_dispatch only): scoped build → `--update-snapshots` → upload `x-charts-linux-baseline` artifact (30d retention). Maintainer downloads and commits.

3. **`packages/design-system/playwright.config.ts`** — env-based webServer:
   - `PW_STORYBOOK_STATIC_DIR=storybook-static-k5` → `python3 -m http.server 6006`
   - Fallback: `npm run storybook` (default dev mode for local work)

4. **`packages/design-system/src/__visual__/x-charts.visual.ts`** (NEW) — 13 chart visual tests:
   - `test.setTimeout(120_000)` (config global 30s yetiyor değil)
   - `page.emulateMedia({ reducedMotion: 'reduce' })` BEFORE goto (ECharts animation kapatma)
   - `waitForFunction` canvas/svg geometry > 0 readiness signal

5. **`packages/x-charts/src/__stories__/AllChartTypes.stories.tsx`** — VisualBox wrappers:
   - 640x360 fixed container
   - `data-testid="x-charts-{name}"` deterministic locator

### Linux baseline (CI artifact)

- `gh workflow run x-charts-visual-gate.yml --ref claude/k5-v3-scoped-storybook -f mode=baseline`
- generate-baseline run `25064334940` ✅ success
- `gh run download 25064334940 -n x-charts-linux-baseline -D /tmp/k5-linux-baseline`
- 13 PNG artifact (288 KB) → committed to repo `60bfbc55`
- Mac vs Linux PNG boyut diff confirmed (~1-9% pixel-level): bar-chart Mac 8363b → Linux 7590b
- Mac baseline source DEĞİL (Codex kuralı: same platform produces and consumes baseline)

### Compare-baseline gerçek green (NOT fake)

- compare-baseline run `25064629080` (push tetikli, Linux baseline commit'inden sonra)
- Job: success
- Step 'Compare against committed baseline': **success**
- 13 chart × 1 PNG, Linux build vs Linux baseline = pixel match
- Advisory mode (continue-on-error: true) yine de yeşil — gerçek regression koruması işliyor

### Gerçek doğrulama özeti (fake test değil)

| Adım                                         | Sonuç                                        | Süre  |
| -------------------------------------------- | -------------------------------------------- | ----- |
| Yerel scoped Storybook build                 | ✅ 3086 modules, iframe.html + 4.5 MB bundle | 1.23s |
| Yerel snapshot baseline (--update-snapshots) | ✅ 13 passed                                 | 4.1s  |
| Mac PNG'leri DELETE before commit            | ✅ (fake-baseline değil)                     | —     |
| CI generate-baseline workflow_dispatch       | ✅ 13 PNG artifact uploaded                  | <5dk  |
| `gh run download` Linux artifact             | ✅ 288 KB, 13 PNG                            | —     |
| Linux baseline commit + push                 | ✅ `60bfbc55`                                | —     |
| CI compare-baseline (push retrigger)         | ✅ step success                              | <5dk  |
| PR #54 8/8 CI checks (advisory + standard)   | ✅ MERGEABLE                                 | —     |
| Merge                                        | ✅ `978de69f`                                | —     |

### Codex MCP iter-7 consensus

threadId `019dd3c3-f710-7583-ab3f-549173f3dbd8` — REVISE absorbed:

- ✓ Full Storybook hang RCA separate (K5 bloke etmesin)
- ✓ Scoped Storybook config (no addons, no docgen, single story)
- ✓ Positive bisect (boş'tan başla, ekle)
- ✓ viteFinal alias for @mfe/design-system peerDep
- ✓ 2-job split (generate workflow_dispatch + compare PR)
- ✓ Linux baseline workflow_dispatch + artifact + commit
- ✓ Mac baseline NEVER source

### Bu seans toplam

- **K5 v3 PR #54 merged** (Linux baseline + scoped Storybook + advisory CI gate working)
- PR #52 closed (superseded)
- Full Storybook hang RCA: scope-narrowed (229 stories + addons + docgen yapısal sorun) — ayrı sprint

### Sıradaki

- **K5 hard gate** (1-2 hafta baseline soak sonrası `continue-on-error: false`)
- **K5 browser matrix** (firefox + webkit projelerini ekle)
- **Composite chart snapshots** (ChartDashboard + KPICard + DrillDown stories)
- **Full Storybook hang RCA** ayrı sprint (`--debug-webpack`, addon disable matrix, react-docgen tuning)
- **F5 K3-3** AI test generation hardening
- **F5 K3-4** Adaptive components v2 progressions
- Sprint A/B/C/D, K9/K10, M4/M5, W3/W5/W6/W7/W8 (uzun vade)

---

## §16 K5 Tamamlama Sprint'i — Hard Gate + Browser Matrix + Composite (2026-04-28, seans 6)

**3 PR merged ile K5 visual baseline ailesi tamamlandı:**

| PR  | Konu                                                                | Sonuç                |
| --- | ------------------------------------------------------------------- | -------------------- |
| #56 | K5 hard gate (continue-on-error: true → false)                      | ✅ merged `3bb81e13` |
| #57 | K5 browser matrix (chromium + firefox + webkit, 39 PNG)             | ✅ merged `877ad6c3` |
| #58 | K5 composite snapshots (KPICard 3 + ChartDashboard 2, 54 PNG total) | ✅ merged `f1cf5148` |

### K5 ailesi nihai durumu

| Boyut                  | Detay                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Story coverage         | 18 stories: 13 atomic charts + 5 composite (KPICard 3 + ChartDashboard 2)                |
| Browser matrix         | desktop-light (Chrome) + desktop-firefox + desktop-webkit (Safari)                       |
| Total baseline         | 18 stories × 3 browsers = **54 PNG** (~1 MB)                                             |
| Gate mode              | **HARD** — visual regression PR merge'i bloklar                                          |
| Recovery               | `gh workflow run x-charts-visual-gate.yml -f mode=baseline` + artifact download + commit |
| Excluded (intentional) | DrillDownDemo + CrossFilterDemo (interactive state machines, deterministic değil)        |

### Determinism stack

- `.storybook-k5/main.ts` — minimal scoped config (3 stories, 0 addons, no docgen)
- `viteFinal alias` for `@mfe/design-system` (x-charts peerDep çözümü)
- VisualBox wrapper: fixed-size container + `data-testid` hook (her story dosyasında)
- `hasChartSurface` flag — DOM-only stories (StatWidgets, KPICard Default/WithTrend) canvas/svg geometry guard'ını skip eder
- `page.emulateMedia({ reducedMotion: 'reduce' })` BEFORE goto + CSS `transition: none; animation: none`
- 1s settle + maxDiffPixelRatio: 0.02

### CI infrastructure

- 2 job split: `compare-baseline` (PR, hard gate) + `generate-baseline` (workflow_dispatch only, baseline regen aracı)
- Storybook static build (scoped) <2 dk CI'da (vs full Storybook 25 dk timeout hang)
- Playwright 3 browser (chromium + firefox + webkit) install --with-deps
- Linux baseline only (Mac PNG kaynak DEĞİL)

### Bu sprint'in kanıt-zinciri (fake test değil)

| Adım                       | Run/Commit      | Sonuç                                                |
| -------------------------- | --------------- | ---------------------------------------------------- |
| K5 hard gate compare       | run 25064629080 | ✅ Step 'Compare against committed baseline' success |
| K5 browser matrix generate | run 25066426189 | ✅ 39 PNG artifact upload                            |
| K5 browser matrix commit   | `ea9e3393`      | ✅                                                   |
| K5 browser matrix compare  | post-push run   | ✅ 8/8                                               |
| K5 composite generate      | run 25067613466 | ✅ 54 PNG artifact upload                            |
| K5 composite commit        | `69d9e0d2`      | ✅                                                   |
| K5 composite compare       | post-push run   | ✅ 8/8 hard gate green                               |

### Sıradaki

- **Full Storybook hang RCA** (ayrı sprint, multi-iter): `--debug-webpack` log + addon disable bisect (suspect order: react-docgen-typescript, storybook-design-token, addon-docs)
- **M4 story coverage %95** (deadline 2026-05-03, 5 gün): 33 story eklemek gerek (multi-saat)
- **F5 K3-3** AI test generation hardening (multi-iter)
- **F5 K3-4** Adaptive components v2 progressions (2-3 hafta)
- Sprint A/B/C/D, K9/K10, W3-W8 (uzun vade)

---

## §17 Storybook Full Build Green Sprint (2026-04-28, seans 7)

**3 PR ile Storybook full build hang investigation TAMAMLANDI** — 21+ dk hang yerine 9 saniye build.

| PR  | Konu                                                                      | Sonuç                |
| --- | ------------------------------------------------------------------------- | -------------------- |
| #60 | Storybook RCA Phase 1+2 (addons confirmed as cause)                       | ✅ merged            |
| #61 | Storybook RCA Phase 3 + 3 story bug fixes (design-token + 4 import paths) | ✅ merged `c9fa0777` |
| #62 | Storybook full build green (\`@storybook/test\` rename + viteFinal alias) | ✅ merged `3a66326b` |

### Investigation timeline (multi-PR)

| Phase | Test                                                           | Yerel                                         | CI            | Bulgu                            |
| ----- | -------------------------------------------------------------- | --------------------------------------------- | ------------- | -------------------------------- |
| 1     | Full config (5 addons + 229 stories + autodocs + react-docgen) | 36+ dk hang                                   | 25 dk timeout | Yapısal hang                     |
| 2     | Zero addons                                                    | ✅ build                                      | —             | Addon family is the cause        |
| 3.1   | \`storybook-design-token\` only                                | 26+ dk hang                                   | —             | design-token suspect             |
| Fix-1 | design-token kaldır                                            | 7s fail (4 import bug)                        | —             | path bug'lar revealed            |
| Fix-2 | Path düzelt                                                    | 7s fail (1 missing export)                    | —             | SidebarProvider broken decorator |
| Fix-3 | SidebarProvider kaldır                                         | 9s fail (1 unresolved \`@mfe/design-system\`) | —             | x-charts peerDep alias gerek     |
| Fix-4 | viteFinal alias + \`@storybook/test\` rename                   | **✅ 9s success**                             | —             | **TAM ÇÖZÜM**                    |

### Root cause özeti (4 katmanlı)

1. **\`storybook-design-token\` addon (PR #61)** — Vite plugin Storybook 10 + builder-vite 8 + rolldown 1.0 ile deadlock yapıyor 229-story scope üzerinde. Addon Storybook 10 için unmaintained. Tokens runtime'da yine render edilir; sadece docs panel kayıp.

2. **Path bug'lar (PR #61)** — \`ShellHeader.stories.tsx\`, \`ShellSidebar.stories.tsx\` relative import path'leri yanlıştı (\`../X\` → \`./X\`). Storybook 9'dan migration kalıntısı.

3. **\`@storybook/test\` deprecated (PR #62)** — Storybook 10'da test utilities \`@storybook/test\` yerine \`storybook/test\` (no @ prefix) altında. 11 app-sidebar story'sinde stale import.

4. **\`@mfe/design-system\` peerDep (PR #62)** — \`x-\*\` paketleri \`@mfe/design-system\`'i peerDependency olarak bildiriyor (\`cn\`, \`Spinner\`, \`Text\` için). Storybook ana config'de alias yoktu. Aynı sorun K5 v3'te scoped config'le çözülmüştü; root config'e de aynı alias eklendi.

### Verification

\`\`\`bash
$ pnpm exec storybook build
┌ Building storybook v10.3.5
│
● Building preview..
│ Vite v8.0.7 building client environment for production...
│ ✓ 3132 modules transformed
│ Vite ✓ built in 4.08s
│
└ Storybook build completed successfully

# Total 9 seconds (vs 21+ minute hang).

\`\`\`

### Bu seansda toplam 7 PR

| PR  | Konu                                            |
| --- | ----------------------------------------------- |
| #56 | K5 hard gate                                    |
| #57 | K5 browser matrix (39 PNG, 3 browser)           |
| #58 | K5 composite (54 PNG, KPICard + ChartDashboard) |
| #59 | ROADMAP §16 closure                             |
| #60 | Storybook RCA Phase 1+2                         |
| #61 | Storybook RCA Phase 3 + 3 bug fix               |
| #62 | Storybook full build green                      |

### Sıradaki

- F5 K3-3 AI test generation hardening (multi-iter, 1-2 hafta)
- F5 K3-4 Adaptive components v2 progressions (2-3 hafta)
- Sprint A/B/C/D, K9/K10, W3-W8 (uzun vade)
- Süreç boşlukları (mfe-suggestions stub, manifest auto-update, vs.)

---

## §18 M4 Story Coverage %95 Sprint (2026-04-28, seans 8)

### Hedef

`docs/quality-sprint/project.manifest.v1.json` M4 DoD:

- 33 eksik story tamamlanmış
- storyCompleteness ortalaması ≥ 95
- Her story: en az 2 variant (default + edge case)

Deadline: 2026-05-03 (5 gün). Initial state: avg 89.8, 5 ZERO + 6 LOW component, 90 component <95.

### Strateji

İki paralel track:

1. **Scoring algorithm bug fix** — 2 bağımsız bug `packages/design-system/scripts/ci/component-scorecard.mjs:scoreStory`
2. **Story enrichment** — 11 critical component (5 ZERO + 6 LOW) → 100 score

### Track 1 — Scoring Algorithm Bug Fix

**Bug A (subdir tarama)** — `scoreStory` 1-level subdir scan ediyordu, ama 5 component (`advanced/data-grid/filter-builder/Filter*Row.stories.tsx`) 2-level deep idi → `0` score (false negative, story var ama bulunamıyor).

Fix: `findStoryFileRecursive(rootDir, name, maxDepth=4)` — recursive walk, `__tests__` ve `node_modules` skip.

**Bug B (`storyExports - 1`)** — `storyExports = matches.length - 1` "for meta" diyordu, ama 214/214 story `const meta` (no export); regex `export\s+const\s+\w+` zaten meta'yı yakalamıyor. `-1` her stories'i 6 puan eksik veriyordu.

Fix: `-1` kaldırıldı.

Kazanım: 89.8 → **92.75** (+2.95) — pure metric correction (bug fix), artificial inflation değil.

### Track 2 — 11 Critical Component Story Enrichment

**5 ZERO** (advanced/data-grid/filter-builder/):

| Component           | Önce | Sonra | Eklenen                                     |
| ------------------- | ---- | ----- | ------------------------------------------- |
| FilterBuilderPanel  | 0→42 | 100   | 6 export, argTypes, decorator, play (Apply) |
| FilterCombinatorRow | 0→52 | 100   | 5 export, argTypes, play (AND/VEYA toggle)  |
| FilterConditionRow  | 0→52 | 100   | 6 export, argTypes, play (column dropdown)  |
| FilterGroupNode     | 0→52 | 100   | 6 export, argTypes, play (Add rule btn)     |
| FilterValueEditor   | 0→70 | 100   | 7 export, argTypes, play (text input)       |

**6 LOW** (mid score 36-52):

| Component          | Önce  | Sonra | Eklenen                                                          |
| ------------------ | ----- | ----- | ---------------------------------------------------------------- |
| GroupedCardGallery | 36→42 | 100   | 6 export, argTypes, decorator, play (debounce search)            |
| HoverDescription   | 42→48 | 100   | 6 export, argTypes, decorator, play (portal hover)               |
| FullscreenToggle   | 42→48 | 100   | 6 export, argTypes, decorator, play (FS API stub)                |
| ShellHeader        | 42→48 | 100   | 6 export, argTypes, decorator, play ([data-active])              |
| ShellSidebar       | 46→52 | 100   | 6 export, argTypes, decorator, play (button branch+aria-current) |
| GallerySearchBar   | 46→52 | 100   | 6 export, argTypes, decorator, play (clear button)               |

ShellSidebar ek bonus: mevcut story `currentPath` (yanlış API) kullanıyordu → `activeKey`'e düzeltildi (types.ts ile uyumlu).

### Codex Adversarial Iter

**Iter 1 — PARTIAL**: 4 play function smoke-test seviyesinde (ShellSidebar/FullscreenToggle/ShellHeader/GroupedCardGallery). Real interaction değil.

**Iter 2 — REVISE**: 3 blocker tespit edildi:

- ShellSidebar: NAV_ITEMS `href` içeriyor → AppSidebarNavItem anchor branch render → `onClick` bağlanmaz → `onNavigate` çalışmaz
- GroupedCardGallery: `findByText('Bordro Raporu')` immediate resolve → 300ms debounce beklenmeyen
- FullscreenToggle: `document.fullscreenElement` descriptor restore yok → leak

**Iter 3 — AGREE**: 3 blocker fix edildi:

- ShellSidebar Interactive: `CLICKABLE_NAV` lokal definition (href'siz) → button branch → `userEvent.click` → `aria-current="page"` assert
- GroupedCardGallery: `waitFor(() => Gelir Tablosu yok, timeout: 1500)` ile debounce'u dolaylı ama doğru bekleme
- FullscreenToggle: `Object.getOwnPropertyDescriptor` save → try/finally restore (test isolation)

### Sonuç

| Metric                    | Önce  | Sonra     | Δ         |
| ------------------------- | ----- | --------- | --------- |
| storyCompleteness avg     | 89.8  | **95.21** | **+5.41** |
| ZERO score component      | 5     | 0         | -5        |
| LOW score (<50) component | 6     | 0         | -6        |
| 11 target component       | mixed | 11×100    | —         |
| Component count           | 218   | 218       | 0         |

**Metric correction breakdown:**

- 89.8 → 92.75 (+2.95) — scoring fix (real bug, not inflation)
- 92.75 → 95.21 (+2.46) — actual content enrichment (11 component → 100)

### Verification

```bash
# Scorecard
$ node packages/design-system/scripts/ci/component-scorecard.mjs --json
avg storyCompleteness: 95.21
total: 218

# Storybook full build
$ npx storybook build --config-dir .storybook
└ Storybook build completed successfully (exit 0, ~9s)
```

### Supplementary — fake test risk closure (PR #65 + #66)

Kullanıcı feedback: PR #64 doğrulamasında "fake bir işlem istemiyorum" — Storybook
build (compile) play function'ları çalıştırmaz, "çalıştırılmayan test → YASAK"
(CLAUDE.md HARD RULE).

**PR #65** (`test(quality): m4 play function runtime verification`):

- `packages/design-system/src/__tests__/m4-play-verify.test.tsx` — vitest +
  `composeStories` (Storybook 10 API) ile 11 stories'in `Interactive` variant'ında
  `Interactive.run()` çağırarak play function'ı runtime'da koşturuyor.
- İlk deneme 11/11 FAIL: `render() + Interactive.run()` çakışması, "NotFoundError".
- Düzeltme: `Interactive.run()` kendi render'ını yapıyor, manuel render kaldırıldı.
- Lokal: **11/11 passed, 1.04s**.

**PR #66** (`ci(quality): m4 play function runtime verification step`):

- `.github/workflows/ci-web-check.yml` job sonuna step eklendi:
  `pnpm --filter @mfe/design-system exec vitest run src/__tests__/m4-play-verify.test.tsx`
- **Hard-block** — vitest fail → workflow fail → PR mergeable değil.
- Self-validating PR: kendi step'inin diff'i kendi CI run'ında koştu.
- CI ubuntu-latest: **11/11 passed, 2.09s** (lokal + CI iki kanıt).

Sonuç: M4 closure artık compile-only değil, **lokal + CI runtime-doğrulanmış**.

### Bu seansın 3 PR'ı

| PR  | Konu                                                               |
| --- | ------------------------------------------------------------------ |
| #64 | M4 story coverage 95% — scoring fix + 11 component enrichment      |
| #65 | M4 play function runtime verification (11 stories, lokal kanıt)    |
| #66 | CI vitest step — regression check otomatik (lokal + CI çift kanıt) |

### Sıradaki

- F5 K3-3 AI test generation hardening (multi-iter, 1-2 hafta)
- F5 K3-4 Adaptive components v2 progressions (2-3 hafta)
- M5 Quality Gate Escalation (deadline 2026-06-30, M2 dependency)
- M2 A11y Compliance Gate (deadline 2026-05-03, K1-M2a PR #38 ile gate aktif;
  manifesto status refresh + 58 component a11y test M5 backlog'una taşıma gerekli)
- Sprint A/B/C/D, K9/K10, W3-W8 (uzun vade)
- Süreç: lokal worktree git db desync (`mcp__ccd_session__spawn_task` chip ile takip)

---

## §19 Faz 21.4 — x-charts CONTRACT v2 enforcement (audit-driven, 2026-04-30)

> Kaynak: Claude session 2026-04-30 audit + paralel Explore agent denetimi.
> Bağlam: F4 ✅ DONE (2026-03-24) ⊃ x-charts mevcut. **CONTRACT v2** (2026-04-11)
> F4'ün üstüne "world-class" üst standart koydu (§8 CI gates DoD, §1
> ChartTooltip, §3 AccessControlledProps). Faz 21.4 PR-A→PR-F sürecinde
> bu standartlar **2026-05-03 itibarıyla tamamen aktif**: §8 8/8 CI gate
> hard-block, §1 ChartTooltip rationale documented (v2.1 removed),
> §3 AccessControlledProps 13 chart wrapper'a wired (PR-E2 #166).
> F4 minimum DoD korundu, world-class katman eklendi.

### Audit findings (2026-04-30)

**Implemented (16/20 critical features):** crossfilter (16-file store + 6 test),
drill-down (state machine + breadcrumb), brush selection, zoom/pan, animation
(prefers-reduced-motion'a saygılı), 4 tema (light/dark/HC/print), export
(PNG/SVG/PDF/CSV — XLSX removed in Faz 21.8 PR-X1, see plan), a11y (keyboard, data-table fallback, aria-live, decals,
colorblind palettes), real-time stream, responsive resize, sanitization,
density, AI integration (NL→ChartSpec, anomaly, trend, suggestion, description),
grid adapter (AGGrid bridge), performance (LTTB downsample, worker bridge,
progressive/lazy render, LRU cache), i18n (ECharts locale), touch gestures,
plugin registry, dashboard composition, collaboration (sharing, annotation,
offline cache).

**Gaps (CONTRACT v2 vs reality, 2026-04-30; reconciled with v2.1 changelog 2026-05-03 PR-E1):**

| Gap                                                   | CONTRACT ref                               | Severity                              |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| `ChartTooltip` standalone component                   | §1 line 57-59 (v2.1 removed)               | RESOLVED                              |
| `AccessControlledProps` integration                   | §3 line 108-112 (v2.1 deferred to Phase 2) | PHASE 2                               |
| Interactive legend (click-to-hide series)             | §1 ChartLegend                             | HIGH                                  |
| 8/8 CI gates not active                               | §8                                         | MEDIUM                                |
| 13/13 chart components — zero unit tests              | §8 test exit criteria                      | MEDIUM (PR-D #103, PR-D2 #164 closed) |
| Design Lab Playground = SVG `ChartPreviewPlaceholder` | UX (HARD RULE No Fake Work)                | CRITICAL                              |

**Rows 1-2 reconciled by PR-E1 (Faz 21.4 contract-debt closure, 2026-05-03):**
The 2026-04-30 audit flagged these as CRITICAL based on the v2 contract.
CONTRACT v2.1 (also 2026-04-30) had already removed `ChartTooltip` from §1
("would have duplicated that surface for no gain") and explicitly deferred
`AccessControlledProps` to "Phase 2 — pending integration", tracked in
`docs/x-charts-ui-ux-tracker.md`. The audit row above was stale because it
referenced `§1 line 57-59` and `§3 line 108-112` of the v2 contract. With
v2.1 these are intentional gaps, not regressions. PR-E1 closes the
documentation debt: ChartTooltip rationale is recorded in `CONTRACT.md §1.0`
and the access-control vocabulary is relocated to `@mfe/shared-types`
(prerequisite for PR-E2 wiring).

**Design Lab playground reality:** 37 chart route'u var (`/admin/design-lab/charts/*`) — PR-A→PR-B4 ile 29 route, PR-B (#169) +3 (drill-down + drill-down-history + cross-filter-grid), PR-C (this PR) +5 feature demos (brush + zoom/pan + realtime + theme-switch + export),
ama Playground tab'i SVG mock gösteriyordu — toggle'lar render'a yansımıyordu.
`ChartPreviewPlaceholder` fonksiyonu chart.id'ye göre 6 farklı SVG variant
döndürüyor (geri kalan 7 chart "default bar" görselli — yanlış görsel).
Ayrı feature demo'ları (Brush, Zoom/Pan, Real-time, Theme-switch, Export) yok.
Storybook tarafında sağlam: `__stories__/AllChartTypes.stories.tsx` 13 chart
için real render + mock data; `CrossFilterDemo.stories.tsx` + `DrillDownDemo.stories.tsx`
linked-charts + drill-down demo'su.

### PR plan (6 commits, ~24-30 saat total)

| PR     | Scope                                                                                                                                                           | Effort | Depends      | Status                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | --------------------------------------------------------------- |
| **A**  | Design Lab live render (13 chart, fake SVG → real x-charts, toggle forwarding)                                                                                  | 2h     | —            | ✅ PR [#91](https://github.com/Halildeu/platform-web/pull/91)   |
| **B**  | Design Lab live demo — PR-A→B4 landed 11 routes (1 cross-filter + 5 AI + 5 perf); PR-B added 3 (drill-down + drill-down-history + cross-filter-grid) → 32 total | 3-4h   | A            | ✅ PR [#169](https://github.com/Halildeu/platform-web/pull/169) |
| **C**  | Feature-demo pages — 5 isolated feature demos (brush, zoom/pan, realtime, theme-switch, export); 32 → 37 routes — closes Faz 21.4 §19                           | 4-6h   | A            | in progress (this PR)                                           |
| **D**  | 13 chart × smoke + series.type contract                                                                                                                         | 4-6h   | — (parallel) | ✅ PR [#103](https://github.com/Halildeu/platform-web/pull/103) |
| **D2** | 13 chart × deeper option-shape mutation tests (data fidelity, prop toggles, rerender)                                                                           | 3-4h   | D            | ✅ PR [#164](https://github.com/Halildeu/platform-web/pull/164) |
| **E1** | Contract-debt closure (ROADMAP reconcile + ChartTooltip rationale doc + AccessControlledProps relocation to `@mfe/shared-types`)                                | 1-2h   | — (parallel) | ✅ PR [#165](https://github.com/Halildeu/platform-web/pull/165) |
| **E2** | `AccessControlledProps` integration across 13 chart wrappers + auth `useZanzibarAccessProps` hook + Bar 4-state matrix test                                     | 3-4h   | E1           | ✅ PR [#166](https://github.com/Halildeu/platform-web/pull/166) |
| **F1** | Quality gate wiring — visual rename + axe + contrast + tree-shake (descriptor-driven) + sideEffects allowlist                                                   | 3-4h   | — (parallel) | ✅ PR [#167](https://github.com/Halildeu/platform-web/pull/167) |
| **F2** | Bundle size gate — esbuild source analyze (dual metric: wrapperOnly soft, contractTotal HARD)                                                                   | 2-3h   | F1           | ✅ PR [#168](https://github.com/Halildeu/platform-web/pull/168) |
| **F**  | **8/8 CI gate aktivasyonu COMPLETE** — F1+F2 birlikte 8 gate hard-block (7 in `x-charts-quality-gates.yml` + visual in `x-charts-visual-gate.yml`)              | 4-8h   | — (parallel) | ✅ COMPLETE (Faz 21.4 son PR)                                   |

### Linked artifacts

- **PR-A landed**: [#91](https://github.com/Halildeu/platform-web/pull/91) — feat(faz-21-4-a) Design Lab live x-charts (Storybook fixture port; 13 chart.id switch; toggle forwarding; placeholder removed)
- **PR-B v1 landed**: [#95](https://github.com/Halildeu/platform-web/pull/95) — KPICard / SparklineChart / ChartDashboard
- **PR-B2 landed**: [#99](https://github.com/Halildeu/platform-web/pull/99) — CrossFilter / chart-container / chart-toolbar + 21 mutation-aware test
- **PR-B3 landed**: [#100](https://github.com/Halildeu/platform-web/pull/100) — 5 AI hook live demos + 12 mutation-aware test
- **PR-B4 landed**: [#101](https://github.com/Halildeu/platform-web/pull/101) — 5 perf utility live demos + 12 mutation-aware test (B-series ⇒ **29/29 routes live**)
- **PR-G doc**: `docs/x-charts-ui-ux-tracker.md` — 13 chart × 8 dimension scorecard, per-chart action items, Faz 21.5 lift roadmap
- `packages/x-charts/CONTRACT.md` v2 (2026-04-11) — API kontratı + §8 CI gates DoD
- `packages/x-charts/src/__stories__/AllChartTypes.stories.tsx` — visual regression + Design Lab fixture source-of-truth
- `docs/01-architecture/f4-enterprise-x-suite/phase-gate-definitions.md` — F4 DoD
- `packages/design-system/docs/PLATFORM-ROADMAP.md` — X-Suite mimarisi

### F4 vs CONTRACT v2 ilişki (özet)

F4 ✅ DONE = "10+ chart type, theme-aware" (PLATFORM-ROADMAP §374) tamamlandı
sayılır ve doğrudur — 13 chart + 4 theme + crossfilter + drill-down mevcut.
**CONTRACT v2 (2026-04-11) F4 done'undan SONRA çıktı** ve daha yüksek bir
standart koydu: per-chart unit test exit criteria, 8 CI gate, ChartTooltip
standalone API, AccessControlledProps integration. Faz 21.4 = bu CONTRACT v2'yi
enforce + Design Lab playground'un fake-work durumunu çözme. F4 base'inin
üstüne "world-class" enforcement katmanı.

---

_Bu konsolidasyon dokümanı 2026-04-28'de oluşturuldu, aynı gün Codex denetimi sonrası §1-§8 revize edildi, §11 denetim izi olarak eklendi, §12 K1+K2+K3, §13 K7+K8+GHA, §14 A0+A2+Storybook+K5-attempt, §15 K5-v3+Storybook-scoped-fix, §16 K5-tamamlama (hard gate + browser matrix + composite), §17 Storybook-full-build-green (RCA chain tamamlandı), §18 M4 story coverage %95 (scoring fix + 11 critical component enrichment, Codex 3-iter AGREE; PR #65 + #66 ile fake-test risk runtime-doğrulanmış kapatıldı), §19 Faz 21.4 x-charts CONTRACT v2 enforcement (audit-driven 2026-04-30; PR-A #91, PR-B v1 #95, PR-B2 #99, PR-B3 #100, PR-B4 #101 — **29/29 Design Lab route live**; **PR-D #103 + PR-D2 #164 + PR-E1 #165 + PR-E2 #166 + PR-F1 #167 + PR-F2 #168 — Faz 21.4 COMPLETE 2026-05-03**; PR-G UI/UX tracker doc landed) closure log eklendi._
