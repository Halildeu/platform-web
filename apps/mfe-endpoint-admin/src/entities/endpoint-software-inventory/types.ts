/**
 * WEB-011 — Faz 22.5.1B (Codex 019e6b16 iter-3 AGREE).
 *
 * Mirrors the platform-backend BE-020I admin REST DTOs:
 *
 *   - AdminSoftwareInventorySnapshotResponse
 *   - AdminSoftwareInventoryItemResponse
 *   - AdminEndpointSoftwareInventoryController.DeviceSoftwareInventoryPayload
 *     (record: { snapshot, items: Page<...> })
 *
 * Backend exact JSON field casing is camelCase. The frontend keeps the
 * same casing so the RTK Query body is consumable without an extra
 * normalizer pass — the only transformation we apply here is defensive
 * (snapshot=null fallback + nested `details.inventory.software` shape
 * support per Codex iter-1 P1 backend follow-up).
 *
 * No mutation surface. Software inventory mutation (collect command) is
 * scoped to the existing İşlemler tab, not this view (WEB-011 = read-only).
 */

export type SoftwareInstallSource = 'HKLM' | 'HKLM_WOW6432';

export interface SoftwareInventorySnapshot {
  id: string;
  tenantId: string;
  deviceId: string;
  schemaVersion: number;
  supported: boolean;
  appCount: number | null;
  appsStoredCount: number | null;
  wingetReady: boolean | null;
  wingetVersion: string | null;
  totalSizeKb: number | null;
  truncated: boolean;
  probeErrors: Record<string, unknown> | null;
  summaryCollectedAt: string | null;
  appsCollectedAt: string | null;
  appsAvailable: boolean;
  updatedAt: string | null;
}

export interface SoftwareInventoryItem {
  id: string;
  snapshotId: string | null;
  deviceId: string;
  displayName: string;
  displayVersion: string | null;
  publisher: string | null;
  installDate: string | null;
  estimatedSizeKb: number | null;
  architecture: string | null;
  installSource: SoftwareInstallSource;
  uninstallStringPresent: boolean;
  msiProductCodeHash: string | null;
}

/**
 * Spring Data Page shape (camelCase). We only depend on the fields
 * actually consumed by the items table; numberOfElements / first / last
 * etc. are intentionally not modelled until a use-case appears.
 */
export interface SoftwareInventoryItemsPage {
  content: SoftwareInventoryItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  empty: boolean;
}

/**
 * Wire shape of the device-detail endpoint:
 *   GET /api/v1/admin/endpoint-devices/{deviceId}/software-inventory
 * which the gateway exposes externally at
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/software-inventory
 */
export interface DeviceSoftwareInventory {
  snapshot: SoftwareInventorySnapshot;
  items: SoftwareInventoryItemsPage;
}

export interface GetDeviceSoftwareInventoryArgs {
  deviceId: string;
  q?: string;
  publisher?: string;
  installSource?: SoftwareInstallSource;
  page?: number;
  size?: number;
}

/**
 * Defensive normalizer: the backend lives at a stable shape today but the
 * agent → backend wire historically used a `details.inventory.software`
 * wrapper (Codex 019e6aef BE-020I follow-up shipped the backend-side fix).
 * This normalizer keeps the UI resilient if a future variant ships the
 * same content nested under that wrapper.
 *
 * 404 is the canonical "no snapshot" signal — UI should map RTK Query
 * `error.status === 404` to the empty state, NOT use this normalizer to
 * fabricate one.
 */
export function normalizeSoftwareInventoryResponse(raw: unknown): DeviceSoftwareInventory | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.snapshot && candidate.items) {
    return candidate as unknown as DeviceSoftwareInventory;
  }
  // Defensive nested fallback (Codex 019e6aef iter-1 P1 acknowledgement).
  if (candidate.details && typeof candidate.details === 'object') {
    const details = candidate.details as Record<string, unknown>;
    if (details.inventory && typeof details.inventory === 'object') {
      const inv = details.inventory as Record<string, unknown>;
      if (inv.software && typeof inv.software === 'object') {
        return null; // server should reshape; UI must not invent
      }
    }
  }
  return null;
}
