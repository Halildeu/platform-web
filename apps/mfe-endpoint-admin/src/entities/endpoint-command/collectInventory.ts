import type { CreateEndpointCommandBody } from './types';

/**
 * Canonical full-snapshot COLLECT_INVENTORY payload — every opt-in probe bit
 * ON. The agent's COLLECT_INVENTORY executor reads each `boolPayload(...,
 * "includeX")` from this map (platform-agent
 * `internal/commands/executor.go normaliseCollectOptions`). A command WITHOUT
 * these bits falls through to the AG-025H lightweight contract (host/os/identity
 * only), so the drawer tabs (Donanım/Yazılım/Hizmetler/…) never get evidence.
 *
 * Single source of truth shared by the device-detail-drawer İşlemler tab and
 * the devices-grid toolbar bulk action so "Envanteri Şimdi Topla" means the
 * SAME full snapshot wherever it is triggered (Codex 019ea756 must-fix #1).
 */
export const FULL_COLLECT_INVENTORY_PAYLOAD = {
  includeSoftware: true,
  includeWinGetEgress: true,
  includeHardware: true,
  includeDeviceHealth: true,
  includeOutdatedSoftware: true,
  includeHotfixPosture: true,
  includeDiagnostics: true,
  includeServices: true,
  includeStartupExposure: true,
  includeAppControl: true,
} as const;

/**
 * Build a full-snapshot COLLECT_INVENTORY command body. `extras` carries the
 * per-call `idempotencyKey` / `reason` (the bulk path generates a distinct
 * idempotencyKey per device).
 */
export function buildFullCollectInventoryBody(
  extras?: Pick<CreateEndpointCommandBody, 'idempotencyKey' | 'reason'>,
): CreateEndpointCommandBody {
  return {
    type: 'COLLECT_INVENTORY',
    payload: { ...FULL_COLLECT_INVENTORY_PAYLOAD },
    ...extras,
  };
}
