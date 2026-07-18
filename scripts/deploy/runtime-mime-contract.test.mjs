import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const localRuntime = readFileSync(
  new URL('../ops/run-single-domain-runtime-smoke.mjs', import.meta.url),
  'utf8',
);

test('nginx serves mjs workers as JavaScript without SPA fallback', () => {
  const location = dockerfile.match(/location ~\* \\\.mjs\$ \{([\s\S]*?)\n    \}/u)?.[1];

  assert.ok(location, 'Dockerfile must define a dedicated .mjs location');
  assert.match(location, /try_files \$uri =404;/u);
  assert.match(location, /default_type application\/javascript;/u);
  assert.match(location, /Cache-Control "public, max-age=31536000, immutable"/u);
});

test('local single-domain smoke serves mjs with the production module MIME family', () => {
  assert.match(localRuntime, /'\.mjs': 'application\/javascript; charset=utf-8'/u);
});
