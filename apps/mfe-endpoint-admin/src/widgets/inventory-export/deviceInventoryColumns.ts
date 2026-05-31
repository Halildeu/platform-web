/**
 * WEB-015 v1 + v2 — Device inventory CSV column set.
 *
 * v1 STRICT SCOPE (Codex guardrail): only fields already present on the
 * `EndpointDevice` DTO (i.e. data already fetched via
 * `useListEndpointDevicesQuery`). Keeping the column accessor pure means
 * the same rows the grid shows are exactly what the CSV serialises.
 *
 * v2 (Faz 22.5 WEB-015 v2 — AG-033 device-health + AG-036
 * outdated-software): ADDITIVELY appends per-device SUMMARY columns when
 * (and only when) the caller supplies the corresponding per-device
 * snapshot lookup map. When `opts` (or a given map) is absent the v1
 * column set is returned verbatim — v2 is purely additive, with ZERO
 * behaviour change for a v1 caller. Passing a map is the caller's
 * explicit opt-in to the new columns.
 *
 * Redaction boundary (do NOT widen — both contracts machine-enforce
 * `additionalProperties:false` in
 * platform-k8s-gitops/schema/endpoint-device-health-payload-v1.schema.json
 * and …/endpoint-outdated-software-payload-v1.schema.json):
 *  - device-health → summary signals ONLY (flat
 *    AdminDeviceHealthSnapshotResponse columns): supported / probeComplete
 *    / anyLowDisk / memoryUsedPercent / memoryHighPressure / uptimeDays /
 *    longUptimeWarning. NO per-disk rows, NO volume label / serial /
 *    filesystem / mount path (only `driveLetter` exists on the wire and
 *    even that is NOT exported).
 *  - outdated-software → supported / probeComplete / upgradeCount /
 *    "has upgrades" / "possibly truncated". NO per-package detail in v2
 *    (deferred to a v2.1 follow-up); the only package-level keys that
 *    could ever leave the wire are {packageId, installedVersion,
 *    availableVersion} and none of them are exported here.
 *
 * Fail-closed sentinels (mirrors the drawer view's strict precedence:
 * absent → unsupported → incomplete → real value): an absent snapshot,
 * `supported=false`, or `probeComplete=false` NEVER serialises as a
 * misleading "0 upgrades" / "healthy" — each yields an explicit sentinel
 * cell so an operator reading the CSV cannot mistake "no evidence" for
 * "good".
 */

import type { DeviceHealthSnapshot } from '../../entities/endpoint-device-health/types';
import type { OutdatedSoftwareSnapshot } from '../../entities/endpoint-outdated-software/types';
import type { EndpointDevice, OsType } from '../../entities/endpoint-device/types';
import type { CsvColumn } from '../../lib/csv-export';

const OS_LABEL: Record<OsType, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  LINUX: 'Linux',
  UNKNOWN: '—',
};

/**
 * Per-device snapshot lookups for the v2 columns. Each map is keyed by
 * `EndpointDevice.id`; a missing entry means "no snapshot for this
 * device" and serialises as an empty cell (fail-closed). Supplying a map
 * is the caller's explicit opt-in to the corresponding column block.
 *
 * Both maps are independent: a caller may export device-health columns
 * without outdated-software columns and vice versa.
 */
export interface DeviceInventoryColumnSources {
  /** AG-033 device-health latest snapshot per device id. */
  healthByDeviceId?: ReadonlyMap<string, DeviceHealthSnapshot>;
  /** AG-036 outdated-software latest snapshot per device id. */
  outdatedByDeviceId?: ReadonlyMap<string, OutdatedSoftwareSnapshot>;
}

/**
 * Render an ISO timestamp into a locale string for the CSV cell, leaving
 * blanks for null and passing through any unparseable value verbatim so
 * we never silently drop data.
 */
function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

