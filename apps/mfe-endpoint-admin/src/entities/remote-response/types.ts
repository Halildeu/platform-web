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
