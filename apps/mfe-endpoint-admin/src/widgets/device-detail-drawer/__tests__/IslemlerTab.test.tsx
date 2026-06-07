import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IslemlerTab } from '../tabs/IslemlerTab';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';

afterEach(() => cleanup());

const baseDevice: EndpointDevice = {
  id: 'd-1',
  tenantId: 't-1',
  hostname: 'SRB-AIDENETIMPC',
  displayName: null,
  osType: 'WINDOWS',
  osVersion: '11 23H2',
  agentVersion: '1.4.0',
  machineFingerprint: null,
  domainName: null,
  status: 'ONLINE',
  lastSeenAt: '2026-05-25T10:00:00Z',
  enrolledAt: '2026-05-24T00:00:00Z',
  createdAt: '2026-05-24T00:00:00Z',
  updatedAt: '2026-05-25T10:00:00Z',
};

const defaults = {
  recentCommands: [],
  isSubmitting: false,
  lastIssuedCommandId: null,
  lastIssuedRequiresApproval: false,
  lastIssuedLocalPassword: null,
  lastError: null,
  onIssueCommand: vi.fn(),
};

describe('IslemlerTab — offline guard', () => {
  it('OFFLINE durumda tum command butonlari disabled + offline banner', () => {
    render(<IslemlerTab {...defaults} device={{ ...baseDevice, status: 'OFFLINE' }} />);
    expect(screen.getByTestId('islemler-offline-banner')).toBeInTheDocument();
    expect(screen.getByTestId('command-button-COLLECT_INVENTORY')).toBeDisabled();
    expect(screen.getByTestId('command-button-LOCK_USER_LOGIN')).toBeDisabled();
    expect(screen.getByTestId('command-button-CHANGE_LOCAL_PASSWORD')).toBeDisabled();
    expect(screen.getByTestId('command-button-ROTATE_CREDENTIAL')).toBeDisabled();
  });

  it('STALE durumda butonlar disabled', () => {
    render(<IslemlerTab {...defaults} device={{ ...baseDevice, status: 'STALE' }} />);
    expect(screen.getByTestId('command-button-COLLECT_INVENTORY')).toBeDisabled();
  });

  it('DECOMMISSIONED durumda butonlar disabled', () => {
    render(<IslemlerTab {...defaults} device={{ ...baseDevice, status: 'DECOMMISSIONED' }} />);
    expect(screen.getByTestId('command-button-LOCK_USER_LOGIN')).toBeDisabled();
  });

  it('ONLINE durumda butonlar enabled', () => {
    render(<IslemlerTab {...defaults} device={baseDevice} />);
    expect(screen.queryByTestId('islemler-offline-banner')).toBeNull();
    expect(screen.getByTestId('command-button-COLLECT_INVENTORY')).not.toBeDisabled();
    expect(screen.getByTestId('command-button-LOCK_USER_LOGIN')).not.toBeDisabled();
  });
});

describe('IslemlerTab — non-destructive flow', () => {
  it('COLLECT_INVENTORY click onIssueCommand tetikler (full 8 opt-in bit payload)', () => {
    // WEB-018 (Faz 22.5.x) — "Envanteri Şimdi Topla" originally set 3
    // opt-in bits (includeSoftware + includeWinGetEgress +
    // includeHardware). Codex 019e8389 AG-039 must_fix #1 absorb:
    // every drawer tab that consumes a separate probe-output snapshot
    // must have its corresponding opt-in bit set here, or the
    // canonical "trigger every probe" button degenerates into "trigger
    // some probes". Now ships 8 bits — software + winget-egress +
    // hardware + device-health (AG-033) + outdated software (AG-036) +
    // hotfix posture (AG-037) + agent diagnostics (AG-038) + critical
    // services (AG-039). Backend ingests whichever blocks the agent
    // emits; missing bits just leave those tabs at the 404 empty state.
    // Field name `payload` matches the backend
    // CreateEndpointCommandRequest record (Map<String, Object>).
    const onIssueCommand = vi.fn();
    render(<IslemlerTab {...defaults} device={baseDevice} onIssueCommand={onIssueCommand} />);
    fireEvent.click(screen.getByTestId('command-button-COLLECT_INVENTORY'));
    expect(onIssueCommand).toHaveBeenCalledWith({
      type: 'COLLECT_INVENTORY',
      payload: {
        includeSoftware: true,
        includeWinGetEgress: true,
        includeHardware: true,
        includeDeviceHealth: true,
        includeOutdatedSoftware: true,
        includeHotfixPosture: true,
        includeDiagnostics: true,
        includeServices: true,
        includeStartupExposure: true,
        includeAppControl: true,
      },
    });
  });
});

describe('IslemlerTab — destructive modal flow', () => {
  it('LOCK_USER_LOGIN butonu modal acar (henuz onIssueCommand cagrilmaz)', () => {
    const onIssueCommand = vi.fn();
    render(<IslemlerTab {...defaults} device={baseDevice} onIssueCommand={onIssueCommand} />);
    fireEvent.click(screen.getByTestId('command-button-LOCK_USER_LOGIN'));
    expect(screen.getByTestId('destructive-command-modal')).toBeInTheDocument();
    expect(onIssueCommand).not.toHaveBeenCalled();
  });

  it('modal cancel sonrasi modal kapanir', () => {
    render(<IslemlerTab {...defaults} device={baseDevice} />);
    fireEvent.click(screen.getByTestId('command-button-LOCK_USER_LOGIN'));
    fireEvent.click(screen.getByTestId('destructive-command-cancel'));
    expect(screen.queryByTestId('destructive-command-modal')).toBeNull();
  });
});

describe('IslemlerTab — toast surfaces', () => {
  it('lastIssuedCommandId set iken success banner gosterir', () => {
    render(
      <IslemlerTab
        {...defaults}
        device={baseDevice}
        lastIssuedCommandId="cmd-123"
        lastIssuedRequiresApproval={false}
      />,
    );
    const toast = screen.getByTestId('islemler-success-toast');
    expect(toast.textContent).toContain('cmd-123');
  });

  it('lastIssuedRequiresApproval=true iken PENDING text gosterir', () => {
    render(
      <IslemlerTab
        {...defaults}
        device={baseDevice}
        lastIssuedCommandId="cmd-456"
        lastIssuedRequiresApproval
      />,
    );
    expect(screen.getByTestId('islemler-success-toast').textContent).toMatch(
      /ikinci yönetici|second-admin/i,
    );
  });

  it('lastError set iken error banner gosterir', () => {
    render(<IslemlerTab {...defaults} device={baseDevice} lastError="403 — yetkisiz" />);
    expect(screen.getByTestId('islemler-error-toast').textContent).toBe('403 — yetkisiz');
  });

  it('CHANGE_LOCAL_PASSWORD response one-time password banner gosterir', () => {
    render(
      <IslemlerTab
        {...defaults}
        device={baseDevice}
        lastIssuedCommandId="cmd-local-1"
        lastIssuedRequiresApproval
        lastIssuedLocalPassword="Abc12345!"
      />,
    );
    expect(screen.getByTestId('local-password-one-time-banner')).toBeInTheDocument();
    expect(screen.getByTestId('local-password-one-time-value').textContent).toBe('Abc12345!');
  });
});
