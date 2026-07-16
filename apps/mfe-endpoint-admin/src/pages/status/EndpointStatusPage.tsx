import React from 'react';
import { useGetAgentStatusQuery } from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import {
  CapabilityState,
  classifyCapabilityError,
  FLEET_CAPABILITY_POLICY,
} from '../../widgets/capability-state';

/**
 * Live status surface — backed by the only public-facing endpoint that
 * does NOT require a module/Zanzibar grant: `GET /api/v1/endpoint-agents/status`.
 *
 * Per the refresh report (Yol 1, FE-000): this is the single live data
 * binding shipped in the skeleton PR. It validates JWT plumbing,
 * shared-http auth resolution, and shell mount without depending on the
 * admin endpoint deploy state.
 */
export const EndpointStatusPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const { data, isLoading, isError, error, refetch } = useGetAgentStatusQuery();

  if (isLoading) {
    return (
      <section aria-busy="true" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {t('endpointAdmin.status.heading')}
        </h2>
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.status.loading')}
        </p>
      </section>
    );
  }

  if (isError) {
    return (
      <CapabilityState
        kind={classifyCapabilityError(error, FLEET_CAPABILITY_POLICY)}
        onRetry={refetch}
        testId="endpoint-status-state"
      />
    );
  }

  if (!data) return null;

  return (
    <section style={{ padding: 24 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        {t('endpointAdmin.status.heading')}
      </h2>
      <dl
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, max-content) 1fr',
          rowGap: 8,
          columnGap: 24,
        }}
      >
        <dt style={{ color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.status.field.service')}
        </dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{data.service}</dd>

        <dt style={{ color: 'var(--text-secondary)' }}>{t('endpointAdmin.status.field.status')}</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{data.status}</dd>

        <dt style={{ color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.status.field.apiVersion')}
        </dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{data.apiVersion}</dd>

        <dt style={{ color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.status.field.deviceCredentialProvider')}
        </dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{data.deviceCredentialProvider}</dd>

        <dt style={{ color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.status.field.timestamp')}
        </dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{data.timestamp}</dd>
      </dl>
    </section>
  );
};

export default EndpointStatusPage;
