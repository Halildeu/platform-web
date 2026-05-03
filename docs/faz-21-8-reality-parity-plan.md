# FAZ 21.8 — Reality Parity & Maturity Plan (v3, Codex iter-1+2 absorbed)

**Status:** PLAN draft v3 (2026-05-03)
**Owner:** x-charts maintenance
**Goal:** `@mfe/x-charts` kütüphanesinin "rakipler arasında açık ara önde" iddiasını gerçek davranışla **birebir** eşitlemek. Hiçbir özellik fake olmasın, partial olanlar mature seviyeye çıksın, demo-only feature'lar production'da gerçek tüketici kazansın, "kanıt doğru şeyi ölçüyor mu?" sorusu pas geçilmesin.

> **Şu an pazarlama vs gerçek**:
>
> - 13 chart wrapper + AccessControlledProps + 5 AI hook + 8/8 CI gate **gerçek**.
> - Ama: XLSX export `format: 'xlsx'` type'da var, switch'te yok ([chart-export.ts:10, 173 fail-silent](../packages/x-charts/src/collaboration/chart-export.ts)) — **FAKE**.
> - `useRealTimeData interval` option type'da var, hook destructure'dan eksik ([useRealTimeData.ts:46](../packages/x-charts/src/useRealTimeData.ts)) — **FAKE**.
> - DrillDown history "redo" — **store-level zaten var** (`createCrossFilterStore.ts:160`), sadece `useDrillDown` return API'sinde expose edilmemiş + memory cap `redo()` içinde eksik (`createCrossFilterStore.ts:168`) — **PARTIAL surface**, infrastructure mature.
> - SSR `'use client'` boundary `'use client'` sadece `ChartContainer` + `ChartDashboard` için. 13 chart wrapper RSC'de patlar. Ayrıca `package.json exports` map'te `./ssr` subpath YOK — public consumer `import '@mfe/x-charts/ssr'` çözümsüz.
> - Contrast gate STATIC fallback only. Runtime browser CSS-var/canvas pixel asla doğrulanmadı.
> - Cross-filter / DrillDown / AG-Grid bridge sadece Design Lab demo'da. `mfe-reporting/hr-compensation` zaten **bespoke** cross-filter (`CompensationDashboard.tsx:288 useState<CrossFilter[]>`) — migration hedefi olarak en güçlü kanıt.
> - Doc drift: README "All charts meet WCAG AA" / "4.5:1 minimum" iddiası gate olmadan kanıtsız.

> **Bu plan v2**: tüm bu drift'leri kapatır + "kanıt doğru şeyi ölçüyor mu?" T4 katmanını ekler. **6 PR (X0=plan + X1..X5)**, ~32-50h tahmini. Per-PR doc inline güncellenir; X5 sadece final sweep.

---

## v1 → v2 Revize Notu (Codex iter-1 PARTIAL/REVISE/RED absorbed)

| #   | Codex itirazı                                                                                 | v2'de değişen                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | XLSX gerçek implement bundle taşar (343,564/350KB cap, 6.4KB margin), sync→async API kırılımı | **Type'tan kaldır** (deprecate). Future ayrı `@mfe/x-charts/export-xlsx` adapter.                                                  |
| 2   | `interval+onTick` no-op fake'in yeni formu                                                    | **Discriminated union**: `interval` varsa `onTick` zorunlu. Adı `tickIntervalMs`. callback ref kullan.                             |
| 3   | Cross-filter store'da zaten `past`/`future`/`redo()` var                                      | Plan değişti: store değişmez, sadece **useDrillDown.redo/canRedo expose** + `redo()` line 168 memory cap fix.                      |
| 4   | `package.json exports` map'te `./ssr` subpath yok                                             | X2'ye **subpath export ekleme** dahil. Wrapper file-level `'use client'` directive. Composite (KPICard/StatWidget) **dahil etme**. |
| 5   | axe-core color-contrast canvas içinde çalışmaz — false green riski                            | X3'ü **X3a + X3b'e böl**. Gate `axe yerine browser-resolved CSS-var → WCAG math` + SVG renderer fallback for canvas validation.    |
| 6   | HC palette 4.5:1 sağlamıyor — gate açılınca fail                                              | **X3a (palette redesign + math) ayrı PR**, X3b sonra gate açar.                                                                    |
| 7   | hr-demographic değil hr-compensation daha doğru target                                        | X4 birinci hedef **CompensationDashboard bespoke→@mfe/x-charts migration** (gerçek user-facing).                                   |
| 8   | Doc drift X5'e bırakmak yanlış                                                                | **Her PR kendi iddiasını aynı PR'da düzeltir**. X5 sadece final sweep + cross-link audit.                                          |
| 9   | Bağımlılık X4→X1 yanlış                                                                       | Düzeltildi: X4 X1'e bağımlı **değil**. X4 DrillDown consumer X2'yi bekler.                                                         |
| 10  | "Açık ara önde" doğrulaması zayıf                                                             | **T4 eklendi**: package-boundary smoke + bundle chunk budget + perf regression + consumer adoption matrix.                         |

---

## v2 → v3 Revize Notu (Codex iter-2 REVISE absorbed)

Codex iter-2 ana kapsam ve önceliği AGREE; ama 4 plan-level teknik düzeltme istedi. Hepsi absorb edildi:

