 
/**
 * PR-FE-12 (2026-05-09): Hierarchical Scope Picker.
 *
 * UserDetailDrawer "Veri Erişimi" panelinin ikinci görünümü. Mevcut
 * 4-tab düz liste (PR-FE-11) korundu; bu component admin'in ekstra
 * bir context görmesini sağlayan toggle-able bir alternatif sağlar.
 *
 * Kazanım: "Kim neye erişiyor?" sorusunu tab geçişi yapmadan tek
 * bakışta yanıtlamak. Mevcut düz liste bu bağlantıyı gizliyor —
 * "Mikrolink Bilişim'in altında hangi projeler var?" sorusuna cevap
 * verebilmek için admin Şirketler tab → not down → Projeler tab →
 * eşleştirme yapmak zorunda.
 *
 * Hierarchy (workcube_mikrolink, PR-BE-15 backend FK exposure):
 *
 *   OUR_COMPANY (top — picker scope_kind=company)
 *   ├── PRO_PROJECTS (parentCompanyId via COMPANY.OUR_COMPANY_ID JOIN)
 *   ├── BRANCH (parentCompanyId via COMPANY.OUR_COMPANY_ID JOIN)
 *   └── DEPARTMENT/WAREHOUSE (parentCompanyId direct + parentBranchId)
 *
 * Sub-rendering rules:
 *   - Selected company groups display assigned children inline (under
 *     "Atanmış {kind}" sub-headers).
 *   - Orphan section: assigned children whose parentCompanyId is NOT
 *     in the assigned-companies set OR whose parent FK is null.
 *   - Per-node × removes that single assignment (auto-save POST).
 *   - "Tümünü kaldır" affordance lives on each company node.
 *
 * Auto-save invariants preserved (see UserDetailDrawer):
 *   - state observer triggers POST 500ms after any setSelected*Ids call
 *   - empty roleIds gate, ownership guard, scope serialization unchanged
 *
 * Out of scope for PR-FE-12 (follow-ups):
 *   - Inline "+ Alt yetki ekle" contextual dropdown (workcube
 *     children search filtered to a parent's tree)
 *   - Drag-drop reassignment
 *   - Cross-tenant orphan reconciliation
 */

import * as React from 'react';

export interface ScopeEntity {
  id: number;
  code?: string | null;
  name: string;
  parentCompanyId?: number | null;
  parentBranchId?: number | null;
  parentProjectId?: number | null;
}

