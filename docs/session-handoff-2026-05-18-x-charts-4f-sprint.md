# Session Handoff — 2026-05-18 — x-charts §4f coverage sprint (4f.0+4f.1 done, 4f.2–4f.4 remaining)

> Format: D28 5-alan + sıradaki agent aksiyon listesi.
> Worktree: `.claude/worktrees/tender-mclean-897d65` · §4f sprint tip = `ca1c8522` (#595)
> Önceki handoff: `docs/session-handoff-2026-05-17-pr-x16.md` (PR-X16 + P0 sprint kapanışı).

## 1. Bağlam

PR-X16 campaign-end §4f follow-up: count-lock **coverage sprint**. Önceki
handoff §4f'i "count-lock `FULL_CATALOG_PROPS` drift" açık boşluğu olarak
bırakmıştı. Bu session:

- §4f'i Codex (thread `019e3af0`) bağımsız AST sayımıyla **doğruladı** —
  drift gerçek: `chartPlaygroundModel.test.ts` `FULL_CATALOG_PROPS`
  accumulator'ı 378, gerçek enrolled-chart catalog'u 450; gate %92.2
  raporluyordu ama honest coverage %76.8 (denominator drift).
- Kullanıcı kararı (AskUserQuestion ×2): **(B) Coverage sprint** —
  threshold düşürme yok; **anomaly a11y preset'leri coverage say** —
  tam 5-PR sprint onaylandı.
- Codex 5-PR plan verdi: 4f.0 truth-scaffold → 4f.1/4f.2/4f.3 coverage
  dalgaları → 4f.4 gate-flip.
- Bu session **4f.0 + 4f.1 ship etti (2/5)**.

## 2. İddia — MERGED PR (platform-web)

| PR   | başlık                                                                | merge sha  | Codex review                                              |
| ---- | --------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| #592 | docs(x-charts): 2026-05-18 handoff — PR-X16 + P0 cleanup sprint close | `9ccdb396` | doc-only, review yok                                      |
| #593 | docs(x-charts): de-count stale "All 13" wrapper counts (P2)           | `a5133da4` | `019e3af0` AGREE (1 REVISE → §1.1 L123 over-claim revert) |
| #594 | test(x-charts): AST-derived honest count-lock denominator (§4f.0)     | `215793fe` | `019e3af0` AGREE                                          |
| #595 | feat(design-lab): +14 live-editable playground props (§4f.1)          | `ca1c8522` | `019e3af0` AGREE                                          |

## 3. İspatlar — count-lock güncel durum

`apps/mfe-shell/src/pages/admin/design-lab/widgets/__tests__/chartPlaygroundModel.test.ts`:

- **§4f.0 (#594)** — `countChartCatalogProps()` helper'ı `ChartDetail.tsx`
  `CHART_CATALOG` const'unu TypeScript AST ile sayar. `DERIVED_CATALOG_PROPS`
  = 450, `EXCLUDED_SAMPLE_INPUTS` = 18, `HONEST_LIVE_SURFACE_DENOMINATOR`
  = 432. Denominator artık türetilmiş → catalog'tan drift edemez.
  `import.meta.url` jsdom pool'da `file:`-URL değil; path `process.cwd()`
  candidate'larıyla çözülür.
- **§4f.1 (#595)** — +14 live-editable primitive: Bar +6 (stacked/
  showBackground/barGap/barCategoryGap/valueAxisMin/valueAxisMax), Line +2
  (step/connectNulls), Area +2 (step/connectNulls), Pie +1 (roseType),
  Scatter +3 (large/largeThreshold/crossFilterRequired). `LIVE_PROP_SUPPORT`
  Set + `ChartPreviewLive` case-JSX wiring. numerator 332 → **346**.
- Güncel honest coverage: **346/432 ≈ %80.1**. Legacy CI-continuity gate
  (`LEGACY_CI_CONTINUITY_DENOMINATOR = 360`) `346/360 ≥ 0.9` → yeşil
  (transitional; §4f.4'te kaldırılacak).
- Doğrulama: vitest chartPlaygroundModel + ChartPreviewLive 187/187 pass;
  eslint temiz; mfe-shell tsc 0-yeni hata (git-stash baseline; dosyadaki
  tek `TS2345` pre-existing).

## 4. İspatlamaz / Bekleyen

- **(a) §4f.1 testai browser-verify** — #595 `ChartPreviewLive.tsx`
  (Design Lab playground UI) değiştirdi → testai deploy sonrası
  claude-in-chrome ile playground'da yeni 14 editor kontrolünün render +
  çalıştığı doğrulanmalı (HARD RULE — UI değişikliği browser-verify
  yapılmadan "tamamlandı" sayılmaz). **Sıradaki session'ın ilk aksiyonu.**
- **(b) CONTRACT.md §1.1 semantic-preservation audit** — bu session #593
  sırasında ayrı `spawn_task` chip'i açıldı. §1.1 accent-immune listesi
  (Gauge/Heatmap/Waterfall) + "other 10" sayısı 28-wrapper döneminde
  stale; CalendarHeatmap da gradient için accent-immune. 28-chart
  renk-semantiği audit'i gerekir. §4f sprint'inden bağımsız.

## 5. Aksiyon Listesi — sıradaki session

### P0 — §4f.1 browser-verify (önce)

#595 testai deploy zincirini izle (CI Web Image Build → Deploy testai
auto, platform-k8s-gitops). Sonra `https://testai.acik.com/admin/design-lab`
playground'da bar/line/area/pie/scatter chart'larının yeni editor
kontrollerini (stacked toggle, step/roseType dropdown, large, barGap, vb.)
claude-in-chrome ile doğrula — console temiz + network 2xx + screenshot.

### P0 — §4f.2 (markup preset dalgası, +~10)

Codex planı (thread `019e3af0`): `scatter-chart.onBrushSelection` preset;
Bar/Scatter/Heatmap/Waterfall için markup + markup-click preset. Scope:
`COMPLEX_PROP_PRESETS`, resolver helper(ler), `ChartPreviewLive` wiring,
`PRESET_COUNTS` test güncellemesi. numerator 346 → ~356.
DİKKAT — Codex: yalnızca gerçekten preview'a etkisi olan markup'lar
sayılmalı; Treemap/Sankey/Sunburst NO-OP markup prop'ları numerator'a
taşınmamalı.

### P0 — §4f.3 (anomaly a11y preset dalgası, +34)

17 enrolled chart'ta (Gauge hariç) `anomalySummary` +
`formatAnomalyAnnouncement` preset'e dönüştürülür (kullanıcı açıkça
onayladı — anomaly a11y preset'leri coverage say). Scope: model preset
metadata, resolver helper'lar, `ChartPreviewLive` forwarding, test.
numerator ~356 → ~390.

### P0 — §4f.4 (gate flip)

Legacy `LEGACY_CI_CONTINUITY_DENOMINATOR` gate'ini kaldır; hard gate →
`total >= 389` (= ceil(0.9 × 432)) + `total / 432 >= 0.9`. Per-chart
exact count'ları kilitli bırak. Küçük PR.

### Her PR için zorunlu

Cross-AI Codex review (thread `019e3af0`'a `codex-reply` ile devam),
admin'siz squash merge (CI tüm yeşil), `ai-post-merge-cleanup.sh`. UI
değişikliği olan PR'larda (4f.2/4f.3 `ChartPreviewLive` değiştirir)
testai deploy + claude-in-chrome browser-verify (HARD RULE).

## Yeni Session İçin İlk Komut

```
cd /Users/halilkocoglu/Documents/platform-web/.claude/worktrees/tender-mclean-897d65
git fetch origin && git checkout origin/main
cat docs/session-handoff-2026-05-18-x-charts-4f-sprint.md
```

§4f sprint 2/5 (4f.0 truth-scaffold + 4f.1 +14 coverage) ship edildi;
honest coverage %76.8 → %80.1. Sıradaki session: önce §4f.1
browser-verify, sonra §4f.2 → §4f.3 → §4f.4. Codex'in tam 5-PR planı +
tüm kullanıcı kararları (B coverage sprint + anomaly-wave say) thread
`019e3af0`'da kayıtlı.
