# @mfe/x-charts — UI/UX Tracker

> **Amaç:** 13 chart bileşeninin UI/UX kalitesini 8 boyutta tek görünümde takip
> et. Her chart için skor + somut aksiyon item + sahip PR. **Kullanıcı talebi
> 2026-04-30**: "tüm chartların UI ve UX anlamında değerlendirelim, plana
> ekle, hepsini takip edilebilir kılalım."
>
> **Bu doc kaynak değildir** — TRUTH-SUMMARY'dir. Düzenlemeler review sonrası
> ilerler; her chart için "Last reviewed" tarihi tutulur.
>
> **Last sweep**: 2026-04-30 (Faz 21.4 audit)

---

## §1 Skor cetveli

| Skor | Renk | Anlam                               |
| ---- | ---- | ----------------------------------- |
| 9-10 | 🟢   | Production-grade, bilinen sorun yok |
| 7-8  | 🟡   | Çalışıyor, ufak gap’ler var         |
| 4-6  | 🟠   | Belirgin gap, action gerek          |
| 0-3  | 🔴   | Bloker, öncelikli iş                |

8 boyut: **Visual** · **Interact** · **A11y** · **Responsive** · **Theme** · **i18n** · **Docs** · **Tests**

---

## §2 Sıcaklık haritası — 13 chart × 8 boyut

