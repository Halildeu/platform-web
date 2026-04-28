const ar: Record<string, string> = {
  'dataAccess.layout.title': 'صلاحيات الوصول للبيانات',
  'dataAccess.layout.description':
    'قم بتعيين صلاحيات الوصول للبيانات على مستوى الشركة والمشروع والمستودع والفرع.',

  'dataAccess.breadcrumb.management': 'الإدارة',
  'dataAccess.breadcrumb.access': 'الوصول',
  'dataAccess.breadcrumb.dataAccess': 'الوصول للبيانات',

  'dataAccess.tabs.companies': 'الشركات',
  'dataAccess.tabs.projects': 'المشاريع',
  'dataAccess.tabs.depots': 'المستودعات',
  'dataAccess.tabs.branches': 'الفروع',
  'dataAccess.tabs.assignments': 'التعيينات',

  'dataAccess.kind.company': 'شركة',
  'dataAccess.kind.project': 'مشروع',
  'dataAccess.kind.depot': 'مستودع',
  'dataAccess.kind.branch': 'فرع',

  'dataAccess.action.assign': 'تعيين',
  'dataAccess.action.revoke': 'إلغاء التعيين',
  'dataAccess.action.refresh': 'تحديث',

  'dataAccess.error.serviceUnavailable':
    'خدمة صلاحيات الوصول للبيانات غير متاحة حاليًا. يرجى الاتصال بمسؤول النظام.',
  'dataAccess.error.alreadyGranted': 'هذا النطاق ممنوح بالفعل لهذا المستخدم.',
  'dataAccess.error.invalidRef': 'مرجع التعيين غير صالح.',
  'dataAccess.error.unknown': 'حدث خطأ غير متوقع.',
  'dataAccess.confirm.revoke': 'هل أنت متأكد من رغبتك في إلغاء هذا التعيين؟',

  'dataAccess.assign.modalTitle': 'تعيين صلاحيات الوصول للبيانات',
  'dataAccess.assign.userIdLabel': 'معرف المستخدم (UUID)',
  'dataAccess.assign.userIdPlaceholder': 'مثال: 7e6e29ab-...',
  'dataAccess.assign.orgIdLabel': 'معرف المؤسسة',
  'dataAccess.assign.orgIdPlaceholder': 'مثال: 1',
  'dataAccess.assign.scopeRefLabel': 'المعرف المستهدف',
  'dataAccess.assign.scopeRefPlaceholder': 'مثال: 1001',
  'dataAccess.assign.scopeRefManualHint': 'القائمة فارغة - يمكن إدخال المعرف يدويا (قد لا يكون ETL البيانات الرئيسية قد عمل بعد).',
  'dataAccess.assign.kindLabel': 'نوع النطاق',
  'dataAccess.assign.cancel': 'إلغاء',
  'dataAccess.assign.submit': 'تعيين',
  'dataAccess.assign.success': 'تم إنشاء التعيين بنجاح.',
  'dataAccess.assign.invalidUserId': 'أدخل UUID صالحًا.',
  'dataAccess.assign.invalidOrgId': 'أدخل عددًا صحيحًا موجبًا.',
  'dataAccess.assign.invalidScopeRef': 'لا يمكن أن يكون المعرف المستهدف فارغًا.',

  'dataAccess.assignments.empty': 'لا توجد تعيينات لهذا المستخدم.',
  'dataAccess.assignments.column.scopeId': 'معرف التعيين',
  'dataAccess.assignments.column.userId': 'المستخدم',
  'dataAccess.assignments.column.orgId': 'المؤسسة',
  'dataAccess.assignments.column.kind': 'النطاق',
  'dataAccess.assignments.column.ref': 'المعرف المستهدف',
  'dataAccess.assignments.column.grantedAt': 'تاريخ التعيين',
  'dataAccess.assignments.column.active': 'نشط',
  'dataAccess.assignments.column.actions': 'الإجراءات',
  'dataAccess.assignments.filters.userIdLabel': 'معرف المستخدم (UUID)',
  'dataAccess.assignments.filters.orgIdLabel': 'معرف المؤسسة',
  'dataAccess.assignments.filters.apply': 'عرض',
  'dataAccess.assignments.revoke.success': 'تم إلغاء التعيين.',

  'dataAccess.tabs.companies.placeholderTitle': 'قائمة الشركات ستصل في PR-F',
  'dataAccess.tabs.projects.placeholderTitle': 'قائمة المشاريع ستصل في PR-F',
  'dataAccess.tabs.depots.placeholderTitle': 'قائمة المستودعات ستصل في PR-F',
  'dataAccess.tabs.branches.placeholderTitle': 'قائمة الفروع ستصل في PR-F',
  'dataAccess.tabs.placeholderDescription':
    'سيتم توفير قائمة الكيانات لهذه التبويبة في PR التالي. في الوقت الحالي، استخدم زر "تعيين" لإنشاء تعيين.',
  'dataAccess.tabs.depots.hierarchyNote':
    'المستودعات على 3 مستويات: المستودع → الموقع → الرف. كل مستوى يُمنح بشكل صريح؛ منح المستوى الأعلى لا يُولّد منح المستويات الأدنى تلقائيًا.',
};

export default ar;
