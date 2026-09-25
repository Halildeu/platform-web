import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  RATIO_TOLERANCE,
  compositeOver,
  contrastRatio,
  parseCssColor,
} from '../color-contrast.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) <= 0.005, `${label}: ${actual} vs ${expected}`);

test('WCAG reference pairs', () => {
  near(contrastRatio(parseCssColor('#000'), parseCssColor('#fff')), 21, 'black on white');
  near(contrastRatio(parseCssColor('#767676'), parseCssColor('#ffffff')), 4.542, '#767676');
  near(
    contrastRatio(parseCssColor('oklch(0% 0 0)'), parseCssColor('oklch(100% 0 0)')),
    21,
    'oklch',
  );
});

test('oklch converts to the sRGB the browser paints', () => {
  const white = parseCssColor('oklch(100% 0 0deg)');
  white.rgb.forEach((channel) => near(channel, 1, 'white channel'));
  // serban-hc danger text: the oklch form of sRGB #ff0000.
  const danger = parseCssColor('oklch(62.8% 0.2577 29.23)');
  near(danger.rgb[0] * 255, 255, 'red');
  near(Math.round(danger.rgb[1] * 255), 0, 'green');
});

test('a translucent layer is composited in gamma-encoded sRGB, like the browser', () => {
  const halfBlack = parseCssColor('oklch(0% 0 0 / 50%)');
  const white = parseCssColor('#fff');
  const composite = compositeOver(halfBlack, white);
  composite.rgb.forEach((channel) => near(channel, 0.5, 'gamma mid-grey'));
  // Linear-light compositing would give luminance 0.5 (ratio 10.5 against black);
  // the painted mid-grey is #808080, luminance ≈ 0.214.
  near(contrastRatio(parseCssColor('#000'), composite), 5.28, 'mid-grey vs black');
});

test('colours the gate cannot measure are rejected, not guessed', () => {
  assert.throws(() => parseCssColor('rgb(0 0 0)'), /Unsupported colour/);
  assert.throws(() => parseCssColor('var(--x)'), /Unsupported colour/);
  assert.throws(() => contrastRatio(parseCssColor('#000'), parseCssColor('#fff8')), /opaque/);
});

test('the tolerance between a recorded and a recomputed ratio is explicit', () => {
  assert.equal(RATIO_TOLERANCE, 0.01);
});

test('the shell contrast test measures through this module, not a copy', () => {
  const shellTest = fs.readFileSync(
    path.join(repoRoot, 'apps/mfe-shell/src/styles/__tests__/state-danger-contrast.test.ts'),
    'utf8',
  );
  assert.match(shellTest, /scripts\/theme\/color-contrast\.mjs/);
  assert.doesNotMatch(shellTest, /toLinearRgb|const luminance|0\.2126/);
});
