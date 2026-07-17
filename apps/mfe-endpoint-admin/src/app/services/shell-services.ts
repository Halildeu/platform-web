import { api, registerAuthTokenResolver, logExpected } from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';
import type { ShellNotificationEntry, ShellTelemetryEvent } from 'mfe_shell/services';

/**
 * Codex iter-2 PARTIAL absorb (must-fix #1): shell-mounted dev-mode'da
 * `@mfe/shared-http` MF singleton'u sadece `mode === 'production'` altında
 * paylaşıldığı için (vite.config sharedProdOnly), shell'in
 * `registerAuthTokenResolver` çağrısı remote'un kendi shared-http
 * instance'ına ulaşmaz → `resolveAuthToken()` null döner. mfe-users
 * pattern'i: shell `configureShellServices(sharedServices)` ile her
 * remote'a token getter inject ediyor; remote kendi shared-http
 * instance'ında resolver register ediyor.
 *
 * Bu modül endpoint-admin remote'unun aynı injection sözleşmesine
 * katılmasını sağlar. Standalone dev'de (`pnpm --filter
 * mfe-endpoint-admin start`) shell mount yoktur; `getShellServices()`
 * noop fallback döner ve dev-warn loglar.
 */

/** Module access level the shell derives from its `/v1/authz/me` authzSnapshot. */
export type ShellModuleLevel = 'NONE' | 'VIEW' | 'MANAGE';

export type RemoteShellServices = {
  notify: { push: (entry: ShellNotificationEntry) => void };
  telemetry: { emit: (event: ShellTelemetryEvent) => void };
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    getUser: () => unknown;
    /** Subscribe to the live shell token. The callback is invoked immediately. */
    onTokenChange?: (listener: (token: string | null) => void) => () => void;
    /**
     * Module authorization signals. OPTIONAL by type because the standalone
     * noop fallback has neither — but under shell-mount they ARE present at
     * runtime: the shell injects its whole auth object BY REFERENCE
     * (`configureShellServices`), so these methods survive this narrow type and
     * read the shell's live authzSnapshot. See `useManageGate`.
     */
    getModuleLevel?: (module: string) => ShellModuleLevel;
    isSuperAdmin?: () => boolean;
  };
};

const createNoopServices = (): RemoteShellServices => ({
  notify: {
    push: (entry: ShellNotificationEntry) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-endpoint-admin] noop notify', entry);
      }
    },
  },
  telemetry: {
    emit: (event: ShellTelemetryEvent) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[mfe-endpoint-admin] noop telemetry', event);
      }
    },
  },
  http: api,
  auth: {
    getToken: () => null,
    getUser: () => null,
  },
});

let currentServices: RemoteShellServices | null = null;
const fallbackServices = createNoopServices();

export const configureShellServices = (services: Partial<RemoteShellServices>): void => {
  currentServices = {
    notify: services.notify ?? fallbackServices.notify,
    telemetry: services.telemetry ?? fallbackServices.telemetry,
    http: services.http ?? fallbackServices.http,
    auth: services.auth ?? fallbackServices.auth,
  };
  registerAuthTokenResolver(() => currentServices?.auth.getToken() ?? null);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[mfe-endpoint-admin] shell services configured');
  }
};

export const getShellServices = (): RemoteShellServices => {
  if (!currentServices) {
    if (process.env.NODE_ENV !== 'production') {
      logExpected('shellServices.getShellServices', undefined, {
        reason: 'standalone-dev-noop',
      });
      return fallbackServices;
    }
    throw new Error('[mfe-endpoint-admin] Shell servisleri konfigüre edilmedi.');
  }
  return currentServices;
};

export const subscribeToShellAuthToken = (
  listener: (token: string | null) => void,
): (() => void) | undefined => currentServices?.auth.onTokenChange?.(listener);
