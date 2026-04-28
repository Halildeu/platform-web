import React from 'react';
import { ShellSidebar } from './ShellSidebar';

// SidebarProvider import removed — no longer exported from app-sidebar
// (ShellSidebar manages its own context internally).
export default {
  title: 'Patterns/ShellSidebar',
  component: ShellSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story: React.FC) => (
      <div className="flex h-screen">
        <Story />
        <div className="flex-1 p-8 text-text-secondary">Content area</div>
      </div>
    ),
  ],
};

const NAV_ITEMS = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'reports', path: '/reports', label: 'Raporlar', icon: '📄' },
  { key: 'settings', path: '/settings', label: 'Ayarlar', icon: '⚙️' },
];

export const Default = () => (
  <ShellSidebar
    brandTitle="Platform"
    brandSubtitle="v1.0"
    navItems={NAV_ITEMS}
    currentPath="/dashboard"
    onNavigate={(path) => console.log('Navigate:', path)}
  />
);

export const WithFolders = () => (
  <ShellSidebar
    brandTitle="Platform"
    navItems={NAV_ITEMS}
    currentPath="/reports"
    onNavigate={(path) => console.log('Navigate:', path)}
    folders={[
      { key: 'recent', label: 'Son Kullanılanlar', count: 5 },
      { key: 'favorites', label: 'Favoriler', count: 12 },
    ]}
  />
);
