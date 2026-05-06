import React from 'react';
import { useEndpointAdminI18n } from '../../i18n';

/**
 * Forbidden state — rendered when the user is authenticated but lacks
 * the `ENDPOINT_ADMIN` module from `/v1/authz/me` OR the live API
 * surface returns `403 JSON` from the OpenFGA `RequireModule` interceptor.
 *
 * Design intent (per refresh report §5): kibar mesaj, no leakage of
 * authz internals (no role names, no module IDs in user-facing copy).
 */
export const ForbiddenPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  return (
    <div role="alert" aria-live="polite" style={{ padding: 32, maxWidth: 720 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
        {t('endpointAdmin.forbidden.title')}
      </h2>
      <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
        {t('endpointAdmin.forbidden.description')}
      </p>
    </div>
  );
};

export default ForbiddenPage;
