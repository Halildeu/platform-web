// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { notifyInboxApi } from '../notify-inbox.api';
import { useInboxUnreadSse } from '../useInboxUnreadSse';

/**
 * Faz 23.4 PR-E.5 v1 UI / PR4 — SSE hook unit tests.
 *
 * Coverage:
 * - identity null → no EventSource is created
 * - identity present → EventSource opens with withCredentials and the
 *   correct query string
 * - 'unread-count' event → cache patched + Inbox/LIST invalidated
 * - 'error' event → reconnect attempt scheduled (retryCount increments)
 * - identity flips → previous EventSource is closed before the new one
 *   opens
 * - unmount → connection torn down + reconnect timer cleared
 *
 * Pattern: replace the global EventSource with a tiny stub that records
 * its constructor args and exposes hooks to fire events synchronously.
 * vi.useFakeTimers lets us advance the reconnect backoff without
 * waiting on real wall-clock time.
 */

interface StubEventSource {
  url: string;
  withCredentials: boolean;
  readyState: number;
  listeners: Map<string, Set<(event: MessageEvent) => void>>;
  close: () => void;
  addEventListener: (type: string, cb: (event: MessageEvent) => void) => void;
  // Test helpers:
  fire: (type: string, data?: unknown) => void;
  closed: boolean;
}

const stubInstances: StubEventSource[] = [];

const installEventSourceStub = (): typeof globalThis.EventSource => {
  const ctor = function (this: StubEventSource, url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    this.readyState = 0;
    this.listeners = new Map();
    this.closed = false;
    this.close = () => {
      this.closed = true;
      this.readyState = 2;
    };
    this.addEventListener = (type: string, cb: (event: MessageEvent) => void) => {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(cb);
    };
    this.fire = (type: string, data?: unknown) => {
      const handlers = this.listeners.get(type);
      if (!handlers) return;
      const eventData =
        data === undefined ? '' : typeof data === 'string' ? data : JSON.stringify(data);
      const event = new MessageEvent(type, { data: eventData });
      handlers.forEach((h) => h(event));
    };
    stubInstances.push(this);
  } as unknown as typeof globalThis.EventSource;
  return ctor;
};

const buildWrapper = () => {
  const store = configureStore({
    reducer: { [notifyInboxApi.reducerPath]: notifyInboxApi.reducer },
    middleware: (gdm) => gdm().concat(notifyInboxApi.middleware),
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store }, children);
  return { store, Wrapper };
};

