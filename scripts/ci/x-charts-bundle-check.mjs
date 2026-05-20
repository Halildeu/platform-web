#!/usr/bin/env node
/**
 * x-charts-bundle-check.mjs — Faz 21.4 PR-F2 bundle-size CI gate.
 *
 * Why this script (not @mfe/design-system/scripts/ci/bundle-size.mjs):
 *   The DS script reads a real `dist/` directory produced by `tsup`.
 *   `@mfe/x-charts` ships SOURCE-ONLY (`packageStrategy: 'internal-platform'`,
 *   `main: src/index.ts`) — there is no dist artifact to measure. We
 *   therefore use esbuild as a one-shot bundler over the public entry,
 *   producing two synthesised bundles:
 *
 *     wrapperOnly    — ECharts excluded as external. Measures only the
 *                      x-charts wrapper code. Soft-tracked observability;
 *                      a regression here means we shipped extra wrapper
 *                      logic but does NOT block merge.
 *
 *     contractTotal  — ECharts INCLUDED (CONTRACT §7 reference is the
 *                      total chart artifact a consumer ships). React,
 *                      react-dom, and shared-types stay external because
 *                      they are deduped by the consumer's bundler.
 *                      HARD GATE — `min(350KB, baseline * 1.2)`.
 *
 *   Both metrics are gzipped (Brotli would be more representative but
 *   gzip matches CONTRACT §7 wording and the ecosystem default).
 *
 * Baseline file: packages/x-charts/.bundle-baseline.json
 *
 *   {
 *     "wrapperOnly":   { "raw": ..., "gzip": ... },
 *     "contractTotal": { "raw": ..., "gzip": ... },
 *     "lastUpdated":   "ISO-8601",
 *     "lastCommit":    "<sha>"
 *   }
 *
 *   Updated manually by running this script with `--update-baseline`.
 *   CI never auto-writes the baseline; size growth must be intentional
 *   and reviewed.
 *
 * A0 spike modes (Faz 21.11+, bundle optimization decision pack):
 *
 *     --probe=<chartName>  Synthesise a bundle from a tiny entry that
 *                          imports ONLY the named chart wrapper from the
 *                          x-charts barrel. Reveals whether tree-shake
 *                          actually keeps Sankey/Sunburst/Treemap/etc.
 *                          OUT of a single-chart consumer's bundle.
 *                          Read-only. Does NOT touch baseline.
 *
 *     --scan-leakage       Bundle the full barrel as `contractTotal`
 *                          WITH `metafile: true`, then walk
 *                          `metafile.inputs` keys for known ECharts /
 *                          zrender module path patterns. Reports which
 *                          enterprise modules actually live inside the
 *                          base bundle (path-based, NOT substring). The
 *                          metafile is the source of truth — minify
 *                          renames symbols and elides path strings, so
 *                          a literal output-buffer search produces
 *                          false negatives (Codex iter-1 fix). Read-only.
 *
 *   Both probe/scan modes are diagnostic; they NEVER write the baseline
 *   and NEVER fail CI. They feed data into Faz A bundle optimization
 *   decisions (lazy register, gating, barrel splitting). `--probe`
 *   uses esbuild `stdin` so the script never writes to disk and works
 *   under strict read-only sandboxes.
 *
 * Usage:
 *   node scripts/ci/x-charts-bundle-check.mjs              # check, exit 1 if over
 *   node scripts/ci/x-charts-bundle-check.mjs --json       # machine output
 *   node scripts/ci/x-charts-bundle-check.mjs --update-baseline  # write baseline
 *   node scripts/ci/x-charts-bundle-check.mjs --probe=BarChart   # A0 single-chart probe
 *   node scripts/ci/x-charts-bundle-check.mjs --scan-leakage     # A0 module signature scan
 *
 * Exit codes:
 *   0  All metrics within threshold (or probe/scan completed)
 *   1  contractTotal exceeded threshold (gate mode only)
 *   2  CLI / esbuild error
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const X_CHARTS_ROOT = join(ROOT, "packages/x-charts");
const ENTRY = join(X_CHARTS_ROOT, "src/index.ts");
const BASELINE_PATH = join(X_CHARTS_ROOT, ".bundle-baseline.json");

const HARD_CAP_BYTES = 350 * 1024; // CONTRACT §7
const BASELINE_GROWTH_FACTOR = 1.2;

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const wantUpdate = args.includes("--update-baseline");
const wantScanLeakage = args.includes("--scan-leakage");
const probeArg = args.find((a) => a.startsWith("--probe="));
const probeChart = probeArg ? probeArg.slice("--probe=".length) : null;

/* ------------------------------------------------------------------ */
/*  esbuild bundle helper                                              */
/* ------------------------------------------------------------------ */

