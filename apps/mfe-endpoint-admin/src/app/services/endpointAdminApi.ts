import {
  buildCreateApi,
  coreModule,
  fetchBaseQuery,
  reactHooksModule,
} from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { getShellServices } from './shell-services';
import { unwrapRequestFetchFn } from './unwrap-request-fetch-fn';
import {
  useEndpointAdminDispatch,
  useEndpointAdminSelector,
  useEndpointAdminStore,
} from './redux-context';
import type { EndpointAgentServiceStatus } from '../../entities/endpoint-agent-status/types';
import type { EndpointDevice } from '../../entities/endpoint-device/types';
import type {
  EndpointAuditEvent,
  ListAuditEventsArgs,
} from '../../entities/endpoint-audit-event/types';
import type {
  EndpointCommand,
  CreateEndpointCommandBody,
} from '../../entities/endpoint-command/types';
import type {
  DeviceSoftwareInventory,
  GetDeviceSoftwareInventoryArgs,
} from '../../entities/endpoint-software-inventory/types';

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
 * Auth model (Faz 22 #655 fix — mirrors mfe-users `mergeHeaders` pattern):
 * `prepareHeaders` tries the shell-injected `getShellServices().auth.getToken()`
 * (set by `configureShellServices`; `createEndpointAdminApp` route-level
 * await — #656 — guarantees this runs before any query), then falls back
 * to `localStorage.token` (the shell persists the JWT there). The original
 * `resolveAuthToken()` (`@mfe/shared-http`) path was insufficient — MF
 * singleton sharing is not effective for endpoint-admin (separate
 * federation instance per remote — see `window.__FEDERATION__.__INSTANCES__`),
 * so the shell-registered resolver did not reach this MFE → 401 storm
 * (#655 browser forensics). The backend rejects unauthenticated requests with `401 JSON`
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

/**
 * Normalise a candidate token value — strip whitespace and reject the
 * literal strings `'undefined'` / `'null'` (legacy persistence artefacts
 * occasionally observed in storage). Returns `null` for any non-usable
 * value so the caller can fall through to the next source.
 */
function normalizeAuthToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
  return trimmed;
}

/**
 * Resolve the bearer token for an outgoing endpoint-admin RTK request.
 *
 * Mirrors the `mergeHeaders` precedent in
 * `apps/mfe-users/src/entities/user/api/users.api.ts` (~lines 671-694):
 * try the shell-injected getter first, fall back to `localStorage.token`
 * (the shell-persisted JWT). See the file header for the #655 rationale.
 *
 * Both sources are wrapped in try/catch so any failure mode (shell
 * services not yet configured, `localStorage` access denied) returns
 * `null` silently rather than throwing inside RTK Query's
 * `prepareHeaders`.
 */
function readBearerToken(): string | null {
  let token: string | null = null;
  try {
    token = normalizeAuthToken(getShellServices().auth.getToken());
  } catch {
    // getShellServices() throws when shell services haven't been
    // configured yet (standalone dev / pre-#656 race). Fall through.
  }
  if (!token && typeof window !== 'undefined') {
    try {
      token = normalizeAuthToken(window.localStorage.getItem('token'));
    } catch {
      // localStorage access denied (SSR / sandbox). Return null.
    }
  }
  return token;
}

const rawBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = fetchBaseQuery({
  baseUrl: resolveBaseUrl(),
  // Faz 22 follow-on (post-#657 ALLOW-path browser smoke): RTK Query 2.x
  // `fetchBaseQuery` defaults to `fetch(new Request(url, init))` which
  // trips a wire-layer header drop somewhere between the frontend pod's
  // nginx and the orchestrator. Live in-browser evidence on testai
  // (2026-05-24): the same 3 endpoint-admin routes return 200/403 with
  // `fetch(url, { headers })` but 401 "JWT token zorunludur." with
  // `fetch(new Request(url, { headers }))`. Mirrors the notify-domain
  // shim (`apps/mfe-shell/src/features/notifications/api/notify-request-fetch-fn.ts`,
  // platform-web #652 `07805aa`). See `./unwrap-request-fetch-fn.ts`
  // doc comment for full rationale + Codex thread references.
  fetchFn: unwrapRequestFetchFn,
  prepareHeaders: (headers) => {
    const token = readBearerToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

/**
 * Custom `createApi` that wires React hooks to the MFE-local explicit
 * Redux context. This bypasses the default `ReactReduxContext`
 * identity routing that breaks under Module Federation's load-share
 * graph (the AG Grid + ag-charts chain can resolve react-redux from
 * a separate bundle before host registers the singleton, giving the
 * generated hooks a different context than the `<Provider>` mounts
 * to). Live testai smoke (2026-05-25) confirmed the symptom: inner
 * store fulfilled, hook stuck pending. Pinning both ends of the
 * subscription to `endpointAdminReduxContext` closes the identity
 * gap deterministically — Codex iter-3 review (thread 019e6068).
 */
const createApi = buildCreateApi(
  coreModule(),
  reactHooksModule({
    hooks: {
      useDispatch: useEndpointAdminDispatch,
      useSelector: useEndpointAdminSelector,
      useStore: useEndpointAdminStore,
    },
  }),
);

export const endpointAdminApi = createApi({
  reducerPath: 'endpointAdminApi',
  baseQuery: rawBaseQuery,
  tagTypes: [
    'AgentStatus',
    'EndpointDevice',
    'EndpointAuditEvent',
    'EndpointCommand',
    'EndpointSoftwareInventory',
  ] as const,
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
     * WEB-011 — Faz 22.5.1B (Codex 019e6b16 iter-3 AGREE).
     *
     * Backend: `AdminEndpointSoftwareInventoryController.getDeviceSnapshot` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/software-inventory
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/software-inventory
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns `{ snapshot, items: Page<...> }`. When no snapshot has been
     * ingested for the device the service throws 404 (not snapshot=null);
     * RTK Query surfaces it as `error.status === 404` and the
     * `InventoryTab` maps it to the "no inventory yet" empty state per
     * Codex iter-2 must-fix #1.
     */
    getDeviceSoftwareInventory: builder.query<
      DeviceSoftwareInventory,
      GetDeviceSoftwareInventoryArgs
    >({
      query: ({ deviceId, q, publisher, installSource, page, size }) => {
        const params: Record<string, string> = {};
        if (q && q.trim()) params.q = q.trim();
        if (publisher && publisher.trim()) params.publisher = publisher.trim();
        if (installSource) params.installSource = installSource;
        if (typeof page === 'number') params.page = String(page);
        if (typeof size === 'number') params.size = String(size);
        return {
          url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
            deviceId,
          )}/software-inventory`,
          method: 'GET',
          params,
        };
      },
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointSoftwareInventory' as const, id: deviceId },
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
      providesTags: (result, _err, args) => {
        const deviceScope = args?.deviceId
          ? [{ type: 'EndpointAuditEvent' as const, id: `device-${args.deviceId}` }]
          : [];
        if (!result) {
          return [{ type: 'EndpointAuditEvent' as const, id: 'LIST' }, ...deviceScope];
        }
        return [
          ...result.map(({ id }) => ({ type: 'EndpointAuditEvent' as const, id })),
          { type: 'EndpointAuditEvent' as const, id: 'LIST' },
          ...deviceScope,
        ];
      },
    }),
    /**
     * Backend: `AdminEndpointCommandController.listDeviceCommands` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/commands
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/commands
     *   @RequireModule(VIEWER='can_view')
     */
    listDeviceCommands: builder.query<EndpointCommand[], { deviceId: string }>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/commands`,
        method: 'GET',
      }),
      providesTags: (result, _err, { deviceId }) => {
        const deviceScope = [{ type: 'EndpointCommand' as const, id: `device-${deviceId}` }];
        if (!result) return deviceScope;
        return [
          ...result.map((c) => ({ type: 'EndpointCommand' as const, id: c.id })),
          ...deviceScope,
        ];
      },
    }),
    /**
     * Backend: `AdminEndpointCommandController.getCommand` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-commands/{commandId}
     *   → service /api/v1/admin/endpoint-commands/{commandId}
     *   @RequireModule(VIEWER='can_view')
     */
    getEndpointCommand: builder.query<EndpointCommand, { commandId: string }>({
      query: ({ commandId }) => ({
        url: `/endpoint-admin/endpoint-commands/${encodeURIComponent(commandId)}`,
        method: 'GET',
      }),
      providesTags: (_result, _err, { commandId }) => [
        { type: 'EndpointCommand' as const, id: commandId },
      ],
    }),
    /**
     * Backend: `AdminEndpointCommandController.createCommand` —
     *   gateway POST /api/v1/endpoint-admin/endpoint-devices/{deviceId}/commands
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/commands
     *   @RequireModule(MANAGER='can_manage')
     *
     * Destructive command types (LOCK_USER_LOGIN, UNLOCK_USER_LOGIN,
     * CHANGE_LOCAL_PASSWORD, ROTATE_CREDENTIAL) return
     * approvalStatus=PENDING and require a second admin's approval
     * before the agent can claim them (BE-017 dual-control).
     *
     * Invalidation scope: device-scoped command list + device-scoped
     * audit event list (every command create triggers an audit event).
     */
    createDeviceCommand: builder.mutation<
      EndpointCommand,
      { deviceId: string; body: CreateEndpointCommandBody }
    >({
      query: ({ deviceId, body }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/commands`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointCommand' as const, id: `device-${deviceId}` },
        { type: 'EndpointAuditEvent' as const, id: `device-${deviceId}` },
      ],
    }),
  }),
});

export const {
  useGetAgentStatusQuery,
  useListEndpointDevicesQuery,
  useGetEndpointDeviceQuery,
  useListEndpointAuditEventsQuery,
  useListDeviceCommandsQuery,
  useGetEndpointCommandQuery,
  useCreateDeviceCommandMutation,
} = endpointAdminApi;