> **2026-04-30 honest rescore (Codex review).** İlk taslak PR-D landing
> sonrası Tests sütununu 9'a (production-grade) yükseltmişti. Codex
> haklı olarak şunu işaretledi: PR-D smoke testleri yalnızca render
> no-throw + `series.type` literal'ını kontrol ediyor. `label ↔ value
swap`, multi-series flattening drop, data → series.data mapping
> mutasyonları hâlâ yakalanamıyor. Honest skor PR-D landing sonrası
> **6** (önceki **4** → +2 net) — gerçek 9'a ulaşmak için **PR-D2**
> (deeper mutation tests) + **PR-F2/F3** (axe-core + visual-regression)
> şart.

| Chart          | Visual | Interact | A11y | Resp | Theme | i18n | Docs | Tests | Avg     |
| -------------- | ------ | -------- | ---- | ---- | ----- | ---- | ---- | ----- | ------- |
| BarChart       | 🟡 8   | 🟡 7     | 🟢 9 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.4** |
| LineChart      | 🟡 8   | 🟡 7     | 🟢 9 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.4** |
| AreaChart      | 🟡 8   | 🟡 7     | 🟡 8 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.3** |
| PieChart       | 🟡 8   | 🟡 7     | 🟡 8 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.3** |
| ScatterChart   | 🟡 7   | 🟠 6     | 🟡 7 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **6.9** |
| GaugeChart     | 🟢 9   | 🟠 5     | 🟡 7 | 🟡 8 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.1** |
| RadarChart     | 🟡 8   | 🟠 5     | 🟠 6 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **6.8** |
| TreemapChart   | 🟡 8   | 🟡 7     | 🟠 6 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.0** |
| HeatmapChart   | 🟢 9   | 🟠 6     | 🟠 6 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.0** |
| WaterfallChart | 🟡 8   | 🟠 6     | 🟠 6 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **6.9** |
| FunnelChart    | 🟡 8   | 🟠 6     | 🟠 6 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **6.9** |
| SankeyChart    | 🟡 8   | 🟠 5     | 🟠 6 | 🟠 6 | 🟢 9  | 🟠 6 | 🟠 6 | 🟠 5  | **6.4** |
| SunburstChart  | 🟢 9   | 🟡 7     | 🟠 6 | 🟡 7 | 🟢 9  | 🟠 6 | 🟡 7 | 🟠 6  | **7.1** |

**Toplam ortalama (13 chart × 8 boyut): 7.04** — “**Test temelinde
production-yakını ama derin mutation kapsanması yok**” seviyesi.

> Skorlar kaynakları:
>
> - `packages/x-charts/CONTRACT.md` v2.1 (PR-E #105 — prop signatures
>   gerçek export'larla hizalı)
> - Storybook fixture dosyaları + Design Lab playground görsel kontrolü
>   (PR-A..B4 #91/95/99/100/101 ile 29/29 route live render)
> - jsdom-render karşılaştırması + PR-D smoke (#103) `series.type`
>   contract testi
> - Codex audit thread `019ddd72-...` (Tests honest rescore source)
> - Manuel rubric. Kalite gate'leri (PR-F2/F3 = axe + visual regression)
>   aktive olunca otomatik skorlamaya geçilecek.

---

## §3 Boyut bazlı sistemik gap'ler (her chart'ı etkiliyor)

| Boyut          | Skor avg | Sistemik sorun                                                                                                                                                                                                                                                                                                                                                                            | Sorumlu PR                                        |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Tests**      | 5.9      | PR-D landing sonrası 13/13 chart × 2 baseline test (render no-throw + `series.type` literal) + composition layer + cross-cutting contract suite. **Derin mutation tests hâlâ yok**: `label↔value swap`, multi-series flatten drop, data→series.data mapping mutasyonları yakalanmaz. 9'a ulaşmak için **PR-D2** (deeper mutation tests) + **PR-F2/F3** (axe + visual regression) gerekir. | **PR-D** (#103 landed) → **PR-D2** + **PR-F2/F3** |
| **i18n**       | 6.0      | `registerEChartsLocale` mevcut ama otomatik aktif değil — locale değişince chart axis number/date formatter güncel locale'i takip etmiyor                                                                                                                                                                                                                                                 | **Faz 21.5-i18n**                                 |
| **Docs**       | 6.9      | Design Lab playground + API tab var; Storybook MDX dokümantasyon yok, "when to use" rehberi yok                                                                                                                                                                                                                                                                                           | **Faz 21.5-docs**                                 |
| **A11y**       | 7.0      | Keyboard navigation BarChart/LineChart'ta var ama Radar/Sankey/Funnel'da düşük; decal patterns 4 chart'ta eksik                                                                                                                                                                                                                                                                           | **Faz 21.5-a11y**                                 |
| **Interact**   | 6.4      | Hover tooltip evrensel, ama onDataPointClick wiring her chart'ta değil; brush/zoom sadece Bar/Line'da; drill-down sadece Treemap/Sunburst                                                                                                                                                                                                                                                 | **Faz 21.5-interact**                             |
| **Responsive** | 7.0      | sm/md/lg presetleri 13 chart'ta var; **horizontal mode** sm'de sıkışıyor (BarChart); SankeyChart node-overflow taşma                                                                                                                                                                                                                                                                      | **Faz 21.5-responsive**                           |
| **Theme**      | 9.0      | 4 tema (light/dark/HC/print) — sağlam (CONTRACT v2 §2 ✓)                                                                                                                                                                                                                                                                                                                                  | —                                                 |
| **Visual**     | 7.9      | ECharts default palette → token-aware palette kısmen bağlı; spacing/typography density-aware değil                                                                                                                                                                                                                                                                                        | **Faz 21.5-visual-tune**                          |

---

## §4 Per-chart action items

> Her satır bir issue/PR'a açılabilir. **Owner PR** sütunu hangi Faz 21.x slot'una düştüğünü gösterir.

### BarChart (avg 7.1)

| Action                                                                | Owner PR        |
| --------------------------------------------------------------------- | --------------- |
| Unit test (render + onClick + multi-series + horizontal mode)         | PR-D            |
| Keyboard arrow-nav bars-arası                                         | Faz 21.5-a11y   |
| Locale-aware axis number formatter (registerEChartsLocale auto-apply) | Faz 21.5-i18n   |
| Density-aware bar gap (compact/comfortable/spacious)                  | Faz 21.5-visual |
| Storybook MDX "when to use BarChart vs LineChart"                     | Faz 21.5-docs   |

### LineChart (avg 7.1)

| Action                                          | Owner PR          |
| ----------------------------------------------- | ----------------- |
| Unit test (series + labels + smooth + showArea) | PR-D              |
| Keyboard arrow-nav point-arası                  | Faz 21.5-a11y     |
| Auto-locale axis date formatter                 | Faz 21.5-i18n     |
| Live `useRealTimeData` integration demo         | Faz 21.5-realtime |
| MDX docs                                        | Faz 21.5-docs     |

### AreaChart (avg 7.0)

| Action                                        | Owner PR              |
| --------------------------------------------- | --------------------- |
| Unit test (stacked + gradient + multi-series) | PR-D                  |
| Stacked %100 modu                             | Faz 21.5-area-stacked |
| MDX docs + "when stacked vs grouped"          | Faz 21.5-docs         |
| A11y: gradient decal pattern fallback         | Faz 21.5-a11y         |

### PieChart (avg 7.0)

| Action                                             | Owner PR          |
| -------------------------------------------------- | ----------------- |
| Unit test (donut + showPercentage + slice click)   | PR-D              |
| Inner content slot demo (donut center title/value) | Faz 21.5-pie-slot |
| Slice keyboard nav                                 | Faz 21.5-a11y     |
| MDX docs                                           | Faz 21.5-docs     |

### ScatterChart (avg 6.6)

| Action                                                                           | Owner PR                 |
| -------------------------------------------------------------------------------- | ------------------------ |
| Unit test + sizeKey/colorKey                                                     | PR-D                     |
| Click handler wiring (onDataPointClick currently optional, pattern undocumented) | Faz 21.5-interact        |
| Quadrant overlay support                                                         | Faz 21.5-scatter-overlay |
| Touch gesture pinch-zoom                                                         | Faz 21.5-mobile          |
| MDX docs                                                                         | Faz 21.5-docs            |

### GaugeChart (avg 6.9)

| Action                                         | Owner PR             |
| ---------------------------------------------- | -------------------- |
| Unit test (value + thresholds + animation)     | PR-D                 |
| Multi-needle (comparison) variant              | Faz 21.5-gauge-multi |
| Keyboard focusable for screen reader narration | Faz 21.5-a11y        |
| MDX docs                                       | Faz 21.5-docs        |

### RadarChart (avg 6.5)

| Action                                | Owner PR          |
| ------------------------------------- | ----------------- |
| Unit test (indicators + multi-series) | PR-D              |
| Axis label keyboard navigation        | Faz 21.5-a11y     |
| Indicator-tıklama → detay drill       | Faz 21.5-interact |
| Color-blind palette test              | Faz 21.5-a11y     |
| MDX docs                              | Faz 21.5-docs     |

### TreemapChart (avg 6.8)

| Action                                                 | Owner PR              |
| ------------------------------------------------------ | --------------------- |
| Unit test (hierarchy + drill-down)                     | PR-D                  |
| Tile keyboard nav (Tab/arrow)                          | Faz 21.5-a11y         |
| Decal pattern (color-blind)                            | Faz 21.5-a11y         |
| Squarify algoritma alternatif (binary, slice-and-dice) | Faz 21.5-treemap-algo |
| MDX docs                                               | Faz 21.5-docs         |

### HeatmapChart (avg 6.8)

| Action                                           | Owner PR               |
| ------------------------------------------------ | ---------------------- |
| Unit test (data shape + colorScale + showValues) | PR-D                   |
| Diverging color scale opsiyonu                   | Faz 21.5-heatmap-scale |
| Keyboard cell nav                                | Faz 21.5-a11y          |
| MDX docs                                         | Faz 21.5-docs          |

### WaterfallChart (avg 6.6)

| Action                                           | Owner PR                    |
| ------------------------------------------------ | --------------------------- |
| Unit test (positive/negative/total + showValues) | PR-D                        |
| Subtotal marker desteği                          | Faz 21.5-waterfall-subtotal |
| Keyboard bar nav                                 | Faz 21.5-a11y               |
| MDX docs                                         | Faz 21.5-docs               |

### FunnelChart (avg 6.6)

| Action                                            | Owner PR              |
| ------------------------------------------------- | --------------------- |
| Unit test (showConversion + 3D variant?)          | PR-D                  |
| Conversion label position (inside/outside seçimi) | Faz 21.5-funnel-label |
| Keyboard step nav                                 | Faz 21.5-a11y         |
| MDX docs                                          | Faz 21.5-docs         |

### SankeyChart (avg 6.1)

| Action                                                     | Owner PR                   |
| ---------------------------------------------------------- | -------------------------- |
| Unit test (nodes/links + circular detection)               | PR-D                       |
| Node-overflow handling sm breakpoint'ta (Responsive 6 → 8) | Faz 21.5-sankey-responsive |
| Edge-tıklama interaction                                   | Faz 21.5-interact          |
| Decal/pattern fill (a11y)                                  | Faz 21.5-a11y              |
| Documentation tüm node şekilleri için                      | Faz 21.5-docs              |

### SunburstChart (avg 6.9)

| Action                                 | Owner PR                 |
| -------------------------------------- | ------------------------ |
| Unit test (hierarchy + drill ring nav) | PR-D                     |
| Center label slot (drill path display) | Faz 21.5-sunburst-center |
| Keyboard ring nav                      | Faz 21.5-a11y            |
| MDX docs                               | Faz 21.5-docs            |

---

## §5 Cross-cutting infrastructure (tüm chart'ları aynı anda yükseltir)

| Initiative                                                                  | Etkilediği boyut      | Tahmini PR        | Effort                              |
| --------------------------------------------------------------------------- | --------------------- | ----------------- | ----------------------------------- |
| **registerEChartsLocale** auto-bind (LocaleProvider listener)               | i18n 6 → 9 (13 chart) | Faz 21.5-i18n     | 3-4 saat                            |
| **Token-aware ECharts theme** generator (design tokens → ECharts palette)   | Visual 8 → 9          | Faz 21.5-visual   | 4-6 saat                            |
| **Density-aware base chart wrapper** (compact/comfortable/spacious propag.) | Visual + Responsive   | Faz 21.5-density  | 2-3 saat                            |
| **Per-chart unit test scaffold** (RTL + canvas mock)                        | Tests 4 → 9           | **PR-D**          | 4-6 saat (test); 8-12 saat (kapsam) |
| **Storybook MDX docs template** + "when to use" matrisi                     | Docs 7 → 9            | Faz 21.5-docs     | 6-8 saat                            |
| **Universal keyboard nav HOC**                                              | A11y 7 → 9            | Faz 21.5-a11y     | 4-6 saat                            |
| **Real-time stream wrapper** (`useRealTimeData` adapter)                    | Interact 6 → 8        | Faz 21.5-realtime | 2-3 saat                            |
| **Decal pattern auto-apply for HC/colorblind themes**                       | A11y 7 → 9            | Faz 21.5-a11y     | 2-3 saat                            |

---

## §6 Faz 21.5 önerisi — UI/UX yükseltme dalgası

Faz 21.4-G (bu doc) audit'i kapatıyor. Faz 21.5 7 paralel slot'a bölünebilir:

| Slot    | Konu                                         | Effort             | Beklenen avg lift          |
| ------- | -------------------------------------------- | ------------------ | -------------------------- |
| 21.5-A1 | Locale auto-bind (i18n)                      | 3-4h               | +2.5 (i18n: 6 → 9)         |
| 21.5-A2 | Token-aware theme palette (Visual)           | 4-6h               | +1.0 (Visual: 8 → 9)       |
| 21.5-A3 | Density-aware wrapper                        | 2-3h               | +1.0 (Visual + Responsive) |
| 21.5-B  | A11y universal nav + decal                   | 6-9h               | +2.0 (A11y: 7 → 9)         |
| 21.5-C  | Storybook MDX docs template                  | 6-8h               | +2.0 (Docs: 7 → 9)         |
| 21.5-D  | Real-time + brush + zoom interaction propag. | 4-6h               | +1.5 (Interact: 6 → 8)     |
| 21.5-E  | Per-chart polish (action items §4)           | 13 × 1-2h = 13-26h | +0.5–1.0 (her chart)       |

**Toplam Faz 21.5 effort**: ~38-62 saat. Beklenen avg lift: 6.78 → ~9.0 (production-grade).

---

## §7 Tracking & cadence

- **Audit cadence**: her major chart PR sonrası, ya da 2 ayda bir (bu doc'un §2 matrisi yeniden skorlanır).
- **Status update protokolü**:
  1. PR-D landing → Tests sütunu 13 chart'ta 4 → 9 update
  2. Faz 21.5-A1 landing → i18n sütunu 13 chart'ta 6 → 9
  3. Per-chart fix landing → tek satır update + "Last reviewed"
- **Review owner**: chart paketinin ana mantain'eri (kullanıcı). PR-G merge sonrası issue açma cadence: action item başına 1 issue, label `x-charts:ui-ux`.
- **CI bağlantı**: PR-F'te Stryker + axe + visual-regression + bundle-size-check aktive olunca, Tests/A11y/Visual sütunları otomatik puanlamaya alınır.

---

## §8 Karar kuralları

- **Yeni chart eklenirse**: §2 matrisine satır ekle, §4'e action item bloğu, §5 cross-cutting init'lerden hangileri uygular işaretle.
- **Avg < 7 olan chart**: aktif kalkınma odağı. Yeni feature eklemeden önce action item'ları kapat.
- **Avg ≥ 9 olan chart**: maintenance modu — yeni feature ile yan etki check yeterli.

---

_Bu doc Faz 21.4-G çıktısıdır. Kullanıcı talebi 2026-04-30 gereği oluşturuldu._
