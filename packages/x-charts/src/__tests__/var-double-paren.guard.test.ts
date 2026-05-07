/**
 * Source-wide static guard against the `var(--token))` stray-paren
 * bug class.
 *
 * The bug: a CSS color literal like `var(--state-success-text))`
 * (one extra `)`) renders as an invalid CSS color, so the consumer
 * silently falls through to the browser's default. This bit
 * `KPICard`, `MiniChart`, `SparklineChart`, and `StatWidget` —
 * fixed in PR #294 + PR #295 (Codex thread 019e0330 / 019e033e).
 *
 * The trap: substring-matching tests
 * (`toContain('var(--state-success-text)')`) PASS against the
 * broken string because the correct value is its prefix. Per-file
 * `not.toContain('var(--…))')` paired guards catch local
 * regressions, but a future contributor can add a brand new color
 * literal in any new component and miss the pattern entirely.
 *
 * This static guard scans every `.ts` / `.tsx` file under
 * `packages/x-charts/src` (excluding test fixtures) and asserts
 * the simple-token form `var(--<token>))` never appears. The
 * regex deliberately rejects the no-comma form to avoid flagging
 * legitimate two-arg `var(--token, fallback)` syntax used inside
 * `MobileTooltip.tsx`.
 *
 * If you legitimately need a literal closing with `))` (e.g. a
 * nested `var()` call), add the file to `ALLOW_LIST` below with
 * a short justification.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const SRC_ROOT = resolve(__dirname, '..');

/**
 * Files that legitimately contain `var(--token))` (closing paren of
 * an outer two-arg `var()` fallback). Empty by default — when adding
 * an entry, document the legitimate fallback usage in a comment.
 */
const ALLOW_LIST = new Set<string>([
  // 'touch/MobileTooltip.tsx' — uses the two-arg `var(--surface-overlay,
  // rgba(...))` fallback syntax. The regex below only matches simple-
  // token literals (`var(--[a-z-]+))`) and naturally excludes
  // comma-fallback usage, so MobileTooltip is NOT in this list.
]);

/**
 * Recursively walk a directory and yield `.ts` / `.tsx` source paths
 * relative to `SRC_ROOT`, skipping test directories and node_modules.
 */
function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip test fixtures + dist + node_modules
      if (
        entry === '__tests__' ||
        entry === '__stories__' ||
        entry === 'dist' ||
        entry === 'node_modules'
      ) {
        continue;
      }
      yield* walkSourceFiles(full);
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      // Don't gate this guard against itself — circular fail.
      if (entry === 'var-double-paren.guard.test.ts') continue;
      yield relative(SRC_ROOT, full);
    }
  }
}

// Simple-token form: `var(--abc-def))`. Excludes the legitimate
// two-arg `var(--token, fallback))` because `[^,)]*` rejects commas.
const STRAY_PAREN = /var\(--[^,)]*\)\)/g;

describe('x-charts source — var() stray-paren guard', () => {
  it('no source file emits `var(--token))` (simple-token form)', () => {
    const offenders: { file: string; matches: string[] }[] = [];

    for (const relPath of walkSourceFiles(SRC_ROOT)) {
      if (ALLOW_LIST.has(relPath)) continue;

      const content = readFileSync(join(SRC_ROOT, relPath), 'utf8');
      const matches = content.match(STRAY_PAREN);
      if (matches && matches.length > 0) {
        offenders.push({ file: relPath, matches: Array.from(new Set(matches)) });
      }
    }

    if (offenders.length > 0) {
      const report = offenders.map((o) => `  - ${o.file}: ${o.matches.join(', ')}`).join('\n');
      const header =
        'Found ' +
        offenders.length +
        " file(s) with stray 'var(--token))' literals:\n" +
        report +
        "\n\nDrop the extra ')'. Two-arg fallback syntax 'var(--token, value)' is fine and\n" +
        'naturally excluded by the regex; if you genuinely need to allowlist a file,\n' +
        'add it to ALLOW_LIST in this test with a one-line justification.';
      throw new Error(header);
    }

    expect(offenders.length).toBe(0);
  });
});
