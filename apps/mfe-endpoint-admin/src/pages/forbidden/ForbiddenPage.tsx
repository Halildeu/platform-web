import React from 'react';

import { CapabilityState } from '../../widgets/capability-state';

/**
 * Route-level forbidden surface — rendered when the user is authenticated but
 * lacks the `ENDPOINT_ADMIN` module (`/v1/authz/me` miss) OR the live API returns
 * a `403` from the OpenFGA `RequireModule` interceptor.
 *
 * A thin wrapper over the shared {@link CapabilityState} so there is ONE forbidden
 * design + copy across the MFE (no leakage of authz internals — no role names /
 * module IDs in user-facing copy).
 */
export const ForbiddenPage: React.FC = () => (
  <CapabilityState kind="forbidden" testId="endpoint-admin-forbidden" />
);

export default ForbiddenPage;
