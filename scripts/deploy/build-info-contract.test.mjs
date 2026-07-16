import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BUILD_INFO_SCHEMA_VERSION,
  collectRootEntrypoints,
  createBuildInfoDocument,
} from './build-info-contract.mjs';
import {
  BUILD_IMAGE_CONTRACT,
  deriveBuildImageRef,
} from './derive-build-image-ref.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'web-build-info-contract-'));
  return {
    root,
    write(relativePath, body) {
      const target = path.join(root, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('publishes the current Module Federation root bootstrap with its exact body hash', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  const body = 'import("./assets/dist-AbCd.js");\n';
  fx.write(
    'index.html',
    '<!doctype html><script type="module" crossorigin src="/mf-entry-bootstrap-0.js"></script>',
  );
  fx.write('mf-entry-bootstrap-0.js', body);

  assert.equal(BUILD_INFO_SCHEMA_VERSION, 'acik.platform.web-build-info/v2');
  assert.deepEqual(collectRootEntrypoints(fx.root), [
    {
      path: '/mf-entry-bootstrap-0.js',
      bodySha256: createHash('sha256').update(body).digest('hex'),
    },
  ]);
});

test('supports a legacy Vite /assets/index entry without assuming that shape', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write('index.html', '<script type="module" src="/assets/index-AbC_123.js"></script>');
  fx.write('assets/index-AbC_123.js', 'legacy-vite-entry');

  assert.equal(collectRootEntrypoints(fx.root)[0].path, '/assets/index-AbC_123.js');
});

test('preserves document order and de-duplicates repeated root script tags', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write(
    'index.html',
    [
      '<script src="/runtime.js"></script>',
      '<script type="module" src="/app.mjs"></script>',
      '<script src="/runtime.js"></script>',
    ].join(''),
  );
  fx.write('runtime.js', 'runtime');
  fx.write('app.mjs', 'app');

  const entries = collectRootEntrypoints(fx.root);
  assert.deepEqual(entries.map(({ path: publicPath }) => publicPath), [
    '/runtime.js',
    '/app.mjs',
  ]);
  assert.deepEqual(
    entries.map(({ bodySha256 }) => bodySha256),
    ['runtime', 'app'].map((body) => createHash('sha256').update(body).digest('hex')),
  );
});

test('ignores script examples inside HTML comments', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write(
    'index.html',
    '<!-- <script src="/phantom.js"></script> --><script src="/runtime.js"></script>',
  );
  fx.write('runtime.js', 'runtime');

  assert.deepEqual(collectRootEntrypoints(fx.root).map(({ path: publicPath }) => publicPath), [
    '/runtime.js',
  ]);
});

test('fails closed when an unterminated HTML comment hides the remaining script markup', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write('index.html', '<!-- <script src="/phantom.js"></script>');

  assert.throws(
    () => collectRootEntrypoints(fx.root),
    /no content-addressable root script/,
  );
});

test('does not treat comment-shaped bytes in raw text or attributes as HTML comments', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write(
    'index.html',
    [
      '<script>globalThis.marker = "<!--";</script>',
      '<style>/* <!-- */</style>',
      '<div data-example="<!--"></div>',
      '<script src="/runtime.js"></script>',
    ].join(''),
  );
  fx.write('runtime.js', 'runtime');

  assert.deepEqual(collectRootEntrypoints(fx.root).map(({ path: publicPath }) => publicPath), [
    '/runtime.js',
  ]);
});

test('ignores external script markup inside inert template content', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write(
    'index.html',
    '<template><script src="/phantom.js"></script></template><script src="/runtime.js"></script>',
  );
  fx.write('runtime.js', 'runtime');

  assert.deepEqual(collectRootEntrypoints(fx.root).map(({ path: publicPath }) => publicPath), [
    '/runtime.js',
  ]);
});

test('matches browser semantics for noscript, SVG and duplicate src attributes', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write(
    'index.html',
    [
      '<noscript><script src="/noscript-phantom.js"></script></noscript>',
      '<svg><script src="/svg-phantom.js"></script></svg>',
      '<script src="/runtime.js" src="/duplicate-phantom.js"></script>',
    ].join(''),
  );
  fx.write('runtime.js', 'runtime');

  assert.deepEqual(collectRootEntrypoints(fx.root).map(({ path: publicPath }) => publicPath), [
    '/runtime.js',
  ]);
});

