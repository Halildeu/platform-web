/**
 * WEB agent diagnostics entity types — Faz 22.5 (AG-038 → backend
 * ingest → web view).
 *
 * Mirrors the AG-037 hotfix-posture entity precedent. Wire shape is
 * frozen by the cross-repo contract:
 *   platform-agent docs/COMMAND-CONTRACT.md §17 (AG-038 v1,
 *   schemaVersion=1; source of truth =
 *   platform-agent internal/inventory/diagnostics.go
 *   DiagnosticsResult, PR #39 merged 67bd4ba).
 *
 * Field names match the backend DTO names
 * (AdminDiagnosticsSnapshotResponse + AdminDiagnosticsLastErrorResponse
 * + AdminDiagnosticsProbeErrorResponse, platform-backend PR #357
 * 6122d0e4) exactly so the RTK Query slice needs no mapping layer.
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - `lastError` is a flat triad `{occurredAt, code, summary}` (no
 *   category, no raw stack trace, no operator-visible HTTP body); the
 *   whole facet is `null` when none of the three legs are populated
 *   (backend V23 triad CHECK).
 * - `probeErrors[]` per item: EXACTLY `{rowOrdinal, code, summary}`.
 *   `summary` is bounded operator text (200-char cap, CRLF stripped at
 *   the policy layer).
 * - Connectivity badges (`backendDnsReachable`, `backendTlsValid`) are
 *   tri-state (`true`/`false`/`null`) — `null` is "probe did not run /
 *   inconclusive", NOT "healthy".
 * Wire shape additions require an explicit contract bump (server policy
 * is strict allowlist, NOT silent drop).
 */

/**
 * Flat lastError triad (occurredAt + code + summary, all three present
 * together or the whole facet is `null`).
 */
export interface DiagnosticsLastError {
  occurredAt: string; // ISO-8601 instant
  code: string;
  summary: string;
}

/**
 * Per-probe error row. `rowOrdinal` is backend-derived for stable
 * ordering across queries.
 */
export interface DiagnosticsProbeError {
  rowOrdinal: number;
  code: string;
  summary: string;
}

/**
 * Full diagnostics snapshot wire shape — mirrors backend
 * `AdminDiagnosticsSnapshotResponse`.
 *
 * Nullable scalars: any Java `Boolean`/`Integer` wrapper on the backend
 * (`supported`, `probeComplete`, `lastPollLatencyMs`,
 * `backendDnsReachable`, `backendTlsValid`, `probeDurationMs`,
 * `schemaVersion`) can be `null` here. Consumers must use `value == null`
 * NOT a falsy check — `lastPollLatencyMs: 0` and `probeDurationMs: 0` are
 * legitimate readings.
 */
export interface DiagnosticsSnapshot {
  id: string;
  tenantId: string;
  deviceId: string;
  sourceCommandResultId: string | null;
  schemaVersion: number | null;
  supported: boolean | null;
  probeComplete: boolean | null;
  agentVersion: string | null;
  configHash: string | null;
  lastPollLatencyMs: number | null;
  backendDnsReachable: boolean | null;
  backendTlsValid: boolean | null;
  lastError: DiagnosticsLastError | null;
  probeDurationMs: number | null;
  payloadHashSha256: string | null;
  collectedAt: string; // ISO-8601, NOT NULL per backend V23
  createdAt: string; // ISO-8601, NOT NULL per backend V23
  probeErrors: DiagnosticsProbeError[];
}

/**
 * Helper: "snapshot looks fully healthy" predicate. Requires BOTH
 * `supported === true` AND `probeComplete === true`. Used to gate the
 * connectivity-badges render (fail-closed when probe incomplete: never
 * show DNS/TLS success badges based on stale/partial data).
 */
export function isDiagnosticsFullyEvaluable(
  snapshot: DiagnosticsSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.supported === true && snapshot.probeComplete === true;
}

/**
 * Helper: "this snapshot belongs to the device we're rendering"
 * predicate. Stale `currentData` guard: when RTK Query keeps last-
 * successful `data` across an arg change, the modal-style view must not
 * render `data.deviceId` mismatched against the active intent. Mirrors
 * the WEB-014D-followup `effectivePreflight` pattern (Codex 019e830b).
 */
export function isDiagnosticsForDevice(
  snapshot: DiagnosticsSnapshot | null | undefined,
  deviceId: string,
): snapshot is DiagnosticsSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}
