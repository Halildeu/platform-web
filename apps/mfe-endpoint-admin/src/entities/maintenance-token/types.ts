// BE-027 — device maintenance tokens (one-time short-lived secrets the operator
// hands to a device so the agent can STOP_AGENT / UNINSTALL_AGENT itself).
//
// SECURITY: the raw token is a SECRET. The backend hashes it at rest
// (token_hash) and returns the cleartext value ONLY in the create response —
// list/get NEVER return it. Treat the cleartext as write-once display material:
// show it once, never persist/log/URL it, drop it from memory on dismiss.

// Mirror of backend model/MaintenanceAction.java.
export type MaintenanceAction = 'STOP_AGENT' | 'UNINSTALL_AGENT';

// Mirror of backend model/MaintenanceTokenStatus.java.
export type MaintenanceTokenStatus = 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';

/** List/get shape — metadata only, NO cleartext token. */
export interface MaintenanceTokenDto {
  id: string;
  tenantId: string;
  deviceId: string;
  action: MaintenanceAction;
  status: MaintenanceTokenStatus;
  reason: string;
  issuedBySubject: string | null;
  expiresAt: string;
  consumedAt: string | null;
  consumedByAgentVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceTokenBody {
  action: MaintenanceAction;
  reason: string;
  /** 1..10080 (max 7 days). */
  expiresInMinutes: number;
}

export interface CreateMaintenanceTokenArgs {
  deviceId: string;
  body: CreateMaintenanceTokenBody;
}

/**
 * Create response — the ONLY place the cleartext `token` is ever returned.
 * Display once, then discard. Do not store, log, or place it in a URL.
 */
export interface CreateMaintenanceTokenResponse {
  tokenId: string;
  token: string;
  expiresAt: string;
}

export interface ListMaintenanceTokensArgs {
  deviceId: string;
}

export interface RevokeMaintenanceTokenArgs {
  /** Path param. */
  tokenId: string;
  /** Not sent — used only to scope cache invalidation to the device's list. */
  deviceId: string;
}