/**
 * Bundle the x-charts entry with the given external list and return
 * raw + gzipped sizes for the produced ESM output.
 *
 * @param externals      Modules to mark `external` (kept out of bundle).
 * @param label          Human-readable label for error messages.
 * @param syntheticInput Optional `{ contents, sourcefile }` for stdin-
 *                       based bundling (used by `--probe` so the
 *                       script never writes to disk — works under
 *                       strict read-only sandboxes; Codex iter-1 fix).
 *                       When omitted, bundles the public barrel entry.
 * @param wantMetafile   When true, esbuild emits a metafile mapping
 *                       (used by `--scan-leakage` to walk module paths
 *                       instead of unreliable substring scanning;
 *                       Codex iter-1 fix).
 */
async function bundle(externals, label, syntheticInput = null, wantMetafile = false) {
  const buildOpts = {
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    external: externals,
    platform: "neutral",
    target: ["es2020"],
    logLevel: "error",
    metafile: wantMetafile,
  };

  if (syntheticInput) {
    buildOpts.stdin = {
      contents: syntheticInput.contents,
      resolveDir: X_CHARTS_ROOT,
      sourcefile: syntheticInput.sourcefile ?? "synthetic-probe.ts",
      loader: "ts",
    };
  } else {
    buildOpts.entryPoints = [ENTRY];
  }

  const result = await build(buildOpts);

  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`esbuild produced no output for ${label}`);
  }

  const buffer = Buffer.from(result.outputFiles[0].contents);
  const raw = buffer.byteLength;
  const gzip = gzipSync(buffer).byteLength;
  return { raw, gzip, metafile: result.metafile ?? null };
}

/* ------------------------------------------------------------------ */
/*  Externals strategy                                                 */
/* ------------------------------------------------------------------ */

// React / shared-types are deduped by the consumer's bundler in every
// realistic environment; treat them as external in BOTH metrics.
const ALWAYS_EXTERNAL = ["react", "react-dom", "@mfe/shared-types"];

// `echarts-gl` is a lazy chunk loaded ONLY when the WebGL renderer
// path is taken (PR-A1 `registerEChartsGL` dynamic import). It does
// not participate in the initial wrapper bundle nor the CONTRACT §7
// chart artifact a consumer ships up-front. The shared `zrender`
// runtime that `echarts-gl@2.x` reaches into for utility helpers
// also stays external for the same reason.
//
// Without these externals esbuild walks into `echarts-gl` and tries
// to resolve `zrender/lib/animation/Animator` (no `.js` extension)
// in the lazy chunk path, which fails the bundle-size build with
// six unresolved-import errors. Guarding both packages here keeps
// the contractTotal measurement honest (initial graph only) and
// matches the bundle-guard test invariant (`echarts-gl` is never
// statically imported anywhere in the source tree).
const ECHARTS_GL_EXTERNAL = [
  "echarts-gl",
  "echarts-gl/*",
  "zrender",
  "zrender/*",
];

