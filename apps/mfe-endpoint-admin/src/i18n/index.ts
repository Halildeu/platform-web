/**
 * Minimal i18n shim. Once the dictionary lands in `@mfe/i18n-dicts`,
 * swap this for the shared resolver used by other MFEs (mfe-users
 * `useUsersI18n` pattern).
 *
 * `t()` accepts any string for forward-compat with future keys; missing
 * keys fall through to the literal so a brand-new placeholder still
 * renders without crashing the page.
 */
const DICT_TR = {
  'endpointAdmin.title': 'Uç Birim Yönetimi',
  'endpointAdmin.status.heading': 'Servis Durumu',
  'endpointAdmin.status.loading': 'Durum yükleniyor...',
  'endpointAdmin.status.error': 'Durum bilgisi alınamadı.',
  'endpointAdmin.status.field.service': 'Servis',
  'endpointAdmin.status.field.status': 'Durum',
  'endpointAdmin.status.field.apiVersion': 'API Sürümü',
  'endpointAdmin.status.field.deviceCredentialProvider': 'Cihaz Kimlik Sağlayıcı',
  'endpointAdmin.status.field.timestamp': 'Ölçüm Zamanı',
  'endpointAdmin.forbidden.title': 'Erişim Yok',
  'endpointAdmin.forbidden.description':
    'Bu modülü görüntüleme yetkiniz yok. Erişim için sistem yöneticinize başvurun.',
  'endpointAdmin.devices.heading': 'Uç Birimler',
  'endpointAdmin.devices.loading': 'Cihazlar yükleniyor…',
  'endpointAdmin.devices.error': 'Cihaz listesi alınamadı.',
  'endpointAdmin.devices.forbidden': 'Cihaz listesini görüntüleme yetkiniz yok.',
  'endpointAdmin.devices.empty': 'Henüz kayıtlı cihaz yok.',
  'endpointAdmin.devices.countLabel': 'Toplam',
  'endpointAdmin.devices.col.hostname': 'Hostname',
  'endpointAdmin.devices.col.os': 'İşletim Sistemi',
  'endpointAdmin.devices.col.agentVersion': 'Ajan Sürümü',
  'endpointAdmin.devices.col.status': 'Durum',
  'endpointAdmin.devices.col.lastSeenAt': 'Son Görülme',
  'endpointAdmin.devices.status.PENDING_ENROLLMENT': 'Kayıt bekliyor',
  'endpointAdmin.devices.status.ONLINE': 'Çevrim içi',
  'endpointAdmin.devices.status.STALE': 'Bekleme',
  'endpointAdmin.devices.status.OFFLINE': 'Çevrim dışı',
  'endpointAdmin.devices.status.DECOMMISSIONED': 'Hizmet dışı',
  'endpointAdmin.audit.heading': 'Denetim Olayları',
  'endpointAdmin.audit.subtitle': 'Son 50 olay',
  'endpointAdmin.audit.refreshing': 'Yenileniyor…',
  'endpointAdmin.audit.loading': 'Denetim olayları yükleniyor…',
  'endpointAdmin.audit.error': 'Denetim olayları alınamadı.',
  'endpointAdmin.audit.forbidden': 'Denetim olaylarını görüntüleme yetkiniz yok.',
  'endpointAdmin.audit.empty': 'Bu filtreyle eşleşen denetim olayı yok.',
  'endpointAdmin.audit.filter.deviceId': 'Cihaz ID (UUID)',
  'endpointAdmin.audit.filter.eventType': 'Olay türü',
  'endpointAdmin.audit.col.occurredAt': 'Zaman',
  'endpointAdmin.audit.col.eventType': 'Olay',
  'endpointAdmin.audit.col.action': 'İşlem',
  'endpointAdmin.audit.col.deviceId': 'Cihaz',
  'endpointAdmin.audit.col.commandId': 'Komut',
  'endpointAdmin.audit.col.subject': 'İşlemi Yapan',
} as const;

const DICT_EN: Record<keyof typeof DICT_TR, string> = {
  'endpointAdmin.title': 'Endpoint Administration',
  'endpointAdmin.status.heading': 'Service Status',
  'endpointAdmin.status.loading': 'Loading status…',
  'endpointAdmin.status.error': 'Failed to load status.',
  'endpointAdmin.status.field.service': 'Service',
  'endpointAdmin.status.field.status': 'Status',
  'endpointAdmin.status.field.apiVersion': 'API Version',
  'endpointAdmin.status.field.deviceCredentialProvider': 'Device Credential Provider',
  'endpointAdmin.status.field.timestamp': 'Measured At',
  'endpointAdmin.forbidden.title': 'Access Denied',
  'endpointAdmin.forbidden.description':
    'You do not have permission to view this module. Contact your administrator.',
  'endpointAdmin.devices.heading': 'Endpoint Devices',
  'endpointAdmin.devices.loading': 'Loading devices…',
  'endpointAdmin.devices.error': 'Failed to load device list.',
  'endpointAdmin.devices.forbidden': 'You do not have permission to view devices.',
  'endpointAdmin.devices.empty': 'No devices enrolled yet.',
  'endpointAdmin.devices.countLabel': 'Total',
  'endpointAdmin.devices.col.hostname': 'Hostname',
  'endpointAdmin.devices.col.os': 'Operating System',
  'endpointAdmin.devices.col.agentVersion': 'Agent Version',
  'endpointAdmin.devices.col.status': 'Status',
  'endpointAdmin.devices.col.lastSeenAt': 'Last Seen',
  'endpointAdmin.devices.status.PENDING_ENROLLMENT': 'Pending enrollment',
  'endpointAdmin.devices.status.ONLINE': 'Online',
  'endpointAdmin.devices.status.STALE': 'Stale',
  'endpointAdmin.devices.status.OFFLINE': 'Offline',
  'endpointAdmin.devices.status.DECOMMISSIONED': 'Decommissioned',
  'endpointAdmin.audit.heading': 'Audit Events',
  'endpointAdmin.audit.subtitle': 'Last 50 events',
  'endpointAdmin.audit.refreshing': 'Refreshing…',
  'endpointAdmin.audit.loading': 'Loading audit events…',
  'endpointAdmin.audit.error': 'Failed to load audit events.',
  'endpointAdmin.audit.forbidden': 'You do not have permission to view audit events.',
  'endpointAdmin.audit.empty': 'No audit events match this filter.',
  'endpointAdmin.audit.filter.deviceId': 'Device ID (UUID)',
  'endpointAdmin.audit.filter.eventType': 'Event type',
  'endpointAdmin.audit.col.occurredAt': 'Time',
  'endpointAdmin.audit.col.eventType': 'Event',
  'endpointAdmin.audit.col.action': 'Action',
  'endpointAdmin.audit.col.deviceId': 'Device',
  'endpointAdmin.audit.col.commandId': 'Command',
  'endpointAdmin.audit.col.subject': 'Subject',
};

function resolveLocale(): 'tr' | 'en' {
  if (typeof navigator === 'undefined') return 'tr';
  const lang = (navigator.language || 'tr').slice(0, 2).toLowerCase();
  return lang === 'en' ? 'en' : 'tr';
}

export function useEndpointAdminI18n() {
  const locale = resolveLocale();
  const dict = locale === 'en' ? DICT_EN : DICT_TR;
  return {
    /**
     * Forward-compatible: `key` accepts any string so that placeholder
     * keys for future tier scopes don't break the build. Missing keys
     * fall through to the literal value (visible during development).
     */
    t: (key: string): string => (dict as Record<string, string>)[key] ?? key,
    locale,
  };
}
