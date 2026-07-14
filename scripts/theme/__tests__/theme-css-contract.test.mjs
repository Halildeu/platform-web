import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  assertExpectedImportOrder,
  assertNoCuratedShadow,
  diffDeclarationMultisets,
  normalizeAtRuleParams,
  normalizeSelector,
  normalizeValue,
  parseDeclarationMultiset,
  sha256,
  writeFileAtomicIfChanged,
} from '../theme-css-contract.mjs';

function assertDrift(expected, actual, message) {
  const diff = diffDeclarationMultisets(expected, actual);
  assert.equal(diff.equal, false, message);
  assert.ok(diff.missing.length > 0, `${message}: expected a missing occurrence`);
  assert.ok(diff.unexpected.length > 0, `${message}: expected an unexpected occurrence`);
  return diff;
}

describe('declaration multiset identity and payload', () => {
  test('detects value drift', () => {
    const diff = assertDrift(':root { --token: red; }', ':root { --token: blue; }', 'value drift');
    assert.equal(diff.changed.length, 1);
  });

  test('detects selector drift', () => {
    const diff = assertDrift(
      '.expected { --token: red; }',
      '.actual { --token: red; }',
      'selector drift',
    );
    assert.equal(diff.changed.length, 0, 'selector drift creates distinct identities');
  });

  test('detects ordered media ancestry drift', () => {
    assertDrift(
      '@media (prefers-color-scheme: dark) { :root { --token: red; } }',
      '@media (prefers-contrast: more) { :root { --token: red; } }',
      'media drift',
    );
  });

  test('detects !important drift', () => {
    const diff = assertDrift(
      ':root { --token: red; }',
      ':root { --token: red !important; }',
      'importance drift',
    );
    assert.equal(diff.changed[0].expected[0].important, false);
    assert.equal(diff.changed[0].actual[0].important, true);
  });

  test('preserves and detects duplicate occurrence count drift', () => {
    const expected = parseDeclarationMultiset(':root { --token: red; --token: red; }');
    const entry = [...expected.values()][0];
    assert.equal(entry.occurrences.length, 2);
    assert.equal([...entry.payloadCounts.values()][0].count, 2);

    const diff = diffDeclarationMultisets(expected, ':root { --token: red; }');
    assert.equal(diff.equal, false);
    assert.equal(diff.missing[0].count, 1);
    assert.equal(diff.unexpected.length, 0);
    assert.equal(diff.changed.length, 1);
  });

  test('ordered at-rule ancestry is part of declaration identity', () => {
    assertDrift(
      '@media screen { @supports (display: grid) { .x { color: red; } } }',
      '@supports (display: grid) { @media screen { .x { color: red; } } }',
      'ancestry order drift',
    );
  });
});

describe('semantic normalization', () => {
  test('normalizes selector whitespace, selector-list order, and attribute quotes', () => {
    assert.equal(
      normalizeSelector(`:root[data-theme = 'dark'] , .card > .label`),
      normalizeSelector('.card>.label,:root[data-theme="dark"]'),
    );
  });

  test('normalizes value whitespace, quote style, and leading/trailing decimal zeros', () => {
    assert.equal(normalizeValue(`calc( 100% - .50rem )`), 'calc(100% - 0.5rem)');
    assert.equal(normalizeValue(`'Inter' , sans-serif`), '"Inter",sans-serif');
    assert.equal(normalizeValue('rgb(0 0 0 / .50)'), 'rgb(0 0 0/0.5)');
  });

  test('normalizes unitless and degree OKLCH hue syntax', () => {
    assert.equal(normalizeValue('oklch(68% 0.19 263deg)'), normalizeValue('oklch(68% 0.190 263)'));
  });

  test('normalizes semantically equivalent media params', () => {
    assert.equal(
      normalizeAtRuleParams('media', '( min-width : .50px )'),
      normalizeAtRuleParams('media', '(min-width: 0.5px)'),
    );
  });

  test('semantically equivalent CSS has no declaration drift', () => {
    const expected = `
      @media ( min-width : .50px ) {
        :root[data-theme = 'dark'] , .card > .label {
          --space: calc( 100% - .50rem );
          font-family: 'Inter' , sans-serif;
        }
      }
    `;
    const actual = `
      @media (min-width: 0.5px) {
        .card>.label,:root[data-theme="dark"] {
          --space: calc(100% - 0.5rem);
          font-family: "Inter",sans-serif;
        }
      }
    `;
    assert.deepEqual(diffDeclarationMultisets(expected, actual), {
      equal: true,
      missing: [],
      unexpected: [],
      changed: [],
    });
  });
});

