import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DetailDrawer } from './DetailDrawer';

const meta: Meta<typeof DetailDrawer> = {
  title: 'Patterns/DetailDrawer',
  component: DetailDrawer,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['md', 'lg', 'xl', 'full'],
    },
    closeOnBackdrop: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof DetailDrawer>;

export const Default: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Kayit Detayi',
    subtitle: 'ID: 12345',
    sections: [
      {
        key: 'info',
        title: 'Genel Bilgi',
        content: <p style={{ fontSize: 14 }}>Kayit hakkinda genel bilgiler burada gorunur.</p>,
      },
      {
        key: 'history',
        title: 'Gecmis',
        content: <p style={{ fontSize: 14 }}>Degisiklik gecmisi bu bolumde listelenir.</p>,
      },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: 500, overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
};

export const WithFooter: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Belge Detayi',
    children: <p style={{ fontSize: 14, padding: 16 }}>Belge icerigi burada gorunur.</p>,
    footer: (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
        <button
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid var(--border-default)',
            fontSize: 13,
          }}
        >
          Kapat
        </button>
      </div>
    ),
    size: 'lg',
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: 500, overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
};

export const WithActions: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Detail with Actions',
    sections: [{ key: 'info', title: 'Info', content: <p>Content</p> }],
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: 500, overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Codex 019dde0c iter-44 — `leading` slot accepts any decorative or
 * contextual visual placed before the title content. The slot is
 * symmetric with `FormDrawer.leading` (iter-43) so consumers can swap
 * primitives without changing the leading content shape. This story
 * exercises the layout interaction that's actually risky: leading +
 * title + tags + actions on the same header row.
 */
export const WithLeadingAndTags: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'ADMIN',
    subtitle: 'Sistem rolu — tam yetki',
    leading: (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          color: 'var(--text-secondary)',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </span>
    ),
    tags: (
      <>
        <span
          style={{
            padding: '2px 8px',
            background: 'var(--state-warning-bg)',
            color: 'var(--state-warning-text)',
            borderRadius: 12,
            fontSize: 11,
          }}
        >
          Sistem
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: 'var(--surface-muted)',
            color: 'var(--text-secondary)',
            borderRadius: 12,
            fontSize: 11,
          }}
        >
          12 uye
        </span>
      </>
    ),
    actions: (
      <button
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-default)',
          background: 'transparent',
          fontSize: 13,
        }}
      >
        Duzenle
      </button>
    ),
    sections: [
      { key: 'permissions', title: 'Yetkiler', content: <p>USER_MANAGEMENT, AUDIT, REPORT...</p> },
      { key: 'members', title: 'Uyeler', content: <p>12 kullanici</p> },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: 500, overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
};
