import React from 'react';

import { useEndpointAdminI18n } from '../../i18n';
import { RETRYABLE_KINDS, type CapabilityStateKind } from './classify';

/**
 * Presentation for a {@link CapabilityStateKind} (platform-web #922 S4a). It
 * renders copy for a kind and NEVER inspects a raw RTK/API error — all HTTP/API
 * interpretation lives in {@link classifyCapabilityError}. Copy is overridable so
 * a module-level 403 and a resource-level 403 need not be forced into one
 * sentence, and it shows NO raw backend error body/stack (status/reason belong in
 * telemetry, not the UI).
 *
 * A retry CTA is offered ONLY for retryable kinds (`error`,
 * `temporarilyUnavailable`) and only when `onRetry` is supplied — retrying a
 * `forbidden`/`notEnabled`/`disabled` surface cannot change the outcome.
 */
interface CapabilityStateProps {
  kind: CapabilityStateKind;
  /** Overrides the default title copy for this kind. */
  title?: string;
  /** Overrides the default description copy for this kind. */
  description?: string;
  /** Retry handler — rendered only for retryable kinds. */
  onRetry?: () => void;
  /** Root `data-testid` (child parts get `-title` / `-retry` suffixes). */
  testId?: string;
}

/** Error-ish kinds get an assertive `alert`; informational kinds a polite `status`. */
const ALERT_KINDS: ReadonlySet<CapabilityStateKind> = new Set<CapabilityStateKind>([
  'error',
  'temporarilyUnavailable',
]);

const containerStyle: React.CSSProperties = {
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxWidth: 720,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
};

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontSize: 13,
};

const errorTitleStyle: React.CSSProperties = {
  ...titleStyle,
  color: 'var(--danger-color)',
};

const retryButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: 4,
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--link-color, #2563eb)',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 13,
};

export const CapabilityState: React.FC<CapabilityStateProps> = ({
  kind,
  title,
  description,
  onRetry,
  testId,
}) => {
  const { t } = useEndpointAdminI18n();
  const resolvedTitle = title ?? t(`endpointAdmin.capabilityState.${kind}.title`);
  const resolvedDescription = description ?? t(`endpointAdmin.capabilityState.${kind}.description`);
  const isAlert = ALERT_KINDS.has(kind);
  const showRetry = onRetry !== undefined && RETRYABLE_KINDS.has(kind);

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live="polite"
      data-testid={testId}
      data-capability-kind={kind}
      style={containerStyle}
    >
      <h3
        style={isAlert ? errorTitleStyle : titleStyle}
        data-testid={testId ? `${testId}-title` : undefined}
      >
        {resolvedTitle}
      </h3>
      <p style={descriptionStyle}>{resolvedDescription}</p>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={retryButtonStyle}
          data-testid={testId ? `${testId}-retry` : undefined}
        >
          {t('endpointAdmin.capabilityState.retry')}
        </button>
      )}
    </div>
  );
};

export default CapabilityState;
