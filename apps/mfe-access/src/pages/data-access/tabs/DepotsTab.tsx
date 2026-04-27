import React from 'react';
import { Button } from '@mfe/design-system';
import type { ScopeKind } from '../../../entities/data-access-scope';

export interface DepotsTabProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  onAssign: (kind: ScopeKind) => void;
}

const DepotsTab: React.FC<DepotsTabProps> = ({ t, onAssign }) => (
  <div className="space-y-4 p-4" data-testid="data-access-tab-depots">
    <h3 className="text-base font-medium">{t('dataAccess.tabs.depots.placeholderTitle')}</h3>
    <p className="text-sm text-text-secondary">{t('dataAccess.tabs.placeholderDescription')}</p>
    <p
      className="rounded-md border border-border-subtle bg-surface-muted p-3 text-xs text-text-secondary"
      data-testid="data-access-tab-depots-hierarchy-note"
    >
      {t('dataAccess.tabs.depots.hierarchyNote')}
    </p>
    <Button
      variant="primary"
      onClick={() => onAssign('DEPOT')}
      data-testid="data-access-assign-depot"
    >
      {t('dataAccess.action.assign')}
    </Button>
  </div>
);

export default DepotsTab;
