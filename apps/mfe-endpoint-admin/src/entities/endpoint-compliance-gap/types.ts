/*
 * Faz 22.7 D3 — Compliance Gap Mart Explorer types.
 *
 * Mirrors the backend DTOs at
 *   endpoint-admin-service/src/main/java/com/example/endpointadmin/dto/compliancegap/
 *
 *   GapDetail.java
 *   DeviceComplianceGap.java
 *   ComplianceGapResponse.java
 *
 * Endpoint contract (Faz 22.7 D2 — PR #378, sha-6fa713b):
 *   gateway GET /api/v1/endpoint-admin/endpoint-devices/compliance-gap
 *     ?gapTypes=rdp_enabled,pending_security_updates
 *     &freshnessWindow=PT168H
 *     &page=1
 *     &pageSize=50
 *   → service /api/v1/admin/endpoint-devices/compliance-gap
 *   → ComplianceGapResponse
 *
 * Backend uses 1-based page numbering (page>=1 → offset=(page-1)*pageSize).
 *
 * `gapStrength="strong"` MVP — all DB-filtered rows are within freshness
 * window, so all gaps are "strong". A future iteration may introduce
 * "weak" gaps where the snapshot is older than the freshness window
 * (operator-visible sample boundary).
 *
 * `filterEcho` echoes the validated/sanitized request: sorted gapTypes
 * (deterministic JSON for cache keys), normalized freshnessWindow,
 * effective page/pageSize. Operator MUST read filterEcho to understand
 * the "observed devices only" sample.
 */

export type ComplianceGapWire = 'rdp_enabled' | 'pending_security_updates';

export interface GapDetail {
  /** Wire name — `rdp_enabled` | `pending_security_updates`. */
  type: ComplianceGapWire;
  /** Turkish label (backend i18n) — e.g. "RDP açık". */
  label: string;
  /** ISO-8601 source snapshot collected_at. */
  sourceSnapshotCollectedAt: string;
  /** Stale if snapshot is older than freshness window. D2 MVP: always false. */
  stale: boolean;
  /** Per-gap-type details — e.g. `{ rdpEnabled: true }` or `{ pendingTotalCount: 7 }`. */
  details: Record<string, unknown> | null;
}

export interface DeviceComplianceGap {
  deviceId: string;
  deviceName: string;
  /** Max lastSeen across the device's contributing snapshots (ISO-8601). */
  lastSeen: string | null;
  gapCount: number;
  /** "strong" — D2 MVP. Future: "weak" for stale-window devices. */
  gapStrength: 'strong' | 'weak';
  gaps: GapDetail[];
  /** Components missing snapshots in the freshness window. D2 MVP: always empty. */
  staleComponents: string[];
}

export interface ComplianceGapFilterEcho {
  /** Sorted list — deterministic JSON for cache keys / audit diffs. */
  gapTypes: string[];
  /** ISO-8601 duration — e.g. "PT168H" or "P7D". */
  freshnessWindow: string;
  page: number;
  pageSize: number;
}

export interface ComplianceGapResponse {
  items: DeviceComplianceGap[];
  /** Total devices matching the filter (DB-side count). */
  total: number;
  page: number;
  pageSize: number;
  /** Echo of the validated/sanitized request. */
  filterEcho: ComplianceGapFilterEcho;
  /** ISO-8601 — when this aggregation was computed. */
  computedAt: string;
}

export interface GetComplianceGapArgs {
  /** Subset of {`rdp_enabled`, `pending_security_updates`} — empty/undefined = all. */
  gapTypes?: ComplianceGapWire[];
  /**
   * ISO-8601 duration — bounded by backend MAX_FRESHNESS_WINDOW=P366D.
   * Default backend value when undefined: P7D (7 days).
   */
  freshnessWindow?: string;
  /** 1-based page index (backend semantics). Defaults to 1 backend-side. */
  page?: number;
  /** Backend caps at MAX_PAGE_SIZE=200; defaults to DEFAULT_PAGE_SIZE=50. */
  pageSize?: number;
}
