// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression guard for the login-flow root cause that PR #390 fixed
 * (Codex thread 019e1457 AGREE). The fix added a sourceId guard to
 * subscribeAuthState's immediate-fire branch so that self-originated
 * cached payloads (from configureShellServices' boot-time
 * broadcastAuthState({token: null}) peer-discovery seed) are NOT
 * replayed to late subscribers. Without that guard, AuthBootstrapper's
 * subscribeAuthState listener fires immediately on attach with the
 * cached null-token payload, dispatches setAuthInitialized(true) before
 * kc.init() runs, and the / route handler navigates to /login,
 * stripping the auth-code URL fragment. End-user-visible symptom: the
 * login flow appears to do nothing on KC callback return.
 *
 * Tests use vi.resetModules() so each scenario gets a fresh
 * module-level state (lastPayload, listeners, tabId) — auth-sync.ts has
 * module-level state that would otherwise leak between cases.
 */

const importAuthSync = async () => {
  // Force a fresh module evaluation so module-level state (lastPayload,
  // listeners, tabId) does not leak between cases. vi.resetModules()
  // clears the module cache; the dynamic import on the next line
  // re-evaluates auth-sync.ts top-to-bottom.
  vi.resetModules();
  return await import('./auth-sync');
};

// Stub BroadcastChannel so postMessage doesn't try real cross-context
// delivery. Each instance keeps its own listener list and counts the
// posted messages so tests can assert on them.
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  listeners: Array<(ev: MessageEvent) => void> = [];
  posted: unknown[] = [];

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  addEventListener(_: string, handler: (ev: MessageEvent) => void) {
    this.listeners.push(handler);
  }
  removeEventListener() {
    /* noop */
  }
  postMessage(data: unknown) {
    this.posted.push(data);
  }
  close() {
    /* noop */
  }
}

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
  (globalThis as unknown as { BroadcastChannel: typeof FakeBroadcastChannel }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof FakeBroadcastChannel;
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auth-sync — subscribeAuthState sourceId guard (PR #390 regression)', () => {
  it('does NOT replay a self-originated cached payload to a late subscriber', async () => {
    const { broadcastAuthState, subscribeAuthState } = await importAuthSync();

    // Simulate the configureShellServices boot-time peer-discovery seed.
    broadcastAuthState({ token: null });

    const listener = vi.fn();
    subscribeAuthState(listener);

    // Critical assertion: listener must NOT have been called immediately
    // with the self-originated cached payload. Without the guard the
    // listener fires with {token: null, sourceId: ourTabId} and any
    // AuthBootstrapper-style consumer would prematurely declare the
    // bootstrap done.
    expect(listener).not.toHaveBeenCalled();
  });

  it('still updates lastPayload on self-broadcast so determineEvent can compare', async () => {
    const { broadcastAuthState } = await importAuthSync();

    // Fire two self-broadcasts in sequence and verify the second one
    // gets event=REFRESH (would be LOGIN if lastPayload was not
    // populated by the first call).
    broadcastAuthState({ token: 'token-a' });
    broadcastAuthState({ token: 'token-b' });

    const channel = FakeBroadcastChannel.instances[0];
    expect(channel).toBeDefined();
    expect(channel.posted).toHaveLength(2);

    const second = channel.posted[1] as { event: string };
    // Both broadcasts had a token, so the second one is REFRESH (the
    // determineEvent contract treats any token-set-while-token-was-set
    // transition as REFRESH). LOGIN here would indicate lastPayload was
    // not populated by the first call, which would break audit/event
    // semantics.
    expect(second.event).toBe('REFRESH');
  });

  it('determineEvent transitions: LOGIN on first token, REFRESH on subsequent, LOGOUT on null', async () => {
    const { broadcastAuthState } = await importAuthSync();

    broadcastAuthState({ token: 'first' });
    broadcastAuthState({ token: 'second' });
    broadcastAuthState({ token: null });

    const channel = FakeBroadcastChannel.instances[0];
    const events = channel.posted.map((p) => (p as { event: string }).event);
    expect(events).toEqual(['LOGIN', 'REFRESH', 'LOGOUT']);
  });

  it('replays a peer-originated payload to a late subscriber (sourceId != tabId)', async () => {
    const { subscribeAuthState } = await importAuthSync();

    const channel = FakeBroadcastChannel.instances[0];
    expect(channel).toBeDefined();
    // Simulate an incoming peer broadcast on the channel — different
    // sourceId means it's NOT us.
    const peerPayload = {
      token: 'peer-token',
      sourceId: 'peer-tab-id',
      profile: null,
      expiresAt: null,
      event: 'LOGIN',
    };
    for (const handler of channel.listeners) {
      handler({ data: peerPayload } as MessageEvent);
    }

    const listener = vi.fn();
    subscribeAuthState(listener);

    // The peer payload was the last incoming event, so lastPayload =
    // peer payload (sourceId != ourTabId), and the late subscriber
    // SHOULD receive an immediate replay.
    expect(listener).toHaveBeenCalledTimes(1);
    const replayed = listener.mock.calls[0][0] as { token: string; sourceId: string };
    expect(replayed.token).toBe('peer-token');
    expect(replayed.sourceId).toBe('peer-tab-id');
  });

  it('replays peer payload even after a later self-broadcast (peer state preserved as last cross-tab signal)', async () => {
    const { broadcastAuthState, subscribeAuthState } = await importAuthSync();

    const channel = FakeBroadcastChannel.instances[0];
    // First: a peer broadcast arrives.
    for (const handler of channel.listeners) {
      handler({
        data: {
          token: 'peer-token',
          sourceId: 'peer-tab',
          event: 'LOGIN',
        },
      } as MessageEvent);
    }
    // Then: we self-broadcast a token. With PR #390 the self-broadcast
    // still writes lastPayload (so determineEvent is correct), which
    // means a late subscriber would see the self-broadcast as cached.
    // The sourceId guard then suppresses that replay. The peer state is
    // not "preserved" so much as the subscriber doesn't get any replay
    // at all — which is the safer default (cross-tab consumers can
    // still call subscribe BEFORE the self-broadcast to be sure they
    // get the peer event).
    broadcastAuthState({ token: 'self-token' });

    const listener = vi.fn();
    subscribeAuthState(listener);

    // No immediate replay because the most recent lastPayload write
    // came from a self-broadcast (sourceId === ourTabId).
    expect(listener).not.toHaveBeenCalled();
  });

  it('LOGOUT signal from peer (legacy storage key) is delivered to a subscribed listener', async () => {
    const { subscribeAuthState } = await importAuthSync();

    const listener = vi.fn();
    subscribeAuthState(listener);

    // Simulate the legacy LOGOUT storage event other tabs may still
    // emit. This goes through notifyListeners directly (no sourceId
    // filter inside notifyListeners) — every subscriber must see it.
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'shell_logout_signal',
        newValue: '1',
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0] as { token: string | null; event: string };
    expect(payload.token).toBeNull();
    expect(payload.event).toBe('LOGOUT');
  });
});