// Codex thread 019e4301 Campaign 4 — `echarts-liquidfill` is a
// side-effect-registered extension package (~50 KB gzip). The wrapper
// loads it via dynamic `import('echarts-liquidfill')` inside
// `renderers/liquidfill/registerEChartsLiquidFill.ts` (HONESTY GUARD:
// `src/__tests__/bundle-guard.test.ts` enforces the single-host
// invariant). The lazy chunk is NOT part of the CONTRACT §7/§8 initial
// chart artifact a consumer ships up-front — it stays external in BOTH
// `wrapperOnly` and `contractTotal` so the size measurement honestly
// reflects the eager graph.
const ECHARTS_LIQUIDFILL_EXTERNAL = [
  "echarts-liquidfill",
  "echarts-liquidfill/*",
];

// PR-X16 ECharts Depth campaign — the depth charts (Tree, and later
// Polar/ThemeRiver/Gantt) AND the PR-X16b-prep niche charts
// (graph/parallel/pictorialBar/candlestick/boxplot) are lazy-registered
// via `renderers/registerEChartsFeature.ts`, which dynamic-imports the
// direct `echarts/lib/chart/<name>` series module (or
// `echarts/lib/component/<name>` for a coordinate-system component).
// Like the echarts-gl chunk, each lazy module is loaded ONLY on first
// mount of the corresponding wrapper and is NOT part of the CONTRACT
// §7/§8 initial chart artifact a consumer ships up-front — so it stays
// external in `contractTotal` (it is already external in `wrapperOnly`
// via the blanket `echarts/*`).
//
// HONESTY GUARD: `src/__tests__/bundle-guard.test.ts` locks every
// dynamic `import('echarts/lib/*')` to `registerEChartsFeature.ts` and
// forbids any static import of those deep paths. Without that guard
// this external mark could silently mask a regression that pulls a
// lazy chart back into the eager graph; with it, such a regression
// fails the bundle-guard test instead.
const ECHARTS_LAZY_FEATURE_EXTERNAL = [
  // PR-X16a — TreeChart depth chart.
  "echarts/lib/chart/tree",
  "echarts/lib/chart/tree/*",
  // PR-X16b-prep — niche charts converted from eager to lazy register.
  "echarts/lib/chart/graph",
  "echarts/lib/chart/graph/*",
  "echarts/lib/chart/parallel",
  "echarts/lib/chart/parallel/*",
  "echarts/lib/component/parallel",
  "echarts/lib/component/parallel/*",
  "echarts/lib/chart/pictorialBar",
  "echarts/lib/chart/pictorialBar/*",
  "echarts/lib/chart/candlestick",
  "echarts/lib/chart/candlestick/*",
  "echarts/lib/chart/boxplot",
  "echarts/lib/chart/boxplot/*",
  // PR-X16b — calendar coordinate-system component (CalendarHeatmap).
  "echarts/lib/component/calendar",
  "echarts/lib/component/calendar/*",
  // PR-X16c — polar coordinate-system component (PolarChart).
  "echarts/lib/component/polar",
  "echarts/lib/component/polar/*",
  // PR-X16d — themeRiver series + singleAxis component (ThemeRiverChart).
  "echarts/lib/chart/themeRiver",
  "echarts/lib/chart/themeRiver/*",
  "echarts/lib/component/singleAxis",
  "echarts/lib/component/singleAxis/*",
  // PR-X16e — custom renderItem series (GanttChart).
  "echarts/lib/chart/custom",
  "echarts/lib/chart/custom/*",
];

const WRAPPER_ONLY_EXTERNAL = [
  ...ALWAYS_EXTERNAL,
  ...ECHARTS_GL_EXTERNAL,
  ...ECHARTS_LIQUIDFILL_EXTERNAL,
  "echarts",
  "echarts/*",
  "echarts-extension-amap",
];

const CONTRACT_TOTAL_EXTERNAL = [
  ...ALWAYS_EXTERNAL,
  ...ECHARTS_GL_EXTERNAL,
  ...ECHARTS_LAZY_FEATURE_EXTERNAL,
  ...ECHARTS_LIQUIDFILL_EXTERNAL,
];

/* ------------------------------------------------------------------ */
/*  A0 spike — synthetic single-chart probe + module signature scan    */
/* ------------------------------------------------------------------ */

