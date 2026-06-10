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
 * Codex 019e713c iter-2 P0 hardening: the env-override branch was
 * dropped entirely. The HMAC enrollment contract is fully determined
 * by the deploy topology — same gateway as the browser sees — so we
 * derive `${window.location.origin}/api/v1/endpoint-agent` and call
 * it canonical. An env knob just added a way to point the snippet at
 * `/api/v1/endpoint-admin` (the admin manager-facing base, which the
 * HMAC client would extend to `/enrollments/consume` on a route that
 * does not exist).
 *
 * Auto-enroll mTLS (Faz 22.3 ADR-0029) uses a separate base
 * (`endpoint-agent-mtls.testai.acik.com/api/v1/endpoint-admin`) and is
 * out of scope for this V1 reveal-once token flow.
 *
 * Code paths needing a non-window environment fallback (SSR, tests
 * without a window) get the absolute testai URL hard-coded — the
 * value is operator-facing display text, not a runtime client call,
 * so a missing window cannot mislead a live agent.
 */
function resolveApiUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/api/v1/endpoint-agent`;
  }
  return 'https://testai.acik.com/api/v1/endpoint-agent';
}

/**
 * Public base for the artifact host (gitops#1434). Mirrors {@link resolveApiUrl}:
 * derived from `window.location.origin` so the modal's release-manifest discovery
 * fetch is SAME-ORIGIN (the artifact host sits behind the same edge at
 * `/artifacts/...`). No env knob, no per-release edit — the `/current/` alias the
 * host serves is what re-points across releases.
 */
function resolveArtifactBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/artifacts`;
  }
  return 'https://testai.acik.com/artifacts';
}

const EnrollmentListPage: React.FC<EnrollmentListPageProps> = ({ apiUrlOverride }) => {
  const { t } = useEndpointAdminI18n();
  const canManage = useManageGate();
  const apiUrl = apiUrlOverride ?? resolveApiUrl();
  const artifactBaseUrl = resolveArtifactBaseUrl();

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
        artifactBaseUrl={artifactBaseUrl}
        onClose={() => setTokenResponse(null)}
      />
    </div>
  );
};

export default EnrollmentListPage;
