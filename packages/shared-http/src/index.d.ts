import { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
export * from './telemetryClient';
type AuthMode = 'keycloak' | 'permitAll';
type TokenResolver = () => string | null;
type TraceIdResolver = () => string | null;
type UnauthorizedHandler = (error: AxiosError) => void;

// PR-HTTP-3: auth-ready bridge contract (mirrors src/index.ts).
export type SharedHttpAuthReadyResult =
  | { ok: true }
  | { ok: false; reason?: string; error?: string };
type AuthReadyResolver = () => Promise<SharedHttpAuthReadyResult>;

// PR-Refresh-4: refresh-token contract.
export type RefreshResult = { ok: true; token?: string } | { ok: false; reason: string };
type RefreshHandler = () => Promise<RefreshResult>;

export type SharedHttpRequestConfig = AxiosRequestConfig & {
  __suppressGlobalForbiddenToast?: boolean;
  __suppressGlobalProfileMissingToast?: boolean;
  __skipAuth?: boolean;
  __skipAuthReadyGate?: boolean;
  __isRefreshAttempt?: boolean;
  __skipRefreshOn401?: boolean;
};

export declare class AuthNotReadyError extends Error {
  readonly reason: string;
  readonly detail?: string;
  constructor(reason: string, detail?: string);
}
export declare const isAuthNotReadyError: (err: unknown) => err is AuthNotReadyError;

export declare const registerAuthTokenResolver: (resolver?: TokenResolver) => void;
export declare const registerTraceIdResolver: (resolver?: TraceIdResolver) => void;
export declare const registerUnauthorizedHandler: (handler?: UnauthorizedHandler) => void;
export declare const registerAuthReadyResolver: (resolver?: AuthReadyResolver) => void;
export declare const registerRefreshHandler: (handler?: RefreshHandler) => void;
export declare const configureSharedHttp: (config?: { authMode?: AuthMode }) => void;
declare const api: AxiosInstance;
export declare const resolveAuthToken: () => string | null;
export declare const resolveTraceId: () => string | null;
export declare const getGatewayBaseUrl: () => string;
export declare const conditionalGet: <T>(
  url: string,
  config?: AxiosRequestConfig & {
    etag?: string;
  },
) => Promise<import('axios').AxiosResponse<T>>;
export { api };
export type ApiInstance = typeof api;
export { fetchManifest, fetchPageLayout } from './manifest';
