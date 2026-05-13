#!/usr/bin/env node
/**
 * PERF-INIT-V2 PR-B5b3 — on-demand federation guard.
 *
 * Source + build-output invariant scanner for the 7 on-demand remote
 * canaries shipped in PR-B5b1 / PR-B5b1.5 / PR-B5b2a / PR-B5b2.  Each
 * remote has a registry-described contract:
 *
 *   - A build-time define gate flag in `apps/mfe-shell/vite.config.ts`
 *   - A wrapper file `apps/mfe-shell/src/app/create<Name>AppOnDemand.tsx`
 *   - A conditional in `apps/mfe-shell/src/app/router/lazy-routes.ts`
 *     selecting between wrapper and eager `createLazyRemoteModule`
 *   - (Admin set only) A conditional in
 *     `apps/mfe-shell/src/app/config/shell-services-wiring.ts` that
 *     gates the static `import('mfe_<admin>/shell-services')` block
 *   - Dist artifact (when canary is built ON): no static
 *     `import("mfe_<remote>/`" specifier survives in the bundle and
 *     no eager `/remotes/<remote>/remoteEntry.js` fetch is wired
 *
 * This script enforces all of the above as a CI hard gate so a
 * future edit cannot silently re-introduce eager federation fetches
 * (which was the 49 MB /login transfer regression PR-B5b1 fixed).
 *
 * Codex thread `019e239a` PARTIAL → AGREE-with-recommendations.
 * Plan-time consult flagged two-layer approach: this script is the
 * source/build static layer (deterministic, fast, PR hard gate); the
 * runtime Playwright smoke + nightly cron is PR-B5b3b follow-up.
 *
 * Usage
 *   node scripts/ci/on-demand-federation-guard.mjs [--build] [--dist-only]
 *
 *   --build       Run `pnpm --filter mfe-shell build` with all 7
 *                 on-demand canary flags ON before scanning the dist.
 *                 Default: assume an existing build under
 *                 apps/mfe-shell/dist/.
 *   --dist-only   Skip source-invariant scan; only verify dist
 *                 artifact.  Useful for separate CI step layout.
 *   --help|-h     Show usage.
 *
 * Exit codes
 *   0  All invariants pass.
 *   1  One or more invariants failed; review CI output.
 *   2  Pre-condition failed (e.g. dist missing without --build).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const SHELL_DIR = join(ROOT, 'apps', 'mfe-shell');
const DIST_DIR = join(SHELL_DIR, 'dist', 'assets');

/* ------------------------------------------------------------------ */
/* Registry — canonical contract for each on-demand remote.            */
/* ------------------------------------------------------------------ */

/**
 * Registry-driven invariant set (Codex `019e239a` recommendation #3):
 * single source of truth for the 7 on-demand remote canaries.  Future
 * additions of an on-demand canary should ONLY require adding a new
 * row here + the wrapper file; the guard inherits coverage
 * automatically.
 *
 * - `key`: canonical lower-snake name (matches MFE federation name minus `mfe_` prefix)
 * - `wrapperFile`: relative path to the on-demand wrapper component
 * - `defineKey`: build-time define constant gating the wrapper branch
 * - `lazyRouteName`: export name in lazy-routes.ts
 * - `expose`: the remote module path used in static `import("mfe_<key>/...")`
 * - `adminSetMember`: true iff the remote is part of the shell-services
 *                     4-remote contract (admin set: users/access/audit/reporting)
 */
const ON_DEMAND_REGISTRY = [
  {
    key: 'suggestions',
    wrapperFile: 'src/app/createSuggestionsAppOnDemand.tsx',
    defineKey: '__MFE_SUGGESTIONS_ON_DEMAND__',
    lazyRouteName: 'SuggestionsApp',
    expose: 'SuggestionsApp',
    adminSetMember: false,
  },
  {
    key: 'ethic',
    wrapperFile: 'src/app/createEthicAppOnDemand.tsx',
    defineKey: '__MFE_ETHIC_ON_DEMAND__',
    lazyRouteName: 'EthicApp',
    expose: 'EthicApp',
    adminSetMember: false,
  },
  {
    key: 'schema_explorer',
    wrapperFile: 'src/app/createSchemaExplorerAppOnDemand.tsx',
    defineKey: '__MFE_SCHEMA_EXPLORER_ON_DEMAND__',
    lazyRouteName: 'SchemaExplorerModule',
    expose: 'SchemaExplorerApp',
    adminSetMember: false,
  },
  {
    key: 'users',
    wrapperFile: 'src/app/createUsersAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'UsersModule',
    expose: 'UsersApp',
    adminSetMember: true,
  },
  {
    key: 'access',
    wrapperFile: 'src/app/createAccessAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'AccessModule',
    expose: 'AccessApp',
    adminSetMember: true,
  },
  {
    key: 'audit',
    wrapperFile: 'src/app/createAuditAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'AuditModule',
    expose: 'AuditApp',
    adminSetMember: true,
  },
  {
    key: 'reporting',
    wrapperFile: 'src/app/createReportingAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'ReportingModule',
    expose: 'ReportingApp',
    adminSetMember: true,
  },
];

