import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RemoteResponsePage from './RemoteResponsePage';
import type { RemoteResponseSessionState } from '../../entities/remote-response/types';

const activeSession = (): RemoteResponseSessionState => ({
  deviceId: 'device-1',
  sessionId: 'rr-1',
  phase: 'ACTIVE',
  deviceOnline: true,
  bridgeConnected: true,
  approvalActive: true,
  stepUpVerified: true,
  consentActive: true,
  recordingActive: true,
  ttlSecondsRemaining: 600,
  denyReason: null,
  recording: {
    chainId: 'chain-1',
    lastEventKind: 'AGENT_OUTPUT',
    redactionClass: 'METADATA_ONLY',
    evidenceUrl: null,
  },
});

const renderPage = (
  entry = '/endpoint-admin/remote-response?deviceId=device-1',
  props: React.ComponentProps<typeof RemoteResponsePage> = {},
) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <RemoteResponsePage {...props} />
    </MemoryRouter>,
  );

describe('RemoteResponsePage', () => {
  it('renders device context and keeps execution controls locked by default', () => {
    renderPage();

    expect(screen.getByTestId('remote-response-page')).toBeInTheDocument();
    expect(screen.getByTestId('remote-response-device-id').textContent).toContain('device-1');
    expect(screen.getByTestId('remote-response-lock-banner').textContent).toMatch(
      /Kilitli|Locked/i,
    );
    expect(screen.getByTestId('remote-response-approved-script-submit')).toBeDisabled();
    expect(screen.getByTestId('remote-response-terminal-input')).toBeDisabled();
    expect(screen.getByTestId('remote-response-terminal-submit')).toBeDisabled();
    expect(screen.getByTestId('remote-response-file-transfer')).toBeDisabled();
    expect(screen.getByTestId('remote-response-clipboard')).toBeDisabled();
  });

  it('records recording gate as inactive until backend session state arrives', () => {
    renderPage();

    expect(screen.getByTestId('remote-response-recording-indicator').textContent).toContain('OFF');
    expect(screen.getByTestId('remote-response-gate-recordingActive').textContent).toMatch(
      /Bekliyor|Waiting/i,
    );
  });

  it('backend-fed active session enables script and terminal but keeps file transfer and clipboard off', () => {
    renderPage('/endpoint-admin/remote-response?deviceId=device-1', {
      sessionState: activeSession(),
    });

    expect(screen.getByTestId('remote-response-lock-banner').textContent).toMatch(/Açık|Open/i);
    expect(screen.getByTestId('remote-response-approved-script-select')).not.toBeDisabled();
    expect(screen.getByTestId('remote-response-approved-script-submit')).not.toBeDisabled();
    expect(screen.getByTestId('remote-response-terminal-input')).not.toBeDisabled();
    expect(screen.getByTestId('remote-response-terminal-submit')).not.toBeDisabled();
    expect(screen.getByTestId('remote-response-file-transfer')).toBeDisabled();
    expect(screen.getByTestId('remote-response-clipboard')).toBeDisabled();
    expect(screen.getByTestId('remote-response-recording-indicator').textContent).toContain('ON');
    expect(screen.getByTestId('remote-response-recording-metadata').textContent).toContain(
      'chain-1',
    );
    expect(screen.getByTestId('remote-response-recording-metadata').textContent).toContain(
      'AGENT_OUTPUT',
    );
  });

  it('recording inactive keeps terminal locked while approved script gate can open', () => {
    renderPage('/endpoint-admin/remote-response?deviceId=device-1', {
      sessionState: { ...activeSession(), recordingActive: false, recording: null },
    });

    expect(screen.getByTestId('remote-response-approved-script-submit')).not.toBeDisabled();
    expect(screen.getByTestId('remote-response-terminal-input')).toBeDisabled();
    expect(screen.getByTestId('remote-response-terminal-submit')).toBeDisabled();
    expect(screen.getByTestId('remote-response-recording-indicator').textContent).toContain('OFF');
  });

  it('script list empty ise approved-script action fail-closed kalir', () => {
    renderPage('/endpoint-admin/remote-response?deviceId=device-1', {
      sessionState: activeSession(),
      scriptOptions: [],
    });

    expect(screen.getByTestId('remote-response-approved-script-select')).toBeDisabled();
    expect(screen.getByTestId('remote-response-approved-script-submit')).toBeDisabled();
    expect(screen.getByTestId('remote-response-approved-script-hash').textContent).toBe('—');
  });

  it('browser-visible surface token veya private key alanlarini render etmez', () => {
    const unsafeSession = {
      ...activeSession(),
      bearerToken: 'Bearer secret-token',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      cookie: 'session=secret',
    } as unknown as RemoteResponseSessionState;
    renderPage('/endpoint-admin/remote-response?deviceId=device-1', {
      sessionState: unsafeSession,
    });

    const pageText = screen.getByTestId('remote-response-page').textContent ?? '';
    expect(pageText).not.toContain('secret-token');
    expect(pageText).not.toContain('PRIVATE KEY');
    expect(pageText).not.toContain('session=secret');
  });
});
