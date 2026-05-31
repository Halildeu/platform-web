import { describe, it, expect } from 'vitest';

import {
  buildDeviceInventoryColumns,
  type DeviceInventoryColumnSources,
} from '../deviceInventoryColumns';
import { buildCsv } from '../../../lib/csv-export';
import { createEndpointAdminT } from '../../../i18n';
import type { EndpointDevice, DeviceStatus } from '../../../entities/endpoint-device/types';
import type { DeviceHealthSnapshot } from '../../../entities/endpoint-device-health/types';
import type { OutdatedSoftwareSnapshot } from '../../../entities/endpoint-outdated-software/types';

/**
 * WEB-015 v2 — device-health (AG-033) + outdated-software (AG-036)
 * summary CSV column tests.
 *
 * Asserts: (1) v1 column set is UNCHANGED when no snapshot maps are
 * supplied; (2) the new columns appear with correct real values for a
 * with-data fixture; (3) the fail-closed sentinels for absent /
 * unsupported / incomplete evidence (never a misleading "0 upgrades" /
 * "healthy"); (4) NO off-contract field value leaks into any cell
 * (redaction); (5) CSV formula-injection escaping of a malicious
 * `=cmd`-style value.
 *
 * SHAPE: the device-health fixtures are the FLAT
 * `AdminDeviceHealthSnapshotResponse` projection (the actual query DTO the
 * CSV export consumes) — NOT the agent-wire nested `memory:{…}`/`uptime:{…}`
 * contract block. The data VALUES are the contract golden examples (same
 * used %, uptime days, warning flags) carried under the flat field names
 * (`memoryUsedPercent`, `memoryHighPressure`, `uptimeDays`,
 * `longUptimeWarning`, `disks[]`). This is the #705 real-data fix: the old
 * nested fixtures tested the wrong shape. The outdated-software fixtures
 * are already flat (the DTO shape) and carry the golden-example values.
 */

const t = createEndpointAdminT('tr');
const tEn = createEndpointAdminT('en');
const statusLabel = (s: DeviceStatus) => t(`endpointAdmin.devices.status.${s}`);

/** Minimal EndpointDevice; id is the join key for the v2 lookup maps. */
function mkDevice(id: string, overrides: Partial<EndpointDevice> = {}): EndpointDevice {
  return {
    id,
    tenantId: 'tenant-1',
    hostname: `host-${id}`,
    displayName: null,
    osType: 'WINDOWS',
    osVersion: '10.0.19045',
    agentVersion: '1.2.3',
    machineFingerprint: null,
    domainName: null,
    status: 'ONLINE',
    lastSeenAt: null,
    enrolledAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

// ── Contract golden examples (verbatim) ──────────────────────────────

/** device-health example[0]: supported + complete, all-healthy (FLAT DTO). */
const HEALTH_HEALTHY: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  disks: [
    {
      driveLetter: 'C:',
      totalBytes: 536870912000,
      freeBytes: 268435456000,
      freePercent: 50,
      lowDiskWarning: false,
    },
  ],
  fixedDiskCount: 1,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memoryUsedPercent: 42,
  memoryHighPressure: false,
  uptimeDays: 3,
  uptimeSeconds: 259200,
  lastBootEpochSec: 1748275200,
  longUptimeWarning: false,
  anyLowDisk: false,
  sourceUsed: 'win32',
  probeDurationMs: 12,
};

/** device-health example[1]: supported + complete, all warnings tripped (FLAT DTO). */
const HEALTH_WARNINGS: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  disks: [
    {
      driveLetter: 'C:',
      totalBytes: 536870912000,
      freeBytes: 5368709120,
      freePercent: 1,
      lowDiskWarning: true,
    },
  ],
  fixedDiskCount: 1,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memoryUsedPercent: 95,
  memoryHighPressure: true,
  uptimeDays: 33,
  uptimeSeconds: 2851200,
  lastBootEpochSec: 1745683200,
  longUptimeWarning: true,
  anyLowDisk: true,
  sourceUsed: 'win32',
  probeDurationMs: 18,
};