export interface HierarchicalScopePickerProps {
  companies: ScopeEntity[];
  projects: ScopeEntity[];
  warehouses: ScopeEntity[];
  branches: ScopeEntity[];
  selectedCompanyIds: number[];
  selectedProjectIds: number[];
  selectedWarehouseIds: number[];
  selectedBranchIds: number[];
  setSelectedCompanyIds: React.Dispatch<React.SetStateAction<number[]>>;
  setSelectedProjectIds: React.Dispatch<React.SetStateAction<number[]>>;
  setSelectedWarehouseIds: React.Dispatch<React.SetStateAction<number[]>>;
  setSelectedBranchIds: React.Dispatch<React.SetStateAction<number[]>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  canEdit: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const formatChipLabel = (item: ScopeEntity): string => {
  const code = item.code?.toLocaleUpperCase('tr-TR');
  return code ? `[${code}] ${item.name}` : item.name;
};

interface NodeProps {
  item: ScopeEntity;
  kind: 'project' | 'branch' | 'warehouse';
  onRemove: (id: number) => void;
  canEdit: boolean;
  t: HierarchicalScopePickerProps['t'];
}

const ChildNode: React.FC<NodeProps> = ({ item, kind, onRemove, canEdit, t }) => {
  const code = item.code?.toLocaleUpperCase('tr-TR');
  return (
    <li
      className="flex items-center justify-between gap-2 py-1 pl-6 text-sm"
      data-testid={`hier-${kind}-${item.id}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-text-subtle">└─</span>
        {code ? (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-subtle">
            {code}
          </span>
        ) : null}
        <span className="truncate text-text-primary">{item.name}</span>
      </span>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="ml-2 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-subtle hover:bg-state-danger-bg hover:text-state-danger-text"
          aria-label={`${t('users.detail.scopes.tagRemoveLabel')}: ${formatChipLabel(item)}`}
          title={`${t('users.detail.scopes.tagRemoveLabel')}: ${formatChipLabel(item)}`}
          data-testid={`hier-${kind}-remove-${item.id}`}
        >
          ×
        </button>
      ) : null}
    </li>
  );
};

const HierarchicalScopePicker: React.FC<HierarchicalScopePickerProps> = ({
  companies,
  projects,
  warehouses,
  branches,
  selectedCompanyIds,
  selectedProjectIds,
  selectedWarehouseIds,
  selectedBranchIds,
  setSelectedCompanyIds,
  setSelectedProjectIds,
  setSelectedWarehouseIds,
  setSelectedBranchIds,
  setDirty,
  canEdit,
  t,
}) => {
  // Index assigned children by parent company id for O(1) lookup
  // during the company-by-company render below. Keeps the render
  // function pure and avoids quadratic filters on each company row.
  const assignedProjectsByCompany = React.useMemo(() => {
    const idx = new Map<number, ScopeEntity[]>();
    for (const p of projects) {
      if (!selectedProjectIds.includes(p.id)) continue;
      const key = p.parentCompanyId ?? -1; // -1 sentinel → orphan bucket
      const list = idx.get(key) ?? [];
      list.push(p);
      idx.set(key, list);
    }
    return idx;
  }, [projects, selectedProjectIds]);

  const assignedBranchesByCompany = React.useMemo(() => {
    const idx = new Map<number, ScopeEntity[]>();
    for (const b of branches) {
      if (!selectedBranchIds.includes(b.id)) continue;
      const key = b.parentCompanyId ?? -1;
      const list = idx.get(key) ?? [];
      list.push(b);
      idx.set(key, list);
    }
    return idx;
  }, [branches, selectedBranchIds]);

  const assignedWarehousesByCompany = React.useMemo(() => {
    const idx = new Map<number, ScopeEntity[]>();
    for (const w of warehouses) {
      if (!selectedWarehouseIds.includes(w.id)) continue;
      const key = w.parentCompanyId ?? -1;
      const list = idx.get(key) ?? [];
      list.push(w);
      idx.set(key, list);
    }
    return idx;
  }, [warehouses, selectedWarehouseIds]);

  // Selected companies in master-data order so the rendered tree is stable
  // across re-renders (no jumps when an unrelated array re-references).
  const selectedCompanies = React.useMemo(
    () => companies.filter((c) => selectedCompanyIds.includes(c.id)),
    [companies, selectedCompanyIds],
  );

  const selectedCompanyIdSet = React.useMemo(
    () => new Set(selectedCompanyIds),
    [selectedCompanyIds],
  );

  // Orphan children — assigned but their parent company is either NOT
  // in the assigned set or null. These rows are still respected by the
  // backend (auto-save persists them), but the admin should see them
  // in a separate bucket so the inconsistency is visible. Common cause:
  // legacy assignment, soft-deleted parent, or admin assigned a depot
  // without realizing its parent company.
  const orphanProjects = React.useMemo(
    () =>
      projects.filter(
        (p) =>
          selectedProjectIds.includes(p.id) &&
          (p.parentCompanyId == null || !selectedCompanyIdSet.has(p.parentCompanyId)),
      ),
    [projects, selectedProjectIds, selectedCompanyIdSet],
  );
  const orphanBranches = React.useMemo(
    () =>
      branches.filter(
        (b) =>
          selectedBranchIds.includes(b.id) &&
          (b.parentCompanyId == null || !selectedCompanyIdSet.has(b.parentCompanyId)),
      ),
    [branches, selectedBranchIds, selectedCompanyIdSet],
  );
  const orphanWarehouses = React.useMemo(
    () =>
      warehouses.filter(
        (w) =>
          selectedWarehouseIds.includes(w.id) &&
          (w.parentCompanyId == null || !selectedCompanyIdSet.has(w.parentCompanyId)),
      ),
    [warehouses, selectedWarehouseIds, selectedCompanyIdSet],
  );
  const orphanCount = orphanProjects.length + orphanBranches.length + orphanWarehouses.length;

  // Per-kind remove + per-company remove (cascade-aware for the
  // company itself: removing a company DOES NOT auto-remove its
  // projects/branches/warehouses — that would be a destructive
  // implicit action. The orphan-bucket pattern catches the result.)
  const handleRemoveCompany = (id: number) => {
    if (!canEdit) return;
    setSelectedCompanyIds((prev) => prev.filter((x) => x !== id));
    setDirty(true);
  };
  const handleRemoveProject = (id: number) => {
    if (!canEdit) return;
    setSelectedProjectIds((prev) => prev.filter((x) => x !== id));
    setDirty(true);
  };
  const handleRemoveBranch = (id: number) => {
    if (!canEdit) return;
    setSelectedBranchIds((prev) => prev.filter((x) => x !== id));
    setDirty(true);
  };
  const handleRemoveWarehouse = (id: number) => {
    if (!canEdit) return;
    setSelectedWarehouseIds((prev) => prev.filter((x) => x !== id));
    setDirty(true);
  };

  if (selectedCompanies.length === 0 && orphanCount === 0) {
    return (
      <p className="mt-2 text-xs italic text-text-subtle" data-testid="hier-empty">
        {t('users.detail.scopes.hier.empty')}
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3" data-testid="hier-scope-tree">
      {selectedCompanies.map((company) => {
        const childProjects = assignedProjectsByCompany.get(company.id) ?? [];
        const childBranches = assignedBranchesByCompany.get(company.id) ?? [];
        const childWarehouses = assignedWarehousesByCompany.get(company.id) ?? [];
        const totalChildren = childProjects.length + childBranches.length + childWarehouses.length;
        const code = company.code?.toLocaleUpperCase('tr-TR');
        return (
          <div
            key={company.id}
            className="rounded-2xl border border-border-subtle bg-surface-muted/30 p-3"
            data-testid={`hier-company-${company.id}`}
          >
            {/* Company header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">📁</span>
                {code ? (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-subtle">
                    {code}
                  </span>
                ) : null}
                <span className="text-sm font-semibold text-text-primary">{company.name}</span>
                <span className="text-xs text-text-subtle">
                  {totalChildren > 0
                    ? t('users.detail.scopes.hier.childCount', { count: totalChildren })
                    : t('users.detail.scopes.hier.noChildren')}
                </span>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => handleRemoveCompany(company.id)}
                  className="ml-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-subtle hover:bg-state-danger-bg hover:text-state-danger-text"
                  aria-label={`${t('users.detail.scopes.tagRemoveLabel')}: ${formatChipLabel(company)}`}
                  title={`${t('users.detail.scopes.tagRemoveLabel')}: ${formatChipLabel(company)}`}
                  data-testid={`hier-company-remove-${company.id}`}
                >
                  ×
                </button>
              ) : null}
            </div>

            {/* Children sub-tree */}
            {totalChildren === 0 ? null : (
              <ul className="mt-2" role="list">
                {childProjects.length > 0 ? (
                  <>
                    <li className="pl-4 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                      {t('users.detail.scopes.hier.subheader.projects', {
                        count: childProjects.length,
                      })}
                    </li>
                    {childProjects.map((p) => (
                      <ChildNode
                        key={p.id}
                        item={p}
                        kind="project"
                        onRemove={handleRemoveProject}
                        canEdit={canEdit}
                        t={t}
                      />
                    ))}
                  </>
                ) : null}
                {childBranches.length > 0 ? (
                  <>
                    <li className="mt-2 pl-4 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                      {t('users.detail.scopes.hier.subheader.branches', {
                        count: childBranches.length,
                      })}
                    </li>
                    {childBranches.map((b) => (
                      <ChildNode
                        key={b.id}
                        item={b}
                        kind="branch"
                        onRemove={handleRemoveBranch}
                        canEdit={canEdit}
                        t={t}
                      />
                    ))}
                  </>
                ) : null}
                {childWarehouses.length > 0 ? (
                  <>
                    <li className="mt-2 pl-4 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                      {t('users.detail.scopes.hier.subheader.warehouses', {
                        count: childWarehouses.length,
                      })}
                    </li>
                    {childWarehouses.map((w) => (
                      <ChildNode
                        key={w.id}
                        item={w}
                        kind="warehouse"
                        onRemove={handleRemoveWarehouse}
                        canEdit={canEdit}
                        t={t}
                      />
                    ))}
                  </>
                ) : null}
              </ul>
            )}
          </div>
        );
      })}

      {/* Orphan bucket */}
      {orphanCount > 0 ? (
        <div
          className="rounded-2xl border border-state-warning-border bg-state-warning-bg/30 p-3"
          data-testid="hier-orphan-section"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-state-warning-text">
            ⚠️{' '}
            {t('users.detail.scopes.hier.orphan.header', {
              count: orphanCount,
            })}
          </p>
          <p className="mb-2 text-xs text-text-secondary">
            {t('users.detail.scopes.hier.orphan.help')}
          </p>
          <ul role="list">
            {orphanProjects.length > 0 ? (
              <>
                <li className="pl-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {t('users.detail.scopes.hier.subheader.projects', {
                    count: orphanProjects.length,
                  })}
                </li>
                {orphanProjects.map((p) => (
                  <ChildNode
                    key={p.id}
                    item={p}
                    kind="project"
                    onRemove={handleRemoveProject}
                    canEdit={canEdit}
                    t={t}
                  />
                ))}
              </>
            ) : null}
            {orphanBranches.length > 0 ? (
              <>
                <li className="mt-2 pl-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {t('users.detail.scopes.hier.subheader.branches', {
                    count: orphanBranches.length,
                  })}
                </li>
                {orphanBranches.map((b) => (
                  <ChildNode
                    key={b.id}
                    item={b}
                    kind="branch"
                    onRemove={handleRemoveBranch}
                    canEdit={canEdit}
                    t={t}
                  />
                ))}
              </>
            ) : null}
            {orphanWarehouses.length > 0 ? (
              <>
                <li className="mt-2 pl-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {t('users.detail.scopes.hier.subheader.warehouses', {
                    count: orphanWarehouses.length,
                  })}
                </li>
                {orphanWarehouses.map((w) => (
                  <ChildNode
                    key={w.id}
                    item={w}
                    kind="warehouse"
                    onRemove={handleRemoveWarehouse}
                    canEdit={canEdit}
                    t={t}
                  />
                ))}
              </>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default HierarchicalScopePicker;