/**
 * Whitelist of chart names that the probe accepts. Each maps to the
 * exact named export on the x-charts barrel so a typo gets caught early
 * (a wrong name silently produces an empty bundle and the result is
 * misleading).
 */
const PROBE_CHART_WHITELIST = new Set([
  "BarChart",
  "LineChart",
  "AreaChart",
  "ScatterChart",
  "PieChart",
  "GaugeChart",
  "RadarChart",
  "TreemapChart",
  "HeatmapChart",
  "WaterfallChart",
  "FunnelChart",
  "SankeyChart",
  "SunburstChart",
  // Faz 21.11 P1a — 3D Extension Pack. Each 3D wrapper goes through the
  // single-chart probe so the lazy-`echarts-gl` boundary is verified per
  // wrapper. P1c adds Globe.
  "Scatter3D",
  // Faz 21.11 P1b — Surface3D + Lines3D wrappers. Codex thread
  // `019e10d7` iter-2.
  "Surface3D",
  "Lines3D",
  // Faz 21.11 P1c — Globe wrapper. Codex thread `019e10f8` iter-1.
  "Globe",
  // Codex thread 019e4301 Campaign 4 — LiquidFillChart lazy-loads
  // `echarts-liquidfill` via the same external pattern as echarts-gl,
  // so the probe verifies its eager footprint stays empty.
  "LiquidFillChart",
  // PR-X16b-prep — niche charts lazy-converted to free bundle headroom.
  // The probe verifies each stays out of the eager `contractTotal` graph.
  "GraphChart",
  "ParallelCoordinatesChart",
  "PictorialBarChart",
  "CandlestickChart",
  "BoxPlotChart",
  // PR-X16c — PolarChart depth chart (lazy `polar` coordinate system).
  "PolarChart",
  // PR-X16d — ThemeRiverChart depth chart (lazy `themeRiver` + `singleAxis`).
  "ThemeRiverChart",
  // PR-X16e — GanttChart depth chart (lazy `custom` renderItem series).
  "GanttChart",
]);

/**
 * Bundle a tiny synthetic entry that imports ONLY the named chart
 * from `@mfe/x-charts`. Reveals whether tree-shake actually keeps the
 * other 12 chart implementations + their ECharts components OUT of a
 * single-chart consumer's bundle.
 *
 * Uses esbuild `stdin` so the script never writes to disk — works
 * under strict read-only sandboxes. (Codex iter-1 fix; previously
 * `mkdtempSync(tmpdir())` failed with EPERM in restricted envs.)
 *
 * Reports raw + gzip for both `wrapperOnly` and `contractTotal`
 * externals strategies. Read-only — never writes baseline.
 */
async function probeSingleChart(chartName) {
  if (!PROBE_CHART_WHITELIST.has(chartName)) {
    throw new Error(
      `Unknown probe chart: '${chartName}'. Allowed: ${[...PROBE_CHART_WHITELIST].join(", ")}`,
    );
  }

  // Synthetic entry: named import + value re-export so esbuild's DCE
  // can't drop the chart reference. `pin` may be minified to a single
  // letter, but the export side-effect keeps the chart module alive.
  // Path uses './src/index.ts' so resolveDir=X_CHARTS_ROOT picks up the
  // local source ahead of any cached node_modules copy.
  const syntheticContents =
    `import { ${chartName} } from "./src/index.ts";\n` +
    `export const pin: typeof ${chartName} = ${chartName};\n`;
  const syntheticInput = { contents: syntheticContents, sourcefile: `probe-${chartName}.ts` };

  const probeBundle = await bundle(
    CONTRACT_TOTAL_EXTERNAL,
    `probe:${chartName}`,
    syntheticInput,
  );
  const probeWrapperOnly = await bundle(
    WRAPPER_ONLY_EXTERNAL,
    `probeWrapperOnly:${chartName}`,
    syntheticInput,
  );
  // Drop metafile from the probe payload — it's only relevant for scan
  // mode and would bloat `--json` output.
  return {
    chart: chartName,
    contractTotal: { raw: probeBundle.raw, gzip: probeBundle.gzip },
    wrapperOnly: { raw: probeWrapperOnly.raw, gzip: probeWrapperOnly.gzip },
  };
}

