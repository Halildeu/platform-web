import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { extractRootBodies, extractThemeInlineBodies, readCssLayers } from '../lib/css-layers.mjs';

const testRoot = mkdtempSync(join(tmpdir(), 'theme-doctor-css-layers-'));
after(() => rmSync(testRoot, { force: true, recursive: true }));

test('readCssLayers composes generated and curated layers in cascade order', () => {
  const generated = join(testRoot, 'generated.css');
  const curated = join(testRoot, 'extensions.css');
  writeFileSync(generated, ':root { --generated-token: red; }\n');
  writeFileSync(curated, ':root { --curated-token: blue; }\n');

  const css = readCssLayers([generated, curated]);

  assert.match(css, /--generated-token: red/);
  assert.match(css, /--curated-token: blue/);
  assert.ok(css.indexOf('--generated-token') < css.indexOf('--curated-token'));
});

test('readCssLayers tolerates an absent optional extension layer', () => {
  const generated = join(testRoot, 'generated-only.css');
  writeFileSync(generated, ':root { --generated-only: true; }\n');

  assert.match(readCssLayers([generated, join(testRoot, 'absent.css')]), /--generated-only: true/);
});

test('inline and root extraction consume every composed ownership block', () => {
  const css = `
    @theme inline { --color-generated: var(--generated); }
    :root { --generated: red; }
    @theme inline { --color-curated: var(--curated); }
    :root { --curated: blue; }
  `;

  const inlineCss = extractThemeInlineBodies(css).join('\n');
  const rootCss = extractRootBodies(css).join('\n');

  assert.match(inlineCss, /--color-generated/);
  assert.match(inlineCss, /--color-curated/);
  assert.match(rootCss, /--generated/);
  assert.match(rootCss, /--curated/);
});
