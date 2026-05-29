/**
 * WEB device-health view — Faz 22.5 second wave (AG-033 → backend
 * ingest → web view). Mirrors the WEB-013 hardware-inventory entity
 * precedent.
 *
 * Wire shape is frozen by the cross-repo contract:
 *   platform-k8s-gitops/schema/endpoint-device-health-payload-v1.schema.json
 *   (AG-033 v1, schemaVersion=1; source of truth =
 *    platform-agent internal/inventory/device_health.go DeviceHealthResult).
 *
 * Field names match the contract / backend record component names
 * exactly so the RTK Query slice does not need a mapping layer.
 *
 * Security invariant (do NOT widen): the disk block carries
 * `driveLetter` only — NO volume label / serial / filesystem / mount
 * path / GUID; `lastBootEpochSec` is unix seconds (never a local-time
 * string); `probeError.summary` is bounded operator text. Thresholds
 * (LowDisk / HighPressure / LongUptime) are agent-side const and are
 * NOT carried on the wire.
 */

import type { SpringPage } from '../endpoint-software-catalog/types';

/** Probe source. `win32` = direct Win32 syscalls; `none` = no probe ran. */
export type DeviceHealthSource = 'win32' | 'none';

/** Typed probe-error code enum (contract `$defs/probeError.code`). */
export type DeviceHealthProbeErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'DISK_ENUM_FAILED'
  | 'MEMORY_QUERY_FAILED'
  | 'UPTIME_QUERY_FAILED'
  | 'BOOT_TIME_FAILED'
  | 'NO_EVIDENCE';

/**
 * Per-volume fixed-disk health. `driveLetter` matches `^[A-Z]:$`.
 * `freeBytes` is freeBytesAvailableToCaller (LocalSystem-writable) —
 * the correct denominator for a "can this install succeed?" gate.
 */
export interface DeviceHealthFixedDisk {
  driveLetter: string;
  totalBytes: number;
  freeBytes: number;
  freePercent: number;
  lowDiskWarning: boolean;
}

/** Physical/commit memory health. `usedPercent` is 0..100. */
export interface DeviceHealthMemory {
  totalPhysicalBytes: number;
  availableBytes: number;
  usedPercent: number;
  highPressureWarning: boolean;
  commitLimitBytes: number;
  commitUsedBytes: number;
}

/** Uptime/last-boot health. `lastBootEpochSec` is unix seconds. */
export interface DeviceHealthUptime {
  lastBootEpochSec: number;
  uptimeSeconds: number;
  uptimeDays: number;
  longUptimeWarning: boolean;
}

/** Typed probe error. Any entry flips `probeComplete=false`. */
export interface DeviceHealthProbeError {
  source?: DeviceHealthSource;
  code: DeviceHealthProbeErrorCode;
  summary?: string;
}

/**
 * The AG-033 v1 device-health probe block. `probeComplete=false` is
 * fail-closed: treat as "evidence incomplete", never render the
 * zero-values as a healthy device. `supported=false` on non-Windows
 * runtimes.
 *
 * This is the validated wire block (contract root). The backend ingest
 * persists it (append-only snapshot, BE-022 precedent); the latest/
 * history endpoints surface it. The backend may fold persistence
 * metadata (id / deviceId / collectedAt) around the block — those are
 * declared optionally on {@link DeviceHealthSnapshot} so the view can
 * use the snapshot envelope's own `deviceId` for the stale-guard.
 */
export interface DeviceHealthPayload {
  schemaVersion: number;
  supported: boolean;
  probeComplete: boolean;
  fixedDisks: DeviceHealthFixedDisk[];
  fixedDiskCount: number;
  fixedDisksTruncated: boolean;
  maxFixedDisks: number;
  memory: DeviceHealthMemory;
  uptime: DeviceHealthUptime;
  anyLowDisk: boolean;
  sourceUsed: DeviceHealthSource;
  probeErrors?: DeviceHealthProbeError[];
  probeDurationMs: number;
}

/**
 * Latest device-health snapshot response. The contract payload block
 * plus the backend persistence envelope (mirrors the BE-022Q hardware
 * snapshot shape: id / tenantId / deviceId / collectedAt around the
 * validated block). The persistence-envelope fields are typed as the
 * union of "present" (real backend) and "absent" (golden-example
 * verbatim) so the golden contract examples — which are just the
 * payload block — type-check directly as a snapshot.
 */
export interface DeviceHealthSnapshot extends DeviceHealthPayload {
  id?: string;
  tenantId?: string;
  deviceId?: string;
  sourceCommandResultId?: string | null;
  payloadHashSha256?: string;
  collectedAt?: string;
  createdAt?: string;
}

/**
 * History-summary projection — no child disks array, surfaces the
 * warning booleans + counts for the accordion list view (mirrors the
 * WEB-013 hardware history summary).
 */
export interface DeviceHealthSnapshotSummary {
  id: string;
  deviceId: string;
  schemaVersion: number;
  supported: boolean;
  probeComplete: boolean;
  anyLowDisk: boolean;
  fixedDiskCount: number;
  memoryUsedPercent: number | null;
  memoryHighPressure: boolean;
  uptimeDays: number | null;
  longUptimeWarning: boolean;
  sourceUsed: DeviceHealthSource;
  collectedAt: string;
  createdAt: string;
}

export interface GetDeviceHealthLatestArgs {
  deviceId: string;
}

export interface GetDeviceHealthHistoryArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

/** Spring Page envelope per the BE-022 history precedent. */
export type DeviceHealthHistoryPage = SpringPage<DeviceHealthSnapshotSummary>;
