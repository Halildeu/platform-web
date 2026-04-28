const tr: Record<string, string> = {
  'dataAccess.layout.title': 'Veri Erişimi',
  'dataAccess.layout.description':
    'Kullanıcılara şirket, proje, depo ve şube bazında veri erişimi atayın.',

  'dataAccess.breadcrumb.management': 'Yönetim',
  'dataAccess.breadcrumb.access': 'Erişim',
  'dataAccess.breadcrumb.dataAccess': 'Veri Erişimi',

  'dataAccess.tabs.companies': 'Şirketler',
  'dataAccess.tabs.projects': 'Projeler',
  'dataAccess.tabs.depots': 'Depolar',
  'dataAccess.tabs.branches': 'Şubeler',
  'dataAccess.tabs.assignments': 'Atamalar',

  'dataAccess.kind.company': 'Şirket',
  'dataAccess.kind.project': 'Proje',
  'dataAccess.kind.depot': 'Depo',
  'dataAccess.kind.branch': 'Şube',

  'dataAccess.action.assign': 'Atama Yap',
  'dataAccess.action.revoke': 'Geri Al',
  'dataAccess.action.refresh': 'Yenile',

  'dataAccess.error.serviceUnavailable':
    'Veri Erişimi servisi şu an aktif değil. Lütfen sistem yöneticinize başvurun.',
  'dataAccess.error.alreadyGranted': 'Bu kullanıcıya bu scope zaten atanmış.',
  'dataAccess.error.invalidRef': 'Atama referansı geçersiz.',
  'dataAccess.error.unknown': 'Beklenmeyen bir hata oluştu.',
  'dataAccess.confirm.revoke': 'Bu atamayı geri almak istediğinize emin misiniz?',

  'dataAccess.assign.modalTitle': 'Veri Erişimi Atama',
  'dataAccess.assign.userIdLabel': 'Kullanıcı UUID',
  'dataAccess.assign.userIdPlaceholder': 'örn. 7e6e29ab-...',
  'dataAccess.assign.orgIdLabel': 'Organizasyon ID',
  'dataAccess.assign.orgIdPlaceholder': 'örn. 1',
  'dataAccess.assign.scopeRefLabel': 'Hedef ID',
  'dataAccess.assign.scopeRefPlaceholder': 'örn. 1001',
  'dataAccess.assign.scopeRefManualHint': 'Liste boş — manuel ID girilebilir (master data ETL henüz koşmamış olabilir).',
  'dataAccess.assign.kindLabel': 'Kapsam Türü',
  'dataAccess.assign.cancel': 'İptal',
  'dataAccess.assign.submit': 'Atama Yap',
  'dataAccess.assign.success': 'Atama başarıyla oluşturuldu.',
  'dataAccess.assign.invalidUserId': 'Geçerli bir UUID giriniz.',
  'dataAccess.assign.invalidOrgId': 'Pozitif bir tam sayı giriniz.',
  'dataAccess.assign.invalidScopeRef': 'Hedef ID boş olamaz.',

  'dataAccess.assignments.empty': 'Bu kullanıcıya atanmış erişim bulunamadı.',
  'dataAccess.assignments.column.scopeId': 'Atama ID',
  'dataAccess.assignments.column.userId': 'Kullanıcı',
  'dataAccess.assignments.column.orgId': 'Organizasyon',
  'dataAccess.assignments.column.kind': 'Kapsam',
  'dataAccess.assignments.column.ref': 'Hedef ID',
  'dataAccess.assignments.column.grantedAt': 'Atama Tarihi',
  'dataAccess.assignments.column.active': 'Aktif',
  'dataAccess.assignments.column.actions': 'İşlemler',
  'dataAccess.assignments.filters.userIdLabel': 'Kullanıcı UUID',
  'dataAccess.assignments.filters.orgIdLabel': 'Organizasyon ID',
  'dataAccess.assignments.filters.apply': 'Listele',
  'dataAccess.assignments.revoke.success': 'Atama geri alındı.',

  'dataAccess.tabs.companies.placeholderTitle': 'Şirket listesi PR-F ile gelecek',
  'dataAccess.tabs.projects.placeholderTitle': 'Proje listesi PR-F ile gelecek',
  'dataAccess.tabs.depots.placeholderTitle': 'Depo listesi PR-F ile gelecek',
  'dataAccess.tabs.branches.placeholderTitle': 'Şube listesi PR-F ile gelecek',
  'dataAccess.tabs.placeholderDescription':
    'Bu sekmedeki entity listesi sonraki PR ile sağlanacak. Şimdilik atama oluşturmak için "Atama Yap" düğmesini kullanın.',
  'dataAccess.tabs.depots.hierarchyNote':
    'Depo (3 seviye): Depo → Lokasyon → Raf — her biri ayrı ayrı atanır, üst seviye atama otomatik alt seviye üretmez.',
};

export default tr;