/**
 * Map a boolean to a localised Evet/Hayır cell. CSV consumers (and the
 * unit tests) get a deterministic, machine-parsable string rather than a
 * check glyph. The flat DTO booleans are nullable boxed types; a
 * null/undefined is rendered fail-closed as "Hayır" (never silently
 * treated as a healthy/positive value).
 */
function yesNo(t: (key: string) => string, value: boolean | null | undefined): string {
  return value ? t('endpointAdmin.export.val.yes') : t('endpointAdmin.export.val.no');
}

/**
 * Classify a snapshot's evidence state for the fail-closed precedence.
 * `absent` → no snapshot for the device (never probed / 404).
 * `unsupported` → probe not supported on this runtime (non-Windows).
 * `incomplete` → a probeError flipped probeComplete=false; values are
 *                degenerate and MUST NOT be read as healthy/up-to-date.
 * `ok` → a complete, supported snapshot whose real values may be read.
 */
type EvidenceState = 'absent' | 'unsupported' | 'incomplete' | 'ok';

function evidenceState(
  snapshot: { supported: boolean | null; probeComplete: boolean | null } | undefined,
): EvidenceState {
  if (!snapshot) return 'absent';
  // Nullable boxed booleans on the flat DTO: a null supported /
  // probeComplete is treated fail-closed (unsupported / incomplete) so a
  // missing flag never serialises as a healthy/up-to-date row.
  if (!snapshot.supported) return 'unsupported';
  if (!snapshot.probeComplete) return 'incomplete';
  return 'ok';
}

/**
 * The sentinel cell for a non-`ok` evidence state, or `null` when the
 * state IS `ok` (caller should then read the real value). Centralising
 * this keeps every dependent column's fail-closed behaviour identical.
 */
function sentinelFor(t: (key: string) => string, state: EvidenceState): string | null {
  switch (state) {
    case 'absent':
      return '';
    case 'unsupported':
      return t('endpointAdmin.export.val.unsupported');
    case 'incomplete':
      return t('endpointAdmin.export.val.incomplete');
    case 'ok':
      return null;
  }
}

/**
 * Build the AG-033 device-health summary columns. Each accessor resolves
 * the per-device snapshot from `healthByDeviceId`, applies the
 * fail-closed precedence, and only then reads the real summary signal.
 */
function buildDeviceHealthColumns(
  t: (key: string) => string,
  healthByDeviceId: ReadonlyMap<string, DeviceHealthSnapshot>,
): CsvColumn<EndpointDevice>[] {
  /** Resolve snapshot + evidence state for a device in one step. */
  const resolve = (d: EndpointDevice) => {
    const snapshot = healthByDeviceId.get(d.id);
    return { snapshot, state: evidenceState(snapshot) };
  };

  return [
    {
      key: 'healthSupported',
      header: t('endpointAdmin.export.col.health.supported'),
      // The supported flag itself: a real boolean when a snapshot exists,
      // empty only when there is no snapshot at all. (supported=false is
      // a TRUE value to report here — it is the sentinel SOURCE for the
      // dependent columns below, not a sentinel target itself.)
      value: (d) => {
        const { snapshot } = resolve(d);
        return snapshot ? yesNo(t, snapshot.supported) : '';
      },
    },
    {
      key: 'healthProbeComplete',
      header: t('endpointAdmin.export.col.health.probeComplete'),
      // The probeComplete flag itself. Empty with no snapshot; the
      // unsupported sentinel when the probe never ran on this runtime
      // (probeComplete is meaningless then); otherwise the real boolean.
      value: (d) => {
        const { snapshot, state } = resolve(d);
        if (state === 'absent') return '';
        if (state === 'unsupported') return t('endpointAdmin.export.val.unsupported');
        return yesNo(t, snapshot!.probeComplete);
      },
    },
    {
      key: 'healthAnyLowDisk',
      header: t('endpointAdmin.export.col.health.anyLowDisk'),
      value: (d) => {
        const { snapshot, state } = resolve(d);
        return sentinelFor(t, state) ?? yesNo(t, snapshot!.anyLowDisk);
      },
    },
    {
      key: 'healthMemoryUsedPercent',
      header: t('endpointAdmin.export.col.health.memoryUsedPercent'),
      // Flat DTO: memoryUsedPercent scalar column (NOT memory.usedPercent).
      // A null column on an otherwise-ok snapshot serialises as an empty
      // cell — the fail-closed sentinel already covers absent/unsupported/
      // incomplete.
      value: (d) => {
        const { snapshot, state } = resolve(d);
        return sentinelFor(t, state) ?? snapshot!.memoryUsedPercent;
      },
    },
    {
      key: 'healthMemoryHighPressure',
      header: t('endpointAdmin.export.col.health.memoryHighPressure'),
      // Flat DTO: memoryHighPressure scalar column (NOT
      // memory.highPressureWarning).
      value: (d) => {
        const { snapshot, state } = resolve(d);
        return sentinelFor(t, state) ?? yesNo(t, snapshot!.memoryHighPressure);
      },
    },
    {
      key: 'healthUptimeDays',
      header: t('endpointAdmin.export.col.health.uptimeDays'),
      // Flat DTO: uptimeDays scalar column (NOT uptime.uptimeDays).
      value: (d) => {
        const { snapshot, state } = resolve(d);
        return sentinelFor(t, state) ?? snapshot!.uptimeDays;
      },
    },
    {
      key: 'healthLongUptimeWarning',
      header: t('endpointAdmin.export.col.health.longUptimeWarning'),
      // Flat DTO: longUptimeWarning scalar column (NOT
      // uptime.longUptimeWarning).
      value: (d) => {
        const { snapshot, state } = resolve(d);
        return sentinelFor(t, state) ?? yesNo(t, snapshot!.longUptimeWarning);
      },
    },
  ];
}

