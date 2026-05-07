import React, { useMemo } from 'react';
import { AuditEvent } from '../types/audit-event';
import JsonPreview from './JsonPreview';
import { DetailDrawer, type DetailDrawerSection } from '@mfe/design-system';

/*
 * `tabs` / `extra` / `DetailTab` were never part of @mfe/design-system
 * `DetailDrawer` — the previous shape compiled only because tests
 * mocked the component with a fake contract that accepted them. In
 * production those props were silently dropped, which left the
 * selected-event drawer body empty and made the JsonPreview overflow
 * fix unreachable. Codex iter-1 review (2026-05-07, thread
 * 019e0317-e2a7-7ec3-aa39-bf87d023c13d) called this out as a merge
 * blocker for PR #292; refactoring to the supported `sections`
 * contract here keeps the mobile overflow guard meaningful and
 * removes the regression class entirely (cf. spawn-task chip from
 * the same review thread, now superseded).
 *
 * Net UX delta: the previous tabbed UI silently rendered nothing in
 * production. The new section-stacked layout renders Summary →
 * Diff (when present) → Raw JSON top-to-bottom inside the existing
 * drawer panel. The `onTabChange` telemetry hook is preserved as a
 * `onSectionViewed` style callback for backward-compatible analytics.
 */

export type AuditDetailDrawerSectionKey = 'summary' | 'diff' | 'raw';

export type AuditDetailDrawerProps = {
  event?: AuditEvent | null;
  open: boolean;
  onClose: () => void;
  /**
   * Fired once per render with the keys of the sections shown — kept
   * for telemetry parity with the previous tabbed contract. Receives
   * the section keys in render order plus the active event so
   * downstream listeners (`AuditEventFeed.handleDrawerTabChange`) can
   * continue tagging telemetry without a payload-shape change.
   */
  onTabChange?: (section: AuditDetailDrawerSectionKey, event?: AuditEvent | null) => void;
};

export const AuditDetailDrawer: React.FC<AuditDetailDrawerProps> = ({
  event,
  open,
  onClose,
  onTabChange,
}) => {
  const diffPayload = useMemo(() => {
    if (!event) {
      return null;
    }
    if (!event.before && !event.after) {
      return null;
    }
    return {
      before: event.before ?? {},
      after: event.after ?? {},
    };
  }, [event]);

  const sections = useMemo<DetailDrawerSection[]>(() => {
    if (!event) {
      return [];
    }
    const items: DetailDrawerSection[] = [
      {
        key: 'summary',
        title: 'Summary',
        content: (
          <div
            data-testid="audit-detail-summary"
            data-section-key="summary"
            className="flex flex-col gap-4 text-sm"
          >
            <dl className="grid gap-3">
              <div>
                <dt className="text-xs uppercase text-text-subtle">Timestamp</dt>
                <dd className="font-medium text-text-primary">
                  {new Date(event.timestamp).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-subtle">User</dt>
                <dd className="text-text-secondary">{event.userEmail}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-subtle">Service</dt>
                <dd className="text-text-secondary">{event.service}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-subtle">Level</dt>
                <dd className="text-text-secondary">{event.level}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-subtle">Correlation ID</dt>
                <dd className="text-text-secondary">{event.correlationId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-subtle">Details</dt>
                <dd className="text-text-secondary">{event.details ?? '—'}</dd>
              </div>
            </dl>
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Metadata</h4>
                <JsonPreview data={event.metadata} />
              </div>
            )}
          </div>
        ),
      },
    ];

    if (diffPayload) {
      items.push({
        key: 'diff',
        title: 'Diff',
        content: (
          <div
            data-testid="audit-detail-diff"
            data-section-key="diff"
            className="flex flex-col gap-4"
          >
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Before</h4>
              <JsonPreview data={diffPayload.before} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">After</h4>
              <JsonPreview data={diffPayload.after} />
            </div>
          </div>
        ),
      });
    }

    items.push({
      key: 'raw',
      title: 'Raw JSON',
      content: (
        <div data-testid="audit-detail-raw" data-section-key="raw">
          <JsonPreview data={event} />
        </div>
      ),
    });

    return items;
  }, [event, diffPayload]);

  // Telemetry parity with the old tab API: emit one "section viewed"
  // signal per section currently rendered. The host component
  // `AuditEventFeed` already routes these to `fe.audit.drawer_tab`,
  // so its analytics dashboard keeps working without payload changes.
  React.useEffect(() => {
    if (!event || !onTabChange || !open) return;
    for (const section of sections) {
      onTabChange(section.key as AuditDetailDrawerSectionKey, event);
    }
  }, [event, onTabChange, open, sections]);

  if (!event) {
    return (
      // `width={420}` was previously passed but DetailDrawer doesn't
      // accept a numeric width prop — it was silently dropped by the
      // type system and the default `size="lg"` (max-w-2xl, ~672px)
      // applied. Removing the prop keeps the same visual width on
      // desktop while letting `w-full` (DetailDrawer panel base
      // class) collapse to viewport width on mobile.
      <DetailDrawer open={open} onClose={onClose} title="Audit Event">
        <p className="text-sm text-text-subtle">Henüz bir kayıt seçilmedi.</p>
      </DetailDrawer>
    );
  }

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="Audit Event"
      subtitle={event.action}
      sections={sections}
    />
  );
};
