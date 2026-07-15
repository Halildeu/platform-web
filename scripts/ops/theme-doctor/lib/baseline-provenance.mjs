import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  BASELINED_CHECK_IDS,
  BaselineError,
  normalizeBaseline,
} from './ratchet-baseline.mjs';

const BASELINE_REPO_PATH = 'scripts/ops/theme-doctor/baseline.v1.json';
const SHA_RE = /^[0-9a-f]{40}$/;
const STATUS_SEVERITY = Object.freeze({ pass: 0, warn: 1, fail: 2 });

function fail(message) {
  throw new BaselineError(`baseline provenance: ${message}`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function checkFromResult(result, label) {
  if (!result || result.origin !== 'check' || !result.ratchet) {
    fail(`${label} did not emit a measured check result`);
  }
  return {
    measurementVersion: result.ratchet.measurementVersion,
    observedStatus: result.status,
    dimensions: result.ratchet.dimensions,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Bind every committed baseline entry to a result measured from a concrete tree. */
export function assertBaselineMatchesMeasuredTree(candidateValue, measuredResults) {
  const candidate = normalizeBaseline(candidateValue);
  const byId = new Map();
  for (const result of measuredResults) {
    if (byId.has(result.id)) fail(`measured tree emitted duplicate check ${result.id}`);
    byId.set(result.id, result);
  }

  for (const [id, check] of Object.entries(candidate.checks)) {
    const measured = checkFromResult(byId.get(id), `measured tree check ${id}`);
    if (!sameJson(check, measured)) {
      fail(`check ${id} does not exactly match the measured tree`);
    }
  }

  for (const id of BASELINED_CHECK_IDS) {
    const result = byId.get(id);
    if (result?.status === 'fail' && !candidate.checks[id]) {
      fail(`measured tree has unrecorded failing reviewed check ${id}`);
    }
  }
  return candidate;
}

/** Build a non-committed authority cap from a measured tree when main has no seed yet. */
export function measuredAuthorityBaseline(measuredResults, sourceCommit) {
  const byId = new Map(measuredResults.map((result) => [result.id, result]));
  const checks = {};
  for (const id of BASELINED_CHECK_IDS) {
    const result = byId.get(id);
    checks[id] = checkFromResult(result, `authoritative tree check ${id}`);
  }
  return normalizeBaseline({
    $schema: './baseline.schema.json',
    schemaVersion: 1,
    tool: 'theme-doctor',
    sourceCommit,
    checks,
  });
}

/** Candidate debt may stay equal or shrink; keys/counts/status may never grow or swap. */
export function assertBaselineMonotonic(candidateValue, authorityValue) {
  const candidate = normalizeBaseline(candidateValue);
  const authority = normalizeBaseline(authorityValue);

  for (const [id, current] of Object.entries(candidate.checks)) {
    const previous = authority.checks[id];
    if (!previous) fail(`candidate adds check ${id} absent from the authoritative baseline`);
    if (current.measurementVersion !== previous.measurementVersion) {
      fail(`candidate changes ${id} measurementVersion`);
    }
    if (STATUS_SEVERITY[current.observedStatus] > STATUS_SEVERITY[previous.observedStatus]) {
      fail(`candidate worsens ${id} observedStatus`);
    }

    const currentNames = Object.keys(current.dimensions);
    const previousNames = Object.keys(previous.dimensions);
    if (!sameJson(currentNames, previousNames)) {
      fail(`candidate changes ${id} dimension contract`);
    }
    for (const name of currentNames) {
      const currentDimension = current.dimensions[name];
      const previousDimension = previous.dimensions[name];
      if (currentDimension.direction !== previousDimension.direction) {
        fail(`candidate changes ${id}.${name} direction`);
      }
      const previousItems = new Map(previousDimension.items.map((item) => [item.key, item.count]));
      for (const item of currentDimension.items) {
        const previousCount = previousItems.get(item.key);
        if (previousCount === undefined) {
          fail(`candidate swaps/adds ${id}.${name} fingerprint ${JSON.stringify(item.key)}`);
        }
        if (item.count > previousCount) {
          fail(`candidate grows ${id}.${name} fingerprint ${JSON.stringify(item.key)} from ${previousCount} to ${item.count}`);
        }
      }
      if (currentDimension.value > previousDimension.value) {
        fail(`candidate grows ${id}.${name} debt from ${previousDimension.value} to ${currentDimension.value}`);
      }
    }
  }
  return candidate;
}

/** Pure orchestration seam used by unit tests and the repository adapter. */
export function verifyBaselineProvenance(candidateValue, {
  headCommit,
  isAncestor,
  currentResults,
  authoritativeBaseline,
  requireCurrentExact = true,
}) {
  const candidate = normalizeBaseline(candidateValue);
  if (!SHA_RE.test(headCommit)) fail('HEAD must resolve to a full lowercase Git commit SHA');
  if (!isAncestor(candidate.sourceCommit, headCommit)) {
    fail(`sourceCommit ${candidate.sourceCommit} is not a real ancestor of HEAD ${headCommit}`);
  }
  if (authoritativeBaseline) {
    const authority = normalizeBaseline(authoritativeBaseline);
    if (candidate.sourceCommit !== authority.sourceCommit) {
      fail(`candidate rotates enduring sourceCommit authority from ${authority.sourceCommit} to ${candidate.sourceCommit}`);
    }
    assertBaselineMonotonic(candidate, authority);
  }
  let currentBinding = 'exact';
  try {
    assertBaselineMatchesMeasuredTree(candidate, currentResults);
  } catch (error) {
    if (requireCurrentExact) throw error;
    currentBinding = 'mismatch-gate-already-rejected';
  }
  return { candidate, currentBinding };
}

function resolveCommit(repoRoot, value, label) {
  if (!SHA_RE.test(value)) fail(`${label} must be an explicit full lowercase Git SHA`);
  const resolved = run('git', ['rev-parse', '--verify', `${value}^{commit}`], { cwd: repoRoot });
  if (resolved.status !== 0) fail(`${label} ${value} is not an available Git commit`);
  const sha = resolved.stdout.trim();
  if (sha !== value) fail(`${label} did not resolve exactly to ${value}`);
  return sha;
}

function isGitAncestor(repoRoot, ancestor, descendant) {
  return run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot }).status === 0;
}

function measureGitTree(repoRoot, scannerPath, commit) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'theme-doctor-provenance-'));
  const checkout = join(temporaryRoot, 'tree');
  let worktreeAdded = false;
  try {
    const added = run('git', ['worktree', 'add', '--detach', '--quiet', checkout, commit], { cwd: repoRoot });
    if (added.status !== 0) fail(`cannot materialize ${commit}: ${added.stderr.trim() || 'git worktree add failed'}`);
    worktreeAdded = true;

    const measured = run(process.execPath, [scannerPath, '--strict-zero', '--json', '--ratchet-measurement-only'], {
      cwd: repoRoot,
      env: { ...process.env, THEME_DOCTOR_SCAN_ROOT: checkout, CI: '' },
    });
    if (![0, 1].includes(measured.status)) {
      fail(`scanner failed for ${commit} with exit ${measured.status}: ${measured.stderr.trim()}`);
    }
    let report;
    try {
      report = JSON.parse(measured.stdout);
    } catch (error) {
      fail(`scanner returned invalid JSON for ${commit}: ${error.message}`);
    }
    if (!Array.isArray(report?.checks)) fail(`scanner report for ${commit} has no checks array`);
    return report.checks;
  } finally {
    if (worktreeAdded) run('git', ['worktree', 'remove', '--force', checkout], { cwd: repoRoot });
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function baselineAtCommit(repoRoot, commit) {
  const exists = run('git', ['cat-file', '-e', `${commit}:${BASELINE_REPO_PATH}`], { cwd: repoRoot });
  if (exists.status !== 0) return undefined;
  const shown = run('git', ['show', `${commit}:${BASELINE_REPO_PATH}`], { cwd: repoRoot });
  if (shown.status !== 0) fail(`cannot read authoritative baseline at ${commit}`);
  try {
    return normalizeBaseline(JSON.parse(shown.stdout));
  } catch (error) {
    fail(`authoritative baseline at ${commit} is invalid: ${error.message}`);
  }
}

/** Fail-closed repository adapter used by the required Theme Doctor gate. */
export function verifyRepositoryBaselineProvenance(candidateValue, {
  repoRoot,
  scannerPath,
  currentResults,
  authoritativeBaseCommit,
  requireAuthoritativeBase = false,
  requireCurrentExact = true,
}) {
  const headRun = run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: repoRoot });
  if (headRun.status !== 0) fail('cannot resolve repository HEAD');
  const headCommit = headRun.stdout.trim();
  const candidate = normalizeBaseline(candidateValue);
  resolveCommit(repoRoot, candidate.sourceCommit, 'sourceCommit');
  const measurementCache = new Map();
  const measureCommit = (commit) => {
    if (!measurementCache.has(commit)) {
      measurementCache.set(commit, measureGitTree(repoRoot, scannerPath, commit));
    }
    return measurementCache.get(commit);
  };

  let authority;
  let authorityKind = 'source-only';
  if (authoritativeBaseCommit) {
    const base = resolveCommit(repoRoot, authoritativeBaseCommit, 'authoritative base');
    const mergeBase = run('git', ['merge-base', headCommit, base], { cwd: repoRoot });
    if (mergeBase.status !== 0 || mergeBase.stdout.trim() !== base) {
      fail(`authoritative base ${base} is not the exact merge-base ancestor of HEAD ${headCommit}`);
    }
    authority = baselineAtCommit(repoRoot, base);
    const baseResults = measureCommit(base);
    if (authority) {
      resolveCommit(repoRoot, authority.sourceCommit, 'authoritative sourceCommit');
      if (!isGitAncestor(repoRoot, authority.sourceCommit, base)) {
        fail(`authoritative sourceCommit ${authority.sourceCommit} is not an ancestor of merge-base ${base}`);
      }
      assertBaselineMatchesMeasuredTree(authority, baseResults);
      authorityKind = 'verified-merge-base-baseline';
    } else {
      authority = measuredAuthorityBaseline(baseResults, base);
      authorityKind = 'measured-merge-base-seed';
    }
  } else if (requireAuthoritativeBase) {
    fail('CI requires --authoritative-baseline-ref with the explicit merge-base SHA');
  }

  const verified = verifyBaselineProvenance(candidate, {
    headCommit,
    isAncestor: (ancestor, descendant) => isGitAncestor(repoRoot, ancestor, descendant),
    currentResults,
    authoritativeBaseline: authority,
    requireCurrentExact,
  });
  return {
    sourceCommit: candidate.sourceCommit,
    headCommit,
    authorityKind,
    currentBinding: verified.currentBinding,
  };
}