/** device-health example[2]: unsupported runtime (supported=false) (FLAT DTO). */
const HEALTH_UNSUPPORTED: DeviceHealthSnapshot = {
  schemaVersion: 1,
  supported: false,
  probeComplete: false,
  disks: [],
  fixedDiskCount: 0,
  fixedDisksTruncated: false,
  maxFixedDisks: 64,
  memoryUsedPercent: null,
  memoryHighPressure: null,
  uptimeDays: null,
  uptimeSeconds: null,
  lastBootEpochSec: null,
  longUptimeWarning: null,
  anyLowDisk: false,
  sourceUsed: 'none',
  probeErrors: [
    {
      source: 'none',
      code: 'UNSUPPORTED_PLATFORM',
      summary: 'device-health probe not supported on this runtime',
    },
  ],
  probeDurationMs: 0,
};

/**
 * Supported but INCOMPLETE (a probeError flipped probeComplete=false
 * while the OS is still Windows). Not a verbatim example — the contract
 * examples cover supported+complete and unsupported; this exercises the
 * middle precedence rung. Degenerate values are present on purpose to
 * prove they are NEVER read as healthy.
 */
const HEALTH_INCOMPLETE: DeviceHealthSnapshot = {
  ...HEALTH_HEALTHY,
  probeComplete: false,
  anyLowDisk: false,
  memoryUsedPercent: 0,
  memoryHighPressure: false,
  uptimeDays: 0,
  longUptimeWarning: false,
  probeErrors: [{ source: 'win32', code: 'DISK_ENUM_FAILED', summary: 'disk enumeration failed' }],
};

/** outdated-software example[0]: supported + complete, 2 upgradeable. */
const OUTDATED_WITH_UPGRADES: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 2,
  upgrade: [
    { packageId: '7zip.7zip', installedVersion: '24.09', availableVersion: '25.01' },
    {
      packageId: 'Microsoft.VisualStudioCode',
      installedVersion: '1.89.0',
      availableVersion: '1.91.1',
    },
  ],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 45,
};

/** outdated-software example[1]: supported + complete, 0 upgradeable. */
const OUTDATED_NONE: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 28,
};

/** outdated-software example[2]: unsupported runtime. */
const OUTDATED_UNSUPPORTED: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: false,
  probeComplete: false,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'none',
  probeErrors: [
    {
      source: 'none',
      code: 'UNSUPPORTED_PLATFORM',
      summary: 'outdated-software probe not supported on this runtime',
    },
  ],
  probeDurationMs: 0,
};

/** Supported but INCOMPLETE: degenerate upgradeCount=0 must NOT read as "no upgrades". */
const OUTDATED_INCOMPLETE: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: false,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeErrors: [{ source: 'winget', code: 'WINGET_TIMEOUT', summary: 'winget timed out' }],
  probeDurationMs: 4000,
};

/** At-cap snapshot: upgradeCount == maxUpgrade ⇒ possibly truncated. */
const OUTDATED_AT_CAP: OutdatedSoftwareSnapshot = {
  ...OUTDATED_WITH_UPGRADES,
  upgradeCount: 512,
  upgrade: [],
  upgradeTruncated: false,
};