beforeEach(() => {
  stubInstances.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', installEventSourceStub());
  // jsdom already provides a real {@code window} with
  // {@code location.origin === 'http://localhost:3000'}; stubbing it
  // would replace globals (HTMLElement, etc.) that React relies on.
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useInboxUnreadSse', () => {
  it('opens no EventSource when identity is null', () => {
    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useInboxUnreadSse(null), { wrapper: Wrapper });

    expect(stubInstances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
    expect(result.current.lastUnreadCount).toBeNull();
  });

  it('opens an EventSource with withCredentials + identity query params', () => {
    const { Wrapper } = buildWrapper();
    renderHook(() => useInboxUnreadSse({ orgId: 'default', subscriberId: 'sub-1' }), {
      wrapper: Wrapper,
    });

    expect(stubInstances).toHaveLength(1);
    const es = stubInstances[0];
    expect(es.withCredentials).toBe(true);
    expect(es.url).toBe(
      'http://localhost:3000/api/v1/notify/inbox/me/stream?orgId=default&subscriberId=sub-1',
    );
  });

  it('patches the getUnreadCount cache on unread-count events', async () => {
    const { Wrapper, store } = buildWrapper();
    const identity = { orgId: 'default', subscriberId: 'sub-1' };
    const { result } = renderHook(() => useInboxUnreadSse(identity), { wrapper: Wrapper });
    const es = stubInstances[0];

    // Open the connection then push an unread-count event.
    act(() => es.fire('open'));
    await act(async () => {
      es.fire('unread-count', { unreadCount: 7 });
      // upsertQueryData dispatches a thunk that resolves on the next
      // microtask — flush before reading the cache.
      await Promise.resolve();
    });

    expect(result.current.lastUnreadCount).toBe(7);
    expect(result.current.connected).toBe(true);

    // RTK Query cache for getUnreadCount(identity) should now read 7.
    const cached = notifyInboxApi.endpoints.getUnreadCount.select(identity)(store.getState());
    expect(cached.data?.unreadCount).toBe(7);
  });

  it('ignores malformed payloads without crashing', () => {
    const { Wrapper } = buildWrapper();
    renderHook(() => useInboxUnreadSse({ orgId: 'default', subscriberId: 'sub-1' }), {
      wrapper: Wrapper,
    });
    const es = stubInstances[0];

    act(() => es.fire('unread-count', 'not-json'));
    act(() => es.fire('unread-count', { unreadCount: 'oops' }));
    act(() => es.fire('unread-count', { unreadCount: -1 }));

    // No throw; lastUnreadCount stays null because no valid payload arrived.
    // (Implicit: the test would fail on uncaught exception in the listener.)
  });

  it('schedules a reconnect after an error and increments retryCount', () => {
    const { Wrapper } = buildWrapper();
    const { result } = renderHook(
      () => useInboxUnreadSse({ orgId: 'default', subscriberId: 'sub-1' }),
      { wrapper: Wrapper },
    );
    const first = stubInstances[0];

    act(() => first.fire('error'));
    expect(first.closed).toBe(true);
    expect(result.current.retryCount).toBe(1);
    // First reconnect delay = INITIAL_BACKOFF_MS (1000ms).
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(stubInstances).toHaveLength(2);
  });

  it('tears down the previous EventSource when identity changes', () => {
    const { Wrapper } = buildWrapper();
    const { rerender } = renderHook<unknown, { orgId: string; subscriberId: string } | null>(
      (id) => useInboxUnreadSse(id),
      {
        wrapper: Wrapper,
        initialProps: { orgId: 'default', subscriberId: 'alice' },
      },
    );
    const first = stubInstances[0];
    expect(first.url).toContain('subscriberId=alice');

    rerender({ orgId: 'default', subscriberId: 'bob' });
    expect(first.closed).toBe(true);
    expect(stubInstances.length).toBeGreaterThanOrEqual(2);
    const second = stubInstances[stubInstances.length - 1];
    expect(second.url).toContain('subscriberId=bob');
  });

  it('cleans up on unmount', () => {
    const { Wrapper } = buildWrapper();
    const { unmount } = renderHook(
      () => useInboxUnreadSse({ orgId: 'default', subscriberId: 'sub-1' }),
      { wrapper: Wrapper },
    );
    const es = stubInstances[0];
    expect(es.closed).toBe(false);

    unmount();
    expect(es.closed).toBe(true);
  });

  /**
   * Codex iter-7 absorb — stale-reconnect race regression test.
   *
   * Without effect-local cancelled flag, an error on alice's connection
   * arms a reconnect timer; before the timer fires we flip to bob; the
   * shared ref is reset by bob's effect; alice's timer fires and
   * connects to alice — silently leaking traffic across users.
   * Effect-local closure (let cancelled = false) plugs that race.
   */
  it('does not resurrect a stale connection after identity flip', () => {
    const { Wrapper } = buildWrapper();
    const { rerender } = renderHook<unknown, { orgId: string; subscriberId: string } | null>(
      (id) => useInboxUnreadSse(id),
      {
        wrapper: Wrapper,
        initialProps: { orgId: 'default', subscriberId: 'alice' },
      },
    );
    const aliceEs = stubInstances[0];
    expect(aliceEs.url).toContain('subscriberId=alice');

    // Schedule alice's reconnect via an error event.
    act(() => aliceEs.fire('error'));
    expect(aliceEs.closed).toBe(true);

    // Flip identity to bob *before* the reconnect timer fires.
    rerender({ orgId: 'default', subscriberId: 'bob' });
    const bobEs = stubInstances[stubInstances.length - 1];
    expect(bobEs.url).toContain('subscriberId=bob');
    const sourcesBeforeTimer = stubInstances.length;

    // Advance past alice's 1s reconnect window. No new alice ES should
    // be created — the captured cancelled flag for the alice effect run
    // is true, so the timer callback bails before connect().
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(stubInstances.length).toBe(sourcesBeforeTimer);
    expect(bobEs.closed).toBe(false);
  });
});
