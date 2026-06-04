/**
 * Endpoint Software Catalog types — WEB-014C list + Path C3 authoring.
 *
 * Codex thread `019e8982` plan-time iter-2 AGREE / ready_for_impl=true:
 *  - Strong TS discriminated union for detection rules (no loose Map).
 *  - Response normalizer: unknown rule type → read-only raw summary
 *    (fail-closed); known types → typed hydrate.
 *  - Path safety table-driven (semantic mirror of backend
 *    `WindowsPathSafetyValidator` + agent `validateFilePathSafety` —
 *    NOT a regex copy; drift caught via test vectors).
 *
 * Backend wire contract (Path C2 PR #384 MERGED):
 *  - `AdminCatalogItemRequest.detectionRule: Map<String, Object>` —
 *    canonical client representation is the discriminated union below.
 *  - For FILE_* rules, the canonical client key is `absolutePath`
 *    (server validator accepts this name; agent forwarder renames to
 *    `path` internally — frontend never sends `path`).
 *  - For FILE_SHA256, `expectedSha256` is lowercase hex 64 and
 *    `maxHashBytes` is an OPTIONAL non-negative integer ≤ 512 MiB.
 *  - For FILE_VERSION, `versionPredicate` is a discriminated union
 *    {EXACT, MIN, RANGE} and `fileVersionField` is OPTIONAL
 *    FILE_VERSION (default) | PRODUCT_VERSION.
 */

// ---------------------------------------------------------------------------
// Catalog metadata (already used by WEB-014C list view).
// ---------------------------------------------------------------------------

export type CatalogItemStatus = 'DRAFT' | 'APPROVED' | 'REVOKED';

export type CatalogProvider = 'WINGET' | 'CHOCOLATEY' | 'MANUAL';

export type CatalogRiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type CatalogInstallerType = 'MSI' | 'EXE' | 'MSIX' | 'UNKNOWN';

export type CatalogSilentArgsPolicy = 'REQUIRED' | 'OPTIONAL' | 'NONE';

export type CatalogVersionPolicyType = 'LATEST' | 'PIN' | 'RANGE';

/** Compact projection used by the BE-020 list endpoint. */
export interface AdminCatalogItemSummary {
  id: string;
  catalogItemId: string;
  status: CatalogItemStatus;
  provider: CatalogProvider;
  packageId: string;
  displayName: string;
  publisher: string | null;
  riskTier: CatalogRiskTier;
  enabled: boolean;
  lastUpdatedAt: string;
  /**
   * AG-028 Phase 3 — managed-uninstall opt-in flag.
   *
   * Forward-compat OPTIONAL field (Codex 019e93ab Q1 = option B). The
   * backend `AdminCatalogItemSummary` DTO does NOT currently emit this
   * — it lives only on the `EndpointSoftwareCatalogItem` entity
   * (`uninstall_supported` column). So this field is `undefined` today
   * for every row off the wire.
   *
   * Gating contract: the device-drawer "Kaldır" button renders UNLESS
   * this is explicitly `=== false` (undefined → render, true → render,
   * false → hide). NEVER default it to `false` (`?? false` would kill
   * the whole uninstall surface under the current contract). The
   * authoritative gate is the server-side propose 422 (fail-closed for
   * `!uninstall_supported`); when the backend later adds this field to
   * the summary DTO, `=== false` immediately starts hiding unsupported
   * rows with zero further frontend change.
   */
  uninstallSupported?: boolean;
}

/** Spring `Page<T>` envelope returned by the catalog list endpoint. */
export interface SpringPage<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface ListCatalogItemsArgs {
  status?: CatalogItemStatus;
  enabled?: boolean;
  page?: number;
  size?: number;
}

// ---------------------------------------------------------------------------
// Detection rule discriminated union (Path C3).
// ---------------------------------------------------------------------------

export type DetectionRuleType =
  | 'WINGET_PACKAGE'
  | 'REGISTRY_UNINSTALL'
  | 'FILE_EXISTS'
  | 'FILE_SHA256'
  | 'FILE_VERSION';

