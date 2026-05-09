const users = {
  'users.layout.title': 'User Management',
  'users.layout.description':
    'Manage user roles, permissions and module access; define account security-related operations.',
  'admin.users.title': 'User Management',
  'admin.users.description':
    'Manage user roles, permissions and module access; define account security-related operations.',
  'users.breadcrumb.management': 'Administration',
  'users.breadcrumb.users': 'User Management',

  'users.actions.refresh': 'Refresh users',

  // Grid toolbar
  'users.grid.themeLabel': 'Theme',
  'users.grid.quickFilterLabel': 'Filter',
  'users.grid.variantLabel': 'Variant',
  'users.grid.quickFilterPlaceholder': 'Search all columns...',
  'users.grid.fullscreenTooltip': 'Open fullscreen in a new tab',

  'users.grid.mode.label': 'Data mode:',
  'users.grid.mode.server': 'Server',
  'users.grid.mode.client': 'Client',

  // Filter panel
  'users.filters.search.label': 'Search',
  'users.filters.search.placeholder': 'Name, email or ID',
  'users.filters.search.button': 'Search',

  'users.filters.status.label': 'Status',
  'users.filters.status.all': 'All',
  'users.filters.status.active': 'Active',
  'users.filters.status.inactive': 'Inactive',
  'users.filters.status.invited': 'Invited',
  'users.filters.status.suspended': 'Suspended',

  'users.filters.role.label': 'Role',
  'users.filters.role.all': 'All',
  'users.filters.role.user': 'Standard User',
  'users.filters.role.admin': 'Admin',

  'users.filters.moduleKey.label': 'Module key',
  'users.filters.moduleKey.placeholder': 'finance.users',

  'users.filters.moduleLevel.label': 'Module level',
  'users.filters.moduleLevel.all': 'All',
  'users.filters.moduleLevel.none': 'No access',
  'users.filters.moduleLevel.view': 'Viewer',
  'users.filters.moduleLevel.edit': 'Editor',
  'users.filters.moduleLevel.manage': 'Owner',

  'users.filters.apply': 'Apply',
  'users.filters.reset': 'Reset',

  // Grid columns
  'users.grid.columns.fullName': 'Full name',
  'users.grid.columns.email': 'Email',
  'users.grid.columns.role': 'Role',
  'users.grid.columns.status': 'Status',
  'users.grid.columns.sessionTimeoutMinutes': 'Session duration (min)',
  'users.grid.columns.modulePermissions': 'Module permissions',
  'users.grid.columns.lastLoginAt': 'Last login',
  'users.grid.columns.actions': 'Actions',

  // Toolbar actions (export/reset)
  'users.grid.toolbar.resetFilters': 'Reset filters',
  'users.grid.toolbar.excelVisible': 'Excel (Visible)',
  'users.grid.toolbar.excelAll': 'Excel (All)',
  'users.grid.toolbar.csvVisible': 'CSV (Visible)',
  'users.grid.toolbar.csvAll': 'CSV (All)',

  // AG Grid side panel / advanced filter
  'users.grid.locale.groupPanel': 'Drag columns here to group',
  'users.grid.locale.valuePanel': 'Drag columns here to aggregate values',
  'users.grid.locale.filters': 'Filters',
  'users.grid.locale.columns': 'Columns',
  'users.grid.locale.advancedFilter': 'Advanced filter',
  'users.grid.locale.advancedFilterBuilder': 'Advanced filter',
  'users.grid.locale.advancedFilterButtonTooltip': 'Open advanced filter',
  'users.grid.locale.advancedFilterBuilderAdd': 'Add condition',
  'users.grid.locale.advancedFilterBuilderRemove': 'Remove',
  'users.grid.locale.advancedFilterJoinOperator': 'Join operator',
  'users.grid.locale.advancedFilterAnd': 'AND',
  'users.grid.locale.advancedFilterOr': 'OR',
  'users.grid.locale.advancedFilterValidationMissingColumn': 'Select column',
  'users.grid.locale.advancedFilterValidationMissingOption': 'Select operator',
  'users.grid.locale.advancedFilterValidationMissingValue': 'Enter value',
  'users.grid.locale.advancedFilterApply': 'Apply',

  // Actions menu (grid row)
  'users.actions.menuLabel': 'Actions ▾',
  'users.actions.view': 'View details',
  'users.actions.editRole': 'Edit role / permissions',
  'users.actions.resetPassword': 'Reset password',
  'users.actions.toggleStatus.disable': 'Deactivate',
  'users.actions.toggleStatus.enable': 'Activate',
  'users.actions.resetPassword.success': 'Password reset link has been sent.',
  'users.actions.status.success': 'User status has been updated.',
  'users.notifications.activation.description': 'Audit ID: {auditId}',
  // iter-33 super-admin grant/revoke
  'users.actions.superAdmin.grant': 'Make Super Admin',
  'users.actions.superAdmin.revoke': 'Revoke Super Admin',
  'users.actions.superAdmin.grant.success': 'User is now a super admin.',
  'users.actions.superAdmin.grant.alreadySuccess': 'User was already a super admin (no-op).',
  'users.actions.superAdmin.revoke.success': 'Super admin privilege revoked.',
  'users.actions.superAdmin.revoke.alreadySuccess': 'User was not a super admin (no-op).',
  'users.actions.superAdmin.bootstrapWarning':
    'This account is in the bootstrap admin list — privilege will be re-asserted at next pod restart.',

  // Detail drawer – titles & sections
  'users.detail.title': 'User Details',
  'users.detail.section.profile': 'Profile information',
  'users.detail.section.permissions': 'Module permissions',
  'users.detail.section.quickActions': 'Quick actions',

  // Detail drawer – session timeout
  'users.detail.sessionTimeout.unit': 'minutes',
  'users.detail.sessionTimeout.saving': 'Saving...',
  'users.detail.sessionTimeout.save': 'Save',
  'users.detail.sessionTimeout.minWarning': 'Session duration must be at least 1 minute.',
  'users.detail.sessionTimeout.noChange': 'Session duration is already set to this value.',
  'users.detail.sessionTimeout.updated': 'Session duration has been updated.',
  'users.detail.sessionTimeout.updateFailed': 'Failed to update session duration.',

  // Detail drawer – role & status
  'users.detail.roleUpdated': 'User role has been updated.',

  // Detail drawer – module permissions
  'users.detail.noModulePermissions': 'No module permissions are defined.',
  'users.detail.noPermissionDetails': 'No permission details available',
  'users.detail.scopeMissingHint':
    'Permissions cannot be edited because no company/period scope is selected.',
  'users.detail.noAccessWarning':
    'The user has no access to this module and cannot see related reports.',
  'users.detail.userManagementScopeHint':
    'User Management permissions must be granted with a selected company/period.',
  'users.detail.modulePermission.noActive': 'There is no active permission for this module.',
  'users.detail.modulePermission.removed': 'Permission for {module} has been removed.',
  'users.detail.modulePermission.updated': 'Permission for {module} has been updated.',
  'users.detail.modulePermission.updating': 'Updating permission...',

  // Detail drawer – module level descriptions
  'users.detail.moduleLevelDescription.none': 'No access to this module',
  'users.detail.moduleLevelDescription.view': 'View-only access',
  'users.detail.moduleLevelDescription.edit': 'Edit access',
  'users.detail.moduleLevelDescription.manage': 'Full administrative access',

  // Detail drawer – quick actions
  'users.detail.quickActions.noteSoon': 'Add note (coming soon)',

  // Phase 2: Multi-role + tabbed scope
  'users.detail.section.roles': 'Roles',
  'users.detail.section.roles.description':
    'Assign multiple roles to the user. Permissions are the union of all assigned roles.',
  // iter-37 — neutral subtitle
  'users.detail.section.roles.subtitle':
    'Assign multiple roles. Permissions are derived from the union of selected roles.',
  'users.detail.section.scopes': 'Data Access',
  'users.detail.section.scopes.description':
    'Without scope assignment, the user cannot see any data.',
  'users.detail.section.scopes.subtitle': 'The data this user is allowed to see.',
  // iter-37 — role list search
  'users.detail.roles.searchPlaceholder': 'Search role name or description...',
  'users.detail.roles.searchEmpty': 'No role matches "{query}".',
  // iter-39 — section count badge
  'users.detail.roles.count': '{selected} assigned / {total} total',
  'users.detail.scopes.companies': 'Companies',
  'users.detail.scopes.projects': 'Projects',
  'users.detail.scopes.warehouses': 'Warehouses',
  'users.detail.scopes.branches': 'Branches',
  'users.detail.scopes.selectAll': 'Select All',
  'users.detail.scopes.searchPlaceholder': 'Search by name or code...',
  'users.detail.scopes.searchEmpty': 'No results matching "{query}".',
  // 2026-05-04 Session 37 UX (revised) — multi-select Combobox (chip + dropdown)
  // primitive replaces the assigned-only-toggle pattern; the prior keys
  // (assignedOnly/assignedEmpty/countBadge/showMore) are removed since the
  // single Combobox handles all of those concerns natively.
  //
  // 2026-05-04 Session 37 third pass — large-list lazy options (29k+ projects):
  // placeholderLarge/largeListHint/minQueryHint guide admins to type instead
  // of waiting for the dropdown to render thousands of rows. Small lists keep
  // the original `placeholder` copy.
  'users.detail.scopes.placeholder': 'Click or search to grant access...',
  'users.detail.scopes.placeholderLarge': '{total} items — start typing to search...',
  'users.detail.scopes.largeListHint': '{total} items in the list. Start typing to add.',
  'users.detail.scopes.minQueryHint': 'Type at least {min} characters...',
  'users.detail.scopes.noOptions': 'No results.',
  'users.detail.scopes.tagRemoveLabel': 'Remove access',
  'users.detail.save': 'Save',
  'users.detail.save.scope': 'Save roles and data access',
  'users.detail.saving': 'Saving...',
  'users.detail.cancel': 'Cancel',
  // iter-36 P0 Save Safety
  'users.detail.dirtyHint': 'Unsaved changes.',
  'users.detail.dirtyCloseConfirm': 'You have unsaved changes. Close anyway?',
  'users.detail.loadError.title': "Couldn't load current assignments",
  'users.detail.loadError.body':
    "This user's roles and data access could not be fetched. Retry before saving — otherwise existing access may be wiped.",
  'users.detail.loadError.retry': 'Retry',
  'users.detail.noRolesDefined': 'No roles defined yet.',
  'users.detail.noRolesWarning': 'At least one role must be selected.',
  'users.detail.loadingRoles': 'Loading...',
  'users.detail.assignmentSaved': 'Role and access assignments saved.',
  // PR-FE-8 (2026-05-09): user-detail drawer auto-save UX strings
  // (parallel of role drawer's UX consistency directive).
  'users.detail.autosave.saving': 'Saving...',
  'users.detail.autosave.saved': 'All changes saved',
  'users.detail.autosave.error': 'Save failed, reverted to last saved state.',
  'users.detail.autosave.hint': 'All changes are saved automatically.',
  'users.detail.autosave.retry': 'Retry',
  'users.detail.assignmentError': 'Role and access assignments could not be saved.',
  'users.detail.readOnly': 'You do not have permission to edit this user.',
  // PR-FE-11 (2026-05-09): scope picker layout split + chip-area UX.
  'users.detail.scopes.chipsHeader': '{count} selected',
  'users.detail.scopes.chipsEmpty': 'No access yet in this scope. Search above to add.',
  'users.detail.scopes.clearAll': 'Remove all',
  'users.detail.scopes.clearAllConfirm':
    'You are about to remove access to {count} item(s). The user will no longer see data in this scope. Continue?',
  'users.detail.section.scopes.subtitleWithTotals':
    '{total} total permissions — {companies} companies, {projects} projects, {warehouses} warehouses, {branches} branches.',
  // PR-FE-12 (2026-05-09): hierarchical scope picker view.
  'users.detail.scopes.viewToggle.label': 'Data access view',
  'users.detail.scopes.viewToggle.flat': 'Flat list',
  'users.detail.scopes.viewToggle.hierarchy': 'Hierarchical',
  'users.detail.scopes.hier.empty':
    'No assigned companies or child scopes to display in the hierarchical view. Switch to Flat list to add some.',
  'users.detail.scopes.hier.noChildren': 'No child scopes assigned',
  'users.detail.scopes.hier.childCount': '{count} child scope(s)',
  'users.detail.scopes.hier.subheader.projects': 'Projects ({count})',
  'users.detail.scopes.hier.subheader.branches': 'Branches ({count})',
  'users.detail.scopes.hier.subheader.warehouses': 'Warehouses ({count})',
  'users.detail.scopes.hier.orphan.header': 'Orphan scopes ({count}) — parent company not assigned',
  'users.detail.scopes.hier.orphan.help':
    'These child scopes have no assigned parent company. For consistency, either add the parent company or remove these entries.',
  // PR-FE-12 absorb iter-2 (Codex thread 019e0df3 #1).
  'users.detail.scopes.hier.unknown.header': 'Companies not found in master data ({count})',
  'users.detail.scopes.hier.unknown.help':
    'These companies are assigned but could not be fetched from master data (transient failure, soft-delete, or different tenant). Listed below to keep the assignment visible; remove if intentional.',
  'users.detail.scopes.hier.unknown.placeholder': 'Unknown company #{id}',
  'users.grid.columns.roles': 'Roles',
};

export default users;
