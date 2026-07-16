import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import { resolveEndpointAdminTo } from '../../app/layout/endpoint-admin-nav.config';
import {
  useGetComplianceDeviceListQuery,
  useGetComplianceGapQuery,
  useListAgentUpdateReleasesQuery,
  useListEndpointAuditEventsQuery,
  useListEndpointDevicesQuery,
  useListEndpointEnrollmentsQuery,
  useListSoftwareBundlesQuery,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type { EndpointAuditEvent } from '../../entities/endpoint-audit-event/types';
import type { ComplianceGapResponse } from '../../entities/endpoint-compliance-gap/types';
import type { EndpointDevice } from '../../entities/endpoint-device/types';
import type { EndpointEnrollment } from '../../entities/endpoint-enrollment/types';
import { summarizeDevices, summarizeEnrollments } from './overview-aggregation';

/**
 * Faz 22 product-surface slice S5 — endpoint-admin fleet Overview dashboard
 * (platform-web #922, Codex GO verdict). The mount's index route redirects here.
 *
 * SIX cards, each an INDEPENDENT state machine: every card owns its own RTK Query
 * subscription(s), so one card's 403/404/error surfaces locally and never blanks
 * a sibling. Cards 2 and 5 fan out to multiple sub-queries and render each metric
 * independently (one sub-query failing shows `—` for that metric only).
 *
 * Codex data-integrity rules baked in here (mirrors overview-aggregation.ts):
 *   - `data === undefined` is NEVER coerced to `0`. A skeleton (initial load) or
 *     an error (`—`) is shown until a SUCCESSFUL response arrives; only then is a
 *     real `0` rendered.
 *   - Server totals only for count KPIs. Cards 2/3/5 read the server's
 *     `totalElements` / `total`; they never count `array.length` /
 *     `page.content.length`. Cards 1/4 count the FULL plain (unpaginated) list via
 *     the pure `summarize*` helpers — semantically exact. Card 6 renders a list,
 *     never a total.
 *   - `isFetching && data` keeps the old value and shows a subtle "updating" note
 *     (stale-while-revalidate); `isLoading && !data` shows a fixed-height skeleton.
 */

type TranslateFn = (key: string) => string;

/**
 * The subset of an RTK Query hook result each card needs. RTK results carry more
 * fields (isSuccess, status, …) — width subtyping lets us pass them straight in.
 */
interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Numeric HTTP status if the RTK error is a FetchBaseQueryError, else undefined. */
function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/** 403 → forbidden, 404 → feature-not-enabled, everything else → generic. */
function messageForError(error: unknown, t: TranslateFn): string {
  const status = errorStatus(error);
  if (status === 403) return t('endpointAdmin.overview.state.forbidden');
  if (status === 404) return t('endpointAdmin.overview.state.notEnabled');
  return t('endpointAdmin.overview.state.error');
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/** A background refresh over already-rendered data (stale-while-revalidate). */
function isUpdating(query: { isFetching: boolean; data: unknown }): boolean {
  return query.isFetching && query.data !== undefined;
}

/* ------------------------------------------------------------------ */
/*  Styles (inline — the MFE convention; see EndpointComplianceGapPage) */
/* ------------------------------------------------------------------ */

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
  marginTop: 16,
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 172,
  padding: 16,
  border: '1px solid var(--border-color, #e2e2e2)',
  borderRadius: 8,
  background: 'var(--surface-default, #fff)',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
};

const cardTitleStyle: React.CSSProperties = { margin: 0, fontSize: 15 };

const updatingStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary, #6b7280)',
  fontWeight: 400,
};

const bigNumberStyle: React.CSSProperties = { fontSize: 30, fontWeight: 700, lineHeight: 1.1 };

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #6b7280)',
};

const subLineStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #6b7280)',
  marginTop: 4,
};

const figureRowStyle: React.CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' };

const figureStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

const figureValueStyle: React.CSSProperties = { fontSize: 18, fontWeight: 600, lineHeight: 1.2 };

const statRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 24,
};

const statLabelStyle: React.CSSProperties = { fontSize: 13 };

const statNumberStyle: React.CSSProperties = { fontSize: 18, fontWeight: 600 };

const inlineErrorStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--danger-color, #b42318)',
  fontSize: 12,
};

const errorBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: 'var(--danger-color, #b42318)',
  fontSize: 13,
};

const retryButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  fontSize: 12,
  padding: '2px 8px',
  cursor: 'pointer',
};

const retryLinkStyle: React.CSSProperties = {
  fontSize: 12,
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'inherit',
  textDecoration: 'underline',
  cursor: 'pointer',
};

const activityListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const activityRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: 12,
  borderBottom: '1px solid var(--border-color, #eee)',
  paddingBottom: 6,
};

/* ------------------------------------------------------------------ */
/*  Presentational primitives                                          */
/* ------------------------------------------------------------------ */

const SkeletonBlock: React.FC<{
  label: string;
  height?: number;
  width?: number | string;
  testId: string;
}> = ({ label, height = 56, width = '100%', testId }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label={label}
    data-testid={testId}
    style={{
      height,
      width,
      borderRadius: 4,
      background: 'var(--surface-muted, rgba(0, 0, 0, 0.06))',
    }}
  />
);

/** Full-width error state for a single-query card (cards 1/3/4/6). */
const ErrorBlock: React.FC<{
  error: unknown;
  t: TranslateFn;
  onRetry: () => void;
  testId: string;
}> = ({ error, t, onRetry, testId }) => (
  <div role="alert" data-testid={testId} style={errorBlockStyle}>
    <span style={bigNumberStyle} aria-hidden="true">
      —
    </span>
    <span>{messageForError(error, t)}</span>
    <button type="button" onClick={onRetry} style={retryButtonStyle}>
      {t('endpointAdmin.overview.state.retry')}
    </button>
  </div>
);

