# FAZ 21.8 — Reality Parity & Maturity Plan

**Status:** PLAN draft (2026-05-03)
**Owner:** x-charts maintenance
**Goal:** `@mfe/x-charts` kütüphanesinin "rakipler arasında açık ara önde" iddiasını gerçek davranışla **birebir** eşitlemek. Hiçbir özellik fake olmasın, partial olanlar mature seviyeye çıksın, demo-only feature'lar production'da gerçek tüketici kazansın.

> **Şu an pazarlama vs gerçek**: 13 chart wrapper + AccessControlledProps + 5 AI hook + 8/8 CI gate **gerçek**. Ama: XLSX export `format: 'xlsx'` type'da var, switch'te yok (FAKE). `useRealTimeData interval` option type'da var, hook kullanmıyor (FAKE). DrillDown history "redo" PR-B Codex must-fix sonrası kaldırıldı. SSR sadece 2 component için. Contrast gate STATIC fallback only. Cross-filter/DrillDown/AG-Grid bridge sadece Design Lab demo'da, prod consumer yok.

> **Bu plan**: tüm bu drift'leri kapatır. 5 PR, ~32-50h tahmini.

---

## Tier Breakdown

### T1 — Fake Removal (2 item, ~3-6h)

Pazarlama tablosunda yer alan ama implementation'da boş olan iki item. **Reklam ihlali**, en yüksek öncelik.

| Item                           | Şu an                                                                                                                                                                                                          | Hedef                                                                                                                                                                              | PR  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| **XLSX export**                | `ExportFormat = '...' \| 'xlsx'` + JSDoc "PNG, SVG, PDF, CSV, XLSX" + dosya başlığı `Chart Export — PNG, SVG, PDF, CSV, XLSX` AMA `chart-export.ts:152-167` switch'te `xlsx` case YOK. Çağrılırsa sessiz fail. | **Real impl** via `exceljs` dep. Workbook → buffer → Blob → download. Dosya başlığı + JSDoc parity.                                                                                | X1  |
| **`useRealTimeData interval`** | `RealTimeDataOptions.interval?: number` + JSDoc "auto-advance a tick at this interval (ms)" AMA `useRealTimeData.ts` body `interval` field'ını **hiç okumuyor**.                                               | **Real impl** via `useEffect(() => { const id = setInterval(emit, interval); return () => clearInterval(id); }, [interval])` + `pause/resume` ile uyum + `onTick` opt-in callback. | X1  |

### T2 — Partial → Mature (3 item, ~14-22h)

Implementation var ama **bütün** değil. Pazarlama dürüst olmuyor: "olgun" diyemiyoruz.

| Item                            | Şu an                                                                                                                                                     | Hedef                                                                                                                                                                                                                                       | PR  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| **DrillDown history redo**      | PR-B Codex must-fix #1 sonrası **redo button kaldırıldı**. UI sadece undo + reset + counter. Trail persist yok.                                           | Snapshot stack `Array<{ field, value, label }>` future + past, real `redo()` action — `drillTo` ile aynı koordinatları yeniden uygula. UI redo button restored. CONTRACT.md güncel.                                                         | X2  |
| **SSR (13 chart wrapper)**      | `ssr/index.ts` 25 satır, sadece `ChartContainer` + `ChartDashboard` `'use client'` re-export. 13 chart wrapper'ı RSC'de direct import patlar.             | 13 chart wrapper'ı `ssr/charts.ts` (`'use client'`) re-export'a ekle + RSC compat test (Next.js fixture veya minimum SSR smoke) + dokümantasyon.                                                                                            | X2  |
| **Contrast gate runtime layer** | `chart-contrast.contract.test.ts` STATIC fallback hex layer (jsdom; theme.css yüklenmez). 41 assertion. Runtime browser CSS-var/OKLCH **gate edilmiyor**. | Storybook K5 build üzerinden Playwright + `@axe-core/playwright` ile real browser color-contrast smoke. 13 chart × 5 theme × {default, HC} = 130 koşum. Workflow `x-charts-runtime-contrast.yml` ek hard gate. CONTRACT §8 8-gate → 9-gate. | X3  |

### T3 — Production Consumer + Doc Drift (4 item, ~15-22h)

Demo'da çalışan feature'ları gerçek production app'lerine entegre et + dokümantasyon parity.

