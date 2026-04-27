import React from 'react';
import {
  PageLayout,
  Tabs,
  type TabItem,
  createPageLayoutBreadcrumbItems,
  createPageLayoutPreset,
  HoverDescription,
} from '@mfe/design-system';
import { useDataAccessI18n } from '../../i18n/useDataAccessI18n';
import { useAccessI18n } from '../../i18n/useAccessI18n';
import type { ScopeKind } from '../../entities/data-access-scope';
import CompaniesTab from './tabs/CompaniesTab';
import ProjectsTab from './tabs/ProjectsTab';
import DepotsTab from './tabs/DepotsTab';
import BranchesTab from './tabs/BranchesTab';
import AssignmentsTab from './tabs/AssignmentsTab';
import ScopeAssignModal from '../../widgets/scope-assign-modal/ScopeAssignModal';

const DataAccessPage: React.FC = () => {
  const { t, ready } = useDataAccessI18n();
  const { formatDate } = useAccessI18n();
  const [assignTarget, setAssignTarget] = React.useState<ScopeKind | null>(null);

  const handleAssign = React.useCallback((kind: ScopeKind) => {
    setAssignTarget(kind);
  }, []);

  const breadcrumbs = React.useMemo(
    () =>
      createPageLayoutBreadcrumbItems([
        { title: t('dataAccess.breadcrumb.management') },
        { title: t('dataAccess.breadcrumb.access') },
        { title: t('dataAccess.breadcrumb.dataAccess') },
      ]),
    [t],
  );

  const pageLayoutPreset = React.useMemo(
    () => createPageLayoutPreset({ preset: 'content-only', pageWidth: 'full' }),
    [],
  );

  const items: TabItem[] = React.useMemo(
    () => [
      {
        key: 'companies',
        label: t('dataAccess.tabs.companies'),
        content: <CompaniesTab t={t} onAssign={handleAssign} />,
      },
      {
        key: 'projects',
        label: t('dataAccess.tabs.projects'),
        content: <ProjectsTab t={t} onAssign={handleAssign} />,
      },
      {
        key: 'depots',
        label: t('dataAccess.tabs.depots'),
        content: <DepotsTab t={t} onAssign={handleAssign} />,
      },
      {
        key: 'branches',
        label: t('dataAccess.tabs.branches'),
        content: <BranchesTab t={t} onAssign={handleAssign} />,
      },
      {
        key: 'assignments',
        label: t('dataAccess.tabs.assignments'),
        content: <AssignmentsTab t={t} formatDate={formatDate} />,
      },
    ],
    [t, formatDate, handleAssign],
  );

  if (!ready) return null;

  const pageTitle = t('dataAccess.layout.title');
  const pageDescription = t('dataAccess.layout.description');

  return (
    <>
      <PageLayout
        {...pageLayoutPreset}
        title={<HoverDescription description={pageDescription}>{pageTitle}</HoverDescription>}
        description={undefined}
        classes={{
          header: '!px-6 !rounded-2xl !border !border-border-subtle shadow-sm !overflow-visible',
        }}
        breadcrumbItems={breadcrumbs}
        contentClassName="!px-0 !py-4"
      >
        <div
          className="overflow-hidden !rounded-2xl border border-border-subtle bg-surface-default shadow-sm"
          data-testid="access-data-access-page"
        >
          <Tabs items={items} defaultActiveKey="companies" variant="line" />
        </div>
      </PageLayout>

      <ScopeAssignModal
        open={assignTarget !== null}
        initialKind={assignTarget}
        onClose={() => setAssignTarget(null)}
        t={t}
      />
    </>
  );
};

export default DataAccessPage;
