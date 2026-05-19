# Session Handoff — 2026-05-19 — PopulationPyramid wrapper (Codex-AGREE'd 3-PR plan)

> Worktree: `.claude/worktrees/tender-mclean-897d65` · tip = `c6a45fff` (#605)
> Önceki handoff: `docs/session-handoff-2026-05-18-x-charts-4f-sprint-close.md` (§4f kapanış).
> Codex plan-iter thread: `019e3f75` (AGREE — bu doc o planın executable hali).

## 1. Bağlam

§4f count-lock coverage sprint + üç loose-end (#603/#604/#605) tamamen
kapandı (önceki handoff). Yeni campaign: `@mfe/x-charts`'a **29. chart
wrapper — `PopulationPyramid`** (İK nüfus piramidi: yaş bandı satırları ×
cinsiyet, diverging horizontal bar). Kullanıcı önerilen yoldan devam
dedi; Codex plan-iter yapıldı, AGREE alındı.

**Gerçek ürün borcu (Codex buldu):**
`apps/mfe-reporting/src/modules/hr-demographic-report/DemographicDashboard.tsx`
L935 `AgePyramidChart` lokal shim'i `XBarChart` üstüne `male: -d.male`
(L948) + `Math.abs` formatter (L964) ile pyramid'i elle kuruyor. Bu
wrapper o borcu kütüphaneye taşır → feature ürün-içi gerçek bir ihtiyaca
oturuyor.

## 2. Codex AGREE'li 3-PR plan

### PR #1 — wrapper-only — ✅ DONE (PR #607, merge `d9e8b580`)

`PopulationPyramid.tsx` wrapper + `index.ts` / `client/index.ts` export +
`useChartA11y.ts` `populationPyramid` kind/noun + `PopulationPyramid.test.tsx`
(19 test). Codex thread `019e3f75` AGREE — 1 REVISE absorbe edildi (click
`datum.label/value`, `ChartClickEvent` re-export, `maxValue` finite guard,
markup `{dataIndex}`-anchor v1-limit doc). vitest 19/19, eslint temiz,
tsc x-charts baseline 43=43 (0-yeni), CI 32/32 yeşil.

Storybook + CONTRACT §1/§9 PR#1'de bilinçli atlandı: PR-X16 depth
wrapper'ları da per-chart story eklemedi (precedent); §1.1 (#605 audit)
PopulationPyramid'i "all remaining exported chart wrappers use
effectivePalette" altında zaten generic kapsıyor (accent-driven, carve-out
yok); §9 catalogue pre-existing-stale ("13 wrappers"), ayrı audit işi.

### PR #2 — Design Lab enrollment

`ChartDetail.tsx` `CHART_CATALOG` entry (tercihen
`scripts/ci/sync-chart-detail-props.mjs` CHARTS listesi + sync) ·
`ChartsListing.tsx` card · `ChartPreviewLive.tsx` import + switch arm +
İK örnek veri · `chartPlaygroundModel.ts` (11 common-axis live prop +
`leftLabel`/`rightLabel`/`showValues`/`showGrid`/`showLegend`/`maxValue`

- valueFormatter/onDataPointClick/colors/markups/onMarkupClick/anomaly
  preset'leri) · `chartPlaygroundModel.test.ts` count-lock sabitleri ·
  `ChartPreviewLive.test.tsx` + `ChartDetail.coverage.test.tsx`.

> **DİKKAT — §4f count-lock (hesaplanmış plan)**: hard 0.9 gate, şu an
> **393/432 ≈ %91.0**. PopulationPyramid catalog'a girince:
> `DERIVED_CATALOG_PROPS` ~+25 (PopulationPyramidProps ≈ 25 katalog
> prop), `EXCLUDED_SAMPLE_INPUTS` +1 → `HONEST_LIVE_SURFACE_DENOMINATOR`
> 432 → **~456**. Coverage ≥ 0.9 için numerator ≥ ceil(0.9×456) = **~411**
> olmalı (şu an 393 → en az **+18**).
>
> Plan — PopulationPyramid'e **~17 live primitive** (11 common-axis +
> `showValues`/`showGrid`/`showLegend`/`leftLabel`/`rightLabel`/`maxValue`)
>
> - **7 preset** (`valueFormatter`/`onDataPointClick`/`colors`/`markups`/
>   `onMarkupClick`/`anomalySummary`/`formatAnomalyAnnouncement`) = **+24
>   numerator** → `EXPECTED_TOTAL` 393 → **~417**, **~417/456 ≈ %91.5** ✓.
>
> KESİN sayılar AST'den gelir — count-lock testi self-verifying
> (`it.each(PRIMITIVE_LIVE_COUNTS/PRESET_COUNTS)` + `DERIVED_CATALOG_PROPS`
> / `HONEST_LIVE_SURFACE_DENOMINATOR` `.toBe(...)`). vitest lokal koşulup
> exact değerler kilitlenir. **catalog + numerator AYNI PR'da** — yoksa
> §4f.4 hard gate kırmızı (Codex'in açık uyarısı).

### PR #3 — ürün adoption (ayrı, opsiyonel)

`DemographicDashboard.tsx` lokal `AgePyramidChart` shim'ini kaldır →
`PopulationPyramid` kullan. HR dashboard route smoke / component testi
ile mevcut live-data merge davranışı korunmalı.

## 3. Tasarım kararları (Codex AGREE)

- **A** — standalone `PopulationPyramid.tsx` (BarChart mode değil; data
  shape ve a11y/tooltip/click semantiği BarChart API'sini şişirir).
- **B** — data model:
  ```ts
  type PopulationPyramidDatum = { id?: string; ageBand: string; left: number; right: number };
  ```
  `left`/`right` public input'ta **unsigned**; negatifleme wrapper'ın
  render detayı. Invalid/negatif input → `Math.max(0, value)`. İki-series
  shape ÖNERİLMEZ (age-band hizalama hatasına açık) — atom "yaş bandı
  satırı".
- **C** — ECharts diverging bar: iki bar series **aynı `stack`'i**
  paylaşır (`stack: 'population-pyramid'`), `xAxis` simetrik
  (`min:-maxAbs, max:maxAbs`), `axisLabel.formatter` abs. Sol series
  `value: -d.left` + `rawValue: d.left` + `side: 'left'`.
- **E** — full §1.1 common surface (`theme|decal|density|accent` + access
  - `size`/`animate`/`title`/`description`/`className`/`valueFormatter`)
  - `markups`/`onMarkupClick` + `anomalySummary`/`formatAnomalyAnnouncement`.
    Reduced surface savunulamaz (CONTRACT §1.1 "every wrapper").

## 4. Pitfall'lar (Codex)

- Tooltip / axis label / bar label / click payload **daima raw pozitif**;
  negatif sadece ECharts render koordinatı.
- `onDataPointClick.value` pozitif; `datum.side`/`ageBand`/`seriesName`/
  `dataIndex` payload'a eklenmeli.
- `xAxis.min/max` simetrik olmalı (yoksa iki taraf kıyaslanamaz).
- `colors` explicit prop > `effectivePalette` > fallback. Chart
  accent-driven — accent-immune carve-out YOK.
- `showLegend` default `true` (iki taraf chart'ın semantiği).
- `useChartA11y` `dataIndex` bazlı + 2-kolonlu; v1 a11y tablosu **bir
  satır/yaş-bandı** olmalı (2×ageBand satır keyboard dispatch'i bozar).
  Tam 3-kolonlu "Yaş/Erkek/Kadın" hidden table ayrı shared-a11y işi.

## 5. Yeni Session İçin İlk Komut

```
cd /Users/halilkocoglu/Documents/platform-web/.claude/worktrees/tender-mclean-897d65
git fetch origin && git checkout origin/main
cat docs/session-handoff-2026-05-19-population-pyramid-plan.md
```

**PR #1 ✅ DONE (#607 `d9e8b580`) — PopulationPyramid wrapper canlı.**
Sıradaki: **PR #2 — Design Lab enrollment** (§2 PR #2 + yukarıdaki
hesaplanmış count-lock planı). Enrollment mekanikleri:
`scripts/ci/sync-chart-detail-props.mjs` `CHARTS` listesine (L45)
`['population-pyramid', 'PopulationPyramid']` ekle → `ChartDetail.tsx`'e
skeleton `CHART_CATALOG['population-pyramid']` entry aç (`polar-chart`
L2440-2640 pattern'ini klonla: `id`/`name`/`description`/`importPath`/
`tier`/`props:[]`/`themes`/`features`) → `node scripts/ci/sync-chart-detail-props.mjs`
çalıştır, `props` bloğunu wrapper interface'inden doldurur →
`ChartsListing.tsx` card → `ChartPreviewLive.tsx` import + `case
'population-pyramid'` + İK örnek veri → `chartPlaygroundModel.ts`
`LIVE_PROP_SUPPORT` + `COMPLEX_PROP_PRESETS` → `chartPlaygroundModel.test.ts`
count-lock (`PRIMITIVE_LIVE_COUNTS`/`PRESET_COUNTS` + `DERIVED_CATALOG_PROPS`
/`HONEST_LIVE_SURFACE_DENOMINATOR` `.toBe` sabitleri) → `ChartPreviewLive.test.tsx`
routing CASE + sentinel. Sonra **PR #3** — `DemographicDashboard.tsx`
`AgePyramidChart` shim swap + HR route browser-verify.

Codex plan thread `019e3f75` — devamı `codex-reply` ile (thread expire
olursa yeni thread + bu doc'u context ver). Her PR: cross-AI Codex
review · CI tam-yeşil admin'siz merge · `ai-post-merge-cleanup.sh` ·
PR #2 UI etkisi → testai browser-verify (HARD RULE).