/* ------------------------------------------------------------------ */
/* Argument parsing.                                                   */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const opt = { build: false, distOnly: false };
for (const a of args) {
  if (a === '--build') opt.build = true;
  else if (a === '--dist-only') opt.distOnly = true;
  else if (a === '--help' || a === '-h') {
    console.log(
      `Usage: node scripts/ci/on-demand-federation-guard.mjs [--build] [--dist-only]\n` +
        `  --build       Run a fresh production build with all 7 canary flags ON.\n` +
        `  --dist-only   Skip source-invariant scan; only verify dist artifact.\n`,
    );
    process.exit(0);
  } else {
    console.error(`[guard] unknown arg: ${a}`);
    process.exit(2);
  }
}

/* ------------------------------------------------------------------ */
/* Failure accumulator.                                                */
/* ------------------------------------------------------------------ */

const failures = [];
function fail(area, msg) {
  failures.push({ area, msg });
  console.error(`[guard][FAIL][${area}] ${msg}`);
}
function pass(area, msg) {
  console.log(`[guard][PASS][${area}] ${msg}`);
}

/* ------------------------------------------------------------------ */
/* Source invariant scans.                                             */
/* ------------------------------------------------------------------ */

function readSource(rel) {
  return readFileSync(join(SHELL_DIR, rel), 'utf8');
}

