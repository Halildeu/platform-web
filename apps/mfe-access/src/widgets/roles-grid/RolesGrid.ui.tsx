import React from 'react';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import {
  useResponsiveColumnDefs,
  useViewportWidth,
  type ColumnMeta,
} from '@mfe/design-system/advanced/data-grid';
import { Badge, Button } from '@mfe/design-system';
import type {
  AccessRole,
  AccessLevel as _AccessLevel,
} from '../../features/access-management/model/access.types';

const EntityGridTemplate = React.lazy(() =>
  import('@mfe/design-system').then((m) => ({ default: m.EntityGridTemplate })),
);

interface RolesGridProps {
  roles: AccessRole[];
  modules: Map<string, string>;
  onSelectRole: (role: AccessRole) => void;
  onCreateRole: () => void;
  onDeleteRole: (roleId: string) => Promise<void>;
  onCloneRole: (role: AccessRole) => Promise<void>;
  t: (key: string, params?: Record<string, unknown>) => string;
  formatNumber: (value: number) => string;
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
}

const GRID_ID = 'mfe-access/roles-v2';
const GRID_SCHEMA_VERSION = 1;

/*
 * PR #237 propagation — RolesGrid mobile column visibility.
 *
 *   - essential (always): name (role identity is the minimum
 *                         actionable column on any viewport)
 *   - md+ (>=768):        memberCount (role-size signal,
 *                         secondary triage)
 *
 * `policies` (Module summary), `lastModifiedAt`, and the inline
 * roleActions menu live in `customColumnDefs` inside the component
 * because they depend on `t`, `formatDate`, `onCloneRole`,
 * `onDeleteRole` runtime props; their viewport gating is applied in
 * the same render so the toolbar + filter builder + variant
 * integration share a single column source per render.
 *
 * Module-level so the responsive test suite can introspect tags
 * without rendering the full grid (parallel to `auditColumnMeta`
 * landed in mfe-audit PR #292).
 */
export const ROLES_COLUMN_META: ColumnMeta[] = [
  {
    field: 'name',
    headerNameKey: 'access.grid.columns.name',
    columnType: 'bold-text',
    minWidth: 200,
    essential: true,
  },
  {
    field: 'memberCount',
    headerNameKey: 'access.grid.columns.memberCount',
    columnType: 'number',
    width: 130,
    responsive: { hideBelow: 'md' },
  },
];

const LEVEL_BADGE_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'muted'> = {
  MANAGE: 'error',
  VIEW: 'info',
  NONE: 'muted',
};

const showToast = (type: 'success' | 'error', text: string) => {
  try {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, text } }));
  } catch {
    console[type === 'error' ? 'error' : 'log'](text);
  }
};

