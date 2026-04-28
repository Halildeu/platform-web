#!/usr/bin/env node
/**
 * Public Evidence Sync — K2 (Wave 1.1)
 *
 * Tek adımda hem evidence registry'yi hem scorecard.json'u public path'e syncler:
 *   1. node scripts/collect-evidence.mjs --out apps/mfe-shell/public/evidence-registry.v1.json
 *   2. cd packages/design-system && node scripts/ci/component-scorecard.mjs --json
 *   3. cp packages/design-system/reports/scorecard.json apps/mfe-shell/public/scorecard.json
 *   4. JSON validate (evidence required keys + scorecard array shape)
 *
 * Usage:
 *   node scripts/sync-public-evidence.mjs                    # full sync
 *   node scripts/sync-public-evidence.mjs --evidence-only    # skip scorecard
 *   node scripts/sync-public-evidence.mjs --scorecard-only   # skip evidence
 *
 * Used by:
 *   - .github/workflows/evidence-collect.yml (PR + nightly + push to main)
 *   - .github/workflows/ci-web-image-push.yml (Docker build pre-step)
 *   - lokal: pnpm exec node scripts/sync-public-evidence.mjs
 *
 * Provenance kuralı (W1.5):
 *   evidence-registry.v1.json içindeki provenance alanı sahte 'passing' üretmez.
 *   Workflow var ama sonuç yok → 'derived'. Kaynak yok → 'no_data'.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------------ */
/*  Args                                                                */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const evidenceOnly = args.includes('--evidence-only');
const scorecardOnly = args.includes('--scorecard-only');

/* ------------------------------------------------------------------ */
/*  Paths                                                               */
/* ------------------------------------------------------------------ */

const PUBLIC_DIR = join(ROOT, 'apps', 'mfe-shell', 'public');
const EVIDENCE_OUT = join(PUBLIC_DIR, 'evidence-registry.v1.json');
const SCORECARD_OUT = join(PUBLIC_DIR, 'scorecard.json');
const SCORECARD_SOURCE = join(ROOT, 'packages', 'design-system', 'reports', 'scorecard.json');

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function run(cmd, cwd = ROOT) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function readJSON(p) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Evidence registry                                          */
/* ------------------------------------------------------------------ */

function syncEvidence() {
  console.log('\n[sync-public-evidence] Step 1/3 — collect evidence registry');
  ensureDir(EVIDENCE_OUT);
  run(`node scripts/collect-evidence.mjs --out ${EVIDENCE_OUT}`);

  // Validate
  const evidence = readJSON(EVIDENCE_OUT);
  const requiredKeys = [
    'schema_version',
    'visual_regression',
    'security',
    'benchmarks',
    'coverage',
    'compatibility',
    'tests',
    'docs_truth',
    'provenance',
  ];
  const missing = requiredKeys.filter((k) => !(k in evidence));
  if (missing.length > 0) {
    throw new Error(`Evidence registry missing keys: ${missing.join(', ')}`);
  }
  if (evidence.schema_version !== 1) {
    throw new Error(`Evidence schema version mismatch: expected 1, got ${evidence.schema_version}`);
  }
  console.log(`  ✓ Evidence registry validated (schema v${evidence.schema_version})`);
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Scorecard generate                                         */
/* ------------------------------------------------------------------ */

function syncScorecard() {
  console.log('\n[sync-public-evidence] Step 2/3 — generate component scorecard');
  run('node scripts/ci/component-scorecard.mjs --json', join(ROOT, 'packages', 'design-system'));

  if (!existsSync(SCORECARD_SOURCE)) {
    throw new Error(`Scorecard source not found at ${SCORECARD_SOURCE}`);
  }

  console.log('\n[sync-public-evidence] Step 3/3 — copy scorecard to public/');
  ensureDir(SCORECARD_OUT);
  copyFileSync(SCORECARD_SOURCE, SCORECARD_OUT);

  // Validate
  const scorecard = readJSON(SCORECARD_OUT);
  if (!Array.isArray(scorecard)) {
    throw new Error(`Scorecard expected array, got ${typeof scorecard}`);
  }
  if (scorecard.length === 0) {
    throw new Error('Scorecard array is empty');
  }
  const sample = scorecard[0];
  const requiredFields = ['name', 'totalScore', 'grade', 'scores'];
  const missing = requiredFields.filter((f) => !(f in sample));
  if (missing.length > 0) {
    throw new Error(`Scorecard component shape missing: ${missing.join(', ')}`);
  }
  console.log(`  ✓ Scorecard synced (${scorecard.length} components)`);
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  console.log('[sync-public-evidence] K2 (Wave 1.1) — public artifact sync');
  console.log(`  ROOT: ${ROOT}`);
  console.log(`  Evidence out:  ${EVIDENCE_OUT}`);
  console.log(`  Scorecard out: ${SCORECARD_OUT}`);

  if (!scorecardOnly) {
    syncEvidence();
  }
  if (!evidenceOnly) {
    syncScorecard();
  }

  console.log('\n[sync-public-evidence] ✓ Done');
}

main();
