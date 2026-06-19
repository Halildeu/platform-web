export type RemoteResponseMode = 'OPERATION_CATALOG' | 'APPROVED_SCRIPT' | 'BREAK_GLASS_TERMINAL';

export interface RemoteResponseGateState {
  deviceId: string | null;
  deviceOnline: boolean;
  bridgeConnected: boolean;
  approvalActive: boolean;
  stepUpVerified: boolean;
  consentActive: boolean;
  recordingActive: boolean;
  ttlSecondsRemaining: number;
  sessionId: string | null;
  denyReason: string | null;
}

export type RemoteResponseSessionPhase =
  | 'MISSING'
  | 'PENDING'
  | 'APPROVED'
  | 'STEP_UP_VERIFIED'
  | 'CONSENT_GRANTED'
  | 'ACTIVE'
  | 'DENIED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'TERMINATED';

export interface RemoteResponseRecordingMetadata {
  chainId: string;
  lastEventKind: 'POLICY_EVENT' | 'AGENT_OUTPUT' | 'DATA' | 'SESSION_END' | 'UNKNOWN';
  redactionClass: 'NONE' | 'METADATA_ONLY' | 'REDACTED' | 'SENSITIVE';
  evidenceUrl: string | null;
}

export interface RemoteResponseSessionState {
  deviceId: string;
  sessionId: string | null;
  phase: RemoteResponseSessionPhase;
  deviceOnline: boolean;
  bridgeConnected: boolean;
  approvalActive: boolean;
  stepUpVerified: boolean;
  consentActive: boolean;
  recordingActive: boolean;
  ttlSecondsRemaining: number;
  denyReason: string | null;
  recording: RemoteResponseRecordingMetadata | null;
}

export interface ApprovedRemoteScriptOption {
  id: string;
  version: number;
  hash: string;
  label: string;
}

// UX mirror only. Backend/operator API remains the security boundary.
export const buildDefaultRemoteResponseGateState = (
  deviceId: string | null,
): RemoteResponseGateState => ({
  deviceId,
  deviceOnline: Boolean(deviceId),
  bridgeConnected: false,
  approvalActive: false,
  stepUpVerified: false,
  consentActive: false,
  recordingActive: false,
  ttlSecondsRemaining: 0,
  sessionId: null,
  denyReason: deviceId ? 'REMOTE_RESPONSE_GATE_PENDING' : 'DEVICE_REQUIRED',
});

export const buildRemoteResponseGateState = (
  deviceId: string | null,
  sessionState: RemoteResponseSessionState | null | undefined,
): RemoteResponseGateState => {
  const fallback = buildDefaultRemoteResponseGateState(deviceId);
  if (!deviceId || !sessionState || sessionState.deviceId !== deviceId) {
    return fallback;
  }
  const sessionActive = sessionState.phase === 'ACTIVE';
  return {
    deviceId,
    deviceOnline: sessionActive && sessionState.deviceOnline,
    bridgeConnected: sessionActive && sessionState.bridgeConnected,
    approvalActive: sessionActive && sessionState.approvalActive,
    stepUpVerified: sessionActive && sessionState.stepUpVerified,
    consentActive: sessionActive && sessionState.consentActive,
    recordingActive: sessionActive && sessionState.recordingActive,
    ttlSecondsRemaining: sessionActive
      ? Math.max(0, Math.floor(sessionState.ttlSecondsRemaining))
      : 0,
    sessionId: sessionActive ? sessionState.sessionId : null,
    denyReason: sessionState.denyReason,
  };
};

export const canDispatchApprovedRemoteOperation = (state: RemoteResponseGateState): boolean =>
  state.deviceOnline &&
  state.bridgeConnected &&
  state.approvalActive &&
  state.stepUpVerified &&
  state.consentActive &&
  state.ttlSecondsRemaining > 0 &&
  Boolean(state.sessionId);

export const canUnlockRemoteTerminal = (state: RemoteResponseGateState): boolean =>
  canDispatchApprovedRemoteOperation(state) && state.recordingActive;

export const APPROVED_REMOTE_SCRIPT_OPTIONS: readonly ApprovedRemoteScriptOption[] = [
  {
    id: 'DIAG_HOSTNAME',
    version: 1,
    hash: 'b381ceb8eeba1a24a20f555807180a7f793697fcd11dbf016857e15c48da3f77',
    label: 'DIAG_HOSTNAME v1',
  },
];

const unsafeRemoteResponseKeyPattern =
  /(token|secret|privatekey|credential|password|certificate|bearer|jwt|cookie)/i;

export const collectRemoteResponseBrowserUnsafePaths = (value: unknown, path = '$'): string[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectRemoteResponseBrowserUnsafePaths(entry, `${path}[${index}]`),
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const keyPath = `${path}.${key}`;
    const keyHit = unsafeRemoteResponseKeyPattern.test(key) ? [keyPath] : [];
    return keyHit.concat(collectRemoteResponseBrowserUnsafePaths(nested, keyPath));
  });
};
