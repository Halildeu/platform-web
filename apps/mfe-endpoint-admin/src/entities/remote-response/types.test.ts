import { describe, expect, it } from 'vitest';
import {
  buildDefaultRemoteResponseGateState,
  canDispatchApprovedRemoteOperation,
  canUnlockRemoteTerminal,
} from './types';

describe('remote-response gate helpers', () => {
  it('default state fail-closed render eder', () => {
    const state = buildDefaultRemoteResponseGateState('device-1');
    expect(canDispatchApprovedRemoteOperation(state)).toBe(false);
    expect(canUnlockRemoteTerminal(state)).toBe(false);
    expect(state.recordingActive).toBe(false);
  });

  it('approved operation icin onay, step-up, consent, transport ve session ister', () => {
    const state = {
      ...buildDefaultRemoteResponseGateState('device-1'),
      bridgeConnected: true,
      approvalActive: true,
      stepUpVerified: true,
      consentActive: true,
      ttlSecondsRemaining: 600,
      sessionId: 'rr-1',
    };
    expect(canDispatchApprovedRemoteOperation(state)).toBe(true);
    expect(canUnlockRemoteTerminal(state)).toBe(false);
  });

  it('terminal icin recording gate de aktif olmalidir', () => {
    const state = {
      ...buildDefaultRemoteResponseGateState('device-1'),
      bridgeConnected: true,
      approvalActive: true,
      stepUpVerified: true,
      consentActive: true,
      recordingActive: true,
      ttlSecondsRemaining: 600,
      sessionId: 'rr-1',
    };
    expect(canUnlockRemoteTerminal(state)).toBe(true);
  });
});
