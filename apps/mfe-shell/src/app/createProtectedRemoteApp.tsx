import React, { Suspense } from 'react';
import type { ComponentType, FC } from 'react';

import { createLazyRemoteModule } from './createLazyRemoteModule';
import { getSharedShellServices } from './config/shell-services-wiring';

type RemoteAppModule = { default: ComponentType };

/**
 * Shell-token köprülü remote mount — generic (39d-6; createMeetingApp'ten
 * genelleştirildi). SIRA SÖZLEŞMESİ: önce remote'un `shell-services` modülü
 * import edilip `configureShellServices(getSharedShellServices())` çağrılır,
 * SONRA App modülü import edilir — remote ilk isteğini atmadan Bearer/auth-ready
 * zinciri bağlanmış olur. Eksik/yanlış export sınıflandırılmış hataya dönüşür
 * (sessiz token'sız mount YOK — fail-closed).
 */
export function createProtectedRemoteApp(
  label: string,
  appLoader: () => Promise<RemoteAppModule>,
  shellServicesLoader: () => Promise<unknown>,
): FC {
  const RemoteLazy = createLazyRemoteModule(label, async () => {
    const shellServices = (await shellServicesLoader()) as {
      configureShellServices?: (services: unknown) => void;
    };
    if (typeof shellServices.configureShellServices !== 'function') {
      throw new Error(`${label}: remote shell-services configureShellServices export etmedi`);
    }
    shellServices.configureShellServices(getSharedShellServices());
    return appLoader();
  });

  const ProtectedRemoteApp: FC = () => (
    <Suspense fallback={null}>
      <RemoteLazy />
    </Suspense>
  );
  ProtectedRemoteApp.displayName = `${label}App`;
  return ProtectedRemoteApp;
}

export default createProtectedRemoteApp;
