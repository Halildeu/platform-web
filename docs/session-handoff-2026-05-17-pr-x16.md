# Session Handoff — 2026-05-18 (J) — PR-X16 + P0 campaign-cleanup sprint TAMAMLANDI

> Format: D28 5-alan + sıradaki agent aksiyon listesi.
> Worktree: `.claude/worktrees/tender-mclean-897d65` · x-charts campaign tip = `d2b182f3` (#589)
> (PR #583/#584/#586/#589 squash; #588/#590/#591 başka session — x-charts dışı)

## 1. Bağlam

PR-X16 "ECharts Depth" kampanyası (5 derinlik chart'ı + lazy ECharts
feature-registration) **TAMAMLANDI (5/5)**. Ardından campaign-end
cleanup sprint'i — **P0-1 / P0-2 / P0-3 / P0-4 dördü de shipped +
browser-verified**.

- Kampanya: TreeChart, CalendarHeatmap, PolarChart, ThemeRiverChart, GanttChart.
- **P0-1 — `accessState→access` prop bug fix (#583)**.
- **P0-2 — x-charts/design-lab type-drift (#584)** — 8 chart `description` + 4 niche wrapper.
- **P0-3 — lazy-feature ambient decls → source consumers (#586)**.
- **P0-4 — subpath-barrel parity, 11 campaign charts → `/client` + `/ssr` (#589)**.

`EChartsFeature` lazy union = 10 üye (`tree|graph|parallel|pictorialBar|
candlestick|boxplot|calendar|polar|themeRiver|custom`).

## 2. İddia — MERGED PR (platform-web)

| PR   | başlık                                                            | merge sha  | Codex review                                        |
| ---- | ----------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| #574 | feat(x-charts): CalendarHeatmap (PR-X16b)                         | `696002cd` | `019e355f` AGREE                                    |
| #575 | feat(x-charts): PolarChart (PR-X16c)                              | `5e0409af` | `019e35b3` AGREE                                    |
| #577 | feat(x-charts): ThemeRiverChart (PR-X16d)                         | `6fd4dafd` | `019e3615` AGREE                                    |
| #580 | feat(x-charts): GanttChart (PR-X16e)                              | `a711adc9` | `019e365b` AGREE                                    |
| #583 | fix(x-charts): access gate + click guard, 4 niche wrappers (P0-1) | `192ab54a` | `019e36d9` AGREE                                    |
| #584 | fix(x-charts): x-charts/design-lab type drift (P0-2)              | `28069d0e` | `019e370b` AGREE (plan + post-impl, 1 REVISE)       |
| #586 | fix(x-charts): lazy-feature ambient decls to consumers (P0-3)     | `e11c104a` | `019e37c8` AGREE (plan REVISE→Option C + post-impl) |
| #589 | fix(x-charts): subpath-barrel parity, 11 campaign charts (P0-4)   | `d2b182f3` | `019e3ab3` AGREE (plan + post-impl)                 |

## 3. İspatlar (P0-4 / #589)

- **Subpath-barrel parity**: `@mfe/x-charts/client` + `/ssr` barrel'ları
  Faz 21.11 3D pack'te kalmış; PR-X6/X7/X10/X12/X16 kampanyalarının **11
  chart wrapper'ı** root barrel'da var ama subpath'lerden erişilemiyordu
  (TreeChart, CalendarHeatmap, PolarChart, ThemeRiverChart, GanttChart,
  BoxPlotChart, CandlestickChart, PictorialBarChart,
  ParallelCoordinatesChart, GraphChart, GeoMap).
- Fix: `/client`'a 11 component + type (17→28 wrapper); `/ssr`'ye 11
  type-only export. GeoMap'in `overlays` prop type yüzeyi (12 geo overlay
  type + `GeoJsonFeatureCollection`/`GeoMapLoader`) type-only taşındı;
  runtime registration helper'ları (`ensureGeoMapRegistered` /
  `isGeoMapRegistered`) `/client`'ın component-odaklı charter'ı gereği
  root-only kaldı (Codex Q1). `/client` header 17→28; CONTRACT.md subpath
  tablosu de-count.
- Doğrulama: x-charts tsc 43 (pre-existing baseline, 0 yeni); x-charts
  vitest 2253 pass / 3 skip (`ssr-boundary.test.ts` boundary check'leri
  dahil); bundle contractTotal 333.49 KB; eslint --max-warnings 0 temiz.
- NOT — ortam kurtarma: doğrulama sırasında worktree `node_modules` yok
  oldu (`npx` global-fetch ile maskeliyordu); `git stash` deneyi
  edit'lerin masum olduğunu kanıtladı (x-charts tsc edit'li/edit'siz =
  232 aynı), `pnpm install --frozen-lockfile` ile kurtarıldı, doğrulama
  post-recovery temiz koştu.
- CI #589 tüm check yeşil (advisory dahil 0 kırmızı); admin'siz squash
  merge; archive tag `archive/2026/05/fix-x-charts-subpath-barrel-parity-pr589`.
- testai deploy success; claude-in-chrome browser-verify: PolarChart
  design-lab sayfası tam render (canlı polar/radial chart), console
  temiz, network 281 istek tüm 200. (P0-4 yalnız subpath barrel'ları
  değiştirdi; testai/Vite app root barrel'dan import ettiği için app
  bundle'ı runtime-identical — beklenen.)

## 4. İspatlamaz / Bilinen boşluklar

- (a) ~~`accessState→access` prop bug~~ — **DONE (#583)**.
- (b) ~~mfe-shell tsconfig ambient `.d.ts` (TS7016)~~ — **DONE (#586, P0-3)**.
- (c) ~~`/client` + `/ssr` subpath-parity~~ — **DONE (#589, P0-4)**.
- (d) ~~`ChartPreviewLive.tsx` 8 TS2322~~ — **DONE (#584)**.
- (e) ~~4 niche wrapper 14 TS2353~~ — **DONE (#584)**.
- (f) **count-lock `FULL_CATALOG_PROPS` pre-existing drift** — accumulator
  378 ama 18 enrolled chart'ın gerçek `ChartDetail` prop toplamı 450.
  Gerçeğe çekmek coverage gate'i %76.8'e düşürür → ayrı count-lock/
  coverage governance işi (Codex 019e370b kapsam-dışı onayladı).
- (g) **CONTRACT.md tarihsel "All 13" ifadeleri** — P0-4 subpath
  tablosunu (L483) de-count etti, ama 2 tarihsel/sözleşme bölümünde
  (≈L79, L445) hâlâ "All 13" var. Trivial doc de-count; Codex 019e3ab3
  #589 için non-blocker dedi.

x-charts package tsc CI gate değil (`typecheck` = `echo source-only`);
(f)/(g) CI'yı bloklamıyor.

## 5. Aksiyon Listesi — sıradaki session

- P0-1 / P0-2 / P0-3 / P0-4 — **DÖRDÜ DE DONE. P0 campaign-cleanup sprint KAPANDI.**

PR-X16 derinlik kampanyası (5/5) + campaign-end P0 cleanup sprint
(4/4) tamamlandı. Açık P0 işi YOK. Kalanlar opsiyonel/trivial:

### P1 (opsiyonel) — count-lock governance (§4f)

`FULL_CATALOG_PROPS` accumulator-vs-reality drift'i + gerçek Design Lab
playground coverage hedefi tartışması. Ayrı PR; gate semantiğini
değiştirir, dikkatli scope + Codex consult gerekir.

### P2 (trivial) — CONTRACT.md doc de-count (§4g)

`packages/x-charts/CONTRACT.md` ≈L79 + ≈L445'teki "All 13" → count-free.
Tek dosya, ~2 satır; isteğe bağlı ayrı küçük PR ya da bir sonraki
x-charts PR'ına eklenti.

### Her PR için zorunlu

Cross-AI Codex review (AGREE), admin'siz squash merge,
`ai-post-merge-cleanup.sh`, testai deploy + claude-in-chrome browser
verify (console + screenshot — HARD RULE).

## Yeni Session İçin İlk Komut

```
cd /Users/halilkocoglu/Documents/platform-web/.claude/worktrees/tender-mclean-897d65
git fetch origin && git checkout origin/main   # d2b182f3 veya sonrası
cat docs/session-handoff-2026-05-17-pr-x16.md
```

PR-X16 derinlik kampanyası + P0 campaign-cleanup sprint tamamlandı.
Açık P0 yok — sıradaki session ya P1 (count-lock governance) ya P2
(CONTRACT.md de-count) ile ilerleyebilir, ya da yeni bir feature
sprint'ine geçebilir.
