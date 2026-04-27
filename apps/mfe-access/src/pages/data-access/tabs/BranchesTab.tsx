import React from 'react';
import { Button } from '@mfe/design-system';
import type { ScopeKind } from '../../../entities/data-access-scope';

export interface BranchesTabProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  onAssign: (kind: ScopeKind) => void;
}

const BranchesTab: React.FC<BranchesTabProps> = ({ t, onAssign }) => (
  <div className="space-y-4 p-4" data-testid="data-access-tab-branches">
    <h3 className="text-base font-medium">{t('dataAccess.tabs.branches.placeholderTitle')}</h3>
    <p className="text-sm text-text-secondary">{t('dataAccess.tabs.placeholderDescription')}</p>
    <Button
      variant="primary"
      onClick={() => onAssign('BRANCH')}
      data-testid="data-access-assign-branch"
    >
      {t('dataAccess.action.assign')}
    </Button>
  </div>
);

export default BranchesTab;
