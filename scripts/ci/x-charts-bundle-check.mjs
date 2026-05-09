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
 *     --scan-leakage       Bundle the full barrel as `contractTotal`,
 *                          then scan the minified output for ECharts
 *                          module signatures (sankey/sunburst/treemap/
 *                          markLine/markArea/markPoint/visualMap/
 *                          dataZoomSelect/toolbox/svg). Reports which
 *                          enterprise modules currently leak into the
 *                          base bundle. Read-only.
 *
 *   Both probe/scan modes are diagnostic; they NEVER write the baseline
 *   and NEVER fail CI. They feed data into Faz A bundle optimization
 *   decisions (lazy register, gating, barrel splitting).
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

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
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
 * @param externals    Modules to mark `external` (kept out of bundle).
 * @param label        Human-readable label for error messages.
 * @param customEntry  Optional override entry point (used by `--probe`
 *                     to bundle a synthetic single-chart import).
 *                     Defaults to the public x-charts barrel.
 */
async function bundle(externals, label, customEntry = ENTRY) {
  const result = await build({
    entryPoints: [customEntry],
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    external: externals,
    platform: "neutral",
    target: ["es2020"],
    logLevel: "error",
    metafile: false,
  });

  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`esbuild produced no output for ${label}`);
  }

  const buffer = Buffer.from(result.outputFiles[0].contents);
  const raw = buffer.byteLength;
  const gzip = gzipSync(buffer).byteLength;
  return { raw, gzip };
}

/* ------------------------------------------------------------------ */
/*  Externals strategy                                                 */
/* ------------------------------------------------------------------ */

// React / shared-types are deduped by the consumer's bundler in every
// realistic environment; treat them as external in BOTH metrics.
const ALWAYS_EXTERNAL = ["react", "react-dom", "@mfe/shared-types"];

const WRAPPER_ONLY_EXTERNAL = [
  ...ALWAYS_EXTERNAL,
  "echarts",
  "echarts/*",
  "echarts-extension-amap",
];

const CONTRACT_TOTAL_EXTERNAL = ALWAYS_EXTERNAL;

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
]);

/**
 * Bundle a tiny synthetic entry that imports ONLY the named chart
 * from `@mfe/x-charts`. Reveals whether tree-shake actually keeps the
 * other 12 chart implementations + their ECharts components OUT of a
 * single-chart consumer's bundle.
 *
 * The probe is read-only (no baseline write, no exit 1) and uses a
 * temp directory that is cleaned up unconditionally.
 */
