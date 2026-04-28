const ru: Record<string, string> = {
  'dataAccess.layout.title': 'Доступ к данным',
  'dataAccess.layout.description':
    'Назначайте пользователям права доступа к данным на уровне компании, проекта, склада и филиала.',

  'dataAccess.breadcrumb.management': 'Управление',
  'dataAccess.breadcrumb.access': 'Доступ',
  'dataAccess.breadcrumb.dataAccess': 'Доступ к данным',

  'dataAccess.tabs.companies': 'Компании',
  'dataAccess.tabs.projects': 'Проекты',
  'dataAccess.tabs.depots': 'Склады',
  'dataAccess.tabs.branches': 'Филиалы',
  'dataAccess.tabs.assignments': 'Назначения',

  'dataAccess.kind.company': 'Компания',
  'dataAccess.kind.project': 'Проект',
  'dataAccess.kind.depot': 'Склад',
  'dataAccess.kind.branch': 'Филиал',

  'dataAccess.action.assign': 'Назначить',
  'dataAccess.action.revoke': 'Отозвать',
  'dataAccess.action.refresh': 'Обновить',

  'dataAccess.error.serviceUnavailable':
    'Сервис доступа к данным сейчас недоступен. Обратитесь к системному администратору.',
  'dataAccess.error.alreadyGranted': 'Эта область уже назначена данному пользователю.',
  'dataAccess.error.invalidRef': 'Недопустимая ссылка для назначения.',
  'dataAccess.error.unknown': 'Произошла непредвиденная ошибка.',
  'dataAccess.confirm.revoke': 'Вы уверены, что хотите отменить это назначение?',

  'dataAccess.assign.modalTitle': 'Назначить доступ к данным',
  'dataAccess.assign.userIdLabel': 'UUID пользователя',
  'dataAccess.assign.userIdPlaceholder': 'напр. 7e6e29ab-...',
  'dataAccess.assign.orgIdLabel': 'ID организации',
  'dataAccess.assign.orgIdPlaceholder': 'напр. 1',
  'dataAccess.assign.scopeRefLabel': 'Целевой ID',
  'dataAccess.assign.scopeRefPlaceholder': 'напр. 1001',
  'dataAccess.assign.scopeRefManualHint': 'Список пуст — можно ввести ID вручную (master data ETL мог еще не запуститься).',
  'dataAccess.assign.kindLabel': 'Тип области',
  'dataAccess.assign.cancel': 'Отмена',
  'dataAccess.assign.submit': 'Назначить',
  'dataAccess.assign.success': 'Назначение успешно создано.',
  'dataAccess.assign.invalidUserId': 'Введите корректный UUID.',
  'dataAccess.assign.invalidOrgId': 'Введите положительное целое число.',
  'dataAccess.assign.invalidScopeRef': 'Целевой ID не может быть пустым.',

  'dataAccess.assignments.empty': 'Назначения для этого пользователя не найдены.',
  'dataAccess.assignments.column.scopeId': 'ID назначения',
  'dataAccess.assignments.column.userId': 'Пользователь',
  'dataAccess.assignments.column.orgId': 'Организация',
  'dataAccess.assignments.column.kind': 'Область',
  'dataAccess.assignments.column.ref': 'Целевой ID',
  'dataAccess.assignments.column.grantedAt': 'Дата назначения',
  'dataAccess.assignments.column.active': 'Активно',
  'dataAccess.assignments.column.actions': 'Действия',
  'dataAccess.assignments.filters.userIdLabel': 'UUID пользователя',
  'dataAccess.assignments.filters.orgIdLabel': 'ID организации',
  'dataAccess.assignments.filters.apply': 'Показать',
  'dataAccess.assignments.revoke.success': 'Назначение отозвано.',

  'dataAccess.tabs.companies.placeholderTitle': 'Список компаний появится в PR-F',
  'dataAccess.tabs.projects.placeholderTitle': 'Список проектов появится в PR-F',
  'dataAccess.tabs.depots.placeholderTitle': 'Список складов появится в PR-F',
  'dataAccess.tabs.branches.placeholderTitle': 'Список филиалов появится в PR-F',
  'dataAccess.tabs.placeholderDescription':
    'Список сущностей для этой вкладки будет предоставлен в следующем PR. Пока используйте кнопку «Назначить» для создания назначения.',
  'dataAccess.tabs.depots.hierarchyNote':
    'Склады трёхуровневые: Склад → Расположение → Полка. Каждый уровень назначается явно; назначение родителя не выдаёт автоматически назначения дочерним уровням.',
};

export default ru;
