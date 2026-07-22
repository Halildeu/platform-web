import { describe, expect, it } from 'vitest';

import * as api from '../endpointAdminApi';

/**
 * Every RTK Query endpoint must have its generated hook re-exported.
 *
 * `createApi` generates `useXxxQuery` / `useXxxMutation` onto
 * `endpointAdminApi`, but consumers import them from this module's explicit
 * `export const { … } = endpointAdminApi` block. Adding an endpoint without
 * adding it to that block compiles, type-checks and unit-tests clean — every
 * page test mocks the whole module, so a missing export is invisible to them —
 * and then fails only at bundle time with `MISSING_EXPORT`, i.e. in the image
 * build, after merge.
 *
 * That is exactly how platform-web#982 shipped `listEndpointCommands` and
 * `approveEndpointCommand` without their hooks and broke the frontend image
 * build on main. This derives the expected names from the endpoint definitions
 * themselves, so it covers endpoints that do not exist yet.
 */
describe('endpointAdminApi hook exports', () => {
  const endpoints = api.endpointAdminApi.endpoints as Record<
    string,
    { name: string; useQuery?: unknown; useMutation?: unknown }
  >;

  const expectedHookNames = Object.keys(endpoints).map((name) => {
    const endpoint = endpoints[name] as { useMutation?: unknown };
    const suffix = endpoint.useMutation ? 'Mutation' : 'Query';
    return `use${name.charAt(0).toUpperCase()}${name.slice(1)}${suffix}`;
  });

  it('her endpoint icin uretilen hook modulden export edilir', () => {
    const exported = new Set(Object.keys(api));
    const missing = expectedHookNames.filter((hook) => !exported.has(hook));

    expect(
      missing,
      `endpointAdminApi.ts export blogunda eksik hook: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('endpoint listesi bos degil (vakum gecis korumasi)', () => {
    // Guards the assertion above from silently passing if the endpoints map
    // could not be read.
    expect(expectedHookNames.length).toBeGreaterThan(30);
  });
});