async function probeSingleChart(chartName) {
  if (!PROBE_CHART_WHITELIST.has(chartName)) {
    throw new Error(
      `Unknown probe chart: '${chartName}'. Allowed: ${[...PROBE_CHART_WHITELIST].join(", ")}`,
    );
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "x-charts-probe-"));
  const tmpEntry = join(tmpDir, "synthetic-probe.ts");

  // Reference both the JSX-emitting render path AND the type so
  // esbuild keeps the value import after dead-code elimination.
  // `pin` ensures the chart ref survives all minification passes.
  const syntheticSource =
    `import { ${chartName} } from "${ENTRY.replace(/\\/g, "/")}";\n` +
    `export const pin: typeof ${chartName} = ${chartName};\n`;

  writeFileSync(tmpEntry, syntheticSource, "utf-8");

  try {
    const probeBundle = await bundle(CONTRACT_TOTAL_EXTERNAL, `probe:${chartName}`, tmpEntry);
    const probeWrapperOnly = await bundle(
      WRAPPER_ONLY_EXTERNAL,
      `probeWrapperOnly:${chartName}`,
      tmpEntry,
    );
    return {
      chart: chartName,
      contractTotal: probeBundle,
      wrapperOnly: probeWrapperOnly,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Module signature scan — produce the full `contractTotal` bundle and
 * search the minified output buffer for known ECharts module markers.
 * Reveals which enterprise modules currently leak into the base bundle
 * (so Faz A / B can decide what to lazy-register or split off).
 *
 * This is a lossy heuristic — esbuild minifies symbol names but ECharts
 * leaves enough string literals (`'sankey'`, `'sunburst'`, registered
 * chart-type names, locale strings) for a substring scan to be useful.
 * Each finding is a "hint, not proof"; combine with the probe output
 * for stronger signals.
 */
const LEAKAGE_SIGNATURES = [
  { module: "SankeyChart", patterns: ["sankey"] },
  { module: "SunburstChart", patterns: ["sunburst"] },
  { module: "TreemapChart", patterns: ["treemap"] },
  { module: "FunnelChart", patterns: ["funnel"] },
  { module: "HeatmapChart", patterns: ["heatmap"] },
  { module: "RadarChart", patterns: ["radar"] },
  { module: "GaugeChart", patterns: ["gauge"] },
  { module: "ScatterChart", patterns: ["scatter"] },
  { module: "PieChart", patterns: ["pie"] },
  { module: "MarkLineComponent", patterns: ["markLine", "MarkLine"] },
  { module: "MarkAreaComponent", patterns: ["markArea", "MarkArea"] },
  { module: "MarkPointComponent", patterns: ["markPoint", "MarkPoint"] },
  { module: "VisualMapComponent", patterns: ["visualMap", "VisualMap"] },
  { module: "DataZoomComponent", patterns: ["dataZoom", "DataZoom"] },
  { module: "DataZoomSelectFeature", patterns: ["dataZoomSelect"] },
  { module: "ToolboxComponent", patterns: ["toolbox", "Toolbox"] },
  { module: "SVGRenderer", patterns: ["zrender/lib/svg", "SVGRenderer"] },
  { module: "DatasetComponent", patterns: ["dataset", "Dataset"] },
  { module: "TransformComponent", patterns: ["transform", "Transform"] },
];

async function scanLeakage() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    external: CONTRACT_TOTAL_EXTERNAL,
    platform: "neutral",
    target: ["es2020"],
    logLevel: "error",
    metafile: false,
  });

  const buffer = Buffer.from(result.outputFiles[0].contents);
  const source = buffer.toString("utf-8");

  return LEAKAGE_SIGNATURES.map(({ module, patterns }) => {
    const hits = patterns.flatMap((p) => {
      let count = 0;
      let idx = source.indexOf(p);
      while (idx !== -1) {
        count += 1;
        idx = source.indexOf(p, idx + 1);
      }
      return count > 0 ? [{ pattern: p, count }] : [];
    });
    const present = hits.length > 0;
    const totalOccurrences = hits.reduce((s, h) => s + h.count, 0);
    return { module, present, totalOccurrences, hits };
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

  /* --- A0 spike: leakage scan --- */
  if (wantScanLeakage) {
    process.stderr.write(`Mode:       scan-leakage\n\n`);
    const scan = await scanLeakage();
    if (wantJson) {
      console.log(JSON.stringify({ leakage: scan }, null, 2));
    } else {
      console.log(`ECharts module signature scan (contractTotal bundle)`);
      console.log(`  ${scan.length} signatures probed.\n`);
      const present = scan.filter((s) => s.present);
      const absent = scan.filter((s) => !s.present);
      console.log(`Present in bundle (${present.length}):`);
      for (const s of present) {
        const patternList = s.hits.map((h) => `'${h.pattern}'×${h.count}`).join(", ");
        console.log(`  ✓ ${s.module}  [${patternList}]`);
      }
      if (absent.length > 0) {
        console.log(`\nAbsent (${absent.length}):`);
        for (const s of absent) {
          console.log(`  ✗ ${s.module}`);
        }
      }
      console.log(`\nNote: substring match is a heuristic, not proof. Combine with`);
      console.log(`\`--probe=BarChart\` for stronger tree-shake signals.`);
    }
    process.exit(0);
  }

  const wrapperOnly = await bundle(WRAPPER_ONLY_EXTERNAL, "wrapperOnly");
  const contractTotal = await bundle(CONTRACT_TOTAL_EXTERNAL, "contractTotal");

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
