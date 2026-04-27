import React from 'react';
import { Button } from '@mfe/design-system';
import type { ScopeKind } from '../../../entities/data-access-scope';

export interface CompaniesTabProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  onAssign: (kind: ScopeKind) => void;
}

const CompaniesTab: React.FC<CompaniesTabProps> = ({ t, onAssign }) => (
  <div className="space-y-4 p-4" data-testid="data-access-tab-companies">
    <h3 className="text-base font-medium">{t('dataAccess.tabs.companies.placeholderTitle')}</h3>
    <p className="text-sm text-text-secondary">{t('dataAccess.tabs.placeholderDescription')}</p>
    <Button
      variant="primary"
      onClick={() => onAssign('COMPANY')}
      data-testid="data-access-assign-company"
    >
      {t('dataAccess.action.assign')}
    </Button>
  </div>
);

export default CompaniesTab;