/**
 * Module path scan — produce the full `contractTotal` bundle WITH
 * esbuild's `metafile: true`, then walk the metafile.inputs map
 * looking for known ECharts/zrender module path fragments. Reveals
 * which enterprise modules actually live inside the base bundle.
 *
 * Why metafile and not substring search (Codex iter-1 absorb):
 * minify renames symbols and elides path strings, so a literal
 * substring scan produces false negatives (e.g. `SVGRenderer`
 * present in metafile inputs but invisible in the minified output
 * buffer). Metafile is the source of truth.
 *
 * Each entry maps an ECharts module name to:
 *   - a regex over `metafile.inputs[*]` keys (the include test)
 *   - a list of representative path examples (for the report)
 */
const LEAKAGE_SIGNATURES = [
  { module: "SankeyChart", pathPattern: /echarts\/lib\/chart\/sankey\b/ },
  { module: "SunburstChart", pathPattern: /echarts\/lib\/chart\/sunburst\b/ },
  { module: "TreemapChart", pathPattern: /echarts\/lib\/chart\/treemap\b/ },
  { module: "FunnelChart", pathPattern: /echarts\/lib\/chart\/funnel\b/ },
  { module: "HeatmapChart", pathPattern: /echarts\/lib\/chart\/heatmap\b/ },
  { module: "RadarChart", pathPattern: /echarts\/lib\/chart\/radar\b/ },
  { module: "GaugeChart", pathPattern: /echarts\/lib\/chart\/gauge\b/ },
  { module: "ScatterChart", pathPattern: /echarts\/lib\/chart\/scatter\b/ },
  { module: "PieChart", pathPattern: /echarts\/lib\/chart\/pie\b/ },
  { module: "BarChart", pathPattern: /echarts\/lib\/chart\/bar\b/ },
  { module: "LineChart", pathPattern: /echarts\/lib\/chart\/line\b/ },
  // ECharts 5 ships MarkLine/MarkArea/MarkPoint as a SHARED `marker`
  // module; the three `import { MarkXxxComponent }` calls in
  // `echarts-imports.ts` resolve to the same path tree. Pattern below
  // tolerates either the legacy per-mark path (if any) or the shared
  // `marker/` tree that holds all three impls.
  { module: "MarkLineComponent", pathPattern: /echarts\/lib\/component\/(markLine|marker)\b/ },
  { module: "MarkAreaComponent", pathPattern: /echarts\/lib\/component\/(markArea|marker)\b/ },
  { module: "MarkPointComponent", pathPattern: /echarts\/lib\/component\/(markPoint|marker)\b/ },
  { module: "VisualMapComponent", pathPattern: /echarts\/lib\/component\/visualMap\b/ },
  { module: "DataZoomComponent", pathPattern: /echarts\/lib\/component\/dataZoom\b/ },
  {
    module: "DataZoomSelectFeature",
    pathPattern: /echarts\/lib\/component\/dataZoom\/(install|select)/,
  },
  { module: "ToolboxComponent", pathPattern: /echarts\/lib\/component\/toolbox\b/ },
  { module: "DatasetComponent", pathPattern: /echarts\/lib\/component\/dataset\b/ },
  { module: "TransformComponent", pathPattern: /echarts\/lib\/component\/transform\b/ },
  { module: "CanvasRenderer", pathPattern: /(echarts|zrender)\/lib\/(renderer|canvas)\/.*[Cc]anvas/ },
  { module: "SVGRenderer", pathPattern: /(echarts\/lib\/renderer\/installSVGRenderer|zrender\/lib\/svg)/ },
];

