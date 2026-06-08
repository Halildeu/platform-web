import React from 'react';
import {
  useCreateDeviceCommandMutation,
  useDecommissionDeviceMutation,
  useForceEvaluateDeviceComplianceMutation,
  useReactivateDeviceMutation,
} from '../../app/services/endpointAdminApi';
import { buildFullCollectInventoryBody } from '../../entities/endpoint-command/collectInventory';
import type { DeviceStatus } from '../../entities/endpoint-device/types';
import { useEndpointAdminI18n } from '../../i18n';
import BulkDeviceLifecycleModal, { type BulkLifecycleAction } from './BulkDeviceLifecycleModal';

/** Per-command idempotency key (mirrors DeviceDetailDrawer). */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Active (non-decommissioned) lifecycle statuses. Bulk DECOMMISSION is
 * fail-closed: a selected device is eligible ONLY when its status is a KNOWN
 * active status — an `undefined`/unknown status is skipped, never decommissioned
 * (Codex 019ea938 must-fix #1).
 */
const ACTIVE_LIFECYCLE_STATUSES = new Set<DeviceStatus>([
  'PENDING_ENROLLMENT',
  'ONLINE',
  'STALE',
  'OFFLINE',
]);

export interface BulkSelectableDevice {
  device_id: string;
  hostname?: string;
  /**
   * Device status. `collect` (a device command) is only dispatched to ONLINE
   * devices — mirrors the drawer İşlemler `allowedAtAll` guard; non-ONLINE
   * selections are skipped (Codex 019ea756 must-fix #2). Lifecycle eligibility
   * also reads this (fail-closed).
   */
  status?: DeviceStatus;
}

export interface DeviceBulkActionsMenuProps {
  /** Reads the currently grid-selected devices (device_id + hostname). */
  getSelectedDevices: () => BulkSelectableDevice[];
  /** Surface a result/notice to the page (inline status). */
  onNotice: (message: string, kind: 'success' | 'error' | 'info') => void;
  /** Refresh the grid after a bulk run completes. */
  onAfterRun?: () => void;
}

type BulkAction = 'collect' | 'evaluate';

interface LifecycleSnapshot {
  selected: number;
  eligible: BulkSelectableDevice[];
  skipped: number;
}

/**
 * Toolbar bulk-action menu for the devices grid — rendered immediately LEFT of
 * the İndir export control via EntityGridTemplate `exportLeadingExtras`. Opens
 * on CLICK only (click-away backdrop closes) — matches the İndir export
 * dropdown; no hover-open, so cursor pass-overs don't pop the menu open.
 *
 * Bulk actions over every grid-selected device:
 *   - Envanteri Şimdi Topla (COLLECT_INVENTORY, ONLINE-only) + Uyumluluk
 *     Değerlendir (force compliance recompute) — device commands.
 *   - Toplu Pasif Al / Toplu Yeniden Etkinleştir — V56 lifecycle (DECOMMISSION
 *     / REACTIVATE). These are server-side lifecycle-metadata actions (NOT
 *     agent commands → no ONLINE requirement), but destructive-adjacent
 *     (decommission cancels pending commands, maintenance tokens, open
 *     uninstall requests), so they go through a confirm modal with a mandatory
 *     audited reason, a FROZEN selected/eligible/skipped snapshot, and (above a
 *     threshold) an explicit acknowledgement (Codex 019ea938).
 *
 * Per-row install/uninstall still stay in the detail drawer (software-target +
 * maker-checker — not safe to bulk from a toolbar).
 */
export const DeviceBulkActionsMenu: React.FC<DeviceBulkActionsMenuProps> = ({
  getSelectedDevices,
  onNotice,
  onAfterRun,
}) => {
  const { t } = useEndpointAdminI18n();
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [createCommand] = useCreateDeviceCommandMutation();
  const [forceEvaluate] = useForceEvaluateDeviceComplianceMutation();
  const [decommission] = useDecommissionDeviceMutation();
  const [reactivate] = useReactivateDeviceMutation();

  // Lifecycle modal: a FROZEN snapshot is captured when the menu item is
  // clicked, and the confirm runs on exactly that set (Codex 019ea938 #2).
  const [lifecycleAction, setLifecycleAction] = React.useState<BulkLifecycleAction | null>(null);
  const [lifecycleSnapshot, setLifecycleSnapshot] = React.useState<LifecycleSnapshot>({
    selected: 0,
    eligible: [],
    skipped: 0,
  });

  const runBulk = React.useCallback(
    async (action: BulkAction) => {
      setOpen(false);
      const selected = getSelectedDevices();
      if (selected.length === 0) {
        onNotice(t('endpointAdmin.devices.bulk.noSelection'), 'info');
        return;
      }
      const actionLabel =
        action === 'collect'
          ? t('endpointAdmin.devices.bulk.collect.label')
          : t('endpointAdmin.devices.bulk.evaluate.label');

      // `collect` is a device command — only ONLINE devices are eligible
      // (mirrors the drawer İşlemler `allowedAtAll` guard). `evaluate` is a
      // server-side recompute from existing snapshots → applies to every
      // selected device (Codex 019ea756 must-fix #2).
      const eligible =
        action === 'collect' ? selected.filter((d) => d.status === 'ONLINE') : selected;
      const skipped = selected.length - eligible.length;

      if (eligible.length === 0) {
        onNotice(t('endpointAdmin.devices.bulk.collect.noneOnline'), 'info');
        return;
      }

      setRunning(true);
      let ok = 0;
      let fail = 0;
      for (const device of eligible) {
        try {
          if (action === 'collect') {
            await createCommand({
              deviceId: device.device_id,
              body: buildFullCollectInventoryBody({
                idempotencyKey: newIdempotencyKey(),
                reason: t('endpointAdmin.devices.bulk.collect.reason'),
              }),
            }).unwrap();
          } else {
            await forceEvaluate({ deviceId: device.device_id }).unwrap();
          }
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setRunning(false);

      if (fail === 0 && skipped === 0) {
        onNotice(
          t('endpointAdmin.devices.bulk.resultOk')
            .replace('{action}', actionLabel)
            .replace('{count}', String(ok)),
          'success',
        );
      } else if (fail === 0) {
        onNotice(
          t('endpointAdmin.devices.bulk.resultOkSkipped')
            .replace('{action}', actionLabel)
            .replace('{count}', String(ok))
            .replace('{skipped}', String(skipped)),
          'info',
        );
      } else {
        onNotice(
          t('endpointAdmin.devices.bulk.resultPartial')
            .replace('{action}', actionLabel)
            .replace('{ok}', String(ok))
            .replace('{fail}', String(fail)),
          ok > 0 ? 'info' : 'error',
        );
      }
      onAfterRun?.();
    },
    [createCommand, forceEvaluate, getSelectedDevices, onAfterRun, onNotice, t],
  );

  // Open the bulk lifecycle modal with a FROZEN, fail-closed eligibility
  // snapshot (Codex 019ea938 #1 + #2).
  const openLifecycle = React.useCallback(
    (action: BulkLifecycleAction) => {
      setOpen(false);
      const selected = getSelectedDevices();
      if (selected.length === 0) {
        onNotice(t('endpointAdmin.devices.bulk.noSelection'), 'info');
        return;
      }
      const eligible = selected.filter((d) =>
        action === 'decommission'
          ? d.status != null && ACTIVE_LIFECYCLE_STATUSES.has(d.status)
          : d.status === 'DECOMMISSIONED',
      );
      setLifecycleSnapshot({
        selected: selected.length,
        eligible,
        skipped: selected.length - eligible.length,
      });
      setLifecycleAction(action);
    },
    [getSelectedDevices, onNotice, t],
  );

  const runLifecycle = React.useCallback(
    async (reason: string) => {
      if (lifecycleAction == null || running) return;
      const action = lifecycleAction;
      const { eligible, skipped } = lifecycleSnapshot;
      if (eligible.length === 0) return; // modal disables submit; defensive.

      setRunning(true);
      let ok = 0;
      let fail = 0;
      for (const device of eligible) {
        try {
          if (action === 'decommission') {
            await decommission({ deviceId: device.device_id, body: { reason } }).unwrap();
          } else {
            await reactivate({ deviceId: device.device_id, body: { reason } }).unwrap();
          }
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setRunning(false);
      setLifecycleAction(null);

      const actionLabel = t(
        action === 'decommission'
          ? 'endpointAdmin.devices.bulk.lifecycle.decommission.label'
          : 'endpointAdmin.devices.bulk.lifecycle.reactivate.label',
      );
      onNotice(
        t('endpointAdmin.devices.bulk.lifecycle.result')
          .replace('{action}', actionLabel)
          .replace('{ok}', String(ok))
          .replace('{fail}', String(fail))
          .replace('{skipped}', String(skipped)),
        fail === 0 ? 'success' : ok > 0 ? 'info' : 'error',
      );
      onAfterRun?.();
    },
    [
      lifecycleAction,
      lifecycleSnapshot,
      running,
      decommission,
      reactivate,
      onAfterRun,
      onNotice,
      t,
    ],
  );

  return (
    <div className="relative" data-component="device-bulk-actions-menu">
      <button
        type="button"
        disabled={running}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="device-bulk-actions-trigger"
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-xs font-medium text-text-secondary hover:bg-surface-raised disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
      >
        {running
          ? t('endpointAdmin.devices.bulk.running')
          : t('endpointAdmin.devices.bulk.trigger')}
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </button>
      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="menu"
            data-testid="device-bulk-actions-menu"
            className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-border-default bg-surface-default py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              data-testid="device-bulk-collect"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
              onClick={() => void runBulk('collect')}
            >
              {t('endpointAdmin.devices.bulk.collect.label')}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="device-bulk-evaluate"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
              onClick={() => void runBulk('evaluate')}
            >
              {t('endpointAdmin.devices.bulk.evaluate.label')}
            </button>
            <div className="my-1 border-t border-border-default" role="separator" />
            <button
              type="button"
              role="menuitem"
              data-testid="device-bulk-decommission"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-state-danger-text hover:bg-surface-muted"
              onClick={() => openLifecycle('decommission')}
            >
              {t('endpointAdmin.devices.bulk.lifecycle.decommission.label')}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="device-bulk-reactivate"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
              onClick={() => openLifecycle('reactivate')}
            >
              {t('endpointAdmin.devices.bulk.lifecycle.reactivate.label')}
            </button>
          </div>
        </>
      )}
      {lifecycleAction && (
        <BulkDeviceLifecycleModal
          open
          action={lifecycleAction}
          selectedCount={lifecycleSnapshot.selected}
          eligibleCount={lifecycleSnapshot.eligible.length}
          skippedCount={lifecycleSnapshot.skipped}
          running={running}
          error={false}
          onCancel={() => {
            if (!running) setLifecycleAction(null);
          }}
          onConfirm={(reason) => void runLifecycle(reason)}
        />
      )}
    </div>
  );
};

export default DeviceBulkActionsMenu;