export type FileVersionField = 'FILE_VERSION' | 'PRODUCT_VERSION';

export type VersionPredicateKind = 'EXACT' | 'MIN' | 'RANGE';

export interface VersionPredicateExact {
  kind: 'EXACT';
  value: string;
}

export interface VersionPredicateMin {
  kind: 'MIN';
  value: string;
}

export interface VersionPredicateRange {
  kind: 'RANGE';
  /** "[1.0,2.0)" style — frontend collects min/max + inclusivity. */
  min: string;
  max: string;
  minInclusive: boolean;
  maxInclusive: boolean;
}

export type VersionPredicate = VersionPredicateExact | VersionPredicateMin | VersionPredicateRange;

export interface DetectionRuleWingetPackage {
  type: 'WINGET_PACKAGE';
  packageId: string;
  source?: string;
}

export interface DetectionRuleRegistryUninstall {
  type: 'REGISTRY_UNINSTALL';
  displayNamePattern: string;
  minVersion?: string;
}

export interface DetectionRuleFileExists {
  type: 'FILE_EXISTS';
  absolutePath: string;
}

export interface DetectionRuleFileSha256 {
  type: 'FILE_SHA256';
  absolutePath: string;
  expectedSha256: string;
  /** Optional per-rule cap; capped at 512 MiB server side. */
  maxHashBytes?: number;
}

export interface DetectionRuleFileVersion {
  type: 'FILE_VERSION';
  absolutePath: string;
  versionPredicate: VersionPredicate;
  fileVersionField?: FileVersionField;
}

export type DetectionRule =
  | DetectionRuleWingetPackage
  | DetectionRuleRegistryUninstall
  | DetectionRuleFileExists
  | DetectionRuleFileSha256
  | DetectionRuleFileVersion;

/** Raw rule object from backend with unknown shape (normalizer input). */
export type RawDetectionRule = Record<string, unknown>;

/**
 * Wrapper carrying either a typed rule or, when the discriminator is
 * unknown / shape mismatched, a fail-closed read-only summary. The
 * drawer uses this to decide whether the editor can edit + save (typed
 * branch) or must show "unknown rule — open in JSON viewer; save
 * disabled" (raw branch).
 */
export type NormalizedDetectionRule =
  | { kind: 'typed'; rule: DetectionRule }
  | { kind: 'unknown'; raw: RawDetectionRule; reason: string };

// ---------------------------------------------------------------------------
// Full catalog item DTO (returned by GET / accepted by PUT/POST).
// ---------------------------------------------------------------------------

export interface AdminCatalogItemResponse {
  id: string;
  catalogItemId: string;
  status: CatalogItemStatus;
  provider: CatalogProvider;
  packageId: string;
  displayName: string;
  publisher: string | null;
  description: string | null;
  homepageUrl: string | null;
  versionPolicyType: CatalogVersionPolicyType | null;
  versionPolicyValue: string | null;
  installerType: CatalogInstallerType | null;
  silentArgsPolicy: CatalogSilentArgsPolicy | null;
  sha256: string | null;
  provenance: string | null;
  /** Raw map from server; pass to {@link normalizeDetectionRule} first. */
  detectionRule: RawDetectionRule;
  riskTier: CatalogRiskTier;
  enabled: boolean;
  lastUpdatedAt: string;
}

/** Request body accepted by POST/PUT. */
export interface AdminCatalogItemRequest {
  catalogItemId: string;
  provider: CatalogProvider;
  packageId: string;
  displayName: string;
  publisher?: string;
  description?: string;
  homepageUrl?: string;
  versionPolicyType?: CatalogVersionPolicyType;
  versionPolicyValue?: string;
  installerType?: CatalogInstallerType;
  silentArgsPolicy?: CatalogSilentArgsPolicy;
  sha256?: string;
  provenance?: string;
  /** Wire shape mirrors {@link DetectionRule}. */
  detectionRule: DetectionRule;
  riskTier: CatalogRiskTier;
}

