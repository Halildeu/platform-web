/**
 * Grid architecture contract test — PR-B hard CI gate.
 *
 * Asserts the unified-grid invariant established by PR-A
 * (CompensationDashboard ChartDataGrid migration to GridShell): every
 * data grid in `apps/mfe-reporting/src/**` routes through the
 * design-system grid contract (`GridShell` + `ColumnMeta` column-
 * system, or its `EntityGridTemplate` composition), and no app
 * source file directly imports `ag-grid-react` or `@mfe/x-data-grid`
 * outside the explicit exceptions registry.
 *
 * Codex thread `019e7f8f` (cross-AI plan-time consensus + post-impl
 * REVISE-AGAIN absorbed): PR-A AGREE → merged as commit `e7048944`;
 * PR-B implements the machine-enforced invariant so future drift is
 * caught at CI time instead of at code-review or runtime.
 *
 * Why this gate sits inside `mfe-reporting` + Vitest (not ESLint):
 *   (a) The root lint step in `.github/workflows/ci-web-check.yml`
 *       swallows failures via `|| echo "Lint warnings tolerated"`
 *       (Faz 19.6 baseline; deferred to a separate "lint baseline /
 *       ratchet" PR). The existing ESLint `no-restricted-syntax`
 *       rule for `ag-grid-react` therefore acts only as IDE-time
 *       advisory feedback; CI does not fail on it.
 *   (b) AST scan via `typescript-eslint`'s parser catches static
 *       `import`, dynamic `import()`, `require()`, re-export
 *       (`export ... from`), and TypeScript-specific
 *       `import = require()` syntax. A regex-only scan would miss
 *       the dynamic / re-export shapes Codex iter-REVISE flagged.
 *   (c) Putting the gate inside a workspace-scoped vitest run lets
 *       `pnpm --filter mfe-reporting run test:grid-contract` exit
 *       non-zero and fail the CI step authoritatively (no `|| echo`,
 *       no `--if-present`).
 *
 * Codex iter REVISE absorptions applied here:
 *   - No `ajv` / new JSON-Schema runtime dependency — hand-rolled
 *     semantic validator for the exceptions registry (the schema
 *     JSON is informational + IDE-completion only).
 *   - `typescript-eslint` top-level `parser` import (NOT
 *     `@typescript-eslint/parser` — that subpath would need a
 *     separate devDependency).
 *   - `node:fs` + `node:path` walker (NOT `fast-glob` / `glob`).
 *   - AST scan covers: ImportDeclaration, ImportExpression,
 *     ExportNamedDeclaration with source, ExportAllDeclaration,
 *     TSImportEqualsDeclaration with external module reference,
 *     CallExpression callee `require`, CallExpression callee
 *     `Import` (legacy dynamic shape).
 *   - Failure message recommends the canonical migration first;
 *     exception-registry escape hatch second.
 */
import { describe, expect, it } from 'vitest';
import { parser } from 'typescript-eslint';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const EXCEPTIONS_PATH = path.resolve(__dirname, 'grid-architecture-exceptions.json');

const RESTRICTED_SPECIFIERS: Record<string, 'direct-ag-grid' | 'direct-x-data-grid'> = {
  'ag-grid-react': 'direct-ag-grid',
  '@mfe/x-data-grid': 'direct-x-data-grid',
};

interface Finding {
  path: string;
  line: number;
  specifier: string;
  kind: 'direct-ag-grid' | 'direct-x-data-grid';
  node: string;
}

interface ExceptionEntry {
  path: string;
  kind: 'direct-ag-grid' | 'direct-x-data-grid';
  reason: string;
  owner: string;
  expiresAt: string;
}

interface ExceptionsFile {
  $schema: string;
  exceptions: ExceptionEntry[];
}

/* ------------------------------------------------------------------ */
/*  Source-file walker (apps/mfe-reporting/src/**)                     */
/* ------------------------------------------------------------------ */