interface CardShellProps {
  title: string;
  headingId: string;
  testId: string;
  updating: boolean;
  t: TranslateFn;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const CardShell: React.FC<CardShellProps> = ({
  title,
  headingId,
  testId,
  updating,
  t,
  footer,
  children,
}) => (
  <section aria-labelledby={headingId} data-testid={testId} style={cardStyle}>
    <div style={cardHeaderStyle}>
      <h3 id={headingId} style={cardTitleStyle}>
        {title}
      </h3>
      {updating && (
        <span data-testid={`${testId}-updating`} aria-live="polite" style={updatingStyle}>
          {t('endpointAdmin.overview.state.updating')}
        </span>
      )}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    {footer}
  </section>
);

const Figure: React.FC<{
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  testId?: string;
}> = ({ label, value, emphasis, testId }) => (
  <div style={figureStyle}>
    <span style={emphasis ? bigNumberStyle : figureValueStyle} data-testid={testId}>
      {value}
    </span>
    <span style={metricLabelStyle}>{label}</span>
  </div>
);

/**
 * Body of a single-query card: skeleton (initial load) → error (`—` + retry) →
 * ready. `data === undefined` never renders a value, so a real `0` can only come
 * from a successful response.
 */
function renderQueryBody<T>(
  state: QueryState<T>,
  opts: { t: TranslateFn; testIdBase: string; skeletonHeight?: number },
  renderReady: (data: T) => React.ReactNode,
): React.ReactNode {
  const { t, testIdBase, skeletonHeight } = opts;
  if (state.data !== undefined) return renderReady(state.data);
  if (state.error && !state.isLoading) {
    return (
      <ErrorBlock
        error={state.error}
        t={t}
        onRetry={state.refetch}
        testId={`${testIdBase}-error`}
      />
    );
  }
  return (
    <SkeletonBlock
      height={skeletonHeight}
      label={t('endpointAdmin.overview.state.loading')}
      testId={`${testIdBase}-skeleton`}
    />
  );
}

/**
 * One server-total metric with its OWN state. Used by the fan-out cards (2 & 5):
 * a failing sub-query renders `—` + a retry affordance for that metric alone while
 * its siblings keep their values.
 */
const NumberStat: React.FC<{
  label: string;
  state: QueryState<{ totalElements: number }>;
  t: TranslateFn;
  testId: string;
}> = ({ label, state, t, testId }) => {
  let valueNode: React.ReactNode;
  if (state.data !== undefined) {
    valueNode = (
      <strong data-testid={`${testId}-value`} style={statNumberStyle}>
        {formatCount(state.data.totalElements)}
      </strong>
    );
  } else if (state.error && !state.isLoading) {
    valueNode = (
      <span role="alert" data-testid={`${testId}-error`} style={inlineErrorStyle}>
        <span style={statNumberStyle} aria-hidden="true">
          —
        </span>
        <span>{messageForError(state.error, t)}</span>
        <button type="button" onClick={state.refetch} style={retryLinkStyle}>
          {t('endpointAdmin.overview.state.retry')}
        </button>
      </span>
    );
  } else {
    valueNode = (
      <SkeletonBlock
        height={20}
        width={56}
        label={t('endpointAdmin.overview.state.loading')}
        testId={`${testId}-skeleton`}
      />
    );
  }
  return (
    <div style={statRowStyle} data-testid={testId}>
      <span style={statLabelStyle}>{label}</span>
      {valueNode}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  The six cards                                                       */
/* ------------------------------------------------------------------ */

/** Card 1 — Fleet status. Counts the FULL plain device list (exact). */
const FleetStatusCard: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const q = useListEndpointDevicesQuery();
  // RTK's union result type isn't structurally assignable to QueryState<T> as a
  // whole, but a per-property rebuild is — so each card normalizes here.
  const state: QueryState<EndpointDevice[]> = {
    data: q.data,
    error: q.error,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
  return (
    <CardShell
      testId="overview-card-fleet"
      title={t('endpointAdmin.overview.fleet.title')}
      headingId="overview-fleet-heading"
      updating={isUpdating(state)}
      t={t}
    >
      {renderQueryBody<EndpointDevice[]>(state, { t, testIdBase: 'overview-fleet' }, (devices) => {
        const summary = summarizeDevices(devices);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Figure
              label={t('endpointAdmin.overview.fleet.managedTotal')}
              value={formatCount(summary.managedTotal)}
              emphasis
              testId="overview-fleet-managed-total"
            />
            <div style={figureRowStyle}>
              <Figure
                label={t('endpointAdmin.overview.fleet.online')}
                value={formatCount(summary.online)}
                testId="overview-fleet-online"
              />
              <Figure
                label={t('endpointAdmin.overview.fleet.stale')}
                value={formatCount(summary.stale)}
                testId="overview-fleet-stale"
              />
              <Figure
                label={t('endpointAdmin.overview.fleet.offline')}
                value={formatCount(summary.offline)}
                testId="overview-fleet-offline"
              />
            </div>
            <div style={subLineStyle} data-testid="overview-fleet-secondary">
              {t('endpointAdmin.overview.fleet.pendingEnrollment')}:{' '}
              {formatCount(summary.pendingEnrollment)}
              {' · '}
              {t('endpointAdmin.overview.fleet.decommissioned')}:{' '}
              {formatCount(summary.decommissioned)}
            </div>
          </div>
        );
      })}
    </CardShell>
  );
};

/** Card 2 — Compliance risks. Three independent server-total sub-queries. */
const ComplianceRisksCard: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  // Three INDEPENDENT server-total sub-queries — one failing shows `—` for that
  // metric only. Each reads the server `totalElements` (size:1 = cheap count).
  const nc = useGetComplianceDeviceListQuery({ decision: 'NON_COMPLIANT', page: 0, size: 1 });
  const ua = useGetComplianceDeviceListQuery({ decision: 'UNAUTHORIZED', page: 0, size: 1 });
  const uk = useGetComplianceDeviceListQuery({ decision: 'UNKNOWN', page: 0, size: 1 });
  const nonCompliant: QueryState<{ totalElements: number }> = {
    data: nc.data,
    error: nc.error,
    isLoading: nc.isLoading,
    isFetching: nc.isFetching,
    refetch: nc.refetch,
  };
  const unauthorized: QueryState<{ totalElements: number }> = {
    data: ua.data,
    error: ua.error,
    isLoading: ua.isLoading,
    isFetching: ua.isFetching,
    refetch: ua.refetch,
  };
  const unknown: QueryState<{ totalElements: number }> = {
    data: uk.data,
    error: uk.error,
    isLoading: uk.isLoading,
    isFetching: uk.isFetching,
    refetch: uk.refetch,
  };
  const updating = isUpdating(nonCompliant) || isUpdating(unauthorized) || isUpdating(unknown);
  return (
    <CardShell
      testId="overview-card-compliance"
      title={t('endpointAdmin.overview.compliance.title')}
      headingId="overview-compliance-heading"
      updating={updating}
      t={t}
    >
      <NumberStat
        label={t('endpointAdmin.overview.compliance.nonCompliant')}
        state={nonCompliant}
        t={t}
        testId="overview-compliance-non-compliant"
      />
      <NumberStat
        label={t('endpointAdmin.overview.compliance.unauthorized')}
        state={unauthorized}
        t={t}
        testId="overview-compliance-unauthorized"
      />
      <NumberStat
        label={t('endpointAdmin.overview.compliance.unknown')}
        state={unknown}
        t={t}
        testId="overview-compliance-unknown"
      />
    </CardShell>
  );
};

/** Card 3 — Critical compliance gaps. Server `total` over OBSERVED devices only. */
const CriticalGapsCard: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const q = useGetComplianceGapQuery({
    gapTypes: ['pending_security_updates', 'rdp_enabled'],
    freshnessWindow: 'PT168H',
    page: 1,
    pageSize: 5,
  });
  const state: QueryState<ComplianceGapResponse> = {
    data: q.data,
    error: q.error,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
  return (
    <CardShell
      testId="overview-card-gaps"
      title={t('endpointAdmin.overview.gaps.title')}
      headingId="overview-gaps-heading"
      updating={isUpdating(state)}
      t={t}
    >
      {renderQueryBody<ComplianceGapResponse>(state, { t, testIdBase: 'overview-gaps' }, (data) => (
        <div>
          <div style={bigNumberStyle} data-testid="overview-gaps-total">
            {formatCount(data.total)}
          </div>
          <div style={metricLabelStyle}>{t('endpointAdmin.overview.gaps.metric')}</div>
          <div style={subLineStyle} data-testid="overview-gaps-freshness">
            {t('endpointAdmin.overview.gaps.freshness').replace(
              '{computedAt}',
              formatTimestamp(data.computedAt),
            )}
          </div>
          <div style={subLineStyle}>{t('endpointAdmin.overview.gaps.observedNote')}</div>
        </div>
      ))}
    </CardShell>
  );
};

/** Card 4 — Enrollment health. Counts the FULL plain enrollment list (exact). */
const EnrollmentHealthCard: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const q = useListEndpointEnrollmentsQuery();
  const state: QueryState<EndpointEnrollment[]> = {
    data: q.data,
    error: q.error,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
  return (
    <CardShell
      testId="overview-card-enrollment"
      title={t('endpointAdmin.overview.enrollment.title')}
      headingId="overview-enrollment-heading"
      updating={isUpdating(state)}
      t={t}
    >
      {renderQueryBody<EndpointEnrollment[]>(
        state,
        { t, testIdBase: 'overview-enrollment' },
        (enrollments) => {
          const summary = summarizeEnrollments(enrollments);
          return (
            <div style={figureRowStyle}>
              <Figure
                label={t('endpointAdmin.overview.enrollment.pending')}
                value={formatCount(summary.pending)}
                testId="overview-enrollment-pending"
              />
              <Figure
                label={t('endpointAdmin.overview.enrollment.expired')}
                value={formatCount(summary.expired)}
                testId="overview-enrollment-expired"
              />
              <Figure
                label={t('endpointAdmin.overview.enrollment.consumed')}
                value={formatCount(summary.consumed)}
                testId="overview-enrollment-consumed"
              />
            </div>
          );
        },
      )}
    </CardShell>
  );
};

/** Card 5 — Draft releases pending approval. Two server-total sub-queries. */
const DraftReleasesCard: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const au = useListAgentUpdateReleasesQuery({ status: 'DRAFT', page: 0, size: 1 });
  const sb = useListSoftwareBundlesQuery({ status: 'DRAFT', page: 0, size: 1 });
  const agentDrafts: QueryState<{ totalElements: number }> = {
    data: au.data,
    error: au.error,
    isLoading: au.isLoading,
    isFetching: au.isFetching,
    refetch: au.refetch,
  };
  const bundleDrafts: QueryState<{ totalElements: number }> = {
    data: sb.data,
    error: sb.error,
    isLoading: sb.isLoading,
    isFetching: sb.isFetching,
    refetch: sb.refetch,
  };
  const updating = isUpdating(agentDrafts) || isUpdating(bundleDrafts);

