import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EndpointStatusPage from '../../pages/status/EndpointStatusPage';
import EndpointDevicesPage from '../../pages/devices/EndpointDevicesPage';
import EndpointAuditPage from '../../pages/audit/EndpointAuditPage';
import EndpointCompliancePage from '../../pages/compliance/EndpointCompliancePage';
import EndpointCompliancePoliciesPage from '../../pages/compliance-policies/EndpointCompliancePoliciesPage';
import ApprovalInboxPage from '../../pages/approval/ApprovalInboxPage';
import ApprovalCasePage from '../../pages/approval/ApprovalCasePage';
import ApprovalProposeForm from '../../pages/approval/ApprovalProposeForm';

/**
 * Internal sub-router for the endpoint-admin MFE. The shell mounts the
 * remote at `/endpoint-admin/*`, so paths here are relative.
 *
 * FE-001 adds `/devices` + `/audit` (read-only). Enrollment, command,
 * maintenance-token surfaces land in FE-002+.
 *
 * WEB-014B adds `/compliance` (cross-device compliance list). The route
 * is intentionally a peer of `/devices` rather than a tab nested under
 * it because operators reach the compliance surface to spot
 * NON_COMPLIANT / UNAUTHORIZED devices across the fleet — clicking a
 * row still opens the same `DeviceDetailDrawer` with the Compliance
 * tab pre-selected (`initialTab="compliance"`).
 *
 * WEB-014C adds `/compliance/policies` (policy CRUD surface).
 *
 * PR-4 (wave_12_approval_foundation) adds `/approvals`, `/approvals/:requestId`,
 * and `/policies/:policyId/approval/new` for the policy-change approval pilot
 * — global maintainer routes peer of `/devices`, plus per-policy proposer form.
 *
 * Default landing redirects to `/devices` because operators reach this
 * module to inspect endpoint state; status is a diagnostic surface and
 * stays addressable directly.
 */
export const EndpointAdminRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="status" element={<EndpointStatusPage />} />
      <Route path="devices" element={<EndpointDevicesPage />} />
      <Route path="audit" element={<EndpointAuditPage />} />
      <Route path="compliance" element={<EndpointCompliancePage />} />
      <Route path="compliance/policies" element={<EndpointCompliancePoliciesPage />} />
      <Route path="approvals" element={<ApprovalInboxPage />} />
      <Route path="approvals/:requestId" element={<ApprovalCasePage />} />
      <Route path="policies/:policyId/approval/new" element={<ApprovalProposeForm />} />
      <Route path="*" element={<Navigate to="devices" replace />} />
    </Routes>
  );
};

export default EndpointAdminRouter;
