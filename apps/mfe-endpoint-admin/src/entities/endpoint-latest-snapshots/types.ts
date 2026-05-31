/**
 * WEB — fleet-wide bulk latest-snapshots response (#1146), feeding the
 * device-inventory CSV-export v2 columns in ONE round-trip instead of an
 * N-per-row client fetch storm.
 *
 * Mirrors the backend `AdminEndpointLatestSnapshotsResponse` FLAT DTOs
 * (`AdminDeviceHealthLatestEntry` / `AdminOutdatedSoftwareLatestEntry`):
 * scalar summary fields ONLY — NO child `disks[]`/`packages[]`, NO
 * `redacted_payload`. Each entry carries its `deviceId` so the page can
 * key the per-device lookup maps the column builder consumes.
 *
 * <h4>Per-group truncation = fail-closed against false-absence</h4>
 * When a group exceeds the server cap it is returned as an EMPTY list with
 * its `*Truncated` flag `true`. The page then drops that group's columns
 * entirely: a device missing from a NON-truncated group is an
 * authoritative "no snapshot", but in a truncated group "missing" would be
 * ambiguous, so the columns are omitted rather than emitting a
 * false-absence blank cell.
 */

export interface DeviceHealthLatestEntry {
  deviceId: string;
  supported: boolean | null;
  probeComplete: boolean | null;
  anyLowDisk: boolean | null;
  memoryUsedPercent: number | null;
  memoryHighPressure: boolean | null;
  uptimeDays: number | null;
  longUptimeWarning: boolean | null;
  collectedAt: string | null;
}

export interface OutdatedSoftwareLatestEntry {
  deviceId: string;
  supported: boolean | null;
  probeComplete: boolean | null;
  upgradeCount: number;
  upgradeTruncated: boolean | null;
  maxUpgrade: number;
  possiblyTruncated: boolean | null;
  collectedAt: string | null;
}

export interface EndpointLatestSnapshots {
  deviceHealth: DeviceHealthLatestEntry[];
  deviceHealthTruncated: boolean;
  outdatedSoftware: OutdatedSoftwareLatestEntry[];
  outdatedSoftwareTruncated: boolean;
  limit: number;
}
