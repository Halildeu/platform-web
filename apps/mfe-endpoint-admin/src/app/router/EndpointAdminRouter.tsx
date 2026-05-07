import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EndpointStatusPage from '../../pages/status/EndpointStatusPage';
import EndpointDevicesPage from '../../pages/devices/EndpointDevicesPage';
import EndpointAuditPage from '../../pages/audit/EndpointAuditPage';

/**
 * Internal sub-router for the endpoint-admin MFE. The shell mounts the
 * remote at `/endpoint-admin/*`, so paths here are relative.
 *
 * FE-001 adds `/devices` + `/audit` (read-only). Enrollment, command,
 * maintenance-token surfaces land in FE-002+.
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
      <Route path="*" element={<Navigate to="devices" replace />} />
    </Routes>
  );
};

export default EndpointAdminRouter;
