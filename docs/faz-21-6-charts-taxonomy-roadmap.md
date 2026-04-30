# Faz 21.6 — Charts Taxonomy & Scorecard Multi-Package Refactor

**Status:** PLANNED (Faz 21.5-A1 cycle close sonrası başlanır)
**Origin:** Codex thread `019dddff-bada-7411-b324-0d4a69e62bf2` iter-5
**Decision date:** 2026-04-30
**Estimated effort:** 1-2 hafta (4 sütun × ~1-3 gün)

## Problem (Faz 21.5'te tespit edildi)

Quality Dashboard (`/admin/design-lab/quality-dashboard`) `/scorecard.json` dinamik fetch ediyor. Generator `packages/design-system/scripts/ci/component-scorecard.mjs` sadece `packages/design-system/src/` tarıyor. `@mfe/x-charts` paketi (Faz 21.4'te eklenen 16 ECharts wrapper) **scorecard'a görünmüyor**.

Eş zamanlı: 9 chart wrapper hem `@mfe/x-charts`'ta hem `@mfe/design-system`'da yaşıyor (duplicate). Dashboard'da gösterilen skorlar **yanlış kaynağa** ait — DS'in eski wrapper versiyonları, x-charts'ın yeni ECharts impl'i değil.

## Codex iter-5 Verdict (PARTIAL → Hibrit)

> "Naive A (sadece SCAN_DIRS extend) yanlış sinyal verir. A' yap (scorecard provenance) + C kalıcı temizlik (Faz 21.6). B'yi tek başına yapma."

A1 cycle scope creep önlemek için tüm refactor Faz 21.6'ya alındı.

## Mimari (kalıcı son hal)

```
@mfe/x-charts (canonical, ECharts 5.x)
├── 13 core (CONTRACT v2.1 §1)
│   Bar, Line, Area, Pie, Scatter, Gauge, Radar,
│   Treemap, Heatmap, Waterfall, Funnel, Sankey, Sunburst
└── 3 composite
    MiniChart, SparklineChart, CrossFilterChart

Tüketici tarafı:
- mfe-shell, mfe-reporting, mfe-access → @mfe/x-charts (yeni)
- DS shim layer → @deprecated, runtime once-warn,
  Codemod ile migrate

DS-only 6 chart taxonomy karar:
- BulletChart, ControlChart, HistogramChart, ParetoChart
  → x-charts'a aday (CONTRACT v2.2 genişletme)
- MicroChart → MiniChart/SparklineChart ile merge
- OrgChart → hierarchy viz (chart değil), ayrı kategori
```

## 4 Sütun (uygulama sırası)

### Sütun 1: Config-driven scorecard (1.5 gün)

**Dosya:** `packages/design-system/scripts/ci/component-scorecard.mjs`

**Değişiklik:**

- Hardcoded `SRC` constant'ı kaldır
- `SCAN_PACKAGES` config tanımla:
  ```js
  const SCAN_PACKAGES = [
    {
      packageId: '@mfe/design-system',
      root: 'packages/design-system/src',
      componentDirs: ['primitives', 'components', 'patterns', ...],
      scoringProfile: 'standard',
    },
    {
      packageId: '@mfe/x-charts',
      root: 'packages/x-charts/src',
      includeFiles: ['BarChart.tsx', 'LineChart.tsx', ...], // explicit
      scoringProfile: 'chart-wrapper',
    },
  ];
  ```
- Score fonksiyonları (`scoreTestDepth`, `scoreA11y`, `scoreTestCoverage`, `scoreStory`) `srcRoot` parametre alacak
- Main loop paket başına iterate

**Kabul kriteri:**

- DS scan davranışı değişmez (mevcut 218 entry korunur)
- x-charts 16 wrapper scorecard'a girer
- Hook/util/internal dosyalar tarama dışında (false low-score önleme)

### Sütun 2: JSON metadata + provenance (1 gün)

**Dosya:** `packages/design-system/scripts/ci/component-scorecard.mjs` + `apps/mfe-shell/.../QualityDashboardPage.tsx`

**JSON entry yeni alanlar:**

```json
{
  "name": "RadarChart",
  "packageId": "@mfe/x-charts",
  "canonicalId": "@mfe/x-charts/RadarChart",
  "status": "canonical",
  "replacedBy": null,
  "scores": { ... }
}
```

**Duplicate detection (build-time):**

- 9 duplicate chart name (Bar/Line/Area/Pie/Funnel/Gauge/Radar/Treemap/Waterfall)
- x-charts entry → `status: canonical`
- DS entry → `status: legacy`, `replacedBy: '@mfe/x-charts/RadarChart'`

**Dashboard UI:**

- Default view: `status === 'canonical'` filtresi (legacy kayıtlar gizli)
- Filter toggle: "Show legacy versions"
- Legacy badge: kırmızı "DEPRECATED, replaced by @mfe/x-charts" pill

**Kabul kriteri:**

- `/scorecard.json` her entry'de 4 yeni alan
- Quality Dashboard 218 entry yerine ~200 canonical (duplicate'lar gizli) gösterir
- Legacy filter aktif edilince tam 218 görünür

### Sütun 3: DS shim + codemod (3 gün)

**Hedef:** DS chart import'larını breaking change yapmadan x-charts'a yönlendir.

**Adım 3a — Shim wrapper'lar:**

- `packages/design-system/src/components/charts/BarChart.tsx` → `@mfe/x-charts`'tan re-export
- DS-spesifik prop'lar (`access`, `accessReason`, `localeText.noData`, `className`, `ref`) korunur
- JSDoc `@deprecated use @mfe/x-charts` ekle
- Dev-only `console.warn` once-per-component (production'da silent)

**Adım 3b — Tüketici audit:**

```bash
# Bilinen tüketiciler (Codex iter-5 cevap-2):
apps/mfe-shell/src/pages/home/widgets/ExtensionHealthWidget.tsx → BarChart
apps/mfe-shell/src/pages/home/widgets/ContextHealthTrendWidget.tsx → LineChart
apps/mfe-shell/src/pages/home/widgets/WorkIntakeWidget.tsx → PieChart
```

**Adım 3c — Codemod:**

- `scripts/codemod/migrate-ds-charts-to-x-charts.mjs` yaz
- AST transform: `import { BarChart } from '@mfe/design-system'` → `import { BarChart } from '@mfe/x-charts'`
- Tüketici dosyalarına uygula

**Kabul kriteri:**

- DS shim runtime test: import path değişmedi, davranış aynı
- 3 widget tüketicisi x-charts'a migrate
- Visual regression diff yok

### Sütun 4: CONTRACT v2.2 taxonomy (1 gün)

**Dosya:** `packages/x-charts/CONTRACT.md`

**v2.1 → v2.2 değişiklikleri:**

- 4 yeni chart aday: BulletChart, ControlChart, HistogramChart, ParetoChart
- MicroChart → MiniChart/SparklineChart konsolidasyon notu
- OrgChart → "hierarchy visualization" kategori, chart değil — `@mfe/x-charts` kapsamı dışında
- DS-only 6 chart için kategori karar tablosu

**Kabul kriteri:**

- CONTRACT.md taxonomy bölümü güncel
- DS-only chart'lardan x-charts'a aday olanlar için ayrı PR (Faz 21.7+)
- OrgChart hierarchy viz için ayrı paket önerisi (`@mfe/hierarchy-viz`?)

## Bağımlılıklar

- Faz 21.5-A1 cycle kapat (testai smoke + locale 3 senaryo + rollback evidence)
- Faz 21.5-B (a11y baseline) Sütun 3 codemod'la çakışmamalı

## Risk

| Risk                                 | Mitigation                                                 |
| ------------------------------------ | ---------------------------------------------------------- |
| DS shim breaking change              | once-warn dev-only, JSDoc deprecation, codemod ile migrate |
| Codemod regression                   | Visual regression + Playwright smoke (her tüketici için)   |
| CONTRACT v2.2 taxonomy uzun tartışma | Codex iter-6 ile pre-impl review                           |
| DS enterprise OrgChart consumer'ları | Audit önce, ayrı paket karar sonra                         |

## Codex Pre-Impl Review (zorunlu)

Bu plan Faz 21.6 başlangıcında Codex'le tekrar review edilecek (iter-7+):

- Sütun sıralaması doğru mu
- Sütun 3 codemod approach (jscodeshift vs ts-morph)
- v2.2 taxonomy boundary kararı
- Test coverage gate

## Sonuç

Bu refactor'dan sonra:

- ✅ Tek kaynak (`@mfe/x-charts`)
- ✅ Quality Dashboard tutarlı (canonical default)
- ✅ Yeni chart eklerken yer net (CONTRACT taxonomy)
- ✅ Scorecard kalıcı sürdürülebilir (config-driven)
- ✅ Tüketici breaking change yok (shim + codemod)
