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
 *   3. Invokes `source-map-explorer` TWICE — once per output format —
 *      because `source-map-explorer@2.5.3` CLI treats `--html` and
 *      `--json` as mutually exclusive (Codex thread `019e277b`
 *      blocking-1 absorb; single-call with both produces
 *      `Arguments html and json are mutually exclusive` exit 1):
 *        - HTML invocation → docs/performance/css-breakdown.html (treemap)
 *        - JSON invocation → docs/performance/css-breakdown.json (parser
 *          feed; canonical attribution baseline).
 *      The JSON invocation does NOT pass `--gzip` because
 *      `source-map-explorer` flips `onlyMapped=true` under gzip and
 *      drops unmapped bytes from the report — that is the exact signal
 *      we need preserved for the B3d1 / B3d2 decision gate (Codex
 *      thread `019e277b` blocking-2 absorb).
 *
 * Fail-fast contract (Codex thread `019e276d` blocking-2 absorb):
 *   - If `dist/assets/*.css` glob is empty → exit 2 (analysis build missing).
 *   - If NO `.css.map` siblings exist → exit 3 (sourcemaps disabled — the
 *     `CSS_ATTRIBUTION=1` toggle did not fire, or Vite emitted JS-only
 *     sourcemaps). Empty / low-value `css-breakdown.json` is NOT silently
 *     produced.
 *   - If either `source-map-explorer` invocation errors → exit propagates.
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

/**
 * Build the two source-map-explorer argv arrays. Exported so unit tests
 * can assert the CLI contract without spawning the binary (Codex thread
 * `019e277b` blocking-1 follow-up: argv contract test).
 *
 * Contract invariants:
 *   - Neither argv combines `--html` and `--json` (mutually exclusive).
 *   - JSON argv MUST NOT carry `--gzip` (would force onlyMapped=true
 *     and drop unmapped bytes — kills the decision-gate signal).
 *
 * @param {string[]} cssPaths - absolute paths to dist CSS files
 * @returns {{ html: string[], json: string[] }} two argv arrays
 *   (each starts with 'source-map-explorer' for `pnpm exec` invocation).
 */
export function buildSourceMapExplorerArgvs(cssPaths) {
  return {
    html: ['source-map-explorer', ...cssPaths, '--html', OUT_HTML],
    json: ['source-map-explorer', ...cssPaths, '--json', OUT_JSON],
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

  const { html: htmlArgs, json: jsonArgs } = buildSourceMapExplorerArgvs(css);

  // Two separate invocations — see file header & buildSourceMapExplorerArgvs
  // docstring for the CLI-contract rationale.
  const invocations = [
    { name: 'JSON', argv: jsonArgs, out: OUT_JSON },
    { name: 'HTML', argv: htmlArgs, out: OUT_HTML },
  ];

  for (const inv of invocations) {
    const result = spawnSync('pnpm', ['exec', ...inv.argv], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    });

    if (result.error) {
      console.error(
        `[css-breakdown] spawn error (${inv.name}):`,
        result.error.message,
      );
      process.exit(4);
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      console.error(
        `[css-breakdown] source-map-explorer ${inv.name} invocation exited with code ${result.status}`,
      );
      process.exit(result.status);
    }

    console.log(`[css-breakdown] OK -> ${inv.out}`);
  }
}

export function listCssFiles() {
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

// Gate top-level invocation (mirrors bundle-taxonomy.mjs pattern) so
// tests can import buildSourceMapExplorerArgvs / listCssFiles without
// running the script body.
const __isDirectInvoke =
  process.argv[1] && process.argv[1].endsWith('css-attribution-breakdown.mjs');
if (__isDirectInvoke) {
  main();
}
