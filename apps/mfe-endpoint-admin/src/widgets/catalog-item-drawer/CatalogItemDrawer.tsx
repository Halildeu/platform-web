import React from 'react';

import {
  useGetCatalogItemQuery,
  useCreateCatalogItemMutation,
  useUpdateCatalogItemMutation,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type {
  AdminCatalogItemRequest,
  AdminCatalogItemResponse,
  CatalogProvider,
  CatalogRiskTier,
  DetectionRule,
} from '../../entities/endpoint-software-catalog/types';
import { normalizeDetectionRule } from '../../entities/endpoint-software-catalog/types';
import { DetectionRuleEditor } from './DetectionRuleEditor';

/**
 * Path C3 — Unified CatalogItemDrawer (Codex thread 019e8982 iter-2
 * absorb).
 *
 * Modes:
 *  - `new`: empty form, all metadata editable, default detection rule
 *    is WINGET_PACKAGE (the simplest authoring path).
 *  - `edit`: fetches single item via getCatalogItem(id), hydrates form,
 *    `catalogItemId` field is read-only (backend immutable). Unknown
 *    detection rule shapes (normalizer kind='unknown') disable Save
 *    and show raw JSON read-only (fail-closed; Codex iter-2 §4 absorb).
 *
 * On submit success the drawer closes and the parent list refetches
 * (RTK Query invalidation on LIST tag — Codex iter-2 §5).
 *
 * Permissions: parent passes `canManage` (resolved from the shell
 * `getModuleLevel('ENDPOINT_ADMIN')` against `endpoint:catalog:write`).
 * When false, Save is disabled and a "yetki gerekli" toast surfaces
 * on backend 403.
 */

export type CatalogItemDrawerMode = { kind: 'new' } | { kind: 'edit'; catalogItemId: string };

export interface CatalogItemDrawerProps {
  mode: CatalogItemDrawerMode;
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onSaved?: (item: AdminCatalogItemResponse) => void;
}

interface FormState {
  catalogItemId: string;
  provider: CatalogProvider;
  packageId: string;
  displayName: string;
  publisher: string;
  description: string;
  homepageUrl: string;
  riskTier: CatalogRiskTier;
  detectionRule: DetectionRule;
}

const DEFAULT_FORM: FormState = {
  catalogItemId: '',
  provider: 'WINGET',
  packageId: '',
  displayName: '',
  publisher: '',
  description: '',
  homepageUrl: '',
  riskTier: 'LOW',
  detectionRule: { type: 'WINGET_PACKAGE', packageId: '' },
};

function hydrateFormFromResponse(r: AdminCatalogItemResponse): FormState | null {
  const norm = normalizeDetectionRule(r.detectionRule);
  if (norm.kind === 'unknown') return null;
  return {
    catalogItemId: r.catalogItemId,
    provider: r.provider,
    packageId: r.packageId,
    displayName: r.displayName,
    publisher: r.publisher ?? '',
    description: r.description ?? '',
    homepageUrl: r.homepageUrl ?? '',
    riskTier: r.riskTier,
    detectionRule: norm.rule,
  };
}

function buildRequest(form: FormState): AdminCatalogItemRequest {
  return {
    catalogItemId: form.catalogItemId,
    provider: form.provider,
    packageId: form.packageId,
    displayName: form.displayName,
    publisher: form.publisher.length > 0 ? form.publisher : undefined,
    description: form.description.length > 0 ? form.description : undefined,
    homepageUrl: form.homepageUrl.length > 0 ? form.homepageUrl : undefined,
    riskTier: form.riskTier,
    detectionRule: form.detectionRule,
  };
}

const PROVIDERS: CatalogProvider[] = ['WINGET', 'CHOCOLATEY', 'MANUAL'];
const RISK_TIERS: CatalogRiskTier[] = ['LOW', 'MEDIUM', 'HIGH'];

export const CatalogItemDrawer: React.FC<CatalogItemDrawerProps> = ({
  mode,
  open,
  canManage,
  onClose,
  onSaved,
}) => {
  const { t } = useEndpointAdminI18n();
  const isEdit = mode.kind === 'edit';
  const editId = isEdit ? mode.catalogItemId : '';

  const fetchSkip = !open || !isEdit;
  const {
    data,
    error: fetchError,
    isFetching,
  } = useGetCatalogItemQuery(editId, {
    skip: fetchSkip,
  });

  const [createCatalogItem, createState] = useCreateCatalogItemMutation();
  const [updateCatalogItem, updateState] = useUpdateCatalogItemMutation();

  const [form, setForm] = React.useState<FormState>(DEFAULT_FORM);
  const [unknownRule, setUnknownRule] = React.useState<AdminCatalogItemResponse | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Reset on open/mode flip.
  React.useEffect(() => {
    if (!open) return;
    if (mode.kind === 'new') {
      setForm(DEFAULT_FORM);
      setUnknownRule(null);
      setSubmitError(null);
    }
  }, [open, mode.kind]);

  // Hydrate on edit fetch.
  React.useEffect(() => {
    if (!open || !isEdit || !data) return;
    const hydrated = hydrateFormFromResponse(data);
    if (hydrated) {
      setForm(hydrated);
      setUnknownRule(null);
    } else {
      setUnknownRule(data);
    }
    setSubmitError(null);
  }, [open, isEdit, data]);

  if (!open) return null;

  const saveDisabled =
    !canManage ||
    unknownRule !== null ||
    isFetching ||
    createState.isLoading ||
    updateState.isLoading ||
    form.catalogItemId.length === 0 ||
    form.packageId.length === 0 ||
    form.displayName.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const body = buildRequest(form);
    try {
      const result = isEdit
        ? await updateCatalogItem({ catalogItemId: form.catalogItemId, body }).unwrap()
        : await createCatalogItem(body).unwrap();
      onSaved?.(result);
      onClose();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setSubmitError(t('endpointAdmin.catalog.error.forbidden'));
      } else if (status === 422) {
        const body = (err as { data?: { errors?: unknown } })?.data?.errors;
        if (Array.isArray(body) && body.length > 0) {
          setSubmitError(
            body
              .map((e2) =>
                typeof e2 === 'object' && e2 != null
                  ? String((e2 as { message?: string }).message ?? '')
                  : '',
              )
              .filter(Boolean)
              .join('; '),
          );
        } else {
          setSubmitError(t('endpointAdmin.catalog.error.validation'));
        }
      } else if (status === 400) {
        setSubmitError(t('endpointAdmin.catalog.error.badRequest'));
      } else {
        setSubmitError(t('endpointAdmin.catalog.error.generic'));
      }
    }
  }

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-item-drawer-title"
      className="catalog-item-drawer"
      data-testid="catalog-item-drawer"
    >
      <header className="catalog-item-drawer__header">
        <h3 id="catalog-item-drawer-title">
          {isEdit
            ? t('endpointAdmin.catalog.drawer.title.edit')
            : t('endpointAdmin.catalog.drawer.title.new')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('endpointAdmin.catalog.drawer.close')}
        >
          ×
        </button>
      </header>
      {isEdit && isFetching && (
        <p className="catalog-item-drawer__status">{t('endpointAdmin.catalog.drawer.loading')}</p>
      )}
      {fetchError && (
        <p className="catalog-item-drawer__status catalog-item-drawer__status--error">
          {t('endpointAdmin.catalog.error.fetch')}
        </p>
      )}
      {unknownRule && (
        <section className="catalog-item-drawer__unknown" data-testid="catalog-item-drawer-unknown">
          <p className="catalog-item-drawer__status catalog-item-drawer__status--warn">
            {t('endpointAdmin.catalog.drawer.unknownRule')}
          </p>
          <pre className="catalog-item-drawer__json">
            {JSON.stringify(unknownRule.detectionRule, null, 2)}
          </pre>
        </section>
      )}
      {!unknownRule && (
        <form className="catalog-item-drawer__form" onSubmit={handleSubmit}>
          <label>
            {t('endpointAdmin.catalog.field.catalogItemId')}
            <input
              type="text"
              value={form.catalogItemId}
              onChange={(e) => setForm((f) => ({ ...f, catalogItemId: e.target.value }))}
              disabled={isEdit || !canManage}
              required
              data-testid="catalog-item-id"
            />
          </label>
          <label>
            {t('endpointAdmin.catalog.field.provider')}
            <select
              value={form.provider}
              onChange={(e) =>
                setForm((f) => ({ ...f, provider: e.target.value as CatalogProvider }))
              }
              disabled={!canManage}
              data-testid="catalog-item-provider"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('endpointAdmin.catalog.field.packageId')}
            <input
              type="text"
              value={form.packageId}
              onChange={(e) => setForm((f) => ({ ...f, packageId: e.target.value }))}
              disabled={!canManage}
              required
              data-testid="catalog-item-packageId"
            />
          </label>
          <label>
            {t('endpointAdmin.catalog.field.displayName')}
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              disabled={!canManage}
              required
              data-testid="catalog-item-displayName"
            />
          </label>
          <label>
            {t('endpointAdmin.catalog.field.publisher')}
            <input
              type="text"
              value={form.publisher}
              onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
              disabled={!canManage}
              data-testid="catalog-item-publisher"
            />
          </label>
          <label>
            {t('endpointAdmin.catalog.field.riskTier')}
            <select
              value={form.riskTier}
              onChange={(e) =>
                setForm((f) => ({ ...f, riskTier: e.target.value as CatalogRiskTier }))
              }
              disabled={!canManage}
              data-testid="catalog-item-riskTier"
            >
              {RISK_TIERS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <DetectionRuleEditor
            value={form.detectionRule}
            onChange={(next) => setForm((f) => ({ ...f, detectionRule: next }))}
            disabled={!canManage}
          />
          {!canManage && (
            <p className="catalog-item-drawer__hint catalog-item-drawer__hint--warn">
              {t('endpointAdmin.catalog.permission.required')}
            </p>
          )}
          {submitError && (
            <p
              className="catalog-item-drawer__status catalog-item-drawer__status--error"
              data-testid="catalog-item-drawer-error"
            >
              {submitError}
            </p>
          )}
          <footer className="catalog-item-drawer__footer">
            <button type="button" onClick={onClose}>
              {t('endpointAdmin.catalog.drawer.cancel')}
            </button>
            <button type="submit" disabled={saveDisabled} data-testid="catalog-item-drawer-save">
              {isEdit
                ? t('endpointAdmin.catalog.drawer.save.edit')
                : t('endpointAdmin.catalog.drawer.save.new')}
            </button>
          </footer>
        </form>
      )}
    </aside>
  );
};

export default CatalogItemDrawer;
