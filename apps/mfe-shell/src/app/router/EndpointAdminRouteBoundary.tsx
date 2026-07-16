import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../guards/ProtectedRoute';

const REMOTE_VIEW_PATH = /^\/endpoint-admin\/remote-access\/sessions\/[^/]+\/view\/?$/;

export function isEndpointAdminRemoteViewPath(pathname: string): boolean {
  return REMOTE_VIEW_PATH.test(pathname);
}

interface EndpointAdminRouteBoundaryProps {
  children: React.ReactNode;
  enabled: boolean;
}

/**
 * Keeps the endpoint-admin splat mount intact for the remote MFE's descendant
 * router while selecting the narrowest shell authorization boundary per path.
 */
export const EndpointAdminRouteBoundary: React.FC<EndpointAdminRouteBoundaryProps> = ({
  children,
  enabled,
}) => {
  const { pathname } = useLocation();

  if (!enabled) return <Navigate to="/home" replace />;
  if (isEndpointAdminRemoteViewPath(pathname)) {
    return <ProtectedRoute requiredRole="remote-bridge-operator">{children}</ProtectedRoute>;
  }
  return <ProtectedRoute requiredModule="ENDPOINT_ADMIN">{children}</ProtectedRoute>;
};
