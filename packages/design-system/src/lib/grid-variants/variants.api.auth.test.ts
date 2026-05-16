// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Regression guard for the grid-variant 401 fix.
 *
 * The raw-fetch variant calls authenticate via the design-system
 * grid-variants token resolver. When no consumer registers one — the
 * default across every MFE — `buildAuthHeaders()` yields {} and the
 * gateway 401s the request. `getAuthHeaders()` now falls back to the
 * shell-wired `@mfe/shared-http` `resolveAuthToken()`.
 *
 * Live evidence motivating this: testai `GET /api/v1/variants?gridId=...`
 * → 401 for every grid after platform-web PR #551 put all grids on
 * EntityGridTemplate.
 */

const resolveAuthTokenMock = vi.fn<[], string | null>(() => null);

vi.mock('@mfe/shared-http', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getGatewayBaseUrl: () => '/api',
  resolveAuthToken: () => resolveAuthTokenMock(),
}));

import { fetchGridVariants, registerGridVariantsTokenResolver } from './variants.api';

const lastFetchHeaders = (fetchSpy: ReturnType<typeof vi.fn>): Record<string, string> => {
  const call = fetchSpy.mock.calls.at(-1);
  expect(call, 'fetch should have been invoked').toBeDefined();
  const init = (call?.[1] ?? {}) as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
};

describe('grid-variants getAuthHeaders — shared-http token fallback', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    resolveAuthTokenMock.mockReset();
    resolveAuthTokenMock.mockReturnValue(null);
    // Reset the design-system grid-variants resolver to its default
    // (null-yielding) state so each case starts unregistered.
    registerGridVariantsTokenResolver(null);
    fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    registerGridVariantsTokenResolver(null);
  });

  it('attaches the shared-http bearer token when no grid-variants resolver is registered', async () => {
    resolveAuthTokenMock.mockReturnValue('shell-token-abc');

    await fetchGridVariants('grid-no-resolver');

    const headers = lastFetchHeaders(fetchSpy);
    // Without the fallback this is `undefined` → gateway 401 (the bug).
    expect(headers.Authorization).toBe('Bearer shell-token-abc');
  });

  it('prefers an explicitly registered grid-variants resolver over the shared-http token', async () => {
    resolveAuthTokenMock.mockReturnValue('shell-token-abc');
    registerGridVariantsTokenResolver(() => 'explicit-resolver-token');

    await fetchGridVariants('grid-with-resolver');

    const headers = lastFetchHeaders(fetchSpy);
    expect(headers.Authorization).toBe('Bearer explicit-resolver-token');
  });

  it('omits the Authorization header when no token is available from any source', async () => {
    resolveAuthTokenMock.mockReturnValue(null);

    await fetchGridVariants('grid-anon');

    const headers = lastFetchHeaders(fetchSpy);
    expect(headers.Authorization).toBeUndefined();
  });
});
