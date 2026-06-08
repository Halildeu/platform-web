import React from 'react';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type {
  CommandType,
  CreateEndpointCommandBody,
  EndpointCommand,
} from '../../../entities/endpoint-command/types';
import { isDestructiveCommand } from '../../../entities/endpoint-command/types';
import { buildFullCollectInventoryBody } from '../../../entities/endpoint-command/collectInventory';
import { useEndpointAdminI18n } from '../../../i18n';
import {
  DestructiveCommandModal,
  type DestructiveCommandSubmitBody,
} from '../components/DestructiveCommandModal';
import { AgentUpdateModal } from '../components/AgentUpdateModal';
import { RolloutRingModal } from '../components/RolloutRingModal';
import { MaintenanceTokenModal } from '../components/MaintenanceTokenModal';
import {
  DeviceLifecycleModal,
  type DeviceLifecycleAction,
} from '../components/DeviceLifecycleModal';

export interface IslemlerTabProps {
  device: EndpointDevice;
  recentCommands: EndpointCommand[];
  isSubmitting: boolean;
  /** Last-issued command id, for surfacing the success toast inside the tab. */
  lastIssuedCommandId: string | null;
  /** True when the last submit returned approvalStatus=PENDING. */
  lastIssuedRequiresApproval: boolean;
  /** One-time local recovery password returned by AG-042 dedicated backend path. */
  lastIssuedLocalPassword: string | null;
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
  lastIssuedLocalPassword,
  lastError,
  onIssueCommand,
}) => {
  const { t } = useEndpointAdminI18n();
  const [activeModalType, setActiveModalType] = React.useState<DestructiveType | null>(null);
  // AG-029 — catalog-bound self-update dispatch (separate from the dual-control
  // destructive actions; its own modal + dedicated BE-032 endpoint).
  const [agentUpdateOpen, setAgentUpdateOpen] = React.useState(false);
  const [agentUpdateCommandId, setAgentUpdateCommandId] = React.useState<string | null>(null);
  // BE-026 — per-device rollout-ring + tags assignment (server-side metadata,
  // not an online-device command, so it is not gated by `allowedAtAll`).
  const [rolloutOpen, setRolloutOpen] = React.useState(false);
  const [rolloutSaved, setRolloutSaved] = React.useState(false);
  // BE-027 — maintenance-token manager (one-time secret handling lives in the
  // modal; conditionally mounted so its list query + hooks stay dormant).
  const [maintOpen, setMaintOpen] = React.useState(false);
  // Device lifecycle (V56) — DECOMMISSION ("Pasif Al") / REACTIVATE ("Yeniden
  // Etkinleştir"). Admin metadata action; NOT gated by `allowedAtAll` (works in
  // any status, and reactivate is only reachable once DECOMMISSIONED).
  const [lifecycleAction, setLifecycleAction] = React.useState<DeviceLifecycleAction | null>(null);
  const [lifecycleDone, setLifecycleDone] = React.useState<DeviceLifecycleAction | null>(null);

  const isOnline = device.status === 'ONLINE';
  const isDecommissioned = device.status === 'DECOMMISSIONED';
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
    // CollectOptions.IncludeHardware was always false. We now set ALL
    // opt-in bits when the operator triggers "Envanteri Şimdi Topla" —
    // software inventory + WinGet egress preflight + hardware probe +
    // device-health + outdated software + hotfix posture + agent
    // diagnostics + critical services — so a single click produces the
    // full snapshot every drawer tab renders.
    //
    // The field name is `payload` to match the backend
    // CreateEndpointCommandRequest record (Map<String, Object> payload).
    // The agent's COLLECT_INVENTORY executor reads
    // `boolPayload(command.Payload, "includeHardware")` etc. directly
    // from this map; see
    // platform-agent internal/commands/executor.go normaliseCollectOptions
    // for the canonical bit-name list.
    //
    // Codex 019e8389 must_fix #1 absorb: includeServices:true added for
    // AG-039 critical-services Hizmetler tab. Without this, the new tab
    // would only ever render the 404 empty state because no operator
    // command ever flips the payload bit (the empty-state copy gives
    // operators the literal command but having to type it by hand is
    // friction — the canonical "trigger every probe" button must just
    // work).
    if (type === 'COLLECT_INVENTORY') {
      // Canonical full-snapshot payload (all opt-in probe bits) — now shared
      // with the devices-grid toolbar bulk action via a single helper so
      // "Envanteri Şimdi Topla" means the same full snapshot everywhere
      // (Codex 019ea756 must-fix #1: single source of truth).
      onIssueCommand(buildFullCollectInventoryBody());
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

      {lastIssuedLocalPassword && (
        <div
          role="status"
          data-testid="local-password-one-time-banner"
          className="rounded-md border border-state-warning-border bg-state-warning-subtle px-4 py-3 text-sm text-state-warning-text"
        >
          <div className="font-medium">
            {t('endpointAdmin.drawer.islemler.localPassword.oneTimeTitle')}
          </div>
          <div className="mt-1 text-xs">
            {t('endpointAdmin.drawer.islemler.localPassword.oneTimeHint')}
          </div>
          <code
            className="mt-2 block rounded border border-border-default bg-surface-default px-3 py-2 font-mono text-sm text-text-primary"
            data-testid="local-password-one-time-value"
          >
            {lastIssuedLocalPassword}
          </code>
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

      <section data-testid="islemler-agent-mgmt-section">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.drawer.islemler.heading.agentMgmt')}
        </h4>
        {agentUpdateCommandId && (
          <div
            role="status"
            data-testid="agent-update-success-toast"
            className="rounded-md border border-state-success-border bg-state-success-subtle px-4 py-2 text-sm text-state-success-text mb-2"
          >
            {t('endpointAdmin.drawer.islemler.agentUpdateSuccess').replace(
              '{commandId}',
              agentUpdateCommandId,
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAgentUpdateOpen(true)}
            disabled={!allowedAtAll || isSubmitting}
            data-testid="command-button-UPDATE_AGENT"
            className="px-4 py-2 rounded-md border border-border-default bg-surface-default text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('endpointAdmin.drawer.islemler.button.UPDATE_AGENT')}
          </button>
        </div>
      </section>

      <section data-testid="islemler-rollout-section">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.rollout.section.heading')}
        </h4>
        {rolloutSaved && (
          <div
            role="status"
            data-testid="rollout-success-toast"
            className="rounded-md border border-state-success-border bg-state-success-subtle px-4 py-2 text-sm text-state-success-text mb-2"
          >
            {t('endpointAdmin.rollout.section.saved')}
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary" data-testid="rollout-current-ring">
            {t('endpointAdmin.rollout.section.current')}:{' '}
            <span className="font-mono text-text-primary">
              {device.deploymentRing ?? t('endpointAdmin.rollout.ring.unassigned')}
            </span>
            {device.deviceTags && device.deviceTags.length > 0 && (
              <span className="text-text-subtle"> · {device.deviceTags.join(', ')}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              setRolloutSaved(false);
              setRolloutOpen(true);
            }}
            disabled={isSubmitting}
            data-testid="rollout-open-button"
            className="px-3 py-1.5 rounded-md border border-border-default bg-surface-default text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50"
          >
            {t('endpointAdmin.rollout.section.button')}
          </button>
        </div>
      </section>

      <section data-testid="islemler-maintenance-section">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.maint.section.heading')}
        </h4>
        <button
          type="button"
          onClick={() => setMaintOpen(true)}
          data-testid="maintenance-open-button"
          className="px-4 py-2 rounded-md border border-border-default bg-surface-default text-sm text-text-primary hover:bg-surface-hover"
        >
          {t('endpointAdmin.maint.section.button')}
        </button>
      </section>

      <section data-testid="islemler-lifecycle-section">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.lifecycle.section.heading')}
        </h4>
        {lifecycleDone && (
          <div
            role="status"
            data-testid="lifecycle-success-toast"
            className="rounded-md border border-state-success-border bg-state-success-subtle px-4 py-2 text-sm text-state-success-text mb-2"
          >
            {t(`endpointAdmin.lifecycle.section.done.${lifecycleDone}`)}
          </div>
        )}
        <p className="text-xs text-text-secondary mb-3">
          {t('endpointAdmin.lifecycle.section.note')}
        </p>
        {isDecommissioned ? (
          <button
            type="button"
            onClick={() => {
              setLifecycleDone(null);
              setLifecycleAction('reactivate');
            }}
            disabled={isSubmitting}
            data-testid="lifecycle-reactivate-button"
            className="px-4 py-2 rounded-md border border-brand-primary bg-surface-default text-sm text-brand-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('endpointAdmin.lifecycle.button.reactivate')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setLifecycleDone(null);
              setLifecycleAction('decommission');
            }}
            disabled={isSubmitting}
            data-testid="lifecycle-decommission-button"
            className="px-4 py-2 rounded-md border border-danger bg-surface-default text-sm text-danger hover:bg-state-danger-subtle disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('endpointAdmin.lifecycle.button.decommission')}
          </button>
        )}
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

      {/* Mounted only while open: AgentUpdateModal calls RTK Query hooks
          (useListAgentUpdateReleasesQuery / useDispatchAgentUpdateMutation)
          unconditionally, so rendering it always would require a Redux
          <Provider> in every IslemlerTab/drawer test. Conditional mount keeps
          the hooks dormant until the operator opens it (matches the
          DestructiveCommandModal pattern above). */}
      {agentUpdateOpen && (
        <AgentUpdateModal
          open
          deviceId={device.id}
          onCancel={() => setAgentUpdateOpen(false)}
          onDispatched={(commandId) => {
            setAgentUpdateOpen(false);
            setAgentUpdateCommandId(commandId);
          }}
        />
      )}

      {rolloutOpen && (
        <RolloutRingModal
          open
          deviceId={device.id}
          currentRing={device.deploymentRing}
          currentTags={device.deviceTags ?? []}
          onCancel={() => setRolloutOpen(false)}
          onSaved={() => {
            setRolloutOpen(false);
            setRolloutSaved(true);
          }}
        />
      )}

      {maintOpen && (
        <MaintenanceTokenModal open deviceId={device.id} onClose={() => setMaintOpen(false)} />
      )}

      {lifecycleAction && (
        <DeviceLifecycleModal
          open
          deviceId={device.id}
          action={lifecycleAction}
          onCancel={() => setLifecycleAction(null)}
          onDone={() => {
            setLifecycleDone(lifecycleAction);
            setLifecycleAction(null);
          }}
        />
      )}
    </div>
  );
};

IslemlerTab.displayName = 'IslemlerTab';
