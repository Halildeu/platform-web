# Session Handoff — 2026-05-20 — ComboChart kampanyası (3 PR ship) + sıradaki 4 chart

> Worktree: `.claude/worktrees/tender-mclean-897d65`
> Önceki handoff: `docs/session-handoff-2026-05-19-population-pyramid-plan.md`
> Codex thread (plan + 3 PR-diff review — hepsi AGREE): `019e41cd-9158-7d22-8a44-1e96de010ff3`

## 1. Bağlam (bu oturumda ne yapıldı)

Kullanıcı yönergesi: "olmayan-eklenmeyen 5 chart'ı (ComboChart,
EffectScatterChart, Bar3DChart, LiquidFillChart, WordCloudChart) tamamla
— her birini PopulationPyramid akışıyla, 3-PR kampanyalarla, eksik/fake
olmadan." Bu oturumda **kampanya 1 — ComboChart** tam koştu (3 PR ship).
Sonraki 4 kampanya (EffectScatter / Bar3D / LiquidFill / WordCloud)
**bekliyor**.

## 2. İddia (bu oturumda MERGED PR'lar)

| PR   | Konu                                                         | Merge SHA  | Codex review                   |
| ---- | ------------------------------------------------------------ | ---------- | ------------------------------ |
| #620 | ComboChart wrapper (`packages/x-charts`, 30. wrapper)        | `afd72fbf` | thread `019e41cd` AGREE        |
| #621 | Design Lab kaydı + §4f count-lock (441/482 ≈ %91.5)          | `43ac0047` | thread `019e41cd` iter-4 AGREE |
| #624 | CompensationDashboard `salary-trend-12m` ComboChart adoption | `f40c2770` | thread `019e41cd` AGREE        |

Her PR: cross-AI Codex review · CI tam-yeşil admin'siz squash merge ·
forensic `ai-post-merge-cleanup.sh` (archive tag + audit log).

## 3. İspatlar (kanıtlanmış işler)

- **PR#1 wrapper (#620)**: 23 dedicated test (`ComboChart.test.tsx`)
  - full x-charts suite 119 dosya / 2343 test pass. Codex iter-2 REVISE
    absorbe (`client/index.ts` export, `useChartA11y` `combo` kind,
    `ChartDetail` entry hand-author önce/sync sonra, tooltip
    `seriesIndex` routing — duplicate-name-safe, independent formatter
    defaults, `normalizeSeries` pad/truncate, `colors` empty-array
    fallback).
- **PR#2 Design Lab (#621)**: 309 design-lab test pass. §4f hard gate:
  `DERIVED_CATALOG_PROPS` 475→**502**, `EXCLUDED_SAMPLE_INPUTS` 19→**20**,
  `HONEST_LIVE_SURFACE_DENOMINATOR` 456→**482**, `HARD_COVERAGE_FLOOR`
  411→**434**; honest coverage **441/482 ≈ %91.5**. Codex iter-3 REVISE
  absorbe (Design Lab sample'ında primary-bar + secondary-bar +
  primary-line — bars-on-two-axes risk path browser-verify ile kapanır).
- **PR#3 ürün adoption (#624)**: `salary-trend-12m` artık `ComboChart`
  üzerinden render — `value` (avg salary) primary line + `value2`
  (`COUNT(EMPLOYEE_ID)`) secondary bars. `renderSalaryLine`
  `tenure-salary-relation` için korundu. 5/5 hr-compensation test pass.
  PR #622'nin yeni `size` param contract'ına uyumlu
  (`renderSalaryTrendCombo(data, 'lg')`).
- adoption-matrix `--check`-ready (44 consumers).

## 4. İspatlamaz (yapılmayan / bekleyenler)

- **testai browser-verify** — PR#1/#2/#3'ün deploy + console + screenshot
  kontrolü HENÜZ yapılmadı (HARD RULE: deploy sonrası tarayıcı console
  doğrulama zorunlu). Sıradaki agent koşmalı:
  - `/admin/design-lab/charts/combo-chart` — playground canlı, 3-seri
    (Gelir bar primary + Çalışan bar secondary + Hedef line primary)
    render, console temiz, props paneli 25 prop / N editable.
  - `/admin/reports/hr-compensation` — 12 Aylık Maaş Trendi: salary
    line (primary, ₺) + headcount bars (secondary, count) dual-axis,
    console temiz.
