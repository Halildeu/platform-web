declare module 'mfe_ethic/EthicApp' {
  import { ComponentType } from 'react';
  const EthicApp: ComponentType;
  export default EthicApp;
}

declare module 'mfe_ethic/shell-services' {
  export function configureShellServices(services: unknown): void;
}
