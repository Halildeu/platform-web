import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEndpointAdminI18n } from '../../i18n';
import { readBearerToken, resolveBaseUrl } from '../../app/services/endpointAdminApi';
import { subscribeToShellAuthToken } from '../../app/services/shell-services';
import {
  acknowledgeRemoteViewRender,
  openRemoteViewStream,
  type RemoteViewStreamHandle,
} from '../../app/services/remoteViewStream';
import {
  isRenderableFrame,
  type RemoteViewFrame,
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
  /** Test seam; production schedules acknowledgement after two animation frames. */
  afterPaint?: (callback: () => void) => void;
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

function normalizeBearerToken(token: string | null | undefined): string | null {
  const normalized = token?.trim();
  return normalized && normalized !== 'undefined' && normalized !== 'null' ? normalized : null;
}

function useRemoteViewBearerToken(tokenResolver?: () => string | null): string | null {
  const [shellToken, setShellToken] = React.useState<string | null>(() =>
    normalizeBearerToken(readBearerToken()),
  );

  React.useEffect(() => {
    if (tokenResolver) return undefined;

    let active = true;
    const updateToken = (nextToken: string | null) => {
      if (active) setShellToken(normalizeBearerToken(nextToken));
    };

    updateToken(readBearerToken());
    const unsubscribe = subscribeToShellAuthToken(updateToken);

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [tokenResolver]);

  // tokenResolver is a synchronous test seam. Re-read it on every render so a
  // rerender cannot retain a stale test bearer; production uses the live shell
  // subscription above.
  return tokenResolver ? normalizeBearerToken(tokenResolver()) : shellToken;
}

export const RemoteViewPage: React.FC<RemoteViewPageProps> = ({
  fetchImpl,
  tokenResolver,
  nowFn,
  afterPaint,
}) => {
  const { t } = useEndpointAdminI18n();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const now = nowFn ?? (() => Date.now());

  const sessionId = (params.sessionId ?? '').trim();
  const streamId = (searchParams.get('streamId') ?? '').trim();
  const missing = sessionId === '' || streamId === '';
  const bearerToken = useRemoteViewBearerToken(tokenResolver);

  const [status, setStatus] = React.useState<RemoteViewStatus>('connecting');
  const [meta, setMeta] = React.useState<RemoteViewMeta | null>(null);
  const [frame, setFrame] = React.useState<RemoteViewFrame | null>(null);
  const [frameCount, setFrameCount] = React.useState(0);
  const [renderAckAttemptedCount, setRenderAckAttemptedCount] = React.useState(0);
  const [renderAckAcceptedCount, setRenderAckAcceptedCount] = React.useState(0);
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  const handleRef = React.useRef<RemoteViewStreamHandle | null>(null);
  const ackContextRef = React.useRef<{
    target: string;
    url: string;
    token: string | null;
    active: boolean;
    abort: AbortController;
    ackInFlight: boolean;
    queuedAck: { viewerId: string; frameSeq: number } | null;
  } | null>(null);
  const lastAckAttemptedSeqRef = React.useRef(-1);

  const terminateAcknowledgements = React.useCallback(() => {
    const context = ackContextRef.current;
    if (!context) return;
    context.active = false;
    context.queuedAck = null;
    context.abort.abort();
  }, []);

  const stop = React.useCallback(() => {
    terminateAcknowledgements();
    handleRef.current?.close();
    handleRef.current = null;
    setMeta(null);
    setFrame(null);
    setFrameCount(0);
    setStatus('closed');
  }, [terminateAcknowledgements]);

  React.useEffect(() => {
    // Reset per-target view state FIRST so a previous session's frame/meta can
    // never bleed into a new target, an unauthorized (403/busy) one, or one that
    // has not pushed a frame yet — a stale screen frame is a privacy leak and a
    // VIEW_ONLY acceptance-truth violation.
    setMeta(null);
    setFrame(null);
    setFrameCount(0);
    setRenderAckAttemptedCount(0);
    setRenderAckAcceptedCount(0);
    lastAckAttemptedSeqRef.current = -1;

    if (missing) {
      setStatus('error');
      return undefined;
    }
    if (!bearerToken) {
      setStatus('awaitingAuth');
      return undefined;
    }
    setStatus('connecting');

    // Generation guard: only the CURRENT stream may write state. Cleanup flips
    // `active` so an aborted/superseded stream's late callbacks (an abort race
    // on target change or unmount) become no-ops and cannot touch the new target.
    let active = true;
    const token = bearerToken;
    const url = `${resolveBaseUrl()}${VIEWER_PATH}/${encodeURIComponent(
      sessionId,
    )}/view?streamId=${encodeURIComponent(streamId)}`;
    const target = `${sessionId}\u0000${streamId}`;
    const ackAbort = new AbortController();
    ackContextRef.current = {
      target,
      url,
      token,
      active: true,
      abort: ackAbort,
      ackInFlight: false,
      queuedAck: null,
    };
    const handle = openRemoteViewStream({
      url,
      token,
      fetchImpl,
      onStatus: (s) => {
        if (!active) return;
        setStatus(s);
        if (s === 'closed' || s === 'error' || s === 'forbidden' || s === 'busy') {
          terminateAcknowledgements();
          setMeta(null);
          setFrame(null);
          setFrameCount(0);
        }
      },
      onMeta: (m) => {
        if (active) setMeta(m);
      },
      onFrame: (frame) => {
        if (!active || !isRenderableFrame(frame)) return; // never build a data URL from a non-image type
        setFrame(frame);
        setFrameCount((c) => c + 1);
      },
    });
    handleRef.current = handle;
    return () => {
      active = false;
      ackAbort.abort();
      if (ackContextRef.current?.target === target) {
        ackContextRef.current.active = false;
        ackContextRef.current.queuedAck = null;
      }
      handle.close();
      handleRef.current = null;
    };
    // Reconnect when the stream target or live shell token changes. This keeps
    // the fetch-SSE authorization synchronized with PKCE completion/refresh.
  }, [sessionId, streamId, missing, bearerToken, fetchImpl, terminateAcknowledgements]);

  const acknowledgeRendered = React.useCallback(
    (renderedFrame: RemoteViewFrame) => {
      const context = ackContextRef.current;
      const expectedTarget = `${sessionId}\u0000${streamId}`;
      if (
        !context?.active ||
        context.target !== expectedTarget ||
        !meta?.viewerId ||
        renderedFrame.seq <= lastAckAttemptedSeqRef.current
      ) {
        return;
      }
      lastAckAttemptedSeqRef.current = renderedFrame.seq;
      const send = () => {
        const current = ackContextRef.current;
        if (!current?.active || current.target !== expectedTarget || current.abort.signal.aborted)
          return;
        const dispatch = (
          context: NonNullable<typeof ackContextRef.current>,
          acknowledgement: { viewerId: string; frameSeq: number },
        ) => {
          if (!context.active || ackContextRef.current !== context || context.abort.signal.aborted)
            return;
          if (context.ackInFlight) {
            context.queuedAck = acknowledgement; // latest-wins: at most one pending POST
            return;
          }
          context.ackInFlight = true;
          setRenderAckAttemptedCount((count) => count + 1);
          void acknowledgeRemoteViewRender({
            url: context.url,
            token: context.token,
            viewerId: acknowledgement.viewerId,
            frameSeq: acknowledgement.frameSeq,
            fetchImpl,
            signal: context.abort.signal,
          })
            .then((accepted) => {
              if (accepted && context.active && ackContextRef.current === context) {
                setRenderAckAcceptedCount((count) => count + 1);
              }
            })
            .finally(() => {
              context.ackInFlight = false;
              const next = context.queuedAck;
              context.queuedAck = null;
              if (next) dispatch(context, next);
            });
        };
        dispatch(current, { viewerId: meta.viewerId, frameSeq: renderedFrame.seq });
      };
      if (afterPaint) {
        afterPaint(send);
      } else if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(send));
      } else {
        queueMicrotask(send);
      }
    },
    [afterPaint, fetchImpl, meta?.viewerId, sessionId, streamId],
  );

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

  const ageSeconds = frame
    ? Math.max(0, Math.floor((now() - frame.observedAtEpochMillis) / 1000))
    : null;
  const metadataTrusted = meta !== null;
  const stopped =
    status === 'closed' || status === 'error' || status === 'forbidden' || status === 'busy';

  return (
    <div
      style={wrapStyle}
      data-testid="remote-view-page"
      data-render-ack-attempted-count={renderAckAttemptedCount}
      data-render-ack-accepted-count={renderAckAcceptedCount}
      data-metadata-trusted={metadataTrusted ? 'true' : 'false'}
      data-viewer-id={meta?.viewerId}
      data-frame-seq={frame?.seq}
      data-frame-observed-at={frame?.observedAtEpochMillis}
      data-frame-sent-at={frame?.sentAtEpochMillis}
    >
      <div style={barStyle} data-testid="remote-view-bar">
        <strong style={{ fontSize: 15 }}>{t('endpointAdmin.remoteView.title')}</strong>
        {metadataTrusted && (
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
        )}
        {metadataTrusted && (
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
        {metadataTrusted && (
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
        {metadataTrusted && frame ? (
          <img
            key={`${meta?.viewerId ?? 'pending'}-${frame.seq}`}
            src={`data:${frame.contentType};base64,${frame.dataB64}`}
            alt={t('endpointAdmin.remoteView.alt')}
            style={imgStyle}
            draggable={false}
            onLoad={() => acknowledgeRendered(frame)}
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

      {metadataTrusted && (
        <p style={noteStyle} data-testid="remote-view-no-input-note">
          {t('endpointAdmin.remoteView.noInputNote')}
        </p>
      )}
    </div>
  );
};

export default RemoteViewPage;
