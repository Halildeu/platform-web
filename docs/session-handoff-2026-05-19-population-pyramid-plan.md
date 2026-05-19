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

### PR #1 — wrapper-only (`@mfe/x-charts`)

1. `packages/x-charts/src/PopulationPyramid.tsx` — normalize helper +
   option builder + `useChartTheme` + `useMarkupAdapter` +
   `mergeMarkupPatches` (bar-compat) + `useChartA11y` + `<ChartA11yShell>`
   - `ChartAccessGate` + guarded callbacks.
2. `src/index.ts` + `src/client/index.ts` export.
3. `useChartA11y.ts` — `populationPyramid` kind + aria noun ekle.
4. Testler — `PopulationPyramid.test.tsx`: normalization, internal
   negation, symmetric axis, shared stack, tooltip/label abs, click side
   payload, empty state, a11y no-negative table; accent testi
   (`accent="emerald"` iki series rengini değiştirir); markup adapter
   merge testi; access/anomaly smoke.
5. Storybook — `PopulationPyramid.stories.tsx` (veya AllChartTypes).
   Visual-invariant gate'in yeni wrapper'ı GERÇEKTEN ölçmesi isteniyorsa
   `packages/design-system/src/__visual__/x-charts.visual.ts`'e story
   ekle + baseline'ı bilinçli güncelle.
6. CONTRACT — §1 prop bloğu, §1.1 "PopulationPyramid accent-driven" notu,
   §9 catalogue 29-wrapper güncellemesi.
7. CONTRACT §8 — 8 hard gate (bundle-size, a11y-axe, contrast,
   chart-spec, xss, memory, tree-shake, visual). `x-charts-bundle-check`
   - `verify-tree-shaking` lokal koş.

### PR #2 — Design Lab enrollment

`ChartDetail.tsx` `CHART_CATALOG` entry (tercihen
`scripts/ci/sync-chart-detail-props.mjs` CHARTS listesi + sync) ·
`ChartsListing.tsx` card · `ChartPreviewLive.tsx` import + switch arm +
İK örnek veri · `chartPlaygroundModel.ts` (11 common-axis live prop +
`leftLabel`/`rightLabel`/`showValues`/`showGrid`/`showLegend`/`maxValue`

- valueFormatter/onDataPointClick/colors/markups/onMarkupClick/anomaly
  preset'leri) · `chartPlaygroundModel.test.ts` count-lock sabitleri ·
  `ChartPreviewLive.test.tsx` + `ChartDetail.coverage.test.tsx`.

> **DİKKAT — §4f count-lock**: count-lock hard 0.9 gate (393/432). Yeni
> chart catalog'a girince denominator ~+24 artar (chart'ın katalog prop
> sayısı ~25). Marj yetmeyebilir → PR #2'de **catalog ile birlikte
> yeterli live primitive + preset numerator AYNI ANDA** eklenmeli, yoksa
> coverage 0.9 altına düşer ve gate kırmızı olur. Codex'in açık uyarısı.

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

PR #1 (wrapper-only) ile başla. Codex plan thread `019e3f75` — devamı
`codex-reply` ile (thread expire olursa yeni thread + bu doc'u context
olarak ver). Her PR: cross-AI Codex review · CI tam-yeşil admin'siz
merge · `ai-post-merge-cleanup.sh` · PR #1/#2 UI etkisi → testai
browser-verify (HARD RULE).
