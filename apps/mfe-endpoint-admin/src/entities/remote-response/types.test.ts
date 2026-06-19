import { describe, expect, it } from 'vitest';
import {
  buildDefaultRemoteResponseGateState,
  buildRemoteResponseGateState,
  canDispatchApprovedRemoteOperation,
  canUnlockRemoteTerminal,
  collectRemoteResponseBrowserUnsafePaths,
  type RemoteResponseSessionState,
} from './types';

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

  it('backend-fed active session state terminal gate acabilir', () => {
    const state = buildRemoteResponseGateState('device-1', activeSession());
    expect(canDispatchApprovedRemoteOperation(state)).toBe(true);
    expect(canUnlockRemoteTerminal(state)).toBe(true);
    expect(state.sessionId).toBe('rr-1');
  });

  it.each([
    ['deviceOnline', { deviceOnline: false }],
    ['bridgeConnected', { bridgeConnected: false }],
    ['approvalActive', { approvalActive: false }],
    ['stepUpVerified', { stepUpVerified: false }],
    ['consentActive', { consentActive: false }],
    ['ttlSecondsRemaining', { ttlSecondsRemaining: 0 }],
    ['sessionId', { sessionId: null }],
  ] as const)('approved operation gate %s eksikken kapali kalir', (_field, override) => {
    const state = buildRemoteResponseGateState('device-1', {
      ...activeSession(),
      ...override,
    });
    expect(canDispatchApprovedRemoteOperation(state)).toBe(false);
    expect(canUnlockRemoteTerminal(state)).toBe(false);
  });

  it('recording eksikken approved script acilir ama terminal kapali kalir', () => {
    const state = buildRemoteResponseGateState('device-1', {
      ...activeSession(),
      recordingActive: false,
      recording: null,
    });
    expect(canDispatchApprovedRemoteOperation(state)).toBe(true);
    expect(canUnlockRemoteTerminal(state)).toBe(false);
  });

  it('device mismatch backend-fed state ignored and fail-closed kalir', () => {
    const state = buildRemoteResponseGateState('device-2', activeSession());
    expect(state.deviceId).toBe('device-2');
    expect(canDispatchApprovedRemoteOperation(state)).toBe(false);
    expect(canUnlockRemoteTerminal(state)).toBe(false);
  });

  it('phase ACTIVE degilse booleanlar true olsa bile fail-closed kalir', () => {
    const state = buildRemoteResponseGateState('device-1', {
      ...activeSession(),
      phase: 'DENIED',
      denyReason: 'REMOTE_RESPONSE_DENIED',
    });
    expect(state.sessionId).toBeNull();
    expect(state.ttlSecondsRemaining).toBe(0);
    expect(canDispatchApprovedRemoteOperation(state)).toBe(false);
    expect(canUnlockRemoteTerminal(state)).toBe(false);
  });

  it('browser-visible fixture secret keylerini yakalar', () => {
    const hits = collectRemoteResponseBrowserUnsafePaths({
      ...activeSession(),
      bearerToken: 'Bearer redacted',
      nested: { privateKey: 'redacted' },
    });
    expect(hits).toEqual(['$.bearerToken', '$.nested.privateKey']);
    expect(collectRemoteResponseBrowserUnsafePaths(activeSession())).toEqual([]);
  });
});
