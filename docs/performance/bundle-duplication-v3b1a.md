# V3-B1a — Cross-MFE Bundle Duplication Analizi (7-MFE LIVE)

> **Belge tipi**: Bulgu raporu (findings)
> **Scope**: PERF-INIT-V2.1 V3-B1a — Bundle taxonomy 7-MFE LIVE
> **Tarih**: 2026-05-17
> **Önceki**: `bundle-taxonomy.md` (PR-A0 runbook — mfe-shell canary)
> **Build**: `main` @ `356babf6`, `ANALYZE_BUNDLE=1`, 7 MFE

---

## 1. Bağlam

PR-A0 (`bundle-taxonomy.md`) duplicate-analyzer altyapısını kurdu ama
`bundleVisualizer` Vite plugin'ini yalnız **mfe-shell** canary'sine bağladı.
O belgenin §9 bilinen-sınır #1'i diyordu: _tek MFE'de cross-MFE duplicate
listesi boş çıkar; diğer 7 MFE integration sonraki PR'da_.

V3-B1a bu entegrasyonu tamamlar:

- 6 kalan MFE'ye (`reporting`, `suggestions`, `ethic`, `access`, `audit`,
  `users`) `bundleVisualizer({ mfeName })` plugin'i bağlandı — env-gated,
  `ANALYZE_BUNDLE` kapalıyken `[]` döner (prod build'e sıfır etki).
- `duplicate-package-detector.mjs` artık 7-MFE cross-MFE raporunu LIVE üretir.

---

## 2. Yöntem

```bash
# Tek komut: bundle-stats temizler, 7 MFE'yi ANALYZE build eder, detector koşar.
npm run bundle:analyze:all
```

`bundle:analyze:all` `rimraf tests/perf/bundle-stats` ile **temiz** başlar
(stale stats karışmaz), 7 MFE'yi `npm-run-all --parallel --continue-on-error`
ile build eder, sonra detector'ı `--require-mfes` ile koşar — 7 MFE'den biri
eksikse **exit 1** (eksik/stale tarama "7-MFE LIVE" sanılmaz).

`build:shell` `ANALYZE_BUNDLE` altında §4'teki `mf-preload` audit'inde exit 1
verir; `bundleVisualizer` `generateBundle`'ı önce koştuğu için stats.json yine
yazılır, `--continue-on-error` diğer 6 build'i sürdürür, detector ayrı adımda
(`;`) koşar.

Çıktı: `tests/perf/bundle-stats/<mfe>/stats.json` (7 adet) + `duplicates.json`.

### 2.1 Detector size-extraction bug fix

İlk detector çalıştırması **her paket için 0 KB** raporladı (`excess total:
0 KB`). Kök neden: `rollup-plugin-visualizer` v5 (`version: 2`) raw-data
şemasında `nodeMetas` (metaUid-keyed) ile `nodeParts` (partUid-keyed)
**disjoint keyspace** kullanır. Eski `parseStats` boyut için
`nodeParts[metaUid]` lookup yapıyordu — bu anahtar hiçbir zaman çözülmez →
her boyut 0.

Fix: bir modülün boyutu = `meta.moduleParts` ({ chunkFile: partUid })
içindeki her `partUid` için `nodeParts[partUid].renderedLength` toplamı.
Codex thread `019e1e34` daha önce _path_ lookup'ını (`meta.id`) düzeltmişti;
bu fix _size_ lookup'ını düzeltir. (V3-B2 dersi tekrar: figüre güvenme,
doğrula — burada figür sessizce sıfırdı.)

---

## 3. Bulgular

### 3.1 Per-MFE toplam bundle

`stats.json` `nodeParts` renderedLength / gzipLength toplamı:

