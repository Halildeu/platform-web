type AccessTokenProvider = () => Promise<string>;
type RequestConfig = {
  headers?: Record<string, string>;
  responseType?: 'arraybuffer';
};
type ApiResponse<T> = { data: T };

let accessTokenProvider: AccessTokenProvider | undefined;
let authorizationFailureHandler: (() => void) | undefined;

export const registerAccessTokenProvider = (provider: AccessTokenProvider): void => {
  accessTokenProvider = provider;
};

export const clearAccessTokenProvider = (): void => {
  accessTokenProvider = undefined;
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
  method: 'GET' | 'POST' | 'PATCH',
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
  patch: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('PATCH', path, body, config),
};
