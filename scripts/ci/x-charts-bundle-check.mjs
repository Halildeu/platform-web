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
 * Usage:
 *   node scripts/ci/x-charts-bundle-check.mjs              # check, exit 1 if over
 *   node scripts/ci/x-charts-bundle-check.mjs --json       # machine output
 *   node scripts/ci/x-charts-bundle-check.mjs --update-baseline  # write baseline
 *
 * Exit codes:
 *   0  All metrics within threshold
 *   1  contractTotal exceeded threshold
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

/* ------------------------------------------------------------------ */
/*  esbuild bundle helper                                              */
/* ------------------------------------------------------------------ */

/**
 * Bundle the x-charts entry with the given external list and return
 * raw + gzipped sizes for the produced ESM output.
 */
async function bundle(externals, label) {
  const result = await build({
    entryPoints: [ENTRY],
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
/*  Main                                                               */
/* ------------------------------------------------------------------ */

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(2)}KB`;

async function main() {
  if (!existsSync(ENTRY)) {
    console.error(`ENTRY not found: ${ENTRY}`);
    process.exit(2);
  }

  console.log(`\nx-charts bundle check (PR-F2 gate)\n`);
  console.log(`Entry:      ${ENTRY.replace(ROOT + "/", "")}`);

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
