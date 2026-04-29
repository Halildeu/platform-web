import React from 'react';
import {
  PageLayout,
  createPageLayoutBreadcrumbItems,
  createPageLayoutPreset,
  HoverDescription,
} from '@mfe/design-system';
import type { AccessRole } from '../../features/access-management/model/access.types';
import { useAccessRoles } from '../../features/access-management/model/use-access-roles.model';
import RolesGrid from '../../widgets/roles-grid/RolesGrid.ui';
import RoleDrawer from '../../widgets/role-drawer/RoleDrawer.ui';
import { useAccessI18n } from '../../i18n/useAccessI18n';
import { pushToast } from '../../shared/notifications';

const RolesPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = React.useState<AccessRole | null>(null);
  const [drawerMode, setDrawerMode] = React.useState<'view' | 'create'>('view');
  const { t, ready, formatNumber, formatDate } = useAccessI18n();

  const defaultFilters = React.useMemo(
    () => ({
      search: '',
      moduleKey: 'ALL',
      level: 'ALL' as const,
    }),
    [],
  );

  const {
    roles,
    modules,
    total: _total, // unused — pagination total reserved for future grid footer
    cloneRole,
    createRoleMutation,
    deleteRoleMutation,
    roleCloneMutation: _roleCloneMutation, // unused — clone exposed via cloneRole helper above
    updateRolePermissionsMutation,
  } = useAccessRoles(defaultFilters);

  const breadcrumbs = createPageLayoutBreadcrumbItems([
    { title: t('access.breadcrumb.management') },
    { title: t('access.breadcrumb.access') },
    { title: t('access.breadcrumb.roles') },
  ]);

  const pageLayoutPreset = React.useMemo(
    () => createPageLayoutPreset({ preset: 'content-only', pageWidth: 'full' }),
    [],
  );

  const handleSelectRole = React.useCallback((role: AccessRole) => {
    setDrawerMode('view');
    setSelectedRole(role);
  }, []);

  const handleCreateRole = React.useCallback(() => {
    setDrawerMode('create');
    setSelectedRole(null);
  }, []);

  const handleCloseDrawer = React.useCallback(() => {
    setSelectedRole(null);
    setDrawerMode('view');
  }, []);

  if (!ready) return null;

  const pageTitle = t('access.layout.title');
  const pageDescription = t('access.layout.description');

  return (
    <>
      <PageLayout
        {...pageLayoutPreset}
        title={<HoverDescription description={pageDescription}>{pageTitle}</HoverDescription>}
        description={undefined}
        classes={{
          header: '!px-6 !rounded-2xl !border !border-border-subtle shadow-sm !overflow-visible',
        }}
        breadcrumbItems={breadcrumbs}
        contentClassName="!px-0 !py-4"
      >
        <div
          className="overflow-hidden !rounded-2xl border border-border-subtle bg-surface-default shadow-sm"
          data-testid="access-roles-page"
        >
          <RolesGrid
            roles={roles}
            modules={modules}
            onSelectRole={handleSelectRole}
            onCreateRole={handleCreateRole}
            onDeleteRole={async (roleId) => {
              await deleteRoleMutation.mutateAsync(roleId);
              pushToast('success', t('access.notifications.deleteSuccess'));
            }}
            onCloneRole={async (role) => {
              await cloneRole({
                sourceRoleId: role.id,
                name: `${role.name} (Kopya)`,
              });
              pushToast('success', t('access.notifications.cloneSuccess.title'));
            }}
            t={t}
            formatNumber={formatNumber}
            formatDate={formatDate}
          />
        </div>
      </PageLayout>

      {/*
        Codex 019dd9d6 iter-20 (lifecycle remount fix): RoleDrawer is always
        rendered by this parent (open prop only toggles internal visibility),
        so the drawer's useState lazy initializer would only fire on the FIRST
        page mount when role=null — never on subsequent role selections. That
        defeated iter-19's race fix because Effect A reset and Effect B parse
        could still interleave on cached catalog/granules responses.
        Force remount via key whenever the selected role changes (or the drawer
        is in create mode). This makes useState lazy init re-run with the
        actual role.policies on every drawer open, eliminating the parent-side
        race vector.
      */}
      <RoleDrawer
        key={drawerMode === 'create' ? 'create' : (selectedRole?.id ?? 'closed')}
        open={Boolean(selectedRole) || drawerMode === 'create'}
        mode={drawerMode}
        role={selectedRole}
        onClose={handleCloseDrawer}
        onSavePermissions={async (roleId, permissionIds) => {
          await updateRolePermissionsMutation.mutateAsync({ id: roleId, permissionIds });
        }}
        onCreateRole={async (values) => {
          const created = await createRoleMutation.mutateAsync(values);
          pushToast('success', t('access.notifications.createSuccess'));
          setSelectedRole(created);
          setDrawerMode('view');
        }}
        savingPermissions={updateRolePermissionsMutation.isPending}
        creatingRole={createRoleMutation.isPending}
        t={t}
        formatNumber={formatNumber}
        formatDate={formatDate}
      />
    </>
  );
};

export default RolesPage;
