import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Keeps the image matrix consistent about federation bootstrap across variants.
 *
 * Read the scope carefully, because it changed. When this test was written the
 * `mfe_on_demand_bootstrap` build arg still decided whether the four admin
 * remotes got a configure-before-mount guarantee at all, so this file was a
 * correctness guard. It is **no longer that**. `lazy-routes.ts` now binds those
 * routes to their on-demand wrappers unconditionally, so the ordering holds in
 * every build regardless of this flag. Correctness is enforced by
 * `createUsersAppOnDemand.test.tsx` (module-factory call order) and by
 * `scripts/ci/on-demand-federation-guard.mjs` S3 (no eager admin App import may
 * return to the route file).
 *
 * What remains here is worth keeping but is narrower: the flag still controls
 * whether `buildRemotes()` declares those remotes in the federation manifest,
 * i.e. whether host bootstrap pays for their remote entries up front. Shipping
 * one variant eager and another on-demand means prod and testai no longer share
 * a bootstrap shape, and a defect measured on one stops being evidence about the
 * other — which is exactly how the original bug survived: it was reproducible on
 * prod and invisible on testai.
 *
 * Historical note for whoever reads this after a revert: measured on
 * ai.acik.com 2026-07-30 with the eager route binding, 2 of 3 cold loads of
 * `/admin/users` rendered `[mfe-users] Shell servisleri konfigüre edilmedi.` and
 * produced zero `/api/v1/users` traffic. Do not treat this file as the thing
 * that prevents that; it is not.
 */

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '../../../../../../.github/workflows/ci-web-image-push.yml',
);

const readWorkflow = (): string => fs.readFileSync(WORKFLOW_PATH, 'utf8');

/**
 * Slices out the `strategy.matrix.include:` block so comment prose elsewhere in
 * the workflow can never satisfy or break these assertions.
 */
const readMatrixBlock = (): string => {
  const source = readWorkflow();
  const start = source.indexOf('      matrix:');
  expect(start, `matrix block not found in ${WORKFLOW_PATH}`).toBeGreaterThan(-1);

  const end = source.indexOf('\n    steps:', start);
  expect(end, 'steps block not found after matrix').toBeGreaterThan(start);

  return source.slice(start, end);
};

/** Only real YAML assignments — never a line that is commented out. */
const assignmentsOf = (block: string, key: string): string[] =>
  block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#'))
    .filter((line) => line.startsWith(`${key}:`))
    .map((line) => line.slice(`${key}:`.length).trim());

describe('ci-web-image-push image matrix', () => {
  it('exists and is readable from the repo root', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
  });

  it('ships every variant with the configure-before-mount ordering', () => {
    const values = assignmentsOf(readMatrixBlock(), 'mfe_on_demand_bootstrap');

    expect(values.length, 'no mfe_on_demand_bootstrap assignments found').toBeGreaterThan(0);
    expect(
      values,
      "a variant built with 'false' mounts admin remotes before their shell services are configured",
    ).toEqual(values.map(() => "'true'"));
  });

  it('leaves no variant without an explicit ordering choice', () => {
    const block = readMatrixBlock();
    const variants = assignmentsOf(block, '- variant');
    const orderings = assignmentsOf(block, 'mfe_on_demand_bootstrap');

    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(
      orderings.length,
      `each variant must state mfe_on_demand_bootstrap; variants=${variants.join(', ')}`,
    ).toBe(variants.length);
  });

  it('still forwards the matrix value into the image build', () => {
    expect(
      readWorkflow(),
      'the matrix value is asserted above but no longer reaches the build args',
    ).toContain('VITE_MFE_ON_DEMAND_BOOTSTRAP=${{ matrix.mfe_on_demand_bootstrap }}');
  });
});
