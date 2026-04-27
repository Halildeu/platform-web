import React from 'react';
import { Button } from '@mfe/design-system';
import type { ScopeKind } from '../../../entities/data-access-scope';

export interface ProjectsTabProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  onAssign: (kind: ScopeKind) => void;
}

const ProjectsTab: React.FC<ProjectsTabProps> = ({ t, onAssign }) => (
  <div className="space-y-4 p-4" data-testid="data-access-tab-projects">
    <h3 className="text-base font-medium">{t('dataAccess.tabs.projects.placeholderTitle')}</h3>
    <p className="text-sm text-text-secondary">{t('dataAccess.tabs.placeholderDescription')}</p>
    <Button
      variant="primary"
      onClick={() => onAssign('PROJECT')}
      data-testid="data-access-assign-project"
    >
      {t('dataAccess.action.assign')}
    </Button>
  </div>
);

export default ProjectsTab;
