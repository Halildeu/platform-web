/**
 * Backend DTO mirror — `EndpointDeviceDto` (record).
 *
 * Source-of-truth (e9cb8dd0):
 *   platform-backend / endpoint-admin-service /
 *     src/main/java/com/example/endpointadmin/dto/v1/admin/EndpointDeviceDto.java
 *     src/main/java/com/example/endpointadmin/model/{DeviceStatus,OsType}.java
 *
 * `Instant` fields serialize as ISO-8601 strings on the wire (Jackson
 * default).
 */

export type DeviceStatus = 'PENDING_ENROLLMENT' | 'ONLINE' | 'STALE' | 'OFFLINE' | 'DECOMMISSIONED';

export type OsType = 'WINDOWS' | 'MACOS' | 'LINUX' | 'UNKNOWN';

export interface EndpointDevice {
  id: string;
  tenantId: string;
  hostname: string;
  /**
   * Codex iter-1 must-fix #1: backend `EndpointDevice` entity columns
   * `display_name`, `os_version`, `agent_version`,
   * `machine_fingerprint`, `domain_name` are nullable. The DTO mapper
   * passes them through directly, so the wire payload may contain
   * `null`. Mirror that nullability here so consumers always handle
   * the missing-value path.
   */
  displayName: string | null;
  osType: OsType;
  osVersion: string | null;
  agentVersion: string | null;
  machineFingerprint: string | null;
  domainName: string | null;
  status: DeviceStatus;
  /** ISO-8601 timestamp from `Instant`. */
  lastSeenAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  enrolledAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  createdAt: string;
  /** ISO-8601 timestamp from `Instant`. */
  updatedAt: string;
}

/** Static map for surfacing translatable status badges in the grid. */
export const DEVICE_STATUS_VALUES: readonly DeviceStatus[] = [
  'PENDING_ENROLLMENT',
  'ONLINE',
  'STALE',
  'OFFLINE',
  'DECOMMISSIONED',
] as const;

export const OS_TYPE_VALUES: readonly OsType[] = ['WINDOWS', 'MACOS', 'LINUX', 'UNKNOWN'] as const;
