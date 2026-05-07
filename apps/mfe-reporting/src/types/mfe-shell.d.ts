declare module 'mfe_shell/services' {
  import type { QueryClient } from '@tanstack/react-query';

  /**
   * Phase 2 PR-Auth-1 (Codex iter-25 §3 absorb, thread 019e0119):
   * MFE Auth Transport Contract — typed result for {@link ShellAuthService.ready}.
   * MFEs MUST await {@code services.auth.ready()} before issuing protected
   * HTTP requests. The Promise resolves with a discriminated union so
   * callers can distinguish transport-ready, unauthenticated, and failed
   * outcomes without throwing.
   */
  export type AuthReadyResult =
    | { ok: true }
    | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

  /**
   * MFE Auth Transport Contract phases. Source-of-truth lives in
   * {@code apps/mfe-shell/src/features/auth/model/auth.slice.ts}; this
   * declaration mirrors the union for remote MFE consumers.
   */
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
    onTokenChange(listener: (token: string | null) => void): () => void;
    /**
     * Phase 2 PR-Auth-1: epoch-aware Promise bridge. Resolves when phase
     * reaches {@code transportReady}; resolves with {@code ok:false}
     * + reason on terminal failure or unauthenticated states. Logout/
     * re-login bumps the epoch and produces a fresh signal for callers
     * waiting on a previous bootstrap cycle.
     */
    ready(): Promise<AuthReadyResult>;
    /** Synchronous phase inspection (use {@link ready} for async wait). */
    isTransportReady(): boolean;
    getPhase(): ShellAuthPhase;
    getEpoch(): number;
  }

  export interface ShellTelemetryService {
    emit(event: { type: string; payload?: Record<string, unknown> }): void;
  }

  export interface ShellNotificationService {
    push(entry: { message: string; description?: string; type?: string }): void;
  }

  export interface ShellServices {
    auth: ShellAuthService;
    telemetry: ShellTelemetryService;
    notify: ShellNotificationService;
    query: QueryClient;
  }

  export function getShellServices(): ShellServices;
}