async function scanLeakage() {
  const { metafile } = await bundle(
    CONTRACT_TOTAL_EXTERNAL,
    "scan-leakage",
    null,
    /*wantMetafile*/ true,
  );

  if (!metafile) {
    throw new Error("scan-leakage: esbuild produced no metafile");
  }

  const inputPaths = Object.keys(metafile.inputs);

  return LEAKAGE_SIGNATURES.map(({ module, pathPattern }) => {
    const matches = inputPaths.filter((p) => pathPattern.test(p));
    return {
      module,
      present: matches.length > 0,
      pathHits: matches.length,
      examples: matches.slice(0, 3), // truncate; full list in --json mode
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(2)}KB`;

async function main() {
  if (!existsSync(ENTRY)) {
    console.error(`ENTRY not found: ${ENTRY}`);
    process.exit(2);
  }

  // Human header — emit to stderr so `--json` stdout stays parseable.
  // (Codex PR #168 must-fix #2: `node ... --json | jq` previously
  // failed because the human banner sat above the JSON object on stdout.)
  process.stderr.write(`\nx-charts bundle check (PR-F2 gate)\n`);
  process.stderr.write(`Entry:      ${ENTRY.replace(ROOT + "/", "")}\n`);

  /* --- A0 spike: single-chart probe --- */
  if (probeChart) {
    process.stderr.write(`Mode:       probe (chart=${probeChart})\n\n`);
    const probe = await probeSingleChart(probeChart);
    if (wantJson) {
      console.log(JSON.stringify(probe, null, 2));
    } else {
      console.log(`Synthetic single-chart probe — ${probe.chart}`);
      console.log(`  wrapperOnly:   raw=${fmtKB(probe.wrapperOnly.raw)}  gzip=${fmtKB(probe.wrapperOnly.gzip)}`);
      console.log(`  contractTotal: raw=${fmtKB(probe.contractTotal.raw)}  gzip=${fmtKB(probe.contractTotal.gzip)}`);
      console.log(``);
      console.log(`Compare against the full barrel (run \`--json\` without \`--probe=\`).`);
      console.log(`If contractTotal here ≈ full barrel, tree-shake is NOT working —`);
      console.log(`Faz A/B lazy split is required.`);
    }
    process.exit(0);
  }

  /* --- A0 spike: leakage scan (metafile-based, Codex iter-1 fix) --- */
  if (wantScanLeakage) {
    process.stderr.write(`Mode:       scan-leakage (metafile path scan)\n\n`);
    const scan = await scanLeakage();
    if (wantJson) {
      console.log(JSON.stringify({ leakage: scan }, null, 2));
    } else {
      console.log(`ECharts module path scan (contractTotal bundle, metafile-based)`);
      console.log(`  ${scan.length} modules probed.\n`);
      const present = scan.filter((s) => s.present);
      const absent = scan.filter((s) => !s.present);
      console.log(`Present in bundle (${present.length}):`);
      for (const s of present) {
        const exampleList = s.examples.length
          ? ` ['${s.examples[0]}'${s.examples.length > 1 ? `, +${s.examples.length - 1}` : ""}]`
          : "";
        console.log(`  ✓ ${s.module}  pathHits=${s.pathHits}${exampleList}`);
      }
      if (absent.length > 0) {
        console.log(`\nAbsent (${absent.length}):`);
        for (const s of absent) {
          console.log(`  ✗ ${s.module}`);
        }
      }
      console.log(``);
      console.log(`Source of truth: esbuild metafile.inputs path matching.`);
      console.log(`Human output truncates to 3 representative example paths per module.`);
      console.log(`Use --json for the same data in machine-readable form.`);
    }
    process.exit(0);
  }

  // Default gate path: drop metafile field from output (kept inside the
  // bundle() return shape only for `--scan-leakage` consumers; the
  // public CI gate JSON contract has always been `{raw, gzip}` only).
  const wrapperOnlyFull = await bundle(WRAPPER_ONLY_EXTERNAL, "wrapperOnly");
  const contractTotalFull = await bundle(CONTRACT_TOTAL_EXTERNAL, "contractTotal");
  const wrapperOnly = { raw: wrapperOnlyFull.raw, gzip: wrapperOnlyFull.gzip };
  const contractTotal = { raw: contractTotalFull.raw, gzip: contractTotalFull.gzip };

  /* --- Baseline + threshold --- */
  let baseline = null;
  if (existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
  }

  const baselineContractGzip = baseline?.contractTotal?.gzip ?? null;
  const threshold = baselineContractGzip
    ? Math.min(HARD_CAP_BYTES, Math.floor(baselineContractGzip * BASELINE_GROWTH_FACTOR))
    : HARD_CAP_BYTES;

  /* --- Update mode --- */
  if (wantUpdate) {
    const next = {
      wrapperOnly,
      contractTotal,
      lastUpdated: new Date().toISOString(),
      lastCommit: process.env.GITHUB_SHA ?? null,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(`\nBaseline written to ${BASELINE_PATH.replace(ROOT + "/", "")}`);
    console.log(`  wrapperOnly:   raw=${fmtKB(wrapperOnly.raw)}  gzip=${fmtKB(wrapperOnly.gzip)}`);
    console.log(`  contractTotal: raw=${fmtKB(contractTotal.raw)}  gzip=${fmtKB(contractTotal.gzip)}`);
    process.exit(0);
  }

  /* --- JSON mode --- */
  if (wantJson) {
    console.log(
      JSON.stringify(
        {
          wrapperOnly,
          contractTotal,
          baseline: baselineContractGzip,
          threshold,
          hardCap: HARD_CAP_BYTES,
          growthFactor: BASELINE_GROWTH_FACTOR,
          ok: contractTotal.gzip <= threshold,
        },
        null,
        2,
      ),
    );
    process.exit(contractTotal.gzip <= threshold ? 0 : 1);
  }

  /* --- Human-readable report --- */
  console.log(`\nWrapperOnly (ECharts external)`);
  console.log(`  raw:   ${fmtKB(wrapperOnly.raw)}`);
  console.log(`  gzip:  ${fmtKB(wrapperOnly.gzip)}`);
  if (baseline?.wrapperOnly?.gzip) {
    const delta = wrapperOnly.gzip - baseline.wrapperOnly.gzip;
    const pct = ((delta / baseline.wrapperOnly.gzip) * 100).toFixed(2);
    console.log(`  delta: ${delta >= 0 ? "+" : ""}${fmtKB(delta)} (${pct}%) vs baseline`);
  }

  console.log(`\nContractTotal (ECharts included — CONTRACT §7)`);
  console.log(`  raw:   ${fmtKB(contractTotal.raw)}`);
  console.log(`  gzip:  ${fmtKB(contractTotal.gzip)}`);
  if (baselineContractGzip) {
    const delta = contractTotal.gzip - baselineContractGzip;
    const pct = ((delta / baselineContractGzip) * 100).toFixed(2);
    console.log(`  delta: ${delta >= 0 ? "+" : ""}${fmtKB(delta)} (${pct}%) vs baseline`);
  }
  console.log(`\nThreshold: ${fmtKB(threshold)}  ` +
    (baselineContractGzip
      ? `(min of ${fmtKB(HARD_CAP_BYTES)} hard cap and baseline×${BASELINE_GROWTH_FACTOR})`
      : `(hard cap; no baseline yet — initial run)`));

  if (contractTotal.gzip > threshold) {
    console.error(
      `\n✗ contractTotal gzip (${fmtKB(contractTotal.gzip)}) EXCEEDS threshold ` +
        `(${fmtKB(threshold)}).\n` +
        `  - If this is intentional, run \`node scripts/ci/x-charts-bundle-check.mjs --update-baseline\` ` +
        `and commit the resulting .bundle-baseline.json with a CHANGELOG note.\n` +
        `  - If unintentional, profile the new contribution before raising the baseline.`,
    );
    process.exit(1);
  }

  console.log(`\n✓ contractTotal within threshold.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
