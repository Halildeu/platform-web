import React from 'react';
import type { DeliveryFailureCategory, DeliveryLogStatus } from '../types/delivery-log';

/**
 * Faz 23.4 M6b — DLR status visualization.
 *
 * Codex thread `019e4925` AGREE: color pill + icon + plain text +
 * aria-label. Color cannot be the only signal (accessibility); icon
 * disambiguates for color-blind users and screen readers receive
 * an explicit Turkish label via aria-label.
 *
 * Status → palette mapping (subset of canonical backend enum; expand
 * only when new wire values land):
 *  - DELIVERED:                yeşil success ("Teslim edildi")
 *  - ACCEPTED:                 mavi clock     ("Sağlayıcı kabul etti")
 *  - PENDING:                  nötr clock     ("Bekliyor")
 *  - RETRY:                    amber refresh  ("Tekrar denenecek")
 *  - FAILED:                   kırmızı warning ("Başarısız")
 *  - BOUNCED:                  kırmızı warning ("Geri döndü")
 *  - BLOCKED_BY_PREFERENCE:    gri shield     ("Tercih politikası nedeniyle")
 *  - BLOCKED_BY_AUTHZ:         gri shield     ("Yetki politikası nedeniyle")
 *  - BLOCKED_BY_IDEMPOTENCY:   gri shield     ("Tekrar gönderim engellendi")
 *  - BLOCKED_EXTERNAL_NOT_ALLOWED: gri shield ("Dış alıcıya izin yok")
 */

type StatusVisuals = {
  bg: string;
  fg: string;
  border: string;
  icon: string;
  label: string;
};

const STATUS_VISUALS: Record<DeliveryLogStatus, StatusVisuals> = {
  DELIVERED: {
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: 'rgb(21, 128, 61)',
    border: 'rgba(34, 197, 94, 0.4)',
    icon: '✓',
    label: 'Teslim edildi',
  },
  ACCEPTED: {
    bg: 'rgba(59, 130, 246, 0.12)',
    fg: 'rgb(29, 78, 216)',
    border: 'rgba(59, 130, 246, 0.4)',
    icon: '◷',
    label: 'Sağlayıcı kabul etti',
  },
  PENDING: {
    bg: 'rgba(148, 163, 184, 0.18)',
    fg: 'rgb(71, 85, 105)',
    border: 'rgba(148, 163, 184, 0.5)',
    icon: '◔',
    label: 'Bekliyor',
  },
  RETRY: {
    bg: 'rgba(245, 158, 11, 0.14)',
    fg: 'rgb(180, 83, 9)',
    border: 'rgba(245, 158, 11, 0.45)',
    icon: '↻',
    label: 'Tekrar denenecek',
  },
  FAILED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: 'rgb(185, 28, 28)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '⚠',
    label: 'Başarısız',
  },
  BOUNCED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: 'rgb(185, 28, 28)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '⤴',
    label: 'Geri döndü',
  },
  BLOCKED_BY_PREFERENCE: {
    bg: 'rgba(148, 163, 184, 0.18)',
    fg: 'rgb(51, 65, 85)',
    border: 'rgba(148, 163, 184, 0.5)',
    icon: '⛔',
    label: 'Tercih politikası nedeniyle',
  },
  BLOCKED_BY_AUTHZ: {
    bg: 'rgba(148, 163, 184, 0.18)',
    fg: 'rgb(51, 65, 85)',
    border: 'rgba(148, 163, 184, 0.5)',
    icon: '⛔',
    label: 'Yetki politikası nedeniyle',
  },
  BLOCKED_BY_IDEMPOTENCY: {
    bg: 'rgba(148, 163, 184, 0.18)',
    fg: 'rgb(51, 65, 85)',
    border: 'rgba(148, 163, 184, 0.5)',
    icon: '⛔',
    label: 'Tekrar gönderim engellendi',
  },
  BLOCKED_EXTERNAL_NOT_ALLOWED: {
    bg: 'rgba(148, 163, 184, 0.18)',
    fg: 'rgb(51, 65, 85)',
    border: 'rgba(148, 163, 184, 0.5)',
    icon: '⛔',
    label: 'Dış alıcıya izin yok',
  },
};

const FAILURE_CATEGORY_LABEL: Record<DeliveryFailureCategory, string> = {
  PROVIDER_QUOTA: 'Sağlayıcı kotası aşıldı',
  RECIPIENT_REJECTED: 'Alıcı reddetti',
  RECIPIENT_BLOCKED: 'Alıcı bloklu',
  INVALID_TARGET: 'Geçersiz hedef',
  TRANSIENT_NETWORK: 'Geçici ağ hatası',
  AUTH_FAILURE: 'Sağlayıcı kimlik hatası',
  UNKNOWN: 'Bilinmeyen',
};

export interface DeliveryStatusPillProps {
  status: DeliveryLogStatus;
  /**
   * Optional terminal timestamp for tooltip (delivered_at /
   * permanent_failure_at / next_retry_at). When provided, hovers show
   * "Teslim edildi · 2026-05-20 22:30 UTC" style detail.
   */
  detail?: string | null;
}

export const DeliveryStatusPill: React.FC<DeliveryStatusPillProps> = ({ status, detail }) => {
  const visuals = STATUS_VISUALS[status];
  if (!visuals) {
    // Forward-compat: unknown status falls back to plain text so an
    // unanticipated enum value still renders without crashing.
    return (
      <span data-testid={`delivery-status-pill-${status}`} aria-label={status}>
        {status}
      </span>
    );
  }
  const tooltip = detail ? `${visuals.label} · ${detail}` : visuals.label;
  return (
    <span
      data-testid={`delivery-status-pill-${status}`}
      aria-label={tooltip}
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.15rem 0.5rem',
        borderRadius: '999px',
        backgroundColor: visuals.bg,
        color: visuals.fg,
        border: `1px solid ${visuals.border}`,
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true">{visuals.icon}</span>
      <span>{visuals.label}</span>
    </span>
  );
};

export interface FailureCategoryLabelProps {
  category: DeliveryFailureCategory;
  /**
   * Redacted free-text summary from the backend ({@code
   * failure_summary_redacted}). Shown as tooltip only when the category
   * is not {@code UNKNOWN}; raw provider text is never rendered in the
   * cell itself.
   */
  redactedSummary?: string | null;
}

export const FailureCategoryLabel: React.FC<FailureCategoryLabelProps> = ({
  category,
  redactedSummary,
}) => {
  const label = FAILURE_CATEGORY_LABEL[category] ?? category;
  // Hide the line entirely when the row succeeded and the category is
  // a meaningless UNKNOWN placeholder. The cell already conveys "no
  // failure" by being empty for non-failed rows.
  if (category === 'UNKNOWN') {
    return (
      <span data-testid={`delivery-failure-category-${category}`} aria-label={label}>
        —
      </span>
    );
  }
  const tooltip = redactedSummary && redactedSummary.length > 0 ? redactedSummary : label;
  return (
    <span
      data-testid={`delivery-failure-category-${category}`}
      aria-label={label}
      title={tooltip}
      style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}
    >
      {label}
    </span>
  );
};
