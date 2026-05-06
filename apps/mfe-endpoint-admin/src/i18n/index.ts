/**
 * Minimal i18n shim for FE-000 skeleton. Once the dictionary lands in
 * `@mfe/i18n-dicts`, swap this for the shared resolver used by other
 * MFEs (mfe-users `useUsersI18n` pattern).
 */
const DICT = {
  tr: {
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
  },
  en: {
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
  },
} as const;

type Locale = keyof typeof DICT;

function resolveLocale(): Locale {
  if (typeof navigator === 'undefined') return 'tr';
  const lang = (navigator.language || 'tr').slice(0, 2).toLowerCase();
  return lang === 'en' ? 'en' : 'tr';
}

export function useEndpointAdminI18n() {
  const locale = resolveLocale();
  const dict = DICT[locale];
  return {
    t: (key: keyof typeof dict): string => dict[key] ?? key,
    locale,
  };
}
