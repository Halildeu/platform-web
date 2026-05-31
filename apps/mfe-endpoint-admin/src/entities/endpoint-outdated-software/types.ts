/**
 * WEB outdated-software view — Faz 22.5 Track C (AG-036 → backend
 * ingest → web view). Mirrors the AG-033 device-health entity
 * precedent (`../endpoint-device-health/types.ts`).
 *
 * Wire shape is frozen by the cross-repo contract:
 *   platform-k8s-gitops/schema/endpoint-outdated-software-payload-v1.schema.json
 *   (AG-036 v1, schemaVersion=1; source of truth =
 *    platform-agent internal/inventory/outdated_software.go
 *    OutdatedSoftwareResult, PR #38 merged sha a29eef49).
 *
 * Field names match the contract / backend record component names
 * (AdminOutdatedSoftwareSnapshotResponse + ...PackageResponse) exactly
 * so the RTK Query slice does not need a mapping layer.
 *
 * Security invariant (do NOT widen — redaction boundary): each package
 * carries EXACTLY `packageId` + `installedVersion` + `availableVersion`
 * — NO display name / publisher / install location / license / download
 * URL is ever on the wire (machine-enforced in the schema via
 * `additionalProperties:false` and at source via
 * `TestOutdatedSoftwarePackage_JSONKeys`). `probeError.summary` is
 * bounded operator text. Caps (`maxUpgrade=512`) are agent-side const.
 */

import type { SpringPage } from '../endpoint-software-catalog/types';

/** Probe source. `winget` = read-only winget enumeration; `none` = no probe ran. */
export type OutdatedSoftwareSource = 'winget' | 'none';

/** Typed probe-error code enum (contract `$defs/probeError.code`). */
export type OutdatedSoftwareProbeErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'WINGET_NOT_FOUND'
  | 'WINGET_TIMEOUT'
  | 'WINGET_FAILED'
  | 'WINGET_EMPTY_OUTPUT'
  | 'WINGET_PARSE_ERROR';

/**
 * Per-package upgradeable facet. The redaction boundary — EXACTLY these
 * three keys. `packageId` is the stable winget id (no whitespace), the
 * only package-level correlation key on the wire; the from/to version
 * pair is what makes the "outdated" signal actionable.
 */
export interface OutdatedSoftwarePackage {
  packageId: string;
  installedVersion: string;
  availableVersion: string;
}

/** Typed probe error. Any entry flips `probeComplete=false`. */
export interface OutdatedSoftwareProbeError {
  source?: OutdatedSoftwareSource;
  code: OutdatedSoftwareProbeErrorCode;
  summary?: string;
}

/**
 * The AG-036 v1 outdated-software probe block. `probeComplete=false` is
 * fail-closed: treat as "evidence incomplete", never render an
 * incomplete probe as "fully up to date". `supported=false` on
 * non-Windows runtimes.
 *
 * `possiblyTruncated` is the rendering hint per the rule shared with the
 * backend helper {@code OutdatedSnapshotTruncation} (#1148):
 * `upgradeTruncated === true` (agent authoritative, set post-platform-agent
 * #40 / e64c131) OR `upgradeCount >= maxUpgrade` (defence-in-depth
 * fallback). The backend computes this flag from the persisted columns;
 * consumers should render a "possibly truncated" hint when it is true.
 *
 * This is the validated wire block. The backend ingest persists it
 * (append-only snapshot); the latest/history endpoints surface it. The
 * backend folds persistence metadata (id / deviceId / collectedAt)
 * around the block — those are declared optionally on
 * {@link OutdatedSoftwareSnapshot} so the view can use the snapshot
 * envelope's own `deviceId` for the stale-guard, and the contract golden
 * examples (just the payload block) type-check directly as a snapshot.
 */
export interface OutdatedSoftwarePayload {
  schemaVersion: number;
  supported: boolean;
  probeComplete: boolean;
  upgradeCount: number;
  upgradeTruncated: boolean;
  maxUpgrade: number;
  /**
   * Backend-derived rendering hint (#1148): `upgradeTruncated === true` OR
   * `upgradeCount >= maxUpgrade`. Optional so a verbatim contract golden
   * example (which does not carry the derived field) still type-checks as
   * a snapshot; the view derives the same rule locally and ORs it in, so
   * a wrong / stale / false backend flag can never SUPPRESS the hint when
   * `upgradeTruncated` or the fallback signals it.
   */
  possiblyTruncated?: boolean;
  sourceUsed: OutdatedSoftwareSource;
  probeErrors?: OutdatedSoftwareProbeError[];
  probeDurationMs: number;
}

/**
 * Latest outdated-software snapshot response. The contract payload block
 * plus the backend persistence envelope (mirrors the AG-033 device-health
 * snapshot shape: id / tenantId / deviceId / collectedAt + the folded
 * `packages[]` child list around the validated block). On the wire the
 * upgradeable packages arrive under `packages`
 * (AdminOutdatedSoftwareSnapshotResponse.packages); the contract golden
 * examples carry the same data under `upgrade`, so both are declared
 * optional and the view reads `packages ?? upgrade ?? []`.
 */
export interface OutdatedSoftwareSnapshot extends OutdatedSoftwarePayload {
  id?: string;
  tenantId?: string;
  deviceId?: string;
  sourceCommandResultId?: string | null;
  payloadHashSha256?: string;
  collectedAt?: string;
  createdAt?: string;
  /** Backend response shape — folded upgradeable-package child list. */
  packages?: OutdatedSoftwarePackage[];
  /** Contract golden-example shape — the same data under the wire key. */
  upgrade?: OutdatedSoftwarePackage[];
}

/**
 * History-summary projection — no child `packages[]` array, surfaces the
 * upgrade count + truncation flags + counts for the accordion list view
 * (mirrors the AG-033 device-health history summary +
 * AdminOutdatedSoftwareSnapshotSummaryResponse).
 */
export interface OutdatedSoftwareSnapshotSummary {
  id: string;
  deviceId: string;
  schemaVersion: number;
  supported: boolean;
  probeComplete: boolean;
  upgradeCount: number;
  upgradeTruncated: boolean;
  possiblyTruncated: boolean;
  maxUpgrade: number;
  sourceUsed: OutdatedSoftwareSource;
  packageCount: number;
  probeErrorCount: number;
  payloadHashSha256: string;
  collectedAt: string;
  createdAt: string;
}

export interface GetOutdatedSoftwareLatestArgs {
  deviceId: string;
}

export interface GetOutdatedSoftwareHistoryArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

/** Spring Page envelope per the AG-033 device-health history precedent. */
export type OutdatedSoftwareHistoryPage = SpringPage<OutdatedSoftwareSnapshotSummary>;
