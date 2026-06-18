import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  APPROVED_REMOTE_SCRIPT_OPTIONS,
  buildDefaultRemoteResponseGateState,
  canDispatchApprovedRemoteOperation,
  canUnlockRemoteTerminal,
  type RemoteResponseMode,
} from '../../entities/remote-response/types';
import { useEndpointAdminI18n } from '../../i18n';

const formatHash = (value: string): string => `${value.slice(0, 12)}…${value.slice(-8)}`;

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  background: 'var(--surface-default)',
  padding: 16,
};

const buttonBase: React.CSSProperties = {
  minHeight: 36,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  background: 'var(--surface-default)',
  color: 'var(--text-primary)',
  fontSize: 13,
};

export const RemoteResponsePage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = React.useState<RemoteResponseMode>('APPROVED_SCRIPT');

  const deviceIdParam = searchParams.get('deviceId');
  const deviceId = deviceIdParam && deviceIdParam.trim() !== '' ? deviceIdParam.trim() : null;
  const gateState = React.useMemo(() => buildDefaultRemoteResponseGateState(deviceId), [deviceId]);
  const approvedOperationEnabled = canDispatchApprovedRemoteOperation(gateState);
  const terminalUnlocked = canUnlockRemoteTerminal(gateState);
  const selectedScript = APPROVED_REMOTE_SCRIPT_OPTIONS[0];

  const gates = [
    {
      id: 'deviceOnline',
      label: t('endpointAdmin.remoteResponse.gate.deviceOnline'),
      ok: gateState.deviceOnline,
    },
    {
      id: 'bridgeConnected',
      label: t('endpointAdmin.remoteResponse.gate.bridgeConnected'),
      ok: gateState.bridgeConnected,
    },
    {
      id: 'approvalActive',
      label: t('endpointAdmin.remoteResponse.gate.approvalActive'),
      ok: gateState.approvalActive,
    },
    {
      id: 'stepUpVerified',
      label: t('endpointAdmin.remoteResponse.gate.stepUpVerified'),
      ok: gateState.stepUpVerified,
    },
    {
      id: 'consentActive',
      label: t('endpointAdmin.remoteResponse.gate.consentActive'),
      ok: gateState.consentActive,
    },
    {
      id: 'recordingActive',
      label: t('endpointAdmin.remoteResponse.gate.recordingActive'),
      ok: gateState.recordingActive,
    },
  ];

  const renderSegment = (segment: RemoteResponseMode, label: string) => (
    <button
      key={segment}
      type="button"
      onClick={() => setMode(segment)}
      aria-pressed={mode === segment}
      style={{
        ...buttonBase,
        borderColor: mode === segment ? 'var(--brand-primary)' : 'var(--border-default)',
        color: mode === segment ? 'var(--brand-primary)' : 'var(--text-primary)',
      }}
      data-testid={`remote-response-mode-${segment}`}
    >
      {label}
    </button>
  );

  return (
    <section
      data-testid="remote-response-page"
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        color: 'var(--text-primary)',
      }}
    >
      <header
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>
            {t('endpointAdmin.remoteResponse.heading')}
          </h2>
          <p
            data-testid="remote-response-device-id"
            style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}
          >
            {t('endpointAdmin.remoteResponse.device')}: {deviceId ?? '—'}
          </p>
        </div>
        <div
          role="status"
          data-testid="remote-response-lock-banner"
          style={{
            alignSelf: 'flex-start',
            border: '1px solid var(--state-warning-border)',
            background: 'var(--state-warning-subtle)',
            color: 'var(--state-warning-text)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
          }}
        >
          {terminalUnlocked
            ? t('endpointAdmin.remoteResponse.lock.open')
            : t('endpointAdmin.remoteResponse.lock.closed')}
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <section style={panelStyle} aria-label={t('endpointAdmin.remoteResponse.gates.heading')}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
            {t('endpointAdmin.remoteResponse.gates.heading')}
          </h3>
          <ul
            style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}
          >
            {gates.map((gate) => (
              <li
                key={gate.id}
                data-testid={`remote-response-gate-${gate.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 13 }}>{gate.label}</span>
                <span
                  style={{
                    fontSize: 12,
                    color: gate.ok ? 'var(--state-success-text)' : 'var(--text-secondary)',
                    fontFamily: 'monospace',
                  }}
                >
                  {gate.ok
                    ? t('endpointAdmin.remoteResponse.gate.ok')
                    : t('endpointAdmin.remoteResponse.gate.waiting')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section style={panelStyle} aria-label={t('endpointAdmin.remoteResponse.mode.heading')}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
            {t('endpointAdmin.remoteResponse.mode.heading')}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {renderSegment(
              'OPERATION_CATALOG',
              t('endpointAdmin.remoteResponse.mode.operationCatalog'),
            )}
            {renderSegment(
              'APPROVED_SCRIPT',
              t('endpointAdmin.remoteResponse.mode.approvedScript'),
            )}
            {renderSegment(
              'BREAK_GLASS_TERMINAL',
              t('endpointAdmin.remoteResponse.mode.breakGlass'),
            )}
          </div>
          <dl
            style={{
              margin: '14px 0 0',
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: '6px 12px',
              fontSize: 13,
            }}
          >
            <dt style={{ color: 'var(--text-secondary)' }}>
              {t('endpointAdmin.remoteResponse.session')}
            </dt>
            <dd style={{ margin: 0, fontFamily: 'monospace' }}>{gateState.sessionId ?? '—'}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>
              {t('endpointAdmin.remoteResponse.ttl')}
            </dt>
            <dd style={{ margin: 0, fontFamily: 'monospace' }}>{gateState.ttlSecondsRemaining}s</dd>
          </dl>
        </section>
      </div>

      <section
        style={panelStyle}
        aria-label={t('endpointAdmin.remoteResponse.approvedScript.heading')}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
          {t('endpointAdmin.remoteResponse.approvedScript.heading')}
        </h3>
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 360px) minmax(180px, 1fr) auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {t('endpointAdmin.remoteResponse.approvedScript.script')}
            </span>
            <select
              disabled={!approvedOperationEnabled}
              data-testid="remote-response-approved-script-select"
              style={{
                minHeight: 36,
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '6px 10px',
                background: 'var(--surface-default)',
                color: 'var(--text-primary)',
              }}
              defaultValue={selectedScript.id}
            >
              {APPROVED_REMOTE_SCRIPT_OPTIONS.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>{t('endpointAdmin.remoteResponse.approvedScript.hash')}: </span>
            <code data-testid="remote-response-approved-script-hash">
              {formatHash(selectedScript.hash)}
            </code>
          </div>
          <button
            type="button"
            disabled={!approvedOperationEnabled}
            data-testid="remote-response-approved-script-submit"
            style={{
              ...buttonBase,
              minWidth: 96,
              opacity: approvedOperationEnabled ? 1 : 0.5,
              cursor: approvedOperationEnabled ? 'pointer' : 'not-allowed',
            }}
          >
            {t('endpointAdmin.remoteResponse.action.run')}
          </button>
        </div>
      </section>

      <section style={panelStyle} aria-label={t('endpointAdmin.remoteResponse.terminal.heading')}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
            {t('endpointAdmin.remoteResponse.terminal.heading')}
          </h3>
          <span
            data-testid="remote-response-recording-indicator"
            style={{
              fontSize: 12,
              color: gateState.recordingActive
                ? 'var(--state-success-text)'
                : 'var(--text-secondary)',
              fontFamily: 'monospace',
            }}
          >
            {t('endpointAdmin.remoteResponse.recording')}:{' '}
            {gateState.recordingActive ? 'ON' : 'OFF'}
          </span>
        </div>
        <textarea
          disabled={!terminalUnlocked}
          data-testid="remote-response-terminal-input"
          aria-label={t('endpointAdmin.remoteResponse.terminal.input')}
          placeholder={t('endpointAdmin.remoteResponse.terminal.placeholder')}
          style={{
            marginTop: 12,
            width: '100%',
            minHeight: 120,
            resize: 'vertical',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            padding: 12,
            background: terminalUnlocked ? 'var(--surface-default)' : 'var(--surface-muted)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button
            type="button"
            disabled={!terminalUnlocked}
            data-testid="remote-response-terminal-submit"
            style={{
              ...buttonBase,
              opacity: terminalUnlocked ? 1 : 0.5,
              cursor: terminalUnlocked ? 'pointer' : 'not-allowed',
            }}
          >
            {t('endpointAdmin.remoteResponse.action.send')}
          </button>
          <button
            type="button"
            disabled
            data-testid="remote-response-file-transfer"
            style={{ ...buttonBase, opacity: 0.5, cursor: 'not-allowed' }}
          >
            {t('endpointAdmin.remoteResponse.action.fileTransfer')}
          </button>
          <button
            type="button"
            disabled
            data-testid="remote-response-clipboard"
            style={{ ...buttonBase, opacity: 0.5, cursor: 'not-allowed' }}
          >
            {t('endpointAdmin.remoteResponse.action.clipboard')}
          </button>
        </div>
      </section>

      <section style={panelStyle} aria-label={t('endpointAdmin.remoteResponse.transcript.heading')}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
          {t('endpointAdmin.remoteResponse.transcript.heading')}
        </h3>
        <pre
          data-testid="remote-response-transcript"
          style={{
            margin: '12px 0 0',
            minHeight: 80,
            whiteSpace: 'pre-wrap',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-muted)',
            padding: 12,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {t('endpointAdmin.remoteResponse.transcript.empty')}
        </pre>
      </section>
    </section>
  );
};

export default RemoteResponsePage;
