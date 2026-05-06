#!/usr/bin/env node
/**
 * STRICT_GATES dry-run — full fixture suite verifier.
 *
 * Runs `strict-gates-dry-run.mjs` against every fixture under
 * `scripts/ci/fixtures/strict-gates/` and asserts each one exits
 * with the `_expected_exit` value declared in its JSON. Fails loudly
 * if any fixture's actual exit differs from declared, OR if a
 * fixture is missing the `_expected_exit` field.
 *
 * Use case: CI smoke for the dry-run logic itself, plus operator
 * confidence before flipping STRICT_GATES at D30 cutover.
 *
 * Codex thread 019dfa66 iter-1 finding 4: smoke-only happy path
 * doesn't catch fail-class regressions. This runner adds explicit
 * pass/fail assertions per fixture.
 *
 * Exit codes:
 *   0 — all fixtures match their declared exit
 *   1 — one or more fixtures mismatch
 *   2 — fixture missing _expected_exit, or other invariant break
 */

import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const fixturesDir = join(repoRoot, 'scripts', 'ci', 'fixtures', 'strict-gates');
const dryRunScript = join(repoRoot, 'scripts', 'ci', 'strict-gates-dry-run.mjs');

function listFixtures() {
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(fixturesDir, f))
    .sort();
}

function declaredExit(fixturePath) {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!('_expected_exit' in parsed)) {
    return null;
  }
  return parsed._expected_exit;
}

function run(fixturePath) {
  const result = spawnSync(process.execPath, [dryRunScript, fixturePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return result.status;
}

function main() {
  const fixtures = listFixtures();
  if (fixtures.length === 0) {
    console.error(`error: no fixtures found in ${fixturesDir}`);
    process.exit(2);
  }

  console.log(`STRICT_GATES dry-run suite: ${fixtures.length} fixtures`);
  console.log('');

  let mismatches = 0;
  let missingExpected = 0;

  for (const fixturePath of fixtures) {
    const name = fixturePath.split('/').pop();
    const expected = declaredExit(fixturePath);
    if (expected === null) {
      console.log(`  [SKIP]  ${name}  (missing _expected_exit field)`);
      missingExpected++;
      continue;
    }
    const actual = run(fixturePath);
    if (actual === expected) {
      console.log(`  [ok]    ${name}  (exit=${actual})`);
    } else {
      console.log(`  [FAIL]  ${name}  (expected exit=${expected}, got ${actual})`);
      mismatches++;
    }
  }

  console.log('');
  if (missingExpected > 0) {
    console.log(`${missingExpected} fixture(s) missing _expected_exit — add it to lock the contract.`);
    process.exit(2);
  }
  if (mismatches > 0) {
    console.log(`${mismatches} fixture(s) failed expected-exit assertion.`);
    process.exit(1);
  }
  console.log(`All ${fixtures.length} fixtures match their declared exit codes.`);
  process.exit(0);
}

main();
