#!/usr/bin/env node
/**
 * Evidence Collector — CI artefaktlarını tek JSON'da toplar
 *
 * K2 (Wave 1.1) — Design Lab Truth Plane'e besleyen registry üretir.
 *
 * Usage:
 *   node scripts/collect-evidence.mjs                      # default: .evidence/registry.json
 *   node scripts/collect-evidence.mjs --out <path>         # custom output path
 *
 * Schema (v1):
 *   - schema_version: 1
 *   - generated_by: "scripts/collect-evidence.mjs"
 *   - timestamp, version
 *   - 7 ana alan: visual_regression, security, benchmarks, coverage, compatibility, tests, docs_truth
 *   - per-section provenance: 'live' | 'ci' | 'derived' | 'no_data'
 *   - source_refs: hangi workflow/dosya kaynak
 *
 * Provenance kuralı (W1.5):
 *   - 'live'    : runtime/API canlı veri
 *   - 'ci'      : gerçek CI result artifact'i
 *   - 'derived' : repo dosyası/config varlığından türetilmiş (workflow var, sonuç yok)
 *   - 'no_data' : kaynak yok veya okunamadı
 *
 * Status kuralı:
 *   - configured: workflow var, sonuç artifact'i yok
 *   - passing/failing: yalnız gerçek CI result varsa
 *   - missing: workflow yok
 *   - no_data: kaynak yok
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------------ */
/*  Args                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i++;
    } else if (argv[i].startsWith('--out=')) {
      args.out = argv[i].slice('--out='.length);
    }
  }
  return args;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function workflowExists(name) {
  return existsSync(join(ROOT, '.github', 'workflows', name));
}

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readYAMLField(filePath, field) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const regex = new RegExp(`${field}:\\s*\\[([^\\]]+)\\]`);
    const match = content.match(regex);
    if (match) {
      return match[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Visual Regression — Aktif workflow'lar: web-playwright + chromatic */
/* ------------------------------------------------------------------ */

function collectVisualRegression() {
  const playwrightSmoke = workflowExists('web-playwright-smoke.yml');
  const playwrightNightly = workflowExists('web-playwright-nightly.yml');
  const chromatic = workflowExists('chromatic.yml');

  // Provider önceliği: playwright (aktif) > chromatic (legacy) > none
  let provider = 'none';
  let workflowExistsResult = false;
  if (playwrightSmoke || playwrightNightly) {
    provider = 'playwright';
    workflowExistsResult = true;
  } else if (chromatic) {
    provider = 'chromatic';
    workflowExistsResult = true;
  }

  return {
    provider,
    workflow_exists: workflowExistsResult,
    last_run: null,
    status: workflowExistsResult ? 'configured' : 'missing',
    stats: { pass: 0, fail: 0, changed: 0, new: 0, skipped: 0 },
  };
}

/* ------------------------------------------------------------------ */
/*  Security — Aktif: codeql + gate-secrets + gate-osv-scan            */
/* ------------------------------------------------------------------ */

