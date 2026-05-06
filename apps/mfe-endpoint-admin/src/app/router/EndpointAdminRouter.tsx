import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EndpointStatusPage from '../../pages/status/EndpointStatusPage';

/**
 * Internal sub-router for the endpoint-admin MFE. The shell mounts the
 * remote at `/endpoint-admin/*`, so paths here are relative.
 *
 * FE-000 ships only `/status`. Devices, audit, enrollment, command and
 * maintenance-token surfaces will land in FE-001+ and slot in here.
 */
export const EndpointAdminRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="status" element={<EndpointStatusPage />} />
      <Route path="*" element={<Navigate to="status" replace />} />
    </Routes>
  );
};

export default EndpointAdminRouter;
