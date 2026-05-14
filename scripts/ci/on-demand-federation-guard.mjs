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

import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
    routeLabel: 'Suggestions',
    expose: 'SuggestionsApp',
    adminSetMember: false,
  },
  {
    key: 'ethic',
    wrapperFile: 'src/app/createEthicAppOnDemand.tsx',
    defineKey: '__MFE_ETHIC_ON_DEMAND__',
    lazyRouteName: 'EthicApp',
    routeLabel: 'Ethic',
    expose: 'EthicApp',
    adminSetMember: false,
  },
  {
    key: 'schema_explorer',
    wrapperFile: 'src/app/createSchemaExplorerAppOnDemand.tsx',
    defineKey: '__MFE_SCHEMA_EXPLORER_ON_DEMAND__',
    lazyRouteName: 'SchemaExplorerModule',
    routeLabel: 'SchemaExplorer',
    expose: 'SchemaExplorerApp',
    adminSetMember: false,
  },
  {
    key: 'users',
    wrapperFile: 'src/app/createUsersAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'UsersModule',
    routeLabel: 'Users',
    expose: 'UsersApp',
    adminSetMember: true,
  },
  {
    key: 'access',
    wrapperFile: 'src/app/createAccessAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'AccessModule',
    routeLabel: 'Access',
    expose: 'AccessApp',
    adminSetMember: true,
  },
  {
    key: 'audit',
    wrapperFile: 'src/app/createAuditAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'AuditModule',
    routeLabel: 'Audit',
    expose: 'AuditApp',
    adminSetMember: true,
  },
  {
    key: 'reporting',
    wrapperFile: 'src/app/createReportingAppOnDemand.tsx',
    defineKey: '__MFE_ADMIN_REMOTES_ON_DEMAND__',
    lazyRouteName: 'ReportingModule',
    routeLabel: 'Reporting',
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
/* Helpers.                                                            */
/* ------------------------------------------------------------------ */

/**
 * Walk through `src` starting at `start` (which should be the
 * character immediately after an opening `{`) and return the index of
 * the matching closing `}` brace.  Tracks string/template literal and
 * single-line / multi-line comments so braces inside them are
 * ignored.  Returns -1 if no matching brace is found.
 *
 * Lightweight — does NOT handle every JS edge case (regex literals,
 * unicode escape edge cases).  Used by S4 to extract the `if`/`else`
 * block bodies in `shell-services-wiring.ts` which is well-formatted
 * canonical TS, not an arbitrary script.
 */
function findMatchingBraceEnd(src, start) {
  let depth = 1;
  let i = start;
  let inSingleString = false;
  let inDoubleString = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingleString) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === "'") inSingleString = false;
      i++;
      continue;
    }
    if (inDoubleString) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '"') inDoubleString = false;
      i++;
      continue;
    }
    if (inTemplate) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') inTemplate = false;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      inSingleString = true;
      i++;
      continue;
    }
    if (c === '"') {
      inDoubleString = true;
      i++;
      continue;
    }
    if (c === '`') {
      inTemplate = true;
      i++;
      continue;
    }
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  return -1;
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

  // Invariant S2b (Codex `019e239a` iter-2 P1 absorb): each registry
  // entry must have a matching spread-conditional in
  // `buildRemotes()` that omits the manifest entry when the on-demand
  // boolean AND the per-remote enable are both true.  Catches the
  // regression where someone re-introduces an unconditional
  // `mfe_<key>: { ... }` entry while leaving wrapper/DCE intact —
  // which would re-add eager federation fetches even though D1/D3
  // dist invariants stay green.
  //
  // Canonical shape (from B5b2-prep-2 PR #460):
  //   ...(<onDemandVar> && enabled.<key>
  //     ? {}
  //     : {
  //         mfe_<key>: { ... },
  //       }),
  //
  // We look for `mfe_<key>` text inside a spread-conditional whose
  // condition includes the canonical on-demand boolean variable
  // (suggestionsOnDemand / ethicOnDemand / schemaExplorerOnDemand /
  // adminRemotesOnDemand).
  const onDemandVarByDefine = {
    __MFE_SUGGESTIONS_ON_DEMAND__: 'suggestionsOnDemand',
    __MFE_ETHIC_ON_DEMAND__: 'ethicOnDemand',
    __MFE_SCHEMA_EXPLORER_ON_DEMAND__: 'schemaExplorerOnDemand',
    __MFE_ADMIN_REMOTES_ON_DEMAND__: 'adminRemotesOnDemand',
  };
  for (const r of ON_DEMAND_REGISTRY) {
    const onDemandVar = onDemandVarByDefine[r.defineKey];
    if (!onDemandVar) {
      fail('S2b', `unknown on-demand variable mapping for define ${r.defineKey}`);
      continue;
    }
    // Find the spread-conditional whose condition starts with the
    // on-demand var.  Allow flexible whitespace + `enabled.<key>` AND.
    const condPattern = new RegExp(
      String.raw`\.\.\.\(\s*${onDemandVar}\s*&&\s*enabled\.${r.key === 'schema_explorer' ? 'schemaExplorer' : r.key}\s*\?\s*\{\s*\}\s*:\s*\{\s*\n?\s*mfe_${r.key}\s*:`,
      'm',
    );
    if (!condPattern.test(viteConfig)) {
      fail(
        'S2b',
        `vite.config.ts buildRemotes() missing canonical spread-conditional for "${r.key}" ` +
          `(expected \`...(${onDemandVar} && enabled.${r.key === 'schema_explorer' ? 'schemaExplorer' : r.key} ? {} : { mfe_${r.key}: ... })\`); ` +
          `unconditional manifest entry would resume eager fetch`,
      );
    } else {
      pass(
        'S2b',
        `vite.config.ts buildRemotes() gates mfe_${r.key} via ${onDemandVar} && enabled spread-conditional`,
      );
    }
  }

  // Invariant S3 (Codex `019e239a` iter-2 P2 absorb): `lazy-routes.ts`
  // declares each define + the canonical ternary shape per registry
  // entry binds the correct wrapper + eager fallback.
  //
  // Original heuristic only checked `lazyRoutes.includes(defineKey)`
  // which let admin remotes (sharing one define) cross-bind to the
  // wrong wrapper.  This stricter check looks for:
  //
  //   export const <lazyRouteName>...= <defineKey>
  //     ? <ExpectedOnDemandWrapper>
  //     : createLazyRemoteModule(<label>, () => import('mfe_<key>/<expose>'))
  //
  // with flexible whitespace + optional type annotation.
  for (const r of ON_DEMAND_REGISTRY) {
    if (!lazyRoutes.includes(`declare const ${r.defineKey}: boolean;`)) {
      fail(
        'S3',
        `lazy-routes.ts missing \`declare const ${r.defineKey}: boolean\` for "${r.key}"`,
      );
      continue;
    }
    // Derive expected on-demand wrapper name from the wrapper file
    // (e.g. createUsersAppOnDemand.tsx → UsersAppOnDemand).
    const baseName = r.wrapperFile.split('/').pop().replace(/\.tsx$/, '');
    const onDemandWrapperName = baseName.replace(/^create/, '');
    // Match the canonical ternary shape — flexible whitespace + use
    // the registry-declared routeLabel for the createLazyRemoteModule
    // first argument (varies: 'Users', 'Suggestions' etc., not
    // routeName).
    const shapePattern = new RegExp(
      String.raw`export\s+const\s+${r.lazyRouteName}[^=]*=\s*${r.defineKey}\s*\?\s*${onDemandWrapperName}\s*:\s*createLazyRemoteModule\s*\(\s*[\`'"]${r.routeLabel}[\`'"]\s*,\s*\(\s*\)\s*=>\s*import\s*\(\s*[\`'"]mfe_${r.key}/${r.expose}[\`'"]`,
      's',
    );
    if (!shapePattern.test(lazyRoutes)) {
      fail(
        'S3',
        `lazy-routes.ts does not have canonical shape \`export const ${r.lazyRouteName} = ${r.defineKey} ? ${onDemandWrapperName} : createLazyRemoteModule('${r.routeLabel}', () => import('mfe_${r.key}/${r.expose}'))\``,
      );
    } else {
      pass('S3', `lazy-routes.ts binds ${r.lazyRouteName} → ${onDemandWrapperName} via ${r.defineKey} → createLazyRemoteModule('${r.routeLabel}', ...) (canonical shape)`);
    }
  }

  // Invariant S4 (Codex `019e239a` iter-2/iter-3 P2 absorb → B5b3d
  // hardening): admin-set remotes' static
  // `import('mfe_<admin>/shell-services')` MUST appear ONLY inside the
  // `else` branch of `if (__MFE_ADMIN_REMOTES_ON_DEMAND__) { ... } else
  // { ... }`.  Original ±2000-char window was structurally weak — a
  // comment mentioning the define within the window could mask an
  // unconditional import.  Brace-matcher now extracts the exact `if`
  // and `else` block spans and verifies admin imports are NOT in the
  // `if` block (the on-demand branch) AND ARE in the `else` block
  // (the eager-fallback branch) OR are absent entirely (fully
  // on-demand eventual state).
  //
  // Note: this is a lightweight string-scan brace matcher, not a full
  // AST.  It assumes the conditional uses the canonical shape
  // produced by PR-B5b2-prep-2 (#460); if someone refactors to a
  // different control flow shape (switch, early return, ternary
  // assignment), S4 will fall back to the "block not found" pass
  // (defense-in-depth: D1/D3 dist scans still enforce DCE invariants).
  const adminGateMatch = wiring.match(/if\s*\(\s*__MFE_ADMIN_REMOTES_ON_DEMAND__\s*\)\s*\{/);
  if (!adminGateMatch) {
    // Codex `019e239a` iter-4 P2 absorb: when the canonical gate is
    // absent, defer to the actual content of the file.  If ANY admin
    // static `import('mfe_<admin>/shell-services')` is still in the
    // source, fail — the gate has been removed but the imports
    // weren't.  If none are present, the file is in the eventual
    // fully-on-demand state and PASS is correct.
    const lingeringAdminImports = ON_DEMAND_REGISTRY.filter((x) => x.adminSetMember).filter((r) =>
      wiring.includes(`import('mfe_${r.key}/shell-services')`),
    );
    if (lingeringAdminImports.length > 0) {
      fail(
        'S4',
        `no \`if (__MFE_ADMIN_REMOTES_ON_DEMAND__) { ... }\` gate found, but admin static ` +
          `imports remain in shell-services-wiring: ${lingeringAdminImports.map((r) => r.key).join(', ')} ` +
          `(canonical shape removed without retiring the eager imports)`,
      );
    } else {
      pass(
        'S4',
        `no \`if (__MFE_ADMIN_REMOTES_ON_DEMAND__) { ... }\` gate found AND no admin static ` +
          `imports present (fully on-demand eventual state)`,
      );
    }
  } else {
    // Locate `if` block body span by walking braces.
    const ifBodyStart = adminGateMatch.index + adminGateMatch[0].length;
    const ifBodyEnd = findMatchingBraceEnd(wiring, ifBodyStart);
    if (ifBodyEnd < 0) {
      fail(
        'S4',
        `\`if (__MFE_ADMIN_REMOTES_ON_DEMAND__) {\` opening brace at index ${adminGateMatch.index} ` +
          `has no matching closing brace`,
      );
    } else {
      // Locate optional `else {` after the if block.
      const afterIf = wiring.slice(ifBodyEnd + 1);
      const elseMatch = afterIf.match(/^\s*else\s*\{/);
      let elseBodyStart = -1;
      let elseBodyEnd = -1;
      if (elseMatch) {
        elseBodyStart = ifBodyEnd + 1 + elseMatch.index + elseMatch[0].length;
        elseBodyEnd = findMatchingBraceEnd(wiring, elseBodyStart);
      }
      const ifBody = wiring.slice(ifBodyStart, ifBodyEnd);
      const elseBody = elseBodyEnd > 0 ? wiring.slice(elseBodyStart, elseBodyEnd) : '';

      for (const r of ON_DEMAND_REGISTRY.filter((x) => x.adminSetMember)) {
        const importSpec = `import('mfe_${r.key}/shell-services')`;
        const inIfBlock = ifBody.includes(importSpec);
        const inElseBlock = elseBody.includes(importSpec);
        const inWiringAtAll = wiring.includes(importSpec);

        if (inIfBlock) {
          fail(
            'S4',
            `admin static \`${importSpec}\` is INSIDE the on-demand \`if (__MFE_ADMIN_REMOTES_ON_DEMAND__)\` ` +
              `block — would fire eagerly when canary is ON, defeating the whole purpose`,
          );
          continue;
        }
        if (inElseBlock) {
          pass('S4', `admin static \`${importSpec}\` correctly placed inside \`else\` eager branch`);
          continue;
        }
        if (inWiringAtAll) {
          fail(
            'S4',
            `admin static \`${importSpec}\` is present in wiring but OUTSIDE both the on-demand \`if\` ` +
              `and the eager \`else\` blocks — unconditional eager fetch on /login`,
          );
          continue;
        }
        pass('S4', `admin static \`${importSpec}\` not present in wiring (fully on-demand)`);
      }
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

  // Invariant S6 (Codex `019e239a` iter-2 P2 absorb): admin wrappers
  // call `ensureRemoteShellServicesConfigured` BEFORE host.loadRemote
  // (Codex `019e2358` Option B critical add #2 — deep-link race
  // protection).
  //
  // Original heuristic only checked presence.  Stricter check verifies
  // ORDER: the index of the `ensureRemoteShellServicesConfigured` call
  // must precede the index of the FIRST `host.loadRemote` /
  // `loadRemote<` (after the helper's own internal use is in the
  // helper module, not the wrapper) call site.
  for (const r of ON_DEMAND_REGISTRY.filter((x) => x.adminSetMember)) {
    const wrapperPath = join(SHELL_DIR, r.wrapperFile);
    if (!existsSync(wrapperPath)) continue;
    const wrapper = readFileSync(wrapperPath, 'utf8');
    // Codex `019e239a` iter-3 P2 absorb: search for the AWAITED call
    // shape (`await ensureRemoteShellServicesConfigured(...)`) not the
    // bare token — the bare token also appears in the wrapper's JSDoc
    // header comment, and `indexOf` would return the comment position,
    // giving a false-pass if the real call moves after host.loadRemote
    // but the comment stays put.
    const ensureCallMatch = wrapper.match(/\bawait\s+ensureRemoteShellServicesConfigured\s*\(/);
    if (!ensureCallMatch) {
      fail(
        'S6',
        `admin wrapper ${r.wrapperFile} does not have \`await ensureRemoteShellServicesConfigured(...)\` ` +
          `call (deep-link race protection missing or non-awaited)`,
      );
      continue;
    }
    const ensureIdx = ensureCallMatch.index;
    // Match the wrapper's own host.loadRemote call site (not the helper
    // import). The wrapper has `host.loadRemote<...>(REMOTE_KEY)`.
    const loadRemoteMatch = wrapper.match(/host\.loadRemote\s*</);
    if (!loadRemoteMatch) {
      // No host.loadRemote call in wrapper — unexpected pattern.
      fail(
        'S6',
        `admin wrapper ${r.wrapperFile} has ensureRemoteShellServicesConfigured but no ` +
          `host.loadRemote< call site to order against`,
      );
      continue;
    }
    const loadRemoteIdx = loadRemoteMatch.index;
    if (ensureIdx > loadRemoteIdx) {
      fail(
        'S6',
        `admin wrapper ${r.wrapperFile} calls host.loadRemote BEFORE \`await ensureRemoteShellServicesConfigured(...)\` ` +
          `(at indices ${loadRemoteIdx} and ${ensureIdx} — race protection broken)`,
      );
    } else {
      pass(
        'S6',
        `admin wrapper ${r.wrapperFile} awaits ensureRemoteShellServicesConfigured (idx ${ensureIdx}) before host.loadRemote (idx ${loadRemoteIdx})`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* S7: Host MF instance lookup centralization (B5b2-hostfix #476 +     */
/*     Codex `019e2580` containment recommendation).                   */
/*                                                                     */
/* The B5b2 functional regression class was caused by 8 sites each     */
/* keeping their own `getHostMfInstance()` copy that did exact-equality */
/* lookup `instance.options.name === 'mfe_shell'`, which doesn't match  */
/* the production runtime name `'__mfe_internal__mfe_shell'`.           */
/* PR #476 centralized the lookup in                                    */
/* `apps/mfe-shell/src/app/config/host-mf-instance.ts`.  This invariant */
/* prevents a future commit from silently re-introducing a raw lookup  */
/* by:                                                                 */
/*   S7a — any production source under apps/mfe-shell/src/ MUST NOT    */
/*         reference `__FEDERATION__.__INSTANCES__` or declare a       */
/*         local `getHostMfInstance` outside the central helper file. */
/*   S7b — every on-demand canary wrapper + the ensure-remote-shell-  */
/*         services helper MUST import from './config/host-mf-instance'. */
/* ------------------------------------------------------------------ */

function checkHostLookupCentralization() {
  console.log('[guard] === Source invariant S7: host-mf-instance centralization ===');

  // S7a — forbidden raw-lookup patterns outside the central helper.
  const ALLOWED_HELPER = 'src/app/config/host-mf-instance.ts';
  const FORBIDDEN = [
    {
      pattern: /__FEDERATION__\.__INSTANCES__/,
      label: 'raw __FEDERATION__.__INSTANCES__ lookup (use getHostMfInstance instead)',
    },
    {
      pattern: /(?:function|const)\s+getHostMfInstance\b/,
      label: 'local redeclaration of getHostMfInstance (must import from host-mf-instance helper)',
    },
  ];

  const srcDir = join(SHELL_DIR, 'src');
  const violations = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip vendor, build, and test directories.
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '__tests__'
        ) {
          continue;
        }
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      // Skip test files (assertions and mocks naturally reference the same shape).
      if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
      const rel = full.replace(SHELL_DIR + '/', '');
      if (rel === ALLOWED_HELPER) continue;
      const src = readFileSync(full, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Cheap comment/JSDoc filter — anything starting with `//`, `*`, or whitespace+`*`.
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        for (const { pattern, label } of FORBIDDEN) {
          if (pattern.test(line)) {
            violations.push({ file: rel, line: i + 1, label, snippet: line.trim().slice(0, 100) });
          }
        }
      }
    }
  }

  if (existsSync(srcDir)) walk(srcDir);

  if (violations.length > 0) {
    for (const v of violations) {
      fail('S7a', `${v.file}:${v.line} — ${v.label} :: \`${v.snippet}\``);
    }
  } else {
    pass(
      'S7a',
      `host MF lookup centralized — no raw __FEDERATION__/getHostMfInstance redeclarations outside ${ALLOWED_HELPER}`,
    );
  }

  // S7b — consumers actually import from the central helper.
  const CONSUMERS = [
    'src/app/config/ensure-remote-shell-services.ts',
    ...ON_DEMAND_REGISTRY.map((r) => r.wrapperFile),
  ];
  // Match any relative import resolving to the host-mf-instance helper:
  // wrappers under `apps/mfe-shell/src/app/` import via `./config/host-mf-instance`
  // while ensure-remote-shell-services itself lives in the same directory and
  // uses `./host-mf-instance`.  Both forms should pass.
  const HELPER_IMPORT_RE = /from\s+['"][^'"]*host-mf-instance['"]/;
  for (const rel of CONSUMERS) {
    const full = join(SHELL_DIR, rel);
    if (!existsSync(full)) {
      // Not a hard fail — the wrapper file may legitimately be absent
      // in a future tree (e.g. a canary retired); flag as advisory.
      console.warn(`[guard][WARN][S7b] expected consumer not found: ${rel}`);
      continue;
    }
    const src = readFileSync(full, 'utf8');
    if (HELPER_IMPORT_RE.test(src)) {
      pass('S7b', `${rel} imports getHostMfInstance from central host-mf-instance helper`);
    } else {
      fail(
        'S7b',
        `${rel} does NOT import from ./config/host-mf-instance (must use centralized helper to avoid B5b2-hostfix regression class)`,
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

  // Invariant D1 (Codex `019e239a` iter-2 P2 absorb): no canonical
  // static-import specifier survives DCE.  Each on-demand remote's
  // `import(...'mfe_<key>/...')` specifier should be dead-code-eliminated
  // when its define is true.
  //
  // Stricter regex covers quote variations Rolldown may emit:
  //   import("mfe_<key>/...")
  //   import('mfe_<key>/...')
  //   import(`mfe_<key>/...`)
  // plus optional whitespace inside parens.
  //
  // Note: legitimate `host.loadRemote('mfe_<key>/...')` STRING literals
  // ARE expected in the runtime register path.  We specifically look
  // for `import(...)` call shape (the DCE-targeted static-import call
  // site Rolldown leaves only when the specifier survives in source).
  for (const r of ON_DEMAND_REGISTRY) {
    const importRegex = new RegExp(
      String.raw`\bimport\s*\(\s*['"\x60]mfe_${r.key}/`,
    );
    const hit = files.find((f) => importRegex.test(readFileSync(f, 'utf8')));
    if (hit) {
      fail(
        'D1',
        `dist file ${hit.split('/').pop()} contains static \`import(...mfe_${r.key}/...)\` ` +
          `— eager static import survived DCE for "${r.key}"`,
      );
    } else {
      pass('D1', `no static \`import(...mfe_${r.key}/...)\` call survives DCE for "${r.key}"`);
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
  // S7 — B5b2-hostfix containment (Codex `019e2580` recommendation).
  checkHostLookupCentralization();
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
