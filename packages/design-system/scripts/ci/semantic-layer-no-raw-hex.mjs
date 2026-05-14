#!/usr/bin/env node
/**
 * semantic-layer-no-raw-hex.mjs
 *
 * Ensures zero raw hex literals in the semantic-theme layer
 * (`src/theme/core/*.ts`). The semantic layer must reference the
 * palette via `palette.<tone><shade>`; raw hex values bypass the
 * `palette → semantic → CSS var` flow and create dark-mode drift.
 *
 * Sister gate: `dark-fallback-gate.mjs` (scans component fallbacks like
 * `var(--token, #hex)`). This gate scans the semantic source itself.
 *
 * Triggered by: PR #487 (Codex peer review thread `019e2701`) — 4 raw
 * hex tokens (`stateSuccessBg`, `stateWarningBg`, `stateErrorBg`,
 * `stateInfoBg`) in `dark.ts` slipped through because `dark-fallback-gate`
 * scope excludes `theme/core/`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const CI = process.argv.includes('--ci');

// Hex literal in string assignment: `someKey: "#XXXXXX"` or `'#XXXXXX'`.
// Capture group lets us report the offending literal.
const HEX_LITERAL_PATTERN = /(['"])(#[0-9a-fA-F]{3,8})\1/g;

// Inline single-line comment + JSDoc/block comment patterns — used to
// skip hex values that appear inside comments (e.g. "// matches #052e16
// Tailwind green-950"). Comment context detection is line-based: if the
// hex match position falls inside a `// ...` segment or a `/* ... */`
// block, it is ignored.
const INLINE_COMMENT_RE = /\/\/.*$/m;

// Files to scan: semantic theme assignments only.
const SCAN_TARGETS = ['theme/core/light.ts', 'theme/core/dark.ts'];

// Future-proof: also scan any other .ts in theme/core except index/type files
function discoverThemeCoreFiles() {
  const dir = path.join(ROOT, 'src', 'theme', 'core');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.d.ts') &&
        !f.startsWith('index') &&
        !f.startsWith('semantic-theme') &&
        !f.startsWith('theme-controller') &&
        !f.startsWith('theme-contract'),
    )
    .map((f) => path.join('theme', 'core', f));
}

function isInComment(content, matchIndex) {
  // Find start of the current line
  const before = content.slice(0, matchIndex);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineSoFar = content.slice(lineStart, matchIndex);

  // Inside `// ...`?
  if (/\/\//.test(lineSoFar)) {
    return true;
  }

  // Inside `/* ... */` block? Look for unclosed `/*` before the match.
  const lastBlockStart = before.lastIndexOf('/*');
  const lastBlockEnd = before.lastIndexOf('*/');
  if (lastBlockStart > lastBlockEnd) {
    return true;
  }

  return false;
}

function scanFile(absPath, relPath) {
  const content = fs.readFileSync(absPath, 'utf-8');
  const violations = [];
  const regex = new RegExp(HEX_LITERAL_PATTERN.source, HEX_LITERAL_PATTERN.flags);
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (isInComment(content, match.index)) continue;
    const lineNum = content.slice(0, match.index).split('\n').length;
    violations.push({
      file: relPath,
      line: lineNum,
      hex: match[2],
    });
  }
  return violations;
}

function main() {
  console.log('🎨 Semantic-Layer No-Raw-Hex Gate\n');
  console.log('  Scope: src/theme/core/*.ts (semantic token assignments)');
  console.log('  Rule:  no raw hex literals; use palette.<tone><shade>\n');

  const targets = discoverThemeCoreFiles();
  let totalScanned = 0;
  const allViolations = [];

  for (const rel of targets) {
    const abs = path.join(ROOT, 'src', rel);
    if (!fs.existsSync(abs)) continue;
    totalScanned += 1;
    const v = scanFile(abs, rel);
    allViolations.push(...v);
  }

  console.log(`  Files scanned: ${totalScanned}`);
  console.log(`  Violations found: ${allViolations.length}`);

  if (allViolations.length > 0) {
    console.log('\n  Violations:');
    for (const v of allViolations) {
      console.log(
        `    ${v.file}:${v.line} → ${v.hex}` +
          `  (use palette.<tone><shade> instead; see src/tokens/color.ts)`,
      );
    }
    console.log(
      '\n  Tip: add the raw hex to `palette` in `src/tokens/color.ts` (Tailwind\n' +
        '       parity preferred), then reference it as `palette.<tone><shade>`\n' +
        '       in the theme/core file. See PR #487 for the green/amber/red/blue\n' +
        '       950 precedent.',
    );
  }

  const passed = allViolations.length === 0;
  console.log(`\n  ${passed ? '✅' : '❌'} Semantic-layer no-raw-hex: ${allViolations.length} violation(s)`);

  if (CI && !passed) {
    process.exit(1);
  }
}

main();
