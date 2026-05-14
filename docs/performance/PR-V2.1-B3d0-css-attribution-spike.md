# PR-V2.1-B3d0 — CSS Attribution Audit Spike

> **Belge kodu**: `PR-V2.1-B3d0-spike`
> **Tarih**: 2026-05-14
> **Sprint**: PERF-INIT-V2.1 prod-readiness sub-wave
> **PMD parent**: `platform-k8s-gitops/docs/performance/PERF-INIT-V2-prod-readiness-v9.1.md` §2.7 B3d0
> **Cross-repo**: platform-k8s-gitops (PMD authoritative) + platform-web (impl)

---

## §1. Amaç

CSS bundle attribution audit — `/login` cold-anonymous için CSS payload breakdown:

- AG Grid theme CSS (Material variants)
- ECharts / chart CSS
- Design-system CSS (`@mfe/design-system`)
- Global CSS / font CSS
- Route-specific CSS

PMD v9.1 §2.7 B3d0 DoD: "CSS attribution audit + source-map-explorer CSS bundle breakdown".

Codex tur-2 NARROW: "B3d → 3 sub-PR (B3d0 audit / B3d1 route-lazy / B3d2 plugin conditional)". Bu B3d0 = audit phase.

---

## §2. Mevcut Durum (Live verify)

Mevcut `scripts/ci/bundle-taxonomy.mjs` (PR-A0) CSS bundle tracking:

```javascript
// line 232
if (r.category === 'css') acc.cssDecodedKB += (r.decodedBodySize || 0) / 1024;
```

Totals'da `cssDecodedKB` field aggregate olarak mevcut ama **per-source attribution YOK** (hangi paketten geldi, AG Grid mi DS mi unknown).

`/login` cold-anonymous 4-canary measurement (testai `BUILD_SHA=2a59704`):

- decodedKB total: 9,088 KB
- cssDecodedKB: bilinmiyor (totals aggregate; breakdown audit eksik)

**B3d0 spike scope**: CSS attribution analyzer ekleyerek decoded CSS payload'ın **hangi paketten** geldiğini ölç.

---

## §3. Pattern Selection (3 option)

### §3.1 Option A — Bundle taxonomy CSS detail extension

`scripts/ci/bundle-taxonomy.mjs` extension: CSS resource'lar için **initiator chain + dependency tree** capture. Hangi paket import zinciri ile CSS getirdi.

| Avantaj                           | Dezavantaj                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mevcut script reuse               | Initiator chain CDP `Network.requestWillBeSent` gerekli; Playwright `tracing.start` ile context aware mı? |
| Runtime measurement (deploy-time) | Source map gerekli — production build source map devre dışıysa yetersiz                                   |

### §3.2 Option B — source-map-explorer CSS pattern

`source-map-explorer` ile **dist CSS file breakdown** — paket bazlı CSS size.

| Avantaj                                                                  | Dezavantaj                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Standard tool, package ecosystem                                         | Build-time (deploy öncesi); runtime measurement değil |
| Source map zorunlu — prod-equivalent sourcemap-enabled analysis build OK | Production dist size DEĞİL, build artifact size       |

### §3.3 Option C — rollup-plugin-visualizer (Vite plugin)

Vite plugin ile **build-time CSS bundle visualization** (treemap).

| Avantaj                                   | Dezavantaj                                    |
| ----------------------------------------- | --------------------------------------------- |
| Vite-native; mevcut Vite config'e eklenir | Manuel inspection; CI artifact extraction zor |
| Treemap HTML export — okuyucu UX iyi      | CSS attribution implicit (chunk-based)        |

**Tercih**: **Option B + Option A combined**:

- B (build-time): source-map-explorer CSS breakdown → prod-equivalent sourcemap-enabled analysis build CI artifact (deploy öncesi early signal)
- A (runtime): bundle-taxonomy.mjs CSS source attribution extension → testai runtime measurement (deploy-time)

İki kanal cross-validate eder; B build-time + A runtime farkı stale bundle veya CDN cache layer'ı ortaya çıkarır.

---

## §4. Implementation Contract (B3d0 audit only — B3d1 lazy-load ayrı PR)

### §4.1 source-map-explorer CSS Pattern (Build-time) — Codex `019e26ee` blocking-1 absorb

**Dependencies + path** (B3d0-impl PR scope):

- `source-map-explorer` devDependency ADD gerek (mevcut `rollup-plugin-visualizer` var ama farklı output)
- Output path: `apps/mfe-shell/dist/assets/*.css` (mfe-shell only; remote apps ayrı build artifacts)
- Production build sourcemap default OFF → `CSS_ATTRIBUTION=1` env ile sourcemap-enabled analysis build

