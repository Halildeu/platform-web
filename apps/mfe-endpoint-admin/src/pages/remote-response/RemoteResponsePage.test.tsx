import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RemoteResponsePage from './RemoteResponsePage';

const renderPage = (entry = '/endpoint-admin/remote-response?deviceId=device-1') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <RemoteResponsePage />
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
});