const SKIPPED_DIRECTORY_NAMES = new Set(['__tests__', 'node_modules', 'dist', '.next']);
const SKIPPED_FILE_PATTERN = /\.(test|spec|stories|figma)\.(ts|tsx)$/i;

function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        if (!/\.(ts|tsx)$/i.test(entry.name)) continue;
        if (SKIPPED_FILE_PATTERN.test(entry.name)) continue;
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

/* ------------------------------------------------------------------ */
/*  AST scan — every shape a restricted specifier can sneak in          */
/* ------------------------------------------------------------------ */

interface ParserModule {
  parseForESLint: (
    code: string,
    options: Record<string, unknown>,
  ) => { ast: Record<string, unknown> };
}

const tsParser = parser as unknown as ParserModule;

function parseSource(source: string, filename: string): Record<string, unknown> {
  return tsParser.parseForESLint(source, {
    filePath: filename,
    range: true,
    loc: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: filename.endsWith('.tsx') },
  }).ast;
}

function getRestrictedKind(value: unknown): Finding['kind'] | null {
  if (typeof value !== 'string') return null;
  return RESTRICTED_SPECIFIERS[value] ?? null;
}

function getLine(node: Record<string, unknown>): number {
  const loc = node.loc as { start?: { line?: number } } | undefined;
  return loc?.start?.line ?? 0;
}

function findRestrictedImports(filePath: string): Finding[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parseSource(source, filePath);
  const findings: Finding[] = [];
  const relativePath = path.relative(REPO_ROOT, filePath).split(path.sep).join('/');

  function record(node: Record<string, unknown>, value: string, nodeType: string) {
    const kind = getRestrictedKind(value);
    if (!kind) return;
    findings.push({
      path: relativePath,
      line: getLine(node),
      specifier: value,
      kind,
      node: nodeType,
    });
  }

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const nodeType = n.type as string | undefined;

    if (nodeType === 'ImportDeclaration') {
      const sourceNode = n.source as { value?: unknown } | undefined;
      if (sourceNode && typeof sourceNode.value === 'string') {
        record(n, sourceNode.value, 'ImportDeclaration');
      }
    } else if (nodeType === 'ExportNamedDeclaration' || nodeType === 'ExportAllDeclaration') {
      const sourceNode = n.source as { value?: unknown } | null | undefined;
      if (sourceNode && typeof sourceNode.value === 'string') {
        record(n, sourceNode.value, nodeType);
      }
    } else if (nodeType === 'ImportExpression') {
      const sourceNode = n.source as { type?: string; value?: unknown } | undefined;
      if (sourceNode && sourceNode.type === 'Literal' && typeof sourceNode.value === 'string') {
        record(n, sourceNode.value, 'ImportExpression');
      }
    } else if (nodeType === 'TSImportEqualsDeclaration') {
      const ref = n.moduleReference as
        | { type?: string; expression?: { value?: unknown } }
        | undefined;
      if (
        ref?.type === 'TSExternalModuleReference' &&
        ref.expression &&
        typeof ref.expression.value === 'string'
      ) {
        record(n, ref.expression.value, 'TSImportEqualsDeclaration');
      }
    } else if (nodeType === 'CallExpression') {
      const callee = n.callee as { type?: string; name?: string } | undefined;
      const args = n.arguments as Array<{ type?: string; value?: unknown }> | undefined;
      const firstArg = args?.[0];
      if (
        callee?.type === 'Identifier' &&
        callee.name === 'require' &&
        firstArg?.type === 'Literal' &&
        typeof firstArg.value === 'string'
      ) {
        record(n, firstArg.value, 'CallExpression(require)');
      } else if (
        // legacy dynamic-import shape some toolchains emit
        callee?.type === 'Import' &&
        firstArg?.type === 'Literal' &&
        typeof firstArg.value === 'string'
      ) {
        record(n, firstArg.value, 'CallExpression(Import)');
      }
    }

    for (const key of Object.keys(n)) {
      const value = n[key];
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (value && typeof value === 'object') {
        visit(value);
      }
    }
  }

  visit(ast);
  return findings;
}

