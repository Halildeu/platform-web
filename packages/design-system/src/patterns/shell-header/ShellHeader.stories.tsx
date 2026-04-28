import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { ShellHeader } from './ShellHeader';
import type { ShellHeaderNavItem } from './types';

const NAV_ITEMS: ShellHeaderNavItem[] = [
  { key: '/', path: '/', label: 'Ana Sayfa' },
  { key: '/admin', path: '/admin', label: 'Yönetim' },
  { key: '/admin/reports', path: '/admin/reports', label: 'Raporlar' },
  { key: '/settings', path: '/settings', label: 'Ayarlar' },
];

const meta: Meta<typeof ShellHeader> = {
  title: 'Patterns/ShellHeader',
  component: ShellHeader,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    navItems: { control: false, description: 'Navigation items rendered in the menu bar' },
    currentPath: { control: 'text', description: 'Active route path' },
    blur: { control: 'boolean', description: 'Backdrop blur on the header' },
    onNavigate: { action: 'navigate', description: 'Fired when a nav item is clicked' },
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 240 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ShellHeader>;

export const Default: Story = {
  args: {
    navItems: NAV_ITEMS,
    currentPath: '/admin/reports',
  },
};

export const WithSlots: Story = {
  args: {
    navItems: NAV_ITEMS,
    currentPath: '/',
    startSlot: (
      <div className="flex items-center gap-2 px-2 text-sm font-bold text-action-primary">Logo</div>
    ),
    endSlot: (
      <div className="flex items-center gap-2 px-2 text-xs text-text-secondary">User Menu</div>
    ),
  },
};

export const EmptyNavigation: Story = {
  args: {
    navItems: [],
    currentPath: '/',
  },
};

export const NoBlur: Story = {
  args: {
    navItems: NAV_ITEMS,
    currentPath: '/admin',
    blur: false,
  },
};

export const SingleNav: Story = {
  args: {
    navItems: [{ key: '/home', path: '/home', label: 'Yalnız' }],
    currentPath: '/home',
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [path, setPath] = useState('/admin/reports');
    return (
      <ShellHeader navItems={NAV_ITEMS} currentPath={path} onNavigate={(next) => setPath(next)} />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // MenuBar marks the active route with [data-active="true"] on the rendered
    // anchor/button. Initial active item: /admin/reports → "Raporlar".
    const initialActive = canvasElement.querySelector('[data-active="true"]');
    await expect(initialActive?.textContent).toContain('Raporlar');
    // Click "Ana Sayfa" → ShellHeader.onNavigate fires → setPath('/') → re-render
    // updates currentPath and the active item shifts.
    const home = canvas.getByText('Ana Sayfa');
    await userEvent.click(home);
    // After re-render, "Ana Sayfa" is the active item; "Raporlar" no longer is.
    const nextActive = canvasElement.querySelector('[data-active="true"]');
    await expect(nextActive?.textContent).toContain('Ana Sayfa');
    await expect(nextActive?.textContent).not.toContain('Raporlar');
  },
};
