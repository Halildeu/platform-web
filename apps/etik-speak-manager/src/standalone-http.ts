type AccessTokenProvider = () => Promise<string>;
type RequestConfig = {
  headers?: Record<string, string>;
  responseType?: 'arraybuffer';
  /**
   * Accepted for interface parity with the real shared-http client — the
   * design-system grid-variant API passes it. This stub does not enforce it;
   * variant persistence in the standalone cell degrades to the request's
   * natural failure and the grid works without saved views.
   */
  timeout?: number;
};
type ApiResponse<T> = { data: T };

type AccessTokenSnapshot = () => string | null;

let accessTokenProvider: AccessTokenProvider | undefined;
let accessTokenSnapshot: AccessTokenSnapshot | undefined;
let authorizationFailureHandler: (() => void) | undefined;

export const registerAccessTokenProvider = (provider: AccessTokenProvider): void => {
  accessTokenProvider = provider;
};

/**
 * The synchronous view of the same session, for callers that cannot await —
 * the design-system grid-variants client reads `resolveAuthToken()` right before its
 * fetch (platform-web#1155: without it every `/api/v1/variants` call left the manager
 * without an Authorization header and came back 401).
 */
export const registerAccessTokenSnapshot = (snapshot: AccessTokenSnapshot): void => {
  accessTokenSnapshot = snapshot;
};

export const clearAccessTokenProvider = (): void => {
  accessTokenProvider = undefined;
  accessTokenSnapshot = undefined;
};

export const registerAuthorizationFailureHandler = (handler: () => void): void => {
  authorizationFailureHandler = handler;
};

export const clearAuthorizationFailureHandler = (): void => {
  authorizationFailureHandler = undefined;
};

const safeCallerHeaders = (headers: Record<string, string> | undefined): Record<string, string> => {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const normalized = name.toLowerCase();
    if (normalized === 'authorization' || normalized === 'cookie') {
      throw new Error(`Korunan HTTP başlığı caller tarafından ayarlanamaz: ${name}`);
    }
    safe[name] = value;
  }
  return safe;
};

const request = async <T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  config?: RequestConfig,
): Promise<ApiResponse<T>> => {
  if (!accessTokenProvider) throw new Error('Etik Speak oturumu henüz hazır değil.');
  const token = await accessTokenProvider();
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'omit',
    headers: {
      ...safeCallerHeaders(config?.headers),
      Accept:
        config?.responseType === 'arraybuffer' ? 'application/octet-stream' : 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const data =
    response.ok && config?.responseType === 'arraybuffer'
      ? await response.arrayBuffer()
      : contentType.includes('application/json')
        ? await response.json()
        : await response.text();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAccessTokenProvider();
      authorizationFailureHandler?.();
    }
    throw { response: { status: response.status, data } };
  }
  return { data: data as T };
};

export const api = {
  get: <T>(path: string, config?: RequestConfig) => request<T>('GET', path, undefined, config),
  post: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('POST', path, body, config),
  put: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('PUT', path, body, config),
  delete: <T>(path: string, config?: RequestConfig) =>
    request<T>('DELETE', path, undefined, config),
  patch: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('PATCH', path, body, config),
};

/**
 * Names the design-system barrel resolves from `@mfe/shared-http` at link time. The cell
 * aliases that package here. The grid-variants client DOES call them (saved grid views):
 * `resolveAuthToken` must answer synchronously with the current session token — the
 * earlier version invoked the async provider and returned null on its Promise, which
 * is why the manager's `/api/v1/variants` requests carried no Authorization header
 * (measured 2026-09-11, platform-web#1155). Null before the session is ready.
 */
export const resolveAuthToken = (): string | null => accessTokenSnapshot?.() ?? null;

export const getGatewayBaseUrl = (): string => '/api';
