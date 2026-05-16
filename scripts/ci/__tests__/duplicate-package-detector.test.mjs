/**
 * PERF-INIT-V2.1 V3-B1a — duplicate-package-detector unit tests.
 *
 * Regression guard for the size-extraction bug: rollup-plugin-visualizer v5
 * (`version: 2` raw-data) keys `nodeMetas` by metaUid and `nodeParts` by
 * partUid — DISJOINT keyspaces.  The old `nodeParts[metaUid]` lookup never
 * resolved, so every module size silently came out 0.  `parseStats` now sums
 * `nodeParts[partUid].renderedLength` over each `partUid` in
 * `meta.moduleParts`.
 *
 * Runs with `node --test` — same runner as bundle-taxonomy-css-attribution.
 * No build, no network — inline fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStats, pkgFromModule } from '../duplicate-package-detector.mjs';

/** Write a fixture stats.json to a fresh temp dir; returns path + cleanup. */
function fixture(stats) {
  const dir = mkdtempSync(join(tmpdir(), 'dup-detector-'));
  const path = join(dir, 'stats.json');
  writeFileSync(path, JSON.stringify(stats));
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('parseStats: sums module size across moduleParts (v5 disjoint-keyspace fix)', () => {
  // One react module sliced into TWO output chunks — sizes must sum.
  const { path, cleanup } = fixture({
    version: 2,
    nodeParts: {
      p1: { id: 'assets/a.js', renderedLength: 1000, gzipLength: 400, metaUid: 'm1' },
      p2: { id: 'assets/b.js', renderedLength: 500, gzipLength: 200, metaUid: 'm1' },
    },
    nodeMetas: {
      m1: {
        id: '/node_modules/react/index.js',
        moduleParts: { 'assets/a.js': 'p1', 'assets/b.js': 'p2' },
      },
    },
  });
  try {
    const react = parseStats(path).get('react');
    assert.ok(react, 'react package extracted');
    // Regression: old nodeParts[metaUid] lookup resolved to undefined -> 0.
    assert.equal(react.totalRendered, 1500);
    assert.equal(react.totalGzip, 600);
  } finally {
    cleanup();
  }
});

test('parseStats: single-chunk module resolves through pnpm realpath', () => {
  const { path, cleanup } = fixture({
    version: 2,
    nodeParts: {
      q1: { id: 'assets/x.js', renderedLength: 2048, gzipLength: 700, metaUid: 'n1' },
    },
    nodeMetas: {
      n1: {
        id: '/node_modules/.pnpm/axios@1.16.0/node_modules/axios/lib/axios.js',
        moduleParts: { 'assets/x.js': 'q1' },
      },
    },
  });
  try {
    const axios = parseStats(path).get('axios');
    assert.ok(axios, 'axios resolved through pnpm realpath');
    assert.equal(axios.totalRendered, 2048);
    assert.equal(axios.totalGzip, 700);
  } finally {
    cleanup();
  }
});

test('parseStats: app code (non-node_modules) is skipped', () => {
  const { path, cleanup } = fixture({
    version: 2,
    nodeParts: { z1: { id: 'assets/app.js', renderedLength: 999, gzipLength: 300, metaUid: 'a1' } },
    nodeMetas: { a1: { id: '/src/App.tsx', moduleParts: { 'assets/app.js': 'z1' } } },
  });
  try {
    assert.equal(parseStats(path).size, 0, 'no node_modules package -> empty map');
  } finally {
    cleanup();
  }
});

test('parseStats: module with no resolvable parts contributes 0, not a throw', () => {
  // moduleParts points at a partUid absent from nodeParts (defensive path).
  const { path, cleanup } = fixture({
    version: 2,
    nodeParts: {},
    nodeMetas: {
      m1: { id: '/node_modules/lodash/index.js', moduleParts: { 'assets/a.js': 'missing' } },
    },
  });
  try {
    const lodash = parseStats(path).get('lodash');
    assert.ok(lodash, 'package still recorded');
    assert.equal(lodash.totalRendered, 0);
  } finally {
    cleanup();
  }
});

test('pkgFromModule: scoped, unscoped, pnpm-realpath, app code, nullish', () => {
  assert.equal(pkgFromModule('/node_modules/react/index.js'), 'react');
  assert.equal(
    pkgFromModule('/node_modules/@tanstack/react-query/dist/x.js'),
    '@tanstack/react-query',
  );
  assert.equal(
    pkgFromModule('/node_modules/.pnpm/echarts@5.6.0/node_modules/echarts/index.js'),
    'echarts',
  );
  assert.equal(pkgFromModule('/src/App.tsx'), null);
  assert.equal(pkgFromModule(null), null);
  assert.equal(pkgFromModule(undefined), null);
});
