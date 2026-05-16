#!/usr/bin/env node
// @ts-check
/**
 * Chart Detail Props Sync — Faz 21.8 PR-X6
 *
 * Each `ChartDetail.tsx` entry carries a manually-maintained `props: [...]`
 * array. As the chart wrapper interfaces evolved (Faz 21.4 PR-D/E/F + Faz
 * 21.5 §1.1 common props + Faz 21.8 PR-X1/X2), the manual array drifted —
 * **170 props undocumented across 13 detail pages**.
 *
 * This script regenerates the `props: [...]` block for each of the 13
 * chart wrappers from the **single source of truth** (the `*.tsx`
 * interface + JSDoc), eliminating drift.
 *
 * Inputs:
 *   - `packages/x-charts/src/<Chart>.tsx` interface declarations
 *   - JSDoc tags: `@default "value"` for default, comment text for description
 *   - `extends AccessControlledProps` → adds `access` + `accessReason` props
 *
 * Output:
 *   - In-place edit of `apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx`
 *
 * Modes:
 *   - default: write
 *   - `--check`: fail with diff if drift detected (CI gate)
 *
 * @see PR #174 (reality-parity plan), PR-X5 doc-audit gap
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import prettier from 'prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DETAIL_PATH = resolve(
  REPO_ROOT,
  'apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx',
);

const flagCheck = process.argv.includes('--check');

/** @type {[string, string][]} */
const CHARTS = [
  ['bar-chart', 'BarChart'],
  ['line-chart', 'LineChart'],
  ['area-chart', 'AreaChart'],
  ['pie-chart', 'PieChart'],
  ['scatter-chart', 'ScatterChart'],
  ['gauge-chart', 'GaugeChart'],
  ['radar-chart', 'RadarChart'],
  ['treemap-chart', 'TreemapChart'],
  // PR-X16a (Codex thread 019e32da AGREE): hierarchical node-link
  // tree (org-chart). ECharts Depth campaign first wrapper.
  ['tree-chart', 'TreeChart'],
  ['heatmap-chart', 'HeatmapChart'],
  ['waterfall-chart', 'WaterfallChart'],
  ['funnel-chart', 'FunnelChart'],
  ['sankey-chart', 'SankeyChart'],
  ['sunburst-chart', 'SunburstChart'],
  // PR-X6 (Codex thread 019e1e30 AGREE): statistical distribution
  // chart with five-number summary (min, Q1, median, Q3, max).
  ['box-plot-chart', 'BoxPlotChart'],
  // PR-X7 (Codex thread 019e1e30 AGREE): financial OHLC chart.
  ['candlestick-chart', 'CandlestickChart'],
  // PR-X10 (Codex thread 019e1e30 AGREE): decorative pictogram bar.
  ['pictorial-bar-chart', 'PictorialBarChart'],
  // PR-X12a (Codex thread 019e2119 AGREE): multi-dim parallel coords
  // (HR compensation eşitliği analizi — N axis, polyline-per-row).
  ['parallel-coordinates-chart', 'ParallelCoordinatesChart'],
  // PR-X12b (Codex thread 019e2119 AGREE): network/entity-edge graph
  // topology (Context Health DocGraph, permission cascade).
  ['graph-chart', 'GraphChart'],
  // PR-X12c (Codex thread 019e2254 AGREE): geographic choropleth map
  // (HR il bazlı yoğunluk, world country distribution).
  ['geo-map', 'GeoMap'],
  // Faz 21.11 P1a — 3D Extension Pack. Scatter3D ships with the
  // foundation PR; P1c adds Globe. The slug uses the same dash-cased
  // pattern so the design-lab listing/detail route stays consistent
  // with the 2D wrappers.
  ['scatter-3d-chart', 'Scatter3D'],
  // Faz 21.11 P1b — Surface3D + Lines3D wrappers. Lines3D wrapper
  // emits multi-series `'line3D'` (singular). Codex thread
  // `019e10d7` iter-2.
  ['surface-3d-chart', 'Surface3D'],
  ['lines-3d-chart', 'Lines3D'],
  // Faz 21.11 P1c — Globe wrapper. Multi-layer geo sphere; layer
  // types scatter3D / lines3D / bar3D on coordinateSystem: 'globe'.
  // Codex thread `019e10f8` iter-1.
  ['globe-chart', 'Globe'],
];

/* ------------------------------------------------------------------ */
/*  AccessControlledProps base — manually mirrored                    */
/*  (single source of truth: packages/shared-types/src/access.ts)     */
/* ------------------------------------------------------------------ */

const ACCESS_PROPS = [
  {
    name: 'access',
    type: '"full" | "readonly" | "disabled" | "hidden"',
    required: false,
    default: '"full"',
    description:
      'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
  },
  {
    name: 'accessReason',
    type: 'string',
    required: false,
    default: 'undefined',
    description:
      'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
  },
];

/* ------------------------------------------------------------------ */
/*  Interface parser                                                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{ name: string; type: string; required: boolean; default: string; description: string }} PropEntry
 */