function collectSecurity() {
  // Aktif workflow → key eşleştirmesi (Codex iter-4 Karar-3)
  const checks = {
    codeql: 'codeql.yml',
    secret_scan: 'gate-secrets.yml',
    trivy: 'gate-osv-scan.yml', // OSV scan trivy yerine (legacy key korundu)
    sbom: null, // aktif workflow yok
    guardrails: null, // aktif workflow yok
  };

  const result = {};
  for (const [key, file] of Object.entries(checks)) {
    if (file === null) {
      result[key] = { workflow_exists: false, status: 'missing' };
      continue;
    }
    const exists = workflowExists(file);
    result[key] = {
      workflow_exists: exists,
      status: exists ? 'configured' : 'missing',
    };
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Benchmarks                                                          */
/* ------------------------------------------------------------------ */

function collectBenchmarks() {
  const wfExists = workflowExists('benchmark-gate.yml');

  const benchResultPath = join(ROOT, '.evidence', 'benchmark-results.json');
  const results = readJSON(benchResultPath) ?? {};

  let thresholdEnforced = false;
  if (wfExists) {
    try {
      const content = readFileSync(join(ROOT, '.github', 'workflows', 'benchmark-gate.yml'), 'utf-8');
      thresholdEnforced = content.includes('threshold') || content.includes('budget');
    } catch {
      // ignore
    }
  }

  return {
    workflow_exists: wfExists,
    last_run: null,
    threshold_enforced: thresholdEnforced,
    results,
  };
}

/* ------------------------------------------------------------------ */
/*  Coverage                                                            */
/* ------------------------------------------------------------------ */

function collectCoverage() {
  const summaryPath = join(ROOT, 'packages', 'design-system', 'coverage', 'coverage-summary.json');
  const summary = readJSON(summaryPath);

  if (!summary?.total) {
    return {
      available: false,
      lines: null,
      branches: null,
      functions: null,
      statements: null,
    };
  }

  const t = summary.total;
  return {
    available: true,
    lines: t.lines?.pct ?? null,
    branches: t.branches?.pct ?? null,
    functions: t.functions?.pct ?? null,
    statements: t.statements?.pct ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Compatibility Matrix                                                */
/* ------------------------------------------------------------------ */

function collectCompatibility() {
  const wfExists = workflowExists('compatibility-matrix.yml');
  const matrix = { node: ['22'], react: ['18.2'] };

  if (wfExists) {
    const wfPath = join(ROOT, '.github', 'workflows', 'compatibility-matrix.yml');
    const nodeVersions = readYAMLField(wfPath, 'node-version') ?? readYAMLField(wfPath, 'node');
    const reactVersions = readYAMLField(wfPath, 'react-version') ?? readYAMLField(wfPath, 'react');
    if (nodeVersions) matrix.node = nodeVersions;
    if (reactVersions) matrix.react = reactVersions;
  }

  return {
    workflow_exists: wfExists,
    matrix,
  };
}

/* ------------------------------------------------------------------ */
/*  Browser Tests                                                       */
/* ------------------------------------------------------------------ */

function collectBrowserTests() {
  const dir = join(ROOT, 'packages');
  let count = 0;
  try {
    count = parseInt(
      execSync(
        'find . -name "*.browser.test.*" -not -path "*/node_modules/*" 2>/dev/null | wc -l',
        { cwd: dir, encoding: 'utf-8' },
      ).trim(),
      10,
    ) || 0;
  } catch {
    // fallback
  }
  return {
    files: count,
    provider: 'playwright',
  };
}

/* ------------------------------------------------------------------ */
/*  Visual Regression Tests (vitest-screenshot)                         */
/* ------------------------------------------------------------------ */

function collectVisualRegressionTests() {
  const dir = join(ROOT, 'packages');
  let count = 0;
  try {
    count = parseInt(
      execSync(
        'find . -name "*.visual.test.*" -not -path "*/node_modules/*" 2>/dev/null | wc -l',
        { cwd: dir, encoding: 'utf-8' },
      ).trim(),
      10,
    ) || 0;
  } catch {
    // fallback
  }
  return {
    files: count,
    provider: 'vitest-screenshot',
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

function collectTests() {
  const cachedPath = join(ROOT, '.evidence', 'test-results.json');
  const cached = readJSON(cachedPath);
  if (cached) return cached;

  return {
    design_system: { files: 0, tests: 0, pass: 0, fail: 0 },
    x_suite: { files: 0, tests: 0, pass: 0, fail: 0 },
    shell: { files: 0, tests: 0, pass: 0, fail: 0 },
  };
}

/* ------------------------------------------------------------------ */
/*  Docs Truth                                                          */
/* ------------------------------------------------------------------ */

function collectDocsTruth() {
  const cachedPath = join(ROOT, '.evidence', 'docs-truth.json');
  const cached = readJSON(cachedPath);
  if (cached) return cached;

  return {
    phantom_imports: 0,
    stale_examples: 0,
    last_check: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Provenance — section bazlı (W1.5)                                  */
/* ------------------------------------------------------------------ */

function deriveProvenance(registry) {
  // 'derived': workflow var, sonuç artifact yok
  // 'ci': cached CI result var
  // 'no_data': kaynak yok
  const provenance = {
    visual_regression: registry.visual_regression.workflow_exists ? 'derived' : 'no_data',
    security: Object.values(registry.security).some((c) => c.workflow_exists) ? 'derived' : 'no_data',
    benchmarks: registry.benchmarks.workflow_exists
      ? Object.keys(registry.benchmarks.results || {}).length > 0
        ? 'ci'
        : 'derived'
      : 'no_data',
    coverage: registry.coverage.available ? 'ci' : 'no_data',
    compatibility: registry.compatibility.workflow_exists ? 'derived' : 'no_data',
    tests: registry.tests.design_system.files > 0 ? 'ci' : 'no_data',
    docs_truth: registry.docs_truth.last_check ? 'ci' : 'no_data',
  };
  return provenance;
}

function buildSourceRefs(registry) {
  const refs = {};
  if (registry.visual_regression.workflow_exists) {
    if (workflowExists('web-playwright-nightly.yml')) {
      refs['visual_regression'] = '.github/workflows/web-playwright-nightly.yml';
    } else if (workflowExists('web-playwright-smoke.yml')) {
      refs['visual_regression'] = '.github/workflows/web-playwright-smoke.yml';
    } else if (workflowExists('chromatic.yml')) {
      refs['visual_regression'] = '.github/workflows/chromatic.yml';
    }
  }
  if (registry.security.codeql.workflow_exists) {
    refs['security.codeql'] = '.github/workflows/codeql.yml';
  }
  if (registry.security.secret_scan.workflow_exists) {
    refs['security.secret_scan'] = '.github/workflows/gate-secrets.yml';
  }
  if (registry.security.trivy.workflow_exists) {
    refs['security.trivy'] = '.github/workflows/gate-osv-scan.yml';
  }
  if (registry.benchmarks.workflow_exists) {
    refs['benchmarks'] = '.github/workflows/benchmark-gate.yml';
  }
  if (registry.compatibility.workflow_exists) {
    refs['compatibility'] = '.github/workflows/compatibility-matrix.yml';
  }
  if (registry.coverage.available) {
    refs['coverage'] = 'packages/design-system/coverage/coverage-summary.json';
  }
  return refs;
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  const args = parseArgs(process.argv.slice(2));

  const baseRegistry = {
    visual_regression: collectVisualRegression(),
    browser_tests: collectBrowserTests(),
    visual_regression_tests: collectVisualRegressionTests(),
    security: collectSecurity(),
    benchmarks: collectBenchmarks(),
    coverage: collectCoverage(),
    compatibility: collectCompatibility(),
    tests: collectTests(),
    docs_truth: collectDocsTruth(),
  };

  const registry = {
    schema_version: 1,
    generated_by: 'scripts/collect-evidence.mjs',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    ...baseRegistry,
    provenance: deriveProvenance(baseRegistry),
    source_refs: buildSourceRefs(baseRegistry),
  };

  const outPath = args.out
    ? resolve(ROOT, args.out)
    : join(ROOT, '.evidence', 'registry.json');

  const outDir = dirname(outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n');

  const securityActive = Object.values(registry.security).filter((s) => s.workflow_exists).length;
  console.log(`[evidence] Registry written to ${outPath}`);
  console.log(`[evidence] Schema v${registry.schema_version} | timestamp ${registry.timestamp}`);
  console.log(`[evidence] Coverage available: ${registry.coverage.available}`);
  console.log(`[evidence] Workflows detected: ${securityActive} security, ${registry.visual_regression.workflow_exists ? 1 : 0} visual, ${registry.benchmarks.workflow_exists ? 1 : 0} benchmark`);
  console.log(`[evidence] Provenance: ${Object.entries(registry.provenance).map(([k, v]) => `${k}=${v}`).join(', ')}`);
}

main();
