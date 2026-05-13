/**
 * Feature Flags + Kill Switches
 * Runtime-configurable flags for safe rollout and emergency shutoff
 */

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  killSwitch?: boolean; // true = can be disabled in production without deploy
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'x-data-grid',
    enabled: true,
    description: 'Enterprise data grid recipes',
    killSwitch: true,
  },
  {
    key: 'x-charts-dashboard',
    enabled: true,
    description: 'Chart dashboard widgets',
    killSwitch: true,
  },
  { key: 'x-scheduler', enabled: true, description: 'Scheduler views', killSwitch: true },
  { key: 'x-kanban', enabled: true, description: 'Kanban board', killSwitch: true },
  { key: 'x-editor-tiptap', enabled: true, description: 'Tiptap editor engine', killSwitch: true },
  { key: 'x-form-builder', enabled: true, description: 'Schema-driven forms', killSwitch: true },
  {
    key: 'design-lab-runtime-preview',
    enabled: true,
    description: 'Runtime preview in Design Lab',
    killSwitch: true,
  },
  {
    key: 'sentry-tracing',
    enabled: true,
    description: 'Sentry performance tracing',
    killSwitch: true,
  },
  { key: 'rum-web-vitals', enabled: true, description: 'Real User Monitoring', killSwitch: true },
  // PERF-INIT-V2 PR-B5b3-prep (state-probe flag for MFE on-demand bootstrap
  // wave).  Default OFF — current eager remote bootstrap is unchanged.  This
  // flag is read at BUILD TIME by `vite.config.ts` to compile-time switch
  // B5b1's eager vs on-demand `lazy-routes.ts` branch; once a build has been
  // made with the flag on, the eager branch is fully DCE'd and CANNOT be
  // re-enabled by toggling this flag at runtime.  `killSwitch: false` here
  // reflects that build-time-only semantic — observability/debug consumers
  // may read the flag's state at runtime, but cannot use it to roll back
  // B5b1 selection without a rebuild.  See
  // apps/mfe-shell/src/app/config/mfe-bootstrap-flag.ts for the env reader.
  {
    key: 'mfe-on-demand-bootstrap',
    enabled: false,
    description:
      'BUILD-TIME flag: defer mfe_suggestions remote bootstrap until route navigation (PR-B5b1). Full rollback requires rebuild with the flag off; runtime toggling does not affect B5b1 selection after deploy.',
    killSwitch: false,
  },
];

const flags: Map<string, FeatureFlag> = new Map(DEFAULT_FLAGS.map((f) => [f.key, f]));

export function isEnabled(key: string): boolean {
  const flag = flags.get(key);
  return flag?.enabled ?? false;
}

export function getFlags(): FeatureFlag[] {
  return Array.from(flags.values());
}

export function setFlag(key: string, enabled: boolean): void {
  const flag = flags.get(key);
  if (flag) {
    flags.set(key, { ...flag, enabled });
  }
}

export function initFeatureFlags(overrides?: Record<string, boolean>): void {
  if (overrides) {
    for (const [key, enabled] of Object.entries(overrides)) {
      setFlag(key, enabled);
    }
  }

  // Load from localStorage for development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    try {
      const stored = localStorage.getItem('feature-flags');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [key, enabled] of Object.entries(parsed)) {
          setFlag(key, enabled as boolean);
        }
      }
    } catch {
      /* ignore */
    }
  }
}
