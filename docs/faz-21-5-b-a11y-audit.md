# Faz 21.5-B — x-charts A11y Baseline Audit & Plan

**Status:** PLANNING (Codex iter-6 sıra: B → A3 → A2)
**Effort estimate:** 12-18 hours
**Pre-impl review:** Codex iter-7 zorunlu (hook vs wrapper karar)
**Date:** 2026-04-30

## Mevcut Durum (Audit)

### A11y Component Library — `packages/x-charts/src/a11y/`

Bunlar **zaten yazılmış** (Faz 21.4 öncesi inşa):

| Component          | Pattern                                                              | Status                                       |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------- |
| `ChartKeyboardNav` | Wrapper component (`<ChartKeyboardNav><Chart /></ChartKeyboardNav>`) | ✅ implemented, ❌ **0/13 chart kullanıyor** |
| `ChartAriaLive`    | `role="status"` aria-live region                                     | ✅ implemented, ❌ **0/13 chart kullanıyor** |
| `ChartDataTable`   | Toggle wrapper (chart ↔ HTML table)                                  | ✅ implemented, ❌ **0/13 chart kullanıyor** |
| `useReducedMotion` | Hook                                                                 | ✅ kullanılıyor (echarts-renderer'da)        |

### 13 Chart Wrapper Coverage Matrix

| Chart          | aria-label | role="img" | KbdNav | AriaLive | DataTable |
| -------------- | ---------- | ---------- | ------ | -------- | --------- |
| BarChart       | ✅         | ✅         | ❌     | ❌       | ❌        |
| LineChart      | ✅         | ✅         | ❌     | ❌       | ❌        |
| AreaChart      | ✅         | ✅         | ❌     | ❌       | ❌        |
| PieChart       | ✅         | ✅         | ❌     | ❌       | ❌        |
| ScatterChart   | ✅         | ✅         | ❌     | ❌       | ❌        |
| GaugeChart     | ✅         | ✅         | ❌     | ❌       | ❌        |
| RadarChart     | ✅         | ✅         | ❌     | ❌       | ❌        |
| TreemapChart   | ✅         | ✅         | ❌     | ❌       | ❌        |
| HeatmapChart   | ✅         | ✅         | ❌     | ❌       | ❌        |
| WaterfallChart | ✅         | ✅         | ❌     | ❌       | ❌        |
| FunnelChart    | ✅         | ✅         | ❌     | ❌       | ❌        |
| SankeyChart    | ✅         | ✅         | ❌     | ❌       | ❌        |
| SunburstChart  | ✅         | ✅         | ❌     | ❌       | ❌        |

**Anlam:** Mevcut a11y "zero-touch" minimum coverage (sadece aria-label + role="img"). Wrapper'lar ECharts native `aria.enabled: true` kullanıyor (ECharts'ın kendi iç a11y desteği). Üstüne x-charts'ın **kendi a11y component'leri tüketilmiyor**.

### CONTRACT v2.1 §6 Gereksinimi

```
- Keyboard navigation: Tab, Arrow, Enter, Escape         ❌ tüketilmiyor
- Data table fallback via aria-describedby                ❌ tüketilmiyor
- Colorblind-safe palettes with decal patterns            ❓ theme tarafına bakılmalı
- Screen reader announcements                             ❌ aria-live tüketilmiyor
- Focus ring on chart container and legend items          ⚠️ ChartLegend var, focus-visible CSS'i kontrol edilecek
```

## Stratejik Karar (Codex iter-7'ye sorulacak)

### Hook (Önerilen) vs Wrapper (Mevcut) Pattern

| Pattern                        | Pros                                                  | Cons                                                                                      |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Wrapper component** (mevcut) | Mevcut kod var, geriye uyumlu, opt-in açık            | Sayfa-level boilerplate (`<ChartDataTable><BarChart /></...>`), unutulabilir, default off |
| **Hook + auto-compose**        | Default-on a11y, zero-boilerplate, wrapper'a built-in | Yeni API yüzeyi, mevcut wrapper'ı obsolete eder                                           |

**Codex'e sorulacak:** Hangi pattern? **A) Hook ile auto-compose** mu yoksa **B) Wrapper'ı default-render** mı yoksa **C) İkili pattern** (sayfa wrapper kullanırsa wrapper, kullanmazsa wrapper otomatik render edilsin)?

### Decal Patterns (Colorblind-Safe)

ECharts native `decal` config destekler. Mevcut tema yoluyla:

- Her seri için `decal: { symbol: 'rect' | 'triangle' | 'circle' | ... }`
- Toggle prop: `decal?: boolean` (default false)
- High-contrast mode'da otomatik on (Codex iter-2 önerisi DesignLabEChartsHighContrastTheme)

