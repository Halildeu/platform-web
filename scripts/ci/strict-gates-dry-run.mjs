#!/usr/bin/env node
/**
 * STRICT_GATES aggregator dry-run.
 *
 * Mirrors the shell logic from `.github/workflows/web-test-gate.yml`
 * lines 487-564 (the `Verify required jobs succeeded` step + the
 * `Strict gates (promote advisory to required)` step) and runs it
 * against a JSON input file describing job outcomes/results.
 *
 * Use case: pre-cutover, the operator can simulate "what would the
 * aggregator do if STRICT_GATES=true and X advisory job failed?"
 * without waiting on a CI cycle.
 *
 * The script does NOT call out to GitHub. It reads a static JSON
 * fixture (`scripts/ci/fixtures/strict-gates/*.json`) and applies
 * the same conditions the YAML applies. Output is human-readable
 * PASS/FAIL plus a per-condition summary.
 *
 * Exit codes:
 *   0 — aggregator would pass
 *   1 — aggregator would fail (one or more required-or-strict
 *       conditions tripped)
 *   2 — invalid input (missing fixture, bad JSON, missing required
 *       fields)
 *
 * Reference: docs/operations/strict-gates-cheat-sheet.md
 *
 * Codex thread 019dfa07 (PR-9 manifest cutover) + 019df9b2 (PR-6
 * cutover readiness) recommended this dry-run as a D30 precondition.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const usage = `
Usage: node scripts/ci/strict-gates-dry-run.mjs <fixture.json>

Fixture schema:
  {
    "strict_gates": "true" | "false",
    "required": {
      "unit": { "result": "success" | "failure" | ... },
      "token_drift": { "result": ... },
      "cssom_canary": { "result": ... },
      "visual_invariant": { "result": ... }
    },
    "advisory": {
      "cssom_full": { "result": ..., "outcome": ... },
      "lint": { "result": ..., "outcome": ... }
    }
  }

Run \`npm run gate:dry-run -- <fixture>\` to invoke from the repo
root with a packaged fixture.
`.trim();

function loadFixture(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`error: cannot read fixture ${path}: ${err.message}`);
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`error: invalid JSON in ${path}: ${err.message}`);
    process.exit(2);
  }

  // Schema validation — keep it simple, surface the field path that's missing.
  const requiredKeys = ['strict_gates', 'required', 'advisory'];
  for (const k of requiredKeys) {
    if (!(k in parsed)) {
      console.error(`error: fixture missing top-level key '${k}'`);
      process.exit(2);
    }
  }

  // strict_gates MUST be a string ('true' | 'false') — mirrors GitHub
  // Actions repo-variable behavior where vars.STRICT_GATES is read as
  // a string and compared with `== 'true'`. Boolean true would silently
  // be treated as strict-off (string mismatch) and produce a wrong PASS.
  // Codex thread 019dfa66 iter-1 finding 2.
  if (parsed.strict_gates !== 'true' && parsed.strict_gates !== 'false') {
    console.error(
      `error: fixture 'strict_gates' must be the string "true" or "false" (got ${JSON.stringify(parsed.strict_gates)} of type ${typeof parsed.strict_gates})`,
    );
    process.exit(2);
  }

  for (const job of ['unit', 'token_drift', 'cssom_canary', 'visual_invariant']) {
    if (!parsed.required[job] || typeof parsed.required[job].result !== 'string') {
      console.error(`error: fixture missing required.${job}.result`);
      process.exit(2);
    }
  }
  for (const job of ['cssom_full', 'lint']) {
    if (!parsed.advisory[job] || typeof parsed.advisory[job].result !== 'string'
        || typeof parsed.advisory[job].outcome !== 'string') {
      console.error(`error: fixture missing advisory.${job}.{result,outcome}`);
      process.exit(2);
    }
  }

  // _expected_exit is optional metadata used by gate:dry-run:all to
  // self-verify each fixture. If present, must be 0 / 1 / 2.
  if ('_expected_exit' in parsed) {
    if (![0, 1, 2].includes(parsed._expected_exit)) {
      console.error(
        `error: fixture '_expected_exit' must be 0, 1, or 2 (got ${JSON.stringify(parsed._expected_exit)})`,
      );
      process.exit(2);
    }
  }

  return parsed;
}

function evaluateRequired(required) {
  // Mirrors web-test-gate.yml:487-499 — every required job result must be 'success'.
  const failures = [];
  for (const [name, job] of Object.entries(required)) {
    if (job.result !== 'success') {
      failures.push({ job: name, reason: `result='${job.result}' (must be 'success')` });
    }
  }
  return failures;
}

function evaluateCssomFullAdvisory(advisory) {
  // Mirrors web-test-gate.yml:521-540 — cssom-full has THREE independent
  // checks: result not in {success, skipped} → fail. outcome === failure
  // → fail. outcome not in {success, skipped} → fail (cancelled etc).
  const job = advisory.cssom_full;
  const label = 'cssom-full-advisory';
  const failures = [];
  const acceptableResult = ['success', 'skipped'];
  const acceptableOutcome = ['success', 'skipped'];

  if (!acceptableResult.includes(job.result)) {
    failures.push({
      job: label,
      reason: `job result='${job.result}' (must be 'success' or 'skipped' under STRICT_GATES — install/setup failure)`,
    });
  }
  if (job.outcome === 'failure') {
    failures.push({
      job: label,
      reason: `step outcome='failure' under STRICT_GATES`,
    });
  }
  if (!acceptableOutcome.includes(job.outcome)) {
    failures.push({
      job: label,
      reason: `step outcome='${job.outcome}' (must be 'success' or 'skipped' — cancelled etc)`,
    });
  }
  return failures;
}

function evaluateLintAdvisory(advisory) {
  // Mirrors web-test-gate.yml:549-563 — lint advisory has TWO checks
  // only. The YAML intentionally does NOT have the third
  // `outcome not in {success, skipped}` check that cssom-full has.
  // Codex thread 019dfa66 iter-1 finding 1: previous unified
  // implementation over-failed on `lint outcome=cancelled` (etc).
  // Keeping parity with the YAML is the contract here.
  const job = advisory.lint;
  const label = 'lint-warn-visibility-advisory';
  const failures = [];
  const acceptableResult = ['success', 'skipped'];

  if (!acceptableResult.includes(job.result)) {
    failures.push({
      job: label,
      reason: `job result='${job.result}' (must be 'success' or 'skipped' under STRICT_GATES — install/setup failure or summarize step crash)`,
    });
  }
  if (job.outcome === 'failure') {
    failures.push({
      job: label,
      reason: `step outcome='failure' under STRICT_GATES (ESLint infra failure — parse/config crash, NOT warning count)`,
    });
  }
  return failures;
}

function evaluate(fixture) {
  const requiredFailures = evaluateRequired(fixture.required);

  let advisoryFailures = [];
  if (fixture.strict_gates === 'true') {
    advisoryFailures = [
      ...evaluateCssomFullAdvisory(fixture.advisory),
      ...evaluateLintAdvisory(fixture.advisory),
    ];
  }

  return { requiredFailures, advisoryFailures };
}

function printReport(fixturePath, fixture, result) {
  const { requiredFailures, advisoryFailures } = result;
  const allFailures = [...requiredFailures, ...advisoryFailures];

  console.log('');
  console.log(`STRICT_GATES dry-run: ${fixturePath}`);
  console.log(`  STRICT_GATES = ${fixture.strict_gates}`);
  console.log('');

  // Per-job table.
  console.log('Required jobs:');
  for (const [name, job] of Object.entries(fixture.required)) {
    const status = job.result === 'success' ? 'PASS' : 'FAIL';
    console.log(`  ${pad(name, 24)}  result=${pad(job.result, 10)}  ${status}`);
  }
  console.log('');
  console.log('Advisory jobs:');
  for (const [name, job] of Object.entries(fixture.advisory)) {
    // Per-advisory failure check — must mirror the asymmetry in
    // evaluateCssomFullAdvisory (3 conditions) vs evaluateLintAdvisory
    // (2 conditions) so the printed status matches what evaluate()
    // actually counts as a failure.
    let wouldFail = false;
    if (fixture.strict_gates === 'true') {
      const acceptableResult = ['success', 'skipped'];
      const acceptableOutcome = ['success', 'skipped'];
      if (name === 'cssom_full') {
        wouldFail =
          !acceptableResult.includes(job.result)
          || job.outcome === 'failure'
          || !acceptableOutcome.includes(job.outcome);
      } else if (name === 'lint') {
        // lint: only 2 conditions checked. cancelled outcome passes.
        wouldFail =
          !acceptableResult.includes(job.result)
          || job.outcome === 'failure';
      }
    }
    const status = fixture.strict_gates === 'true'
      ? (wouldFail ? 'FAIL (strict)' : 'pass (strict)')
      : 'advisory only';
    console.log(`  ${pad(name, 24)}  result=${pad(job.result, 10)}  outcome=${pad(job.outcome, 10)}  ${status}`);
  }
  console.log('');

  if (allFailures.length === 0) {
    console.log('Aggregator: PASS');
    return 0;
  }

  console.log('Aggregator: FAIL');
  for (const f of allFailures) {
    console.log(`  - ${f.job}: ${f.reason}`);
  }
  return 1;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage);
    process.exit(args.length === 0 ? 2 : 0);
  }

  const fixturePath = resolve(process.cwd(), args[0]);
  const fixture = loadFixture(fixturePath);
  const result = evaluate(fixture);
  const exitCode = printReport(args[0], fixture, result);
  process.exit(exitCode);
}

main();
