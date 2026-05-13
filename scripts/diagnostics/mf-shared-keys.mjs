#!/usr/bin/env node
/**
 * mf-shared-keys.mjs — Module Federation shared-scope audit (PR-B2)
 *
 * Verifies the *canonical provider* pattern is applied consistently across the
 * workspace:
 *
 *   - Shell (mfe_shell) declares every core React/Redux/router/query singleton
 *     with `singleton: true` + `eager: true` so the host bundle initialises the
 *     share-scope before any remote loads (no first-paint race).
 *   - Remotes declare the same set with `singleton: true` + `import: false` +
 *     a stub version (the "hostOnly" wrapper).  This tells Module Federation
 *     "I require this dep but the host provides it" → the remote bundle does
 *     NOT ship its own copy → smaller chunk, deterministic context sharing.
 *   - Both sides agree on the same package version (read from `package.json`),
 *     otherwise share-scope negotiation falls back to multiple copies.
 *
 * federation-doctor.mjs covers the BASIC parity (key-by-key set comparison).
 * THIS script is the detailed audit run on demand or in CI when something
 * smells off — it emits one row per (mfe × dep) and surfaces:
 *
 *   - missing entries
 *   - factory mismatches (singleton vs hostOnly vs raw object)
 *   - version mismatches between shell and remote package.json
 *   - eager flag presence on shell side
 *   - import:false flag presence on remote side
 *
 * USAGE:
 *   node scripts/diagnostics/mf-shared-keys.mjs            # human table
 *   node scripts/diagnostics/mf-shared-keys.mjs --json     # CI-friendly JSON
 *   node scripts/diagnostics/mf-shared-keys.mjs --strict   # exit 1 on issues
 *
 * EXIT CODES:
 *   0 — clean (no issues, or only --json mode without --strict)
 *   1 — issues found and --strict was passed (or always in human mode if any)
 *
 * RELATED:
 *   - docs/performance/mf-shared-scope-audit.md
 *   - scripts/ops/federation-doctor.mjs (lightweight sibling)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const flags = new Set(process.argv.slice(2));
const JSON_MODE = flags.has('--json');
const STRICT = flags.has('--strict');

/* ------------------------------------------------------------------ */
/*  MFE registry — keep in sync with federation-doctor                  */
/* ------------------------------------------------------------------ */

const MFE_REGISTRY = [
  { name: 'mfe_shell', dir: 'apps/mfe-shell', role: 'host' },
  { name: 'mfe_suggestions', dir: 'apps/mfe-suggestions', role: 'remote' },
  { name: 'mfe_ethic', dir: 'apps/mfe-ethic', role: 'remote' },
  { name: 'mfe_users', dir: 'apps/mfe-users', role: 'remote' },
  { name: 'mfe_access', dir: 'apps/mfe-access', role: 'remote' },
  { name: 'mfe_audit', dir: 'apps/mfe-audit', role: 'remote' },
  { name: 'mfe_reporting', dir: 'apps/mfe-reporting', role: 'remote' },
];

/* ------------------------------------------------------------------ */
/*  Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

function readSafe(p) {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function readPackageDeps(dir) {
  const pkgPath = join(ROOT, dir, 'package.json');
  if (!existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

/** Extract the `sharedCore` declaration block as raw source text. */
function extractSharedCoreBlock(content) {
  const m = content.match(/const sharedCore\s*=\s*\{([\s\S]*?)\n\};/);
  return m ? m[1] : null;
}