/**
 * Derive the AG-036 "possibly truncated" signal FAIL-CLOSED. The contract
 * rule is authoritative: `upgradeCount >= maxUpgrade (512)` ⇒ possibly
 * truncated (the agent parser caps before `upgradeTruncated` is
 * evaluated, so a host with >512 pending upgrades is reported with
 * upgradeTruncated=false). We OR in the backend-computed flag and use
 * `>=` (not `==`) so a future backend that returns an above-cap aggregate
 * count can never fail-open this hint. Mirrors `isPossiblyTruncated` in
 * OutdatedSoftwareView.
 */
function outdatedPossiblyTruncated(snapshot: OutdatedSoftwareSnapshot): boolean {
  return snapshot.possiblyTruncated === true || snapshot.upgradeCount >= snapshot.maxUpgrade;
}

/**
 * Build the AG-036 outdated-software summary columns. Count-only (no
 * per-package detail in v2 — Codex 019e76df: tight-v2 keeps the redaction
 * surface minimal and avoids per-package sort/cap/i18n ambiguity; the
 * sample-list column is deferred to v2.1).
 */
function buildOutdatedSoftwareColumns(
  t: (key: string) => string,
  outdatedByDeviceId: ReadonlyMap<string, OutdatedSoftwareSnapshot>,
): CsvColumn<EndpointDevice>[] {
  const resolve = (d: EndpointDevice) => {
    const snapshot = outdatedByDeviceId.get(d.id);
    return { snapshot, state: evidenceState(snapshot) };
  };

  return [
    {
      key: 'outdatedSupported',
      header: t('endpointAdmin.export.col.outdated.supported'),
      value: (d) => {
        const { snapshot } = resolve(d);
        return snapshot ? yesNo(t, snapshot.supported) : '';
      },
    },
    {
      key: 'outdatedProbeComplete',
      header: t('endpointAdmin.export.col.outdated.probeComplete'),
      value: (d) => {
        const { snapshot, state } = resolve(d);
        if (state === 'absent') return '';
        if (state === 'unsupported') return t('endpointAdmin.export.val.unsupported');
        return yesNo(t, snapshot!.probeComplete);
      },
    },
    {
      key: 'outdatedHasUpgrades',
      header: t('endpointAdmin.export.col.outdated.hasUpgrades'),
      value: (d) => {
        const { snapshot, state } = resolve(d);
        // Fail-closed: an absent/unsupported/incomplete probe is NOT
        // "no upgrades" — never render a misleading Hayır here.
        return sentinelFor(t, state) ?? yesNo(t, snapshot!.upgradeCount > 0);
      },
    },
    {
      key: 'outdatedUpgradeCount',
      header: t('endpointAdmin.export.col.outdated.upgradeCount'),
      value: (d) => {
        const { snapshot, state } = resolve(d);
        // Fail-closed: never write a misleading 0 for missing evidence.
        return sentinelFor(t, state) ?? snapshot!.upgradeCount;
      },
    },
    {
      key: 'outdatedPossiblyTruncated',
      header: t('endpointAdmin.export.col.outdated.possiblyTruncated'),
      value: (d) => {
        const { snapshot, state } = resolve(d);
        return sentinelFor(t, state) ?? yesNo(t, outdatedPossiblyTruncated(snapshot!));
      },
    },
  ];
}

