import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { BottomSheetDrawer } from './BottomSheetDrawer';

const meta: Meta<typeof BottomSheetDrawer> = {
  title: 'Patterns/BottomSheetDrawer',
  component: BottomSheetDrawer,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'full'],
    },
    closeOnBackdrop: { control: 'boolean' },
    disableFocusTrap: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;
type Story = StoryObj<typeof BottomSheetDrawer>;

const decorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', height: 600, overflow: 'hidden' }}>
    <Story />
  </div>
);

export const Default: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Cihaz Detayi',
    subtitle: 'SRB-AIDENETIMPC',
    size: 'lg',
    children: (
      <div style={{ padding: 24, fontSize: 14 }}>
        Cihaz ayrintilari, islem butonlari ve audit kayitlari sekmeli yapida gosterilir.
      </div>
    ),
  },
  decorators: [decorator],
};

export const WithActions: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Cihaz Detayi',
    subtitle: 'HALILKOOLUB735 / Online',
    size: 'lg',
    actions: (
      <button
        type="button"
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-default)',
          fontSize: 13,
        }}
      >
        Yenile
      </button>
    ),
    children: <div style={{ padding: 24, fontSize: 14 }}>Header sag tarafinda actions slot.</div>,
  },
  decorators: [decorator],
};

export const WithFooter: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Komut Onayi',
    children: <div style={{ padding: 24, fontSize: 14 }}>Footer alaninda primary action.</div>,
    footer: (
      <>
        <button
          type="button"
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid var(--border-default)',
            fontSize: 13,
          }}
        >
          Iptal
        </button>
        <button
          type="button"
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            background: 'var(--color-primary)',
            color: 'white',
            fontSize: 13,
          }}
        >
          Gonder
        </button>
      </>
    ),
    size: 'md',
  },
  decorators: [decorator],
};

export const SmallSize: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Compact Sheet',
    size: 'sm',
    children: <div style={{ padding: 24, fontSize: 14 }}>50vh max height.</div>,
  },
  decorators: [decorator],
};

export const FullSize: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Full-Height Sheet',
    size: 'full',
    children: <div style={{ padding: 24, fontSize: 14 }}>95vh max height (near full screen).</div>,
  },
  decorators: [decorator],
};
