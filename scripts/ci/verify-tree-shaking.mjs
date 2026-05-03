#!/usr/bin/env node
/**
 * verify-tree-shaking.mjs — descriptor-driven tree-shaking verifier.
 *
 * Faz 21.4 PR-F1 made this script multi-package via descriptors so the
 * design-system check (`mode: 'dist'` — built artifact) and the x-charts
 * check (`mode: 'source'` — no build, src entry) can share the same
 * tooling without duplicating code or hard-coding paths.
 *
 * Usage:
 *   node scripts/ci/verify-tree-shaking.mjs --package design-system
 *   node scripts/ci/verify-tree-shaking.mjs --package x-charts
 *
 * Default (no `--package`) preserves the legacy DS behaviour for backward
 * compatibility with any existing CI invocation.
 *
 * Per-package descriptor fields:
 *   - root:                  package directory under packages/
 *   - label:                 npm name (used in log header)
 *   - mode:                  'dist' (built artifact) | 'source' (src entry only)
 *   - entry:                 source entry file relative to root
 *   - sampleDeepImport:      a known sub-path that should resolve from src
 *   - subBarrels:            additional sub-barrel files to scan for export *
 *   - sideEffectsExpected:   'false' | 'allowlist'
 *   - sideEffectsAllowed:    when 'allowlist', the exact array we expect
 *   - distDir:               (mode='dist' only) dist directory under root
 *   - distEsm/distCjs/distDts: (mode='dist' only) expected files under distDir
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/* ------------------------------------------------------------------ */
/*  Descriptors                                                        */
/* ------------------------------------------------------------------ */

const PACKAGES = {
  "design-system": {
    root: "packages/design-system",
    label: "@mfe/design-system",
    mode: "dist",
    entry: "src/index.ts",
    sampleDeepImport: "src/primitives/button/index.ts",
    subBarrels: ["src/primitives/index.ts", "src/components/index.ts"],
    // DS uses an allowlist because `data-grid/setup.ts` registers AG Grid
    // modules at import time. The CSS glob covers Tailwind layer files.
    sideEffectsExpected: "allowlist",
    sideEffectsAllowed: [
      "./src/advanced/data-grid/setup.ts",
      "*.css",
      "./dist/esm/advanced/data-grid/setup.js",
      "./dist/cjs/advanced/data-grid/setup.cjs",
    ],
    distDir: "dist",
    distEsm: "index.js",
    distCjs: "index.cjs",
    distDts: "index.d.ts",
    expectedExports: ["./", "./primitives/*"],
  },
  "x-charts": {
    root: "packages/x-charts",
    label: "@mfe/x-charts",
    mode: "source",
    entry: "src/index.ts",
    sampleDeepImport: "src/BarChart.tsx",
    subBarrels: ["src/theme/index.ts", "src/a11y/index.ts"],
    // x-charts has known import-time side effects in i18n/locale-store
    // (window event listener + localStorage hydration). We declare an
    // explicit allowlist instead of `false` to keep the bundler signal
    // honest. See packages/x-charts/package.json#sideEffects.
    sideEffectsExpected: "allowlist",
    sideEffectsAllowed: ["**/*.css", "./src/i18n/locale-store.ts"],
    expectedExports: ["./"],
  },
};

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

function parsePackageArg() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--package");
  if (idx === -1) {
    return "design-system"; // legacy default
  }
  const value = args[idx + 1];
  if (!value || !PACKAGES[value]) {
    console.error(
      `Unknown package: ${value}. Choose one of: ${Object.keys(PACKAGES).join(", ")}`,
    );
    process.exit(2);
  }
  return value;
}

const packageKey = parsePackageArg();
const config = PACKAGES[packageKey];
const PKG_ROOT = join(ROOT, config.root);
const PKG_PATH = join(PKG_ROOT, "package.json");

let exitCode = 0;

const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => {
  console.log(`  FAIL  ${msg}`);
  exitCode = 1;
};
const warn = (msg) => console.log(`  WARN  ${msg}`);

console.log(`\nTree-shaking verification for ${config.label} (mode=${config.mode})\n`);

/* ------------------------------------------------------------------ */
/*  1. sideEffects field                                               */
/* ------------------------------------------------------------------ */

console.log("1. Checking sideEffects field in package.json...\n");

const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));

if (config.sideEffectsExpected === "false") {
  if (pkg.sideEffects === false) {
    pass("`sideEffects: false` is set in package.json");
  } else if (pkg.sideEffects === undefined) {
    fail(
      "`sideEffects` field is missing — bundlers will assume all files have side effects",
    );
  } else {
    fail(
      `\`sideEffects\` is ${JSON.stringify(pkg.sideEffects)}, expected \`false\``,
    );
  }
} else if (config.sideEffectsExpected === "allowlist") {
  if (Array.isArray(pkg.sideEffects)) {
    const expected = config.sideEffectsAllowed ?? [];
    const actual = pkg.sideEffects;
    const missing = expected.filter((p) => !actual.includes(p));
    const extra = actual.filter((p) => !expected.includes(p));
    if (missing.length === 0 && extra.length === 0) {
      pass(
        `\`sideEffects\` allowlist matches descriptor (${actual.length} entries)`,
      );
    } else {
      if (missing.length > 0) fail(`Missing entries in sideEffects: ${missing.join(", ")}`);
      if (extra.length > 0)
        fail(
          `Extra entries in sideEffects (not in descriptor): ${extra.join(", ")} — ` +
            `update the descriptor if these are intentional`,
        );
    }
  } else {
    fail(
      `\`sideEffects\` should be an array (allowlist mode), got ${JSON.stringify(pkg.sideEffects)}`,
    );
  }
} else {
  fail(`Unknown sideEffectsExpected value: ${config.sideEffectsExpected}`);
}

