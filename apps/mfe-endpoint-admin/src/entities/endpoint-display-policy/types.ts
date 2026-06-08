/**
 * Backend DTO mirror — #508 Endpoint Display Policy (Faz 22.5).
 *
 * Source-of-truth (platform-backend):
 *   endpoint-admin-service/src/main/java/com/example/endpointadmin/
 *     dto/v1/admin/AdminDisplayPolicyResponse.java
 *     dto/v1/admin/SetDisplayPolicyRequest.java
 *     dto/v1/admin/ClearDisplayPolicyRequest.java
 *     model/DisplayPolicyOperation.java  model/WallpaperStyle.java
 *
 * `Instant` fields serialize as ISO-8601 strings (Jackson default).
 */

export type DisplayPolicyOperation = 'ENFORCE' | 'CLEAR';

export type WallpaperStyle = 'CENTER' | 'STRETCH' | 'FIT' | 'FILL' | 'SPAN';

export const WALLPAPER_STYLES: readonly WallpaperStyle[] = [
  'CENTER',
  'STRETCH',
  'FIT',
  'FILL',
  'SPAN',
] as const;

/**
 * The exact built-in System32 screensavers the backend allowlists
 * (DisplayPolicyValidator.ALLOWED_SCR_LOWER). The UI offers ONLY these so a
 * proposal never fails the fail-closed `.scrPath` validator.
 */
export const ALLOWED_SCR_PATHS: readonly string[] = [
  'C:\\Windows\\System32\\scrnsave.scr',
  'C:\\Windows\\System32\\mystify.scr',
  'C:\\Windows\\System32\\ribbons.scr',
  'C:\\Windows\\System32\\bubbles.scr',
  'C:\\Windows\\System32\\PhotoScreensaver.scr',
  'C:\\Windows\\System32\\ssText3d.scr',
] as const;

export interface DisplayPolicyScreensaver {
  enabled?: boolean | null;
  timeoutSeconds?: number | null;
  secureOnResume?: boolean | null;
  scrPath?: string | null;
}

export interface DisplayPolicyWallpaper {
  enabled?: boolean | null;
  style?: string | null;
  userCannotChange?: boolean | null;
  assetRef?: string | null;
  assetSha256?: string | null;
  contentType?: string | null;
}

/** A maker-checker proposal not yet enacted (PENDING / APPROVED-undispatched). */
export interface DisplayPolicyOpenProposal {
  revisionId: string;
  commandId: string | null;
  operation: DisplayPolicyOperation | null;
  policyHashSha256: string | null;
  approvalStatus: string | null;
  commandStatus: string | null;
  createdBySubject: string | null;
  createdAt: string | null;
}

/** GET / PUT / DELETE response — current desired-state + open proposal. */
export interface DisplayPolicyResponse {
  deviceId: string;
  operation: DisplayPolicyOperation | null;
  screensaver: DisplayPolicyScreensaver | null;
  wallpaper: DisplayPolicyWallpaper | null;
  policyHashSha256: string | null;
  clearedAt: string | null;
  clearedBySubject: string | null;
  lastEnforcementStatus: string | null;
  lastEnforcedAt: string | null;
  currentRevisionId: string | null;
  createdBySubject: string | null;
  createdAt: string | null;
  lastUpdatedBySubject: string | null;
  lastUpdatedAt: string | null;
  openProposal: DisplayPolicyOpenProposal | null;
}

/** PUT body (operation is always ENFORCE on this endpoint). */
export interface SetDisplayPolicyRequest {
  operation: 'ENFORCE';
  reason: string;
  screensaver?: DisplayPolicyScreensaver | null;
  wallpaper?: DisplayPolicyWallpaper | null;
}

export interface SetDisplayPolicyArgs {
  deviceId: string;
  body: SetDisplayPolicyRequest;
}

export interface ClearDisplayPolicyArgs {
  deviceId: string;
  reason: string;
}
