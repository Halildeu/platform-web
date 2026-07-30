import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Holds the image matrix to the configure-before-mount invariant.
 *
 * For the four admin remotes (`users`, `access`, `audit`, `reporting`) the
 * `mfe_on_demand_bootstrap` build arg does not choose a loading strategy — it
 * chooses whether the shell guarantees that a remote's `configureShellServices`
 * has run before its app is mounted.
 *
 * The eager branch in `lazy-routes.ts` mounts the remote app directly, while the
 * work that configures it (`wireRemoteShellServices`) is idle-deferred *and*
 * gated on `authState.token`. On a cold session that configure is not late, it
 * is unscheduled, so `getShellServices()` throws in production and the surface
 * renders an error having issued no request. The on-demand branch awaits
 * `ensureRemoteShellServicesConfigured()` before `loadRemote(...)` and consults
 * no auth state, which is what closes the window.
 *
 * Measured on ai.acik.com 2026-07-30 while the prod row was still `'false'`:
 * 2 of 3 cold loads of `/admin/users` showed the literal
 * `[mfe-users] Shell servisleri konfigüre edilmedi.` and produced zero
 * `/api/v1/users` traffic. So a regression here is customer-visible, not a
 * latency regression.
 *
 * Unifying the eager path onto the same invariant is the durable fix and is
 * tracked separately. Until that lands, this test is what stops the eager
 * ordering from being shipped again — by a revert, by a merge, or by a new
 * variant row that simply forgets the key.
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