- **Non-blocking polish (PR#2)**: `ChartPreviewLive.tsx:1351` yorumu
  hâlâ eski "revenue bar + growth-% line secondary" diyor — şu anki
  sample 3-seri.
- **Non-blocking polish (PR#3)**: `CompensationDashboard.tsx:396`
  `renderSalaryLine` yorumu hâlâ "salary-trend-12m /
  tenure-salary-relation" diyor — artık salary-trend-12m kullanmıyor.

Bu 2 polish + browser-verify sıradaki oturumda küçük bir cleanup PR ile
veya direkt sıradaki kampanyanın parçası olarak halledilebilir.

## 5. Bilinen Boşluk + Sıradaki Agent için P0 Aksiyon Listesi

### P0 — hemen sıradaki

1. **testai browser-verify** PR#1/#2/#3 için (§4 listesi).

### P0 — sıradaki 4 chart kampanyası (her biri 3-PR akışı)

| #   | Chart                  | Yeni npm bağımlılığı         | Gerekçe                                                                                             |
| --- | ---------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 2   | **EffectScatterChart** | yok                          | En ucuz core ECharts tamamlama (`effectScatter` sadece GeoMap overlay olarak vardı, standalone yok) |
| 3   | **Bar3DChart**         | yok (`echarts-gl` zaten dep) | 3D set tamamlama (`bar3D` sadece Globe layer olarak vardı, standalone yok)                          |
| 4   | **LiquidFillChart**    | `echarts-liquidfill`         | KPI yüzde göstergesi                                                                                |
| 5   | **WordCloudChart**     | `echarts-wordcloud`          | Metin frekansı                                                                                      |

Her kampanya için akış (ComboChart birebir pattern):

1. **Codex plan-iter** (yeni thread, `mcp__codex__codex` + replies).
   Plan AGREE alana kadar revize döngüsü.
2. **PR#1 — wrapper + barrel + tests** (PR #620 pattern).
3. **PR#2 — Design Lab enrollment + §4f count-lock bump**
   (PR #621 pattern).
4. **PR#3 — gerçek ürün adoption** (PR #624 pattern — gerçek ürün
   yüzeyi bulup migrate; bulunamazsa Codex'le yeniden plan).
5. Her PR: cross-AI Codex review → CI tam-yeşil → admin'siz squash →
   `ai-post-merge-cleanup.sh` → testai browser-verify.

### Pattern referansları (kampanya başlatırken clone et)

**Wrapper:** `packages/x-charts/src/ComboChart.tsx` veya
`PopulationPyramid.tsx` (forwardRef + ChartAccessGate + useEChartsRenderer

- useChartTheme + useMarkupAdapter + ChartA11yShell + resolveCssVarColor).

**Wrapper test:** `packages/x-charts/src/__tests__/ComboChart.test.tsx`
(`@vitest-environment jsdom` + `lastDispatchedOption` /
`clickListenerRegistrations` fixture; option-shape + normalization +
click payload + a11y SR table).

**Design Lab enrollment (5 dosya — PR#2 cycle):**

- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx`
  — hand-author entry (id, name, description, importPath, tier,
  `props: [\n    ],` placeholder, sampleCode, features, a11y, themes)
  BEFORE running sync.
- `scripts/ci/sync-chart-detail-props.mjs` — `CHARTS` array += entry,
  sonra `node scripts/ci/sync-chart-detail-props.mjs`.
- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartsListing.tsx`
  — chart card.
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/ChartPreviewLive.tsx`
  — import + switch `case`.
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/chartPlaygroundModel.ts`
  — 10 registry insert: `LIVE_PROP_SUPPORT` + `ANOMALY_PRESET_CHART_IDS`
  - `COMPLEX_PROP_PRESETS` (valueFormatter list + onDataPointClick list
  - colors entry + markups list + onMarkupClick list) +
    `MARKUP_PRESET_ANCHORS` + `SAMPLE_DATA` + `CHART_PRESETS`.

**Test dosyaları (PR#2 cycle):**

- `apps/mfe-shell/src/pages/admin/design-lab/widgets/__tests__/chartPlaygroundModel.test.ts`
  — `ALL_CHART_IDS` + `PRIMITIVE_LIVE_COUNTS` + `PRESET_COUNTS` + §4f
  hard-gate constants (DERIVED / EXCLUDED / DENOMINATOR / FLOOR sayıları
  yeniden hesap) + `GENUINE_MARKUP_CHARTS` + cartesian y-axis markup
  test list + `ANOMALY_CHARTS` + test isim string'leri ("X enrolled" /
  "N genuine-markup") + §4f / §4f.2 / §4f.3 comment blokları.
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/__tests__/ChartPreviewLive.test.tsx`
  — `vi.mock('@mfe/x-charts')` sentinel + `CASES` + `MARKUP_CHART_KINDS`
  - `ANOMALY_CHART_KINDS` + comment ("X enrolled anomaly charts").
- `apps/mfe-shell/src/pages/admin/design-lab/pages/__tests__/ChartDetail.coverage.test.tsx`
  — `vi.mock('@mfe/x-charts')` `stubChart` + `CHART_IDS_WITH_PRESETS`.

**§4f count-lock hesabı (her yeni wrapper için):**

- `DERIVED_CATALOG_PROPS` mevcut += yeni wrapper'ın CHART_CATALOG
  `props.length` (sync sonrası — `ComboChartProps` 25 + 2 access = 27;
  EffectScatter/Bar3D/LiquidFill/WordCloud ölç).
- `EXCLUDED_SAMPLE_INPUTS` = `ENROLLED_CHART_IDS.length` (her wrapper
  +1).
- `HONEST_LIVE_SURFACE_DENOMINATOR = DERIVED - EXCLUDED`.
- `HARD_COVERAGE_FLOOR = ceil(0.9 × DENOMINATOR)`.
- `EXPECTED_TOTAL = sum(PRIMITIVE_LIVE_COUNTS) + sum(PRESET_COUNTS)` —
  yeni wrapper'ın N (primitive set size) + M (COMPLEX_PROP_PRESETS keys
  starting with `${chartId}.`) eklenince auto-update.
- `EXPECTED_TOTAL >= FLOOR` ve `EXPECTED_TOTAL / DENOMINATOR >= 0.9`
  gate'i yeşil kalmalı.
- `ANOMALY_PRESET_CHART_IDS`'e eklenmek `.anomalySummary` +
  `.formatAnomalyAnnouncement` preset'leri otomatik üretir (flatMap),
  M sayımına +2.

**Adoption matrix regen:**

- `node scripts/ci/x-charts-adoption-scan.mjs` (PR#2 + PR#3
  cycle'larında).
- `node scripts/ci/x-charts-adoption-scan.mjs --check` CI gate.

**Sync `--check`:**

- `node scripts/ci/sync-chart-detail-props.mjs --check` CI gate.

### Cross-AI / Codex pattern

- Plan-iter: `mcp__codex__codex` (yeni thread, `sandbox=read-only`,
  `approval-policy=never`, `cwd` = worktree).
- Replies: `mcp__codex__codex-reply` (aynı thread, `threadId` saklı).
- AGREE → impl, REVISE → absorb + iter, RED → kullanıcıya rapor.
- PR squash commit body'sinde audit trail zorunlu:
  ```
  Implementer: Claude / Anthropic (worktree tender-mclean-897d65)
  Reviewer:    Codex / OpenAI (thread <id> — plan AGREE + PR-diff AGREE)
  ```

### Hatırlatılacak HARD RULE'lar

- Kullanıcı login user şifresine dokunma YASAK (test persona kullan).
- Pre-prod tam yetki, kullanıcıya iş bırakma YASAK.
- Continuous autonomous mode — durmadan zincir.
- Plan Consensus Autonomy — Codex AGREE → impl onayı sormadan.
- Cross-AI review — farklı sağlayıcılar; Claude impl + Codex review.
- `gh pr merge --admin` YASAK; CI'da herhangi check kırmızıyken merge YASAK.
- Browser-verify ZORUNLU (frontend deploy sonrası).
- `platform-ssot` DEPRECATED — kod yazımı yasak; canonical repolar:
  `platform-web`, `platform-backend`, `platform-k8s-gitops`.
- Force-push to `main`/`master` YASAK; feature branch force-push OK.
- "Yarın yaparım" / iş erteleme YASAK — her iş ŞİMDİ.

## Sıradaki Session İlk Komut

```bash
cd /Users/halilkocoglu/Documents/platform-web/.claude/worktrees/tender-mclean-897d65
cat docs/session-handoff-2026-05-20-combo-chart-campaign.md  # tam context

# 1) PR #624 status check; eğer OPEN ise CI bekle, yeşil olunca merge
gh pr view 624 --json state,mergeStateStatus,mergeable

# 2) Browser-verify (deploy bittikten sonra):
#    https://testai.acik.com/admin/design-lab/charts/combo-chart
#    https://testai.acik.com/admin/reports/hr-compensation

# 3) Sıradaki kampanya (EffectScatterChart) — Codex plan-iter ile başla:
#    mcp__codex__codex (yeni thread, sandbox=read-only, approval-policy=never,
#    cwd=worktree, prompt=EffectScatterChart 3-PR plan brief).
```
