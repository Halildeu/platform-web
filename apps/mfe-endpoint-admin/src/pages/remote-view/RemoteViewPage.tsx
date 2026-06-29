import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEndpointAdminI18n } from '../../i18n';
import { readBearerToken, resolveBaseUrl } from '../../app/services/endpointAdminApi';
import {
  openRemoteViewStream,
  type RemoteViewStreamHandle,
} from '../../app/services/remoteViewStream';
import {
  isRenderableFrame,
  type RemoteViewMeta,
  type RemoteViewStatus,
} from '../../entities/remote-view/types';

/**
 * Faz 22.6 — VIEW_ONLY operator screen-observation viewer (web-MFE path).
 *
 * Renders the live screen frames the backend relays over fetch-SSE for ONE
 * owned, active, VIEW_ONLY-authorized remote-support session. This surface
 * is observation-ONLY: it renders `<img>` frames and deliberately wires NO
 * input/clipboard/file forwarding — there is no control channel. Recording
 * is OFF (the relay never persists frames). The route is reached only inside
 * the owner-gated remote-support pilot; the backend endpoint is
 * disabled-by-default and the gateway route is owner/ops-gated, so this page
 * fails closed (a missing/blank session or stream id renders the
 * missing-params notice and never opens a stream).
 *
 * The props are test seams only — production uses the global `fetch`, the
 * shared `readBearerToken`, and `Date.now`.
 */
export interface RemoteViewPageProps {
  fetchImpl?: typeof fetch;
  tokenResolver?: () => string | null;
  nowFn?: () => number;
}

const VIEWER_PATH = '/endpoint-admin/remote-access/sessions';

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
};

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  background: 'var(--surface-default)',
  padding: '10px 14px',
};

const badgeBase: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--border-default)',
  whiteSpace: 'nowrap',
};

const stageStyle: React.CSSProperties = {
  position: 'relative',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  background: '#000',
  minHeight: 320,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const imgStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '72vh',
  // belt-and-braces: even though there is no control channel, make the
  // surface visibly non-interactive (no drag-ghost, no pointer affordance).
  pointerEvents: 'none',
  userSelect: 'none',
};

const buttonStyle: React.CSSProperties = {
  minHeight: 36,
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  background: 'var(--surface-default)',
  color: 'var(--text-primary)',
  fontSize: 13,
  cursor: 'pointer',
};

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
};

function statusKey(status: RemoteViewStatus): string {
  return `endpointAdmin.remoteView.status.${status}`;
}