```json
// package.json scripts (B3d0-impl PR)
{
  "scripts": {
    "perf:css-breakdown": "CSS_ATTRIBUTION=1 pnpm --filter mfe-shell build && source-map-explorer apps/mfe-shell/dist/assets/*.css --html docs/performance/css-breakdown.html --json docs/performance/css-breakdown.json"
  },
  "devDependencies": {
    "source-map-explorer": "^2.5.x"
  }
}
```

`vite.config.ts` extension: `CSS_ATTRIBUTION` env-aware sourcemap enable.

Output `docs/performance/css-breakdown.json`:

```json
{
  "files": [
    {
      "path": "node_modules/ag-grid-community/styles/ag-grid.css",
      "totalBytes": 156000,
      "ratio": 0.42
    },
    {
      "path": "node_modules/echarts/...",
      "totalBytes": 89000,
      "ratio": 0.24
    },
    ...
  ],
  "totalBundleBytes": 372000
}
```

### §4.2 bundle-taxonomy.mjs CSS Source Attribution Extension — Codex `019e26ee` blocking-2 absorb

**Confidence-based attribution schema** (Codex tur-1 absorb): Path regex heuristic karar kapısı OLAMAZ; sadece **served-asset bucket** + **low/medium confidence**. Package attribution **B kanalına (source-map-explorer)** bağımlı kalmalı.

Output schema:

```typescript
type CssAttribution = {
  source: string; // 'remote:<name>' | 'shell-root' | 'ag-grid?' | 'echarts?' | 'design-system?' | 'unknown'
  decodedKB: number;
  ratio: number;
  confidence: 'high' | 'medium' | 'low'; // high = sourcemap evidence; medium = manifest; low = URL heuristic
  evidence: Array<'url' | 'sourcemap' | 'manifest' | 'remote'>;
  assetUrl: string;
};
```

```javascript
// scripts/ci/bundle-taxonomy.mjs extension
if (r.category === 'css') {
  acc.cssDecodedKB += (r.decodedBodySize || 0) / 1024;
  // YENI: CSS attribution (confidence-aware)
  const attribution = extractCssAttribution(r);
  acc.cssBreakdown = acc.cssBreakdown || [];
  acc.cssBreakdown.push(attribution);
}

function extractCssAttribution(resource) {
  const url = new URL(resource.name);
  const path = url.pathname;
  const decodedKB = (resource.decodedBodySize || 0) / 1024;
  const result = { decodedKB, ratio: 0, confidence: 'low', evidence: ['url'], assetUrl: path };
  // Remote bucket — confident URL evidence (path namespace)
  const remoteMatch = path.match(/^\/remotes\/([^/]+)\/assets\//);
  if (remoteMatch) {
    result.source = `remote:${remoteMatch[1]}`;
    result.confidence = 'medium';
    result.evidence = ['url', 'remote'];
    return result;
  }
  // Shell-root bucket
  if (path.match(/^\/assets\/index-[a-zA-Z0-9_-]+\.css$/)) {
    result.source = 'shell-root';
    result.evidence = ['url'];
    return result;
  }
  // Heuristic package match (low confidence)
  if (path.match(/ag-grid|aggrid/i)) {
    result.source = 'ag-grid?';
    result.evidence = ['url'];
    return result;
  }
  if (path.match(/echarts|chart/i)) {
    result.source = 'echarts?';
    return result;
  }
  if (path.match(/design-system|mfe-ds/i)) {
    result.source = 'design-system?';
    return result;
  }
  result.source = 'unknown';
  return result;
}
```

**`unknown` oranı gate** (Codex tur-1 absorb): B3d0 audit output'unda `unknown` payı %20+ ise B kanalı (source-map-explorer) baseline gerekli — runtime heuristic yetersiz signal.

### §4.3 CI Integration — Codex `019e26ee` blocking-3+4 absorb

