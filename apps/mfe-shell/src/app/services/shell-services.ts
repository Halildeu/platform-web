import { QueryClient } from '@tanstack/react-query';
import contract from './contract/shell-services.contract.json';
import { subscribeAuthState } from '../auth/auth-sync';

type AuthListener = (token: string | null) => void;

export type ShellTelemetryEvent = {
  type: string;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  timestamp?: number;
};

export type ShellNotificationType = 'success' | 'info' | 'warning' | 'error' | 'loading';

export type ShellNotificationEntry = {
  id?: string;
  message: string;
  description?: string;
  type?: ShellNotificationType;
  priority?: 'normal' | 'high';
  pinned?: boolean;
  createdAt?: number;
  meta?: Record<string, unknown>;
};

/**
 * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb, thread 019e0119):
 * MFE Auth Transport Contract — typed result + phase union.
 */
export type AuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

export type ShellAuthPhase =
  | 'initializing'
  | 'keycloakReady'
  | 'cookieReady'
  | 'authzReady'
  | 'transportReady'
  | 'refreshing'
  | 'unauthenticated'
  | 'failed';

export interface ShellAuthService {
  getToken(): string | null;
  onTokenChange(listener: AuthListener): () => void;
  /**
   * Phase 2 PR-Auth-1: epoch-aware Promise bridge. MFEs MUST await this
   * before issuing protected HTTP requests. Resolves with discriminated
   * union so callers handle transportReady, unauthenticated, and failed
   * outcomes without throwing.
   */
  ready(): Promise<AuthReadyResult>;
  /** Synchronous phase inspection (use {@link ready} for async wait). */
  isTransportReady(): boolean;
  getPhase(): ShellAuthPhase;
  /** Bumps on logout / re-login; lets MFEs invalidate cached Promises. */
  getEpoch(): number;
}

export interface ShellTelemetryService {
  emit(event: ShellTelemetryEvent): void;
}

export interface ShellNotificationService {
  push(entry: ShellNotificationEntry): void;
}

export interface ShellFeatureFlagService {
  isEnabled(flag: string): boolean;
}

export interface ShellServices {
  auth: ShellAuthService;
  query: QueryClient;
  telemetry: ShellTelemetryService;
  notify: ShellNotificationService;
  featureFlags: ShellFeatureFlagService;
  contract: typeof contract;
}

export type ShellServicesInit = {
  queryClient: QueryClient;
  getAuthToken: () => string | null;
  subscribeAuthToken?: (listener: AuthListener) => () => void;
  notify?: (entry: ShellNotificationEntry) => void;
  telemetry?: (event: ShellTelemetryEvent) => void;
  isFeatureEnabled?: (flag: string) => boolean;
  /**
   * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): MFE Auth Transport
   * Contract callbacks. Without these, getShellServices().auth uses
   * fail-closed fallback ({@code ready()} resolves with
   * {@code unauthenticated}, {@code isTransportReady} false).
   */
  authReady?: () => Promise<AuthReadyResult>;
  isTransportReady?: () => boolean;
  getAuthPhase?: () => ShellAuthPhase;
  getAuthEpoch?: () => number;
};

const authListeners = new Set<AuthListener>();
let unsubscribeAuthSource: (() => void) | null = null;

let queryClientRef: QueryClient | null = null;
let tokenCache: string | null = null;
let getAuthTokenImpl: () => string | null = () => tokenCache;
let fallbackQueryClient: QueryClient | null = null;
let warnedUnconfigured = false;

const normalizeToken = (token: string | null | undefined): string | null => {
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = token.trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') {
    return null;
  }
  return normalized;
};

const defaultNotify = (entry: ShellNotificationEntry) => {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[shell:notify]', entry);
  }
};

const defaultTelemetry = (event: ShellTelemetryEvent) => {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[shell:telemetry]', event);
  }
};

let notifyImpl = defaultNotify;
let telemetryImpl = defaultTelemetry;
let featureFlagImpl: (flag: string) => boolean = () => false;

/**
 * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): MFE Auth Transport Contract
 * provider state. Default (un-configured) callbacks fail-closed so MFEs
 * waiting on {@code auth.ready()} do not hang or fetch protected
 * endpoints without authentication.
 */
