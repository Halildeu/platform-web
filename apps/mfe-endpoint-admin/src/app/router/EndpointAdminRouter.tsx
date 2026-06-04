import React, { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

/**
 * Internal sub-router for the endpoint-admin MFE. The shell mounts the
 * remote at `/endpoint-admin/*`, so paths here are relative.
 *
 * FE-001 adds `/devices` + `/audit` (read-only). Enrollment, command,
 * maintenance-token surfaces land in FE-002+.
 *
 * WEB-014B adds `/compliance` (cross-device compliance list).
 *
 * WEB-014C adds `/compliance/policies` (policy CRUD surface).
 *
 * PR-4 (wave_12_approval_foundation) adds `/approvals`, `/approvals/:requestId`,
 * and `/policies/:policyId/approval/new` for the policy-change approval pilot.
 *
 * WEB-014D perf follow-up (Codex 019e707e iter-2 PARTIAL absorb):
 * route components are loaded via `React.lazy`. The previous eager
 * imports pulled every page (status, audit, compliance, approvals, ...)
 * into the `/endpoint-admin/devices` cold graph along with their
 * transitive design-system + ECharts dependencies. With per-route lazy
 * splits, navigating to `/devices` only downloads the devices page
 * chunk (plus its AG Grid pre-requisite via the `Promise.all` wrapper
 * below — see EndpointAdminApp.ui.tsx for the removed eager setup
 * import).
 *
 * The grid pre-requisite is encoded ONLY in `EndpointDevicesPage` because
 * none of the other routes currently render an AG Grid surface. Future
 * grid-using routes must mirror the same `Promise.all([setup, page])`
 * wrapper so the setup runs before the page's first render.
 */
const EndpointStatusPage = React.lazy(() => import('../../pages/status/EndpointStatusPage'));
const EndpointDevicesPage = React.lazy(async () => {
  const [, mod] = await Promise.all([
    import('@mfe/design-system/advanced/data-grid/setup'),
    import('../../pages/devices/EndpointDevicesPage'),
  ]);
  return mod;
});
const EndpointAuditPage = React.lazy(() => import('../../pages/audit/EndpointAuditPage'));
const EndpointCompliancePage = React.lazy(
  () => import('../../pages/compliance/EndpointCompliancePage'),
);
const EndpointCompliancePoliciesPage = React.lazy(
  () => import('../../pages/compliance-policies/EndpointCompliancePoliciesPage'),
);
// Faz 22.7 D3 — Compliance Gap Mart explorer lazy route.
const EndpointComplianceGapPage = React.lazy(
  () => import('../../pages/compliance-gap/EndpointComplianceGapPage'),
);
const ApprovalInboxPage = React.lazy(() => import('../../pages/approval/ApprovalInboxPage'));
const ApprovalCasePage = React.lazy(() => import('../../pages/approval/ApprovalCasePage'));
const ApprovalProposeForm = React.lazy(() => import('../../pages/approval/ApprovalProposeForm'));
// AG-028 Phase 3 — device-scoped, approve-only managed-uninstall approval
// page (reached from the device drawer's open-request deep-link).
const UninstallApprovalPage = React.lazy(
  () => import('../../pages/approval/UninstallApprovalPage'),
);
// WEB-017 — Endpoint enrollment management lazy route.
const EnrollmentListPage = React.lazy(() => import('../../pages/enrollments/EnrollmentListPage'));
// Path C3 — Endpoint catalog item authoring lazy route.
const EndpointCatalogItemsPage = React.lazy(
  () => import('../../pages/catalog-items/EndpointCatalogItemsPage'),
);

const RouteFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    style={{ padding: 24, color: 'var(--text-secondary)' }}
    data-testid="endpoint-admin-route-fallback"
  >
    Yükleniyor…
  </div>
);

export const EndpointAdminRouter: React.FC = () => {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="status" element={<EndpointStatusPage />} />
        <Route path="devices" element={<EndpointDevicesPage />} />
        <Route path="audit" element={<EndpointAuditPage />} />
        <Route path="compliance" element={<EndpointCompliancePage />} />
        <Route path="compliance/policies" element={<EndpointCompliancePoliciesPage />} />
        <Route path="compliance/gaps" element={<EndpointComplianceGapPage />} />
        <Route path="approvals" element={<ApprovalInboxPage />} />
        {/* AG-028 Phase 3 — device-scoped uninstall approval (more
            specific than `approvals/:requestId`, so declared first). */}
        <Route
          path="approvals/uninstall/:deviceId/:requestId"
          element={<UninstallApprovalPage />}
        />
        <Route path="approvals/:requestId" element={<ApprovalCasePage />} />
        <Route path="policies/:policyId/approval/new" element={<ApprovalProposeForm />} />
        <Route path="enrollments" element={<EnrollmentListPage />} />
        <Route path="catalog/items" element={<EndpointCatalogItemsPage />} />
        <Route path="*" element={<Navigate to="devices" replace />} />
      </Routes>
    </Suspense>
  );
};

export default EndpointAdminRouter;
