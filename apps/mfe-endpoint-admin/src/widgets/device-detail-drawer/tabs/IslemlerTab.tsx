import React from 'react';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type {
  CommandType,
  CreateEndpointCommandBody,
  EndpointCommand,
} from '../../../entities/endpoint-command/types';
import { isDestructiveCommand } from '../../../entities/endpoint-command/types';
import { useEndpointAdminI18n } from '../../../i18n';
import {
  DestructiveCommandModal,
  type DestructiveCommandSubmitBody,
} from '../components/DestructiveCommandModal';

export interface IslemlerTabProps {
  device: EndpointDevice;
  recentCommands: EndpointCommand[];
  isSubmitting: boolean;
  /** Last-issued command id, for surfacing the success toast inside the tab. */
  lastIssuedCommandId: string | null;
  /** True when the last submit returned approvalStatus=PENDING. */
  lastIssuedRequiresApproval: boolean;
  /** Last error message (already i18n-resolved). */
  lastError: string | null;
  onIssueCommand: (body: CreateEndpointCommandBody) => void;
}

type DestructiveType = Extract<
  CommandType,
  'LOCK_USER_LOGIN' | 'UNLOCK_USER_LOGIN' | 'CHANGE_LOCAL_PASSWORD' | 'ROTATE_CREDENTIAL'
>;

const NON_DESTRUCTIVE_TYPES: CommandType[] = ['COLLECT_INVENTORY'];

const DESTRUCTIVE_TYPES: DestructiveType[] = [
  'LOCK_USER_LOGIN',
  'UNLOCK_USER_LOGIN',
  'CHANGE_LOCAL_PASSWORD',
  'ROTATE_CREDENTIAL',
];

const isDestructive = (t: CommandType): t is DestructiveType => isDestructiveCommand(t);

export const IslemlerTab: React.FC<IslemlerTabProps> = ({
  device,
  recentCommands,
  isSubmitting,
  lastIssuedCommandId,
  lastIssuedRequiresApproval,
  lastError,
  onIssueCommand,
}) => {
  const { t } = useEndpointAdminI18n();
  const [activeModalType, setActiveModalType] = React.useState<DestructiveType | null>(null);

  const isOnline = device.status === 'ONLINE';
  const allowedAtAll = isOnline; // STALE/OFFLINE/DECOMMISSIONED/PENDING_ENROLLMENT → all disabled in v1

  const successMessage = lastIssuedCommandId
    ? (lastIssuedRequiresApproval
        ? t('endpointAdmin.drawer.islemler.successPending')
        : t('endpointAdmin.drawer.islemler.success')
      ).replace('{commandId}', lastIssuedCommandId)
    : null;

  const handleNonDestructive = (type: CommandType) => {
    // WEB-018 — Faz 22.5.x. The default COLLECT_INVENTORY command used
    // to land at the agent with no payload, which falls through every
    // opt-in flag and runs the AG-025H lightweight contract (host / os /
    // identity only). That meant the WEB-013 Donanım drawer tab could
    // never get hardware evidence because AG-035's
    // CollectOptions.IncludeHardware was always false. We now set all
    // three opt-in bits when the operator triggers "Envanteri Şimdi
    // Topla" — software inventory + WinGet egress preflight + hardware
    // probe — so a single click produces the full snapshot the
    // Envanter / Donanım tabs render.
    //
    // The field name is `payload` to match the backend
    // CreateEndpointCommandRequest record (Map<String, Object> payload).
    // The agent's COLLECT_INVENTORY executor reads
    // `boolPayload(command.Payload, "includeHardware")` etc. directly
    // from this map.
    if (type === 'COLLECT_INVENTORY') {
      onIssueCommand({
        type,
        payload: {
          includeSoftware: true,
          includeWinGetEgress: true,
          includeHardware: true,
        },
      });
      return;
    }
    onIssueCommand({ type });
  };

  const openDestructive = (type: DestructiveType) => {
    setActiveModalType(type);
  };

  const handleDestructiveSubmit = (body: DestructiveCommandSubmitBody) => {
    onIssueCommand(body);
    setActiveModalType(null);
  };

  return (
    <div className="px-6 py-4 space-y-6" data-testid="device-islemler-tab">
      {!allowedAtAll && (
        <div
          className="rounded-md border border-state-warning-border bg-state-warning-subtle px-4 py-2 text-sm text-state-warning-text"
          data-testid="islemler-offline-banner"
          role="status"
        >
          {t('endpointAdmin.drawer.islemler.offlineHint')}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          data-testid="islemler-success-toast"
          className="rounded-md border border-state-success-border bg-state-success-subtle px-4 py-2 text-sm text-state-success-text"
        >
          {successMessage}
        </div>
      )}

      {lastError && (
        <div
          role="alert"
          data-testid="islemler-error-toast"
          className="rounded-md border border-state-danger-border bg-state-danger-subtle px-4 py-2 text-sm text-state-danger-text"
        >
          {lastError}
        </div>
      )}

      <section>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.drawer.islemler.heading.nonDestructive')}
        </h4>
        <div className="flex flex-wrap gap-2">
          {NON_DESTRUCTIVE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleNonDestructive(type)}
              disabled={!allowedAtAll || isSubmitting}
              data-testid={`command-button-${type}`}
              className="px-4 py-2 rounded-md border border-border-default bg-surface-default text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t(`endpointAdmin.drawer.islemler.button.${type}`)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-1">
          {t('endpointAdmin.drawer.islemler.heading.destructive')}
        </h4>
        <p className="text-xs text-text-secondary mb-3">
          {t('endpointAdmin.drawer.islemler.dualControlNote')}
        </p>
        <div className="flex flex-wrap gap-2">
          {DESTRUCTIVE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => openDestructive(type)}
              disabled={!allowedAtAll || isSubmitting}
              data-testid={`command-button-${type}`}
              className="px-4 py-2 rounded-md border border-danger bg-surface-default text-sm text-danger hover:bg-state-danger-subtle disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t(`endpointAdmin.drawer.islemler.button.${type}`)}
            </button>
          ))}
        </div>
      </section>

      {recentCommands.length > 0 && (
        <section data-testid="recent-commands-list">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
            Son komutlar
          </h4>
          <ul className="space-y-1">
            {recentCommands.slice(0, 5).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-xs border-b border-border-subtle py-1"
              >
                <span className="font-mono truncate flex-1">{c.type}</span>
                <span className="text-text-secondary">
                  {t(`endpointAdmin.command.status.${c.status}`)}
                </span>
                {isDestructive(c.type) && (
                  <span className="text-text-secondary">
                    {t(`endpointAdmin.command.approval.${c.approvalStatus}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeModalType && (
        <DestructiveCommandModal
          open={activeModalType !== null}
          type={activeModalType}
          isSubmitting={isSubmitting}
          onCancel={() => setActiveModalType(null)}
          onSubmit={handleDestructiveSubmit}
        />
      )}
    </div>
  );
};

IslemlerTab.displayName = 'IslemlerTab';
