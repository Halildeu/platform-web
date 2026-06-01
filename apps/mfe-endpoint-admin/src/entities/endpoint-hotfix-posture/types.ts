/**
 * WEB hotfix-posture entity types — Faz 22.5 Track C (WEB-014G).
 * Mirrors the AG-036 outdated-software entity precedent exactly
 * (`../endpoint-outdated-software/types.ts`).
 *
 * Wire shape is frozen by the cross-repo contract:
 *   platform-agent docs/COMMAND-CONTRACT.md §16 (AG-037 v1,
 *   schemaVersion=1; source of truth =
 *   platform-agent internal/inventory/hotfix_posture.go
 *   HotfixPostureResult, PR #45 merged commit 2b0f3b5).
 *
 * Field names match the backend DTO names
 * (AdminHotfixPostureSnapshotResponse + child DTOs) exactly so the
 * RTK Query slice does not need a mapping layer.
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - Per installed hotfix: EXACTLY {kbId, installedOn, description}.
 * - Per pending update: EXACTLY {kbIds, primaryCategory, severity};
 *   raw update title NEVER on the wire in v1.
 * - Agent health: 7 bounded scalars (no raw registry / WUA error / KB id).
 * - probeError.summary is bounded operator text (CRLF stripped + 200-char cap).
 * Caps: maxInstalled=512 (agent-side), maxPending=20 (agent-side).
 * Wire shape additions require an explicit contract bump (server policy
 * is strict allowlist, NOT silent drop).
 */

import type { SpringPage } from '../endpoint-software-catalog/types';

/** Installed source attribution: `wua` = WUA QueryHistory primary;
 *  `getHotfix` = PowerShell `Get-HotFix` installed-only fallback;
 *  `none` = probe failed before any source. */
export type HotfixInstalledSource = 'wua' | 'getHotfix' | 'none';

/** Pending source attribution: `wua` = WUA Search; `none` = no probe ran. */
export type HotfixPendingSource = 'wua' | 'none';

/** Health source attribution: composite of SCM (service) + AU policy
 *  registry (registry); `composite` = both; `none` = probe failed. */
export type HotfixHealthSource = 'service' | 'registry' | 'composite' | 'none';

/** Windows service state typed enum (parity with backend wire). UNKNOWN
 *  is the fail-closed "could not read" sentinel. */
export type HotfixServiceState = 'RUNNING' | 'STOPPED' | 'DISABLED' | 'UNKNOWN';

/** Primary category enum (reduced via deterministic precedence in the
 *  agent: SECURITY > DEFINITION > CRITICAL > IMPORTANT > DRIVER >
 *  UPDATE_ROLLUP > FEATURE_PACK > SERVICE_PACK > OPTIONAL > TOOLS >
 *  UNCATEGORIZED). */
export type HotfixCategory =
  | 'SECURITY'
  | 'DEFINITION'
  | 'CRITICAL'
  | 'IMPORTANT'
  | 'DRIVER'
  | 'UPDATE_ROLLUP'
  | 'FEATURE_PACK'
  | 'SERVICE_PACK'
  | 'OPTIONAL'
  | 'TOOLS'
  | 'UNCATEGORIZED';

/** MSRC severity rating; UNSPECIFIED for non-security updates. */
export type HotfixSeverity = 'CRITICAL' | 'IMPORTANT' | 'MODERATE' | 'LOW' | 'UNSPECIFIED';

/** Typed probe-error code enum (wire contract §16.6). */
export type HotfixProbeErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'ACCESS_DENIED'
  | 'COM_FAILED'
  | 'WSUS_UNREACHABLE'
  | 'POWERSHELL_MISSING'
  | 'POWERSHELL_TIMEOUT'
  | 'POWERSHELL_FAILED'
  | 'POWERSHELL_EMPTY_OUTPUT'
  | 'POWERSHELL_PARSE_ERROR'
  | 'REGISTRY_UNAVAILABLE'
  | 'SERVICE_QUERY_FAILED'
  | 'NO_EVIDENCE';

/**
 * Per-installed-hotfix facet — exactly three contract keys.
 * `installedOn` is nullable (legacy Get-HotFix entries lack a parseable
 * date); `description` is nullable when source did not provide one.
 */
export interface HotfixInstalled {
  kbId: string;
  installedOn: string | null;
  description: string | null;
}

/**
 * Per-pending-update facet — exactly three contract keys. `kbIds` may
 * legitimately be an empty array when WUA reports no `KBArticleIDs`
 * (rare; the view renders `—` fallback in that case).
 */
export interface HotfixPending {
  kbIds: string[];
  primaryCategory: HotfixCategory;
  severity: HotfixSeverity;
}

/**
 * Per-category rollup entry. Preserves the FULL pre-truncation pending
 * category distribution even when the per-item `pendingUpdates` list
 * is capped at 20 (sum(count) == pendingTotalCount invariant).
 */
export interface HotfixPendingByCategory {
  category: HotfixCategory;
  count: number;
}

