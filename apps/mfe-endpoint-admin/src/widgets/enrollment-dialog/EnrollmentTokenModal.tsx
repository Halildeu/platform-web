/* eslint-disable semantic-theme/no-inline-color-literals -- WEB-017 iter-1 ship; semantic token migration in WEB-017 iter-2 follow-up. */
import React from 'react';

import type { CreateEndpointEnrollmentResponse } from '../../entities/endpoint-enrollment/types';
import { useEndpointAdminI18n } from '../../i18n';

/**
 * WEB-017 — Endpoint enrollment token reveal-once modal.
 *
 * Codex 019e711f iter-1 reveal-once UX contract: the raw token from
 * `CreateEndpointEnrollmentResponse` is surfaced ONCE here and must
 * never persist anywhere else — no localStorage, no sessionStorage,
 * no URL, no telemetry, no log. When the modal closes, the parent
 * passes `null` for `response` and React drops the closure.
 *
 * The PowerShell install snippet is multi-line because operators
 * paste it directly into a PowerShell prompt and a `param` block or
 * single-line variant is less readable. Single-quote escape on the
 * token (Codex iter-1 must-fix #5) — `'` → `''` — so a token with
 * special characters cannot break out of the literal.
 */
export interface EnrollmentTokenModalProps {
  response: CreateEndpointEnrollmentResponse | null;
  apiUrl: string;
  onClose: () => void;
}

function powerShellEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function formatSnippet(token: string, apiUrl: string): string {
  return [
    `$EnrollmentToken = '${powerShellEscape(token)}'`,
    `$ApiUrl = '${powerShellEscape(apiUrl)}'`,
    `.\\install.ps1 -EnrollmentToken $EnrollmentToken -ApiUrl $ApiUrl -Start`,
  ].join('\n');
}

export const EnrollmentTokenModal: React.FC<EnrollmentTokenModalProps> = ({
  response,
  apiUrl,
  onClose,
}) => {
  const { t } = useEndpointAdminI18n();
  const [copied, setCopied] = React.useState<'token' | 'snippet' | null>(null);

  if (!response) {
    return null;
  }

  const snippet = formatSnippet(response.token, apiUrl);

  const handleCopy = (value: string, kind: 'token' | 'snippet') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(value).then(() => {
        setCopied(kind);
        window.setTimeout(() => setCopied(null), 2000);
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="enrollment-token-modal-title"
      data-testid="enrollment-token-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: 24,
          borderRadius: 8,
          maxWidth: 720,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <h2 id="enrollment-token-modal-title">{t('endpointAdmin.enrollments.modal.title')}</h2>
        <p data-testid="enrollment-token-modal-warning">
          {t('endpointAdmin.enrollments.modal.warning')}
        </p>

        <section style={{ marginTop: 16 }}>
          <h3>{t('endpointAdmin.enrollments.modal.tokenLabel')}</h3>
          <code
            data-testid="enrollment-token-modal-raw"
            style={{
              display: 'block',
              padding: 8,
              background: '#f5f5f5',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
            }}
          >
            {response.token}
          </code>
          <button
            type="button"
            data-testid="enrollment-token-modal-copy-token"
            onClick={() => handleCopy(response.token, 'token')}
          >
            {copied === 'token'
              ? t('endpointAdmin.enrollments.modal.copied')
              : t('endpointAdmin.enrollments.modal.copy')}
          </button>
        </section>

        <section style={{ marginTop: 16 }}>
          <h3>{t('endpointAdmin.enrollments.modal.snippetLabel')}</h3>
          <pre
            data-testid="enrollment-token-modal-snippet"
            style={{
              padding: 8,
              background: '#f5f5f5',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {snippet}
          </pre>
          <button
            type="button"
            data-testid="enrollment-token-modal-copy-snippet"
            onClick={() => handleCopy(snippet, 'snippet')}
          >
            {copied === 'snippet'
              ? t('endpointAdmin.enrollments.modal.copied')
              : t('endpointAdmin.enrollments.modal.copy')}
          </button>
        </section>

        <p style={{ marginTop: 16 }}>
          <strong>{t('endpointAdmin.enrollments.modal.expiresLabel')}:</strong>{' '}
          {new Date(response.expiresAt).toLocaleString()}
        </p>

        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <button type="button" data-testid="enrollment-token-modal-close" onClick={onClose}>
            {t('endpointAdmin.enrollments.modal.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