// ---------------------------------------------------------------------------
// Path safety table-driven validator (semantic mirror of backend +
// agent). Reason codes serve as i18n keys.
// ---------------------------------------------------------------------------

export type PathRejectReason =
  | 'pathRequired'
  | 'unc'
  | 'forwardSlash'
  | 'envVar'
  | 'parentTraversal'
  | 'dotSegment'
  | 'shortName83'
  | 'ads'
  | 'controlChar'
  | 'notAbsolute'
  | 'allowlist';

const ALLOWED_PREFIXES = [
  'C:\\Program Files\\',
  'C:\\Program Files (x86)\\',
  'C:\\ProgramData\\',
  'C:\\Windows\\',
];

// Codex 019e8982 post-impl P1: anywhere-in-path 8.3 short-name detection
// (drop the trailing lookahead so `MYAPP~1.EXE` segment is caught too).
// Backend `WindowsPathSafetyValidator` matches `~\d+` anywhere in the
// path string; client mirror tracks that semantic.
const SHORT_NAME_RE = /~\d+/;
// eslint-disable-next-line no-control-regex -- semantic mirror of backend WindowsPathSafetyValidator: ASCII control + DEL byte rejection
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;
const DRIVE_RE = /^[A-Za-z]:\\/;
// Codex 019e8982 post-impl P1 should-fix: env var anywhere in path
// (not just startsWith '%'); backend rejects any `%` segment per
// WindowsPathSafetyValidator semantics.
const ENV_VAR_RE = /%/;

/**
 * Returns null on accept, or a reject reason code on reject. Mirrors
 * backend `WindowsPathSafetyValidator` semantics (Codex iter-4 P1
 * guards + agent `validateFilePathSafety`) for client preview;
 * authoritative decision remains backend-side.
 */
export function checkWindowsPathSafety(input: string | null | undefined): PathRejectReason | null {
  if (input == null) return 'pathRequired';
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'pathRequired';
  if (trimmed.startsWith('\\\\')) return 'unc';
  if (ENV_VAR_RE.test(trimmed)) return 'envVar';
  if (trimmed.includes('/')) return 'forwardSlash';
  if (CONTROL_CHAR_RE.test(trimmed)) return 'controlChar';
  // ADS check: a single colon at index 1 is the drive separator. Any
  // colon beyond that (or absent at index 1) signals ADS or malformed.
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) === 0x3a /* ':' */ && i !== 1) {
      return 'ads';
    }
  }
  if (!DRIVE_RE.test(trimmed)) return 'notAbsolute';
  if (SHORT_NAME_RE.test(trimmed)) return 'shortName83';
  // Segment scan: reject `..` (parent) or `.` (current-dir) entries.
  const segments = trimmed.split('\\');
  for (let i = 1; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === '..') return 'parentTraversal';
    if (seg === '.') return 'dotSegment';
  }
  const upper = trimmed.toUpperCase();
  const ok = ALLOWED_PREFIXES.some((p) => upper.startsWith(p.toUpperCase()));
  if (!ok) return 'allowlist';
  return null;
}

// ---------------------------------------------------------------------------
// Detection rule normalizer.
// ---------------------------------------------------------------------------

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const MAX_HASH_BYTES = 512 * 1024 * 1024;

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

function asVersionPredicate(raw: unknown): VersionPredicate | string {
  if (!raw || typeof raw !== 'object') return 'predicateRequired';
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (kind === 'EXACT' || kind === 'MIN') {
    if (!isString(obj.value)) return 'predicateValueRequired';
    return { kind, value: obj.value };
  }
  if (kind === 'RANGE') {
    if (!isString(obj.min) || !isString(obj.max)) return 'predicateRangeRequired';
    // Codex 019e8982 post-impl P1 must-fix: fail-closed when inclusivity
    // booleans are missing — defaulting to false silently could flip
    // semantics if the backend ever emits a RANGE without explicit
    // inclusivity. Backend currently always sends both booleans; UI
    // refuses to hydrate (so the drawer shows the unknown-rule branch
    // and Save is disabled) if either is missing.
    if (typeof obj.minInclusive !== 'boolean' || typeof obj.maxInclusive !== 'boolean') {
      return 'predicateRangeInclusivityRequired';
    }
    return {
      kind: 'RANGE',
      min: obj.min,
      max: obj.max,
      minInclusive: obj.minInclusive,
      maxInclusive: obj.maxInclusive,
    };
  }
  return 'predicateKindUnknown';
}

