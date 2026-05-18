# Session Handoff — 2026-05-18 — x-charts §4f count-lock coverage sprint CLOSED (5/5)

> Format: D28 5-alan + sıradaki agent aksiyon listesi.
> Worktree: `.claude/worktrees/tender-mclean-897d65` · §4f sprint tip = `ecdf6bfa` (#601)
> Önceki handoff: `docs/session-handoff-2026-05-18-x-charts-4f-sprint.md` (4f.0+4f.1 mid-sprint).

## 1. Bağlam

PR-X16 campaign-end §4f count-lock **coverage sprint** — bu session
**tamamen kapatıldı**. Önceki handoff sprint'i 2/5'te (4f.0 + 4f.1 done)
bırakmıştı; bu session 4f.2 + 4f.3 + 4f.4 ship etti → **sprint 5/5 kapandı**.

§4f sorunu: Design Lab playground count-lock'u el-bakımlı
`FULL_CATALOG_PROPS = 378` denominator'a göre ölçüyordu; gerçek
enrolled-chart catalog 450'ye drift etmişti — gate %92 raporluyordu ama
honest coverage %76.8'di. §4f.0 AST-derived honest denominator (432)
kurdu; 4f.1–4f.3 numerator'ı doldurdu; 4f.4 legacy continuity gate'i
kaldırıp hard 0.9 gate'i honest denominator'a bağladı.

## 2. İddia — MERGED PR (platform-web)

| PR   | başlık                                                     | merge sha  | Codex review (thread `019e3af0`)       |
| ---- | ---------------------------------------------------------- | ---------- | -------------------------------------- |
| #594 | test(x-charts): §4f.0 AST-derived honest count denominator | `215793fe` | AGREE (önceki session)                 |
| #595 | feat(design-lab): §4f.1 +14 live-editable playground props | `ca1c8522` | AGREE (önceki session)                 |
| #598 | feat(design-lab): §4f.2 +13 markup/brush overlay presets   | `f173ef80` | AGREE — plan + post-impl (1 P3 REVISE) |
| #599 | feat(design-lab): §4f.3 +34 anomaly a11y presets           | `675c9e2c` | AGREE — plan + post-impl               |
| #601 | test(x-charts): §4f.4 gate flip — hard 0.9 @ 432           | `ecdf6bfa` | AGREE — plan + post-impl (finding yok) |

Doc PR'ları (bu/önceki session): #592, #593 (CONTRACT de-count), #597
(mid-sprint handoff).

## 3. İspatlar — count-lock final durum

`apps/mfe-shell/src/pages/admin/design-lab/widgets/__tests__/chartPlaygroundModel.test.ts`:

- **Denominator** AST-derived: `HONEST_LIVE_SURFACE_DENOMINATOR` = 432
  (`DERIVED_CATALOG_PROPS` 450 − `EXCLUDED_SAMPLE_INPUTS` 18). Drift
  imkânsız — `CHART_CATALOG`'tan TypeScript AST ile sayılıyor.
- **Numerator** `EXPECTED_TOTAL` = `PRIMITIVE_TOTAL` 301 + `PRESET_TOTAL`
  92 = **393**.
- Honest coverage **393 / 432 ≈ %91.0** — hard 0.9 gate'i geçiyor.
- `HARD_COVERAGE_FLOOR` = ceil(0.9 × 432) = 389; gate iki assert:
  `EXPECTED_TOTAL ≥ 389` + `EXPECTED_TOTAL / 432 ≥ 0.9`. Legacy
  `LEGACY_CI_CONTINUITY_DENOMINATOR` (360) §4f.4'te kaldırıldı.
- Coverage yolculuğu: §4f.0 honest 332/432 (%76.8 drift teşhisi) →
  §4f.1 346 → §4f.2 359 → §4f.3 393.
- Per-chart exact count'lar (`PRIMITIVE_LIVE_COUNTS` + `PRESET_COUNTS`
  `it.each` kilitleri) korundu.