PR CI **`--target local`** (production preview build, mevcut perf-budget.yml pattern); **`testai` deploy evidence için ayrı** workflow_dispatch veya post-deploy step (PR CI'da network/auth flakiness önle).

```yaml
# .github/workflows/perf-budget.yml ek step (PR CI scope)
- name: CSS attribution audit (build-time)
  env:
    CSS_ATTRIBUTION: '1'
  run: pnpm perf:css-breakdown

- name: Bundle taxonomy with CSS source attribution (runtime local preview)
  run: node scripts/ci/bundle-taxonomy.mjs --target local --routes /login

- name: Upload CSS attribution artifacts
  uses: actions/upload-artifact@v4
  with:
    name: css-attribution-${{ github.sha }}
    path: |
      docs/performance/css-breakdown.json
      docs/performance/css-breakdown.html
      tests/perf/bundle-stats/login/taxonomy.json   # Codex blocking-4: routeSlug `login` (not `_login`)
      tests/perf/bundle-stats/css-attribution/
```

Deploy evidence için ayrı workflow_dispatch:

```yaml
# .github/workflows/perf-budget-testai.yml (deploy-evidence scope)
on: workflow_dispatch
jobs:
  testai-css-attribution:
    runs-on: ubuntu-latest
    steps:
      - name: Runtime CSS attribution (testai)
        run: node scripts/ci/bundle-taxonomy.mjs --target testai --routes /login
```

### §4.4 Decision Gate — Codex `019e26ee` tur-1 threshold absorb

B3d0 audit output:

- Per-source CSS decoded size (KB)
- Top 5 contributor paket listesi (B kanalı sourcemap evidence; high confidence)
- A kanalı runtime serve-bucket (medium/low confidence)
- `unknown` ratio (coverage gate — %20+ ise B kanalı sourcemap zorunlu)

**B3d1 trigger** (Codex absorb — login için sıfıra yakın olmalı; daha agresif threshold):

- **P1 must-fix**: AG Grid CSS veya ECharts CSS decoded **`>=10 KB absolute` OR `>=10% total CSS`** → route-lazy import
- **P0 high severity**: aynı pay **`>=30%`** total CSS → immediate route-lazy

**B3d2 trigger**: B3d0 + B3d1 sonrası **toplam CSS hâlâ >50 KB** ise critical CSS extract plugin (`critters` veya `vite-plugin-critical`) — FOUC riski + plugin maintenance cost.

---

## §5. PMD v9.1 §2.7 B3d0 Coupling

PMD v9.1 §2.7:

> B3d0 CSS attribution audit — source-map-explorer CSS bundle breakdown; AG Grid + chart CSS payı dolar (ölçüm-driven)

**Bu spike doc B3d0-impl için implementation contract hazırlar** (Codex `019e26ee` blocking-5 absorb — overclaim YASAK): pattern selection + analyzer schema + CI integration scaffolding + decision gate trigger criteria. **DoD tatmin etmez** — analyzer/artifact production yok; B3d0-impl PR (CSS attribution audit run + artifact commit) ayrı.

Implementation **ayrı PR** (B3d0-impl) — bu spike sadece pattern selection + analyzer contract.

---

## §6. Open Questions

1. **source-map-explorer chart impact**: Vite/Rolldown CSS source map default production'da OFF olabilir → CSS attribution sadece prod-equivalent sourcemap-enabled analysis build'te alınır. Production CSS attribution için runtime path-based heuristic (§4.2) yeterli mi?
2. **AG Grid theme variants**: Material vs Alpine vs Quartz — hangi theme `/login` route'unda import ediliyor? Anonymous user theme YOK gerek (login form Plain CSS yeterli)
3. **B3d1 lazy-load pattern**: Dynamic `import('@mfe/design-system/advanced/data-grid/styles')` route bazlı çalışıyor mu? PR-B1a (#426) AG Grid lazy split sırasında CSS de lazy oldu mu?
4. **B3d2 critical CSS plugin tradeoff**: critters vs vite-plugin-critical maintenance burden; B3d0 + B3d1 sonrası %30+ savings olmazsa B3d2 açma YASAK

---

## §7. Onay

| Rol          | Ad                                    | Tarih      | İmza |
| ------------ | ------------------------------------- | ---------- | ---- |
| Owner        | Halil                                 | 2026-05-14 | ☐    |
| AI Consensus | Claude (spike) + Codex pending review | 2026-05-14 | ⏳   |

---

## §8. Cross-AI

```yaml
Implementer AI: Claude (Anthropic)
Reviewer AI: Codex (OpenAI)
Codex thread: 019e26ee-b980-7263-93af-c68743769cad
Verdict: AGREE
Verdict reason: Tur-1 5 blocking absorbed; B+A combined pattern accepted; B3d0 audit-only scope, B3d1/B3d2 separate decision-gated PRs; confidence-based attribution schema + trigger threshold (>=10KB OR >=10% P1; >=30% P0) realistic; CI split (PR local / testai workflow_dispatch) G2 uyumlu
Same-provider exception: N/A
```

🤖 Generated by Claude (Anthropic). Cross-AI Codex peer review pending.
