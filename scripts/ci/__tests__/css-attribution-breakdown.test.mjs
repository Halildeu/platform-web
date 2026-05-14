/**
 * PERF-INIT-V2 PR-B3d0-impl: CLI contract tests for the
 * source-map-explorer wrapper (Codex thread 019e277b blocking-1
 * follow-up — lock the two CLI invariants that previously caused the
 * v2.5.3 binary to exit 1 on every happy-path run):
 *
 *   1. `--html` and `--json` MUST NOT appear in the same argv (they are
 *      mutually exclusive in source-map-explorer 2.5.x).
 *   2. The JSON argv MUST NOT carry `--gzip` because the binary flips
 *      `onlyMapped=true` under gzip and drops unmapped bytes from the
 *      report — which would silently corrupt the canonical attribution
 *      baseline the B3d1 / B3d2 decision gate consumes.
 *
 * Runs with `node --test` (no Playwright, no real CSS / sourcemap input).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceMapExplorerArgvs } from '../css-attribution-breakdown.mjs';

const FAKE_CSS = [
  '/repo/apps/mfe-shell/dist/assets/index-aaa.css',
  '/repo/apps/mfe-shell/dist/assets/index-bbb.css',
];

test('buildSourceMapExplorerArgvs: returns separate html + json argvs', () => {
  const { html, json } = buildSourceMapExplorerArgvs(FAKE_CSS);
  assert.ok(Array.isArray(html), 'html argv is an array');
  assert.ok(Array.isArray(json), 'json argv is an array');
});

test('html argv contains --html but NOT --json (CLI mutual exclusion)', () => {
  const { html } = buildSourceMapExplorerArgvs(FAKE_CSS);
  assert.ok(html.includes('--html'), 'html argv has --html');
  assert.equal(
    html.includes('--json'),
    false,
    'html argv MUST NOT also include --json (CLI mutual exclusion)',
  );
});

test('json argv contains --json but NOT --html (CLI mutual exclusion)', () => {
  const { json } = buildSourceMapExplorerArgvs(FAKE_CSS);
  assert.ok(json.includes('--json'), 'json argv has --json');
  assert.equal(
    json.includes('--html'),
    false,
    'json argv MUST NOT also include --html (CLI mutual exclusion)',
  );
});

test('json argv MUST NOT include --gzip (drops unmapped bytes)', () => {
  const { json } = buildSourceMapExplorerArgvs(FAKE_CSS);
  assert.equal(
    json.includes('--gzip'),
    false,
    'json argv MUST NOT include --gzip — onlyMapped=true under gzip drops unmapped bytes from canonical attribution baseline',
  );
});

test('both argvs include every CSS file path', () => {
  const { html, json } = buildSourceMapExplorerArgvs(FAKE_CSS);
  for (const cssPath of FAKE_CSS) {
    assert.ok(html.includes(cssPath), `html argv references ${cssPath}`);
    assert.ok(json.includes(cssPath), `json argv references ${cssPath}`);
  }
});

test('both argvs lead with the source-map-explorer binary name', () => {
  const { html, json } = buildSourceMapExplorerArgvs(FAKE_CSS);
  assert.equal(html[0], 'source-map-explorer');
  assert.equal(json[0], 'source-map-explorer');
});
