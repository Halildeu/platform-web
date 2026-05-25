import React from 'react';
import { useListEndpointAuditEventsQuery } from '../../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../../i18n';

export interface AuditTabProps {
  deviceId: string;
  active: boolean;
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export const AuditTab: React.FC<AuditTabProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const { data, isLoading, isError, error } = useListEndpointAuditEventsQuery(
    { deviceId, limit: 50 },
    { skip: !active || !deviceId },
  );

  if (!active) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="px-6 py-4 text-sm text-text-secondary" aria-busy="true">
        {t('endpointAdmin.audit.loading')}
      </div>
    );
  }

  if (isError) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? String((error as { status: unknown }).status)
        : '';
    const isForbidden = status === '403';
    return (
      <div role="alert" className="px-6 py-4 text-sm text-danger">
        {isForbidden ? t('endpointAdmin.audit.forbidden') : t('endpointAdmin.audit.error')}
      </div>
    );
  }

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <div className="px-6 py-4 text-sm text-text-secondary" data-testid="audit-tab-empty">
        {t('endpointAdmin.drawer.audit.empty')}
      </div>
    );
  }

  return (
    <ol className="px-6 py-4 space-y-2" data-testid="audit-tab-timeline">
      {events.map((event) => (
        <li
          key={event.id}
          className="border-l-2 border-border-default pl-3 py-1"
          data-testid={`audit-event-${event.id}`}
        >
          <div className="flex items-baseline gap-2 text-xs text-text-secondary">
            <time>{formatTimestamp(event.occurredAt)}</time>
            <span className="font-mono">{event.eventType}</span>
          </div>
          <div className="text-sm text-text-primary">{event.action}</div>
          {(event.performedBySubject || event.commandId) && (
            <div className="text-xs text-text-secondary mt-0.5 font-mono">
              {event.performedBySubject ?? '—'}
              {event.commandId ? ` · cmd:${event.commandId.slice(0, 8)}…` : ''}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
};

AuditTab.displayName = 'AuditTab';