describe('curated ownership boundary', () => {
  const generated = `
    :root { --owned: red; }
    @media (prefers-color-scheme: dark) { :root { --owned: blue; } }
  `;

  test('rejects an exact duplicate in the later curated extension', () => {
    assert.throws(
      () => assertNoCuratedShadow(generated, ':root { --owned: red; }'),
      (error) => error.code === 'THEME_CURATED_SHADOW' && error.collisions.length === 1,
    );
  });

  test('rejects a later curated value override', () => {
    assert.throws(
      () => assertNoCuratedShadow(generated, ':root { --owned: hotpink; }'),
      /Curated CSS shadows 1 generator-owned declaration identity/,
    );
  });

  test('permits a disjoint curated extension', () => {
    assert.equal(assertNoCuratedShadow(generated, ':root { --curated-only: green; }'), true);
  });

  test('permits the same property under a different selector', () => {
    assert.equal(assertNoCuratedShadow(generated, '.consumer { --owned: green; }'), true);
  });
});

describe('import ordering', () => {
  const css = `
    @import 'tailwindcss';
    @import url("./styles/generated.css");
    @import './styles/curated.css';
    :root { color: black; }
  `;

  test('accepts quote/url normalization and required relative order', () => {
    assert.deepEqual(
      assertExpectedImportOrder(css, [
        'tailwindcss',
        './styles/generated.css',
        './styles/curated.css',
      ]),
      ['url("tailwindcss")', 'url("./styles/generated.css")', 'url("./styles/curated.css")'],
    );
  });

  test('rejects reordered, missing, and duplicate required imports', () => {
    assert.throws(
      () => assertExpectedImportOrder(css, ['./styles/curated.css', './styles/generated.css']),
      (error) => error.code === 'THEME_IMPORT_ORDER',
    );
    assert.throws(() => assertExpectedImportOrder(css, ['./styles/missing.css']), /order mismatch/);
    assert.throws(
      () =>
        assertExpectedImportOrder(`${css}\n@import './styles/generated.css';`, [
          './styles/generated.css',
        ]),
      /order mismatch/,
    );
  });
});

describe('hash and atomic write helpers', () => {
  test('sha256 is deterministic and atomic writer skips unchanged bytes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'theme-css-contract-'));
    const file = path.join(directory, 'theme.css');

    try {
      assert.equal(
        sha256('theme'),
        '3cb8201e7ff1e7777446032ef1bf4338535aadbabe464c15411cdce8c2317590',
      );
      const first = writeFileAtomicIfChanged(file, 'alpha\n', { mode: 0o640 });
      const firstModified = statSync(file).mtimeMs;
      const second = writeFileAtomicIfChanged(file, 'alpha\n');
      const secondModified = statSync(file).mtimeMs;
      const third = writeFileAtomicIfChanged(file, 'beta\n');

      assert.equal(first.changed, true);
      assert.equal(second.changed, false);
      assert.equal(third.changed, true);
      assert.equal(firstModified, secondModified, 'unchanged bytes preserve file mtime');
      assert.equal(readFileSync(file, 'utf8'), 'beta\n');
      assert.equal(statSync(file).mode & 0o777, 0o640);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