/* ------------------------------------------------------------------ */
/*  2. Source entry + deep import resolves                             */
/* ------------------------------------------------------------------ */

console.log("\n2. Checking source entry + deep import paths...\n");

const mainEntry = join(PKG_ROOT, config.entry);
if (existsSync(mainEntry)) {
  pass(`Main entry resolves: ${config.entry}`);
} else {
  fail(`Main entry not found: ${mainEntry}`);
}

const deepImport = join(PKG_ROOT, config.sampleDeepImport);
if (existsSync(deepImport)) {
  pass(`Sample deep import resolves: ${config.sampleDeepImport}`);
} else {
  fail(`Sample deep import not found: ${deepImport}`);
}

/* ------------------------------------------------------------------ */
/*  3. Wildcard re-exports                                             */
/* ------------------------------------------------------------------ */

console.log("\n3. Scanning for wildcard re-exports that may impede tree-shaking...\n");

function findWildcardReExports(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  const re = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

const mainReExports = findWildcardReExports(mainEntry);
if (mainReExports.length === 0) {
  pass("No wildcard re-exports in main entry");
} else {
  warn(
    `Main entry has ${mainReExports.length} wildcard re-export(s). ` +
      `Consumers importing from the root barrel may pull in more code than intended:`,
  );
  for (const target of mainReExports) {
    console.log(`         export * from "${target}"`);
  }
}

for (const barrel of config.subBarrels) {
  const barrelPath = join(PKG_ROOT, barrel);
  const reExports = findWildcardReExports(barrelPath);
  if (reExports.length > 0) {
    warn(`${barrel} has ${reExports.length} wildcard re-export(s)`);
  }
}

/* ------------------------------------------------------------------ */
/*  4. Mode-specific: dist/ outputs (DS) or source-only sanity         */
/* ------------------------------------------------------------------ */

const isCI = process.env.CI === "true" || process.env.CI === "1";

if (config.mode === "dist") {
  console.log("\n4. Checking dist/ contains ESM and CJS outputs...\n");

  const DIST_DIR = join(PKG_ROOT, config.distDir);

  if (!existsSync(DIST_DIR)) {
    if (isCI) {
      fail("dist/ directory does not exist — run `pnpm run build` first");
    } else {
      warn(
        "dist/ directory does not exist — run `pnpm run build` first (skipped in local dev)",
      );
    }
  } else {
    pass("dist/ directory exists");
    const checks = [
      { file: config.distEsm, label: "ESM" },
      { file: config.distCjs, label: "CJS" },
      { file: config.distDts, label: "DTS" },
    ];
    for (const { file, label } of checks) {
      const target = join(DIST_DIR, file);
      if (existsSync(target)) {
        pass(`${label} output found: ${config.distDir}/${file}`);
      } else if (isCI) {
        fail(`${label} output missing: ${config.distDir}/${file}`);
      } else {
        warn(`${label} output missing: ${config.distDir}/${file}`);
      }
    }
  }
} else if (config.mode === "source") {
  console.log("\n4. Source-only mode — verifying entry is .ts source\n");

  if (!mainEntry.endsWith(".ts") && !mainEntry.endsWith(".tsx")) {
    fail(`Source-mode entry should be .ts/.tsx, got ${config.entry}`);
  } else {
    pass(
      `Source-mode entry is TypeScript: ${config.entry} (no build artifact required)`,
    );
  }

  // Source-mode packages MUST NOT have a `dist/` directory in tree;
  // its presence implies an accidental commit.
  const accidentalDist = join(PKG_ROOT, "dist");
  if (existsSync(accidentalDist)) {
    warn(
      `dist/ directory present in source-mode package — verify it's gitignored`,
    );
  } else {
    pass("No accidental dist/ in source-mode package");
  }
}

/* ------------------------------------------------------------------ */
/*  5. exports map                                                     */
/* ------------------------------------------------------------------ */

console.log("\n5. Checking exports map in package.json...\n");

if (pkg.exports) {
  const entries = Object.keys(pkg.exports);
  pass(`exports map has ${entries.length} entry/entries: ${entries.join(", ")}`);

  for (const expected of config.expectedExports ?? []) {
    if (pkg.exports[expected] !== undefined || pkg.exports[expected.replace(/\/$/, "")] !== undefined || pkg.exports["." + expected.replace(/^\./, "")] !== undefined) {
      pass(`Expected export entry present: ${expected}`);
    } else {
      // Use loose match — `./primitives/*` may be keyed as `./primitives/*`
      // and root may be `.`. Be lenient.
      const found = entries.some(
        (e) => e === expected || e === expected.replace(/^\.\//, "."),
      );
      if (!found) warn(`Expected export entry not found: ${expected}`);
    }
  }
} else {
  warn(
    "No exports map in package.json — consumers cannot use deep imports via package exports",
  );
}

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */

console.log("\n" + (exitCode === 0 ? "All checks passed." : "Some checks failed.") + "\n");
process.exit(exitCode);
