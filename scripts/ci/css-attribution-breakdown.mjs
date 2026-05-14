#!/usr/bin/env node
/**
 * PERF-INIT-V2 PR-B3d0-impl: source-map-explorer wrapper for CSS bundle
 * attribution (build-time / B channel of B+A combined attribution per
 * spike doc PR-V2.1-B3d0-css-attribution-spike.md §4.1).
 *
 * Flow:
 *   1. Caller must have already run `CSS_ATTRIBUTION=1 pnpm --filter mfe-shell build`
 *      (sourcemap-enabled analysis build; see vite.config.ts build.sourcemap toggle).
 *   2. This script asserts the analysis build produced at least one
 *      `apps/mfe-shell/dist/assets/*.css` AND at least one matching
 *      `.css.map` sibling so that `source-map-explorer` has usable input.
 *   3. Invokes `source-map-explorer` to emit:
 *        - docs/performance/css-breakdown.html (human treemap)
 *        - docs/performance/css-breakdown.json (CI artifact / parser feed)
 *
 * Fail-fast contract (Codex thread 019e276d blocking-2 absorb):
 *   - If `dist/assets/*.css` glob is empty → exit 2 (analysis build missing).
 *   - If NO `.css.map` siblings exist → exit 3 (sourcemaps disabled — the
 *     `CSS_ATTRIBUTION=1` toggle did not fire, or Vite emitted JS-only
 *     sourcemaps). Empty / low-value `css-breakdown.json` is NOT silently
 *     produced.
 *   - If `source-map-explorer` errors → exit propagates.
 *
 * Usage:
 *   CSS_ATTRIBUTION=1 pnpm --filter mfe-shell build
 *   node scripts/ci/css-attribution-breakdown.mjs
 *
 * Or via pnpm script:
 *   pnpm perf:css-breakdown
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const DIST_ASSETS = join(ROOT, 'apps', 'mfe-shell', 'dist', 'assets');
const OUT_DIR = join(ROOT, 'docs', 'performance');
const OUT_HTML = join(OUT_DIR, 'css-breakdown.html');
const OUT_JSON = join(OUT_DIR, 'css-breakdown.json');

function listCssFiles() {
  if (!existsSync(DIST_ASSETS)) {
    return { css: [], maps: [] };
  }
  const entries = readdirSync(DIST_ASSETS);
  const css = entries.filter((e) => e.endsWith('.css'));
  const maps = entries.filter((e) => e.endsWith('.css.map'));
  return {
    css: css.map((f) => join(DIST_ASSETS, f)),
    maps: maps.map((f) => join(DIST_ASSETS, f)),
  };
}

function main() {
  const { css, maps } = listCssFiles();

  if (css.length === 0) {
    console.error(
      '[css-breakdown] ERROR: no `apps/mfe-shell/dist/assets/*.css` found. ' +
        'Did you run `CSS_ATTRIBUTION=1 pnpm --filter mfe-shell build` first?',
    );
    process.exit(2);
  }

  if (maps.length === 0) {
    console.error(
      '[css-breakdown] ERROR: CSS sourcemaps missing. Found ' +
        `${css.length} CSS file(s) but ZERO matching .css.map siblings. ` +
        'The `CSS_ATTRIBUTION=1` env did not enable production sourcemaps; ' +
        'verify `apps/mfe-shell/vite.config.ts` build.sourcemap toggle.',
    );
    process.exit(3);
  }

  console.log(
    `[css-breakdown] Analyzing ${css.length} CSS file(s) with ${maps.length} sourcemap(s)...`,
  );

  mkdirSync(OUT_DIR, { recursive: true });

  // source-map-explorer accepts file globs; pass explicit paths to avoid
  // shell-glob portability issues.
  const args = [
    'source-map-explorer',
    ...css,
    '--html',
    OUT_HTML,
    '--json',
    OUT_JSON,
    // `--gzip` adds compressed-size column (deploy-relevant proxy for
    // wire-bytes; complementary to runtime decoded-KB in bundle-taxonomy).
    '--gzip',
  ];

  const result = spawnSync('pnpm', ['exec', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error('[css-breakdown] spawn error:', result.error.message);
    process.exit(4);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.error(
      `[css-breakdown] source-map-explorer exited with code ${result.status}`,
    );
    process.exit(result.status);
  }

  console.log(`[css-breakdown] OK -> ${OUT_HTML}`);
  console.log(`[css-breakdown] OK -> ${OUT_JSON}`);
}

main();