for (const invalidSource of [
  'https://cdn.example.test/app.js',
  '//cdn.example.test/app.js',
  '/../app.js',
  '/app.js?cache=1',
  '/app%2ejs',
]) {
  test(`rejects an unbindable root script source: ${invalidSource}`, (t) => {
    const fx = fixture();
    t.after(() => fx.cleanup());
    fx.write('index.html', `<script src="${invalidSource}"></script>`);
    assert.throws(
      () => collectRootEntrypoints(fx.root),
      /unsupported root script path|escapes dist directory/,
    );
  });
}

test('fails closed when index.html has no external root script', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write('index.html', '<!doctype html><main>missing script</main>');
  assert.throws(
    () => collectRootEntrypoints(fx.root),
    /no content-addressable root script/,
  );
});

test('fails closed when the declared root script is absent from the assembled image tree', (t) => {
  const fx = fixture();
  t.after(() => fx.cleanup());
  fx.write('index.html', '<script src="/missing.js"></script>');
  assert.throws(() => collectRootEntrypoints(fx.root), /ENOENT/);
});

test('rejects a root script symlink even when its target exists', (t) => {
  const fx = fixture();
  const outside = mkdtempSync(path.join(tmpdir(), 'web-build-info-outside-'));
  t.after(() => {
    fx.cleanup();
    rmSync(outside, { recursive: true, force: true });
  });
  const outsideScript = path.join(outside, 'outside.js');
  writeFileSync(outsideScript, 'outside');
  fx.write('index.html', '<script src="/linked.js"></script>');
  symlinkSync(outsideScript, path.join(fx.root, 'linked.js'));

  assert.throws(
    () => collectRootEntrypoints(fx.root),
    /regular non-symlink file|resolves outside dist directory/,
  );
});

test('derives exact prod and testai image references from the versioned contract', () => {
  const sha = '125d2d85f139cb2b8fcfee27eb6a0affbb4bcc2b';
  assert.equal(BUILD_IMAGE_CONTRACT.shortShaLength, 7);
  assert.equal(
    deriveBuildImageRef('testai', sha),
    'ghcr.io/halildeu/platform-web-frontend-testai:sha-125d2d8',
  );
  assert.equal(
    deriveBuildImageRef('prod', sha),
    'ghcr.io/halildeu/platform-web-frontend:sha-125d2d8',
  );
  assert.throws(() => deriveBuildImageRef('staging', sha), /unsupported build image variant/);
  assert.throws(() => deriveBuildImageRef('testai', '125d2d8'), /source SHA must be 40/);
});

test('emits the derived immutable image in the build-info v2 document', () => {
  const sha = '125d2d85f139cb2b8fcfee27eb6a0affbb4bcc2b';
  const image = deriveBuildImageRef('testai', sha);
  const document = createBuildInfoDocument({
    sha,
    ref: 'main',
    image,
    buildTime: '2026-07-16T00:00:00.000Z',
    origin: 'https://testai.acik.com',
    rootEntry: 'mf-entry-bootstrap-0.js',
    rootEntrypoints: [{ path: '/mf-entry-bootstrap-0.js', bodySha256: 'a'.repeat(64) }],
    assets: ['shell.js'],
    remotes: [],
  });

  assert.equal(document.schemaVersion, 'acik.platform.web-build-info/v2');
  assert.equal(document.sha, sha);
  assert.equal(document.shortSha, '125d2d8');
  assert.equal(document.image, image);
  assert.equal(document.imageDigest, '');
});

test('wires the versioned image contract through workflow and Docker producer', () => {
  const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci-web-image-push.yml', import.meta.url),
    'utf8',
  );
  const producer = readFileSync(new URL('./build-single-domain.mjs', import.meta.url), 'utf8');

  assert.match(dockerfile, /^ARG BUILD_IMAGE=""$/m);
  assert.match(dockerfile, /^\s+BUILD_IMAGE=\$\{BUILD_IMAGE\}$/m);
  assert.match(workflow, /node scripts\/deploy\/derive-build-image-ref\.mjs/);
  assert.match(workflow, /^\s+BUILD_IMAGE=\$\{\{ steps\.image\.outputs\.ref \}\}$/m);
  assert.match(workflow, /^\s+\$\{\{ steps\.image\.outputs\.ref \}\}$/m);
  assert.match(producer, /createBuildInfoDocument\(\{/);
});

const realShellDist = process.env.BUILD_INFO_REAL_SHELL_DIST;
test(
  'binds every root script emitted by the real shell production build',
  { skip: !realShellDist },
  () => {
    const distDir = path.resolve(realShellDist);
    const entries = collectRootEntrypoints(distDir);
    assert.ok(entries.length >= 1);
    for (const entry of entries) {
      const body = readFileSync(path.join(distDir, `.${entry.path}`));
      assert.equal(entry.bodySha256, createHash('sha256').update(body).digest('hex'));
    }
  },
);
