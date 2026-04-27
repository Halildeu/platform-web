import type { AccessPageManifest } from './roles-page.manifest';

export const accessDataAccessPageManifest: AccessPageManifest = {
  pageId: 'access.dataAccess',
  layout: {
    title: 'dataAccess.layout.title',
    description: 'dataAccess.layout.description',
    breadcrumbItems: [
      { title: 'dataAccess.breadcrumb.management' },
      { title: 'dataAccess.breadcrumb.access' },
      { title: 'dataAccess.breadcrumb.dataAccess' },
    ],
  },
  actions: [
    {
      key: 'assign-scope',
      label: 'dataAccess.action.assign',
      intent: 'primary',
    },
    {
      key: 'revoke-scope',
      label: 'dataAccess.action.revoke',
      intent: 'default',
      requiresSelection: 'single',
    },
  ],
  grid: {
    columns: [
      {
        key: 'scopeId',
        headerName: 'dataAccess.assignments.column.scopeId',
        field: 'id',
        width: 120,
      },
      {
        key: 'userId',
        headerName: 'dataAccess.assignments.column.userId',
        field: 'userId',
        flex: 1.4,
      },
      {
        key: 'orgId',
        headerName: 'dataAccess.assignments.column.orgId',
        field: 'orgId',
        width: 140,
      },
      {
        key: 'scopeKind',
        headerName: 'dataAccess.assignments.column.kind',
        field: 'scopeKind',
        width: 140,
      },
      {
        key: 'scopeRef',
        headerName: 'dataAccess.assignments.column.ref',
        field: 'scopeRef',
        flex: 1.0,
      },
      {
        key: 'grantedAt',
        headerName: 'dataAccess.assignments.column.grantedAt',
        field: 'grantedAt',
        flex: 1.0,
      },
      {
        key: 'active',
        headerName: 'dataAccess.assignments.column.active',
        field: 'active',
        width: 110,
      },
    ],
  },
};

export default accessDataAccessPageManifest;