let authReadyImpl: () => Promise<AuthReadyResult> = () =>
  Promise.resolve({
    ok: false,
    reason: 'unauthenticated',
    error: 'Shell services not configured',
  });
let isTransportReadyImpl: () => boolean = () => false;
let getAuthPhaseImpl: () => ShellAuthPhase = () => 'initializing';
let getAuthEpochImpl: () => number = () => 0;

const emitTokenChange = (token: string | null) => {
  const normalizedToken = normalizeToken(token);
  if (tokenCache === normalizedToken) {
    return;
  }
  tokenCache = normalizedToken;
  authListeners.forEach((listener) => listener(tokenCache));
};

subscribeAuthState((payload) => {
  emitTokenChange(payload.token ?? null);
});

export const configureShellServices = (init: ShellServicesInit): void => {
  queryClientRef = init.queryClient;
  getAuthTokenImpl = init.getAuthToken;
  notifyImpl = init.notify ?? defaultNotify;
  telemetryImpl = init.telemetry ?? defaultTelemetry;
  featureFlagImpl = init.isFeatureEnabled ?? (() => false);

  // Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): wire MFE Auth Transport
  // Contract callbacks if provided. Defaults remain fail-closed.
  if (init.authReady) authReadyImpl = init.authReady;
  if (init.isTransportReady) isTransportReadyImpl = init.isTransportReady;
  if (init.getAuthPhase) getAuthPhaseImpl = init.getAuthPhase;
  if (init.getAuthEpoch) getAuthEpochImpl = init.getAuthEpoch;

  unsubscribeAuthSource?.();
  if (init.subscribeAuthToken) {
    unsubscribeAuthSource = init.subscribeAuthToken((token) => emitTokenChange(token));
  } else {
    emitTokenChange(getAuthTokenImpl());
  }
};

export const getShellServices = (): ShellServices => {
  const targetQueryClient = queryClientRef;
  if (!targetQueryClient) {
    if (process.env.NODE_ENV !== 'production') {
      if (!fallbackQueryClient) {
        fallbackQueryClient = new QueryClient();
      }
      if (!warnedUnconfigured) {
        console.debug(
          '[shell] Shell servisleri henüz konfigüre edilmedi; fallback noop döndürülüyor.',
        );
        warnedUnconfigured = true;
      }
      return createShellServices(fallbackQueryClient);
    }
    throw new Error('[shell] configureShellServices must be called first.');
  }
  return createShellServices(targetQueryClient);
};

export const shellServicesContract = contract;

function createShellServices(queryClient: QueryClient | null): ShellServices {
  return {
    auth: {
      getToken: () => normalizeToken(tokenCache ?? getAuthTokenImpl() ?? null),
      onTokenChange: (listener: AuthListener) => {
        authListeners.add(listener);
        listener(normalizeToken(tokenCache ?? getAuthTokenImpl() ?? null));
        return () => authListeners.delete(listener);
      },
      // Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb): MFE Auth Transport
      // Contract methods. Routes to wired callbacks (shell-services-wiring)
      // or fail-closed defaults if shell hasn't been configured yet.
      ready: () => authReadyImpl(),
      isTransportReady: () => isTransportReadyImpl(),
      getPhase: () => getAuthPhaseImpl(),
      getEpoch: () => getAuthEpochImpl(),
    },
    query: queryClient ?? fallbackQueryClient ?? new QueryClient(),
    telemetry: {
      emit: (event: ShellTelemetryEvent) => {
        const payload: ShellTelemetryEvent = {
          ...event,
          timestamp: event.timestamp ?? Date.now(),
        };
        telemetryImpl(payload);
      },
    },
    notify: {
      push: (entry: ShellNotificationEntry) => {
        const notification: ShellNotificationEntry = {
          ...entry,
          createdAt: entry.createdAt ?? Date.now(),
          type: entry.type ?? 'info',
        };
        notifyImpl(notification);
      },
    },
    featureFlags: {
      isEnabled: (flag: string) => Boolean(featureFlagImpl(flag)),
    },
    contract,
  };
}