### Focus Ring

ECharts canvas içinde focus ring native değil. **ChartKeyboardNav** wrapper'ı focus-visible CSS ile sağlıyor; ECharts'ın `dispatchAction({ type: 'highlight' })` ile data point highlight'ı sync edilebilir.

## 5 Sütun Plan

### Sütun 1: A11y Strateji Kararı (Codex iter-7) — 1 gün

**Çıktı:** Karar dokümanı + tek adımlı PR (sadece bu doc'un PR'ı, bilgi-amaçlı)

### Sütun 2: A11y Hook + BarChart Referans (3-4 gün)

**Codex AGREE'sine bağlı** kapsam:

- Hook seçilirse: `useChartA11y` yaz → BarChart'a entegre → vitest + Playwright (axe-core)
- Wrapper seçilirse: `withChartA11y` HOC veya `<ChartA11yProvider>` → BarChart'a entegre

### Sütun 3: 12 Chart Bulk Apply (3-4 gün)

Sütun 2 pattern'i 12 chart'a apply (Line, Area, Pie, Scatter, Gauge, Radar, Treemap, Heatmap, Waterfall, Funnel, Sankey, Sunburst). Her chart için:

- A11y hook/wrapper integration
- Vitest contract test (axe-core no violation)
- Playwright keyboard navigation test (Tab/Arrow/Enter/Escape)

### Sütun 4: Decal Patterns + High-Contrast Theme (2-3 gün)

- ECharts theme override `decal` config
- `DesignLabEChartsHighContrastTheme` aktivasyon (mevcut tema dosyası kontrol et)
- Token: `--chart-decal-pattern-1..6` (CONTRACT v2.1 §2 token roster genişletme)
- Toggle prop: chart-level + container-level

### Sütun 5: axe-core CI Gate (1-2 gün)

- `.github/workflows/x-charts-quality-gates.yml` yeni job: `a11y-axe-audit`
- Vitest @axe-core/react integration
- Threshold: zero violations on mounted chart in jsdom
- Storybook addon-a11y opsiyonel (Faz 21.5-C Storybook MDX işiyle paralel olabilir)

## Test Plan (Sütun başına)

| Sütun                     | Test Türü                  | Hedef                                     |
| ------------------------- | -------------------------- | ----------------------------------------- |
| 2 (referans BarChart)     | Vitest contract + axe-core | Zero violation, keyboard nav contract     |
| 3 (12 chart bulk)         | Per-chart vitest contract  | 12 × 3 test = 36 yeni mutation-aware test |
| 4 (decal + high-contrast) | Vitest + visual regression | Theme switch görsel değişiklik            |
| 5 (CI gate)               | E2E gate                   | PR merge öncesi axe block                 |

## Risk

| Risk                                                  | Mitigation                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| Hook vs wrapper karar sürdürülebilir değilse refactor | Codex iter-7 plan-time review zorunlu                           |
| 12 chart bulk apply'da regression                     | Per-chart contract test mandatory                               |
| Decal pattern theme breaks existing snapshots         | Visual regression baseline güncellemesi (Faz 21.5-F3 Chromatic) |
| axe-core CI gate yanlış-pozitif                       | jsdom limit'leri (focus, layout) — opt-out per chart eklenmesi  |

## Bağımlılıklar

- Faz 21.5-A1 cycle ✅ closed
- Faz 21.5-A2 (token-aware theme) Sütun 4 ile çakışabilir — A2 paralel branch olarak yürüyebilir, theme dosyası ortak
- Faz 21.6 chart taxonomy (#134) — duplicate cleanup tamamlandıktan sonra B uygulaması daha temiz olur, AMA cutover D30 zamanlaması B'yi öncelikli yapıyor (Codex iter-6)

## Codex iter-7 Soruları

1. Hook (default-on) vs Wrapper (opt-in) pattern hangisi sürdürülebilir?
2. ChartKeyboardNav mevcut wrapper'ı kalsın mı, hook ile yeniden yazılsın mı?
3. Decal patterns chart-level prop mu container-level mi?
4. axe-core gate threshold (zero violation veya `serious+critical only`)?
5. 13 chart'ı tek bulk PR'da mı, 13 ayrı küçük PR mı?
6. Faz 21.5-A2 (token theme) Sütun 4 ile paralel yürür mü?
7. Decal pattern token genişletme CONTRACT v2.1 patch mi yoksa v2.2 mi?

## Sonuç

Bu doc B kapsamını netleştirir; implementation PR'ları Codex iter-7 plan review sonrası (hook/wrapper karar netleştiğinde) açılır. A1 cycle close → bu doc → Codex iter-7 → Sütun 2 implementation.
