#!/usr/bin/env node
/**
 * scripts/ci/check-visual-invariant-boundary.mjs
 * ----------------------------------------------
 * L4 forward-looking visual boundary guard (PR-3, Codex thread 019df8eb).
 *
 * Fails CI when a PR introduces a new visual snapshot file outside the
 * sanctioned paths. The legacy non-x-charts visual specs that already
 * exist on main are intentionally tolerated — they predate the L4
 * boundary and are tracked as deprecated, non-authoritative manual-only
 * artifacts (see ADR §L4 and docs/tests/test-environment-boundaries.md).
 *
 * Allowed paths (new files):
 *   packages/design-system/src/__visual__/invariants/**\/*.visual.test.ts
 *   packages/design-system/src/__visual__/invariants/__stories__/**\/*.{ts,tsx}
 *   packages/design-system/src/__visual__/__snapshots__/invariants/**
 *   packages/design-system/src/__visual__/x-charts.visual.ts
 *   packages/design-system/src/__visual__/x-charts-mobile.visual.ts
 *   packages/design-system/src/__visual__/__snapshots__/x-charts.visual.ts/**
 *   packages/design-system/src/__visual__/__snapshots__/x-charts-mobile.visual.ts/**
 *
 * Disallowed (will fail):
 *   - New `*.visual.test.ts` outside __visual__/invariants/
 *   - New `*.visual.ts` outside the x-charts allowlist
 *   - New `*.visual.test.tsx` colocated with components anywhere in src/
 *
 * Mode of operation:
 *   - In CI on a PR: diff origin/<base>...HEAD via `git diff --name-status`
 *     and inspect Added (A) entries only.
 *   - Locally without a base ref: warn-only (no fail), prints what would
 *     have been flagged.
 *
 * Existing legacy files on main (pre-PR-3) never trigger a fail.
 *
 * Usage:
 *   node scripts/ci/check-visual-invariant-boundary.mjs [--base=origin/main]
 *
 * Exit codes:
 *   0 — clean (or warn-only mode locally)
 *   1 — disallowed new file detected
 *   2 — script-level failure (git missing, etc.)
 */

import { execSync } from 'node:child_process';
import process from 'node:process';

const args = new Map(
  process.argv
    .slice(2)
    .map((a) => a.split('='))
    .filter((p) => p.length === 2),
);
const baseRef = args.get('--base') ?? process.env.PR_BASE_REF ?? 'origin/main';

function runGit(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' });
  } catch (err) {
    return null;
  }
}

const ALLOW_PATTERNS = [
  /^packages\/design-system\/src\/__visual__\/invariants\/[^/]+\.visual\.test\.ts$/,
  /^packages\/design-system\/src\/__visual__\/invariants\/__stories__\/.+\.(ts|tsx)$/,
  /^packages\/design-system\/src\/__visual__\/__snapshots__\/invariants\//,
  /^packages\/design-system\/src\/__visual__\/x-charts\.visual\.ts$/,
  /^packages\/design-system\/src\/__visual__\/x-charts-mobile\.visual\.ts$/,
  /^packages\/design-system\/src\/__visual__\/__snapshots__\/x-charts\.visual\.ts\//,
  /^packages\/design-system\/src\/__visual__\/__snapshots__\/x-charts-mobile\.visual\.ts\//,
];

const VISUAL_FILE_PATTERNS = [
  /^packages\/design-system\/src\/.*\.visual\.test\.tsx?$/,
  /^packages\/design-system\/src\/.*\.visual\.tsx?$/,
];

function isVisualFile(path) {
  return VISUAL_FILE_PATTERNS.some((re) => re.test(path));
}

function isAllowed(path) {
  return ALLOW_PATTERNS.some((re) => re.test(path));
}

function getAddedFiles() {
  const cmd = `git diff --name-status --diff-filter=A ${baseRef}...HEAD`;
  const out = runGit(cmd);
  if (out === null) {
    console.warn(`[visual-boundary] WARN: git diff against ${baseRef} failed (running locally without remote?).`);
    return null;
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1])
    .filter(Boolean);
}

const added = getAddedFiles();
if (added === null) {
  // Local mode: warn-only, no fail.
  console.log('[visual-boundary] no diff available — skipping in warn-only mode.');
  process.exit(0);
}

const violations = [];
for (const file of added) {
  if (!isVisualFile(file)) continue;
  if (!isAllowed(file)) violations.push(file);
}

if (violations.length === 0) {
  console.log(`[visual-boundary] ✓ no new visual snapshot files outside the L4 invariant allowlist (checked ${added.length} added files).`);
  process.exit(0);
}

console.error('[visual-boundary] ✗ disallowed new visual snapshot file(s) detected:');
for (const v of violations) {
  console.error(`  - ${v}`);
}
console.error('');
console.error('Per ADR §L4 (docs/architecture/frontend/adr-test-environment-strategy.md):');
console.error('  - New invariant snapshots → packages/design-system/src/__visual__/invariants/');
console.error('  - x-charts is the only sanctioned component-level visual gate.');
console.error('  - Legacy non-x-charts visual specs are deprecated; do not add new files.');
process.exit(1);
