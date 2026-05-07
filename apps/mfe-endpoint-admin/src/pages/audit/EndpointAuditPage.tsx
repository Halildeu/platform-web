import React, { useState } from 'react';
import { useListEndpointAuditEventsQuery } from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';

/**
 * Read-only audit-event surface — backed by
 * `AdminEndpointAuditController.listAuditEvents`.
 *
 * FE-001 scope: list all events (default limit=50) with optional
 * device-id filter input. Cross-link to a specific device drawer is
 * FE-002+.
 *
 * Auth: same `<ProtectedRoute requiredModule="ENDPOINT_ADMIN">` gate
 * as devices, plus backend OpenFGA `can_view` check.
 */

const formatTimestamp = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

export const EndpointAuditPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const [deviceFilter, setDeviceFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const { data, isLoading, isError, error, isFetching } = useListEndpointAuditEventsQuery({
    deviceId: deviceFilter.trim() || undefined,
    eventType: eventTypeFilter.trim() || undefined,
    limit: 50,
  });

  const renderTableContent = () => {
    if (isLoading) {
      return (
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.audit.loading')}
        </p>
      );
    }
    if (isError) {
      const status =
        error && 'status' in error ? String((error as { status: unknown }).status) : '';
      const isForbidden = status === '403';
      return (
        <p role="alert" aria-live="polite" style={{ marginTop: 12, color: 'var(--danger-color)' }}>
          {isForbidden ? t('endpointAdmin.audit.forbidden') : t('endpointAdmin.audit.error')}
          {status ? ` (HTTP ${status})` : null}
        </p>
      );
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return (
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.audit.empty')}
        </p>
      );
    }

    return (
      <div
        role="region"
        aria-label={t('endpointAdmin.audit.heading')}
        style={{ marginTop: 16, overflowX: 'auto' }}
      >
        <table
          data-testid="endpoint-admin-audit-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: 'left',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.audit.col.occurredAt')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.audit.col.eventType')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.audit.col.action')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.audit.col.deviceId')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.audit.col.commandId')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.audit.col.subject')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 12px' }}>{formatTimestamp(row.occurredAt)}</td>
                <td style={{ padding: '8px 12px' }}>{row.eventType}</td>
                <td style={{ padding: '8px 12px' }}>{row.action}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                  {row.deviceId ? row.deviceId.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                  {row.commandId ? row.commandId.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                  {row.performedBySubject ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section style={{ padding: 24 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        {t('endpointAdmin.audit.heading')}
      </h2>
      <p style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
        {t('endpointAdmin.audit.subtitle')}
        {isFetching && !isLoading ? ` · ${t('endpointAdmin.audit.refreshing')}` : null}
      </p>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {t('endpointAdmin.audit.filter.deviceId')}
          </span>
          <input
            type="text"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            placeholder="uuid"
            data-testid="endpoint-admin-audit-filter-device"
            style={{
              marginTop: 4,
              padding: '6px 10px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              minWidth: 280,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {t('endpointAdmin.audit.filter.eventType')}
          </span>
          <input
            type="text"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            data-testid="endpoint-admin-audit-filter-event-type"
            style={{
              marginTop: 4,
              padding: '6px 10px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              minWidth: 200,
              fontSize: 12,
            }}
          />
        </label>
      </div>

      {renderTableContent()}
    </section>
  );
};

export default EndpointAuditPage;
