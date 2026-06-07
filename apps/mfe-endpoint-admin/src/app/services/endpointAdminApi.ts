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
import type {
  GetDeviceHardwareInventoryHistoryArgs,
  GetDeviceHardwareInventoryLatestArgs,
  HardwareInventoryHistoryPage,
  HardwareInventorySnapshot,
} from '../../entities/endpoint-hardware-inventory/types';
import type {
  DeviceHealthHistoryPage,
  DeviceHealthSnapshot,
  GetDeviceHealthHistoryArgs,
  GetDeviceHealthLatestArgs,
} from '../../entities/endpoint-device-health/types';
import type {
  GetOutdatedSoftwareHistoryArgs,
  GetOutdatedSoftwareLatestArgs,
  OutdatedSoftwareHistoryPage,
  OutdatedSoftwareSnapshot,
} from '../../entities/endpoint-outdated-software/types';
import type {
  GetHotfixPostureHistoryArgs,
  GetHotfixPostureLatestArgs,
  HotfixPostureHistoryPage,
  HotfixPostureSnapshot,
} from '../../entities/endpoint-hotfix-posture/types';
import type { DiagnosticsSnapshot } from '../../entities/endpoint-agent-diagnostics/types';
import type { ServicesSnapshot } from '../../entities/endpoint-services/types';
import type {
  AgentUpdateRelease,
  ApproveAgentUpdateReleaseArgs,
  CreateAgentUpdateReleaseArgs,
  DispatchAgentUpdateArgs,
  ListAgentUpdateReleasesArgs,
  RevokeAgentUpdateReleaseArgs,
} from '../../entities/agent-update/types';
import type { StartupExposureSnapshot } from '../../entities/endpoint-startup-exposure/types';
import type { AppControlSnapshot } from '../../entities/endpoint-app-control/types';
import type { SoftwareInventoryDiffSnapshot } from '../../entities/endpoint-software-inventory-diff/types';
import type { OutdatedSoftwareDiffSnapshot } from '../../entities/endpoint-outdated-software-diff/types';
import type { DeviceProhibitedSoftwareSnapshot } from '../../entities/endpoint-prohibited-software/types';
import type { EndpointLatestSnapshots } from '../../entities/endpoint-latest-snapshots/types';
import {
  DeviceGridExportError,
  type DeviceGridErrorBody,
  type DeviceGridExportArgs,
  type DeviceGridQueryRequest,
  type DeviceGridQueryResponse,
} from '../../entities/endpoint-device-grid/types';
import type {
  CompliancePolicyItem,
  CompliancePolicyItemRequest,
  ComplianceEvaluationListResponse,
  ComplianceStateResponse,
  DeleteCompliancePolicyItemArgs,
  ForceEvaluateDeviceComplianceArgs,
  GetComplianceDeviceListArgs,
  GetCompliancePolicyItemArgs,
  GetCompliancePolicyItemsArgs,
  GetDeviceComplianceArgs,
  GetDeviceComplianceEvaluationsArgs,
  UpdateCompliancePolicyItemArgs,
} from '../../entities/endpoint-device-compliance/types';
import type {
  ComplianceGapResponse,
  GetComplianceGapArgs,
} from '../../entities/endpoint-compliance-gap/types';
import type {
  AdminCatalogItemRequest,
  AdminCatalogItemResponse,
  AdminCatalogItemSummary,
  ListCatalogItemsArgs,
  SpringPage,
} from '../../entities/endpoint-software-catalog/types';
import type {
  CreateInstallArgs,
  CreateInstallSuccess,
  EndpointInstallAuditDto,
  GetInstallAuditArgs,
  GetInstallPreflightArgs,
  InstallPreflightResponse,
  ListInstallAuditsArgs,
} from '../../entities/endpoint-install/types';
import type {
  AdminUninstallAuditResponse,
  AdminUninstallRequestResponse,
  ApproveUninstallArgs,
  ApproveUninstallSuccess,
  CreateUninstallArgs,
  CreateUninstallSuccess,
  ListUninstallAuditsArgs,
  ListUninstallRequestsArgs,
} from '../../entities/endpoint-uninstall/types';
import type {
  CreateEndpointEnrollmentArgs,
  CreateEndpointEnrollmentResponse,
  EndpointEnrollment,
} from '../../entities/endpoint-enrollment/types';

/**
 * AG-038 — endpoint-local args interface for the diagnostics-latest
 * query. Kept here (not in the entity types module) for symmetry with
 * other endpoint-local args that need no global re-export.
 */
export interface GetDiagnosticsLatestArgs {
  deviceId: string;
}

/**
 * AG-039 — endpoint-local args interface for the services-latest query.
 * Same pattern as GetDiagnosticsLatestArgs.
 */
export interface GetServicesLatestArgs {
  deviceId: string;
}

/**
 * AG-040 — endpoint-local args interface for the startup-exposure-latest
 * query.
 */
export interface GetStartupExposureLatestArgs {
  deviceId: string;
}

/**
 * AG-041 — endpoint-local args interface for the app-control-latest
 * query.
 */
export interface GetAppControlLatestArgs {
  deviceId: string;
}

/**
 * BE-024 — endpoint-local args for the software-inventory diff
 * (latest-vs-previous capture) query. Faz 22.5 P2-A.
 */
export interface GetSoftwareInventoryDiffArgs {
  deviceId: string;
}

/**
 * BE-024b — endpoint-local args for the outdated-software diff
 * (latest-vs-previous capture) query. Faz 22.5 P2-A slice-3b.
 */
export interface GetOutdatedSoftwareDiffArgs {
  deviceId: string;
}

/**
 * BE-025 — endpoint-local args for the per-device prohibited-software
 * findings query (Faz 22.5 P2-A slice-2). Reads the last persisted
 * compliance evaluation projection (no GET recompute).
 */
export interface GetProhibitedSoftwareArgs {
  deviceId: string;
}

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

const GRID_BASE = '/endpoint-admin/endpoint-devices';

