import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTailwindBuildIntegration } from '../lib/tailwind-build-integration.mjs';

test('accepts a real @tailwindcss/vite import invoked inside plugins', () => {
  const result = detectTailwindBuildIntegration([{
    path: 'vite.config.ts',
    kind: 'vite',
    text: `import tailwindcss from '@tailwindcss/vite';\nexport default { plugins: [tailwindcss()] };`,
  }]);
  assert.equal(result.integrated, true);
  assert.equal(result.evidence[0].module, '@tailwindcss/vite');
});

test('rejects an unused import and dependency-only package text', () => {
  const unused = detectTailwindBuildIntegration([{
    path: 'vite.config.ts', kind: 'vite', text: `import tailwindcss from '@tailwindcss/vite';\nexport default { plugins: [] };`,
  }]);
  assert.equal(unused.integrated, false);

  const dependency = detectTailwindBuildIntegration([{
    path: 'package.json', kind: 'vite', text: `{"devDependencies":{"@tailwindcss/vite":"4.0.0"}}`,
  }]);
  assert.equal(dependency.integrated, false);
});

test('accepts invoked @tailwindcss/postcss module and object-key configurations', () => {
  const imported = detectTailwindBuildIntegration([{
    path: 'postcss.config.mjs',
    kind: 'postcss',
    text: `import tailwind from '@tailwindcss/postcss';\nexport default { plugins: [tailwind()] };`,
  }]);
  assert.equal(imported.integrated, true);

  const keyed = detectTailwindBuildIntegration([{
    path: 'postcss.config.cjs',
    kind: 'postcss',
    text: `module.exports = { plugins: { '@tailwindcss/postcss': {} } };`,
  }]);
  assert.equal(keyed.integrated, true);
});

test('reports legacy Tailwind build plugin separately', () => {
  const result = detectTailwindBuildIntegration([{
    path: 'postcss.config.cjs',
    kind: 'postcss',
    text: `module.exports = { plugins: { tailwindcss: {} } };`,
  }]);
  assert.equal(result.integrated, false);
  assert.equal(result.legacy, true);
});
