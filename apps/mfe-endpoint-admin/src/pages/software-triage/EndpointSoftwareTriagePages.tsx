import React from 'react';
import EndpointDevicesPage, {
  type EndpointDevicesPagePreset,
} from '../devices/EndpointDevicesPage';

const numberGreaterThanZero = (field: string): Record<string, unknown> => ({
  [field]: {
    filterType: 'number',
    type: 'greaterThan',
    filter: 0,
  },
});

const setFilter = (field: string, values: readonly string[]): Record<string, unknown> => ({
  [field]: {
    filterType: 'set',
    values: [...values],
  },
});

export const OUTDATED_SOFTWARE_LIST_PRESET: EndpointDevicesPagePreset = {
  gridId: 'endpoint-admin-outdated-software-list',
  dataTestId: 'endpoint-admin-outdated-software-list-page',
  headingKey: 'endpointAdmin.softwareTriage.outdated.title',
  subtitleKey: 'endpointAdmin.softwareTriage.outdated.subtitle',
  exportFileBaseName: 'endpoint-outdated-software',
  exportSheetName: 'Outdated Software',
  quickFilterPlaceholderKey: 'endpointAdmin.softwareTriage.quickFilterPlaceholder',
  forceVisibleColumns: ['outdated_upgrade_count', 'outdated_upgrade_truncated'],
  initialFilterModel: numberGreaterThanZero('outdated_upgrade_count'),
};

export const PROHIBITED_SOFTWARE_LIST_PRESET: EndpointDevicesPagePreset = {
  gridId: 'endpoint-admin-prohibited-software-list',
  dataTestId: 'endpoint-admin-prohibited-software-list-page',
  headingKey: 'endpointAdmin.softwareTriage.prohibited.title',
  subtitleKey: 'endpointAdmin.softwareTriage.prohibited.subtitle',
  exportFileBaseName: 'endpoint-prohibited-software',
  exportSheetName: 'Prohibited Software',
  quickFilterPlaceholderKey: 'endpointAdmin.softwareTriage.quickFilterPlaceholder',
  forceVisibleColumns: ['prohibited_status', 'prohibited_decision', 'prohibited_findings_count'],
  initialFilterModel: numberGreaterThanZero('prohibited_findings_count'),
};

export const SOFTWARE_DIFF_LIST_PRESET: EndpointDevicesPagePreset = {
  gridId: 'endpoint-admin-software-diff-list',
  dataTestId: 'endpoint-admin-software-diff-list-page',
  headingKey: 'endpointAdmin.softwareTriage.diff.title',
  subtitleKey: 'endpointAdmin.softwareTriage.diff.subtitle',
  exportFileBaseName: 'endpoint-software-diff',
  exportSheetName: 'Software Diff',
  quickFilterPlaceholderKey: 'endpointAdmin.softwareTriage.quickFilterPlaceholder',
  forceVisibleColumns: [
    'software_diff_status',
    'software_diff_added_count',
    'software_diff_removed_count',
    'software_diff_version_changed_count',
    'outdated_diff_status',
    'outdated_diff_added_count',
    'outdated_diff_removed_count',
    'outdated_diff_version_changed_count',
    'outdated_diff_available_version_bumped_count',
  ],
  initialFilterModel: setFilter('software_diff_status', ['OK']),
};

export const EndpointOutdatedSoftwareListPage: React.FC = () => (
  <EndpointDevicesPage preset={OUTDATED_SOFTWARE_LIST_PRESET} />
);

export const EndpointProhibitedSoftwareListPage: React.FC = () => (
  <EndpointDevicesPage preset={PROHIBITED_SOFTWARE_LIST_PRESET} />
);

export const EndpointSoftwareDiffListPage: React.FC = () => (
  <EndpointDevicesPage preset={SOFTWARE_DIFF_LIST_PRESET} />
);