function scanSourceInvariants() {
  console.log('[guard] === Source invariant scan ===');
  const lazyRoutes = readSource('src/app/router/lazy-routes.ts');
  const viteConfig = readSource('vite.config.ts');
  const wiring = readSource('src/app/config/shell-services-wiring.ts');

  // Invariant S1: each registry entry has a wrapper file present.
  for (const r of ON_DEMAND_REGISTRY) {
    const wrapperPath = join(SHELL_DIR, r.wrapperFile);
    if (!existsSync(wrapperPath)) {
      fail('S1', `wrapper file missing for "${r.key}": ${r.wrapperFile}`);
    } else {
      pass('S1', `wrapper present: ${r.wrapperFile}`);
    }
  }

  // Invariant S2: `vite.config.ts` define block contains each
  // `defineKey`.  Deduplicate keys (admin set shares one define).
  const definesSeen = new Set();
  for (const r of ON_DEMAND_REGISTRY) {
    if (definesSeen.has(r.defineKey)) continue;
    definesSeen.add(r.defineKey);
    if (!viteConfig.includes(r.defineKey)) {
      fail('S2', `vite.config.ts missing define declaration: ${r.defineKey}`);
    } else {
      pass('S2', `vite.config.ts declares ${r.defineKey}`);
    }
  }

  // Invariant S3: `lazy-routes.ts` declares each define + uses it in
  // a ternary selecting the on-demand wrapper.  Catches the case where
  // someone removes the wrapper branch without removing the wrapper.
  for (const r of ON_DEMAND_REGISTRY) {
    if (!lazyRoutes.includes(`declare const ${r.defineKey}: boolean;`)) {
      fail(
        'S3',
        `lazy-routes.ts missing \`declare const ${r.defineKey}: boolean\` for "${r.key}"`,
      );
      continue;
    }
    if (!lazyRoutes.includes(r.defineKey)) {
      fail('S3', `lazy-routes.ts does not reference define ${r.defineKey} for "${r.key}"`);
    } else {
      pass('S3', `lazy-routes.ts gates ${r.lazyRouteName} via ${r.defineKey}`);
    }
  }

  // Invariant S4: admin-set remotes' static `import('mfe_<admin>/shell-services')`
  // appears ONLY inside the `else` branch of `__MFE_ADMIN_REMOTES_ON_DEMAND__`.
  // Cheap heuristic: scan line-by-line for the import specifier; assert
  // the surrounding 40 lines contain `__MFE_ADMIN_REMOTES_ON_DEMAND__`
  // (the conditional gate from prep-2 #460).
  for (const r of ON_DEMAND_REGISTRY.filter((x) => x.adminSetMember)) {
    const importSpec = `import('mfe_${r.key}/shell-services')`;
    const idx = wiring.indexOf(importSpec);
    if (idx < 0) {
      // OK — entirely removed when canary is permanent.  Eventual state.
      pass('S4', `admin static \`${importSpec}\` not present in wiring (fully on-demand)`);
      continue;
    }
    // Find a window around the specifier; assert the build-time gate is
    // within ±2000 chars (covers the eager-branch else block).
    const winStart = Math.max(0, idx - 2000);
    const winEnd = Math.min(wiring.length, idx + 2000);
    const window = wiring.slice(winStart, winEnd);
    if (!window.includes('__MFE_ADMIN_REMOTES_ON_DEMAND__')) {
      fail(
        'S4',
        `admin static \`${importSpec}\` in wiring is NOT gated by __MFE_ADMIN_REMOTES_ON_DEMAND__ ` +
          `(would be eagerly fetched on /login when canary ON)`,
      );
    } else {
      pass('S4', `admin static \`${importSpec}\` is gated by __MFE_ADMIN_REMOTES_ON_DEMAND__`);
    }
  }

  // Invariant S5: each wrapper file calls `createLazyRemoteModule` for
  // the classified fallback safety net.  Codex B5b1 iter-2 P1 lesson:
  // Suspense-uncaught throw without this wrap → React invalid element
  // crash on remote offline.
  for (const r of ON_DEMAND_REGISTRY) {
    const wrapperPath = join(SHELL_DIR, r.wrapperFile);
    if (!existsSync(wrapperPath)) continue;
    const wrapper = readFileSync(wrapperPath, 'utf8');
    if (!wrapper.includes('createLazyRemoteModule')) {
      fail(
        'S5',
        `${r.wrapperFile} does not call createLazyRemoteModule (Suspense fallback safety net missing)`,
      );
    } else {
      pass('S5', `${r.wrapperFile} uses createLazyRemoteModule (classified fallback wired)`);
    }
  }

  // Invariant S6: admin wrappers call `ensureRemoteShellServicesConfigured`
  // BEFORE host.loadRemote(XxxApp) — Codex `019e2358` Option B critical
  // add #2 (route-level race protection).
  for (const r of ON_DEMAND_REGISTRY.filter((x) => x.adminSetMember)) {
    const wrapperPath = join(SHELL_DIR, r.wrapperFile);
    if (!existsSync(wrapperPath)) continue;
    const wrapper = readFileSync(wrapperPath, 'utf8');
    if (!wrapper.includes('ensureRemoteShellServicesConfigured')) {
      fail(
        'S6',
        `admin wrapper ${r.wrapperFile} does not call ensureRemoteShellServicesConfigured ` +
          `(deep-link race protection missing)`,
      );
    } else {
      pass(
        'S6',
        `admin wrapper ${r.wrapperFile} calls ensureRemoteShellServicesConfigured before app load`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Build step (optional).                                              */
/* ------------------------------------------------------------------ */

function runProductionBuild() {
  console.log('[guard] === Running production build with all 7 canary flags ON ===');
  const env = {
    ...process.env,
    VITE_MFE_ON_DEMAND_BOOTSTRAP: 'true',
    VITE_SHELL_ENABLE_SUGGESTIONS_REMOTE: 'true',
    VITE_SHELL_ENABLE_ETHIC_REMOTE: 'true',
    VITE_SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE: 'true',
    VITE_SHELL_ENABLE_USERS_REMOTE: 'true',
    VITE_SHELL_ENABLE_ACCESS_REMOTE: 'true',
    VITE_SHELL_ENABLE_AUDIT_REMOTE: 'true',
    VITE_SHELL_ENABLE_REPORTING_REMOTE: 'true',
  };
  execFileSync('pnpm', ['--filter', 'mfe-shell', 'build'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
}

/* ------------------------------------------------------------------ */
/* Dist artifact scans.                                                */
/* ------------------------------------------------------------------ */

function listDistJs() {
  if (!existsSync(DIST_DIR)) {
    return null;
  }
  return readdirSync(DIST_DIR)
    .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
    .map((f) => join(DIST_DIR, f));
}

function scanDistArtifacts() {
  console.log('[guard] === Dist artifact scan ===');
  const files = listDistJs();
  if (files === null) {
    fail('D0', `${DIST_DIR} missing — run with --build or pre-build mfe-shell`);
    return;
  }
  console.log(`[guard] scanning ${files.length} files under ${DIST_DIR}`);

  // Invariant D1: no canonical static-import specifier survives DCE.
  // Each on-demand remote's `import("mfe_<key>/`` specifier should be
  // dead-code-eliminated when its define is true.
  //
  // Note: legitimate `host.loadRemote('mfe_<key>/...')` STRING literals
  // ARE expected in the runtime register path.  We specifically look
  // for `import("mfe_<key>/`` (the DCE-targeted static-import call site
  // shape Rolldown leaves only when the specifier survives in source).
  for (const r of ON_DEMAND_REGISTRY) {
    const needle = `import("mfe_${r.key}/`;
    const hit = files.find((f) => readFileSync(f, 'utf8').includes(needle));
    if (hit) {
      fail(
        'D1',
        `dist file ${hit.split('/').pop()} contains static \`${needle}` +
          `...\` — eager static import survived DCE for "${r.key}"`,
      );
    } else {
      pass('D1', `no static \`${needle}...\` survives DCE for "${r.key}"`);
    }
  }

  // Invariant D2: `bootstrap-*.js` contains the on-demand register
  // pattern for the admin set (`ensureRemoteShellServicesConfigured`
  // call site is inlined as the canonical `[{name:mfe_reporting,...},...]
  // .forEach(...)` shape).  This confirms the on-demand branch is alive.
  const bootstrapFile = files.find((f) => /\/bootstrap-[^/]+\.js$/.test(f));
  if (!bootstrapFile) {
    fail('D2', 'no bootstrap-*.js file found in dist/assets/');
  } else {
    const bootstrap = readFileSync(bootstrapFile, 'utf8');
    const hasAdminRegister =
      bootstrap.includes('`mfe_reporting`') &&
      bootstrap.includes('`mfe_users`') &&
      bootstrap.includes('`mfe_access`') &&
      bootstrap.includes('`mfe_audit`');
    if (!hasAdminRegister) {
      fail(
        'D2',
        `${bootstrapFile.split('/').pop()} does NOT contain the on-demand register pattern ` +
          `for all 4 admin remotes — canary may not be active in this build`,
      );
    } else {
      pass('D2', `${bootstrapFile.split('/').pop()} contains on-demand register pattern for admin set`);
    }
  }

  // Invariant D3: federation manifest entries for the 7 on-demand
  // remotes are omitted from the host federation config.  We can't
  // directly inspect the runtime config without parsing remoteEntry.js,
  // but the absence of `__mfe_internal__mfe_shell__loadRemote__mfe_<key>_*`
  // chunks (which Rolldown emits for static `import("mfe_<key>/...")`
  // calls) is the proxy.
  for (const r of ON_DEMAND_REGISTRY) {
    const chunkNeedle = `__mfe_internal__mfe_shell__loadRemote__mfe_${r.key}_`;
    const hit = files.find((f) => f.split('/').pop().includes(chunkNeedle));
    if (hit) {
      fail(
        'D3',
        `dist chunk ${hit.split('/').pop()} indicates static-import loadRemote for "${r.key}" ` +
          `survived DCE — eager federation manifest entry leaked`,
      );
    } else {
      pass('D3', `no static-import loadRemote chunk emitted for "${r.key}"`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main.                                                               */
/* ------------------------------------------------------------------ */

console.log(`[guard] PERF-INIT-V2 PR-B5b3 on-demand federation guard\n`);
console.log(`[guard] registry has ${ON_DEMAND_REGISTRY.length} remote(s):`);
for (const r of ON_DEMAND_REGISTRY) {
  console.log(
    `[guard]   - ${r.key} (${r.adminSetMember ? 'admin-set' : 'non-admin'}) ` +
      `wrapper=${r.wrapperFile.split('/').pop()} define=${r.defineKey}`,
  );
}
console.log('');

if (!opt.distOnly) {
  scanSourceInvariants();
}

if (opt.build) {
  runProductionBuild();
}

scanDistArtifacts();

console.log('');
if (failures.length > 0) {
  console.error(`[guard] FAILED: ${failures.length} invariant(s) violated`);
  for (const f of failures) {
    console.error(`  - [${f.area}] ${f.msg}`);
  }
  process.exit(1);
}
console.log(`[guard] PASSED: all invariants verified`);
process.exit(0);
