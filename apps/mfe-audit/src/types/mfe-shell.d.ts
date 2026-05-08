// Top-level `import type` would convert this file from an ambient
// declaration into a module — at which point `declare module
// 'mfe_shell/services'` becomes a regular export instead of a global
// augmentation, and consumer files that try to import from
// `'mfe_shell/services'` see TS2307. Inline the `import()` type
// reference inside the module body so this file stays ambient.

declare module 'mfe_shell/services' {
  type ApiInstance = import('@mfe/shared-http').ApiInstance;
  export type ShellNotificationType = 'success' | 'info' | 'warning' | 'error' | 'loading';

  export type ShellNotificationEntry = {
    id?: string;
    message: string;
    description?: string;
    type?: ShellNotificationType;
    createdAt?: number;
    meta?: Record<string, unknown>;
  };

  export type ShellTelemetryEvent = {
    type: string;
    payload?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    timestamp?: number;
  };

  export interface ShellNotificationService {
    push(entry: ShellNotificationEntry): void;
  }

  export interface ShellTelemetryService {
    emit(event: ShellTelemetryEvent): void;
  }

  export interface ShellServices {
    notify: ShellNotificationService;
    telemetry: ShellTelemetryService;
    http: ApiInstance;
    auth: {
      getToken: () => string | null;
      getUser: () => unknown;
    };
  }

  export function getShellServices(): ShellServices;
}