export const RemoteViewPage: React.FC<RemoteViewPageProps> = ({
  fetchImpl,
  tokenResolver,
  nowFn,
}) => {
  const { t } = useEndpointAdminI18n();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const now = nowFn ?? (() => Date.now());

  const sessionId = (params.sessionId ?? '').trim();
  const streamId = (searchParams.get('streamId') ?? '').trim();
  const missing = sessionId === '' || streamId === '';

  const [status, setStatus] = React.useState<RemoteViewStatus>('connecting');
  const [meta, setMeta] = React.useState<RemoteViewMeta | null>(null);
  const [frameSrc, setFrameSrc] = React.useState<string | null>(null);
  const [frameCount, setFrameCount] = React.useState(0);
  const [lastFrameAt, setLastFrameAt] = React.useState<number | null>(null);
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  const handleRef = React.useRef<RemoteViewStreamHandle | null>(null);

  const stop = React.useCallback(() => {
    handleRef.current?.close();
    handleRef.current = null;
    setStatus('closed');
  }, []);

  React.useEffect(() => {
    if (missing) {
      setStatus('error');
      return;
    }
    const token = (tokenResolver ?? readBearerToken)();
    const url = `${resolveBaseUrl()}${VIEWER_PATH}/${encodeURIComponent(
      sessionId,
    )}/view?streamId=${encodeURIComponent(streamId)}`;
    const handle = openRemoteViewStream({
      url,
      token,
      fetchImpl,
      onStatus: setStatus,
      onMeta: setMeta,
      onFrame: (frame) => {
        if (!isRenderableFrame(frame)) return; // never build a data URL from a non-image type
        setFrameSrc(`data:${frame.contentType};base64,${frame.dataB64}`);
        setFrameCount((c) => c + 1);
        setLastFrameAt(now());
      },
    });
    handleRef.current = handle;
    return () => {
      handle.close();
      handleRef.current = null;
    };
    // Reconnect only when the stream target changes — the test-seam props
    // (fetchImpl/tokenResolver/now) are stable for a given mount.
  }, [sessionId, streamId, missing]);

  // Frame-age ticker — only while live, so a closed view stops counting.
  React.useEffect(() => {
    if (status !== 'live') return undefined;
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (missing) {
    return (
      <div style={wrapStyle} data-testid="remote-view-page">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t('endpointAdmin.remoteView.title')}</h1>
        <p role="alert" style={{ color: 'var(--text-danger, #b42318)' }}>
          {t('endpointAdmin.remoteView.missingParams')}
        </p>
      </div>
    );
  }

  const ageSeconds =
    lastFrameAt != null ? Math.max(0, Math.floor((now() - lastFrameAt) / 1000)) : null;
  const recordingOff = meta ? !meta.recording : true;
  const attended = meta ? meta.attended : true;
  const stopped =
    status === 'closed' || status === 'error' || status === 'forbidden' || status === 'busy';

  return (
    <div style={wrapStyle} data-testid="remote-view-page">
      <div style={barStyle} data-testid="remote-view-bar">
        <strong style={{ fontSize: 15 }}>{t('endpointAdmin.remoteView.title')}</strong>
        <span
          style={{
            ...badgeBase,
            color: 'var(--text-primary)',
            borderColor: 'var(--border-strong, #888)',
          }}
          data-testid="remote-view-badge-viewonly"
        >
          {t('endpointAdmin.remoteView.badge.viewOnly')}
        </span>
        {recordingOff && (
          <span
            style={{
              ...badgeBase,
              color: 'var(--text-success, #067647)',
              borderColor: 'var(--border-success, #067647)',
            }}
            data-testid="remote-view-badge-recording-off"
          >
            {t('endpointAdmin.remoteView.badge.recordingOff')}
          </span>
        )}
        {attended && (
          <span style={badgeBase} data-testid="remote-view-badge-attended">
            {t('endpointAdmin.remoteView.badge.attended')}
          </span>
        )}
        <span
          aria-live="polite"
          style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}
          data-testid="remote-view-status"
        >
          {t(statusKey(status))}
        </span>
        <button
          type="button"
          style={buttonStyle}
          onClick={stop}
          disabled={stopped}
          data-testid="remote-view-stop"
        >
          {t('endpointAdmin.remoteView.stop')}
        </button>
      </div>

      <div style={stageStyle} data-testid="remote-view-stage">
        {frameSrc ? (
          <img
            src={frameSrc}
            alt={t('endpointAdmin.remoteView.alt')}
            style={imgStyle}
            draggable={false}
            data-testid="remote-view-frame"
          />
        ) : (
          <span style={{ color: 'var(--text-on-inverse, #ddd)' }} data-testid="remote-view-waiting">
            {status === 'live' ? t('endpointAdmin.remoteView.waiting') : t(statusKey(status))}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={noteStyle} data-testid="remote-view-frame-count">
          {t('endpointAdmin.remoteView.frameCount')}: {frameCount}
        </span>
        {ageSeconds != null && (
          <span style={noteStyle} data-testid="remote-view-frame-age">
            {t('endpointAdmin.remoteView.lastFrame')}: {ageSeconds}s
          </span>
        )}
      </div>

      <p style={noteStyle} data-testid="remote-view-no-input-note">
        {t('endpointAdmin.remoteView.noInputNote')}
      </p>
    </div>
  );
};

export default RemoteViewPage;
