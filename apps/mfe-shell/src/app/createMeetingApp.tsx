import React, { Suspense } from 'react';
import type { ComponentType, FC } from 'react';

import { createLazyRemoteModule } from './createLazyRemoteModule';
import { getSharedShellServices } from './config/shell-services-wiring';

type MeetingAppModule = { default: ComponentType };

/** Configure the protected remote before it can issue its first request. */
export function createMeetingApp(
  appLoader: () => Promise<MeetingAppModule>,
  shellServicesLoader: () => Promise<unknown>,
): FC {
  const MeetingLazy = createLazyRemoteModule('Meeting', async () => {
    const shellServices = (await shellServicesLoader()) as {
      configureShellServices?: (services: unknown) => void;
    };
    if (typeof shellServices.configureShellServices !== 'function') {
      throw new Error('mfe_meeting/shell-services configureShellServices export etmedi');
    }
    shellServices.configureShellServices(getSharedShellServices());
    return appLoader();
  });

  const MeetingApp: FC = () => (
    <Suspense fallback={null}>
      <MeetingLazy />
    </Suspense>
  );
  MeetingApp.displayName = 'MeetingApp';
  return MeetingApp;
}

export default createMeetingApp;
