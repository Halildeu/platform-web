import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { resolveAuthToken } from '@mfe/shared-http';
import type { EndpointAgentServiceStatus } from '../../entities/endpoint-agent-status/types';

/**
 * RTK Query slice for the endpoint-admin backend.
 *
 * Backend authority: platform-backend@e9cb8dd0
 *   - GET /api/v1/endpoint-agents/status        (auth-only, no module check)
 *   - /api/v1/admin/endpoint-* (later FE-001+)  (JWT role + can_view/can_manage)
 *
 * Auth model: shell registers a token resolver via @mfe/shared-http; we
 * bridge it through `prepareHeaders` so SSR/standalone fallbacks still
 * compile. The backend rejects unauthenticated requests with `401 JSON`
 * (Spring Security) or `403 JSON` (RequireModule interceptor) — both
 * surface as RTK Query errors and the UI maps to the correct
 * permission-state component.
 */

/**
 * Resolve a base URL that is always absolute. Node 22 + undici (the
 * fetch implementation jsdom 29 ships) rejects relative URLs at the
 * `Request` constructor level (`ERR_INVALID_URL`). Production browsers
 * accept relative URLs against the document, but RTK Query also
 * delegates to `new Request(url)` first, so we must hand it an
 * absolute string in every environment.
 */
function resolveBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/api/v1`;
  }
  return 'http://localhost/api/v1';
}

const rawBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = fetchBaseQuery({
  baseUrl: resolveBaseUrl(),
  prepareHeaders: (headers) => {
    // Codex iter-1 PARTIAL absorb: önceki `window.__endpointAdminToken__`
    // sahte bridge idi — repo içinde hiçbir yer set etmiyordu, shell-mounted
    // kullanıcıda bile 401 üretirdi. Gerçek yol shared-http resolver:
    // shell `registerAuthTokenResolver(() => store.getState().auth.token)`
    // ile bağlıyor (apps/mfe-shell/src/app/config/http-config.ts), her
    // tüketici `resolveAuthToken()` ile çekiyor (mfe-users pattern).
    const token = resolveAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

export const endpointAdminApi = createApi({
  reducerPath: 'endpointAdminApi',
  baseQuery: rawBaseQuery,
  tagTypes: ['AgentStatus'] as const,
  endpoints: (builder) => ({
    getAgentStatus: builder.query<EndpointAgentServiceStatus, void>({
      query: () => ({ url: '/endpoint-agents/status', method: 'GET' }),
      providesTags: ['AgentStatus'],
    }),
  }),
});

export const { useGetAgentStatusQuery } = endpointAdminApi;