| #   | Codex iter-2 itirazı                                                                                                            | v3'te değişen                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Realtime narrowing: `'in' / cast` yerine **type guard**                                                                         | PR-X1 Item 2'ye `function hasAutoTick<T>(o): o is RealTimeDataOptionsAutoTick<T> { return typeof o.tickIntervalMs === 'number'; }` user-defined type guard eklendi. Cast pattern bırakıldı. Runtime dev assertion (`tickIntervalMs` set ama `onTick` function değilse explicit throw).                                                                                                                        |
| 2   | Subpath exports: tsconfig/Vite alias **shadowing** riski. `package.json exports` yazmak yetmez, monorepo path alias'ları kapsar | PR-X2 Item 2'ye **explicit smoke**: (a) `tsc --noEmit` ile `import { BarChart } from '@mfe/x-charts/client'` resolve, (b) `mfe-reporting` + `mfe-users` Vite build smoke, (c) `tsconfig.base.json` paths'a explicit subpath entry ekle (`@mfe/x-charts/client`, `@mfe/x-charts/ssr`), (d) Vite alias shadowing kontrolü.                                                                                      |
| 3   | T4 perf 200ms p95 hard gate **agresif** (CI GPU'suz, font/layout flaky)                                                         | PR-X3b T4 perf revize: hard absolute gate yerine **baseline + regression**: PR gate baseline'a göre +20-30% regression fail; absolute soft cap 500-800ms p95; ilk 1-2 PR report-only veri toplama; baseline stabilize olunca hard gate. Ölçüm noktası: ECharts `rendered` event veya custom `chart-ready` callback (Storybook hydration overhead'i hariç). Canvas vs SVG perf ayrı bütçe.                     |
| 4   | T4 adoption scan: `static grep` yetersiz (multiline, re-export, dynamic import, namespace, require kaçar)                       | PR-X5 T4 adoption matrix scan: **AST tabanlı** TypeScript compiler API kullanan script `scripts/ci/x-charts-adoption-scan.mjs`. Yakalanacak node tipleri: `ImportDeclaration`, `ExportNamedDeclaration`, `ExportAllDeclaration`, dynamic `ImportExpression`, `require()` CallExpression. `rg` prefilter olarak kullanılır (hız). Test/story/demo path'leri ayrı bucket'a alınır (production consumer ayrımı). |

Bu 4 düzeltme sonrası plan v3 implementation hazır kabul edilir. Diğer 6 verdict (ad: SSR `'use client'` Vite/Rollup directive ignore behavior, memory cap blast radius düşük, `renderer` opt-in prop breaking değil, palette baseline atomic PR, sıralama X4 split paralel, genel mimari) **AGREE**.

---

## Tier Breakdown

### T1 — Fake Removal (2 item, ~2-4h, küçüldü)

Pazarlama tablosunda yer alan ama implementation'da boş olan iki item. **Reklam ihlali**, en yüksek öncelik. Codex feedback'i sonrası gerçek implement yerine **type-level deprecate** yolu tercih edildi (bundle + API kırılım koruması).

| Item                           | Şu an                                                                                                                                                                                        | Hedef                                                                                                                                                                                                                                                                                                                          | PR  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| **XLSX export**                | `ExportFormat = '...' \| 'xlsx'` (chart-export.ts:10) + JSDoc/dosya başlığı "PNG, SVG, PDF, CSV, XLSX" AMA switch'te (line 161-172) `xlsx` case YOK; çağrılırsa **silent return undefined**. | **Type-level removal**: `ExportFormat = 'png' \| 'svg' \| 'pdf' \| 'csv'`. Dosya başlığı + JSDoc parity ("PNG, SVG, PDF, CSV"). README + CONTRACT.md güncel. ChartDetail sample XLSX butonu kaldır. **Future**: ayrı `@mfe/x-charts/export-xlsx` opt-in adapter (out of scope this FAZ).                                       | X1  |
| **`useRealTimeData interval`** | `RealTimeDataOptions.interval?: number` + JSDoc "auto-advance a tick at this interval (ms)" AMA `useRealTimeData.ts:46` body `interval` field'ını destructure'da OKUMUYOR.                   | **Discriminated union**: ya `RealTimeDataOptionsBase<T>` (no auto-tick) ya `RealTimeDataOptionsAutoTick<T>` (`tickIntervalMs: number; onTick: () => T \| undefined` zorunlu). Body'ye `useEffect` + setInterval + callback-ref pattern. Pause/resume effect cleanup. Runtime `interval` set ama `onTick` yoksa explicit error. | X1  |

### T2 — Partial → Mature (3 item, ~8-14h)

Implementation var ama **bütün** değil. Pazarlama dürüst olmuyor: "olgun" diyemiyoruz.

| Item                                 | Şu an                                                                                                                                                                                                                                                                                                                                                         | Hedef                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | PR       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **DrillDown history redo (surface)** | Store-level `redo()` zaten var (createCrossFilterStore.ts:160-171) + `HistoryEntry.drillPath` snapshot taşıyor (types.ts:48). AMA: (a) `useDrillDown` return API'sinde expose edilmemiş (useDrillDown.ts:38-59 interface eksik), (b) `redo()` action'da memory cap eksik (line 168 raw concat), (c) UI redo button PR-B Codex must-fix sonrası kaldırılmıştı. | (a) `useDrillDown` `redo()` + `canUndo`/`canRedo` boolean expose + `useCrossFilter((s)=>s.future.length>0)` selectors. (b) `redo()` line 168'de `state.past.slice(-(historyCap-1))` cap fix. (c) `DrillDownDemoLive` history mode redo button restored. (d) Test: drill 2 → undo → redo → drillPath length=2 + label match.                                                                                                                                                                                                                                                                                       | X2       |
| **SSR (13 chart wrapper + subpath)** | `ssr/index.ts` 25 satır; `'use client'` sadece `ChartContainer` + `ChartDashboard` re-export. 13 chart wrapper RSC'de direct import patlar. `package.json exports` map'te `.` var, `./ssr` veya `./client` subpath YOK.                                                                                                                                       | (a) Her chart wrapper file'ına (`BarChart.tsx` vs.) **file-level `'use client'`** directive. (b) `package.json exports` map'e `./client` subpath ekle (`./client/index.ts` re-export'u barrel ediyor). (c) `ssr/index.ts` server-safe pure helper'lar (echarts'a dokunan exports kalmaz). (d) Composite (KPICard, StatWidget, ChartContainer, ChartDashboard) **dahil etmez**, ayrı `./composites` subpath veya hep `./client`. (e) `Sparkline` SVG-only ise server-safe kalabilir, kontrol et. (f) RSC fixture: minimal Next.js app router smoke test (`async page.tsx → import @mfe/x-charts/client → render`). | X2       |
| **Contrast gate runtime layer**      | `chart-contrast.contract.test.ts` STATIC fallback hex layer (jsdom; theme.css yüklenmez). 41 assertion. Runtime browser CSS-var resolution + canvas pixel **gate edilmiyor**. ECharts default canvas (echarts-renderer.ts:30); axe-core canvas içinde color-contrast okumaz.                                                                                  | **X3a + X3b split**. X3a: HC palette + token redesign + visual baseline + static math (4.5:1 sağlatır). X3b: gate açar — Storybook K5 build üzerinden Playwright + browser-resolved CSS-var → WCAG math (kendi script) **+** SVG renderer fallback variant her chart için (axe canvas yerine SVG'de okur). 13 chart × 5 theme × {default, decal/HC} = 130 koşum. Workflow `x-charts-runtime-contrast.yml` ek hard gate. CONTRACT §8 8 → 9 gate.                                                                                                                                                                   | X3 (a+b) |

### T3 — Production Consumer + Doc Drift (4 item, ~12-18h)

Demo'da çalışan feature'ları gerçek production app'lerine entegre et + dokümantasyon parity.

| Item                                                       | Şu an                                                                                                                                                                                        | Hedef                                                                                                                                                                                                                                                                                                                                           | PR  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| **Cross-filter real consumer (hr-compensation migration)** | `CompensationDashboard.tsx:288` bespoke `useState<CrossFilter[]>` + manual `effectiveFilters` merge. `@mfe/x-charts` CrossFilterProvider/useChartCrossFilter/useGridCrossFilter kullanmıyor. | `CrossFilterProvider` wrap + 4 chart `useChartCrossFilter` (department/gender/collarType/education). Mevcut `effectiveFilters` map'i drop, store-driven. Mevcut `CompensationDashboard.test.tsx` (varsa) cross-filter assertion ile genişlet. **Kanıt: gerçek route + chart click → store filter set → re-fetch params değişir**.               | X4  |
| **DrillDown real consumer**                                | `useDrillDown` sadece DrillDownDemoLive                                                                                                                                                      | `apps/mfe-reporting/src/modules/context-health/charts/HealthComponentBar.tsx` flat label/value. **Önkoşul**: project→component→file 3-seviyeli data backend'de var mı kontrol et. Varsa drill-down levels uygula. **Yoksa**: bu item'ı X4'ten çıkar, ayrı bir backend story aç (uydurma data ile drill-down "demo değil gerçek" kanıtı vermez). | X4  |
| **AG Grid bridge real (mfe-users)**                        | `useGridCrossFilter` sadece mock GridApi demo                                                                                                                                                | `apps/mfe-users/src/pages/users/UsersPage.ui.tsx` + `widgets/user-management/ui/UsersGrid.ui.tsx` real `gridApiRef`. Role pie chart click → grid `setFilterModel` çağrısı. **Kanıt: Playwright veya integration test'te chart click → API params değişimi assertion**.                                                                          | X4  |
| **Doc drift cleanup**                                      | CONTRACT.md, README, ROADMAP, Design Lab catalog: pazarlama "5 hooks" / "8/8 gate" / "WCAG AA" gibi iddialar kısmen doğru, kısmen overpromise.                                               | **Her PR kendi iddiasını aynı PR'da düzeltir** (X1 chart-export başlık, X2 SSR section, X3 contrast gate). X5 sadece **final cross-link audit** (her CONTRACT.md claim için file:line + PR# kanıt-link). README "WCAG AA guaranteed" → "WCAG AA gated by static + runtime contrast tests".                                                      | X5  |

### T4 — NEW: Truth Validation Layer (~5-8h)

Codex iter-1 RED #11: "kanıt doğru şeyi ölçüyor mu?" T4 doğrulama katmanı.

| Item                          | Şu an                           | Hedef                                                                                                                                                                                                                                           | PR                            |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Package boundary smoke**    | yok                             | Test: `import { BarChart } from '@mfe/x-charts'` server context'te patlar mı? `'@mfe/x-charts/client'` subpath çözülüyor mu? Vitest/jest unit + minimal Next.js fixture.                                                                        | X2 (in-line)                  |
| **Bundle async chunk budget** | wrapperOnly + contractTotal var | Ek metrik: lazy-loaded chunk'lar (XLSX deprecate sonrası kalmazsa skip). Chart-specific tree-shake test'i `verify-tree-shaking.mjs` zaten yapıyor — ek olarak per-feature lazy boundary test.                                                   | X2                            |
| **Perf regression smoke**     | yok                             | Headless Chromium'da 13 chart × 5 theme initial render < 200ms p95 budget. Vitest browser env veya Playwright.                                                                                                                                  | X3 (next to runtime contrast) |
| **Consumer adoption matrix**  | yok                             | Markdown matrix `docs/x-charts-adoption-matrix.md`: hangi mfe-app + sayfa + hangi chart wrapper + hangi feature kullanıyor. CI script `scripts/ci/x-charts-adoption-scan.mjs` ile statik tarama (grep `from '@mfe/x-charts'` kullanım yerleri). | X5                            |

### Total

| PR               | Scope                                                                                | Effort     | Risk                                                    |
| ---------------- | ------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------- |
| **X0 (this PR)** | Plan v2 dosyası + Codex iter-2 review                                                | 0.5h       | yok                                                     |
| **X1**           | T1 fake removal (XLSX type-removal + realtime discriminated union)                   | 2-4h       | minimal — type-only + hook refactor                     |
| **X2**           | T2 DrillDown redo expose + SSR subpath + 13 wrapper 'use client' + T4 boundary smoke | 6-10h      | RSC fixture flaky riski; subpath export breaking change |
| **X3a**          | T2 HC palette/token redesign + static WCAG math 4.5:1                                | 3-5h       | visual snapshot baseline reset                          |
| **X3b**          | T2 Runtime contrast gate (Playwright + CSS-var math + SVG fallback) + T4 perf smoke  | 5-8h       | CI runner GPU; SVG variant test infra                   |
| **X4**           | T3 hr-compensation migration + AG Grid bridge + (context-health drill if data ready) | 8-12h      | strategic — context-health data uncertainty             |
| **X5**           | T3 doc audit final sweep + T4 consumer adoption matrix                               | 2-3h       | yok                                                     |
| **Total**        | 7 PR                                                                                 | **27-43h** | manageable                                              |

---

## Per-PR Detail (v2)

### PR-X0 — Plan dosyası v2 (this PR)

**Files**:

- `docs/faz-21-8-reality-parity-plan.md` (UPDATED — bu dosya, v1 → v2)

**Verification**: Codex iter-2 (`mcp__codex__codex-reply` with v1 threadId 019dedbe-56fc-7413-a51d-459470c362f4) → AGREE → impl chain başlar.

**v2 değişiklikleri özeti**: yukarıdaki "v1 → v2 Revize Notu" tablosu.

---

### PR-X1 — T1 Fake Removal (revised)

**Branch**: `feat/faz-21-8-x1-fake-removal`

#### Item 1: XLSX export — **type-level removal** (revised)

**Files**:

- `packages/x-charts/src/collaboration/chart-export.ts`
  - Line 1: dosya başlığı `Chart Export — PNG, SVG, PDF, CSV, XLSX` → `Chart Export — PNG, SVG, PDF, CSV`
  - Line 7: JSDoc `@see contract P7 DoD: "Export: PNG, SVG, PDF, CSV, XLSX"` → `"Export: PNG, SVG, PDF, CSV"`
  - Line 10: `ExportFormat = 'png' | 'svg' | 'pdf' | 'csv' | 'xlsx'` → drop `'xlsx'`
  - Line 19, 21: `/** CSV/XLSX data rows */` → `/** CSV data rows */` (XLSX kelimesini kaldır)
- `packages/x-charts/CONTRACT.md` P7 DoD section: XLSX iddiasını kaldır
- `packages/x-charts/README.md` line 94 vicinity (Codex'in işaret ettiği "WCAG AA / export claims"): "PNG, SVG, PDF, CSV" listesi
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/FeatureDemoLive.tsx` `feature-export` case: XLSX butonu kaldır (varsa)
- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx` `feature-export` sample code: XLSX örnek kaldır
- (Optional) `packages/x-charts/CHANGELOG.md` veya inline JSDoc deprecate note: "XLSX export was previously type-declared but never implemented. Removed in Faz 21.8 PR-X1. Future: optional `@mfe/x-charts/export-xlsx` adapter."

**Test plan**:

- TypeScript compile: `format: 'xlsx'` kullanan kullanıcı kodu yoksa kırılmaz (sadece public API daralır)
- Vitest: mevcut `chart-export` testleri pass kalır
- Bundle: değişmez (zaten implement yoktu)

**Codex review hazırlığı**:

- ExportFormat narrowing breaking change mi (semver impact)? Internal-only paket olduğu için minor sayılabilir; CHANGELOG note yeterli.

#### Item 2: `useRealTimeData interval` — **discriminated union** (revised)

**Files**:

- `packages/x-charts/src/useRealTimeData.ts`:

  ```ts
  // Type: discriminated union
  export type RealTimeDataOptions<T> = RealTimeDataOptionsBase<T> | RealTimeDataOptionsAutoTick<T>;

  interface RealTimeDataOptionsBase<T> {
    maxPoints?: number;
    onNewPoint?: (point: T) => void;
    tickIntervalMs?: undefined;
    onTick?: undefined;
  }

  interface RealTimeDataOptionsAutoTick<T> {
    maxPoints?: number;
    onNewPoint?: (point: T) => void;
    tickIntervalMs: number; // required when auto-tick
    onTick: () => T | undefined; // required producer
  }

  // Type guard (Codex iter-2 düzeltme: cast yerine user-defined type guard):
  function hasAutoTick<T>(o: RealTimeDataOptions<T>): o is RealTimeDataOptionsAutoTick<T> {
    return typeof (o as RealTimeDataOptionsAutoTick<T>).tickIntervalMs === 'number';
  }

  // Body addition (after existing hook logic):
  const autoTick = hasAutoTick(options) ? options : null;
  const tickIntervalMs = autoTick?.tickIntervalMs;
  const onTickRef = useRef<RealTimeDataOptionsAutoTick<T>['onTick'] | undefined>(undefined);
  onTickRef.current = autoTick?.onTick;

  // Runtime dev assertion: tickIntervalMs set ama onTick function değilse explicit throw
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' &&
      tickIntervalMs &&
      typeof onTickRef.current !== 'function'
    ) {
      throw new Error('useRealTimeData: tickIntervalMs requires onTick callback');
    }
  }, [tickIntervalMs]);

  useEffect(() => {
    if (!tickIntervalMs || pausedRef.current) return;
    const id = setInterval(() => {
      const point = onTickRef.current?.();
      if (point !== undefined) addPoint(point);
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [tickIntervalMs, isPaused, addPoint]);
  ```

- `packages/x-charts/src/__tests__/useRealTimeData.test.ts` (NEW or extend existing): `vi.useFakeTimers()` + auto-tick assertion (5 ticks → buffer length 5 + onTick called 5x); pause cleanup test; runtime dev assertion test (mock NODE_ENV development + tickIntervalMs without onTick → throws). Type guard'ın TS narrowing davranışı için tip-test (`expectTypeOf` veya manual snapshot).
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/FeatureDemoLive.tsx` realtime demo: `tickIntervalMs: 250` + `onTick: () => generateNewPoint()` ile yeniden yaz; mevcut `setInterval` kaldır

**Verification**:

- `pnpm --filter @mfe/x-charts exec vitest run src/__tests__/useRealTimeData.test.ts`
- FeatureDemoLive realtime test (existing fake timer + count assertion) pass kalır
- TypeScript: `expectTypeOf(options).branded.toEqualTypeOf<...AutoTick<T>>()` narrowing assertion

**Codex review hazırlığı (iter-3)**:

1. `hasAutoTick` type guard yeterli güvende mi (consumer'da TS narrowing flow doğru?)
2. Runtime dev assertion `process.env.NODE_ENV !== 'production'` Vite/build environment'ında doğru tree-shake olur mu?
3. `tickIntervalMs` rename mevcut consumer'ları kırar mı (eski adı `interval` zaten okunmuyordu, yani breaking olmayacak)?

---

### PR-X2 — T2 Partial → Mature (DrillDown surface + SSR subpath + 'use client') + T4 boundary

**Branch**: `feat/faz-21-8-x2-drilldown-redo-ssr`

#### Item 1: DrillDown redo surface (revised — store değişmez)

**Files**:

- `packages/x-charts/src/drill-down/useDrillDown.ts`:
  - Interface `UseDrillDownReturn` (line 38-59) ekle:
    ```ts
    /** Re-apply most recent undone change. */
    redo: () => void;
    /** Whether undo is available (past stack non-empty). */
    canUndo: boolean;
    /** Whether redo is available (future stack non-empty). */
    canRedo: boolean;
    /** Undo last drill change. */
    undo: () => void;
    ```
  - Hook body: `useCrossFilter((s) => s.redo)`, `useCrossFilter((s) => s.undo)`, `useCrossFilter((s) => s.past.length > 0)`, `useCrossFilter((s) => s.future.length > 0)`
- `packages/x-charts/src/cross-filter/createCrossFilterStore.ts:168` — memory cap fix:
  ```ts
  // BEFORE (line 168):
  past: [...state.past, currentSnapshot],
  // AFTER:
  past: [...state.past.slice(-(historyCap - 1)), currentSnapshot],
  ```
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/DrillDownDemoLive.tsx` history mode'da redo button restored (canRedo durumuna göre disable)
- `apps/mfe-shell/src/pages/admin/design-lab/widgets/__tests__/DrillDownDemoLive.test.tsx` Test 5 ekle: drill 2 → undo → redo → drillPath length=2 + label match
- `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartsListing.tsx`: "useDrillDown (with undo)" → "useDrillDown (with undo + redo)"
- `packages/x-charts/CONTRACT.md` DrillDown section güncel
- `packages/x-charts/src/cross-filter/__tests__/createCrossFilterStore.test.ts` (varsa, yoksa NEW): memory cap test (50 drill + redo → past length ≤ 50)

**Test plan**:

- Drill region → city → undo (back to region) → redo (forward to city) → drillPath length 1, label = original
- Memory cap test: 60 drill + 60 undo + 60 redo → past + future stack toplamı ≤ 50

**Codex review hazırlığı**:

1. `useCrossFilter((s) => s.past.length > 0)` selector re-render trigger doğru mu (Zustand vanilla store + custom hook bridge)?
2. Memory cap fix mevcut undo/redo testlerini kırar mı?

#### Item 2: SSR subpath + 'use client' (revised)

**Files**:

- `packages/x-charts/package.json` `exports` map güncelle:
  ```json
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./client": {
      "types": "./src/client/index.ts",
      "import": "./src/client/index.ts",
      "default": "./src/client/index.ts"
    },
    "./ssr": {
      "types": "./src/ssr/index.ts",
      "import": "./src/ssr/index.ts",
      "default": "./src/ssr/index.ts"
    }
  }
  ```
- `packages/x-charts/src/client/index.ts` (NEW) — barrel of 13 chart wrappers
- 13 chart wrapper file'ı `BarChart.tsx`, `LineChart.tsx` vs.: file başına `'use client';` directive (TSX file-level, top of file)
- `packages/x-charts/src/ssr/index.ts` (UPDATE): yalnız server-safe pure helper exports (echarts dokunmayan tipler, theme tokens). `ChartContainer`/`ChartDashboard` artık `./client`'dan re-export edilir.
- `packages/x-charts/src/__tests__/ssr-boundary.test.ts` (NEW):
  ```ts
  // T4 boundary smoke
  it('@mfe/x-charts/ssr can be imported in node without DOM', async () => {
    // jsdom elimine, plain node env
    const ssr = await import('@mfe/x-charts/ssr');
    expect(ssr).toBeDefined();
    // No echarts side effect
  });
  it('@mfe/x-charts/client can be imported in jsdom', async () => {
    const client = await import('@mfe/x-charts/client');
    expect(client.BarChart).toBeDefined();
  });
  ```
- `packages/x-charts/CONTRACT.md` SSR section güncel: subpath stratejisi + 'use client' directive politikası açık
- `packages/design-system/src/advanced/charts-bridge/...` (varsa import path migration)
- `apps/mfe-*` import path migration check: hiçbir consumer `@mfe/x-charts` direct import edip RSC'de patlamamalı
- **Codex iter-2 düzeltme: tsconfig paths shadowing**: `tsconfig.base.json` `paths` (varsa) `@mfe/x-charts/client` + `@mfe/x-charts/ssr` explicit entry ekle (yoksa `package.json exports` yine de Node ESM resolve eder ama Vite alias gölgelerse kırılır):
  ```json
  {
    "paths": {
      "@mfe/x-charts": ["packages/x-charts/src/index.ts"],
      "@mfe/x-charts/client": ["packages/x-charts/src/client/index.ts"],
      "@mfe/x-charts/ssr": ["packages/x-charts/src/ssr/index.ts"]
    }
  }
  ```
- **Codex iter-2 düzeltme: Vite alias shadowing kontrol**: `vite.config.ts` veya `vite/shared` alias root'unda `@mfe/x-charts` exact match olmalı, prefix `@mfe/x-charts*` olmamalı (subpath gölgelenir). Inventory: tüm `apps/mfe-*/vite.config.ts` dosyalarında alias scan.

**Composite/Sparkline**:

- `Sparkline.tsx` SVG-only kontrol (echarts dokunmuyorsa server-safe; dokunuyorsa `./client`)
- `KPICard.tsx`, `StatWidget.tsx`, `ChartContainer.tsx`, `ChartDashboard.tsx` → `./client` (echarts dokunuyor)

**Test plan**:

- `pnpm --filter @mfe/x-charts exec vitest run src/__tests__/ssr-boundary.test.ts`
- **Codex iter-2 düzeltme: explicit subpath smoke**:
  - `pnpm --filter @mfe/mfe-reporting exec tsc --noEmit` after migration `from '@mfe/x-charts/client'` import
  - `pnpm --filter @mfe/mfe-users exec tsc --noEmit` aynı şekilde
  - `pnpm --filter @mfe/mfe-reporting exec vite build` (smoke, `tsc` resolve etse de Vite bundler ayrı path)
  - `pnpm --filter @mfe/mfe-users exec vite build`
- (Optional) Minimal Next.js 14 RSC fixture: `app/page.tsx` server component imports `@mfe/x-charts/ssr`, `app/client.tsx` `'use client'` + imports `@mfe/x-charts/client`. Build smoke (`next build`).

**Codex review hazırlığı (iter-3)**:

1. `'use client'` directive Vite Rollup tarafında strip/ignore davranışı (consumer build kırılmaz mı)?
2. tsconfig paths + Vite alias migration tüm 8 mfe-app + design-system için tutarlı mı (gölgelenme yok mu)?
3. `Sparkline` SVG-only kontrolü kanıtla (grep echarts import).

---

### PR-X3 — T2 Runtime Contrast Gate (revised — split into X3a + X3b)

#### PR-X3a — HC Palette/Token Redesign (must come first)

**Branch**: `feat/faz-21-8-x3a-hc-palette-redesign`

**Files**:

- `packages/design-system/src/themes/highContrastLight.css` (or wherever HC tokens live) — adjust `--color-text`, `--color-axis`, `--color-bg` ratios to >= 4.5:1
- `packages/design-system/src/themes/highContrastDark.css`
- `packages/x-charts/src/__tests__/chart-contrast.contract.test.ts` HC assertions update (eğer expected ratio değişiyorsa)
- `packages/x-charts/src/__tests__/__snapshots__/...` baseline reset (visual)
- `packages/x-charts/CONTRACT.md` palette section güncel

**Test plan**:

- Static contrast test 4.5:1 + 3:1 PASS for HC themes
- Visual snapshot baseline reset, `chromatic` review

**Codex review hazırlığı**:

1. Palette değişimi mevcut Storybook K5 visual baseline'larını ne kadar bozar? Approval süreci?

#### PR-X3b — Runtime Contrast Gate

**Branch**: `feat/faz-21-8-x3b-runtime-contrast-gate`

**Depends on**: X3a merged

**Files**:

- `packages/design-system/src/__visual__/x-charts-contrast.visual.ts` (NEW) — Storybook K5 + Playwright. **Stratrejy**:
  - Her chart'ı SVG renderer mode'da render et (`<BarChart renderer="svg" />` test variant — wrapper'ların `renderer` prop'u expose etmesi gerek; bu ek file edit)
  - DOM'dan resolved CSS-var değerleri çek (`getComputedStyle(el).color`)
  - WCAG math `getContrastRatio(fg, bg)` (kendi script `scripts/contrast/wcag.mjs`)
  - 0 violation assert
- (Wrapper edit) Tüm 13 chart wrapper'a `renderer?: 'canvas' | 'svg'` prop expose et, default canvas (production), test variant SVG
- `.github/workflows/x-charts-runtime-contrast.yml` (NEW) — separate workflow
- `packages/x-charts/CONTRACT.md` §8 — `contrast-runtime` 9th gate
- `docs/ROADMAP.md` — 8 → 9 gate güncelle
- (T4 perf smoke — **Codex iter-2 düzeltme**) `packages/x-charts/src/__tests__/render-perf.test.ts` (NEW) — Playwright browser test:
  - **Ölçüm noktası**: ECharts `rendered` event veya custom `chart-ready` callback (Storybook hydration overhead'i hariç)
  - **Gate stratejisi**: hard absolute 200ms değil, **baseline + regression**:
    - PR gate: baseline (önceki main) p95 + 25% regression fail
    - Absolute soft cap: 800ms p95 (alarm, fail değil)
    - İlk 1-2 PR **report-only** (veri toplama, baseline stabilize)
    - Baseline stabilize olduktan sonra hard gate aç
  - **Canvas vs SVG ayrımı**: canvas production perf ayrı bütçe, SVG test variant ayrı bütçe (SVG her zaman daha yavaş)

**Coverage**:

- 13 chart × 5 theme × {default, decal} = 130 koşum
- Her koşum: SVG renderer + DOM CSS-var resolve + WCAG math
- Failure mode: any combination violates 4.5:1 → reports → PR blocked

**Workflow**:

```yaml
name: x-charts Runtime Contrast Gate
on:
  pull_request:
    paths:
      - 'packages/x-charts/**'
      - 'packages/design-system/src/themes/**'
      - 'packages/design-system/src/__visual__/x-charts-contrast.visual.ts'
      - '.github/workflows/x-charts-runtime-contrast.yml'
jobs:
  contrast-runtime:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - checkout
      - pnpm install
      - pnpm --filter @mfe/design-system exec storybook build --config-dir .storybook-k5
      - pnpm exec playwright install chromium
      - pnpm exec playwright test --grep "x-charts contrast"
```

**Test plan**:

- Local: `pnpm exec playwright test --grep "x-charts contrast"` → 130 PASS
- CI: workflow yeşil
- T4 perf: baseline + regression gate (Codex iter-2 revize)

**Codex review hazırlığı (iter-3)**:

1. SVG renderer mode chart wrapper API'sine eklenirse production canvas mode'unu etkiler mi (instance lifecycle re-init, prop spread DOM warning)?
2. WCAG math kendi script vs `wcag-contrast` npm dep — internal-only paket için npm dep ekleyemez miyiz?
3. 130 koşum + 30dk timeout makul mi (visual workflow 15dk benchmark)?
4. Perf baseline storage: GitHub Actions cache mı, ayrı artifact mı, branch'e commit mi (drift riski)?

---

### PR-X4 — T3 Production Consumer Integrations (revised — hr-compensation focus)

**Branch**: `feat/faz-21-8-x4-prod-consumer-integrations`

**Stratejik karar gerektirir**: context-health drill için backend data hazır mı?

#### Item 1: hr-compensation bespoke → @mfe/x-charts migration

**Files**:

- `apps/mfe-reporting/src/modules/hr-compensation-report/CompensationDashboard.tsx`:
  - Line 288 `useState<CrossFilter[]>` kaldır
  - Wrap `<CrossFilterProvider>` (her wrapper'a `groupId="hr-compensation"`)
  - 4 chart `useChartCrossFilter` ile bağla (department/gender/collarType/education)
  - Line 290-299 `effectiveFilters` map'i drop, store'dan oku (`useCrossFilter((s) => s.filters)`)
- `apps/mfe-reporting/src/modules/hr-compensation-report/__tests__/CompensationDashboard.test.tsx`:
  - Cross-filter assertion: chart click → store filter set → re-fetch params değişimi
- (Doc) `docs/x-charts-adoption-matrix.md` (T4) hr-compensation row

**Test plan**:

- Vitest jsdom: chart click simulation → store filter set assertion
- Optional: Playwright e2e on `/reporting/hr-compensation` → real API call params değişimi

**Codex review hazırlığı**:

1. CrossFilter type contract migration: bespoke `CrossFilter[]` → `Map<string, CrossFilterEntry>` semantik kayıp var mı?
2. Re-fetch logic store filter change'ine subscribe edip etmiyor (stale-closure riski)?

#### Item 2: DrillDown — context-health (conditional on data ready)

**Files**:

- `apps/mfe-reporting/src/modules/context-health/charts/HealthComponentBar.tsx`
- (Backend dependency check first) — proje → component → file 3-seviyeli data backend'de var mı?
- Varsa: `useDrillDown` levels, drill-down click handler, breadcrumb UI
- Yoksa: bu item X4'ten çıkar, ayrı story aç

**Codex review hazırlığı**:

1. Backend hazır değilse bu item'ı X4'te tutmak zaman israfı; ayır.

#### Item 3: AG Grid bridge real (mfe-users)

**Files**:

- `apps/mfe-users/src/pages/users/UsersPage.ui.tsx`
- `apps/mfe-users/src/widgets/user-management/ui/UsersGrid.ui.tsx` line 207 (Codex işaret) `gridApiRef`
- Role pie chart added to UsersPage with `useGridCrossFilter`
- Chart click → gridApiRef.current.setFilterModel(...)
- Test: integration test mock'lı veya real grid render assertion

**Codex review hazırlığı**:

1. mfe-users page real route mı, dev-only sayfa mı?
2. AG Grid real ApiRef + chart click sequence integration test e2e gerek mi?

---

### PR-X5 — Final Doc Audit + Adoption Matrix (revised)

**Branch**: `chore/faz-21-8-x5-doc-audit-final`

**Files**:

- `packages/x-charts/CONTRACT.md` — her iddia için kanıt-link audit (file:line + PR#)
- `packages/x-charts/README.md` — overpromise dili düzelt (her iddia kanıt-bağlı)
- `docs/ROADMAP.md` — Faz 21.8 closure note + 9-gate güncel
- `docs/x-charts-ui-ux-tracker.md` — feature status sync
- `docs/x-charts-adoption-matrix.md` (NEW, T4) — markdown matrix:
  ```md
  | App           | Page            | Wrapper            | Feature        |
  | ------------- | --------------- | ------------------ | -------------- |
  | mfe-reporting | hr-compensation | BarChart, PieChart | CrossFilter    |
  | mfe-users     | UsersPage       | PieChart           | AG Grid bridge |
  | ...           | ...             | ...                | ...            |
  ```
- `scripts/ci/x-charts-adoption-scan.mjs` (NEW, T4) — **Codex iter-2 düzeltme: AST tabanlı**, TypeScript compiler API kullanır:
  - Yakalanacak AST node tipleri: `ImportDeclaration`, `ExportNamedDeclaration`, `ExportAllDeclaration`, dynamic `ImportExpression`, `require()` `CallExpression`
  - **Pipeline**: `rg --files-with-matches '@mfe/x-charts'` (hız prefilter) → her dosya için `ts.createSourceFile` + AST walk → import path + named symbol topla
  - **Bucket ayrımı**: production consumer (`apps/mfe-*/src/**`), test (`**/*.test.ts(x)`, `**/__tests__/**`), story (`**/*.stories.tsx`), demo (`apps/mfe-shell/src/pages/admin/design-lab/**`)
  - Output format: markdown matrix + JSON (`docs/x-charts-adoption-matrix.json`) — CI script tüketebilir
  - Failure mode: production consumer'da `from '@mfe/x-charts'` (subpath değil, root) varsa warning (RSC compat boundary olası ihlal)

**Audit sample (her iddia kanıt-bağlı)**:

| Eski (overpromise)                   | Yeni (kanıt-bağlı)                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| "Real-time streaming with auto-tick" | "Real-time buffer + opt-in `tickIntervalMs` + `onTick` producer (discriminated union, type-safe)"   |
| "WCAG AA contrast guaranteed"        | "WCAG AA static fallback (41 assertions) + runtime CSS-var math gate (130 SVG variant runs, X3b)"   |
| "Cross-filter built-in"              | "Cross-filter built-in + production usage in `mfe-reporting/hr-compensation` (X4)"                  |
| "PNG/SVG/PDF/CSV/XLSX export"        | "PNG/SVG/PDF/CSV export. XLSX removed Faz 21.8 X1; future via `@mfe/x-charts/export-xlsx` adapter." |
| "5 AI hooks production-ready"        | "5 AI hooks; useRealTimeData discriminated union (X1), other 4 stable since Faz 21.4"               |
| "8/8 CI quality gates"               | "9/9 CI gates (Faz 21.8 X3b runtime contrast added)"                                                |

**Effort**: ~2-3h

---

## Sequencing & Dependencies (revised)

```
PR-X0 (plan v2)
  ↓
Codex iter-2 review
  ↓
  ├── PR-X1 (T1 fakes) — independent, fast
  ├── PR-X2 (T2 drilldown surface + SSR subpath + T4 boundary) — independent
  ├── PR-X3a (T2 HC palette/token) — independent, must merge before X3b
  │     ↓
  │   PR-X3b (T2 runtime contrast gate + T4 perf) — depends X3a
  ├── PR-X4 (T3 hr-compensation + AG Grid + conditional context-health) — depends X2 (DrillDown surface for context-health item)
  └── PR-X5 (T3 doc audit + T4 adoption matrix) — last, depends X1..X4 merged
```

X1 + X2 + X3a paralel olabilir. X3b X3a'yı bekler. X4 X2'nin DrillDown surface'ini bekler (eğer context-health drill X4'te kalacaksa). X5 hepsinden sonra.

---

## Success Criteria (kanıt-bazlı, revised)

| Item                                | Kanıt                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| XLSX type-removal                   | `chart-export.ts:10` ExportFormat union'da `'xlsx'` yok + grep `'xlsx'` kullanan kod (sample, JSDoc, README) 0 hit                        |
| Realtime discriminated union        | `useRealTimeData.ts:46` body `tickIntervalMs` destructure + setInterval block + fake-timer test PASS + onTick zorunluluğu TS error mesajı |
| DrillDown redo expose               | `useDrillDown.ts:38-59` interface'de `redo`, `canUndo`, `canRedo` field + Test 5 PASS                                                     |
| DrillDown memory cap                | `createCrossFilterStore.ts:168` `slice(-(historyCap-1))` + 60-drill cap test PASS                                                         |
| SSR subpath                         | `package.json` `exports` `./client` + `./ssr` + 13 wrapper'da `'use client'` grep + boundary smoke test PASS                              |
| HC palette redesign                 | static contrast test HC themes 4.5:1 PASS + visual baseline reset                                                                         |
| Runtime contrast gate               | 130 SVG variant Playwright runs PASS + workflow hard-block + 9-gate CONTRACT update                                                       |
| Cross-filter prod (hr-compensation) | `CompensationDashboard.tsx` `<CrossFilterProvider>` wrap + bespoke `useState<CrossFilter[]>` removed + integration test PASS              |
| AG Grid bridge prod                 | `UsersPage.ui.tsx` real `useGridCrossFilter` + integration test PASS                                                                      |
| DrillDown prod (conditional)        | context-health backend ready ise impl + test, değilse story spawn-task                                                                    |
| Doc drift                           | every CONTRACT.md/README claim has file:line / PR# kanıt-link                                                                             |
| T4 boundary smoke                   | `import @mfe/x-charts/ssr` no DOM error + `import @mfe/x-charts/client` works                                                             |
| T4 perf                             | 13 chart × 5 theme initial render < 200ms p95                                                                                             |
| T4 adoption matrix                  | `docs/x-charts-adoption-matrix.md` + scan script CI                                                                                       |

---

## Risk Matrix (revised)

| Risk                                                  | Likelihood | Impact | Mitigation                                                                   |
| ----------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------- |
| Subpath export breaking change for existing consumers | M          | M      | Inventory current `from '@mfe/x-charts'` hits + migration codemod (X2 in-PR) |
| RSC `'use client'` Vite/source-only consumption       | L          | M      | Static smoke yeterli; Next fixture optional                                  |
| HC palette redesign visual baseline noise             | H          | M      | X3a separate PR; chromatic approval flow                                     |
| Canvas vs SVG renderer parity (visual differences)    | M          | M      | Production canvas, test SVG; baseline ayrı                                   |
| Context-health drill backend data uncertainty         | M          | M      | Conditional item; spawn-task if not ready                                    |
| AG Grid headless test infra                           | M          | M      | Mock-first, real route smoke as P2                                           |
| Bundle async chunk budget overhead                    | L          | L      | mevcut bundle check zaten cap koyuyor                                        |

---

## Tracking Table (revised)

| PR               | Status           | Codex iter                      | Branch                              | Merged |
| ---------------- | ---------------- | ------------------------------- | ----------------------------------- | ------ |
| **X0** (this PR) | in progress (v2) | iter-1 absorbed, iter-2 pending | `docs/faz-21-8-reality-parity-plan` | —      |
| X1               | pending          | —                               | —                                   | —      |
| X2               | pending          | —                               | —                                   | —      |
| X3a              | pending          | —                               | —                                   | —      |
| X3b              | pending          | —                               | —                                   | —      |
| X4               | pending          | —                               | —                                   | —      |
| X5               | pending          | —                               | —                                   | —      |

---

## Sıradaki Adım

1. PR-X0 v2 commit + push (PR #174 update)
2. Codex iter-2 (`mcp__codex__codex-reply` threadId 019dedbe-56fc-7413-a51d-459470c362f4) — plan v2 review
3. AGREE alınca PR-X1 başla (XLSX type-removal + realtime discriminated union)
4. Auto-merge zinciri: X1 → X2 → X3a → X3b → X4 → X5

---

_Bu plan v2 2026-05-03'te oluşturuldu. v1 Codex iter-1 PARTIAL/REVISE/RED feedback'i absorb edildi. FAZ 21.4 + Quality-Sprint M1-M4 kapanışı sonrasında x-charts feature parity tahkimatı için yazıldı. "Hiç fake yok" kullanıcı kuralı (No Fake Work HARD RULE) bu planın temel çıkış noktasıdır._
