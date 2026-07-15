import React from 'react';
import { ProtectedRoute } from '../guards/ProtectedRoute';
import { ATS_PRODUCT_ENTRY } from '../../features/ats-product-catalog/model/ats-capability-registry';
import InterviewEvidenceAvailabilityPage from '../../features/ats-product-catalog/ui/InterviewEvidenceAvailabilityPage';

export interface InterviewEvidenceRouteProps {
  remoteEnabled: boolean;
  remoteContent: React.ReactNode;
}

/**
 * Authorization and deployment readiness are intentionally separate:
 * ProtectedRoute always decides who may enter; the remote flag only decides
 * whether that authorized user receives the live MFE or the safe shell-owned
 * product surface.
 */
export const InterviewEvidenceRoute: React.FC<InterviewEvidenceRouteProps> = ({
  remoteEnabled,
  remoteContent,
}) => (
  <ProtectedRoute requiredModule={ATS_PRODUCT_ENTRY.requiredModule}>
    {remoteEnabled ? remoteContent : <InterviewEvidenceAvailabilityPage />}
  </ProtectedRoute>
);