/**
 * Windows Update agent health snapshot. Seven bounded scalars; nullable
 * fields render as "Unknown" (tri-state) without crashing the panel.
 *
 * `notificationLevel` is the AUOptions registry value verbatim (typically
 * `'1'` / `'2'` / `'3'` / `'4'` per Microsoft AU policy docs; GPO variants
 * like `'0'` or padded `'00'` accepted by the backend regex but rendered
 * as raw "(unrecognized)" by the view).
 */
export interface HotfixAgentHealth {
  wuaServiceState: HotfixServiceState;
  bitsServiceState: HotfixServiceState;
  lastDetectAt: string | null;
  lastInstallAt: string | null;
  autoUpdatePolicyEnabled: boolean | null;
  autoUpdateEffectiveEnabled: boolean | null;
  notificationLevel: string | null;
}

/** Typed probe error. Any entry flips `probeComplete=false`. */
export interface HotfixProbeError {
  code: HotfixProbeErrorCode;
  source: string | null;
  summary: string | null;
}

/**
 * The AG-037 v1 hotfix-posture snapshot — full latest response shape.
 * Backend DTO authority (`AdminHotfixPostureSnapshotResponse`). The view
 * uses these field names directly without a mapping layer.
 *
 * Fail-closed semantics:
 * - `supported === false` (non-Windows runtime): persist as evidence,
 *   render "probe not supported on this device" panel.
 * - `probeComplete === false`: persist as evidence, render
 *   "evidence incomplete" panel — NEVER render the (possibly empty)
 *   installed/pending lists as "fully patched / no pending updates".
 *
 * `installedPossiblyTruncated` / `pendingPossiblyTruncated` are backend-
 * computed hints per `HotfixPostureSnapshotTruncation` (mirror of
 * `OutdatedSnapshotTruncation` #1148):
 *   installedPossiblyTruncated =
 *     installedTruncated === true || installedCount >= maxInstalled
 *   pendingPossiblyTruncated =
 *     pendingTruncated === true || pendingTotalCount >= maxPending
 * The view OR-combines server flag + count fallback so a wrong / stale
 * server `false` cannot SUPPRESS the hint when other signals fire.
 *
 * Child arrays may be RUNTIME absent (TypeScript "required" is a compile-
 * time contract; the render path uses `?? []` to tolerate a malformed
 * response that strips the array; the truncation invariants below catch
 * a non-zero count with absent rollup as a separate concern at the
 * backend policy layer).
 */
export interface HotfixPostureSnapshot {
  id: string;
  tenantId: string;
  deviceId: string;
  sourceCommandResultId: string | null;
  schemaVersion: number;
  supported: boolean;
  probeComplete: boolean;
  installedCount: number;
  installedTruncated: boolean;
  maxInstalled: number;
  installedPossiblyTruncated: boolean;
  pendingTotalCount: number;
  pendingTruncated: boolean;
  maxPending: number;
  pendingPossiblyTruncated: boolean;
  installedSourceUsed: HotfixInstalledSource;
  pendingSourceUsed: HotfixPendingSource;
  healthSourceUsed: HotfixHealthSource;
  probeDurationMs: number | null;
  payloadHashSha256: string;
  collectedAt: string;
  createdAt: string;
  installedHotfixes: HotfixInstalled[];
  pendingUpdates: HotfixPending[];
  pendingByCategory: HotfixPendingByCategory[];
  /**
   * Tolerate runtime null/undefined on render (the backend always
   * projects an agentHealth value when the snapshot is persisted, but
   * a future API typing drift should not crash the panel).
   */
  agentHealth: HotfixAgentHealth | null;
  probeErrors: HotfixProbeError[];
}

/**
 * History-summary projection — no child arrays / no agentHealth (server-
 * stripped). Used by the history accordion list view.
 *
 * `installedChildCount` / `pendingChildCount` are the persisted post-cap
 * row counts; they should be rendered as SECONDARY context (not primary
 * truth) so a capped value never reads as "few pending" by mistake.
 */
export interface HotfixPostureSnapshotSummary {
  id: string;
  deviceId: string;
  schemaVersion: number;
  supported: boolean;
  probeComplete: boolean;
  installedCount: number;
  installedTruncated: boolean;
  maxInstalled: number;
  installedPossiblyTruncated: boolean;
  pendingTotalCount: number;
  pendingTruncated: boolean;
  maxPending: number;
  pendingPossiblyTruncated: boolean;
  installedSourceUsed: string;
  pendingSourceUsed: string;
  healthSourceUsed: string;
  installedChildCount: number;
  pendingChildCount: number;
  probeErrorCount: number;
  payloadHashSha256: string;
  collectedAt: string;
  createdAt: string;
}

export interface GetHotfixPostureLatestArgs {
  deviceId: string;
}

export interface GetHotfixPostureHistoryArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

/** Spring Page envelope mirroring the AG-036 outdated-software history. */
export type HotfixPostureHistoryPage = SpringPage<HotfixPostureSnapshotSummary>;
