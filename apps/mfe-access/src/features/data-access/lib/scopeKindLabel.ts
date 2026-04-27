import type { ScopeKind } from '../../../entities/data-access-scope';

export const SCOPE_KIND_I18N_KEY: Record<ScopeKind, string> = {
  COMPANY: 'dataAccess.kind.company',
  PROJECT: 'dataAccess.kind.project',
  DEPOT: 'dataAccess.kind.depot',
  BRANCH: 'dataAccess.kind.branch',
};

export const ALL_SCOPE_KINDS: readonly ScopeKind[] = [
  'COMPANY',
  'PROJECT',
  'DEPOT',
  'BRANCH',
] as const;