/* ------------------------------------------------------------------ */
/*  Exceptions registry — semantic validator (no ajv dependency)        */
/* ------------------------------------------------------------------ */

const OWNER_PATTERN = /^@[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PATH_PATTERN = /^apps\/[^*?[\]]+\.(ts|tsx)$/;
const KIND_VALUES = new Set(['direct-ag-grid', 'direct-x-data-grid']);

function loadExceptions(): ExceptionsFile {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    throw new Error(
      `grid-architecture-exceptions.json missing at ${EXCEPTIONS_PATH}. ` +
        'PR-B initialised it as an empty registry — restore it from git.',
    );
  }
  const raw = JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, 'utf8'));
  validateExceptionsShape(raw);
  return raw as ExceptionsFile;
}

function validateExceptionsShape(raw: unknown): asserts raw is ExceptionsFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('grid-architecture-exceptions.json root must be an object.');
  }
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r);
  for (const k of keys) {
    if (k !== '$schema' && k !== 'exceptions') {
      throw new Error(`grid-architecture-exceptions.json has unknown root key "${k}".`);
    }
  }
  if (r.$schema !== './grid-architecture-exceptions.schema.json') {
    throw new Error(
      'grid-architecture-exceptions.json must declare "$schema": "./grid-architecture-exceptions.schema.json".',
    );
  }
  if (!Array.isArray(r.exceptions)) {
    throw new Error('grid-architecture-exceptions.json "exceptions" must be an array.');
  }
  const todayUtc = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
  );
  for (let i = 0; i < r.exceptions.length; i += 1) {
    const entry = r.exceptions[i] as Record<string, unknown>;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`exceptions[${i}] must be an object.`);
    }
    const entryKeys = Object.keys(entry);
    for (const k of entryKeys) {
      if (!['path', 'kind', 'reason', 'owner', 'expiresAt'].includes(k)) {
        throw new Error(`exceptions[${i}] has unknown key "${k}".`);
      }
    }
    if (typeof entry.path !== 'string' || !PATH_PATTERN.test(entry.path)) {
      throw new Error(
        `exceptions[${i}].path must match ^apps/...\\.(ts|tsx)$ with no wildcards (got: ${JSON.stringify(entry.path)}).`,
      );
    }
    if (typeof entry.kind !== 'string' || !KIND_VALUES.has(entry.kind)) {
      throw new Error(
        `exceptions[${i}].kind must be "direct-ag-grid" or "direct-x-data-grid" (got: ${JSON.stringify(entry.kind)}).`,
      );
    }
    if (typeof entry.reason !== 'string' || entry.reason.length < 20) {
      throw new Error(`exceptions[${i}].reason must be a string of at least 20 chars.`);
    }
    if (typeof entry.owner !== 'string' || !OWNER_PATTERN.test(entry.owner)) {
      throw new Error(
        `exceptions[${i}].owner must match @user or @org/team (got: ${JSON.stringify(entry.owner)}).`,
      );
    }
    if (typeof entry.expiresAt !== 'string' || !ISO_DATE_PATTERN.test(entry.expiresAt)) {
      throw new Error(
        `exceptions[${i}].expiresAt must be ISO YYYY-MM-DD (got: ${JSON.stringify(entry.expiresAt)}).`,
      );
    }
    const expiry = new Date(`${entry.expiresAt}T00:00:00Z`);
    if (Number.isNaN(expiry.getTime())) {
      throw new Error(`exceptions[${i}].expiresAt is not a parseable date.`);
    }
    if (expiry.getTime() < todayUtc.getTime()) {
      throw new Error(
        `exceptions[${i}].expiresAt is in the past (${entry.expiresAt}). Re-justify with a fresh date or migrate the file.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('grid-architecture contract — apps/mfe-reporting/src (HARD gate)', () => {
  it('exceptions registry shape is valid (schema + business rules)', () => {
    expect(() => loadExceptions()).not.toThrow();
  });

  it('no source file directly imports a restricted grid specifier outside the exceptions registry', () => {
    const files = collectSourceFiles(APP_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const exceptionsFile = loadExceptions();
    const allowed = new Set(exceptionsFile.exceptions.map((e) => `${e.path}:${e.kind}`));

    const findings = files.flatMap(findRestrictedImports);
    const violations = findings.filter((f) => !allowed.has(`${f.path}:${f.kind}`));

    if (violations.length > 0) {
      const lines = violations
        .map((v) => `  ${v.path}:${v.line} — ${v.specifier} (${v.node})`)
        .join('\n');
      throw new Error(
        [
          'Grid-architecture invariant violated. Restricted grid imports were found in apps/mfe-reporting/src:',
          '',
          lines,
          '',
          'Recommended fix: route the grid through the design-system contract.',
          '  - Use `GridShell` (read-only, no toolbar/variant) or `EntityGridTemplate`',
          '    (full toolbar) from `@mfe/design-system/advanced/data-grid`.',
          '  - Define columns as declarative `ColumnMeta[]` and transform with',
          '    `buildColDefs(metas, translate)`.',
          '',
          'Escape hatch (CODEOWNERS-gated): add an entry to',
          '  apps/mfe-reporting/src/__tests__/grid-architecture-exceptions.json',
          'with { path, kind, reason (>=20 chars), owner (@user or @org/team), expiresAt (ISO date, future) }.',
          'Exceptions are NOT the default answer — Codex thread 019e7f8f cross-AI consensus retired the last app-level exemption in PR-A.',
        ].join('\n'),
      );
    }

    expect(violations).toEqual([]);
  });

  it('scan covers every grid bypass shape (AST node types pinned)', () => {
    // This test fails if the AST visitor is silently neutered or
    // the typescript-eslint parser changes its node-type vocabulary.
    // Without this guard, the gate could silently pass while not
    // actually scanning the bypass shapes the contract claims.
    const fixture = [
      "import { X } from 'ag-grid-react';",
      "import 'ag-grid-react';",
      "export { Y } from 'ag-grid-react';",
      "export * from 'ag-grid-react';",
      "const Z = await import('ag-grid-react');",
      "const W = require('ag-grid-react');",
      "import V = require('ag-grid-react');",
    ].join('\n');
    const tmp = path.join(__dirname, '__fixture-scan.ts');
    fs.writeFileSync(tmp, fixture, 'utf8');
    try {
      const findings = findRestrictedImports(tmp);
      const nodeTypes = new Set(findings.map((f) => f.node));
      expect(nodeTypes.has('ImportDeclaration')).toBe(true);
      expect(nodeTypes.has('ExportNamedDeclaration')).toBe(true);
      expect(nodeTypes.has('ExportAllDeclaration')).toBe(true);
      expect(nodeTypes.has('ImportExpression')).toBe(true);
      expect(nodeTypes.has('CallExpression(require)')).toBe(true);
      expect(nodeTypes.has('TSImportEqualsDeclaration')).toBe(true);
      // Each restricted specifier hit at least once.
      expect(findings.every((f) => f.specifier === 'ag-grid-react')).toBe(true);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('@mfe/x-data-grid is also restricted in apps/mfe-reporting/src', () => {
    // The enterprise grid kit lives in packages/x-data-grid; reporting
    // apps should not consume it directly — they go through GridShell.
    const fixture = "import { TreeDataGrid } from '@mfe/x-data-grid';";
    const tmp = path.join(__dirname, '__fixture-xdg.ts');
    fs.writeFileSync(tmp, fixture, 'utf8');
    try {
      const findings = findRestrictedImports(tmp);
      expect(findings).toHaveLength(1);
      expect(findings[0].specifier).toBe('@mfe/x-data-grid');
      expect(findings[0].kind).toBe('direct-x-data-grid');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