  // Combined total only when BOTH succeed — if one errored we must not imply a
  // fleet-complete number from a half-known pair.
  let combined: number | undefined;
  if (agentDrafts.data !== undefined && bundleDrafts.data !== undefined) {
    combined = agentDrafts.data.totalElements + bundleDrafts.data.totalElements;
  }

  return (
    <CardShell
      testId="overview-card-drafts"
      title={t('endpointAdmin.overview.drafts.title')}
      headingId="overview-drafts-heading"
      updating={updating}
      t={t}
    >
      {combined !== undefined && (
        <Figure
          label={t('endpointAdmin.overview.drafts.total')}
          value={formatCount(combined)}
          emphasis
          testId="overview-drafts-total"
        />
      )}
      <NumberStat
        label={t('endpointAdmin.overview.drafts.agentUpdates')}
        state={agentDrafts}
        t={t}
        testId="overview-drafts-agent-updates"
      />
      <NumberStat
        label={t('endpointAdmin.overview.drafts.softwareBundles')}
        state={bundleDrafts}
        t={t}
        testId="overview-drafts-software-bundles"
      />
    </CardShell>
  );
};

/** Card 6 — Recent activity. A LIST card (never a total-count KPI). */
const RecentActivityCard: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const { pathname } = useLocation();
  const q = useListEndpointAuditEventsQuery({ limit: 5 });
  const state: QueryState<EndpointAuditEvent[]> = {
    data: q.data,
    error: q.error,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
  return (
    <CardShell
      testId="overview-card-activity"
      title={t('endpointAdmin.overview.activity.title')}
      headingId="overview-activity-heading"
      updating={isUpdating(state)}
      t={t}
      footer={
        <Link
          to={resolveEndpointAdminTo(pathname, 'audit')}
          data-testid="overview-activity-viewall"
          style={{ fontSize: 13, marginTop: 'auto', paddingTop: 8 }}
        >
          {t('endpointAdmin.overview.activity.viewAll')}
        </Link>
      }
    >
      {renderQueryBody<EndpointAuditEvent[]>(
        state,
        { t, testIdBase: 'overview-activity', skeletonHeight: 96 },
        (events) => {
          if (events.length === 0) {
            return (
              <p data-testid="overview-activity-empty" style={metricLabelStyle}>
                {t('endpointAdmin.overview.activity.empty')}
              </p>
            );
          }
          return (
            <ul data-testid="overview-activity-list" style={activityListStyle}>
              {events.map((event: EndpointAuditEvent) => {
                const actor =
                  event.performedBySubject ??
                  (event.deviceId ? `${event.deviceId.slice(0, 8)}…` : null) ??
                  t('endpointAdmin.overview.activity.unknownActor');
                return (
                  <li
                    key={event.id}
                    style={activityRowStyle}
                    data-testid={`overview-activity-row-${event.id}`}
                  >
                    <span style={{ fontWeight: 600 }}>{event.action || event.eventType}</span>
                    <span style={metricLabelStyle}>
                      {formatTimestamp(event.occurredAt)} · {actor}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        },
      )}
    </CardShell>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export const EndpointOverviewPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  return (
    <div data-testid="endpoint-admin-overview-page" style={{ padding: 24 }}>
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: '0 0 4px 0' }}>{t('endpointAdmin.overview.title')}</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary, #6b7280)', fontSize: 14 }}>
          {t('endpointAdmin.overview.subtitle')}
        </p>
      </header>

      <div style={gridStyle}>
        <FleetStatusCard />
        <ComplianceRisksCard />
        <CriticalGapsCard />
        <EnrollmentHealthCard />
        <DraftReleasesCard />
        <RecentActivityCard />
      </div>
    </div>
  );
};

export default EndpointOverviewPage;
