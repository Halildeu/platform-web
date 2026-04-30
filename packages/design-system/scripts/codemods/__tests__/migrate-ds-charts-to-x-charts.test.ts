// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';

import transform from '../migrate-ds-charts-to-x-charts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '__fixtures__', 'migrate-ds-charts-to-x-charts');

function applyTransform(source: string): string {
  const fileInfo = { path: 'test.tsx', source } as any;
  const j = jscodeshift.withParser('tsx');
  const api = {
    jscodeshift: j,
    j,
    stats: () => {},
    report: () => {},
  } as any;
  const result = transform(fileInfo, api, {});
  return result ?? source;
}

const cases = [
  'named-single',
  'named-mixed',
  'named-multiple-charts',
  'aliased-chart',
  'type-import-preserved',
  'no-chart-import',
];

describe('migrate-ds-charts-to-x-charts', () => {
  cases.forEach((name) => {
    it(`transforms ${name}`, () => {
      const input = readFileSync(join(fixturesDir, `${name}.input.tsx`), 'utf8');
      const expected = readFileSync(join(fixturesDir, `${name}.output.tsx`), 'utf8');
      const actual = applyTransform(input);
      expect(actual.trim()).toBe(expected.trim());
    });
  });
});