const RolesGrid: React.FC<RolesGridProps> = ({
  roles,
  modules: _modules,
  onSelectRole,
  onCreateRole,
  onDeleteRole,
  onCloneRole,
  t,
  formatNumber: _formatNumber,
  formatDate,
}) => {
  const gridApiRef = React.useRef<GridApi<AccessRole> | null>(null);

  const columnMeta = ROLES_COLUMN_META;

  /*
   * PR #237 propagation — viewport buckets for `customColumnDefs`.
   *
   * `useResponsiveColumnDefs` only consults `ColumnMeta.responsive`
   * for declarative columns; bespoke columns (cellRenderer-driven
   * badge stack, action menu) need to read the same viewport
   * bucket directly. We flag each entry below with a `_hideBelow`
   * pixel threshold matching the Tailwind sm/md/lg/xl scale, then
   * filter inside the same memo so a single React render covers
   * both column tiers atomically.
   *
   *   - policies (badges):     hideBelow md (>=768)
   *   - lastModifiedAt:        hideBelow lg (>=1024)
   *   - roleActions:           always (essential — pinned right,
   *                            users need clone/delete on mobile too)
   */
  const viewportWidth = useViewportWidth({ breakpointsOnly: true });

  const customColumnDefs = React.useMemo<ColDef<AccessRole>[]>(() => {
    type CustomColDef = ColDef<AccessRole> & { _hideBelow?: number };
    const all: CustomColDef[] = [
      {
        headerName: t('access.grid.columns.moduleSummary'),
        field: 'policies',
        minWidth: 280,
        filter: false,
        sortable: false,
        _hideBelow: 768, // md
        cellRenderer: ({ data }: { data: AccessRole }) => {
          if (!data?.policies?.length) {
            return (
              <span className="text-sm text-text-subtle">{t('access.filter.level.none')}</span>
            );
          }
          return (
            <div className="flex flex-wrap gap-1.5 py-1">
              {data.policies.map((policy) => (
                <Badge
                  key={policy.moduleKey}
                  variant={LEVEL_BADGE_VARIANT[policy.level] ?? 'muted'}
                  size="sm"
                >
                  {policy.moduleLabel ?? policy.moduleKey}:{' '}
                  {t(`access.filter.level.${policy.level.toLowerCase()}`)}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        headerName: t('access.grid.columns.lastModified'),
        field: 'lastModifiedAt',
        width: 200,
        _hideBelow: 1024, // lg
        valueGetter: ({ data }) => {
          if (!data) return '';
          const ts = formatDate(new Date(data.lastModifiedAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
          return `${data.lastModifiedBy} · ${ts}`;
        },
      },
      {
        // Codex 019dde93 iter-48 — action column opt-out from
        // drawer-open dblclick (DS guard recognizes this colId).
        colId: 'roleActions',
        headerName: '',
        field: 'id',
        width: 100,
        sortable: false,
        filter: false,
        pinned: 'right',
        suppressDrawerOpenOnDoubleClick: true,
        cellRenderer: ({ data }: { data: AccessRole }) => {
          if (!data) return null;
          return <RowActions role={data} onClone={onCloneRole} onDelete={onDeleteRole} t={t} />;
        },
      },
    ];

    return all
      .filter((c) => c._hideBelow === undefined || viewportWidth >= c._hideBelow)
      .map(({ _hideBelow: _drop, ...rest }) => rest);
  }, [formatDate, onCloneRole, onDeleteRole, t, viewportWidth]);

  const localeCode = 'tr-TR';

  /*
   * PR #237 propagation — viewport-aware metaDefs. The hook
   * subscribes to `useViewportWidth({ breakpointsOnly: true })`
   * internally; when the viewport crosses a bucket boundary the
   * memo refreshes and AG Grid receives the new column set.
   */
  const metaDefs = useResponsiveColumnDefs<AccessRole>({
    columns: columnMeta,
    t,
    locale: localeCode,
  }) as ColDef<AccessRole>[];

  const columnDefs = React.useMemo<ColDef<AccessRole>[]>(
    () => [...metaDefs, ...customColumnDefs],
    [metaDefs, customColumnDefs],
  );

  const gridOptions = React.useMemo(
    () => ({
      // Codex 019dde93 iter-48b — symmetric with UsersGrid.
      // `cellSelection: true` suppresses ag-grid v34 dblclick events
      // because the flag dedicates dblclick to cell-range extension.
      // RoleDrawer is opened via row-dblclick contract; cell-range
      // selection is not a feature here.
      multiSortKey: 'ctrl' as const,
    }),
    [],
  );

  const toolbarExtra = React.useMemo(
    () => (
      <Button onClick={onCreateRole} size="sm">
        {t('access.actions.create')}
      </Button>
    ),
    [onCreateRole, t],
  );

  return (
    <React.Suspense fallback={<div style={{ height: 400 }} />}>
      <EntityGridTemplate<AccessRole>
        gridId={GRID_ID}
        gridSchemaVersion={GRID_SCHEMA_VERSION}
        columnDefs={columnDefs}
        gridOptions={gridOptions}
        dataSourceMode="client"
        rowData={roles}
        total={roles.length}
        onRowDoubleClick={onSelectRole}
        onGridReady={(event: GridReadyEvent<AccessRole>) => {
          gridApiRef.current = event.api;
        }}
        themeLabel={t('access.grid.themeLabel')}
        quickFilterLabel={t('access.grid.quickFilterLabel')}
        quickFilterPlaceholder={t('access.filter.searchPlaceholder')}
        toolbarExtras={toolbarExtra}
      />
    </React.Suspense>
  );
};

// Inline row actions — three-dot menu
const RowActions: React.FC<{
  role: AccessRole;
  onClone: (role: AccessRole) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
  t: (key: string) => string;
}> = ({ role, onClone, onDelete, t }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-text-subtle hover:bg-surface-muted hover:text-text-primary"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-border-subtle bg-surface-default p-1 shadow-lg">
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-muted"
            onClick={async () => {
              setOpen(false);
              try {
                await onClone(role);
                showToast('success', t('access.notifications.cloneSuccess.title'));
              } catch {
                showToast('error', t('access.notifications.cloneError'));
              }
            }}
          >
            {t('access.actions.clone')}
          </button>
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-state-danger-text hover:bg-surface-muted disabled:opacity-50"
            disabled={role.isSystemRole}
            onClick={async () => {
              setOpen(false);
              if (!confirm(t('access.delete.message', { roleName: role.name }))) return;
              try {
                await onDelete(role.id);
                showToast('success', t('access.notifications.deleteSuccess'));
              } catch {
                showToast('error', t('access.notifications.deleteError'));
              }
            }}
          >
            {t('access.actions.delete')}
          </button>
        </div>
      )}
    </div>
  );
};

export default RolesGrid;
