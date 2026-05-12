#!/usr/bin/env node
/**
 * PERF-INIT-V2 PR-A0: Duplicate package detector.
 *
 * Reads each MFE's bundle stats produced by rollup-plugin-visualizer
 * (tests/perf/bundle-stats/<mfe>/stats.json) and reports:
 *   - packages that appear in multiple MFEs (duplicate runtime cost)
 *   - per-package decoded size + count of occurrences
 *   - top 20 largest duplicates by aggregate size
 *
 * This answers the PMD §4.2 PR-A0 question: "50 MB decoded — why are
 * /login, /home, /admin/reports all the same?"
 *
 * Usage:
 *   ANALYZE_BUNDLE=1 npm run build         # produce stats per MFE
 *   node scripts/ci/duplicate-package-detector.mjs
 *
 * Output:
 *   tests/perf/bundle-stats/duplicates.json
 *   stdout: human-readable top 20 + summary
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const STATS_DIR = join(ROOT, 'tests', 'perf', 'bundle-stats');

if (!existsSync(STATS_DIR)) {
  console.error(`No bundle stats directory: ${STATS_DIR}`);
  console.error(`Run: ANALYZE_BUNDLE=1 npm run build`);
  process.exit(1);
}

/** Extract a normalised package name from a node_modules path. */
function pkgFromModule(modulePath) {
  // Examples:
  //   /node_modules/react/index.js -> react
  //   /node_modules/@scope/pkg/dist/foo.js -> @scope/pkg
  //   /apps/mfe-shell/src/app/foo.ts -> null (app code, not a dep)
  const m = modulePath.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return m ? m[1] : null;
}

/** Parse one MFE's stats.json (raw-data template from rollup-plugin-visualizer). */
function parseStats(statsPath) {
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
  // raw-data shape: { tree: { name, children: [...] }, nodeMetas: { ... } }
  // nodeMetas keys are absolute paths; values have renderedLength, gzipLength, brotliLength
  const result = new Map(); // package -> { totalRendered, totalGzip, files: Set }

  const nodeMetas = stats.nodeMetas || {};
  for (const [path, meta] of Object.entries(nodeMetas)) {
    const pkg = pkgFromModule(path);
    if (!pkg) continue;
    const entry = result.get(pkg) ?? { totalRendered: 0, totalGzip: 0, files: new Set() };
    entry.totalRendered += meta.renderedLength || 0;
    entry.totalGzip += meta.gzipLength || 0;
    entry.files.add(path);
    result.set(pkg, entry);
  }

  return result;
}

const mfes = readdirSync(STATS_DIR).filter((d) => {
  const fullPath = join(STATS_DIR, d);
  if (!statSync(fullPath).isDirectory()) return false;
  return existsSync(join(fullPath, 'stats.json'));
});

if (mfes.length === 0) {
  console.error(`No <mfe>/stats.json files in ${STATS_DIR}`);
  console.error(`Each app's vite.config.ts must use bundleVisualizer({ mfeName: 'mfe-name' })`);
  console.error(`then ANALYZE_BUNDLE=1 npm run build`);
  process.exit(1);
}

console.log(`[duplicates] scanning ${mfes.length} MFE(s): ${mfes.join(', ')}`);

// Aggregate across MFEs
const pkgAggregate = new Map(); // package -> { mfes: { mfe -> { rendered, gzip, files } }, totalRendered, totalGzip }

for (const mfe of mfes) {
  const statsPath = join(STATS_DIR, mfe, 'stats.json');
  const mfeStats = parseStats(statsPath);
  for (const [pkg, entry] of mfeStats.entries()) {
    const agg = pkgAggregate.get(pkg) ?? { mfes: {}, totalRendered: 0, totalGzip: 0 };
    agg.mfes[mfe] = {
      rendered: entry.totalRendered,
      gzip: entry.totalGzip,
      fileCount: entry.files.size,
    };
    agg.totalRendered += entry.totalRendered;
    agg.totalGzip += entry.totalGzip;
    pkgAggregate.set(pkg, agg);
  }
}

// Identify duplicates: packages appearing in 2+ MFEs
const duplicates = [...pkgAggregate.entries()]
  .filter(([_, agg]) => Object.keys(agg.mfes).length >= 2)
  .map(([pkg, agg]) => ({
    pkg,
    mfeCount: Object.keys(agg.mfes).length,
    totalRenderedKB: Math.round(agg.totalRendered / 1024),
    totalGzipKB: Math.round(agg.totalGzip / 1024),
    excessRenderedKB: Math.round(
      (agg.totalRendered - agg.totalRendered / Object.keys(agg.mfes).length) / 1024,
    ),
    mfes: agg.mfes,
  }))
  .sort((a, b) => b.excessRenderedKB - a.excessRenderedKB);

const summary = {
  timestamp: Date.now(),
  mfesScanned: mfes,
  totalPackages: pkgAggregate.size,
  duplicateCount: duplicates.length,
  topExcessKB: duplicates.slice(0, 20).reduce((s, d) => s + d.excessRenderedKB, 0),
  duplicates: duplicates.slice(0, 50), // cap output size
};

writeFileSync(join(STATS_DIR, 'duplicates.json'), JSON.stringify(summary, null, 2));

console.log(`\n[duplicates] Top 20 by excess decoded size (savings if singleton):\n`);
console.log('  pkg'.padEnd(40) + 'mfeCount  totalRenderedKB  excessKB');
console.log('  ' + '-'.repeat(75));
for (const d of duplicates.slice(0, 20)) {
  console.log(
    `  ${d.pkg.padEnd(38)}  ${String(d.mfeCount).padStart(6)}    ${String(d.totalRenderedKB).padStart(8)}  ${String(d.excessRenderedKB).padStart(8)}`,
  );
}
console.log(`\n[duplicates] Total packages: ${summary.totalPackages}`);
console.log(`[duplicates] Packages duplicated across MFEs: ${summary.duplicateCount}`);
console.log(`[duplicates] Top-20 excess decoded total: ${summary.topExcessKB} KB`);
console.log(`[duplicates] Full report: ${join(STATS_DIR, 'duplicates.json')}`);
