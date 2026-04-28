import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { ShellSidebar } from './ShellSidebar';
import type { ShellSidebarNavItem } from './types';

const NAV_ITEMS: ShellSidebarNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <span aria-hidden>📊</span>, href: '/dashboard' },
  { key: 'reports', label: 'Raporlar', icon: <span aria-hidden>📄</span>, href: '/reports' },
  { key: 'settings', label: 'Ayarlar', icon: <span aria-hidden>⚙️</span>, href: '/settings' },
];

const meta: Meta<typeof ShellSidebar> = {
  title: 'Patterns/ShellSidebar',
  component: ShellSidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    navItems: { control: false, description: 'Navigation entries rendered in the sidebar' },
    activeKey: { control: 'text', description: 'Currently active nav item key' },
    brandTitle: { control: 'text' },
    brandSubtitle: { control: 'text' },
    showFullscreenToggle: { control: 'boolean' },
    defaultMode: {
      control: 'inline-radio',
      options: ['expanded', 'collapsed'],
      description: 'Initial collapse state',
    },
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen">
        <Story />
        <div className="flex-1 p-8 text-text-secondary">Content area</div>
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ShellSidebar>;

export const Default: Story = {
  args: {
    brandTitle: 'Platform',
    brandSubtitle: 'v1.0',
    navItems: NAV_ITEMS,
    activeKey: 'dashboard',
  },
};

export const WithFolders: Story = {
  args: {
    brandTitle: 'Platform',
    navItems: NAV_ITEMS,
    activeKey: 'reports',
    folderItems: [
      { key: 'recent', label: 'Son Kullanılanlar', count: 5 },
      { key: 'favorites', label: 'Favoriler', count: 12 },
    ],
  },
};

export const CollapsedDefault: Story = {
  args: {
    brandTitle: 'Platform',
    navItems: NAV_ITEMS,
    activeKey: 'settings',
    defaultMode: 'collapsed',
  },
};

export const WithStatusIndicator: Story = {
  args: {
    brandTitle: 'Platform',
    navItems: NAV_ITEMS,
    activeKey: 'dashboard',
    statusIndicator: { status: 'success', label: 'Sistem aktif', pulse: true },
  },
};

export const NoFullscreenToggle: Story = {
  args: {
    brandTitle: 'Platform',
    navItems: NAV_ITEMS,
    activeKey: 'dashboard',
    showFullscreenToggle: false,
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    // Interactive story uses href-less nav items so AppSidebarNavItem renders
    // as a <button> (the branch that wires onClick) instead of an <a>. This
    // makes onNavigate fire on userEvent.click and lets us assert the active
    // state transition deterministically.
    const CLICKABLE_NAV: ShellSidebarNavItem[] = [
      { key: 'dashboard', label: 'Dashboard', icon: <span aria-hidden>📊</span> },
      { key: 'reports', label: 'Raporlar', icon: <span aria-hidden>📄</span> },
      { key: 'settings', label: 'Ayarlar', icon: <span aria-hidden>⚙️</span> },
    ];
    const [activeKey, setActiveKey] = useState('dashboard');
    return (
      <ShellSidebar
        brandTitle="Platform"
        navItems={CLICKABLE_NAV}
        activeKey={activeKey}
        onNavigate={(key) => setActiveKey(key)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Initial state: "Dashboard" is rendered as a <button> (no href branch).
    const buttons = canvas.getAllByRole('button');
    const dashboardBtn = buttons.find((b) => b.textContent?.includes('Dashboard'));
    await expect(dashboardBtn).toBeDefined();
    // Reports button is also rendered.
    const reportsBtn = buttons.find((b) => b.textContent?.includes('Raporlar'));
    await expect(reportsBtn).toBeDefined();
    // Click Raporlar → onNavigate('reports') → setActiveKey state update.
    await userEvent.click(reportsBtn!);
    // After re-render, the Raporlar button is marked active via aria-current="page".
    await expect(reportsBtn).toHaveAttribute('aria-current', 'page');
    // Dashboard is no longer active.
    await expect(dashboardBtn).not.toHaveAttribute('aria-current', 'page');
  },
};