/**
 * @param {string} chartName
 * @returns {{ props: PropEntry[]; extendsAccess: boolean }}
 */
function extractProps(chartName) {
  const filePath = resolve(REPO_ROOT, 'packages/x-charts/src', `${chartName}.tsx`);
  const src = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** @type {PropEntry[]} */
  const props = [];
  let extendsAccess = false;

  /**
   * @param {ts.Node} node
   */
  function visit(node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === `${chartName}Props`) {
      // Detect `extends AccessControlledProps`
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          for (const t of clause.types) {
            if (
              t.expression &&
              ts.isIdentifier(t.expression) &&
              t.expression.text === 'AccessControlledProps'
            ) {
              extendsAccess = true;
            }
          }
        }
      }

      for (const member of node.members) {
        if (!ts.isPropertySignature(member) || !member.name) continue;
        const name = ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sf);

        const required = !member.questionToken;
        const typeText = member.type
          ? member.type.getText(sf).replace(/\s+/g, ' ').trim()
          : 'unknown';

        // JSDoc: comment lines + @default tag
        const jsdoc = ts.getJSDocCommentsAndTags(member);
        let description = '';
        let defaultValue = '';
        for (const doc of jsdoc) {
          if (ts.isJSDoc(doc)) {
            // Comment text
            const commentText =
              typeof doc.comment === 'string'
                ? doc.comment
                : Array.isArray(doc.comment)
                  ? doc.comment.map((c) => c.text || '').join(' ')
                  : '';
            if (commentText) description = commentText.trim();
            // Tags
            if (doc.tags) {
              for (const tag of doc.tags) {
                if (tag.tagName.text === 'default') {
                  const tagText =
                    typeof tag.comment === 'string'
                      ? tag.comment
                      : Array.isArray(tag.comment)
                        ? tag.comment.map((c) => c.text || '').join(' ')
                        : '';
                  // Codex iter-1 PR-X6 fix: hyphen-minus must NOT be stripped
                  // (it would mangle negative numbers like `@default -45` for
                  // GaugeChart.endAngle). Only strip em-dash / en-dash bullet
                  // markers, and a leading hyphen-minus only when followed by
                  // whitespace (i.e. used as a "—"-style separator, never as
                  // part of a numeric literal).
                  defaultValue = tagText
                    .trim()
                    .replace(/^[—–]\s*/, '')
                    .replace(/^-\s+/, '');
                }
              }
            }
          }
        }
        if (!description) description = `${name}.`;

        // Defaults inferred from JSDoc, fallback to type-aware heuristic.
        if (!defaultValue) {
          if (!required) defaultValue = 'undefined';
          else defaultValue = '—';
        }

        props.push({ name, type: typeText, required, default: defaultValue, description });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);

  if (props.length === 0) {
    throw new Error(`No props extracted for ${chartName}Props`);
  }
  return { props, extendsAccess };
}

/* ------------------------------------------------------------------ */
/*  Render entry's props: [...] array as TS source                    */
/* ------------------------------------------------------------------ */

/**
 * @param {string} s
 * @returns {string}
 */
function quote(s) {
  // Use single quotes; escape internal singles as \', and escape
  // newlines so multi-line JSDoc descriptions emit a syntactically
  // valid single-quoted string literal (prettier/typescript would
  // otherwise see an unterminated string literal — see PR #338
  // cross-filter rollout, which introduced multi-line descriptions
  // for the new `onDataPointClick` props on 10 chart adapters).
  return `'${s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}'`;
}

/**
 * @param {PropEntry[]} props
 * @returns {string}
 */
