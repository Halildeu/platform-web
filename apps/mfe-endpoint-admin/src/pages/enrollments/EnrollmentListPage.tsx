import React from 'react';

import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import type {
  CreateEndpointEnrollmentResponse,
  EndpointEnrollment,
} from '../../entities/endpoint-enrollment/types';
import { useEndpointAdminI18n } from '../../i18n';
import { useManageGate } from '../compliance-policies/useManageGate';
import { CreateEnrollmentDialog } from '../../widgets/enrollment-dialog/CreateEnrollmentDialog';
import { EnrollmentTokenModal } from '../../widgets/enrollment-dialog/EnrollmentTokenModal';

/**
 * WEB-017 — Endpoint enrollment management page (Faz 22.5.x).
 *
 * Codex 019e711f plan-time PARTIAL AGREE absorb. Operator workflow:
 *
 * 1. Manager clicks "Yeni Enrollment Oluştur" → CreateEnrollmentDialog
 * 2. Submit → backend mints token (reveal-once) → EnrollmentTokenModal
 *    surfaces the raw token + a copy-paste-ready install snippet
 * 3. Operator hands the snippet to the target Windows host operator
 * 4. List refreshes on tag invalidation; the raw token is GONE from
 *    UI state once the modal closes.
 *
 * Backend gateway path: /api/v1/endpoint-admin/endpoint-enrollments
 * (NOT /api/v1/admin/... — gateway rewrites; Codex iter-1 must-fix #1).
 *
 * MANAGE gate: useManageGate (same permissive pattern as
 * compliance-policies until shell-services exposes a real
 * getModuleLevel('ENDPOINT_ADMIN') wiring — Codex iter-1 must-fix #3).
 * Backend @RequireModule(MANAGER) remains the security boundary.
 */
export interface EnrollmentListPageProps {
  /** Override for tests; production reads from window.__env__. */
  apiUrlOverride?: string;
}

/**
 * Resolve the API URL the install snippet hands to the operator.
 *
 * Codex 019e713c post-impl iter-1 P0 fix: previous fallback pointed at
 * `/api/v1/endpoint-admin` which is the admin (manager-facing) gateway
 * path. The HMAC enrollment client appends `/enrollments/consume` to
 * the configured base — so the agent would have hit
 * `/api/v1/endpoint-admin/enrollments/consume`, an admin route that
 * does not exist. The canonical V1 HMAC agent base is
 * `/api/v1/endpoint-agent` (see platform-agent
 * `internal/protocol/endpoints.go` + `internal/protocol/client.go`).
 *
 * Auto-enroll mTLS (Faz 22.3 ADR-0029) uses a separate base
 * (`endpoint-agent-mtls.testai.acik.com/api/v1/endpoint-admin`) and is
 * out of scope for this V1 reveal-once token flow.
 */
function resolveApiUrl(): string {
  if (typeof window !== 'undefined') {
    const env = (window as unknown as { __env__?: Record<string, unknown> }).__env__;
    if (env && typeof env['VITE_ENDPOINT_ADMIN_API_URL'] === 'string') {
      return env['VITE_ENDPOINT_ADMIN_API_URL'] as string;
    }
    if (window.location && window.location.origin) {
      return `${window.location.origin}/api/v1/endpoint-agent`;
    }
  }
  return 'https://testai.acik.com/api/v1/endpoint-agent';
}

const EnrollmentListPage: React.FC<EnrollmentListPageProps> = ({ apiUrlOverride }) => {
  const { t } = useEndpointAdminI18n();
  const canManage = useManageGate();
  const apiUrl = apiUrlOverride ?? resolveApiUrl();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [tokenResponse, setTokenResponse] = React.useState<CreateEndpointEnrollmentResponse | null>(
    null,
  );

  const { data, error, isLoading, isFetching } = endpointAdminApi.useListEndpointEnrollmentsQuery();

  const status404 =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status: unknown }).status === 404;
  const status403 =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status: unknown }).status === 403;

  return (
    <div data-testid="enrollment-list-page" style={{ padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>{t('endpointAdmin.enrollments.page.title')}</h1>
        <button
          type="button"
          data-testid="enrollment-list-page-create"
          onClick={() => setDialogOpen(true)}
          disabled={!canManage}
        >
          {t('endpointAdmin.enrollments.page.createButton')}
        </button>
      </header>

      <p>{t('endpointAdmin.enrollments.page.description')}</p>

      {isLoading && (
        <p data-testid="enrollment-list-loading">{t('endpointAdmin.enrollments.page.loading')}</p>
      )}

      {status403 && (
        <p data-testid="enrollment-list-forbidden">
          {t('endpointAdmin.enrollments.page.forbidden')}
        </p>
      )}

      {status404 && (
        <p data-testid="enrollment-list-not-deployed">
          {t('endpointAdmin.enrollments.page.notDeployed')}
        </p>
      )}

      {error && !status403 && !status404 && (
        <p data-testid="enrollment-list-error">{t('endpointAdmin.enrollments.page.error')}</p>
      )}

      {data && data.length === 0 && (
        <p data-testid="enrollment-list-empty">{t('endpointAdmin.enrollments.page.empty')}</p>
      )}

      {data && data.length > 0 && (
        <table data-testid="enrollment-list-table" style={{ width: '100%', marginTop: 16 }}>
          <thead>
            <tr>
              <th>{t('endpointAdmin.enrollments.table.id')}</th>
              <th>{t('endpointAdmin.enrollments.table.note')}</th>
              <th>{t('endpointAdmin.enrollments.table.status')}</th>
              <th>{t('endpointAdmin.enrollments.table.requestedBy')}</th>
              <th>{t('endpointAdmin.enrollments.table.expiresAt')}</th>
              <th>{t('endpointAdmin.enrollments.table.consumedAt')}</th>
              <th>{t('endpointAdmin.enrollments.table.deviceId')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: EndpointEnrollment) => (
              <tr key={row.id} data-testid={`enrollment-row-${row.id}`}>
                <td style={{ fontFamily: 'monospace' }}>{row.id.slice(0, 8)}…</td>
                <td>{row.note ?? '—'}</td>
                <td data-testid={`enrollment-row-status-${row.id}`}>{row.status}</td>
                <td>{row.requestedBySubject}</td>
                <td>{new Date(row.expiresAt).toLocaleString()}</td>
                <td>{row.consumedAt ? new Date(row.consumedAt).toLocaleString() : '—'}</td>
                <td style={{ fontFamily: 'monospace' }}>
                  {row.deviceId ? `${row.deviceId.slice(0, 8)}…` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isFetching && !isLoading && (
        <p data-testid="enrollment-list-refreshing" style={{ marginTop: 8, opacity: 0.6 }}>
          {t('endpointAdmin.enrollments.page.refreshing')}
        </p>
      )}

      <CreateEnrollmentDialog
        open={dialogOpen}
        canManage={canManage}
        onClose={() => setDialogOpen(false)}
        onCreated={(response) => {
          setDialogOpen(false);
          setTokenResponse(response);
        }}
      />

      <EnrollmentTokenModal
        response={tokenResponse}
        apiUrl={apiUrl}
        onClose={() => setTokenResponse(null)}
      />
    </div>
  );
};

export default EnrollmentListPage;
