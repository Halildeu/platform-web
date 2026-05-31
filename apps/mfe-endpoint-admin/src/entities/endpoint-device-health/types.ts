/**
 * WEB device-health view — Faz 22.5 second wave (AG-033 → backend
 * ingest → web view). Mirrors the WEB-013 hardware-inventory entity
 * precedent.
 *
 * SHAPE SOURCE OF TRUTH = the backend QUERY DTO, not the agent-wire
 * contract. The latest/history endpoints return the FLAT projection
 *   endpoint-admin-service AdminDeviceHealthSnapshotResponse
 *   + AdminDeviceHealthDiskResponse (whitelisted scalar columns +
 *     bounded probeErrors[] + child disks[]).
 * It does NOT nest `memory` / `uptime` objects and it does NOT surface
 * the agent-wire `redacted_payload` (the memory BYTE totals — total /
 * available / commit — live only inside that JSONB and are NOT exposed
 * by the DTO, so they are NOT modelled here and the view does not read
 * them). The disk list arrives under `disks` (NOT `fixedDisks`).
 *
 * Historical note (#705 real-data render crash): these types used to
 * mirror the agent-wire contract's NESTED block (`memory:{…}`,
 * `uptime:{…}`, `fixedDisks:[…]`). The deployed view destructured
 * `const { memory, uptime } = snapshot` and crashed
 * (`Cannot read properties of undefined (reading 'usedPercent')`) the
 * moment it received a REAL flat-DTO snapshot. The web tests passed
 * only because their fixtures used the contract NESTED shape — i.e.
 * they tested the wrong shape. The types + view + fixtures are now
 * aligned to the flat DTO field-for-field.
 *
 * Field names match the backend record component names exactly so the
 * RTK Query slice does not need a mapping layer.
 *
 * Security invariant (do NOT widen): each disk row carries
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
 * Per-volume fixed-disk health — the `AdminDeviceHealthDiskResponse`
 * record shape. `driveLetter` matches `^[A-Z]:$`. `freeBytes` is
 * freeBytesAvailableToCaller (LocalSystem-writable) — the correct
 * denominator for a "can this install succeed?" gate. The byte / percent
 * fields are nullable boxed types on the backend (`Long` / `Short`), so
 * they are typed `| null` and null-guarded at the render site.
 */
export interface DeviceHealthFixedDisk {
  driveLetter: string;
  totalBytes: number | null;
  freeBytes: number | null;
  freePercent: number | null;
  lowDiskWarning: boolean | null;
}

/** Typed probe error. Any entry flips `probeComplete=false`. */
export interface DeviceHealthProbeError {
  source?: DeviceHealthSource;
  code: DeviceHealthProbeErrorCode;
  summary?: string;
}

/**
 * The flat device-health snapshot projection — `probeComplete=false`
 * is fail-closed: treat as "evidence incomplete", never render the
 * zero-values as a healthy device. `supported=false` on non-Windows
 * runtimes.
 *
 * Field-for-field this is the backend `AdminDeviceHealthSnapshotResponse`
 * record (FLAT — no nested `memory` / `uptime`):
 *  - memory summary  → `memoryUsedPercent` (0..100) + `memoryHighPressure`
 *  - uptime summary  → `uptimeDays` / `uptimeSeconds` / `lastBootEpochSec`
 *                      / `longUptimeWarning`
 *  - fixed disks     → `disks[]` (NOT `fixedDisks`)
 * The memory BYTE totals (total / available / commit) are NOT on the DTO
 * — they live only inside the agent-wire `redacted_payload` JSONB, which
 * the DTO deliberately does not surface — so they are absent here and
 * the view does not render those rows.
 *
 * The nullable boxed backend types (`Short` / `Integer` / `Long` /
 * `Boolean`) are modelled `| null`; every read site null-guards.
 */
export interface DeviceHealthPayload {
  schemaVersion: number | null;
  supported: boolean | null;
  probeComplete: boolean | null;
  disks: DeviceHealthFixedDisk[];
  fixedDiskCount: number | null;
  fixedDisksTruncated: boolean | null;
  maxFixedDisks: number | null;
  memoryUsedPercent: number | null;
  memoryHighPressure: boolean | null;
  uptimeDays: number | null;
  uptimeSeconds: number | null;
  lastBootEpochSec: number | null;
  longUptimeWarning: boolean | null;
  anyLowDisk: boolean | null;
  sourceUsed: DeviceHealthSource | null;
  probeDurationMs: number | null;
  probeErrors?: DeviceHealthProbeError[];
}

/**
 * Latest device-health snapshot response — the flat
 * `AdminDeviceHealthSnapshotResponse` record. The persistence-envelope
 * fields (id / tenantId / deviceId / collectedAt / createdAt /
 * payloadHashSha256 / sourceCommandResultId) are always present on the
 * real DTO; they are declared optional so a partial test fixture stays
 * convenient and the view can use the envelope's own `deviceId` for the
 * stale-guard.
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
