#!/usr/bin/env node
// @ts-check
/**
 * x-charts Adoption Scanner — Faz 21.8 PR-X5 (T4 truth-validation).
 *
 * Builds a markdown matrix of every consumer of `@mfe/x-charts` (root or
 * any subpath) across the monorepo. AST-based — uses the TypeScript
 * compiler API so it catches:
 *
 *   - `import { X } from '@mfe/x-charts'`
 *   - `import * as Charts from '@mfe/x-charts'`
 *   - `import('@mfe/x-charts')` dynamic
 *   - `export { X } from '@mfe/x-charts'`
 *   - `export * from '@mfe/x-charts'`
 *   - `require('@mfe/x-charts')`
 *   - subpath variants (`@mfe/x-charts/client`, `@mfe/x-charts/ssr`)
 *
 * `rg` is used as a fast prefilter — files without the literal string
 * `@mfe/x-charts` are skipped before the AST walk.
 *
 * Output: `docs/x-charts-adoption-matrix.md` + `.json` companion.
 *
 * Usage:
 *   node scripts/ci/x-charts-adoption-scan.mjs              # write to docs
 *   node scripts/ci/x-charts-adoption-scan.mjs --json       # also write JSON
 *   node scripts/ci/x-charts-adoption-scan.mjs --check      # CI mode: fail
 *                                                           if matrix is
 *                                                           stale
 *
 * @see PR #174 (reality-parity plan, T4)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_MD = resolve(REPO_ROOT, 'docs', 'x-charts-adoption-matrix.md');
const OUTPUT_JSON = resolve(REPO_ROOT, 'docs', 'x-charts-adoption-matrix.json');

const PACKAGE_NAME = '@mfe/x-charts';
const SUBPATH_RE = new RegExp(`^${PACKAGE_NAME}(?:/[^?'"]+)?$`);

const args = process.argv.slice(2);
const flagCheck = args.includes('--check');
const flagJson = args.includes('--json') || true; // default: emit JSON

/* ------------------------------------------------------------------ */
/*  Bucket classification                                              */
/* ------------------------------------------------------------------ */