/** Build a header→cell record for a single device for ergonomic assertions. */
function cellsFor(
  device: EndpointDevice,
  sources: DeviceInventoryColumnSources,
  tt: (key: string) => string = t,
): Record<string, string> {
  const columns = buildDeviceInventoryColumns(tt, statusLabel, sources);
  const out: Record<string, string> = {};
  for (const col of columns) {
    const raw = col.value(device);
    out[col.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return out;
}

// ── v1 unchanged ─────────────────────────────────────────────────────

describe('buildDeviceInventoryColumns — v1 column set unchanged (additive v2)', () => {
  const V1_KEYS = [
    'hostname',
    'displayName',
    'osType',
    'osVersion',
    'agentVersion',
    'status',
    'domainName',
    'lastSeenAt',
    'enrolledAt',
    'createdAt',
    'updatedAt',
  ];

  it('returns exactly the v1 columns when no sources are supplied', () => {
    expect(buildDeviceInventoryColumns(t, statusLabel).map((c) => c.key)).toEqual(V1_KEYS);
  });

  it('returns exactly the v1 columns when sources is an empty object', () => {
    expect(buildDeviceInventoryColumns(t, statusLabel, {}).map((c) => c.key)).toEqual(V1_KEYS);
  });

  it('does NOT append health columns when only the outdated map is given (and vice versa)', () => {
    const onlyHealth = buildDeviceInventoryColumns(t, statusLabel, {
      healthByDeviceId: new Map(),
    }).map((c) => c.key);
    expect(onlyHealth).toContain('healthSupported');
    expect(onlyHealth).not.toContain('outdatedSupported');

    const onlyOutdated = buildDeviceInventoryColumns(t, statusLabel, {
      outdatedByDeviceId: new Map(),
    }).map((c) => c.key);
    expect(onlyOutdated).toContain('outdatedSupported');
    expect(onlyOutdated).not.toContain('healthSupported');
  });

  it('appends health THEN outdated in a deterministic order after the v1 block', () => {
    const keys = buildDeviceInventoryColumns(t, statusLabel, {
      healthByDeviceId: new Map(),
      outdatedByDeviceId: new Map(),
    }).map((c) => c.key);
    // v1 block first, then all health keys, then all outdated keys.
    expect(keys.slice(0, V1_KEYS.length)).toEqual(V1_KEYS);
    const healthStart = keys.indexOf('healthSupported');
    const outdatedStart = keys.indexOf('outdatedSupported');
    expect(healthStart).toBe(V1_KEYS.length);
    expect(outdatedStart).toBeGreaterThan(healthStart);
    expect(keys).toEqual([
      ...V1_KEYS,
      'healthSupported',
      'healthProbeComplete',
      'healthAnyLowDisk',
      'healthMemoryUsedPercent',
      'healthMemoryHighPressure',
      'healthUptimeDays',
      'healthLongUptimeWarning',
      'outdatedSupported',
      'outdatedProbeComplete',
      'outdatedHasUpgrades',
      'outdatedUpgradeCount',
      'outdatedPossiblyTruncated',
    ]);
  });
});

// ── Device-health columns: real values ───────────────────────────────

describe('device-health columns — real values for complete snapshots', () => {
  it('reports the healthy summary signals', () => {
    const d = mkDevice('a');
    const cells = cellsFor(d, { healthByDeviceId: new Map([['a', HEALTH_HEALTHY]]) });
    expect(cells.healthSupported).toBe('Evet');
    expect(cells.healthProbeComplete).toBe('Evet');
    expect(cells.healthAnyLowDisk).toBe('Hayır');
    expect(cells.healthMemoryUsedPercent).toBe('42');
    expect(cells.healthMemoryHighPressure).toBe('Hayır');
    expect(cells.healthUptimeDays).toBe('3');
    expect(cells.healthLongUptimeWarning).toBe('Hayır');
  });

  it('reports the warnings summary signals (low disk / high pressure / long uptime)', () => {
    const d = mkDevice('b');
    const cells = cellsFor(d, { healthByDeviceId: new Map([['b', HEALTH_WARNINGS]]) });
    expect(cells.healthAnyLowDisk).toBe('Evet');
    expect(cells.healthMemoryUsedPercent).toBe('95');
    expect(cells.healthMemoryHighPressure).toBe('Evet');
    expect(cells.healthUptimeDays).toBe('33');
    expect(cells.healthLongUptimeWarning).toBe('Evet');
  });
});

// ── Outdated-software columns: real values ───────────────────────────

describe('outdated-software columns — real values for complete snapshots', () => {
  it('reports the upgradeable summary signals', () => {
    const d = mkDevice('c');
    const cells = cellsFor(d, { outdatedByDeviceId: new Map([['c', OUTDATED_WITH_UPGRADES]]) });
    expect(cells.outdatedSupported).toBe('Evet');
    expect(cells.outdatedProbeComplete).toBe('Evet');
    expect(cells.outdatedHasUpgrades).toBe('Evet');
    expect(cells.outdatedUpgradeCount).toBe('2');
    expect(cells.outdatedPossiblyTruncated).toBe('Hayır');
  });

  it('reports a clean (0-upgrade) supported snapshot as "no upgrades", not a sentinel', () => {
    const d = mkDevice('d');
    const cells = cellsFor(d, { outdatedByDeviceId: new Map([['d', OUTDATED_NONE]]) });
    expect(cells.outdatedSupported).toBe('Evet');
    expect(cells.outdatedProbeComplete).toBe('Evet');
    expect(cells.outdatedHasUpgrades).toBe('Hayır');
    expect(cells.outdatedUpgradeCount).toBe('0'); // a real, complete 0 is legitimate
    expect(cells.outdatedPossiblyTruncated).toBe('Hayır');
  });

  it('flags possibly-truncated when upgradeCount is at the maxUpgrade cap', () => {
    const d = mkDevice('e');
    const cells = cellsFor(d, { outdatedByDeviceId: new Map([['e', OUTDATED_AT_CAP]]) });
    expect(cells.outdatedUpgradeCount).toBe('512');
    expect(cells.outdatedPossiblyTruncated).toBe('Evet');
  });

  it('honours a backend possiblyTruncated=true even below the cap', () => {
    const d = mkDevice('e2');
    const snap: OutdatedSoftwareSnapshot = {
      ...OUTDATED_WITH_UPGRADES,
      upgradeCount: 10,
      possiblyTruncated: true,
    };
    const cells = cellsFor(d, { outdatedByDeviceId: new Map([['e2', snap]]) });
    expect(cells.outdatedPossiblyTruncated).toBe('Evet');
  });
});

// ── Fail-closed sentinels (absent / unsupported / incomplete) ────────

describe('fail-closed sentinels — never a misleading "0 upgrades" / "healthy"', () => {
  it('ABSENT snapshot → empty cells for every dependent column (no misleading value)', () => {
    const d = mkDevice('missing');
    const cells = cellsFor(d, {
      healthByDeviceId: new Map(), // device "missing" not in the map
      outdatedByDeviceId: new Map(),
    });
    for (const key of [
      'healthSupported',
      'healthProbeComplete',
      'healthAnyLowDisk',
      'healthMemoryUsedPercent',
      'healthMemoryHighPressure',
      'healthUptimeDays',
      'healthLongUptimeWarning',
      'outdatedSupported',
      'outdatedProbeComplete',
      'outdatedHasUpgrades',
      'outdatedUpgradeCount',
      'outdatedPossiblyTruncated',
    ]) {
      expect(cells[key]).toBe('');
    }
    // Critically: the upgrade count is empty, NOT "0".
    expect(cells.outdatedUpgradeCount).not.toBe('0');
    expect(cells.outdatedHasUpgrades).not.toBe('Hayır');
  });

  it('UNSUPPORTED health snapshot → "Desteklenmiyor" sentinels; supported flag is the real false', () => {
    const d = mkDevice('u');
    const cells = cellsFor(d, { healthByDeviceId: new Map([['u', HEALTH_UNSUPPORTED]]) });
    expect(cells.healthSupported).toBe('Hayır'); // the supported column itself reports the true false
    expect(cells.healthProbeComplete).toBe('Desteklenmiyor');
    expect(cells.healthAnyLowDisk).toBe('Desteklenmiyor');
    expect(cells.healthMemoryUsedPercent).toBe('Desteklenmiyor');
    expect(cells.healthMemoryHighPressure).toBe('Desteklenmiyor');
    expect(cells.healthUptimeDays).toBe('Desteklenmiyor');
    expect(cells.healthLongUptimeWarning).toBe('Desteklenmiyor');
    // The degenerate usedPercent=0 NEVER surfaces.
    expect(cells.healthMemoryUsedPercent).not.toBe('0');
  });

  it('UNSUPPORTED outdated snapshot → "Desteklenmiyor"; upgrade count never reads 0', () => {
    const d = mkDevice('u2');
    const cells = cellsFor(d, { outdatedByDeviceId: new Map([['u2', OUTDATED_UNSUPPORTED]]) });
    expect(cells.outdatedSupported).toBe('Hayır');
    expect(cells.outdatedProbeComplete).toBe('Desteklenmiyor');
    expect(cells.outdatedHasUpgrades).toBe('Desteklenmiyor');
    expect(cells.outdatedUpgradeCount).toBe('Desteklenmiyor');
    expect(cells.outdatedUpgradeCount).not.toBe('0');
    expect(cells.outdatedPossiblyTruncated).toBe('Desteklenmiyor');
  });

  it('INCOMPLETE health snapshot (supported but probeComplete=false) → "Eksik" sentinels', () => {
    const d = mkDevice('i');
    const cells = cellsFor(d, { healthByDeviceId: new Map([['i', HEALTH_INCOMPLETE]]) });
    expect(cells.healthSupported).toBe('Evet'); // supported is genuinely true
    expect(cells.healthProbeComplete).toBe('Hayır'); // probeComplete column itself = the true false
    // Every value-bearing column is the incomplete sentinel, NOT the degenerate value.
    expect(cells.healthAnyLowDisk).toBe('Eksik');
    expect(cells.healthMemoryUsedPercent).toBe('Eksik');
    expect(cells.healthMemoryHighPressure).toBe('Eksik');
    expect(cells.healthUptimeDays).toBe('Eksik');
    expect(cells.healthLongUptimeWarning).toBe('Eksik');
    expect(cells.healthMemoryUsedPercent).not.toBe('0');
  });

  it('INCOMPLETE outdated snapshot → "Eksik"; upgrade count never reads the degenerate 0', () => {
    const d = mkDevice('i2');
    const cells = cellsFor(d, { outdatedByDeviceId: new Map([['i2', OUTDATED_INCOMPLETE]]) });
    expect(cells.outdatedSupported).toBe('Evet');
    expect(cells.outdatedProbeComplete).toBe('Hayır');
    expect(cells.outdatedHasUpgrades).toBe('Eksik');
    expect(cells.outdatedUpgradeCount).toBe('Eksik');
    expect(cells.outdatedUpgradeCount).not.toBe('0');
    expect(cells.outdatedPossiblyTruncated).toBe('Eksik');
  });
});

// ── Redaction: NO off-contract field leaks into any cell ─────────────

describe('redaction — no off-contract value leaks into any exported cell', () => {
  it('device-health: no per-disk byte total / driveLetter / volume label appears anywhere', () => {
    const d = mkDevice('r');
    const columns = buildDeviceInventoryColumns(t, statusLabel, {
      healthByDeviceId: new Map([['r', HEALTH_HEALTHY]]),
    });
    const allCells = columns.map((c) => String(c.value(d) ?? ''));
    const joined = allCells.join('');
    // The summary export must NOT carry raw per-disk facts.
    expect(joined).not.toContain('C:'); // driveLetter
    expect(joined).not.toContain('536870912000'); // disk totalBytes
    expect(joined).not.toContain('268435456000'); // disk freeBytes
    expect(joined).not.toContain('17179869184'); // memory totalPhysicalBytes
    expect(joined).not.toContain('9663676416'); // memory availableBytes
    expect(joined).not.toContain('1748275200'); // lastBootEpochSec
    expect(joined).not.toContain('win32'); // sourceUsed is not a summary signal
    // Only the whitelisted summary signals are present (usedPercent=42, uptimeDays=3).
    expect(allCells).toContain('42');
    expect(allCells).toContain('3');
  });

  it('outdated-software: no packageId / version string appears in any summary cell', () => {
    const d = mkDevice('r2');
    const columns = buildDeviceInventoryColumns(t, statusLabel, {
      outdatedByDeviceId: new Map([['r2', OUTDATED_WITH_UPGRADES]]),
    });
    const joined = columns.map((c) => String(c.value(d) ?? '')).join('');
    // Count-only v2: NO per-package detail (packageId / versions) ever leaks.
    expect(joined).not.toContain('7zip.7zip');
    expect(joined).not.toContain('Microsoft.VisualStudioCode');
    expect(joined).not.toContain('24.09');
    expect(joined).not.toContain('25.01');
    expect(joined).not.toContain('1.89.0');
    expect(joined).not.toContain('winget'); // sourceUsed is not exported
    // The count IS exported.
    expect(columns.map((c) => String(c.value(d) ?? ''))).toContain('2');
  });
});

// ── CSV escaping of a malicious value through the full pipeline ───────

describe('CSV formula-injection escaping — malicious value through buildCsv', () => {
  it('neutralises a malicious "=cmd" hostname in the v1+v2 column pipeline', () => {
    // A device whose hostname is a CSV formula-injection payload. Even
    // though packageId is NOT exported in v2, a hostile string reaching
    // ANY exported cell must be neutralised by buildCsv (leading-quote
    // guard) — the same backstop the contract relies on if a future
    // package-detail column lands.
    const evil = mkDevice('x', { hostname: '=cmd|"/c calc"!A1' });
    const columns = buildDeviceInventoryColumns(t, statusLabel, {
      healthByDeviceId: new Map([['x', HEALTH_HEALTHY]]),
      outdatedByDeviceId: new Map([['x', OUTDATED_WITH_UPGRADES]]),
    });
    const csv = buildCsv(columns, [evil], { withBom: false });
    const dataLine = csv.content.split('\r\n')[1]!;
    // The leading '=' is neutralised with a single quote AND quoted (the
    // value also contains a comma + double quotes), so it is one field.
    expect(dataLine.startsWith('"\'=cmd')).toBe(true);
    // No raw unescaped formula lead-in survives at a field boundary.
    expect(csv.content).not.toContain(',=cmd');
    expect(csv.content.startsWith('=cmd')).toBe(false);
  });

  it('round-trips the full header row in EN with all v2 headers present', () => {
    const columns = buildDeviceInventoryColumns(tEn, statusLabel, {
      healthByDeviceId: new Map(),
      outdatedByDeviceId: new Map(),
    });
    const header = buildCsv(columns, [], { withBom: false }).content.split('\r\n')[0]!;
    expect(header).toContain('Health: Memory Used %');
    expect(header).toContain('Health: Low Disk');
    expect(header).toContain('Outdated: Upgrade Count');
    expect(header).toContain('Outdated: List Possibly Truncated');
  });
});

// ── i18n: TR/EN header + sentinel keys resolve (no raw-key fallthrough) ─

describe('i18n — v2 header + sentinel keys resolve in both locales', () => {
  const HEADER_KEYS = [
    'endpointAdmin.export.col.health.supported',
    'endpointAdmin.export.col.health.probeComplete',
    'endpointAdmin.export.col.health.anyLowDisk',
    'endpointAdmin.export.col.health.memoryUsedPercent',
    'endpointAdmin.export.col.health.memoryHighPressure',
    'endpointAdmin.export.col.health.uptimeDays',
    'endpointAdmin.export.col.health.longUptimeWarning',
    'endpointAdmin.export.col.outdated.supported',
    'endpointAdmin.export.col.outdated.probeComplete',
    'endpointAdmin.export.col.outdated.hasUpgrades',
    'endpointAdmin.export.col.outdated.upgradeCount',
    'endpointAdmin.export.col.outdated.possiblyTruncated',
    'endpointAdmin.export.val.yes',
    'endpointAdmin.export.val.no',
    'endpointAdmin.export.val.unsupported',
    'endpointAdmin.export.val.incomplete',
  ];

  it.each(['tr', 'en'] as const)(
    'all v2 keys are present in %s (no literal fallthrough)',
    (loc) => {
      const tt = createEndpointAdminT(loc);
      for (const key of HEADER_KEYS) {
        // The fallback returns the key verbatim on a miss; assert it changed.
        expect(tt(key)).not.toBe(key);
        expect(tt(key).length).toBeGreaterThan(0);
      }
    },
  );
});
