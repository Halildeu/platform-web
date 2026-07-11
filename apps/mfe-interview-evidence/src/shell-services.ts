import {
  api,
  registerAuthTokenResolver,
  registerTraceIdResolver,
  registerUnauthorizedHandler,
} from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';

/**
 * 39d-6 shell-token köprüsü — mfe-meeting `shell-services` deseninin aynası
 * (ATS-0019: MFE kendi token'ını ÜRETMEZ; Bearer/auth-ready/refresh zinciri
 * shell'den gelir). Shell, remote'u mount etmeden ÖNCE `configureShellServices`
 * çağırır (createProtectedRemoteApp); canlı `/api/ats` çağrıları bu köprü
 * üzerinden shared-http ile yapılır.
 */
export type InterviewEvidenceAuthReadyResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed'; error?: string };

export type InterviewEvidenceShellServices = {
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    ready: () => Promise<InterviewEvidenceAuthReadyResult>;
    getEpoch: () => number;
    onTokenChange?: (listener: (token: string | null) => void) => () => void;
  };
};

const fallbackServices: InterviewEvidenceShellServices = {
  http: api,
  auth: {
    getToken: () => null,
    ready: () => Promise.resolve({ ok: false, reason: 'unauthenticated' }),
    getEpoch: () => 0,
    onTokenChange: () => () => undefined,
  },
};

let currentServices: InterviewEvidenceShellServices | null = null;

export function configureShellServices(services: Partial<InterviewEvidenceShellServices>): void {
  currentServices = {
    http: services.http ?? fallbackServices.http,
    auth: services.auth ?? fallbackServices.auth,
  };
  registerAuthTokenResolver(() => currentServices?.auth.getToken() ?? null);
  registerTraceIdResolver(() => null);
  registerUnauthorizedHandler(() => undefined);
}

export function getShellServices(): InterviewEvidenceShellServices {
  if (currentServices) return currentServices;
  if (process.env.NODE_ENV !== 'production') return fallbackServices;
  throw new Error('[mfe-interview-evidence] Shell servisleri konfigüre edilmedi.');
}

export function __resetShellServicesForTests(): void {
  currentServices = null;
}