testai browser-verify (HARD RULE — UI değişen PR'lar):

- **§4f.2** — bar-chart playground'da `markups` preset dropdown render;
  `threshold-line` seçilince chart'a kırmızı kesikli eşik çizgisi (y≈350,
  "Hedef 350" etiketi) paint oldu; PROPS EDİTOR 24→26/32; console temiz;
  286 network 2xx.
- **§4f.3** — bar-chart'ta `anomalySummary` (none/one/multi-outlier) +
  `formatAnomalyAnnouncement` (default/terse/verbose) preset dropdown'ları
  render + selectable; PROPS EDİTOR 26→28/32; URL state persist (base64
  `p=` param); console 0 hata; network 2xx; chart render bozulmadı.
- §4f.4 test-only (UI yok) → browser-verify gerekmedi.

Her PR: vitest yeşil (4f.2 203/203, 4f.3 228/228, 4f.4 160/160), eslint
temiz, tsc 0-yeni hata (git-stash baseline 521=521 her PR'da), CI tam
yeşil (admin'siz squash merge), `ai-post-merge-cleanup.sh` forensic
archive tag, cross-AI Codex review (thread `019e3af0`).

## 4. İspatlamaz / Bekleyen

- **(a) ChartPreviewLive test-harness completeness** — `spawn_task` chip
  açık. `ChartPreviewLive.test.tsx` `vi.mock('@mfe/x-charts')` factory'sinde
  `CalendarHeatmap` / `PolarChart` / `ThemeRiverChart` / `GanttChart`
  sentinel'ları eksik → bu 4 chart'ın §4f.3 forwarding'i sadece resolver
  unit testiyle kapsanıyor (routing/forwarding harness'ı değil). Codex
  (`019e3af0`) "merge blocker değil, test-harness completeness" dedi.
- **(b) CONTRACT.md §1.1 semantic-preservation audit** — önceki
  handoff'tan taşınan açık iş; `packages/x-charts/CONTRACT.md` §1.1
  accent-immune listesi 28-wrapper döneminde stale. Ayrı `spawn_task`
  chip'i; §4f sprint'inden bağımsız.
- **(c) pre-existing TS2345** — `chartPlaygroundModel.test.ts`
  `applyPreset(defaults: Record<string, unknown>)` — §4f.0'dan beri bilinen
  pre-existing tip hatası. §4f sprint'i boyunca baseline'da (521) sabit
  tutuldu, hiçbir §4f PR'ı yeni hata eklemedi. Küçük ayrı temizlik PR'ı.

## 5. Aksiyon Listesi — sıradaki session

§4f count-lock coverage sprint **kapandı (5/5)**. Sıradaki session'ın §4f
işi yok. Açık loose-end'ler düşük öncelikli ve ayrı:

### P2 — test-harness + audit (her ikisi `spawn_task` chip olarak açık)

- `ChartPreviewLive.test.tsx` 4-sentinel ekleme — madde 4(a)
- `CONTRACT.md` §1.1 accent-immune semantic audit — madde 4(b)

### P3 — opsiyonel temizlik

- `chartPlaygroundModel.test.ts` pre-existing `TS2345` fix — madde 4(c)

PR-X16 ECharts-Depth campaign + §4f count-lock sprint tümüyle kapandı.
Design Lab playground honest live-surface coverage %76.8 → %91.0; hard
0.9 gate honest AST-derived denominator (432) üstünde canlı. Sıradaki
büyük iş kullanıcı yönlendirmesi bekliyor.

## Yeni Session İçin İlk Komut

```
cd /Users/halilkocoglu/Documents/platform-web/.claude/worktrees/tender-mclean-897d65
git fetch origin && git checkout origin/main
cat docs/session-handoff-2026-05-18-x-charts-4f-sprint-close.md
```

§4f sprint 5/5 kapandı. honest coverage %76.8 → %91.0, hard gate canlı.
Codex'in tam 5-PR planı + tüm review verdict'leri thread `019e3af0`'da
kayıtlı. Sıradaki session §4f-bağımsız — loose-end chip'leri P2/P3.