// Codex iter-1 PR-X5 fix: test + story take priority over demo so a
// `__tests__/` folder under `design-lab/widgets/` is bucketed as `test`,
// not `demo`. Demo regex broadened to the entire design-lab subtree
// (including runtime preview surfaces).
const BUCKETS = /** @type {const} */ ([
  ['story', /\.stories\.tsx?$/],
  ['test', /(?:\.test\.[mc]?tsx?$|\/__tests__\/)/],
  ['demo', /design-lab\//],
  ['production', /^apps\/mfe-[^/]+\/src\//],
  ['package', /^packages\//],
]);

/**
 * @param {string} filePath
 * @returns {string}
 */
function classifyBucket(filePath) {
  for (const [bucket, re] of BUCKETS) {
    if (re.test(filePath)) return bucket;
  }
  return 'other';
}

/* ------------------------------------------------------------------ */
/*  Repo file enumeration via rg prefilter                             */
/* ------------------------------------------------------------------ */

/**
 * Returns absolute paths of TS/TSX files that mention `@mfe/x-charts`
 * literally — the AST walk only looks at this much smaller set.
 *
 * Uses `rg` when available (fastest); falls back to `git ls-files` + a
 * synchronous includes check (still bounded — only TS/TSX files).
 */
function listCandidateFiles() {
  try {
    const output = execFileSync(
      'rg',
      [
        '--files-with-matches',
        '--type',
        'ts',
        '--glob',
        '!**/node_modules/**',
        '--glob',
        '!**/dist/**',
        '--glob',
        '!**/.git/**',
        PACKAGE_NAME,
        // Explicit search path — without this, rg under Node's
        // execFileSync (no TTY, stdin piped) treats stdin as the input
        // and returns 0 matches. Codex iter-3 PR-X5 fix.
        '.',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return output
      .split('\n')
      .filter(Boolean)
      .map((p) => resolve(REPO_ROOT, p));
  } catch (err) {
    const code = /** @type {{ code?: string; status?: number }} */ (err).code;
    if (code === 'ENOENT') {
      // rg not installed — fall back to git ls-files + content scan.
      return listCandidateFilesViaGit();
    }
    if (/** @type {{ status?: number }} */ (err).status === 1) return [];
    throw err;
  }
}

function listCandidateFilesViaGit() {
  const output = execFileSync(
    'git',
    ['ls-files', '*.ts', '*.tsx', '*.cts', '*.mts'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const files = output
    .split('\n')
    .filter(Boolean)
    .map((p) => resolve(REPO_ROOT, p))
    .filter((p) => !p.includes('/node_modules/') && !p.includes('/dist/'));
  return files.filter((file) => {
    try {
      return readFileSync(file, 'utf8').includes(PACKAGE_NAME);
    } catch {
      return false;
    }
  });
}

/* ------------------------------------------------------------------ */
/*  AST walk                                                           */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} AdoptionEntry
 * @property {string} file
 * @property {string} app
 * @property {string} bucket
 * @property {string[]} subpaths   — every distinct module specifier seen
 * @property {string[]} symbols    — every named symbol imported / referenced
 * @property {string[]} kinds      — node kinds: ImportDeclaration, ExportNamedDeclaration, ImportExpression, RequireCall
 */

/**
 * @param {string} filePath
 * @returns {AdoptionEntry | null}
 */
function scanFile(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const subpaths = new Set();
  const symbols = new Set();
  const kinds = new Set();

  /**
   * @param {string} specifier
   */
  function recordSpecifier(specifier) {
    if (!SUBPATH_RE.test(specifier)) return false;
    subpaths.add(specifier);
    return true;
  }

  /**
   * @param {ts.ImportDeclaration | ts.ExportDeclaration} node
   */
  function visitImportLike(node) {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const matched = recordSpecifier(node.moduleSpecifier.text);
    if (!matched) return;
    kinds.add(node.kind === ts.SyntaxKind.ImportDeclaration ? 'ImportDeclaration' : 'ExportNamedDeclaration');
    if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      if (clause.name) symbols.add(clause.name.text);
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          symbols.add('* as ' + clause.namedBindings.name.text);
        } else if (ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) symbols.add(el.name.text);
        }
      }
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) symbols.add(el.name.text);
    }
  }

  /**
   * @param {ts.Node} node
   */
  function visit(node) {
    if (ts.isImportDeclaration(node)) visitImportLike(node);
    else if (ts.isExportDeclaration(node)) visitImportLike(node);
    else if (ts.isCallExpression(node)) {
      // dynamic import('@mfe/x-charts')
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg) && recordSpecifier(arg.text)) {
          kinds.add('ImportExpression');
        }
      }
      // require('@mfe/x-charts')
      else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        recordSpecifier(node.arguments[0].text)
      ) {
        kinds.add('RequireCall');
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (subpaths.size === 0) return null;

  const repoPath = relative(REPO_ROOT, filePath);
  const appMatch = repoPath.match(/^apps\/(mfe-[^/]+)\//) || repoPath.match(/^packages\/([^/]+)\//);
  const app = appMatch ? appMatch[1] : 'root';

  return {
    file: repoPath,
    app,
    bucket: classifyBucket(repoPath),
    subpaths: Array.from(subpaths).sort(),
    symbols: Array.from(symbols).sort(),
    kinds: Array.from(kinds).sort(),
  };
}

/* ------------------------------------------------------------------ */
/*  Aggregate + emit                                                   */
/* ------------------------------------------------------------------ */

const candidates = listCandidateFiles();
const entries = candidates.map(scanFile).filter(/** @type {(e: AdoptionEntry|null) => e is AdoptionEntry} */ (e) => e !== null);

entries.sort((a, b) => a.file.localeCompare(b.file));

const byBucket = entries.reduce((acc, e) => {
  (acc[e.bucket] ??= []).push(e);
  return acc;
}, /** @type {Record<string, AdoptionEntry[]>} */ ({}));

function emitMarkdown() {
  const lines = [];
  lines.push('# `@mfe/x-charts` Adoption Matrix');
  lines.push('');
  lines.push('_Generated by `scripts/ci/x-charts-adoption-scan.mjs` — do not edit by hand._');
  lines.push('');
  lines.push(`**Generated at:** ${new Date().toISOString()}`);
  lines.push(`**Total consumers:** ${entries.length}`);
  lines.push('');
  lines.push('## Summary by bucket');
  lines.push('');
  lines.push('| Bucket | Count |');
  lines.push('| --- | --- |');
  for (const bucket of ['production', 'demo', 'story', 'test', 'package', 'other']) {
    const list = byBucket[bucket] ?? [];
    lines.push(`| ${bucket} | ${list.length} |`);
  }
  lines.push('');
  lines.push('## Production consumers (apps/mfe-*/src/**, non-demo, non-test)');
  lines.push('');
  lines.push('| App | File | Subpath | Symbols (top 5) |');
  lines.push('| --- | --- | --- | --- |');
  for (const entry of byBucket.production ?? []) {
    const symbolPreview = entry.symbols.slice(0, 5).join(', ');
    const subpathDisplay = entry.subpaths.join(' + ');
    lines.push(`| ${entry.app} | \`${entry.file}\` | ${subpathDisplay} | ${symbolPreview}${entry.symbols.length > 5 ? ', …' : ''} |`);
  }
  lines.push('');
  lines.push('## Demo / Design Lab consumers');
  lines.push('');
  lines.push('| App | File | Subpath |');
  lines.push('| --- | --- | --- |');
  for (const entry of byBucket.demo ?? []) {
    lines.push(`| ${entry.app} | \`${entry.file}\` | ${entry.subpaths.join(' + ')} |`);
  }
  lines.push('');
  lines.push('## Test + Story files (kept separate from prod)');
  lines.push('');
  lines.push('| Bucket | App | File |');
  lines.push('| --- | --- | --- |');
  for (const entry of [...(byBucket.test ?? []), ...(byBucket.story ?? [])]) {
    lines.push(`| ${entry.bucket} | ${entry.app} | \`${entry.file}\` |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Production import warning (root vs subpath)');
  lines.push('');
  lines.push('Production code consuming `@mfe/x-charts` directly (root barrel) instead of `@mfe/x-charts/client` defeats the RSC `\'use client\'` boundary established in PR-X2. The list below is informational only; root imports are still valid for current Vite consumers.');
  lines.push('');
  const rootProd = (byBucket.production ?? []).filter((e) => e.subpaths.includes(PACKAGE_NAME) && !e.subpaths.some((s) => s.startsWith(`${PACKAGE_NAME}/`)));
  if (rootProd.length === 0) {
    lines.push('_None — every production consumer imports from a subpath._');
  } else {
    lines.push('| App | File |');
    lines.push('| --- | --- |');
    for (const entry of rootProd) {
      lines.push(`| ${entry.app} | \`${entry.file}\` |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

const md = emitMarkdown();
const json = JSON.stringify(
  {
    generatedAt: new Date().toISOString(),
    totalConsumers: entries.length,
    byBucket: Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, v.length])),
    entries,
  },
  null,
  2,
);

/**
 * Normalize markdown for stale comparison:
 *   1. Strip the `Generated at:` line (timestamp drift).
 *   2. Collapse repeated whitespace inside table cells so prettier's
 *      column-alignment formatting does not cause spurious diffs.
 *   3. Trim trailing whitespace per line + final newline.
 */
function normalizeMd(s) {
  return s
    .replace(/\*\*Generated at:\*\* [^\n]+\n/, '')
    .split('\n')
    .map((line) => {
      // Compress 2+ spaces inside markdown table cells (Prettier aligns
      // them so the generator's raw output diverges).
      if (line.startsWith('|')) return line.replace(/\s{2,}/g, ' ');
      return line.trimEnd();
    })
    .join('\n')
    // Strip Prettier markdown escape sequences (e.g. `\*` → `*`, `\_`,
    // `\(`, `\)`, `\[`, `\]`, `\\`) so generator raw output and
    // committed prettier-formatted output normalize identically.
    // Codex iter-2 PR-X5 fix.
    .replace(/\\([*_()[\]\\])/g, '$1')
    .replace(/\n+$/, '\n');
}

/**
 * Normalize JSON for stale comparison: strip `generatedAt` and re-stringify
 * so Prettier vs JSON.stringify formatting differences disappear.
 */
function normalizeJson(s) {
  try {
    const obj = JSON.parse(s);
    delete obj.generatedAt;
    return JSON.stringify(obj);
  } catch {
    return s;
  }
}

if (flagCheck) {
  if (!existsSync(OUTPUT_MD)) {
    console.error(
      `✗ ${relative(REPO_ROOT, OUTPUT_MD)} missing. Run \`node scripts/ci/x-charts-adoption-scan.mjs\` and commit.`,
    );
    process.exit(1);
  }
  const onDiskMd = readFileSync(OUTPUT_MD, 'utf8');
  if (normalizeMd(onDiskMd) !== normalizeMd(md)) {
    console.error(
      `✗ ${relative(REPO_ROOT, OUTPUT_MD)} is stale. Run \`node scripts/ci/x-charts-adoption-scan.mjs\` and commit.`,
    );
    process.exit(1);
  }
  if (flagJson && existsSync(OUTPUT_JSON)) {
    const onDiskJson = readFileSync(OUTPUT_JSON, 'utf8');
    if (normalizeJson(onDiskJson) !== normalizeJson(json)) {
      console.error(
        `✗ ${relative(REPO_ROOT, OUTPUT_JSON)} is stale. Run \`node scripts/ci/x-charts-adoption-scan.mjs\` and commit.`,
      );
      process.exit(1);
    }
  }
  console.log(`✓ ${relative(REPO_ROOT, OUTPUT_MD)} up to date (${entries.length} consumers).`);
} else {
  writeFileSync(OUTPUT_MD, md);
  if (flagJson) writeFileSync(OUTPUT_JSON, json);
  console.log(`✓ Wrote ${relative(REPO_ROOT, OUTPUT_MD)} (${entries.length} consumers).`);
  if (flagJson) console.log(`✓ Wrote ${relative(REPO_ROOT, OUTPUT_JSON)}`);
}
