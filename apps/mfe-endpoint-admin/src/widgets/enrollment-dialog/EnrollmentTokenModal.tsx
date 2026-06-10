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
 * Faz 22.5 one-command install (gitops#1434, Codex 019eb26e hardened-A):
 * the PRIMARY operator path is a single copy-paste PowerShell command that
 * downloads + runs the trusted bootstrap from the artifact host's stable
 * `/current/` alias. The per-release zip hash (`-ExpectedZipSha256`) is NOT
 * hard-coded — it is fetched live from `${artifactBaseUrl}/endpoint-agent/
 * current/release-manifest.json` (same-origin, no-store) when the modal opens,
 * so the UI never needs a per-release edit. If that fetch fails or returns an
 * off-schema manifest we render NO command — only an error + retry + the
 * always-visible manual (`install.ps1`) fallback below. Single-quote escape on
 * every interpolated value (Codex iter-1 must-fix #5) — `'` → `''`.
 */
export interface EnrollmentTokenModalProps {
  response: CreateEndpointEnrollmentResponse | null;
  apiUrl: string;
  /**
   * Public base for the artifact host, e.g. `https://testai.acik.com/artifacts`.
   * Mirrors `apiUrl`: derived from `window.location.origin` by the parent so the
   * discovery fetch is always SAME-ORIGIN (no CORS; CSP already lists `self`).
   */
  artifactBaseUrl: string;
  onClose: () => void;
}

/**
 * Minimal shape the one-command needs out of release-manifest.json. Only the
 * zip hash matters — the command targets the version-independent `/current/`
 * URLs, so the manifest's `release_tag` is informational and intentionally NOT
 * required (the live host manifest has `release_tag`, not `version`).
 */
interface ReleaseManifest {
  endpoint_agent_zip_sha256: string;
  release_tag?: string;
}

type ManifestState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: ReleaseManifest }
  | { status: 'error' };

function powerShellEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function isValidManifest(value: unknown): value is ReleaseManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const m = value as Record<string, unknown>;
  return (
    typeof m.endpoint_agent_zip_sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(m.endpoint_agent_zip_sha256)
  );
}

/**
 * Trusted single-line one-command. Uses the `/current/` alias for both the
 * bootstrap and the zip so the command keeps resolving across a release; the
 * pinned `-ExpectedZipSha256` makes a stale paste fail LOUDLY (sha256) rather
 * than install the wrong bytes — operator then regenerates. Single line (not
 * backtick-continued) is the most paste-robust form.
 */
function buildOneCommand(args: {
  token: string;
  apiUrl: string;
  artifactBaseUrl: string;
  zipSha256: string;
}): string {
  const base = `${args.artifactBaseUrl}/endpoint-agent/current`;
  const q = (v: string): string => `'${powerShellEscape(v)}'`;
  return [
    `& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing ${q(`${base}/bootstrap-package.ps1`)}).Content))`,
    `-PackageUrl ${q(`${base}/EndpointAgent.zip`)}`,
    `-ExpectedZipSha256 ${q(args.zipSha256)}`,
    `-ApiUrl ${q(args.apiUrl)}`,
    `-EnrollmentToken ${q(args.token)}`,
    `-Start`,
  ].join(' ');
}

/** Always-visible manual (advanced) fallback — operator already has the zip. */
function formatManualSnippet(token: string, apiUrl: string): string {
  return [
    `$EnrollmentToken = '${powerShellEscape(token)}'`,
    `$ApiUrl = '${powerShellEscape(apiUrl)}'`,
    `.\\install.ps1 -EnrollmentToken $EnrollmentToken -ApiUrl $ApiUrl -Start`,
  ].join('\n');
}

type CopyKind = 'token' | 'snippet' | 'onecommand';

export const EnrollmentTokenModal: React.FC<EnrollmentTokenModalProps> = ({
  response,
  apiUrl,
  artifactBaseUrl,
  onClose,
}) => {
  const { t } = useEndpointAdminI18n();
  const [copied, setCopied] = React.useState<CopyKind | null>(null);
  const [manifestState, setManifestState] = React.useState<ManifestState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);

  // Discover the live package hash from the stable /current/ alias when the
  // modal opens (Faz 22.5 hardened-A). Same-origin, no-store. On any failure
  // or off-schema manifest → error state (no command rendered).
  React.useEffect(() => {
    if (!response) {
      return undefined;
    }
    if (typeof fetch !== 'function') {
      setManifestState({ status: 'error' });
      return undefined;
    }
    let cancelled = false;
    setManifestState({ status: 'loading' });
    const url = `${artifactBaseUrl}/endpoint-agent/current/release-manifest.json`;
    fetch(url, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) {
          return;
        }
        setManifestState(
          isValidManifest(data) ? { status: 'ready', manifest: data } : { status: 'error' },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setManifestState({ status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [response, artifactBaseUrl, retryNonce]);

  if (!response) {
    return null;
  }

  const snippet = formatManualSnippet(response.token, apiUrl);
  const oneCommand =
    manifestState.status === 'ready'
      ? buildOneCommand({
          token: response.token,
          apiUrl,
          artifactBaseUrl,
          zipSha256: manifestState.manifest.endpoint_agent_zip_sha256,
        })
      : null;

  const handleCopy = (value: string, kind: CopyKind) => {
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
          <h3>{t('endpointAdmin.enrollments.modal.oneCommandLabel')}</h3>
          <p style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
            {t('endpointAdmin.enrollments.modal.oneCommandHelp')}
          </p>

          {manifestState.status === 'loading' && (
            <p data-testid="enrollment-token-modal-onecommand-loading" style={{ opacity: 0.7 }}>
              {t('endpointAdmin.enrollments.modal.oneCommandLoading')}
            </p>
          )}

          {manifestState.status === 'error' && (
            <div data-testid="enrollment-token-modal-onecommand-error">
              <p style={{ color: '#b00020' }}>
                {t('endpointAdmin.enrollments.modal.oneCommandError')}
              </p>
              <button
                type="button"
                data-testid="enrollment-token-modal-onecommand-retry"
                onClick={() => setRetryNonce((n) => n + 1)}
              >
                {t('endpointAdmin.enrollments.modal.retry')}
              </button>
            </div>
          )}

          {oneCommand !== null && (
            <>
              <pre
                data-testid="enrollment-token-modal-onecommand"
                style={{
                  padding: 8,
                  background: '#f5f5f5',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {oneCommand}
              </pre>
              <button
                type="button"
                data-testid="enrollment-token-modal-copy-onecommand"
                onClick={() => handleCopy(oneCommand, 'onecommand')}
              >
                {copied === 'onecommand'
                  ? t('endpointAdmin.enrollments.modal.copied')
                  : t('endpointAdmin.enrollments.modal.copy')}
              </button>
            </>
          )}
        </section>

        <section style={{ marginTop: 16 }}>
          <h3>{t('endpointAdmin.enrollments.modal.manualLabel')}</h3>
          <p style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
            {t('endpointAdmin.enrollments.modal.manualHelp')}
          </p>
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
