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

function evaluateStrictAdvisory(advisory, label, jobKey) {
  // Mirrors web-test-gate.yml:521-563 — for each advisory, three independent
  // checks. result not in {success, skipped} → fail. outcome === failure → fail.
  // outcome not in {success, skipped} → fail.
  const job = advisory[jobKey];
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

function evaluate(fixture) {
  const requiredFailures = evaluateRequired(fixture.required);

  let advisoryFailures = [];
  if (fixture.strict_gates === 'true') {
    advisoryFailures = [
      ...evaluateStrictAdvisory(fixture.advisory, 'cssom-full-advisory', 'cssom_full'),
      ...evaluateStrictAdvisory(fixture.advisory, 'lint-warn-visibility-advisory', 'lint'),
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
    const wouldFail = fixture.strict_gates === 'true' && (
      !['success', 'skipped'].includes(job.result)
      || job.outcome === 'failure'
      || !['success', 'skipped'].includes(job.outcome)
    );
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
