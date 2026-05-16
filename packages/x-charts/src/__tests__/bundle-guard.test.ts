/**
 * Bundle guard — Faz 21.11 PR-A1 (Big Data Renderer Router).
 *
 * The "zero echarts-gl shell impact" claim is the core differentiator
 * of the PR-A program. To enforce it, this test scans the source tree
 * for any **static** import of `'echarts-gl'`. Static imports get
 * eagerly bundled into the initial entry chunk by Vite/Rollup,
 * blowing the ~150 KB gzip cost over every shell user, regardless of
 * whether they ever render a WebGL chart.
 *
 * Allowed: dynamic `await import('echarts-gl')` inside
 * `renderers/gl/registerEChartsGL.ts`. The dynamic-import call is
 * what triggers Vite's code-split into a lazy chunk.
 *
 * Forbidden: any line matching `import 'echarts-gl'` or
 * `import 'echarts-gl/...'` or `from 'echarts-gl'` outside of a
 * dynamic-import expression.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(__dirname, '..');

/**
 * Allowlist: dynamic-import is the only legitimate way to reference
 * `echarts-gl` in source. Anything else is a bundle leak.
 */
const ALLOWED_DYNAMIC_IMPORT_RE = /await\s+import\s*\(\s*['"]echarts-gl['"]\s*\)/;

/**
 * Forbidden: every static reference pattern that pulls `echarts-gl`
 * into the initial bundle graph. The leading `^[ \t]*` excludes JSDoc
 * comment lines (which start with ` *`) and inline `//` references —
 * we only flag actual `import` / `export from` declarations.
 */
const FORBIDDEN_STATIC_RE =
  /^[ \t]*(?:import[ \t]+(?:[^'"]*['"]echarts-gl[^'"]*['"]|['"]echarts-gl[^'"]*['"])|export[ \t]+[^;]*from[ \t]+['"]echarts-gl[^'"]*['"])/m;

async function* walkTs(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = path.join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      yield* walkTs(full);
    } else if (entry.endsWith('.tsx') || (entry.endsWith('.ts') && !entry.endsWith('.d.ts'))) {
      // `.d.ts` files are type-only and never reach the runtime
      // bundle, so they cannot leak `echarts-gl` into the shell graph.
      // We also need to skip them or the JSDoc examples we write
      // inside `echarts-gl.d.ts` (which mention the literal
      // `import('echarts-gl')` form) would false-positive the guard.
      yield full;
    }
  }
}

/**
 * Match a dynamic `import('echarts-gl')` call expression so the guard
 * can distinguish "lazy chunk reference" from "static import that ends
 * up in the initial bundle".
 */
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]echarts-gl['"]\s*\)/g;

const ALLOWED_DYNAMIC_IMPORT_HOST = path.join('renderers', 'gl', 'registerEChartsGL.ts');

describe('bundle guard — echarts-gl shell impact', () => {
  it('no source file ANYWHERE statically imports echarts-gl', async () => {
    // Codex iter-A1 absorb: scan EVERY .ts/.tsx in src/ (including the
    // gl/ namespace), not just files outside it. The allowance for
    // `registerEChartsGL.ts` is the dynamic-import expression, not a
    // wholesale exemption from the bundle guard.
    const offenders: string[] = [];
    for await (const file of walkTs(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file);
      const source = await readFile(file, 'utf-8');
      if (FORBIDDEN_STATIC_RE.test(source)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('dynamic `import("echarts-gl")` lives ONLY in renderers/gl/registerEChartsGL.ts', async () => {
    // Codex iter-A1 strongly-recommended invariant: any other file
    // sneaking in a dynamic GL import would also trigger lazy chunk
    // download, partially defeating the "zero shell impact" claim.
    // Lock the call site to a single, reviewed location.
    const offenders: string[] = [];
    for await (const file of walkTs(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file);
      const source = await readFile(file, 'utf-8');
      if (DYNAMIC_IMPORT_RE.test(source) && rel !== ALLOWED_DYNAMIC_IMPORT_HOST) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the allowed host (registerEChartsGL.ts) DOES use the dynamic import', async () => {
    const file = path.join(SRC_ROOT, ALLOWED_DYNAMIC_IMPORT_HOST);
    const source = await readFile(file, 'utf-8');
    expect(source).toMatch(ALLOWED_DYNAMIC_IMPORT_RE);
  });
});

/* ------------------------------------------------------------------ */
/*  PR-X16 — lazy ECharts depth feature modules                        */
/* ------------------------------------------------------------------ */

/**
 * PR-X16 ECharts Depth campaign: depth charts lazy-register their
 * ECharts modules by dynamic-importing the direct
 * `echarts/lib/chart/<name>` (and later `echarts/lib/component/<name>`)
 * side-effect path. A STATIC import of any `echarts/lib/*` deep path
 * would pull that module into the eager bundle graph, defeating the
 * lazy split and risking the CONTRACT §8 bundle cap.
 *
 * `scripts/ci/x-charts-bundle-check.mjs` externalises the lazy
 * `echarts/lib/chart/*` paths in `contractTotal`; this guard is the
 * honesty backstop — it ensures that external mark cannot mask a
 * static-import regression that drags a depth chart back into the
 * eager graph.
 *
 * Allowed: dynamic `import('echarts/lib/...')` inside
 * `renderers/registerEChartsFeature.ts` ONLY.
 */
const LAZY_FEATURE_ALLOWED_HOST = path.join('renderers', 'registerEChartsFeature.ts');

/** Static import / re-export of any `echarts/lib/*` deep path. */
const FORBIDDEN_LIB_STATIC_RE =
  /^[ \t]*(?:import[ \t]+(?:[^'"]*['"]echarts\/lib\/[^'"]*['"]|['"]echarts\/lib\/[^'"]*['"])|export[ \t]+[^;]*from[ \t]+['"]echarts\/lib\/[^'"]*['"])/m;

/**
 * Dynamic `import('echarts/lib/...')` call expression. No `/g` flag —
 * `.test()` is then stateless, so reusing the regex across files cannot
 * produce `lastIndex`-drift false negatives.
 */
const LIB_DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]echarts\/lib\/[^'"]*['"]\s*\)/;

describe('bundle guard — lazy ECharts depth feature modules', () => {
  it('no source file ANYWHERE statically imports an echarts/lib/* deep path', async () => {
    const offenders: string[] = [];
    for await (const file of walkTs(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file);
      const source = await readFile(file, 'utf-8');
      if (FORBIDDEN_LIB_STATIC_RE.test(source)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('dynamic `import("echarts/lib/*")` lives ONLY in renderers/registerEChartsFeature.ts', async () => {
    const offenders: string[] = [];
    for await (const file of walkTs(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file);
      const source = await readFile(file, 'utf-8');
      if (LIB_DYNAMIC_IMPORT_RE.test(source) && rel !== LAZY_FEATURE_ALLOWED_HOST) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the allowed host (registerEChartsFeature.ts) DOES dynamic-import a feature module', async () => {
    const file = path.join(SRC_ROOT, LAZY_FEATURE_ALLOWED_HOST);
    const source = await readFile(file, 'utf-8');
    expect(LIB_DYNAMIC_IMPORT_RE.test(source)).toBe(true);
  });
});