| MFE                |      rendered |       gzip\* |
| ------------------ | ------------: | -----------: |
| mfe-shell          |      40.64 MB |      9.33 MB |
| mfe-users          |      20.49 MB |      4.68 MB |
| mfe-access         |      20.46 MB |      4.68 MB |
| mfe-audit          |      18.86 MB |      4.33 MB |
| mfe-reporting      |      20.90 MB |      4.81 MB |
| mfe-ethic          |      21.66 MB |      4.88 MB |
| mfe-suggestions    |      21.66 MB |      4.88 MB |
| **Toplam (7 MFE)** | **164.66 MB** | **37.60 MB** |

\* gzip = per-module `gzipLength` toplamı — gerçek chunk gzip'inin **üst
sınırı** (gzip büyük blob'da daha iyi sıkışır). Kesin transfer rakamı için
`bundle-taxonomy.mjs` route-level (wire) ölçümü ayrı kanıttır.

### 3.2 Cross-MFE duplicate — top paketler

`rendered KB`, `S` = MF shared scope'ta:

| pkg                  | MF? |   per-MFE | mfeCount | excess KB |
| -------------------- | :-: | --------: | :------: | --------: |
| ag-charts-community  |  ·  |      3525 |    7     |     21149 |
| ag-charts-enterprise |  ·  |      2735 |    7     |     16412 |
| ag-grid-community    |  S  | 1855–3472 |    7     |     13888 |
| ag-grid-enterprise   |  S  | 1671–3229 |    7     |     12747 |
| echarts              |  ·  |      1603 |    7     |      9617 |
| echarts-gl           |  ·  |       600 |    7     |      3599 |
| claygl               |  ·  |       440 |    7     |      2637 |
| zrender              |  ·  |       384 |    7     |      2306 |
| react-router         |  S  |      ~363 |    7     |      2187 |
| axios                |  ·  |       174 |    7     |      1043 |
| ag-charts-core       |  ·  |       157 |    7     |       943 |
| lucide-react         |  ·  |   931 / 9 |    5     |       774 |

### 3.3 Ana bulgu — chart kütüphaneleri 7× duplike

`ag-charts-community/enterprise/core` + `echarts`/`echarts-gl`/`claygl`/
`zrender` ailesi **MF shared scope'ta DEĞİL** ve **her MFE'de byte-identical
tam kopya** olarak yer alıyor:

- Per MFE: **~9.2 MB rendered / ~2.2 MB gzip** chart kodu.
- 7 MFE toplam: **~64.6 MB rendered / ~15.1 MB gzip** — yani 7-MFE toplamının
  ~%39 rendered / ~%40 gzip'i tek bir duplike chart stack'i.
- Singleton/lazy olsaydı tahmini tasarruf: **~55 MB rendered / ~13 MB gzip**.

Boyutların 7 MFE'de byte-identical olması, kodun **tree-shake edilmeden**
çekildiğini gösteriyor: `mfe-suggestions` / `mfe-ethic` gibi chart render
etmeyen MFE'ler bile tam ~9.2 MB chart kopyası taşıyor. Muhtemel mekanizma
(dedup PR'ında doğrulanacak — şu an hipotez): `@mfe/design-system` →
`@mfe/x-charts` barrel re-export zinciri tree-shaking'i kırıyor.

### 3.4 MF-shared paketler — build-time görünür, runtime dedupe

`react`/`react-dom`/`react-router`/`@reduxjs/toolkit`/`ag-grid-*` 7 MFE
`stats.json`'ında görünür **ama** MF shared scope (`singleton`) →
runtime'da tek instance host provider'dan gelir (`mf-shared-scope-audit.md`
canonical-provider pattern). Bu paketler için `excessKB` **runtime maliyeti
değil** — share-scope provider/fallback chunk'ıdır.

İstisna — gerçek drift: `ag-grid-community/enterprise` `mfe-ethic` ve
`mfe-suggestions`'da ~3.4 MB iken diğer 5 MFE'de ~1.8 MB. Bu
`mf-shared-scope-audit.md`'deki **"remote-bundles-canonical"** sinyalidir
(remote `singleton()` kullanıyor, `hostOnly()` değil → kendi kopyasını
gönderiyor olabilir). Runtime chunk-graph confirmation gerekir.

### 3.5 Diğer noktalar

- **shell `lucide-react` 931 KB** — diğer MFE'lerde 9 KB. Shell'de bir
  barrel/namespace import (`import * as`) tree-shake'i kırıyor → ~920 KB
  shell-only israf.
- **axios** 7×174 KB — shared scope'ta değil.
- **@tanstack/query-core** 7×79 KB — `@tanstack/react-query` shared ama
  iç bağımlılığı `query-core` ayrı duplike (`mf-shared-scope-audit.md`
  PR-B2-rollout backlog ile ilişkili).

---

## 4. ANALYZE build bilinen sınırı — shell `mf-preload-helper-isolation`

`ANALYZE_BUNDLE=1 npm run build` (paralel `build:raw`) içinde **`build:shell`
exit 1** verir: `mf-preload-helper-isolation` plugin'inin fail-closed
audit'i, bir `react-router` loadShare chunk'ının regex'le eşleşmemesi
nedeniyle `throw` ediyor.

- 6 remote MFE build'i **temiz** (exit 0).
- `bundleVisualizer` plugin'i `generateBundle`'ı `mf-preload`'dan **önce**
  koşar → shell `stats.json` **yazıldı**; analiz verisi sağlam.
- Shell-specific + pre-existing: V3-B1a 6 remote config'ini değiştirdi,
  `mfe-shell/vite.config.ts`'e dokunmadı. CI `ANALYZE_BUNDLE` koşmadığı için
  `CI - Web Build Check` yeşil — bu yol CI gate değil.
- Workaround: per-MFE `build:<mfe>` veya `npm-run-all --continue-on-error`.

Bu, `AUTH_HELPER_IMPORT_RE` regex'inin yeni import shape'ini kapsayacak
şekilde genişletilmesini (veya ANALYZE build'de fail→warn) gerektirir —
**ayrı follow-up** (runtime-correctness plugin'i; bu PR'ın scope'u dışı).

---

## 5. Dedup yol haritası → follow-up PR'lar

Bu PR (V3-B1a) **yalnızca ANALYZE altyapısını LIVE** eder. Davranış
değiştiren dedup **ayrı PR**'dır — `mf-shared-scope-audit.md` ilkesi:
_"share-scope'a dokunan her edit build + smoke verify ile eşlenir;
davranış değişikliği diagnostic/altyapı PR'ından ayrı tutulur."_

| Bulgu                                       | Önerilen follow-up                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart stack 7× (~55 MB rendered savings)    | MF shared scope'a ekleme **veya** lazy-load + barrel kırma; runtime chunk-graph confirmation şart. PR-B4b "reports deep split" ile ilişkili. |
| ag-grid `mfe-ethic`/`mfe-suggestions` drift | `singleton()` → `hostOnly()` parity (PR-B2-rollout pattern).                                                                                 |
| shell `lucide-react` 931 KB barrel          | Shell'de namespace import → named import refactor.                                                                                           |
| query-core duplike                          | `@tanstack/react-query` `hostOnly()` rollout (PR-B2-rollout).                                                                                |
| shell ANALYZE `mf-preload` fail             | `AUTH_HELPER_IMPORT_RE` genişletme veya ANALYZE'de fail→warn.                                                                                |

Her dedup, MF shared-scope değişikliği içeriyorsa white-screen riski taşır
(version strictness) → ayrı PR + build + browser smoke (HARD RULE:
tarayıcıdan doğrulama) zorunlu.

---

## 6. Referanslar

- `docs/performance/bundle-taxonomy.md` — PR-A0 runbook (tooling)
- `docs/performance/mf-shared-scope-audit.md` — canonical-provider pattern
- `scripts/ci/duplicate-package-detector.mjs` — detector (size fix bu PR'da)
- `scripts/vite-plugins/bundle-visualizer.ts` — env-gated Vite plugin
- `tests/perf/bundle-stats/duplicates.json` — ham detector çıktısı (regenere)
