import type { UserProfile } from '@mfe/shared-types';

type AuthSyncEvent = 'LOGIN' | 'LOGOUT' | 'REFRESH';

type AuthSyncPayload = {
  token: string | null;
  profile?: Partial<UserProfile> | null;
  expiresAt?: number | null;
  sourceId?: string;
  event?: AuthSyncEvent;
};

type AuthSyncListener = (payload: AuthSyncPayload) => void;

const CHANNEL_NAME = 'shell-auth';
const STORAGE_EVENT_KEY = 'shell-auth-sync';
const LEGACY_LOGOUT_SIGNAL_KEY = 'shell_logout_signal';
const SNAPSHOT_STORAGE_KEY = 'serban.shell.authState';
const SET_AUTH_EVENT = 'shell:set-auth-state';

const hasWindow = typeof window !== 'undefined';
const supportsBroadcast = hasWindow && typeof BroadcastChannel !== 'undefined';
const channel = supportsBroadcast ? new BroadcastChannel(CHANNEL_NAME) : null;
const tabId =
  hasWindow && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

const listeners = new Set<AuthSyncListener>();
let lastPayload: AuthSyncPayload | null = null;
let suppressBroadcast = false;

const normalizeToken = (token: unknown): string | null => {
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = token.trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') {
    return null;
  }
  return normalized;
};

const notifyListeners = (payload: AuthSyncPayload) => {
  lastPayload = payload;
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[auth-sync] listener error', error);
      }
    }
  });
};

const tryParsePayload = (data: unknown): AuthSyncPayload | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as Record<string, unknown>;
  const token = normalizeToken(payload.token);
  const profile = (payload.profile as Partial<UserProfile> | null | undefined) ?? null;
  const expiresAt =
    typeof payload.expiresAt === 'number' || payload.expiresAt === null
      ? ((payload.expiresAt as number | null | undefined) ?? null)
      : null;
  const sourceId = typeof payload.sourceId === 'string' ? payload.sourceId : undefined;
  const event =
    typeof payload.event === 'string' &&
    (['LOGIN', 'LOGOUT', 'REFRESH'] as string[]).includes(payload.event)
      ? (payload.event as AuthSyncEvent)
      : undefined;
  return { token, profile, expiresAt, sourceId, event };
};

const parseEnvelope = (data: unknown): AuthSyncPayload | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  if ('payload' in (data as Record<string, unknown>)) {
    const envelope = data as { payload?: unknown; sourceId?: string };
    const payload = tryParsePayload(envelope.payload);
    if (payload && envelope.sourceId) {
      payload.sourceId = envelope.sourceId;
    }
    return payload;
  }
  return tryParsePayload(data);
};

const determineEvent = (payload: AuthSyncPayload): AuthSyncEvent => {
  if (payload.event) {
    return payload.event;
  }
  if (!payload.token) {
    return 'LOGOUT';
  }
  if (lastPayload?.token) {
    if (payload.token === lastPayload.token) {
      return 'REFRESH';
    }
    return 'REFRESH';
  }
  return 'LOGIN';
};

const persistSnapshot = (payload: AuthSyncPayload) => {
  if (!hasWindow) {
    return;
  }
  try {
    const snapshot = {
      profile: payload.profile ?? null,
      expiresAt: payload.expiresAt ?? null,
      event: payload.event ?? (payload.token ? 'LOGIN' : 'LOGOUT'),
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore snapshot persistence errors
  }
};

const emitStorageSync = (payload: AuthSyncPayload) => {
  if (!hasWindow) {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_EVENT_KEY,
      JSON.stringify({
        sourceId: tabId,
        payload,
      }),
    );
    window.localStorage.removeItem(STORAGE_EVENT_KEY);
  } catch {
    // ignore storage sync errors
  }
};

const handleIncomingPayload = (payload: AuthSyncPayload | null) => {
  if (!payload) {
    return;
  }
  if (payload.sourceId && payload.sourceId === tabId) {
    return;
  }
  notifyListeners(payload);
};

if (channel) {
  channel.addEventListener('message', (event: MessageEvent) => {
    const payload = parseEnvelope(event?.data);
    handleIncomingPayload(payload);
  });
}

if (hasWindow) {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === LEGACY_LOGOUT_SIGNAL_KEY) {
      notifyListeners({ token: null, profile: null, expiresAt: null, event: 'LOGOUT' });
      return;
    }
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) {
      return;
    }
    try {
      const parsed = JSON.parse(event.newValue) as { sourceId?: string; payload?: unknown };
      const payload = parseEnvelope({
        payload: parsed?.payload,
        sourceId: parsed?.sourceId,
      });
      handleIncomingPayload(payload);
    } catch {
      notifyListeners({ token: null, profile: null, expiresAt: null, event: 'LOGOUT' });
    }
  });

  window.addEventListener(SET_AUTH_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<AuthSyncPayload | undefined>).detail;
    if (!detail) {
      return;
    }
    handleIncomingPayload(detail);
  });
}

export const broadcastAuthState = (payload: AuthSyncPayload): void => {
  if (suppressBroadcast) {
    return;
  }
  const enriched: AuthSyncPayload = {
    ...payload,
    sourceId: tabId,
    event: determineEvent(payload),
  };
  // lastPayload is still written here so determineEvent on the *next*
  // self-broadcast can correctly distinguish LOGIN vs REFRESH vs LOGOUT
  // against the previous local transition. The cross-tab semantics are
  // preserved by subscribeAuthState's sourceId guard below — late
  // subscribers will NOT be hit with our own initial seed payload.
  lastPayload = enriched;
  persistSnapshot(enriched);
  if (channel) {
    channel.postMessage(enriched);
    return;
  }
  emitStorageSync(enriched);
};

export const subscribeAuthState = (listener: AuthSyncListener): (() => void) => {
  listeners.add(listener);
  // 2026-05-11 hotfix (login flow real root cause — PR #390):
  // Only replay the cached payload on subscribe when it originated from
  // a PEER tab. Self-originated payloads (sourceId === tabId) are a
  // local book-keeping artefact of broadcastAuthState and must NOT be
  // replayed to listeners as if they were external cross-tab events.
  //
  // Previously, configureShellServices' boot-time
  // broadcastAuthState({token: null}) wrote lastPayload =
  // {token: null, sourceId: tabId}. The next subscriber
  // (AuthBootstrapper) then attached and was immediately handed that
  // null-token snapshot, dispatching logout() + setAuthInitialized
  // (true) BEFORE kc.init() processed the auth-code URL fragment.
  // AppRouter's / route then saw initialized=true && !token and did
  // <Navigate to="/login" replace>, throwing away the URL fragment.
  // kc.init() then saw /login with no code and declared unauthenticated
  // — the end-user-visible "login won't open" symptom.
  //
  // The sourceId === tabId guard closes that self-pollution path
  // without changing legitimate cross-tab replay behaviour: peer
  // payloads arrive through notifyListeners (channel / storage /
  // custom-event paths) with a different sourceId and still replay.
  if (lastPayload && lastPayload.sourceId !== tabId) {
    try {
      listener(lastPayload);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[auth-sync] immediate listener error', error);
      }
    }
  }
  return () => listeners.delete(listener);
};

export const withSuppressedAuthBroadcast = <T>(fn: () => T): T => {
  suppressBroadcast = true;
  try {
    return fn();
  } finally {
    suppressBroadcast = false;
  }
};

export const getAuthSyncTabId = () => tabId;
