/**
 * PERF-INIT-V2 PR-A0: Vite plugin wrapper around rollup-plugin-visualizer.
 *
 * Activates only when ANALYZE_BUNDLE=1 env (or NODE_ENV=analyze). Produces
 * per-MFE treemap HTML + JSON manifest in tests/perf/bundle-stats/<mfe>/.
 *
 * The JSON manifest is consumed by:
 *   - scripts/ci/duplicate-package-detector.mjs  (PR-A0)
 *   - scripts/ci/bundle-taxonomy.mjs            (PR-A0)
 *
 * Usage in each apps/*\/vite.config.ts:
 *   import { bundleVisualizer } from '../../scripts/vite-plugins/bundle-visualizer';
 *   export default defineConfig({
 *     plugins: [
 *       ...
 *       ...bundleVisualizer({ mfeName: 'mfe-shell' }),
 *     ],
 *   });
 *
 * Spread (`...`) is intentional — when env flag is off, returns empty
 * array so no runtime cost.
 */

import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BundleVisualizerOptions {
  /** MFE name used as the output subdirectory. */
  mfeName: string;
  /** Output root (default: `<repo>/tests/perf/bundle-stats`). */
  outputRoot?: string;
}

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

/** Returns the visualizer plugin(s) when ANALYZE_BUNDLE=1, else empty array. */
export function bundleVisualizer(opts: BundleVisualizerOptions): Plugin[] {
  const enabled =
    process.env.ANALYZE_BUNDLE === '1' ||
    process.env.NODE_ENV === 'analyze' ||
    process.env.VITE_ANALYZE === '1';

  if (!enabled) return [];

  const outputRoot = opts.outputRoot ?? path.join(REPO_ROOT, 'tests', 'perf', 'bundle-stats');
  const mfeDir = path.join(outputRoot, opts.mfeName);

  // Two outputs:
  //  - HTML treemap for human inspection (mfeDir/treemap.html)
  //  - JSON manifest for automated duplicate-detector + taxonomy (mfeDir/stats.json)
  // Both run as separate plugin instances; visualizer supports it.
  return [
    visualizer({
      filename: path.join(mfeDir, 'treemap.html'),
      title: `${opts.mfeName} bundle treemap (PR-A0)`,
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      sourcemap: false,
      open: false,
    }) as Plugin,
    visualizer({
      filename: path.join(mfeDir, 'stats.json'),
      template: 'raw-data',
      gzipSize: true,
      brotliSize: true,
      sourcemap: false,
      open: false,
    }) as Plugin,
  ];
}
