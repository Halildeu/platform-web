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

const resolveAuthTokenMock = vi.fn(() => 'broker-token');

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

// Track every fetch call's signal so the test can assert that the
// first stream's signal aborted when the broker token swap arrived.
const capturedSignals: AbortSignal[] = [];

const buildSseStream = (signal?: AbortSignal | null) => {
  if (signal) {
    capturedSignals.push(signal);
  }
  // Body whose {@code reader.read()} only settles when the upstream
  // {@code AbortController.abort()} fires. This mirrors the
  // production SSE long-lived connection: the await never returns
  // unless the consumer aborts.
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () =>
          new Promise<{ value?: Uint8Array; done: boolean }>((_resolve, reject) => {
            if (signal) {
              const onAbort = () => {
                signal.removeEventListener('abort', onAbort);
                reject(new DOMException('aborted', 'AbortError'));
              };
              if (signal.aborted) {
                onAbort();
              } else {
                signal.addEventListener('abort', onAbort, { once: true });
              }
            }
            // No signal → never resolve (same effective behaviour as
            // before; only the unmount cleanup will tear it down).
          }),
        cancel: () => Promise.resolve(),
      }),
    },
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  };
};

describe('useAuditLiveStream — broker-token swap reconnect (iter-6 + iter-7)', () => {
  beforeEach(() => {
    onTokenChangeCallback = null;
    resolveAuthTokenMock.mockReset();
    resolveAuthTokenMock.mockReturnValue('broker-token');
    capturedSignals.length = 0;
    // Production hook uses {@code globalThis.fetch}; install our mock
    // so the SSE open call resolves to the never-ending stream above.
    // Each invocation captures the per-call AbortSignal so the test
    // can assert that the first stream's signal actually aborted when
    // the broker token swap arrived.
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(buildSseStream(init?.signal ?? null) as unknown as Response),
      ),
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

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const initialFetchCount = fetchSpy.mock.calls.length;
    // The hook always calls fetch once on mount (broker-token in the
    // mock); without it the rest of the assertions below would be
    // a vacuous noop.
    expect(initialFetchCount).toBe(1);
    expect(capturedSignals.length).toBe(1);
    const firstSignal = capturedSignals[0];
    expect(firstSignal.aborted).toBe(false);

    // iter-7 STRICT assertion: rotate the broker token so the hook
    // can observe a real swap (not just the initial-fire skip), then
    // fire the second listener invocation. The hook MUST abort the
    // first stream's signal AND open a new fetch. The pre-iter-7 bug
    // left {@code isStreaming === true} synchronously (the
    // {@code openStream} {@code finally} block had not yet run), so
    // the initialise guard swallowed the reopen — that meant the
    // older test's {@code finalFetchCount >= initialFetchCount} was a
    // false negative (the reconnect timer would eventually re-fetch
    // out-of-band). The strict assertion below blocks that
    // regression.
    resolveAuthTokenMock.mockReturnValue('broker-token-2');
    expect(onTokenChangeCallback).not.toBeNull();
    onTokenChangeCallback!('broker-token-2');

    // Wait microtasks for abort + re-open.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // STRICT: the swap must have synchronously triggered exactly one
    // additional fetch (initial + reopen = 2 total). Anything less
    // means the initialise guard ate the reopen and the SSE stayed
    // dead on the old token (broker token swap leaked into the
    // gateway with the admin identity).
    expect(fetchSpy.mock.calls.length).toBe(initialFetchCount + 1);
    // The first stream's signal MUST have aborted as part of the
    // teardown — without this assertion a no-op listener could pass
    // the fetch count check by leaking the original stream.
    expect(firstSignal.aborted).toBe(true);
    // The second fetch MUST have used the new broker token in the
    // Authorization header (production: {@code resolveAuthToken} now
    // returns the rotated token). This locks down the contract that
    // the reopen actually consumes the swapped credential.
    const secondCall = fetchSpy.mock.calls[1];
    const secondInit = secondCall[1] as RequestInit;
    const secondHeaders = secondInit.headers as Record<string, string>;
    expect(secondHeaders.Authorization).toBe('Bearer broker-token-2');
    // And it MUST hit the live audit events endpoint (no accidental
    // routing to a different SSE).
    expect(String(secondCall[0])).toBe('http://gateway.test/audit/events/live');

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
