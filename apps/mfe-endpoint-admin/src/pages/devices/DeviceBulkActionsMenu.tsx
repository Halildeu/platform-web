import React from 'react';
import {
  useCreateDeviceCommandMutation,
  useForceEvaluateDeviceComplianceMutation,
} from '../../app/services/endpointAdminApi';
import { buildFullCollectInventoryBody } from '../../entities/endpoint-command/collectInventory';
import type { DeviceStatus } from '../../entities/endpoint-device/types';
import { useEndpointAdminI18n } from '../../i18n';

/** Per-command idempotency key (mirrors DeviceDetailDrawer). */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface BulkSelectableDevice {
  device_id: string;
  hostname?: string;
  /**
   * Device status. `collect` (a device command) is only dispatched to ONLINE
   * devices — mirrors the drawer İşlemler `allowedAtAll` guard; non-ONLINE
   * selections are skipped (Codex 019ea756 must-fix #2).
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

/**
 * Toolbar bulk-action menu for the devices grid — rendered immediately LEFT of
 * the İndir export control via EntityGridTemplate `exportLeadingExtras`. Opens
 * on hover (and click). Applies a device-level command to every grid-selected
 * device: Envanteri Şimdi Topla (COLLECT_INVENTORY) + Uyumluluk Değerlendir
 * (force compliance evaluate). Per-row install/uninstall stay in the detail
 * drawer (software-target + maker-checker — not safe to bulk from a toolbar).
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
  const closeTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const openMenu = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }, [cancelClose]);

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

  return (
    <div
      className="relative"
      data-component="device-bulk-actions-menu"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
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
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
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
          </div>
        </>
      )}
    </div>
  );
};

export default DeviceBulkActionsMenu;
