#!/usr/bin/env node
// privacy-audit.mjs — F5 Privacy Audit (K3-2, Wave 1)
//
// "Zero external data transmission" garantisi (PHASE-GOVERNANCE F5 Privacy
// kriteri). design-system'in F5 runtime yüzeyinde executable external
// network primitive (fetch / XHR / sendBeacon / WebSocket / EventSource)
// VEYA HTTP client import'u (axios / node-fetch / undici / vb.) bulunmamalı.
//
// Scope (F5 runtime yüzeyi):
//   - src/mcp (recursive)
//   - src/components/adaptive-form (recursive)
//   - src/hooks/useAdaptiveLayout.ts
//   - src/components/smart-dashboard (recursive)
//   - src/intelligence (recursive)
//
// Exclude: __tests__, .stories.tsx, .test.tsx, .figma.tsx, .visual.tsx,
// .browser.tsx, .d.ts. Documentation URL string'leri ve JSDoc @see
// referansları "transmission" sayılmıyor — yalnız executable API kullanımı
// denetlenir.
//
// Consumer callback'ler scope DIŞINDA (AdaptiveForm.onSubmit,
// SmartDashboard.refreshAll consumer-provided fetch yapabilir;
// design-system bunu garanti edemez).
//
// Usage:
//   node scripts/ci/privacy-audit.mjs           # report (warn-only)
//   node scripts/ci/privacy-audit.mjs --ci      # CI hard-block; exit 1 on violations
//
// Output: reports/privacy-audit.json (artifact upload).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(PKG_ROOT, 'src');
const REPORTS_DIR = path.join(PKG_ROOT, 'reports');
const CI_MODE = process.argv.includes('--ci');

/* ------------------------------------------------------------------ */
/*  Scope (F5 runtime target paths)                                    */
/* ------------------------------------------------------------------ */

const SCOPE = [
  { dir: 'mcp', extensions: ['.ts'] },
  { dir: 'components/adaptive-form', extensions: ['.ts', '.tsx'] },
  { dir: 'components/smart-dashboard', extensions: ['.ts', '.tsx'] },
  { dir: 'intelligence', extensions: ['.ts'] },
];

const SINGLE_FILE_TARGETS = [path.join('hooks', 'useAdaptiveLayout.ts')];

const FILE_EXCLUDE_PATTERNS = [
  /\.test\.tsx?$/,
  /\.stories\.tsx?$/,
  /\.figma\.tsx$/,
  /\.visual\.tsx?$/,
  /\.browser\.tsx?$/,
  /\.d\.tsx?$/,
];

const DIR_EXCLUDE_NAMES = new Set(['__tests__', '__visual__', 'node_modules']);

/* ------------------------------------------------------------------ */
/*  Blocklist (executable network primitives + HTTP clients)          */
/* ------------------------------------------------------------------ */

const RUNTIME_API_PATTERNS = [
  { id: 'fetch', regex: /\b(?:window\.|globalThis\.)?fetch\s*\(/, label: 'fetch()' },
  { id: 'xhr-construct', regex: /\bnew\s+XMLHttpRequest\b/, label: 'new XMLHttpRequest()' },
  { id: 'sendBeacon', regex: /\bnavigator\.sendBeacon\s*\(/, label: 'navigator.sendBeacon()' },
  { id: 'websocket', regex: /\bnew\s+WebSocket\b/, label: 'new WebSocket()' },
  { id: 'eventsource', regex: /\bnew\s+EventSource\b/, label: 'new EventSource()' },
];

const HTTP_CLIENT_IMPORTS = [
  'axios',
  'node-fetch',
  'cross-fetch',
  'undici',
  'graphql-request',
  'http',
  'https',
  'node:http',
  'node:https',
];

/* ------------------------------------------------------------------ */
/*  File discovery                                                     */
/* ------------------------------------------------------------------ */

function walk(dir, allowedExtensions, results) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (DIR_EXCLUDE_NAMES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), allowedExtensions, results);
    } else if (entry.isFile()) {
      if (FILE_EXCLUDE_PATTERNS.some((p) => p.test(entry.name))) continue;
      if (!allowedExtensions.some((ext) => entry.name.endsWith(ext))) continue;
      results.push(path.join(dir, entry.name));
    }
  }
}