/**
 * Convert a raw detection rule (loose map from the server) into a
 * typed discriminated union. Fail-closed on any shape mismatch — the
 * caller surfaces a read-only raw summary and disables Save.
 */
export function normalizeDetectionRule(
  raw: RawDetectionRule | null | undefined,
): NormalizedDetectionRule {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'unknown', raw: raw ?? {}, reason: 'rule.notObject' };
  }
  const type = raw.type;
  switch (type) {
    case 'WINGET_PACKAGE':
      if (!isString(raw.packageId)) {
        return { kind: 'unknown', raw, reason: 'winget.packageIdMissing' };
      }
      return {
        kind: 'typed',
        rule: {
          type: 'WINGET_PACKAGE',
          packageId: raw.packageId,
          source: isString(raw.source) ? raw.source : undefined,
        },
      };
    case 'REGISTRY_UNINSTALL':
      if (!isString(raw.displayNamePattern)) {
        return { kind: 'unknown', raw, reason: 'registry.displayNameMissing' };
      }
      return {
        kind: 'typed',
        rule: {
          type: 'REGISTRY_UNINSTALL',
          displayNamePattern: raw.displayNamePattern,
          minVersion: isString(raw.minVersion) ? raw.minVersion : undefined,
        },
      };
    case 'FILE_EXISTS':
      if (!isString(raw.absolutePath)) {
        return { kind: 'unknown', raw, reason: 'file.absolutePathMissing' };
      }
      return { kind: 'typed', rule: { type: 'FILE_EXISTS', absolutePath: raw.absolutePath } };
    case 'FILE_SHA256': {
      if (!isString(raw.absolutePath)) {
        return { kind: 'unknown', raw, reason: 'file.absolutePathMissing' };
      }
      if (!isString(raw.expectedSha256) || !SHA256_HEX_RE.test(raw.expectedSha256.toLowerCase())) {
        return { kind: 'unknown', raw, reason: 'sha256.invalid' };
      }
      const maxRaw = raw.maxHashBytes;
      let maxHashBytes: number | undefined;
      if (maxRaw !== undefined && maxRaw !== null) {
        if (!isFiniteNonNegInt(maxRaw) || maxRaw > MAX_HASH_BYTES) {
          return { kind: 'unknown', raw, reason: 'sha256.maxHashBytesInvalid' };
        }
        maxHashBytes = maxRaw;
      }
      return {
        kind: 'typed',
        rule: {
          type: 'FILE_SHA256',
          absolutePath: raw.absolutePath,
          expectedSha256: raw.expectedSha256.toLowerCase(),
          maxHashBytes,
        },
      };
    }
    case 'FILE_VERSION': {
      if (!isString(raw.absolutePath)) {
        return { kind: 'unknown', raw, reason: 'file.absolutePathMissing' };
      }
      const predicate = asVersionPredicate(raw.versionPredicate);
      if (typeof predicate === 'string') {
        return { kind: 'unknown', raw, reason: `predicate.${predicate}` };
      }
      const field = raw.fileVersionField;
      const fileVersionField: FileVersionField | undefined =
        field === 'FILE_VERSION' || field === 'PRODUCT_VERSION' ? field : undefined;
      return {
        kind: 'typed',
        rule: {
          type: 'FILE_VERSION',
          absolutePath: raw.absolutePath,
          versionPredicate: predicate,
          fileVersionField,
        },
      };
    }
    default:
      return { kind: 'unknown', raw, reason: 'type.unknown' };
  }
}

export const DETECTION_RULE_PATH_SAFETY_MAX_BYTES = MAX_HASH_BYTES;
