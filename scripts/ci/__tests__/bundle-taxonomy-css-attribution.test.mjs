/**
 * PERF-INIT-V2 PR-B3d0-impl unit tests — CSS attribution helpers.
 *
 * Covers:
 *   - extractCssAttribution: bucket assignment + confidence + evidence per
 *     URL pattern (remote / shell-root / heuristic / unknown).
 *   - summarizeCssAttribution: top contributors, unknown ratio,
 *     requiresSourcemapBaseline gate (>=20% triggers true), confidence mix.
 *
 * Runs with `node --test` — same runner as benchmark-1m-enforcer tests.
 * No Playwright / no network / no real CSS files needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCssAttribution,
  summarizeCssAttribution,
} from '../bundle-taxonomy.mjs';

function res(name, decodedBodySize) {
  return { name, decodedBodySize, category: 'css' };
}

test('extractCssAttribution: shell-root /assets/index-<hash>.css', () => {
  const r = extractCssAttribution(
    res('http://localhost:5174/assets/index-AbCdEf123.css', 50 * 1024),
  );
  assert.equal(r.source, 'shell-root');
  assert.equal(r.confidence, 'low');
  assert.deepEqual(r.evidence, ['url']);
  assert.equal(r.decodedKB, 50);
});

test('extractCssAttribution: remote bucket /remotes/<name>/assets/', () => {
  const r = extractCssAttribution(
    res(
      'http://localhost:5174/remotes/mfe_reporting/assets/styles-xyz.css',
      30 * 1024,
    ),
  );
  assert.equal(r.source, 'remote:mfe_reporting');
  assert.equal(r.confidence, 'medium');
  assert.deepEqual(r.evidence, ['url', 'remote']);
});

test('extractCssAttribution: ag-grid heuristic match', () => {
  const r = extractCssAttribution(
    res(
      'http://localhost:5174/node_modules/ag-grid-community/styles/ag-grid.css',
      120 * 1024,
    ),
  );
  assert.equal(r.source, 'ag-grid?');
  assert.equal(r.confidence, 'low');
});

test('extractCssAttribution: echarts heuristic match', () => {
  const r = extractCssAttribution(
    res('http://localhost:5174/assets/echarts-styles-abc.css', 45 * 1024),
  );
  assert.equal(r.source, 'echarts?');
});

test('extractCssAttribution: design-system heuristic match', () => {
  const r = extractCssAttribution(
    res('http://localhost:5174/assets/design-system-base.css', 25 * 1024),
  );
  assert.equal(r.source, 'design-system?');
});

test('extractCssAttribution: unknown fallback', () => {
  const r = extractCssAttribution(
    res('http://localhost:5174/some/unmatched/path/foo.css', 10 * 1024),
  );
  assert.equal(r.source, 'unknown');
});

test('extractCssAttribution: malformed URL → falls back to raw pathname', () => {
  const r = extractCssAttribution(
    res('not-a-valid-url', 5 * 1024),
  );
  // Falls back to raw input as pathname — should not throw, bucket=unknown
  assert.equal(r.source, 'unknown');
  assert.equal(r.decodedKB, 5);
});

test('summarizeCssAttribution: empty input yields zero state', () => {
  const s = summarizeCssAttribution([]);
  assert.equal(s.totalKB, 0);
  assert.equal(s.rowCount, 0);
  assert.deepEqual(s.topContributors, []);
  assert.equal(s.unknownRatio, 0);
  assert.equal(s.requiresSourcemapBaseline, false);
});

test('summarizeCssAttribution: known + low-unknown → requiresSourcemapBaseline=false', () => {
  const breakdown = [
    { source: 'shell-root', decodedKB: 100, confidence: 'low' },
    { source: 'remote:mfe_users', decodedKB: 50, confidence: 'medium' },
    { source: 'ag-grid?', decodedKB: 30, confidence: 'low' },
    { source: 'unknown', decodedKB: 20, confidence: 'low' },
  ];
  const s = summarizeCssAttribution(breakdown);
  assert.equal(s.totalKB, 200);
  assert.equal(s.rowCount, 4);
  // Unknown ratio = 20/200 = 0.1 < 0.2 threshold
  assert.equal(s.unknownRatio, 0.1);
  assert.equal(s.requiresSourcemapBaseline, false);
  // Top contributor must be shell-root
  assert.equal(s.topContributors[0].source, 'shell-root');
  assert.equal(s.topContributors[0].decodedKB, 100);
  assert.equal(s.topContributors[0].ratio, 0.5);
});

test('summarizeCssAttribution: unknown >= 20% triggers requiresSourcemapBaseline=true', () => {
  const breakdown = [
    { source: 'shell-root', decodedKB: 60, confidence: 'low' },
    { source: 'unknown', decodedKB: 40, confidence: 'low' }, // 40/100 = 40%
  ];
  const s = summarizeCssAttribution(breakdown);
  assert.equal(s.unknownRatio, 0.4);
  assert.equal(s.requiresSourcemapBaseline, true);
});

test('summarizeCssAttribution: unknown == 20% exact boundary triggers gate', () => {
  const breakdown = [
    { source: 'shell-root', decodedKB: 80, confidence: 'low' },
    { source: 'unknown', decodedKB: 20, confidence: 'low' }, // exact 0.2
  ];
  const s = summarizeCssAttribution(breakdown);
  assert.equal(s.unknownRatio, 0.2);
  assert.equal(s.requiresSourcemapBaseline, true);
});

test('summarizeCssAttribution: confidenceMix aggregates by confidence tier', () => {
  const breakdown = [
    { source: 'shell-root', decodedKB: 50, confidence: 'low' },
    { source: 'remote:mfe_users', decodedKB: 30, confidence: 'medium' },
    { source: 'foo', decodedKB: 20, confidence: 'low' },
  ];
  const s = summarizeCssAttribution(breakdown);
  assert.equal(s.confidenceMix.low, 70);
  assert.equal(s.confidenceMix.medium, 30);
  assert.equal(s.confidenceMix.high, 0);
});

test('summarizeCssAttribution: topContributors capped at 10', () => {
  const breakdown = Array.from({ length: 15 }, (_, i) => ({
    source: `bucket-${i}`,
    decodedKB: 100 - i,
    confidence: 'low',
  }));
  const s = summarizeCssAttribution(breakdown);
  assert.equal(s.topContributors.length, 10);
  // Should be sorted descending — first bucket has largest
  assert.equal(s.topContributors[0].source, 'bucket-0');
});