/**
 * Build the localised CSV column set. `t` is the endpoint-admin i18n
 * `t(key)` accessor; `statusLabel` maps a {@link EndpointDevice.status}
 * enum to its localised badge text (the page already owns that mapping).
 *
 * v2: pass `sources` to additively append device-health and/or
 * outdated-software SUMMARY columns. Omit it (or omit a given map) to get
 * the exact v1 column set with no behaviour change.
 */
export function buildDeviceInventoryColumns(
  t: (key: string) => string,
  statusLabel: (status: EndpointDevice['status']) => string,
  sources: DeviceInventoryColumnSources = {},
): CsvColumn<EndpointDevice>[] {
  const baseColumns: CsvColumn<EndpointDevice>[] = [
    { key: 'hostname', header: t('endpointAdmin.devices.col.hostname'), value: (d) => d.hostname },
    {
      key: 'displayName',
      header: t('endpointAdmin.drawer.detay.displayName'),
      value: (d) => d.displayName,
    },
    {
      key: 'osType',
      header: t('endpointAdmin.devices.col.os'),
      value: (d) => OS_LABEL[d.osType] ?? d.osType,
    },
    {
      key: 'osVersion',
      header: t('endpointAdmin.drawer.detay.osVersion'),
      value: (d) => d.osVersion,
    },
    {
      key: 'agentVersion',
      header: t('endpointAdmin.devices.col.agentVersion'),
      value: (d) => d.agentVersion,
    },
    {
      key: 'status',
      header: t('endpointAdmin.devices.col.status'),
      value: (d) => statusLabel(d.status),
    },
    {
      key: 'domainName',
      header: t('endpointAdmin.drawer.detay.domainName'),
      value: (d) => d.domainName,
    },
    {
      key: 'lastSeenAt',
      header: t('endpointAdmin.devices.col.lastSeenAt'),
      value: (d) => formatTimestamp(d.lastSeenAt),
    },
    {
      key: 'enrolledAt',
      header: t('endpointAdmin.drawer.detay.enrolledAt'),
      value: (d) => formatTimestamp(d.enrolledAt),
    },
    {
      key: 'createdAt',
      header: t('endpointAdmin.drawer.detay.createdAt'),
      value: (d) => formatTimestamp(d.createdAt),
    },
    {
      key: 'updatedAt',
      header: t('endpointAdmin.drawer.detay.updatedAt'),
      value: (d) => formatTimestamp(d.updatedAt),
    },
  ];

  // v2 additive blocks — appended in a deterministic order (health then
  // outdated) ONLY when the caller opts in by supplying the map.
  if (sources.healthByDeviceId) {
    baseColumns.push(...buildDeviceHealthColumns(t, sources.healthByDeviceId));
  }
  if (sources.outdatedByDeviceId) {
    baseColumns.push(...buildOutdatedSoftwareColumns(t, sources.outdatedByDeviceId));
  }

  return baseColumns;
}