/** Parse one sharedCore entry per line into a structured record. */
function parseSharedCoreEntries(blockSource) {
  if (!blockSource) return [];
  const entries = [];
  // line example: "  'react-dom': hostOnly('react-dom'),"
  //               "  react: singleton('react', 'react', false, true),"
  //               "  '@reduxjs/toolkit': singleton(...)"
  const lineRe =
    /^\s*(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*:\s*(singleton|hostOnly)\s*\(([^)]*)\)/gm;
  let m;
  while ((m = lineRe.exec(blockSource)) !== null) {
    const key = m[1] ?? m[2];
    const factory = m[3];
    const args = m[4]
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    // singleton(name, versionKey?, fallback?, eager?)
    // hostOnly(name, versionKey?, fallback?)
    const eager = factory === 'singleton' && args[3] === 'true';
    const importFalse = factory === 'hostOnly';
    entries.push({ key, factory, eager, importFalse });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/*  Load configs + package.json deps                                    */
/* ------------------------------------------------------------------ */

const mfes = MFE_REGISTRY.map((m) => {
  const content = readSafe(join(ROOT, m.dir, 'vite.config.ts'));
  const sharedCore = parseSharedCoreEntries(extractSharedCoreBlock(content ?? ''));
  return {
    ...m,
    deps: readPackageDeps(m.dir),
    sharedCore,
    sharedCoreByKey: new Map(sharedCore.map((e) => [e.key, e])),
  };
});

const shell = mfes.find((m) => m.role === 'host');
const remotes = mfes.filter((m) => m.role === 'remote');

if (!shell || shell.sharedCore.length === 0) {
  console.error('Could not parse mfe-shell sharedCore block.  Aborting.');
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/*  Audit each (remote × shellDep) pair                                  */
/* ------------------------------------------------------------------ */

const issues = [];
const rows = [];
for (const remote of remotes) {
  for (const shellEntry of shell.sharedCore) {
    const dep = shellEntry.key;
    const remoteEntry = remote.sharedCoreByKey.get(dep);
    const shellVersion = shell.deps[dep] ?? null;
    const remoteVersion = remote.deps[dep] ?? null;
    const versionMismatch =
      shellVersion && remoteVersion && shellVersion !== remoteVersion;

    const row = {
      remote: remote.name,
      dep,
      present: !!remoteEntry,
      factory: remoteEntry?.factory ?? null,
      remoteImportFalse: remoteEntry?.importFalse ?? null,
      shellEager: shellEntry.eager,
      shellVersion,
      remoteVersion,
      versionMismatch,
      issues: [],
    };

    if (!remoteEntry) {
      row.issues.push('missing-in-remote');
      issues.push(`${remote.name}: missing shared singleton '${dep}'`);
    } else if (!remoteEntry.importFalse && !shellEntry.eager) {
      // Both sides import; works but defeats the bundle-size benefit of
      // canonical provider pattern.  Flag as advisory.
      row.issues.push('both-sides-import-no-eager');
    } else if (!remoteEntry.importFalse && shellEntry.eager) {
      // Remote also bundles the dep even though host owns it.  Bundle waste.
      row.issues.push('remote-bundles-canonical');
      issues.push(
        `${remote.name}: '${dep}' duplicated (host is canonical with eager:true; remote should use hostOnly())`,
      );
    }

    if (!shellEntry.eager) {
      row.issues.push('shell-not-eager');
      issues.push(
        `${shell.name}: '${dep}' is not declared with eager:true (race risk on first paint)`,
      );
    }

    if (versionMismatch) {
      row.issues.push('version-mismatch');
      issues.push(
        `${remote.name}: '${dep}' version drifts from shell (${shellVersion} vs ${remoteVersion})`,
      );
    }

    rows.push(row);
  }
}

// Dedupe "shell-not-eager" repeated entries (1 per dep, not per remote pair)
const uniqueIssues = [...new Set(issues)];

/* ------------------------------------------------------------------ */
/*  Emit report                                                         */
/* ------------------------------------------------------------------ */

if (JSON_MODE) {
  const payload = {
    tool: 'mf-shared-keys',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    summary: {
      shellSingletons: shell.sharedCore.length,
      remotes: remotes.length,
      rowsAudited: rows.length,
      issueCount: uniqueIssues.length,
    },
    shell: {
      name: shell.name,
      sharedCore: shell.sharedCore.map((e) => ({
        dep: e.key,
        factory: e.factory,
        eager: e.eager,
        version: shell.deps[e.key] ?? null,
      })),
    },
    rows,
    issues: uniqueIssues,
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(STRICT && uniqueIssues.length > 0 ? 1 : 0);
}

// Human-friendly table
console.log('Module Federation shared-scope audit (PR-B2)\n');
console.log(`Shell: ${shell.name}`);
console.log(`Singletons declared: ${shell.sharedCore.length}`);
for (const e of shell.sharedCore) {
  const flag = e.eager ? 'eager' : 'no-eager';
  console.log(`  - ${e.key.padEnd(28)} factory=${e.factory.padEnd(9)} ${flag}`);
}
console.log(`\nRemotes: ${remotes.length}`);

for (const remote of remotes) {
  console.log(`\n[${remote.name}]`);
  for (const dep of shell.sharedCore.map((e) => e.key)) {
    const row = rows.find((r) => r.remote === remote.name && r.dep === dep);
    if (!row) continue;
    const status = row.issues.length === 0 ? 'OK' : row.issues.join(',');
    const factory = row.factory ?? '<MISSING>';
    console.log(
      `  - ${dep.padEnd(28)} factory=${factory.padEnd(9)}  ${status}`,
    );
  }
}

console.log('\nIssues:');
if (uniqueIssues.length === 0) {
  console.log('  (none)');
} else {
  for (const i of uniqueIssues) console.log(`  - ${i}`);
}

process.exit(STRICT && uniqueIssues.length > 0 ? 1 : 0);
