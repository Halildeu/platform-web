import React from 'react';
import {
  isKnownUninstallResultStatus,
  isKnownUninstallVerification,
  uninstallResultStatusTone,
  uninstallVerificationTone,
  type BadgeTone,
} from '../../../entities/endpoint-uninstall/types';
import { useEndpointAdminI18n } from '../../../i18n';

/**
 * AG-028 Phase 3 — exhaustive badge maps for every UninstallResultStatus
 * + UninstallVerification value (Codex 019e93a4 plan point #4).
 *
 * Tone → Tailwind class mapping. Uses the `bg-state-*-bg` convention
 * (the app-wide filled-pill token; `-subtle` is not in the @theme-inline
 * registry — see SoftwareCatalogTab note) so the pill actually renders.
 * The `muted` tone reuses the surface-muted/secondary pairing already
 * used by the install post-verification UNKNOWN badge.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-state-success-bg text-state-success-text border-state-success-border',
  warning: 'bg-state-warning-bg text-state-warning-text border-state-warning-border',
  danger: 'bg-state-danger-bg text-state-danger-text border-state-danger-border',
  muted: 'bg-surface-muted text-text-secondary border-border-default',
};

const PILL_BASE = 'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs';

export interface UninstallResultStatusBadgeProps {
  /** Raw wire value — may be an unknown/future enum code. */
  value: string;
  testIdPrefix?: string;
}

/**
 * Render a result-status badge. A KNOWN code resolves its i18n label +
 * semantic tone; an UNKNOWN/future code renders the raw code verbatim
 * with a neutral (muted) badge — never crashing render (Codex plan
 * point #4 unknown-enum fallback).
 */
export const UninstallResultStatusBadge: React.FC<UninstallResultStatusBadgeProps> = ({
  value,
  testIdPrefix = 'uninstall-result-status',
}) => {
  const { t } = useEndpointAdminI18n();
  const known = isKnownUninstallResultStatus(value);
  const tone = uninstallResultStatusTone(value);
  const label = known ? t(`endpointAdmin.drawer.uninstall.resultStatus.${value}`) : value;
  return (
    <span
      data-testid={`${testIdPrefix}-${value}`}
      data-known={known ? 'true' : 'false'}
      className={`${PILL_BASE} ${TONE_CLASSES[tone]}`}
      title={
        known
          ? t(`endpointAdmin.drawer.uninstall.resultStatus.${value}.aria`)
          : t('endpointAdmin.drawer.uninstall.resultStatus.unknown.aria')
      }
    >
      {label}
    </span>
  );
};

UninstallResultStatusBadge.displayName = 'UninstallResultStatusBadge';

export interface UninstallVerificationBadgeProps {
  value: string;
  testIdPrefix?: string;
}

/** Verification badge — same KNOWN/UNKNOWN fallback discipline. */
export const UninstallVerificationBadge: React.FC<UninstallVerificationBadgeProps> = ({
  value,
  testIdPrefix = 'uninstall-verification',
}) => {
  const { t } = useEndpointAdminI18n();
  const known = isKnownUninstallVerification(value);
  const tone = uninstallVerificationTone(value);
  const label = known ? t(`endpointAdmin.drawer.uninstall.verification.${value}`) : value;
  return (
    <span
      data-testid={`${testIdPrefix}-${value}`}
      data-known={known ? 'true' : 'false'}
      className={`${PILL_BASE} ${TONE_CLASSES[tone]}`}
      title={
        known
          ? t(`endpointAdmin.drawer.uninstall.verification.${value}.aria`)
          : t('endpointAdmin.drawer.uninstall.verification.unknown.aria')
      }
    >
      {label}
    </span>
  );
};

UninstallVerificationBadge.displayName = 'UninstallVerificationBadge';