function gridAuthHeaders(): Record<string, string> {
  const token = readBearerToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * #1154 PR-3 — server-mode device grid datasource fetch. A plain async
 * function (not an RTK hook) so the AG Grid SSRM {@code getRows} callback
 * can call it imperatively, mirroring the reporting module's
 * {@code fetchRows}. Uses the same auth ({@link readBearerToken}) + the
 * unwrapped {@code fetch(url, init)} form the RTK baseQuery relies on (a
 * {@code new Request(...)} wrapper drops headers on the testai wire — see
 * {@link rawBaseQuery} doc).
 */
export async function queryDevices(
  request: DeviceGridQueryRequest,
): Promise<DeviceGridQueryResponse> {
  const res = await fetch(`${resolveBaseUrl()}${GRID_BASE}/query`, {
    method: 'POST',
    headers: gridAuthHeaders(),
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    let code = String(res.status);
    try {
      const body = (await res.json()) as DeviceGridErrorBody;
      if (body?.code) code = body.code;
    } catch {
      // non-JSON error body — keep the HTTP status as the code
    }
    throw new DeviceGridExportError({ code, message: `device grid query failed (${code})` });
  }
  return (await res.json()) as DeviceGridQueryResponse;
}

/**
 * #1154 PR-3 — report-style export blob fetch (raw/view × csv/xlsx). RTK
 * mutations don't surface a {@code Blob} cleanly, so this is a plain fetch
 * with the same auth + unwrapped-fetch contract. Returns the blob + a
 * deterministic filename; throws {@link DeviceGridExportError} carrying the
 * structured {@code code}/{@code limit} (e.g. {@code EXPORT_ROW_LIMIT_EXCEEDED})
 * on a non-2xx so the caller can branch.
 */
export async function exportDevices(
  args: DeviceGridExportArgs,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${resolveBaseUrl()}${GRID_BASE}/export`, {
    method: 'POST',
    headers: gridAuthHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let body: DeviceGridErrorBody = {
      code: String(res.status),
      message: `export failed (${res.status})`,
    };
    try {
      body = (await res.json()) as DeviceGridErrorBody;
    } catch {
      // keep the status-based fallback
    }
    throw new DeviceGridExportError(body);
  }
  const blob = await res.blob();
  const ext = args.format === 'xlsx' ? 'xlsx' : 'csv';
  const filename = `endpoint-devices-${args.exportMode}.${ext}`;
  return { blob, filename };
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
    'EndpointHardwareInventory',
    'EndpointDeviceHealth',
    'EndpointOutdatedSoftware',
    'EndpointHotfixPosture',
    'EndpointAgentDiagnostics',
    'EndpointServices',
    'EndpointStartupExposure',
    'EndpointAppControl',
    'EndpointSoftwareInventoryDiff',
    'EndpointOutdatedSoftwareDiff',
    'EndpointProhibitedSoftware',
    'EndpointDeviceCompliance',
    'EndpointComplianceGap',
    'CompliancePolicyItem',
    'EndpointSoftwareCatalog',
    'EndpointInstallAudit',
    'EndpointUninstallRequest',
    'EndpointUninstallAudit',
    'EndpointEnrollment',
    'EndpointAgentUpdateRelease',
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
     * WEB-013 — Hardware inventory latest (Faz 22.5.2 / 22.5.5
     * frontend closure). Codex 019e70ce plan-time PARTIAL AGREE
     * absorb.
     *
     * Backend: `AdminEndpointHardwareInventoryController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/hardware-inventory/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/hardware-inventory/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the most-recent {@link HardwareInventorySnapshot} with
     * disks + network interfaces folded into the response. When no
     * snapshot has been ingested for the device the service throws
     * 404; RTK Query surfaces it as {@code error.status === 404} and
     * the {@code HardwareInventoryView} maps that to the "no hardware
     * snapshot yet" empty state. Cross-tenant requests fall into the
     * same 404 branch — device existence does not leak (BE-022Q
     * tenant isolation contract).
     */
    getDeviceHardwareInventoryLatest: builder.query<
      HardwareInventorySnapshot,
      GetDeviceHardwareInventoryLatestArgs
    >({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
          deviceId,
        )}/hardware-inventory/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointHardwareInventory' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * WEB-013 — Hardware inventory history (paged summary).
     *
     * Backend: `AdminEndpointHardwareInventoryController.getHistory` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/hardware-inventory/history?page=0&size=20
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/hardware-inventory/history
     *
     * Returns a Spring Page envelope of
     * {@link HardwareInventorySnapshotSummary} (no child arrays;
     * surfaces {@code diskCount} / {@code networkInterfaceCount} /
     * {@code probeErrorCount}). Backend clamps {@code size} into
     * [1, 50] silently — a request of {@code size=200} returns
     * {@code totalElements} with {@code size === 50}.
     */
    getDeviceHardwareInventoryHistory: builder.query<
      HardwareInventoryHistoryPage,
      GetDeviceHardwareInventoryHistoryArgs
    >({
      query: ({ deviceId, page, size }) => {
        const params: Record<string, string> = {};
        if (typeof page === 'number') params.page = String(page);
        if (typeof size === 'number') params.size = String(size);
        return {
          url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
            deviceId,
          )}/hardware-inventory/history`,
          method: 'GET',
          params,
        };
      },
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointHardwareInventory' as const, id: `${deviceId}::history` },
      ],
    }),
    /**
     * WEB device-health latest — Faz 22.5 second wave (AG-033 device
     * health). Mirrors the WEB-013 hardware-inventory slice.
     *
     * Backend: `AdminEndpointDeviceHealthController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/device-health/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/device-health/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the most-recent {@link DeviceHealthSnapshot} (the
     * AG-033 v1 payload block, contract-frozen at
     * schema/endpoint-device-health-payload-v1.schema.json). When no
     * snapshot has been ingested the service throws 404; RTK Query
     * surfaces it as {@code error.status === 404} and the
     * {@code DeviceHealthView} maps that to the "no device-health
     * snapshot yet" empty state. Cross-tenant requests fall into the
     * same 404 branch — device existence does not leak.
     */
    getDeviceHealthLatest: builder.query<DeviceHealthSnapshot, GetDeviceHealthLatestArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
          deviceId,
        )}/device-health/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointDeviceHealth' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * WEB device-health history (paged summary).
     *
     * Backend: `AdminEndpointDeviceHealthController.getHistory` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/device-health/history?page=0&size=20
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/device-health/history
     *
     * Returns a Spring Page envelope of
     * {@link DeviceHealthSnapshotSummary} (no child disk array;
     * surfaces the warning booleans + {@code fixedDiskCount}). Backend
     * clamps {@code size} silently per the BE-022 precedent.
     */
    getDeviceHealthHistory: builder.query<DeviceHealthHistoryPage, GetDeviceHealthHistoryArgs>({
      query: ({ deviceId, page, size }) => {
        const params: Record<string, string> = {};
        if (typeof page === 'number') params.page = String(page);
        if (typeof size === 'number') params.size = String(size);
        return {
          url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
            deviceId,
          )}/device-health/history`,
          method: 'GET',
          params,
        };
      },
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointDeviceHealth' as const, id: `${deviceId}::history` },
      ],
    }),
    /**
     * AG-036 outdated-software latest — Faz 22.5 Track C
     * (contract-gated consumer). Mirrors the AG-033 device-health slice.
     *
     * Backend: `AdminEndpointOutdatedSoftwareController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/outdated-software/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/outdated-software/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the most-recent {@link OutdatedSoftwareSnapshot} (the
     * AG-036 v1 payload block, contract-frozen at
     * schema/endpoint-outdated-software-payload-v1.schema.json) with the
     * upgradeable `packages[]` child list folded in. When no snapshot has
     * been ingested the service throws 404; RTK Query surfaces it as
     * {@code error.status === 404} and the {@code OutdatedSoftwareView}
     * maps that to the "no outdated-software snapshot yet" empty state.
     * Cross-tenant requests fall into the same 404 branch — device
     * existence does not leak (the repository query is tenant-scoped).
     */
    getOutdatedSoftwareLatest: builder.query<
      OutdatedSoftwareSnapshot,
      GetOutdatedSoftwareLatestArgs
    >({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
          deviceId,
        )}/outdated-software/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointOutdatedSoftware' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * AG-036 outdated-software history (paged summary).
     *
     * Backend: `AdminEndpointOutdatedSoftwareController.getHistory` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/outdated-software/history?page=0&size=20
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/outdated-software/history
     *
     * Returns a Spring Page envelope of
     * {@link OutdatedSoftwareSnapshotSummary} (no child packages array;
     * surfaces {@code upgradeCount} / {@code upgradeTruncated} /
     * {@code possiblyTruncated} / {@code packageCount} /
     * {@code probeErrorCount}). Backend clamps {@code size} into [1, 50]
     * silently per the device-health history precedent.
     */
    getOutdatedSoftwareHistory: builder.query<
      OutdatedSoftwareHistoryPage,
      GetOutdatedSoftwareHistoryArgs
    >({
      query: ({ deviceId, page, size }) => {
        const params: Record<string, string> = {};
        if (typeof page === 'number') params.page = String(page);
        if (typeof size === 'number') params.size = String(size);
        return {
          url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
            deviceId,
          )}/outdated-software/history`,
          method: 'GET',
          params,
        };
      },
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointOutdatedSoftware' as const, id: `${deviceId}::history` },
      ],
    }),
    /**
     * AG-037 hotfix-posture latest — Faz 22.5 Track C (WEB-014G).
     *
     * Backend: `AdminEndpointHotfixPostureController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/hotfix-posture/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/hotfix-posture/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the most-recent {@link HotfixPostureSnapshot} (the
     * validated wire block + persistence envelope folded) with the
     * installed + pending + pendingByCategory + flat agentHealth
     * children. Backend lookup is tenant-scoped: a cross-tenant request
     * returns 404 (no device-existence leak). The view maps 404 → empty
     * state with the operator-action hint
     * ("COLLECT_INVENTORY includeHotfixPosture:true gerekli").
     */
    getHotfixPostureLatest: builder.query<HotfixPostureSnapshot, GetHotfixPostureLatestArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
          deviceId,
        )}/hotfix-posture/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointHotfixPosture' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * AG-037 hotfix-posture history (paged summary).
     *
     * Backend: `AdminEndpointHotfixPostureController.getHistory` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/hotfix-posture/history?page=0&size=20
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/hotfix-posture/history
     *
     * Returns a Spring Page envelope of
     * {@link HotfixPostureSnapshotSummary} (no child arrays, no
     * agentHealth — surfaces installedCount + pendingTotalCount +
     * truncation hints + child counts). Backend clamps {@code size}
     * into [1, 50] silently per the AG-036 outdated-software history
     * precedent.
     */
    getHotfixPostureHistory: builder.query<HotfixPostureHistoryPage, GetHotfixPostureHistoryArgs>({
      query: ({ deviceId, page, size }) => {
        const params: Record<string, string> = {};
        if (typeof page === 'number') params.page = String(page);
        if (typeof size === 'number') params.size = String(size);
        return {
          url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
            deviceId,
          )}/hotfix-posture/history`,
          method: 'GET',
          params,
        };
      },
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointHotfixPosture' as const, id: `${deviceId}::history` },
      ],
    }),
    /**
     * AG-038 — agent self-diagnostics snapshot (latest).
     *
     * Backend: `AdminEndpointDiagnosticsController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/diagnostics/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/diagnostics/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the latest {@link DiagnosticsSnapshot} (the validated wire
     * block + persistence envelope folded): supported / probeComplete /
     * agent version / config hash / last poll latency / backend DNS+TLS
     * tri-state / nullable lastError triad / bounded probeErrors[].
     * Backend lookup is tenant-scoped: cross-tenant returns 404 (no
     * device-existence leak). The view maps 404 → empty state with the
     * operator-action hint ("COLLECT_INVENTORY includeDiagnostics:true
     * gerekli; İşlemler tab'ı") — note: the wire payload bit is
     * `includeDiagnostics`, NOT `includeAgentDiagnostics` (Codex
     * 019e833d must_fix #3 — agent reads it in
     * `internal/commands/executor.go`).
     *
     * Cache: NO `keepUnusedDataFor: 0` override here (a deliberate
     * divergence from the install-preflight modal). Diagnostics is a
     * read-only inspection surface and the RTK tag
     * `EndpointAgentDiagnostics:${deviceId}::latest` lets a future
     * post-ingest mutation invalidate it; manual refetch via tab toggle
     * is the freshness contract. The view itself defends against
     * cross-arg leak via `currentData` + `isDiagnosticsForDevice`.
     */
    getDiagnosticsLatest: builder.query<DiagnosticsSnapshot, GetDiagnosticsLatestArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/diagnostics/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointAgentDiagnostics' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * AG-039 — critical services inventory snapshot (latest).
     *
     * Backend: `AdminEndpointServicesController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/services/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/services/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the latest {@link ServicesSnapshot}: supported /
     * probeComplete / per-service `{name, present, state, startupMode}`
     * for the 6-service canonical allowlist (WinDefend / wuauserv /
     * BITS / EventLog / EndpointAgent / MpsSvc) + bounded probeErrors[]
     * (each `{rowOrdinal, code, serviceName?, summary?}`). Backend
     * lookup is tenant-scoped: cross-tenant returns 404 (no device-
     * existence leak). The view maps 404 → empty state with the
     * operator-action hint ("COLLECT_INVENTORY includeServices:true"
     * — the actual agent payload bit per
     * platform-agent internal/commands/executor.go).
     *
     * Cache: NO `keepUnusedDataFor: 0` override (deliberate freshness
     * divergence from install-preflight modal); tag id
     * `${deviceId}::latest` matches the AG-037/AG-038 convention. The
     * view defends against cross-arg leak via `currentData` +
     * `isServicesForDevice`.
     */
    getServicesLatest: builder.query<ServicesSnapshot, GetServicesLatestArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/services/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointServices' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * AG-040 — startup-exposure snapshot (latest).
     *
     * Backend: `AdminEndpointStartupExposureController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/startup-exposure/latest
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/startup-exposure/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the latest {@link StartupExposureSnapshot}: supported /
     * probeComplete + 2 exposure scalars (rdpEnabled +
     * windowsFirewallEventLogEnabled) + per-startup-app
     * `{name, location, enabled, probeOrigin}` over the 10-slot
     * autorun-anchor allowlist + bounded probeErrors[]. Tenant-scoped;
     * cross-tenant returns 404. View maps 404 → empty state with the
     * operator hint `COLLECT_INVENTORY includeStartupExposure:true`
     * (matches the agent payload bit per
     * platform-agent internal/commands/executor.go).
     *
     * Cache: NO `keepUnusedDataFor: 0`; tag id `${deviceId}::latest`
     * matches the AG-037/AG-038/AG-039 convention.
     */
    getStartupExposureLatest: builder.query<StartupExposureSnapshot, GetStartupExposureLatestArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/startup-exposure/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointStartupExposure' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * AG-041 — Application Control (WDAC + AppLocker) snapshot read.
     *
     * Gateway-fronted: `GET /api/v1/endpoint-admin/endpoint-devices/{
     * deviceId}/app-control/latest` → service
     * `AdminEndpointAppControlController.getLatest` (RequireModule
     * VIEWER). Returns the latest {@link AppControlSnapshot}: WDAC
     * mode + 4 bounded WDAC evidence bits + 5 AppLocker per-collection
     * enforcement modes + AppIDSvc state/startup/present + 8-code
     * probe-errors list. Tenant comes from cookie session; deviceId
     * cross-tenant returns 404. View maps 404 → empty state with the
     * operator hint `COLLECT_INVENTORY includeAppControl:true`
     * (matches the agent payload bit per platform-agent
     * internal/commands/executor.go).
     *
     * Cache: NO `keepUnusedDataFor: 0`; tag id `${deviceId}::latest`
     * matches the AG-037/AG-038/AG-039/AG-040 convention.
     */
    getAppControlLatest: builder.query<AppControlSnapshot, GetAppControlLatestArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/app-control/latest`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointAppControl' as const, id: `${deviceId}::latest` },
      ],
    }),
    /**
     * BE-024 — Software-inventory diff (latest-vs-previous capture)
     * read. Faz 22.5 P2-A.
     *
     * Gateway-fronted: `GET /api/v1/endpoint-admin/endpoint-devices/
     * {deviceId}/software-inventory/diff` → service
     * `AdminEndpointSoftwareInventoryController.getDeviceSoftwareDiff`
     * (RequireModule VIEWER). Always 200 (no-existence-leak); 4-status
     * enum encodes the rendering branch (OK / NO_CHANGE /
     * INSUFFICIENT_HISTORY / NO_HISTORY).
     *
     * Cache: NO `keepUnusedDataFor: 0`; tag id `${deviceId}::diff-latest`
     * matches the AG-037..AG-041 convention.
     */
    getSoftwareInventoryDiff: builder.query<
      SoftwareInventoryDiffSnapshot,
      GetSoftwareInventoryDiffArgs
    >({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/software-inventory/diff`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointSoftwareInventoryDiff' as const, id: `${deviceId}::diff-latest` },
      ],
    }),
    /**
     * BE-024b — Outdated-software diff (latest-vs-previous capture)
     * read. Faz 22.5 P2-A slice-3b.
     *
     * Gateway-fronted: `GET /api/v1/endpoint-admin/endpoint-devices/
     * {deviceId}/outdated-software/diff` → service
     * `AdminEndpointOutdatedSoftwareController.getDeviceOutdatedSoftwareDiff`
     * (RequireModule VIEWER). Always 200 (no-existence-leak); 4-status
     * enum (OK / NO_CHANGE / INSUFFICIENT_HISTORY / NO_HISTORY).
     *
     * Cache: tag id `${deviceId}::outdated-diff-latest`.
     */
    getOutdatedSoftwareDiff: builder.query<
      OutdatedSoftwareDiffSnapshot,
      GetOutdatedSoftwareDiffArgs
    >({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/outdated-software/diff`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointOutdatedSoftwareDiff' as const, id: `${deviceId}::outdated-diff-latest` },
      ],
    }),
    /**
     * BE-025 — Per-device prohibited-software findings read. Faz 22.5
     * P2-A slice-2.
     *
     * Gateway-fronted: `GET /api/v1/endpoint-admin/endpoint-devices/
     * {deviceId}/prohibited-software` → service
     * `AdminProhibitedSoftwareController.getDeviceProhibitedSoftware`
     * (RequireModule VIEWER). Always 200 (no-existence-leak); 2-status
     * enum (OK / NO_EVALUATION) encodes whether an evaluation has
     * persisted findings for this device.
     *
     * Cache: tag id `${deviceId}::prohibited-latest`.
     */
    getProhibitedSoftware: builder.query<
      DeviceProhibitedSoftwareSnapshot,
      GetProhibitedSoftwareArgs
    >({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/prohibited-software`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointProhibitedSoftware' as const, id: `${deviceId}::prohibited-latest` },
      ],
    }),
    /**
     * #1146 — fleet-wide bulk latest device-health + outdated-software
     * snapshots for the device-inventory CSV-export v2 columns (ONE
     * round-trip instead of an N-per-row client fetch storm).
     *
     * Backend: `AdminEndpointSnapshotsController.getLatestSnapshots` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/snapshots/latest
     *   → service /api/v1/admin/endpoint-devices/snapshots/latest
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns {@link EndpointLatestSnapshots}: the latest snapshot per
     * device for the caller's tenant, each group capped with a per-group
     * `*Truncated` flag (over-cap ⇒ EMPTY list + flag true, so the page
     * drops that group's columns rather than reading a partial map as a
     * false absence). Tagged so an ingest mutation could invalidate
     * `bulk-latest`; the page uses `refetchOnMountOrArgChange` for
     * freshness on (re)visit.
     */
    getLatestSnapshots: builder.query<EndpointLatestSnapshots, void>({
      query: () => ({
        url: '/endpoint-admin/endpoint-devices/snapshots/latest',
        method: 'GET',
      }),
      providesTags: [
        { type: 'EndpointDeviceHealth' as const, id: 'bulk-latest' },
        { type: 'EndpointOutdatedSoftware' as const, id: 'bulk-latest' },
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
    /**
     * WEB-014A — Faz 22.5 Compliance State (Codex 019e6d68 plan-time
     * AGREE).
     *
     * Backend: `AdminEndpointComplianceController.getLatest` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/compliance
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/compliance
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * 404 maps to "never evaluated" empty state; the tab renders a
     * single "Evaluate now" CTA so the operator can prime the state
     * without leaving the drawer.
     */
    getDeviceCompliance: builder.query<ComplianceStateResponse, GetDeviceComplianceArgs>({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/compliance`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointDeviceCompliance' as const, id: deviceId },
      ],
    }),
    /**
     * WEB-014A force evaluate. Returns the newly persisted state
     * (Codex 019e6bbf force-evaluate response shape: same DTO as GET
     * latest). 409 + Retry-After: 5 surfaces as RTK Query error
     * (`error.status === 409`); the tab renders a 5 s cooldown toast
     * and re-enables the button. 403 surfaces likewise; tab renders a
     * permission toast.
     *
     * WEB-014B widens the invalidation tag set so the force-evaluate
     * also refreshes:
     *   - latest pointer for this device
     *   - per-device history (append-only row appended by the POST)
     *   - cross-device list (latest pointer row updated)
     */
    forceEvaluateDeviceCompliance: builder.mutation<
      ComplianceStateResponse,
      ForceEvaluateDeviceComplianceArgs
    >({
      query: ({ deviceId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/compliance/evaluate`,
        method: 'POST',
      }),
      invalidatesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointDeviceCompliance' as const, id: deviceId },
        { type: 'EndpointDeviceCompliance' as const, id: `history-${deviceId}` },
        { type: 'EndpointDeviceCompliance' as const, id: 'LIST' },
      ],
    }),
    /**
     * WEB-014B — Cross-device compliance list.
     *   gateway GET /api/v1/endpoint-admin/compliance/devices
     *           ?decision=&page=&size=
     *   → service /api/v1/admin/compliance/devices
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Server-side filter: only `decision` (one of COMPLIANT /
     * NON_COMPLIANT / UNAUTHORIZED / UNKNOWN). `worstStaleness` and
     * `policyDrift` are NOT server-side filterable in this PR — they
     * are rendered as columns/badges only (Codex 019e6db0 iter-1: the
     * staleness band is computed at GET time from collectedAt
     * timestamps, and `policyDrift` is computed from a live hash
     * comparison; filtering them in-page would silently break pagination
     * totals).
     *
     * Pagination envelope is the BE-023 custom shape
     * `ComplianceEvaluationListResponse<T>` —
     * `{ items, page, size, totalElements, totalPages }` — NOT Spring
     * `Page<T>` (no `content` / `number`).
     */
    getComplianceDeviceList: builder.query<
      ComplianceEvaluationListResponse<ComplianceStateResponse>,
      GetComplianceDeviceListArgs
    >({
      query: ({ decision, page = 0, size = 20 }) => {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (decision) params.decision = decision;
        return {
          url: '/endpoint-admin/compliance/devices',
          method: 'GET',
          params,
        };
      },
      providesTags: (_result, _error) => [
        { type: 'EndpointDeviceCompliance' as const, id: 'LIST' },
      ],
    }),
    /**
     * Faz 22.7 D3 — Compliance Gap Mart explorer.
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/compliance-gap
     *           ?gapTypes=&freshnessWindow=&page=&pageSize=
     *   → service /api/v1/admin/endpoint-devices/compliance-gap
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Cross-snapshot aggregation: DB-side DISTINCT ON CTE over
     * endpoint_startup_exposure_snapshots + endpoint_hotfix_posture_snapshots
     * joined LEFT on endpoint_devices, then filtered by gap types.
     *
     * D2 MVP gap types: `rdp_enabled`, `pending_security_updates`.
     *
     * Backend bounds: MAX_PAGE_SIZE=200, MAX_FRESHNESS_WINDOW=P366D
     * (Codex risk mitigations against unbounded full-table aggregation +
     * sample/fleet confusion). gapStrength="strong" MVP — all rows are
     * DB-filtered by freshness window.
     *
     * Backend uses 1-based pagination (page>=1). filterEcho echoes the
     * validated/sanitized request with sorted gapTypes for deterministic
     * JSON output (operator MUST read filterEcho to understand the
     * "observed devices only" sample boundary).
     *
     * HARD RULE No Fake Work: all aggregation is server-side (no client
     * reduce). HARD RULE Uzun Vadeli Kalıcı Çözüm: schema-qualified tables
     * + deterministic DISTINCT ON tiebreaker absorbed via Codex
     * 019e88b0-7d47-7fb1-b307-c8c13d350942 P1/P2/P2-low.
     */
    getComplianceGap: builder.query<ComplianceGapResponse, GetComplianceGapArgs>({
      query: ({ gapTypes, freshnessWindow, page = 1, pageSize = 50 }) => {
        const params: Record<string, string> = {
          page: String(page),
          pageSize: String(pageSize),
        };
        if (gapTypes && gapTypes.length > 0) {
          // Sorted for deterministic cache key (matches backend filterEcho).
          params.gapTypes = [...gapTypes].sort().join(',');
        }
        if (freshnessWindow) {
          params.freshnessWindow = freshnessWindow;
        }
        return {
          url: '/endpoint-admin/endpoint-devices/compliance-gap',
          method: 'GET',
          params,
        };
      },
      providesTags: (_result) => [{ type: 'EndpointComplianceGap' as const, id: 'LIST' }],
    }),
    /**
     * WEB-014B — Per-device evaluation history.
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{id}/compliance/evaluations
     *           ?page=&size=
     *   → service /api/v1/admin/endpoint-devices/{id}/compliance/evaluations
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Append-only history table; backend returns newest-first. Used by
     * the ComplianceTab history accordion (lazy `<details>` — query
     * stays skipped until the operator opens the accordion, so a tab
     * open never costs an extra request).
     */
    getDeviceComplianceEvaluations: builder.query<
      ComplianceEvaluationListResponse<ComplianceStateResponse>,
      GetDeviceComplianceEvaluationsArgs
    >({
      query: ({ deviceId, page = 0, size = 20 }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
          deviceId,
        )}/compliance/evaluations`,
        method: 'GET',
        params: {
          page: String(page),
          size: String(size),
        },
      }),
      providesTags: (_result, _error, { deviceId }) => [
        { type: 'EndpointDeviceCompliance' as const, id: `history-${deviceId}` },
      ],
    }),
    /**
     * WEB-014C — List compliance policy items.
     *   gateway GET /api/v1/endpoint-admin/compliance/policy-items?page=&size=
     *   → service /api/v1/admin/compliance/policy-items
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Response envelope is the SAME BE-023 custom shape
     * (`ComplianceEvaluationListResponse<T>`) — NOT Spring Page<T>.
     */
    listCompliancePolicyItems: builder.query<
      ComplianceEvaluationListResponse<CompliancePolicyItem>,
      GetCompliancePolicyItemsArgs
    >({
      query: ({ page = 0, size = 20 } = {}) => ({
        url: '/endpoint-admin/compliance/policy-items',
        method: 'GET',
        params: { page: String(page), size: String(size) },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((item) => ({
                type: 'CompliancePolicyItem' as const,
                id: item.id,
              })),
              { type: 'CompliancePolicyItem' as const, id: 'LIST' },
            ]
          : [{ type: 'CompliancePolicyItem' as const, id: 'LIST' }],
    }),
    /**
     * WEB-014C — Single policy item read (used by EditDialog pre-load).
     */
    getCompliancePolicyItem: builder.query<CompliancePolicyItem, GetCompliancePolicyItemArgs>({
      query: ({ id }) => ({
        url: `/endpoint-admin/compliance/policy-items/${encodeURIComponent(id)}`,
        method: 'GET',
      }),
      providesTags: (_result, _error, { id }) => [{ type: 'CompliancePolicyItem' as const, id }],
    }),
    /**
     * WEB-014C — Create policy item. 409 surfaces as duplicate-policy
     * toast (catalog item already has a policy row for this tenant).
     * 403 surfaces as MANAGE-required toast. Invalidates the list +
     * cross-device compliance LIST (policy drift surfaces on the
     * compliance overview after mutation; Codex 019e6dff iter-1 §6).
     */
    createCompliancePolicyItem: builder.mutation<CompliancePolicyItem, CompliancePolicyItemRequest>(
      {
        query: (body) => ({
          url: '/endpoint-admin/compliance/policy-items',
          method: 'POST',
          body,
        }),
        // Codex 019e6e10 iter-1 §4: invalidate the new policy item id
        // when the server returns it, so an in-flight
        // `getCompliancePolicyItem` subscription for that id refetches
        // with the freshly-created entity instead of relying on the
        // broader LIST refetch alone.
        invalidatesTags: (result) =>
          result
            ? [
                { type: 'CompliancePolicyItem' as const, id: result.id },
                { type: 'CompliancePolicyItem' as const, id: 'LIST' },
                { type: 'EndpointDeviceCompliance' as const, id: 'LIST' },
              ]
            : [
                { type: 'CompliancePolicyItem' as const, id: 'LIST' },
                { type: 'EndpointDeviceCompliance' as const, id: 'LIST' },
              ],
      },
    ),
    /**
     * WEB-014C — Update policy item. Backend enforces `catalogItemId`
     * immutability (changing it returns 400); EditDialog disables the
     * field. Body intentionally omits `version` — backend does NOT
     * honor optimistic concurrency on the request DTO (Codex 019e6dff
     * iter-1 §4). 409 surfaces as generic conflict toast.
     */
    updateCompliancePolicyItem: builder.mutation<
      CompliancePolicyItem,
      UpdateCompliancePolicyItemArgs
    >({
      query: ({ id, body }) => ({
        url: `/endpoint-admin/compliance/policy-items/${encodeURIComponent(id)}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: 'CompliancePolicyItem' as const, id },
        { type: 'CompliancePolicyItem' as const, id: 'LIST' },
        { type: 'EndpointDeviceCompliance' as const, id: 'LIST' },
      ],
    }),
    /**
     * WEB-014C — Delete policy item (hard remove). Missing policy is
     * interpreted as `ALLOWED` by the evaluator, so deleting a row is
     * semantically different from `enabled=false` (soft disable).
     */
    deleteCompliancePolicyItem: builder.mutation<void, DeleteCompliancePolicyItemArgs>({
      query: ({ id }) => ({
        url: `/endpoint-admin/compliance/policy-items/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: 'CompliancePolicyItem' as const, id },
        { type: 'CompliancePolicyItem' as const, id: 'LIST' },
        { type: 'EndpointDeviceCompliance' as const, id: 'LIST' },
      ],
    }),
    /**
     * WEB-014C — Endpoint software catalog list (BE-020 admin list).
     *   gateway GET /api/v1/endpoint-admin/endpoint-software-catalog
     *           ?status=&enabled=&page=&size=
     *   → service /api/v1/admin/endpoint-software-catalog
     *
     * Response is a Spring `Page<AdminCatalogItemSummary>` — distinct
     * from the BE-023 custom envelope. Used by the policy CreateDialog
     * catalog dropdown (`status=APPROVED&enabled=true&size=200` covers
     * the common case; server-side typeahead is a separate backlog if
     * a tenant ever exceeds 200 active catalog items — Codex 019e6dff
     * iter-1 §A).
     */
    listCatalogItems: builder.query<SpringPage<AdminCatalogItemSummary>, ListCatalogItemsArgs>({
      query: ({ status, enabled, page = 0, size = 200 } = {}) => {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (status) params.status = status;
        if (enabled !== undefined) params.enabled = String(enabled);
        return {
          url: '/endpoint-admin/endpoint-software-catalog',
          method: 'GET',
          params,
        };
      },
      providesTags: [{ type: 'EndpointSoftwareCatalog' as const, id: 'LIST' }],
    }),
    /**
     * Path C3 — Get a single catalog item (full DTO with detection rule).
     *   gateway GET /api/v1/endpoint-admin/endpoint-software-catalog/{catalogItemId}
     *   → service /api/v1/admin/endpoint-software-catalog/{catalogItemId}
     *
     * Used by the authoring drawer's Edit mode entry. The response
     * carries the raw `detectionRule` map; callers MUST run it through
     * {@code normalizeDetectionRule(...)} before binding to the typed
     * editor (unknown shapes fall back to read-only summary + Save
     * disabled per Codex iter-2 absorb).
     */
    getCatalogItem: builder.query<AdminCatalogItemResponse, string>({
      query: (catalogItemId) => ({
        url: `/endpoint-admin/endpoint-software-catalog/${encodeURIComponent(catalogItemId)}`,
        method: 'GET',
      }),
      providesTags: (_res, _err, catalogItemId) => [
        { type: 'EndpointSoftwareCatalog' as const, id: catalogItemId },
      ],
    }),
    /**
     * Path C3 — Create catalog item with detection rule.
     *   gateway POST /api/v1/endpoint-admin/endpoint-software-catalog
     *
     * HTTP semantics:
     *  - 201 → AdminCatalogItemResponse
     *  - 400 → field validation failure (catalogItemId duplicate, etc.)
     *  - 422 → DetectionRuleValidator rejection (path safety, SHA shape,
     *          predicate shape, maxHashBytes cap). The frontend surfaces
     *          the body's `errors` array per field with i18n reason
     *          codes.
     *  - 403 → caller lacks `endpoint:catalog:write`.
     *
     * Invalidates the catalog LIST so the new item appears immediately.
     */
    createCatalogItem: builder.mutation<AdminCatalogItemResponse, AdminCatalogItemRequest>({
      query: (body) => ({
        url: '/endpoint-admin/endpoint-software-catalog',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'EndpointSoftwareCatalog' as const, id: 'LIST' }],
    }),
    /**
     * Path C3 — Update catalog item (detection rule + metadata).
     *   gateway PUT /api/v1/endpoint-admin/endpoint-software-catalog/{catalogItemId}
     *
     * Same semantics as create except `catalogItemId` in the path is
     * the canonical identifier and the body MUST match it (backend
     * 400s on mismatch). Invalidates the single-item cache + LIST.
     */
    updateCatalogItem: builder.mutation<
      AdminCatalogItemResponse,
      { catalogItemId: string; body: AdminCatalogItemRequest }
    >({
      query: ({ catalogItemId, body }) => ({
        url: `/endpoint-admin/endpoint-software-catalog/${encodeURIComponent(catalogItemId)}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_res, _err, { catalogItemId }) => [
        { type: 'EndpointSoftwareCatalog' as const, id: catalogItemId },
        { type: 'EndpointSoftwareCatalog' as const, id: 'LIST' },
      ],
    }),
    /**
     * WEB-014D — Install preflight (BE-021A read-only decision).
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/install-preflight
     *           ?catalogItemId={slug}
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/install-preflight
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns the canonical PASS / WARN / BLOCK contract. The decision
     * is computed on-demand — there is no persisted row, so no
     * provides-tag is meaningful. Codex 019e6fd1 must-fix #3:
     * `keepUnusedDataFor: 0` so the modal always sees a fresh evaluation
     * when reopened; the parent component combines this with
     * `refetchOnMountOrArgChange: true` on the hook subscription for
     * defence-in-depth against router-level cache reuse.
     */
    getInstallPreflight: builder.query<InstallPreflightResponse, GetInstallPreflightArgs>({
      query: ({ deviceId, catalogItemId }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/install-preflight`,
        method: 'GET',
        params: { catalogItemId },
      }),
      keepUnusedDataFor: 0,
    }),
    /**
     * WEB-014D — Create install command (BE-021 dedicated POST surface).
     *   gateway POST /api/v1/endpoint-admin/endpoint-devices/{deviceId}/installs
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/installs
     *   @RequireModule(MODULE='endpoint-admin', MANAGER='can_manage')
     *
     * HTTP semantics:
     *  - 201 → EndpointCommandDto (PASS / WARN — command queued)
     *  - 409 → InstallPreflightResponse (BLOCK recompute) OR an
     *          idempotency-key collision; callers must shape-guard via
     *          `tryReadBlockRecompute(error.data)` before mounting.
     *  - 400 → request validation failure
     *  - 404 → device or catalog item not visible to caller tenant
     *
     * Invalidation: device command list (the new INSTALL_SOFTWARE row
     * appears immediately in IslemlerTab), device audit event list
     * (every command create triggers an audit event), and the
     * install-audit list (the dedicated `Son Kurulumlar` panel inside
     * SoftwareCatalogTab refetches on mutation).
     */
    createInstall: builder.mutation<CreateInstallSuccess, CreateInstallArgs>({
      query: ({ deviceId, body }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/installs`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointCommand' as const, id: `device-${deviceId}` },
        { type: 'EndpointAuditEvent' as const, id: `device-${deviceId}` },
        { type: 'EndpointInstallAudit' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * WEB-014D — Per-device install audit list (BE-021 read).
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/installs
     *           ?page=&size=
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/installs
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Response envelope is Spring `Page<EndpointInstallAuditDto>`
     * (NOT the BE-023 custom envelope). Default page size 25, max 100.
     */
    listInstallAudits: builder.query<SpringPage<EndpointInstallAuditDto>, ListInstallAuditsArgs>({
      query: ({ deviceId, page = 0, size = 25 }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/installs`,
        method: 'GET',
        params: { page: String(page), size: String(size) },
      }),
      providesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointInstallAudit' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * WEB-014D — Single install audit row (drill-down detail).
     *   gateway GET /api/v1/endpoint-admin/endpoint-install-audits/{auditId}
     *   → service /api/v1/admin/endpoint-install-audits/{auditId}
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     */
    getInstallAudit: builder.query<EndpointInstallAuditDto, GetInstallAuditArgs>({
      query: ({ auditId }) => ({
        url: `/endpoint-admin/endpoint-install-audits/${encodeURIComponent(auditId)}`,
        method: 'GET',
      }),
      providesTags: (_res, _err, { auditId }) => [
        { type: 'EndpointInstallAudit' as const, id: auditId },
      ],
    }),
    /**
     * AG-028 Phase 3 — Propose a managed uninstall (BE dedicated POST).
     *   gateway POST /api/v1/endpoint-admin/endpoint-devices/{deviceId}/uninstalls
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/uninstalls
     *   @RequireModule(MODULE='endpoint-admin', MANAGER='can_manage')
     *
     * Body: { catalogItemId(slug), idempotencyKey?, reason? }. There is
     * NO uninstall-preflight; the propose endpoint enforces every gate
     * INLINE and returns 4xx on failure:
     *  - 201 → AdminUninstallRequestResponse (PENDING_APPROVAL, commandId null)
     *  - 422 → catalog gate (not APPROVED / !uninstall_supported /
     *          uninstall_protected / detection-rule not authoritative),
     *          no install-provenance
     *  - 409 → in-flight request or idempotency-key reuse mismatch
     *  - 503 → feature flag endpoint-admin.uninstall.enabled=false
     *  - 400 / 404 → validation / device-or-catalog not visible
     * Error body is `{ error, message, ... }` where `message` is the
     * verbatim reason (no stable machine code — Codex 019e93ab b3).
     *
     * Invalidation: per-device request list (the new PENDING_APPROVAL
     * row appears immediately) + device audit event list (propose emits
     * an audit event). The terminal-result history row is created later
     * by the agent report; the history-panel poll surfaces it.
     */
    createUninstall: builder.mutation<CreateUninstallSuccess, CreateUninstallArgs>({
      query: ({ deviceId, body }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/uninstalls`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointUninstallRequest' as const, id: `device-${deviceId}` },
        { type: 'EndpointAuditEvent' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * AG-028 Phase 3 — Approve a managed uninstall (maker-checker).
     *   gateway POST /api/v1/endpoint-admin/endpoint-devices/{deviceId}/uninstalls/{requestId}/approve
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/uninstalls/{requestId}/approve
     *   @RequireModule(MODULE='endpoint-admin', MANAGER='can_manage')
     *
     * Body (optional): { reason? }. The approver subject MUST differ
     * from the proposer (createdBy) — server-enforced from tenant
     * context:
     *  - 200 → AdminUninstallRequestResponse (APPROVED, commandId set)
     *  - 403 → maker-checker violation (approver == proposer) — there is
     *          NO reject endpoint; self-approve is the only 403 here
     *  - 409 → request not in PENDING_APPROVAL state
     *  - 422 → catalog gates drifted / agent capability not advertised
     *  - 424 → agent heartbeat stale (retryable)
     *  - 503 → feature flag disabled
     *
     * Invalidation: per-device request list (the row flips to APPROVED)
     * + the new UNINSTALL_SOFTWARE command list + device audit events.
     */
    approveUninstall: builder.mutation<ApproveUninstallSuccess, ApproveUninstallArgs>({
      query: ({ deviceId, requestId, body }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(
          deviceId,
        )}/uninstalls/${encodeURIComponent(requestId)}/approve`,
        method: 'POST',
        // Backend declares the approve body @RequestBody(required=false);
        // always send an object (empty when no reason) so the Content-Type
        // is set and Jackson binds an AdminUninstallRequestApproval rather
        // than seeing a bodyless request.
        body: body ?? {},
      }),
      invalidatesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointUninstallRequest' as const, id: `device-${deviceId}` },
        { type: 'EndpointCommand' as const, id: `device-${deviceId}` },
        { type: 'EndpointAuditEvent' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * AG-028 Phase 3 — Per-device uninstall request list (states).
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/uninstalls?page=&size=
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/uninstalls
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns a PLAIN List<AdminUninstallRequestResponse> (NOT a Spring
     * Page envelope — the controller returns `List<...>` directly),
     * ordered createdAt DESC. Backend clamps size into [1, 200].
     */
    listUninstallRequests: builder.query<
      AdminUninstallRequestResponse[],
      ListUninstallRequestsArgs
    >({
      query: ({ deviceId, page = 0, size = 50 }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/uninstalls`,
        method: 'GET',
        params: { page: String(page), size: String(size) },
      }),
      providesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointUninstallRequest' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * AG-028 Phase 3 — Per-device uninstall terminal-result history.
     *   gateway GET /api/v1/endpoint-admin/endpoint-devices/{deviceId}/uninstalls/history?page=&size=
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/uninstalls/history
     *   @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Returns a PLAIN List<AdminUninstallAuditResponse> (NOT a Spring
     * Page envelope), ordered reportedAt DESC. Backend clamps size into
     * [1, 200]. The drawer polls this every 30 s while the tab is
     * active (mirror of the install audit polling) — terminal results
     * from the Windows agent arrive a few seconds to a minute after the
     * approve dispatch.
     */
    listUninstallAudits: builder.query<AdminUninstallAuditResponse[], ListUninstallAuditsArgs>({
      query: ({ deviceId, page = 0, size = 10 }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/uninstalls/history`,
        method: 'GET',
        params: { page: String(page), size: String(size) },
      }),
      providesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointUninstallAudit' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * WEB-017 — Endpoint enrollment list (Faz 22.5.x manager surface).
     *
     * Backend: `AdminEndpointEnrollmentController.listEnrollments` —
     *   gateway GET /api/v1/endpoint-admin/endpoint-enrollments
     *   → service /api/v1/admin/endpoint-enrollments
     *   class-level @RequireModule(MODULE='endpoint-admin', VIEWER='can_view')
     *
     * Backend returns a PLAIN List<EndpointEnrollmentDto>, NOT a
     * Spring Page envelope — Codex 019e711f plan-time must-fix #2.
     */
    listEndpointEnrollments: builder.query<EndpointEnrollment[], void>({
      query: () => ({ url: '/endpoint-admin/endpoint-enrollments', method: 'GET' }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'EndpointEnrollment' as const, id })),
              { type: 'EndpointEnrollment' as const, id: 'LIST' },
            ]
          : [{ type: 'EndpointEnrollment' as const, id: 'LIST' }],
    }),
    /**
     * WEB-017 — Create endpoint enrollment token (reveal-once).
     *
     * Backend: `AdminEndpointEnrollmentController.createEnrollment` —
     *   POST /api/v1/endpoint-admin/endpoint-enrollments
     *   @RequireModule(MODULE='endpoint-admin', MANAGER='can_manage')
     *
     * Response contains the RAW token — this is the ONLY moment the
     * raw value is exposed. Subsequent list responses surface metadata
     * (status / expiresAt / consumedAt / deviceId) but never the raw
     * token. The UI must surface it in a reveal-once modal and discard
     * it from state on close (Codex 019e711f iter-1 reveal-once UX).
     */
    createEndpointEnrollment: builder.mutation<
      CreateEndpointEnrollmentResponse,
      CreateEndpointEnrollmentArgs
    >({
      query: (body) => ({
        url: '/endpoint-admin/endpoint-enrollments',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'EndpointEnrollment' as const, id: 'LIST' }],
    }),
    /**
     * AG-029 (BE-031) — list agent-update releases for the dispatch picker.
     *   gateway GET /api/v1/endpoint-admin/endpoint-agent-update-releases
     *   → service /api/v1/admin/endpoint-agent-update-releases
     * The dispatch UI requests only APPROVED + enabled releases (the
     * dispatchable set); the trust decision was made at release-approve time.
     */
    listAgentUpdateReleases: builder.query<
      SpringPage<AgentUpdateRelease>,
      ListAgentUpdateReleasesArgs | void
    >({
      query: (args) => ({
        url: '/endpoint-admin/endpoint-agent-update-releases',
        method: 'GET',
        params: {
          ...(args?.status ? { status: args.status } : {}),
          ...(args?.enabled !== undefined ? { enabled: String(args.enabled) } : {}),
          ...(args?.channel ? { channel: args.channel } : {}),
          page: String(args?.page ?? 0),
          size: String(args?.size ?? 50),
        },
      }),
      providesTags: [{ type: 'EndpointAgentUpdateRelease' as const, id: 'LIST' }],
    }),
    /**
     * AG-029 (BE-032) — dispatch a catalog-bound signed agent self-update.
     *   gateway POST /api/v1/endpoint-admin/endpoint-devices/{deviceId}/agent-updates
     *   → service /api/v1/admin/endpoint-devices/{deviceId}/agent-updates
     *
     * SECURITY (Codex 019ea0a6): the body is EXACTLY { releaseId, reason }.
     * The backend resolves the approved+enabled release server-side, re-checks
     * fresh heartbeat + advertised UPDATE_AGENT capability, builds the payload,
     * and REJECTS any caller-supplied trust field (binaryUrl / sha256 /
     * signerThumbprint / signingTier) with HTTP 400. DispatchAgentUpdateBody
     * pins this with never-typed forbidden fields.
     */
    dispatchAgentUpdate: builder.mutation<EndpointCommand, DispatchAgentUpdateArgs>({
      query: ({ deviceId, body }) => ({
        url: `/endpoint-admin/endpoint-devices/${encodeURIComponent(deviceId)}/agent-updates`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { deviceId }) => [
        { type: 'EndpointCommand' as const, id: `device-${deviceId}` },
        { type: 'EndpointAuditEvent' as const, id: `device-${deviceId}` },
      ],
    }),
    /**
     * AG-029 (BE-031) — create an agent-update release (status=DRAFT).
     *   gateway POST /api/v1/endpoint-admin/endpoint-agent-update-releases
     * This IS the trust-establishment surface: the body carries the trust
     * material (binaryUrl / sha256 / signerThumbprint / signingTier). The
     * backend creates it DRAFT; trust is sealed only at /approve.
     */
    createAgentUpdateRelease: builder.mutation<AgentUpdateRelease, CreateAgentUpdateReleaseArgs>({
      query: ({ body }) => ({
        url: '/endpoint-admin/endpoint-agent-update-releases',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'EndpointAgentUpdateRelease' as const, id: 'LIST' }],
    }),
    /**
     * AG-029 (BE-031) — approve a DRAFT release (DRAFT→APPROVED). Maker-checker:
     * the approver MUST differ from the creator (server-enforced; 403/409 on
     * self-approve). NO request body.
     */
    approveAgentUpdateRelease: builder.mutation<AgentUpdateRelease, ApproveAgentUpdateReleaseArgs>({
      query: ({ releaseId }) => ({
        url: `/endpoint-admin/endpoint-agent-update-releases/${encodeURIComponent(releaseId)}/approve`,
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'EndpointAgentUpdateRelease' as const, id: 'LIST' }],
    }),
    /**
     * AG-029 (BE-031) — revoke an APPROVED release (APPROVED→REVOKED).
     * Body is EXACTLY { revocationReason }.
     */
    revokeAgentUpdateRelease: builder.mutation<AgentUpdateRelease, RevokeAgentUpdateReleaseArgs>({
      query: ({ releaseId, body }) => ({
        url: `/endpoint-admin/endpoint-agent-update-releases/${encodeURIComponent(releaseId)}/revoke`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'EndpointAgentUpdateRelease' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAgentStatusQuery,
  useListEndpointDevicesQuery,
  useGetEndpointDeviceQuery,
  useListEndpointEnrollmentsQuery,
  useCreateEndpointEnrollmentMutation,
  useListEndpointAuditEventsQuery,
  useListDeviceCommandsQuery,
  useGetEndpointCommandQuery,
  useCreateDeviceCommandMutation,
  useGetDeviceComplianceQuery,
  useForceEvaluateDeviceComplianceMutation,
  useGetComplianceDeviceListQuery,
  useGetComplianceGapQuery,
  useGetDeviceComplianceEvaluationsQuery,
  useListCompliancePolicyItemsQuery,
  useGetCompliancePolicyItemQuery,
  useCreateCompliancePolicyItemMutation,
  useUpdateCompliancePolicyItemMutation,
  useDeleteCompliancePolicyItemMutation,
  useListCatalogItemsQuery,
  useGetCatalogItemQuery,
  useCreateCatalogItemMutation,
  useUpdateCatalogItemMutation,
  useGetInstallPreflightQuery,
  useCreateInstallMutation,
  useListInstallAuditsQuery,
  useGetInstallAuditQuery,
  // AG-028 Phase 3 — managed uninstall.
  useCreateUninstallMutation,
  useApproveUninstallMutation,
  useListUninstallRequestsQuery,
  useListUninstallAuditsQuery,
  useGetOutdatedSoftwareLatestQuery,
  useGetOutdatedSoftwareHistoryQuery,
  // AG-037 hotfix posture (WEB-014G).
  useGetHotfixPostureLatestQuery,
  useGetHotfixPostureHistoryQuery,
  useGetDiagnosticsLatestQuery,
  useGetServicesLatestQuery,
  useGetStartupExposureLatestQuery,
  useGetAppControlLatestQuery,
  useGetSoftwareInventoryDiffQuery,
  useGetOutdatedSoftwareDiffQuery,
  useGetProhibitedSoftwareQuery,
  useGetLatestSnapshotsQuery,
  // AG-029 signed self-update (BE-031 release list + BE-032 dispatch).
  useListAgentUpdateReleasesQuery,
  useDispatchAgentUpdateMutation,
  // AG-029 BE-031 release catalog management (slice 2).
  useCreateAgentUpdateReleaseMutation,
  useApproveAgentUpdateReleaseMutation,
  useRevokeAgentUpdateReleaseMutation,
} = endpointAdminApi;
