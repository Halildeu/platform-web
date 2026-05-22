import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { resolveAuthToken } from '@mfe/shared-http';
import type { EndpointAgentServiceStatus } from '../../entities/endpoint-agent-status/types';
import type { EndpointDevice } from '../../entities/endpoint-device/types';
import type {
  EndpointAuditEvent,
  ListAuditEventsArgs,
} from '../../entities/endpoint-audit-event/types';

/**
 * RTK Query slice for the endpoint-admin backend.
 *
 * Gateway-external vs backend-internal paths: the browser talks to the
 * api-gateway, not the service directly. Gateway route
 * `endpoint-admin-admin-route` matches `/api/v1/endpoint-admin/**` and
 * RewritePath-s it to the service-internal `/api/v1/admin/**`. Every
 * `url` below MUST use the `/endpoint-admin/...` external prefix — a raw
 * `/admin/...` path matches no gateway route and 404s. The status route
 * is gateway-routed verbatim (`/api/v1/endpoint-agents/**`, no rewrite).
 *
 * Backend authority: platform-backend@e9cb8dd0
 *   - gateway GET /api/v1/endpoint-agents/status → service /api/v1/endpoint-agents/status (auth-only)
 *   - gateway /api/v1/endpoint-admin/endpoint-* → service /api/v1/admin/endpoint-* (JWT role + can_view/can_manage)
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
  tagTypes: ['AgentStatus', 'EndpointDevice', 'EndpointAuditEvent'] as const,
  endpoints: (builder) => ({
    getAgentStatus: builder.query<EndpointAgentServiceStatus, void>({
      query: () => ({ url: '/endpoint-agents/status', method: 'GET' }),
      providesTags: ['AgentStatus'],
    }),
    /**
     * Backend: `AdminEndpointDeviceController.listDevices` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices
     *   → service /api/v1/admin/endpoint-devices
     *   class-level @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *   401 (no JWT) / 403 (FGA tuple yok) / 200 + EndpointDeviceDto[]
     */
    listEndpointDevices: builder.query<EndpointDevice[], void>({
      query: () => ({ url: '/endpoint-admin/endpoint-devices', method: 'GET' }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'EndpointDevice' as const, id })),
              { type: 'EndpointDevice' as const, id: 'LIST' },
            ]
          : [{ type: 'EndpointDevice' as const, id: 'LIST' }],
    }),
    /**
     * Backend: `AdminEndpointDeviceController.getDevice` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}
     *   → service /api/v1/admin/endpoint-devices/{deviceId}
     */
    getEndpointDevice: builder.query<EndpointDevice, string>({
      query: (deviceId) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}`,
        method: 'GET',
      }),
      providesTags: (_result, _error, deviceId) => [
        { type: 'EndpointDevice' as const, id: deviceId },
      ],
    }),
    /**
     * Backend: `AdminEndpointAuditController.listAuditEvents` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-audit-events?deviceId=&commandId=&eventType=&limit=50
     *   → service /api/v1/admin/endpoint-audit-events
     *   class-level @RequireModule(VIEWER='can_view')
     */
    listEndpointAuditEvents: builder.query<EndpointAuditEvent[], ListAuditEventsArgs | void>({
      query: (args) => {
        const params: Record<string, string> = {};
        if (args?.deviceId) params.deviceId = args.deviceId;
        if (args?.commandId) params.commandId = args.commandId;
        if (args?.eventType) params.eventType = args.eventType;
        if (typeof args?.limit === 'number') params.limit = String(args.limit);
        return { url: '/endpoint-admin/endpoint-audit-events', method: 'GET', params };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'EndpointAuditEvent' as const, id })),
              { type: 'EndpointAuditEvent' as const, id: 'LIST' },
            ]
          : [{ type: 'EndpointAuditEvent' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAgentStatusQuery,
  useListEndpointDevicesQuery,
  useGetEndpointDeviceQuery,
  useListEndpointAuditEventsQuery,
} = endpointAdminApi;
