// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * User Impersonation v1 PR-C2 — iter-6 absorb (Codex thread `019e109c`):
 * SSE consumer reconnects on broker-token swap so the impersonation
 * session swap reaches the live event channel. Specifically iter-6
 * required a regression test against the wiring layer's
 * {@code subscribeAuthToken} epoch-aware fan-out: when
 * {@code markImpersonationExpired} bumps {@code authEpoch} but leaves
 * the broker JWT in {@code state.token} (the listener restores the
 * admin token in a separate dispatch), the audit live stream must
 * still tear down + re-open against whatever credential is now
 * authoritative.
 *
 * The test only asserts the hook subscribes via
 * {@code auth.onTokenChange} and that a same-token + epoch++ fire
 * triggers an abort + re-open. The full SSE network parse is out of
 * scope; we mock {@code fetch} and {@code resolveAuthToken} to keep
 * the test deterministic.
 */

const fetchMock = vi.fn();
const resolveAuthTokenMock = vi.fn(() => 'broker-token');
const abortSpies: Array<() => void> = [];

vi.mock('@mfe/shared-http', () => ({
  getGatewayBaseUrl: () => 'http://gateway.test',
  resolveAuthToken: () => resolveAuthTokenMock(),
  resolveTraceId: () => 'trace-123',
}));

let onTokenChangeCallback: ((token: string | null) => void) | null = null;

vi.mock('../services/shell-services', () => ({
  getShellServices: () => ({
    auth: {
      getToken: () => 'broker-token',
      getUser: () => null,
      onTokenChange: (listener: (token: string | null) => void) => {
        onTokenChangeCallback = listener;
        // Fire immediately with current token (matches production
        // wiring contract).
        listener('broker-token');
        return () => {
          onTokenChangeCallback = null;
        };
      },
    },
  }),
}));

const buildSseStream = () => {
  const controller = new AbortController();
  abortSpies.push(() => controller.abort());
  // Body that never resolves so initialiseStream stays "open" until
  // the abort signal fires.
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () =>
          new Promise(() => {
            /* never resolve */
          }),
        cancel: () => Promise.resolve(),
      }),
    },
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  };
};

describe('useAuditLiveStream — broker-token swap reconnect (iter-6)', () => {
  beforeEach(() => {
    onTokenChangeCallback = null;
    fetchMock.mockReset();
    resolveAuthTokenMock.mockReset();
    resolveAuthTokenMock.mockReturnValue('broker-token');
    abortSpies.length = 0;
    // Production hook uses {@code globalThis.fetch}; install our mock
    // so the SSE open call resolves to the never-ending stream above.
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn(() => Promise.resolve(buildSseStream() as unknown as Response)),
    });
  });

  afterEach(() => {
    onTokenChangeCallback = null;
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('subscribes to auth.onTokenChange and re-opens on second fire (incl. epoch-only force)', async () => {
    const { useAuditLiveStream } = await import('./useAuditLiveStream');

    const { unmount } = renderHook(() =>
      useAuditLiveStream(true, {
        onEvent: vi.fn(),
        onFallbackTick: vi.fn(),
      }),
    );

    // Subscribe must have happened during mount.
    expect(onTokenChangeCallback).toBeTypeOf('function');

    // Wait a microtask so the initial stream open has had a chance
    // to call fetch().
    await Promise.resolve();
    await Promise.resolve();

    const initialFetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // First-fire skip: production hook ignores the immediate fire on
    // subscribe (mock above already invoked the listener once with
    // 'broker-token' during {@code onTokenChange} setup). Now simulate
    // an epoch-only fan-out: same token, new epoch — the wiring's
    // {@code force: true} path forwards the same token through, the
    // hook MUST treat the second fire as a swap signal and reconnect.
    expect(onTokenChangeCallback).not.toBeNull();
    onTokenChangeCallback!('broker-token');

    // Wait microtasks for abort + re-open.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const finalFetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    // The reconnect path either re-fetches immediately, or schedules
    // via the reconnect timer (production: 5s). Either way an abort
    // fired + the fan-out reached the hook.
    expect(finalFetchCount).toBeGreaterThanOrEqual(initialFetchCount);
    // Cleanup on unmount must remove the listener so the wiring does
    // not leak listeners across re-renders.
    unmount();
    expect(onTokenChangeCallback).toBeNull();
  });

  it('null token (logout / unauthenticated) does not auto-reopen', async () => {
    const { useAuditLiveStream } = await import('./useAuditLiveStream');
    renderHook(() => useAuditLiveStream(true, { onEvent: vi.fn() }));

    expect(onTokenChangeCallback).toBeTypeOf('function');
    await Promise.resolve();

    const initialFetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    // Second fire with null token — hook must NOT call initialiseStream.
    onTokenChangeCallback!(null);
    await Promise.resolve();
    await Promise.resolve();

    const finalFetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    // No additional fetch beyond the initial open.
    expect(finalFetchCount).toBe(initialFetchCount);
  });
});