| Item                           | Şu an                                                                                                                                         | Hedef                                                                                                                                                                        | PR  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| **Cross-filter real consumer** | `CrossFilterProvider` + `useChartCrossFilter` sadece `apps/mfe-shell/src/pages/admin/design-lab/widgets/CrossFilterDemoLive.tsx`              | `apps/mfe-reporting` HR/dashboard sayfasında 2-3 chart linked-charts pair (örn. region × category × time sırasıyla daraltılan dashboard)                                     | X4  |
| **DrillDown real consumer**    | `useDrillDown` sadece DrillDownDemoLive                                                                                                       | `apps/mfe-reporting/context-health` veya `mfe-shell/admin/audit` sayfasında 2-3 seviyeli hierarchical drill (project → component → file örn.)                                | X4  |
| **AG Grid bridge real**        | `useGridCrossFilter` sadece mock GridApi demo                                                                                                 | `apps/mfe-users` veya `apps/mfe-access` real AG Grid + chart pair (filter chart → grid daraltılır)                                                                           | X4  |
| **Doc drift cleanup**          | CONTRACT.md, README, ROADMAP, Design Lab catalog: pazarlama "5 hooks" / "8/8 gate" / "WCAG AA" gibi iddialar kısmen doğru, kısmen overpromise | Reality-aligned doc audit: her iddia için kanıt link (file:line, PR#), partial olanlara "STATIC layer only" / "demo-ready, prod consumer integrated in PR-X" gibi disclaimer | X5  |

### Total

| PR               | Scope                                                | Effort     | Risk                                                                                  |
| ---------------- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| **X0 (this PR)** | Plan dosyası + Codex review setup                    | 1h         | yok                                                                                   |
| **X1**           | T1 fake removal (XLSX impl + realtime interval impl) | 3-6h       | exceljs bundle weight (~200KB +contractTotal); test isolation timer                   |
| **X2**           | T2 DrillDown redo + SSR 13 chart                     | 6-10h      | history trail persistence semantics; RSC `'use client'` boundary için Next.js fixture |
| **X3**           | T2 Runtime contrast gate (Playwright + Storybook K5) | 6-10h      | snapshot baseline noise; CI runner GPU farkı                                          |
| **X4**           | T3 Production consumer integrations (3 app)          | 12-18h     | strategic — hangi sayfa, hangi feature, hangi data                                    |
| **X5**           | T3 Doc drift cleanup                                 | 1-2h       | yok                                                                                   |
| **Total**        | 5 PR + plan                                          | **29-47h** | manageable                                                                            |

---

## Per-PR Detail

### PR-X0 — Plan dosyası (this PR)

**Files**:

- `docs/faz-21-8-reality-parity-plan.md` (NEW — bu dosya)

**Verification**: PR commit + push + Codex adversarial review (`mcp__codex__codex` in `read-only` mode) + PARTIAL/AGREE iter chain.

**Codex review questions**:

1. Bu plan kapsam mantıklı mı? T1+T2+T3 sırası doğru mu?
2. XLSX gerçek talep mi yoksa type'tan kaldırmak daha doğru mu?
3. PR-X4 production consumer hangi mfe-app + hangi sayfa için pratik?
4. Runtime contrast gate Storybook K5 + Playwright tek doğru yol mu?

---

### PR-X1 — T1 Fake Removal

**Branch**: `feat/faz-21-8-x1-fake-removal`

#### Item 1: XLSX export (real impl)

**Files**:

- `packages/x-charts/package.json` — `dependencies: { exceljs: '^4.4.0' }`
- `packages/x-charts/src/collaboration/chart-export.ts` — switch'e `xlsx` case ekle:
  ```ts
  if (format === 'xlsx' && data && columns) {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title ?? 'Sheet1');
    ws.columns = columns.map((c) => ({ header: c.headerName, key: c.field }));
    ws.addRows(data);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerDownload(URL.createObjectURL(blob), `${filename}.xlsx`);
    return;
  }
  ```
- `packages/x-charts/src/collaboration/__tests__/chart-export.xlsx.test.ts` — NEW: spy `URL.createObjectURL` + Blob mime check + ExcelJS sheet read-back assert
- `packages/x-charts/.bundle-baseline.json` — re-baseline (exceljs ~210KB unminified, ~80KB gzip)
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/FeatureDemoLive.tsx` `feature-export` case'e XLSX butonu ekle
- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx` `feature-export` sample code'a XLSX örnek

**Test plan**:

- Vitest unit: `exportChart(null, 'xlsx', { data, columns })` → URL.createObjectURL fired + Blob mime correct
- Vitest behavioral: ExcelJS read-back of generated buffer → header row + data row count
- Bundle check: re-baseline gzip size, hard cap 350KB still met (335 → ~415KB? maybe over → consider lazy import)
- **Lazy import** (`await import('exceljs')`) — exceljs sadece XLSX export çağrılırsa yüklensin

**Risk**:

- ExcelJS 210KB raw / ~80KB gzip — wrapperOnly metric'i bozar. Mitigation: `await import()` lazy; wrapperOnly external'a ekle.

#### Item 2: `useRealTimeData interval` (real impl)

**Files**:

- `packages/x-charts/src/useRealTimeData.ts` — body'ye:
  ```ts
  useEffect(() => {
    if (!interval || isPaused) return;
    if (!onTick) return; // explicit opt-in: hook can't auto-emit data without a producer
    const id = setInterval(() => {
      const point = onTick();
      if (point !== undefined) addPoint(point);
    }, interval);
    return () => clearInterval(id);
  }, [interval, isPaused, onTick, addPoint]);
  ```
- Type'a `onTick?: () => T | undefined` ekle
- `packages/x-charts/src/__tests__/useRealTimeData.test.ts` — NEW: `vi.useFakeTimers()` ile interval test
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/FeatureDemoLive.tsx` realtime demo'yu hook-driven impl ile yeniden yaz (kendi setInterval kaldır)

**Verification**:

- `pnpm --filter @mfe/x-charts exec vitest run src/__tests__/useRealTimeData.test.ts`
- Demo deterministic test (FeatureDemoLive realtime fake timer + count assertion)

**Codex review hazırlığı**:

1. `interval` semantiği "auto-tick" → `onTick` opt-in mi, yoksa `addPoint` doğrudan mı? Caller ne emit eder?
2. Pause/resume cleanup correct mi (effect re-run paused değişiminde)?
3. Bundle impact (ExcelJS lazy import doğru mu)?

---

### PR-X2 — T2 Partial → Mature (DrillDown redo + SSR)

**Branch**: `feat/faz-21-8-x2-drilldown-redo-ssr`

#### Item 1: DrillDown history redo (real impl)

**Files**:

- `packages/x-charts/src/cross-filter/createCrossFilterStore.ts` — store'a `pastDrillTrail` + `futureDrillTrail` ekle (her ikisi `DrillLevel[]` snapshot)
- `packages/x-charts/src/drill-down/useDrillDown.ts` — `redo()` action expose
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/DrillDownDemoLive.tsx` — history mode'da redo button restored
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/__tests__/DrillDownDemoLive.test.tsx` — `Test 5: drill 2 levels → undo → redo → original level + breadcrumb match`
- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx` — drill-down-history catalog: redo restored, sample code update
- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartsListing.tsx` — `useDrillDown (with undo)` → `useDrillDown (with undo + redo)`

**Test plan**:

- Drill region → city → undo (back to region) → redo (forward to city) → drillPath length = 1, label = original

**Codex review hazırlığı**:

1. Store-level future-stack mı, hook-level mi (cross-filter store'u büyütmek doğru mu)?
2. `drillTo(index)` mevcut redo'ya alternatif mi yoksa farklı semantik mi?
3. Past/future stack cap (max-depth limit)?

#### Item 2: SSR boundary (13 chart wrapper)

**Files**:

- `packages/x-charts/src/ssr/charts.ts` (NEW) — 13 chart wrapper `'use client'` re-export
- `packages/x-charts/src/ssr/index.ts` — `export * from './charts'` ekle
- `packages/x-charts/CONTRACT.md` SSR section güncelle
- (Test) `packages/x-charts/src/ssr/__tests__/ssr-boundary.test.ts` — RSC import simulation (no DOM access in SSR phase)

**Test plan**:

- Static SSR test: `import * from '@mfe/x-charts/ssr'` → no runtime DOM error
- Optional: Next.js minimal fixture (RSC tree → ClientChart hydration smoke)

**Codex review hazırlığı**:

1. `'use client'` directive doğru yerde mi (her chart-specific wrapper file mı, yoksa tek `ssr/charts.ts` re-export yeterli mi)?
2. KPICard, Sparkline gibi composite chart'lar da SSR re-export'a girmeli mi?
3. RSC fixture test mi, sadece static import smoke yeterli mi?

---

### PR-X3 — T2 Runtime Contrast Gate

**Branch**: `feat/faz-21-8-x3-runtime-contrast-gate`

**Files**:

- `packages/design-system/src/__visual__/x-charts-contrast.visual.ts` (NEW) — Storybook K5 üzerinden Playwright + `@axe-core/playwright` ile contrast smoke
- `.github/workflows/x-charts-runtime-contrast.yml` (NEW) — separate workflow (visual gate gibi)
- `packages/x-charts/CONTRACT.md` §8 — `contrast-runtime` 9th gate olarak ekle
- `docs/ROADMAP.md` — 8 → 9 gate güncelle
- (Optional) `packages/design-system/src/__visual__/__snapshots__/x-charts-contrast.visual.ts/` baseline

**Coverage**:

- 13 chart × 5 theme (light/dark/HC light/HC dark/print) × {default, decal} = 130 koşum
- Her koşum: real DOM render → axe-core color-contrast rule → 0 violation assert
- CSS-var resolution gerçek browser'da olur (jsdom yapamıyor)

**Workflow**:

```yaml
name: x-charts Runtime Contrast Gate
on:
  pull_request:
    paths:
      ['packages/x-charts/**', 'packages/design-system/src/__visual__/x-charts-contrast.visual.ts']
jobs:
  contrast-runtime:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - pnpm install
      - storybook build --config-dir .storybook-k5
      - playwright install chromium
      - playwright test --grep "x-charts contrast"
```

**Test plan**:

- Local: `pnpm exec playwright test --grep "x-charts contrast"` → 130 PASS
- CI: workflow yeşil
- Failure mode: any chart × theme combination violates WCAG AA → axe-core reports → PR blocked

**Codex review hazırlığı**:

1. axe-core color-contrast rule shadow DOM / canvas içinde çalışır mı? ECharts canvas render — axe gerçek pixel mi okur, yoksa accessibility tree mi?
2. 130 koşum CI'da süre ne kadar (Storybook build + Playwright)?
3. Snapshot baseline gerekli mi, yoksa axe assertion yeterli mi?
4. HC palette mevcut state'te 4.5:1 sağlamıyor (PR-F1 Codex notu) — runtime gate açılırsa fail edebilir. Palette redesign gerekli mi?

---

### PR-X4 — T3 Production Consumer Integrations

**Branch**: `feat/faz-21-8-x4-prod-consumer-integrations`

**Stratejik karar gerektirir**: hangi mfe-app + hangi sayfa + hangi feature?

**Önerilebilir kombinasyon**:

#### Item 1: Cross-filter real usage in `mfe-reporting`

- `apps/mfe-reporting/src/modules/hr-demographic-report/DemographicDashboard.tsx` — region + department + grade üçlü linked dashboard
- `CrossFilterProvider` wrap + 3 chart `useChartCrossFilter` ile bağlı
- Filter zinciri: region click → department + grade panel daraltılır
- Real consumer test (jest/vitest mevcut DemographicDashboard.test.tsx genişlet)

#### Item 2: DrillDown real usage in `mfe-reporting/context-health`

- `apps/mfe-reporting/src/modules/context-health/charts/HealthComponentBar.tsx` — project → component → file 3-seviyeli drill
- `useDrillDown` levels: project (root) → component (level 1) → file (level 2)
- Mevcut test cases'i drill-down assertion ile genişlet

#### Item 3: AG Grid bridge real usage in `mfe-users`

- `apps/mfe-users/src/pages/users/UsersPage.tsx` — chart filter (örn. role pie chart) tıklayınca grid `setFilterModel` çağrılır
- Real AG Grid API instance ref + `useGridCrossFilter` wired
- Test fixture: AG Grid mock ya da real headless

**Effort**: ~12-18h, 3 ayrı module integration

**Risk**:

- Strategic — hangi feature gerçekten ürün ihtiyacı?
- AG Grid integration prod data ile test gerek
- Performance impact (cross-filter store overhead per page)

**Codex review hazırlığı**:

1. T3 kapsam doğru mu, yoksa T3 atlanıp X4 başka iş için reserved mı?
2. Feature mapping ürün-anlamlı mı (region drill → department-grade vs.)?
3. AG Grid real integration testi e2e mi, integration mı?

---

### PR-X5 — T3 Doc Drift Cleanup

**Branch**: `chore/faz-21-8-x5-doc-drift-cleanup`

**Files**:

- `packages/x-charts/CONTRACT.md` — her iddia için kanıt-link audit
- `packages/x-charts/README.md` (varsa) veya gör `package.json description`
- `docs/ROADMAP.md` — Faz 21.8 closure note
- `docs/x-charts-ui-ux-tracker.md` — feature status sync

**Audit sample**:

| Eski (overpromise)                   | Yeni (kanıt-bağlı)                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| "Real-time streaming with auto-tick" | "Buffered queue + opt-in `interval` auto-tick (caller provides `onTick`)"                 |
| "WCAG AA contrast guaranteed"        | "WCAG AA static fallback layer (gated) + runtime CSS-var gate (Playwright, Storybook K5)" |
| "Cross-filter built-in"              | "Cross-filter built-in + production usage in `mfe-reporting/hr-demographic`"              |
| "PNG/SVG/PDF/CSV/XLSX export"        | "PNG/SVG/PDF/CSV/XLSX export (XLSX via lazy `exceljs` import)"                            |

**Effort**: ~1-2h

---

## Sequencing & Dependencies

```
PR-X0 (plan)
  ↓
Codex iter 1-3 (plan review)
  ↓
PR-X1 (fakes) — independent
  ↓
PR-X2 (drilldown + ssr) — independent
  ↓
PR-X3 (runtime contrast) — depends on K5 build path (already exists)
  ↓
PR-X4 (prod consumers) — needs X1 (XLSX in real usage)
  ↓
PR-X5 (doc cleanup) — last, references all previous PRs
```

X1 + X2 + X3 paralel olabilir (farklı dosyalar). X4 X1'i bekler. X5 hepsinden sonra.

---

## Success Criteria (kanıt-bazlı)

| Item                | Kanıt                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| XLSX export         | `chart-export.ts:format==='xlsx'` switch case + ExcelJS sheet read-back test PASS |
| Realtime interval   | `useRealTimeData.ts useEffect setInterval` block + fake-timer test PASS           |
| DrillDown redo      | `useDrillDown.redo()` action + Test 5 in DrillDownDemoLive.test PASS              |
| SSR 13 chart        | `import * from '@mfe/x-charts/ssr'` no DOM error in static analysis               |
| Runtime contrast    | 130 Playwright runs PASS + workflow hard-block                                    |
| Cross-filter prod   | mfe-reporting DemographicDashboard real consumer + integration test               |
| DrillDown prod      | mfe-reporting/context-health real consumer + drill assertions                     |
| AG Grid bridge prod | mfe-users real grid + chart filter pair + e2e                                     |
| Doc drift           | every CONTRACT.md claim has file:line / PR# kanıt-link                            |

---

## Risk Matrix

| Risk                                | Likelihood | Impact | Mitigation                                                   |
| ----------------------------------- | ---------- | ------ | ------------------------------------------------------------ |
| ExcelJS bundle weight               | M          | M      | lazy `await import()` ✓                                      |
| HC palette runtime contrast fail    | M          | H      | palette redesign as part of X3 (separate sub-PR)             |
| RSC SSR Next.js fixture flaky       | L          | M      | static import smoke yeterli, fixture optional                |
| Cross-filter store overhead in prod | L          | M      | benchmark X4                                                 |
| AG Grid headless test infra         | M          | M      | real grid in dev mode + screenshot smoke                     |
| T3 strategic uncertainty            | M          | M      | this plan asks for explicit user direction on which app/page |

---

## Tracking Table

| PR               | Status      | Codex iter | Branch                              | Merged |
| ---------------- | ----------- | ---------- | ----------------------------------- | ------ |
| **X0** (this PR) | in progress | pending    | `docs/faz-21-8-reality-parity-plan` | —      |
| X1               | pending     | —          | —                                   | —      |
| X2               | pending     | —          | —                                   | —      |
| X3               | pending     | —          | —                                   | —      |
| X4               | pending     | —          | —                                   | —      |
| X5               | pending     | —          | —                                   | —      |

---

## Sıradaki Adım

1. PR-X0 (bu plan) commit + push + open
2. Codex adversarial review — plan iter 1-N (`mcp__codex__codex` in `read-only`)
3. AGREE alınca PR-X1 başla (XLSX + realtime interval)
4. Auto-merge zinciri: X1 → X2 → X3 → (X4 strategic) → X5

---

_Bu plan 2026-05-03'te oluşturuldu. FAZ 21.4 + Quality-Sprint M1-M4 kapanışı sonrasında x-charts feature parity tahkimatı için yazıldı. "Hiç fake yok" kullanıcı kuralı (No Fake Work HARD RULE) bu planın temel çıkış noktasıdır._
