# PR-A0 Bundle Taxonomy & Duplicate Package Detection

> **Belge tipi**: Runbook
> **Scope**: PERF-INIT-V2 PMD §4.2 PR-A0
> **Status**: Scaffold (canary mfe-shell first; diğer MFE'ler sonraki PR'larda)

---

## 1. Amaç

PMD §2.1 KPI matrisi gösteriyor ki `/login`, `/home`, `/admin/reports` cold load'larında **decoded JS ~50 MB**. Bu sayı route'a göre değişmiyor — bu duplicate package signal'i. PR-A0 bunun root-cause kanıtını üretir:

1. **Per-route taxonomy**: hangi chunk hangi initiator'dan geliyor, category breakdown
2. **Per-MFE bundle stats**: rollup-plugin-visualizer JSON + HTML treemap
3. **Cross-MFE duplicate report**: aynı package'ın kaç MFE'de yer aldığı + excess decoded size
4. **Chrome trace**: long task attribution (hangi script main-thread'i bloklamış)

PR-B1a (AG Grid lazy split) + PR-B1b (design-system light entry) + PR-B2 (MF shared scope parity) PR'larının ROI'sini bu kanıtla ölçeceğiz.

---

## 2. Araç envanteri

| Tool                                        | Konum                                                             | Amaç                                        |
| ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `rollup-plugin-visualizer`                  | `scripts/vite-plugins/bundle-visualizer.ts` (Vite plugin wrapper) | Per-MFE treemap + raw stats JSON            |
| `scripts/ci/bundle-taxonomy.mjs`            | Playwright runner                                                 | Per-route resource breakdown + Chrome trace |
| `scripts/ci/duplicate-package-detector.mjs` | Node script                                                       | Cross-MFE duplicate aggregation             |
| `tests/perf/bundle-stats/`                  | Output dizini                                                     | HTML + JSON artifact                        |

---

## 3. Kullanım

### 3.1 Per-MFE bundle stats üretmek

```bash
# Tek MFE (canary):
ANALYZE_BUNDLE=1 pnpm --filter mfe-shell build

# Tüm MFE'ler (sonraki PR'larda her vite.config.ts'e plug eklendikçe):
ANALYZE_BUNDLE=1 pnpm -r --filter 'mfe-*' build
```

Çıktı:

- `tests/perf/bundle-stats/mfe-shell/treemap.html` (görsel treemap)
- `tests/perf/bundle-stats/mfe-shell/stats.json` (raw-data JSON)

### 3.2 Per-route taxonomy + Chrome trace

```bash
# Local dev server (npm run dev önce başlatılmalı):
node scripts/ci/bundle-taxonomy.mjs --target local

# testai (auth gerektirir):
node scripts/ci/bundle-taxonomy.mjs \
  --target testai \
  --auth-storage tests/perf/auth-storage-state.json \
  --routes /login,/home,/admin/users,/admin/access,/admin/reports/fin-muhasebe-detay
```

Çıktı:

- `tests/perf/bundle-stats/<route-slug>/taxonomy.json` (her route için)
- `tests/perf/bundle-stats/<route-slug>/trace.zip` (Playwright trace; **NOT** Chrome DevTools format — bkz §4)
- `tests/perf/bundle-stats/all-routes.json` (aggregate)

### 3.3 Duplicate package report

```bash
# stats.json dosyaları üretildikten sonra:
node scripts/ci/duplicate-package-detector.mjs
```

Çıktı (stdout + JSON):

- `tests/perf/bundle-stats/duplicates.json`
- stdout: Top 20 duplicate package, mfeCount + totalRenderedKB + excessKB

---

## 4. Playwright trace inceleme

`trace.zip` Playwright trace formatı (Chrome DevTools formatı **değil**; gerçek Chrome trace için PR-A0.b CDP `Tracing.start`/`Tracing.end` gerek). Açmak için:

```bash
npx playwright show-trace tests/perf/bundle-stats/<route-slug>/trace.zip
```

Playwright trace viewer şunları gösterir:

- Network waterfall (resource loading + timing)
- DOM snapshots
- Console logs
- Action timeline (page.goto, evaluate, etc.)

**Long task attribution sınırı**: Playwright trace `devtools.timeline` v8 entries içermez. TBT/long task root-cause için browser performance.getEntriesByType('longtask') zaten taxonomy.json `perfSnapshot.longTasks` altında (PR-M1 harness). Daha detaylı CDP-level Chrome trace PR-A0.b scope.

PR-A0'ın temel kanıt sorusu: "TBT 2937ms — hangi script bunu yapıyor?". Taxonomy `perfSnapshot.longTasks[].attribution` alanı + Playwright trace timeline ile çapraz analiz yapılır. CDP integration sonraki PR.

---

## 5. Category taxonomy (bundle-taxonomy.mjs `categorise()`)

| Category                  | Matches                                       | Notlar                                 |
| ------------------------- | --------------------------------------------- | -------------------------------------- |
| `mf-shared:design-system` | `loadShare__design_system` patterns           | En büyük duplicate suspect             |
| `mf-shared:react`         | `loadShare__react` patterns                   | React/ReactDOM shared singleton check  |
| `mf-shared:<other>`       | `loadShare__<name>__` pattern                 | Diğer shared scope items               |
| `mf-remote-entry`         | `remoteEntry.js`                              | MF runtime + remote bootstrap          |
| `mf-virtual`              | `virtual_mf`, `virtualExposes`, `_virtual_mf` | MF stubs (16+ per Codex önceki gözlem) |
| `mf-rolldown`             | `rolldown` patterns                           | Rolldown-specific federation chunks    |
| `app-entry`               | `/assets/index-<hash>.{js,mjs}`               | App entry point                        |
| `app-chunk`               | initiator=script (other)                      | App-level lazy chunks                  |
| `css`                     | `.css` suffix                                 | Stylesheet payload                     |
| `font`                    | `.woff2?/.ttf/.otf/.eot`                      | Font payload                           |
| `image`                   | `.svg/.png/.jpg/.webp/.avif/.ico`             | Image asset                            |
| `api`                     | `/api/` path                                  | Backend API calls                      |
| `preload`                 | initiator=link                                | Preload helpers, module preloads       |
| `other`                   | Fallback                                      | Categorisation gap, inspect            |

---

## 6. Beklenen ROI ölçümü

PR-A0 sonrası `duplicates.json` raporuna bakarak şu hipotezler doğrulanır:

| Hipotez                                      | Kanıt sinyali                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@mfe/design-system` 8+ MFE'de duplicate var | `duplicates.json` `@mfe/design-system` mfeCount >= 8 + excessRenderedKB > 5000                            |
| AG Grid Enterprise shell bootstrap'a sızdı   | `mfe-shell/stats.json` `ag-grid-enterprise` veya `@mfe/design-system/advanced/data-grid` nodeMetas içinde |
| React duplicate yok (singleton OK)           | `react` mfeCount = 1 veya excessKB < 50                                                                   |
| ECharts shell'de var mı?                     | `mfe-shell/stats.json` `echarts` arandı, bulunduysa B4b reports deep split önemli                         |

Bu kanıt zemini olmadan PR-B1a/B1b/B2 effort'unu doğrulayamayız.

---

## 7. Sonraki PR'lar bağlantısı

| Bulgu                                        | Sonraki PR                                            |
| -------------------------------------------- | ----------------------------------------------------- |
| AG Grid shell'de                             | PR-B1a (AG Grid lazy split)                           |
| design-system 8+ duplicate                   | PR-B1b (light entry) + PR-B2 (MF shared scope parity) |
| `react` duplicate                            | PR-B2 prep (singleton verify)                         |
| `i18n` payı >300 KB                          | PR-B4c (i18n tree-shake — conditional)                |
| Font payı >100 KB                            | PR-B4d (font-display swap + subset — conditional)     |
| Long task attribution: Sentry/OTel boot      | PR-B3e (third-party RUM audit)                        |
| Long task attribution: shell-services-wiring | PR-B3a (idle wiring)                                  |

---

## 8. Scope

**Bu PR'da var**:

- `bundle-visualizer.ts` Vite plugin wrapper (env-gated)
- `mfe-shell/vite.config.ts` plug-in (canary)
- `bundle-taxonomy.mjs` Playwright runner + Chrome trace
- `duplicate-package-detector.mjs` aggregator
- Bu runbook + package.json scripts

**Bu PR'da YOK** (sonraki PR'lara):

- Diğer 7 MFE vite.config.ts'lerine plug ekleme (her biri ayrı PR veya batch PR)
- CI workflow integration (PR-G1 scope)
- Auth storage state generator (PR-S1.b/B4 conditional)
- Long task attribution otomatik parser (manuel chrome://tracing inceleme)

---

## 9. Bilinen sınırlar

1. **`mfe-shell` canary**: bu PR sadece mfe-shell için bundle stats üretir. Duplicate detector `mfeCount >= 2` filtresi uyguladığı için tek MFE'de **duplicates listesi boş çıkar** (cross-MFE duplicate ancak 2+ MFE entegre olduğunda anlam taşır). Diğer 7 MFE'lerin integration PR'ları (per-MFE veya batch) sonra gelecek.
2. **Auth storage**: testai için real-user storage state PR-S1.b veya B4 conditional ile üretilecek. Authenticated route'lar `--auth-storage` zorunlu (script fail-fast).
3. **Trace formatı**: Playwright trace (`trace.zip`), Chrome DevTools formatı değil. CDP `Tracing.start`/`Tracing.end` ile gerçek Chrome trace PR-A0.b scope.
4. **Long-task root-cause**: otomatik parser yok; `taxonomy.json` `perfSnapshot.longTasks` + Playwright trace cross-analiz manuel (gelecek PR).
5. **Source map dependency**: rollup-plugin-visualizer `sourcemap: false` (build hızı + repo size); source-level granularity için ayrı `source-map-explorer` runs gerekecek.

---

## 10. Test komutları

```bash
# Mfe-shell stats üret:
ANALYZE_BUNDLE=1 pnpm --filter mfe-shell build

# stats.json + treemap.html kontrol et:
ls tests/perf/bundle-stats/mfe-shell/

# Duplicate detector (sadece mfe-shell varsa, MFE içi self-duplicate gösterir):
node scripts/ci/duplicate-package-detector.mjs

# Per-route taxonomy (local dev server):
npm run dev &
node scripts/ci/bundle-taxonomy.mjs --target local --routes /login

# package.json wrapper:
npm run bundle:analyze            # ANALYZE_BUNDLE=1 build for mfe-shell
npm run bundle:taxonomy           # Playwright runner
npm run bundle:duplicates         # aggregator
```

---

## 11. Referanslar

- PMD: `docs/performance/PERF-INIT-V2-plan.md` §4.2 PR-A0
- PR-M1 perf-observer: `apps/mfe-shell/src/lib/perf-observer.ts`
- Performance budgets: `performance-budgets.json`
- Cross-AI consensus thread: `019e1dc8` (mutabakat) + `019e1de0` (adversarial AGREE)
