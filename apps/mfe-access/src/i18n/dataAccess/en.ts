const en: Record<string, string> = {
  'dataAccess.layout.title': 'Data Access',
  'dataAccess.layout.description':
    'Assign per-company, project, depot, and branch data access to users.',

  'dataAccess.breadcrumb.management': 'Management',
  'dataAccess.breadcrumb.access': 'Access',
  'dataAccess.breadcrumb.dataAccess': 'Data Access',

  'dataAccess.tabs.companies': 'Companies',
  'dataAccess.tabs.projects': 'Projects',
  'dataAccess.tabs.depots': 'Depots',
  'dataAccess.tabs.branches': 'Branches',
  'dataAccess.tabs.assignments': 'Assignments',

  'dataAccess.kind.company': 'Company',
  'dataAccess.kind.project': 'Project',
  'dataAccess.kind.depot': 'Depot',
  'dataAccess.kind.branch': 'Branch',

  'dataAccess.action.assign': 'Assign',
  'dataAccess.action.revoke': 'Revoke',
  'dataAccess.action.refresh': 'Refresh',

  'dataAccess.error.serviceUnavailable':
    'The Data Access service is currently unavailable. Please contact your system administrator.',
  'dataAccess.error.alreadyGranted': 'This scope is already granted to the user.',
  'dataAccess.error.invalidRef': 'The scope reference is invalid.',
  'dataAccess.error.unknown': 'An unexpected error occurred.',
  'dataAccess.confirm.revoke': 'Are you sure you want to revoke this assignment?',

  'dataAccess.assign.modalTitle': 'Assign Data Access',
  'dataAccess.assign.userIdLabel': 'User UUID',
  'dataAccess.assign.userIdPlaceholder': 'e.g. 7e6e29ab-...',
  'dataAccess.assign.orgIdLabel': 'Organization ID',
  'dataAccess.assign.orgIdPlaceholder': 'e.g. 1',
  'dataAccess.assign.scopeRefLabel': 'Target ID',
  'dataAccess.assign.scopeRefPlaceholder': 'e.g. 1001',
  'dataAccess.assign.scopeRefSearchPlaceholder': 'Search by name, code or ID...',
  'dataAccess.assign.scopeRefEmptySearch': 'No results match the search.',
  'dataAccess.assign.scopeRefInactive': '(inactive)',
  'dataAccess.assign.scopeRefManualHint':
    'List is empty — manual ID entry allowed (master data ETL may not have run yet).',
  'dataAccess.assign.kindLabel': 'Scope Kind',
  'dataAccess.assign.cancel': 'Cancel',
  'dataAccess.assign.submit': 'Assign',
  'dataAccess.assign.success': 'Assignment created successfully.',
  'dataAccess.assign.invalidUserId': 'Enter a valid UUID.',
  'dataAccess.assign.invalidOrgId': 'Enter a positive integer.',
  'dataAccess.assign.invalidScopeRef': 'Target ID cannot be empty.',

  'dataAccess.assignments.empty': 'No assignments found for this user.',
  'dataAccess.assignments.column.scopeId': 'Assignment ID',
  'dataAccess.assignments.column.userId': 'User',
  'dataAccess.assignments.column.orgId': 'Organization',
  'dataAccess.assignments.column.kind': 'Scope',
  'dataAccess.assignments.column.ref': 'Target ID',
  'dataAccess.assignments.column.grantedAt': 'Granted At',
  'dataAccess.assignments.column.active': 'Active',
  'dataAccess.assignments.column.actions': 'Actions',
  'dataAccess.assignments.filters.userIdLabel': 'User UUID',
  'dataAccess.assignments.filters.orgIdLabel': 'Organization ID',
  'dataAccess.assignments.filters.apply': 'List',
  'dataAccess.assignments.revoke.success': 'Assignment revoked.',

  'dataAccess.tabs.companies.placeholderTitle': 'Company list will arrive in PR-F',
  'dataAccess.tabs.projects.placeholderTitle': 'Project list will arrive in PR-F',
  'dataAccess.tabs.depots.placeholderTitle': 'Depot list will arrive in PR-F',
  'dataAccess.tabs.branches.placeholderTitle': 'Branch list will arrive in PR-F',
  'dataAccess.tabs.placeholderDescription':
    'The entity list for this tab will be provided in the next PR. For now, use the "Assign" button to create an assignment.',
  'dataAccess.tabs.depots.hierarchyNote':
    'Depots are 3-level: Depot → Location → Shelf. Each level is granted explicitly; a parent grant does NOT auto-issue child grants.',
};

export default en;
