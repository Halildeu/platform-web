import {
  api,
  registerAuthTokenResolver,
  registerTraceIdResolver,
  registerUnauthorizedHandler,
} from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';

export type MeetingAuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

export type MeetingShellServices = {
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    ready: () => Promise<MeetingAuthReadyResult>;
    getEpoch: () => number;
    onTokenChange?: (listener: (token: string | null) => void) => () => void;
  };
};

const fallbackServices: MeetingShellServices = {
  http: api,
  auth: {
    getToken: () => null,
    ready: () => Promise.resolve({ ok: false, reason: 'unauthenticated' }),
    getEpoch: () => 0,
    onTokenChange: () => () => undefined,
  },
};

let currentServices: MeetingShellServices | null = null;

export function configureShellServices(services: Partial<MeetingShellServices>): void {
  currentServices = {
    http: services.http ?? fallbackServices.http,
    auth: services.auth ?? fallbackServices.auth,
  };
  registerAuthTokenResolver(() => currentServices?.auth.getToken() ?? null);
  registerTraceIdResolver(() => null);
  registerUnauthorizedHandler(() => undefined);
}

export function getShellServices(): MeetingShellServices {
  if (currentServices) return currentServices;
  if (process.env.NODE_ENV !== 'production') return fallbackServices;
  throw new Error('[mfe-meeting] Shell servisleri konfigüre edilmedi.');
}

export function __resetShellServicesForTests(): void {
  currentServices = null;
}
