import { api, registerAuthTokenResolver, logExpected } from '@mfe/shared-http';
import type { ApiInstance } from '@mfe/shared-http';

/**
 * Etik Speak'in kabuk içindeki token sözleşmesi.
 *
 * Bu modül bugüne dek yoktu ve gerekmiyordu: `mfe-ethic` yalnız kendi hücresinde
 * (`etik-speak-manager`) mount ediliyor, token'ı hücrenin `standalone-http`'si
 * kaydediyordu. Ürün kabuğun içine alınınca (platform-web #1083) remote kendi
 * `@mfe/shared-http` örneğiyle yalnız kaldı: kabuk kendi örneğine çözücü
 * kaydeder, remote'unkine ulaşmaz — istek `Authorization` başlıksız çıkar ve
 * ethics-service 401 döner. Sahibin ekranında görülen tam olarak buydu:
 * yetki zinciri eksiksiz, token sözleşmeli, ama istek token'sız.
 *
 * Sözleşme diğer remote'ların (access/audit/users/reporting/endpoint-admin)
 * kullandığının aynısı: kabuk `configureShellServices(sharedServices)` ile
 * canlı token getter'ını enjekte eder, remote onu KENDİ shared-http örneğine
 * kaydeder. Standalone hücrede bu modül hiç çağrılmaz; oradaki kayıt kendi
 * yolundan devam eder.
 */
export type RemoteShellServices = {
  http: ApiInstance;
  auth: {
    getToken: () => string | null;
    getUser: () => unknown;
  };
};

const fallbackServices: RemoteShellServices = {
  http: api,
  auth: {
    // Kabuk yokken token da yoktur; `null` fail-closed'dur — istek yetkisiz
    // gider ve sunucu reddeder. Sessizce eski bir token uydurmak, ihbar
    // vakalarını okuyan bir üründe yanlış yöne düşmektir.
    getToken: () => null,
    getUser: () => null,
  },
};

let currentServices: RemoteShellServices | null = null;

export const configureShellServices = (services: Partial<RemoteShellServices>): void => {
  currentServices = {
    http: services.http ?? fallbackServices.http,
    auth: services.auth ?? fallbackServices.auth,
  };
  // Getter BY REFERENCE okunur: kabuk token'ı yenilediğinde (sessiz SSO,
  // refresh) burada tutulan kopya bayatlamaz.
  registerAuthTokenResolver(() => currentServices?.auth.getToken() ?? null);
};

export const getShellServices = (): RemoteShellServices => {
  if (!currentServices) {
    logExpected('ethicShellServices.getShellServices', undefined, {
      reason: 'standalone-cell-noop',
    });
    return fallbackServices;
  }
  return currentServices;
};
