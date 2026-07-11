import type { ComponentType, FC } from 'react';

import { createProtectedRemoteApp } from './createProtectedRemoteApp';

type MeetingAppModule = { default: ComponentType };

/**
 * Configure the protected remote before it can issue its first request.
 * 39d-6: davranış-koruyucu delegasyon — generic `createProtectedRemoteApp`
 * aynı sıra sözleşmesini uygular (önce shell-services configure, sonra App);
 * label 'Meeting' ve hata mesajı sınıfı değişmedi.
 */
export function createMeetingApp(
  appLoader: () => Promise<MeetingAppModule>,
  shellServicesLoader: () => Promise<unknown>,
): FC {
  return createProtectedRemoteApp('Meeting', appLoader, shellServicesLoader);
}

export default createMeetingApp;