function collectScopeFiles() {
  const files = [];
  for (const { dir, extensions } of SCOPE) {
    walk(path.join(SRC, dir), extensions, files);
  }
  for (const rel of SINGLE_FILE_TARGETS) {
    const full = path.join(SRC, rel);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

/* ------------------------------------------------------------------ */
/*  Comment / string-only line detection                              */
/* ------------------------------------------------------------------ */

function stripCommentsAndStrings(line) {
  // Quick filter — remove single-line comments and string literals so
  // documentation URLs and JSDoc @see don't trigger false positives.
  // Conservative: leaves enough code to detect executable calls.
  let result = line;
  // Block comment markers
  result = result.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Single-line comments
  const lineCommentIdx = result.indexOf('//');
  if (lineCommentIdx >= 0) result = result.slice(0, lineCommentIdx);
  // Template literals — keep simple replacement; we only care about call sites
  result = result.replace(/`(?:\\[`$\\]|[^`])*`/g, '`STRING`');
  // Single/double quoted strings
  result = result.replace(/'(?:\\.|[^'\\])*'/g, "'STRING'");
  result = result.replace(/"(?:\\.|[^"\\])*"/g, '"STRING"');
  return result;
}

function detectImportStatement(rawLine) {
  // Match: import ... from 'mod';  or  require('mod')
  const importMatch = rawLine.match(/from\s+['"]([^'"]+)['"]/);
  if (importMatch) return importMatch[1];
  const requireMatch = rawLine.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
  if (requireMatch) return requireMatch[1];
  return null;
}

/* ------------------------------------------------------------------ */
/*  Audit                                                               */
/* ------------------------------------------------------------------ */

function auditFile(absPath) {
  const violations = [];
  const content = fs.readFileSync(absPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Import / require check (raw line — module specifier is in a string,
    // but here we explicitly want to flag the executable import).
    const importedModule = detectImportStatement(raw);
    if (importedModule && HTTP_CLIENT_IMPORTS.includes(importedModule)) {
      violations.push({
        kind: 'http-client-import',
        module: importedModule,
        line: i + 1,
        snippet: raw.trim(),
      });
    }

    // Executable network primitive — strip comments/strings before regex.
    const code = stripCommentsAndStrings(raw);
    for (const { id, regex, label } of RUNTIME_API_PATTERNS) {
      if (regex.test(code)) {
        violations.push({
          kind: 'runtime-api',
          api: id,
          label,
          line: i + 1,
          snippet: raw.trim(),
        });
      }
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

function relPath(p) {
  return path.relative(PKG_ROOT, p);
}

function main() {
  const files = collectScopeFiles();
  const fileResults = [];
  let totalViolations = 0;

  for (const file of files) {
    const violations = auditFile(file);
    if (violations.length > 0) {
      totalViolations += violations.length;
      fileResults.push({ file: relPath(file), violations });
    }
  }

  const report = {
    schema_version: 1,
    audit: 'F5-privacy',
    timestamp: new Date().toISOString(),
    scope: SCOPE.map((s) => `src/${s.dir}/**`).concat(SINGLE_FILE_TARGETS.map((s) => `src/${s}`)),
    excludes: ['__tests__', '*.stories.tsx', '*.test.tsx', '*.figma.tsx', '*.visual.tsx', '*.browser.tsx', '*.d.ts'],
    blocklist: {
      runtime_apis: RUNTIME_API_PATTERNS.map((p) => p.id),
      http_clients: HTTP_CLIENT_IMPORTS,
    },
    consumer_scope_note:
      'design-system-owned runtime code only; consumer callbacks (onSubmit, refreshAll, validate) out of scope',
    summary: {
      files_scanned: files.length,
      files_with_violations: fileResults.length,
      total_violations: totalViolations,
    },
    violations: fileResults,
  };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, 'privacy-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  /* ---- Console output ---- */
  console.log('\n🔒 F5 Privacy Audit');
  console.log(`  Scope:      ${report.scope.length} target(s)`);
  console.log(`  Files:      ${files.length} scanned`);
  console.log(`  Violations: ${totalViolations} across ${fileResults.length} file(s)\n`);
  if (totalViolations > 0) {
    for (const { file, violations } of fileResults) {
      console.log(`  ❌ ${file}`);
      for (const v of violations) {
        const what = v.kind === 'runtime-api' ? v.label : `import '${v.module}'`;
        console.log(`     :${v.line}  ${what}`);
        console.log(`        ${v.snippet}`);
      }
    }
    console.log(`\n  Report: ${relPath(outPath)}\n`);
  } else {
    console.log('  ✅ No external network primitives detected.\n');
    console.log(`  Report: ${relPath(outPath)}\n`);
  }

  if (CI_MODE && totalViolations > 0) {
    console.error('❌ PRIVACY AUDIT FAILED — F5 zero-external-data invariant broken.');
    process.exit(1);
  }
}

main();
