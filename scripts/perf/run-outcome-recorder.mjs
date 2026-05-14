#!/usr/bin/env node
/**
 * PERF-INIT-V2.1 PR-G2 iter-2 absorb (Codex thread 019e2776 P0-3):
 * Run-outcome recorder — appends pass/fail outcome to the false-positive
 * ledger so the flake budget evaluator has a real denominator
 * (last N COMPARABLE RUNS, not last N FP-only entries).
 *
 * Reads tests/perf/last-run.json (route-performance-budget.mjs artifact) and
 * appends one JSONL line per route+mode:
 *   { timestamp, route, mode, authState, build_sha, browser_profile,
 *     outcome: 'pass'|'fail', is_fp: false }
 *
 * The flake-budget-tracker.mjs (rerun-confirmed FP appender) writes the
 * is_fp:true / outcome='confirmed_fp' entries. Together they give the
 * <=1 FP / last 20 + <3 FP / last 100 contract a real numerator+denominator.
 *
 * Usage:
 *   node scripts/perf/run-outcome-recorder.mjs --run tests/perf/last-run.json \
 *     --ledger docs/performance/measurements/perf-budget-fp-ledger.jsonl \
 *     [--build-sha SHA] [--browser-profile NAME] [--frontend-image-digest DIGEST]
 *
 * Exit:
 *   0  outcome appended
 *   2  usage / IO error
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULTS = {
  run: 'tests/perf/last-run.json',
  ledger: 'docs/performance/measurements/perf-budget-fp-ledger.jsonl',
  buildSha: process.env.GITHUB_SHA ?? null,
  browserProfile: 'playwright-chromium-bundled',
  frontendImageDigest: null,
};

function parseArgs(argv) {
  const opt = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--run') opt.run = argv[++i];
    else if (a === '--ledger') opt.ledger = argv[++i];
    else if (a === '--build-sha') opt.buildSha = argv[++i];
    else if (a === '--browser-profile') opt.browserProfile = argv[++i];
    else if (a === '--frontend-image-digest') opt.frontendImageDigest = argv[++i];
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printUsage();
      process.exit(2);
    }
  }
  return opt;
}

function printUsage() {
  console.log(
    [
      'Usage: node scripts/perf/run-outcome-recorder.mjs [options]',
      '',
      '  --run PATH                last-run.json',
      '  --ledger PATH             ledger JSONL append',
      '  --build-sha SHA           explicit build SHA (defaults to $GITHUB_SHA)',
      '  --browser-profile NAME    default playwright-chromium-bundled',
      '  --frontend-image-digest D optional image digest',
    ].join('\n'),
  );
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!existsSync(opt.run)) {
    console.error(`[outcome-rec] FATAL: run file missing: ${opt.run}`);
    process.exit(2);
  }
  if (!opt.buildSha) {
    console.error('[outcome-rec] FATAL: build SHA missing (pass --build-sha or set GITHUB_SHA)');
    process.exit(2);
  }
  const run = JSON.parse(readFileSync(opt.run, 'utf8'));
  if (!Array.isArray(run.routes)) {
    console.error('[outcome-rec] FATAL: run JSON missing routes[]');
    process.exit(2);
  }

  mkdirSync(dirname(opt.ledger), { recursive: true });
  let appendedPass = 0;
  let appendedFail = 0;
  for (const r of run.routes) {
    if (r.skipped) continue;
    // Treat measurement errors as 'fail' (not 'unknown') so they enter the
    // denominator and don't silently inflate flake budget. Operator can
    // exclude with separate filter when reviewing ledger.
    const outcome = r.error ? 'fail' : r.pass === false ? 'fail' : 'pass';
    const entry = {
      timestamp: run.timestamp ?? Date.now(),
      route: r.route,
      mode: r.mode,
      authState: r.auth ?? 'anonymous',
      build_sha: opt.buildSha,
      browser_profile: opt.browserProfile,
      frontend_image_digest: opt.frontendImageDigest,
      outcome,
      is_fp: false,
    };
    appendFileSync(opt.ledger, JSON.stringify(entry) + '\n');
    if (outcome === 'pass') appendedPass += 1;
    else appendedFail += 1;
  }
  console.log(`[outcome-rec] appended ${appendedPass} pass + ${appendedFail} fail to ${opt.ledger}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error('[outcome-rec] FATAL:', e && e.message ? e.message : e);
    process.exit(2);
  }
}