function renderPropsArray(props) {
  const lines = ['    props: ['];
  for (const p of props) {
    lines.push('      {');
    lines.push(`        name: ${quote(p.name)},`);
    lines.push(`        type: ${quote(p.type)},`);
    lines.push(`        required: ${p.required},`);
    lines.push(`        default: ${quote(p.default)},`);
    lines.push(`        description: ${quote(p.description)},`);
    lines.push('      },');
  }
  lines.push('    ],');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  In-place replacement                                               */
/* ------------------------------------------------------------------ */

/**
 * Find `'<chart-id>': {` ... `props: [` ... `],` and replace the props
 * array region. Conservative: only touches the props block.
 *
 * @param {string} content
 * @param {string} chartId
 * @param {string} newPropsBlock
 * @returns {string}
 */
function replacePropsBlock(content, chartId, newPropsBlock) {
  const entryRe = new RegExp(
    `('${chartId}':\\s*\\{[\\s\\S]*?)(    props:\\s*\\[[\\s\\S]*?\\n    \\],)`,
    'm',
  );
  const match = content.match(entryRe);
  if (!match) {
    throw new Error(`Could not locate props block for '${chartId}' in ChartDetail.tsx`);
  }
  return content.replace(entryRe, (_, prefix) => `${prefix}${newPropsBlock}`);
}

/* ------------------------------------------------------------------ */
/*  Themes + features metadata sync (Faz 21.5 §1.1 + 21.4 PR-D/E/F +  */
/*  Faz 21.8 PR-X1/X2 capabilities)                                    */
/* ------------------------------------------------------------------ */

const CANONICAL_THEMES = ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'];

/**
 * Capabilities every wrapper inherits from the platform-wide invariant
 * (CONTRACT v2.3 §1.1, PR-D/E/F, PR-X2). Added on top of the chart-
 * specific features that the manual entry already lists.
 *
 * NOTE: `mutation-tested` was removed in PR #188 because Stryker config
 * only ships for @mfe/design-system, not @mfe/x-charts. Re-add it to
 * this list ONLY when packages/x-charts/stryker.config.* exists and the
 * mutation suite is wired into CI.
 */
const COMMON_CAPABILITIES = [
  'access-control',
  'decal',
  'density-aware',
  'accent-aware',
  'axe-gated',
  'contrast-gated-static',
  'bundle-gated',
  'tree-shake-gated',
  'ssr-subpath',
];

/**
 * Replace the themes array for a chart entry with the canonical 6-value
 * set (idempotent: re-running the script keeps the same content).
 *
 * @param {string} content
 * @param {string} chartId
 * @returns {string}
 */
function replaceThemesBlock(content, chartId) {
  const entryRe = new RegExp(
    `('${chartId}':\\s*\\{[\\s\\S]*?)(    themes:\\s*\\[[^\\]]*\\],)`,
    'm',
  );
  const match = content.match(entryRe);
  if (!match) return content; // entry might not have themes (e.g. perf hooks)
  const newThemes = `    themes: [${CANONICAL_THEMES.map(quote).join(', ')}],`;
  return content.replace(entryRe, (_, prefix) => `${prefix}${newThemes}`);
}

/**
 * Merge the chart-specific features with COMMON_CAPABILITIES (de-dup,
 * preserving manual order first).
 *
 * @param {string} content
 * @param {string} chartId
 * @returns {string}
 */
function mergeFeaturesBlock(content, chartId) {
  const entryRe = new RegExp(
    `('${chartId}':\\s*\\{[\\s\\S]*?)(    features:\\s*\\[[\\s\\S]*?\\n?\\s*\\],)`,
    'm',
  );
  const match = content.match(entryRe);
  if (!match) return content;
  // Extract existing feature strings.
  const existing = Array.from(match[2].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  const seen = new Set(existing);
  const merged = [...existing];
  for (const cap of COMMON_CAPABILITIES) {
    if (!seen.has(cap)) {
      merged.push(cap);
      seen.add(cap);
    }
  }
  // Render multi-line if many entries (preserves original style).
  const renderMultiLine = merged.length > 4;
  let rendered;
  if (renderMultiLine) {
    rendered = `    features: [\n      ${merged.map(quote).join(',\n      ')},\n    ],`;
  } else {
    rendered = `    features: [${merged.map(quote).join(', ')}],`;
  }
  return content.replace(entryRe, (_, prefix) => `${prefix}${rendered}`);
}

/* ------------------------------------------------------------------ */
/*  Driver                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  let detail = readFileSync(DETAIL_PATH, 'utf8');
  const original = detail;

  const summary = [];
  for (const [chartId, chartName] of CHARTS) {
    const { props, extendsAccess } = extractProps(chartName);
    const finalProps = extendsAccess ? [...props, ...ACCESS_PROPS] : props;
    const block = renderPropsArray(finalProps);
    detail = replacePropsBlock(detail, chartId, block);
    detail = replaceThemesBlock(detail, chartId);
    detail = mergeFeaturesBlock(detail, chartId);
    summary.push({
      chart: chartName,
      propsCount: finalProps.length,
      accessExtended: extendsAccess,
    });
  }

  // Codex iter-1 PR-X6 fix: run the generator output through Prettier with
  // the project's resolved config so the result is byte-identical to what
  // lint-staged + the `--check` gate produce. Without this, raw multi-line
  // strings, single-quoted descriptions and array layouts drift from the
  // canonical formatting and the gate fails on every clean checkout.
  const prettierConfig = await prettier.resolveConfig(DETAIL_PATH);
  detail = await prettier.format(detail, {
    ...(prettierConfig ?? {}),
    filepath: DETAIL_PATH,
  });

  if (flagCheck) {
    if (detail !== original) {
      console.error('✗ ChartDetail.tsx is out of sync with chart wrapper interfaces.');
      console.error('  Run `node scripts/ci/sync-chart-detail-props.mjs` and commit.');
      for (const s of summary) {
        console.error(
          `  - ${s.chart}: ${s.propsCount} props${s.accessExtended ? ' (incl. access)' : ''}`,
        );
      }
      process.exit(1);
    }
    console.log('✓ ChartDetail.tsx props arrays in sync with interfaces.');
  } else {
    if (detail === original) {
      console.log('✓ No drift — ChartDetail.tsx already in sync.');
    } else {
      writeFileSync(DETAIL_PATH, detail);
      console.log(`✓ Synced ${summary.length} chart entries:`);
      for (const s of summary) {
        console.log(
          `  - ${s.chart}: ${s.propsCount} props${s.accessExtended ? ' (incl. access)' : ''}`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
