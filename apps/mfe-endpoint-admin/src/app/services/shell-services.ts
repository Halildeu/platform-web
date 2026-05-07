import {
  api,
  registerAuthTokenResolver,
  registerTraceIdResolver,
  registerUnauthorizedHandler,
  logExpected,
} from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';
import type { ShellNotificationEntry, ShellTelemetryEvent } from 'mfe_shell/services';
import { isRuntimeDev } from '../runtime/env';

/**
 * RemoteShellServices — host bridge contract mirrored from sister
 * MFEs (mfe-access, mfe-audit). FE-000 keeps the surface minimal:
 * no domain RTK Query yet (the live status surface lands in FE-001
 * once backend `e9cb8dd0` ships and the OpenFGA grant is verified).
 */
export type RemoteShellServices = {
  notify: { push: (entry: ShellNotificationEntry) => void };
  telemetry: { emit: (event: ShellTelemetryEvent) => void };
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    getUser: () => unknown;
  };
};

const createNoopServices = (): RemoteShellServices => ({
  notify: {
    push: (entry: ShellNotificationEntry) => {
      if (isRuntimeDev()) {
        console.info('[mfe-endpoint-admin] noop notify', entry);
      }
    },
  },
  telemetry: {
    emit: (event: ShellTelemetryEvent) => {
      if (isRuntimeDev()) {
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
  registerTraceIdResolver(() => null);
  registerUnauthorizedHandler(() => undefined);
  if (isRuntimeDev()) {
    console.debug('[mfe-endpoint-admin] shell services configured');
  }
};

export const getShellServices = (): RemoteShellServices => {
  if (!currentServices) {
    if (isRuntimeDev()) {
      logExpected('shellServices.getShellServices', undefined, {
        reason: 'standalone-dev-noop',
      });
      return fallbackServices;
    }
    throw new Error('[mfe-endpoint-admin] Shell servisleri konfigüre edilmedi.');
  }
  return currentServices;
};
