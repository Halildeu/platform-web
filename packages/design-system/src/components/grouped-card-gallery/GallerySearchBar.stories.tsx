import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { GallerySearchBar } from './GallerySearchBar';

const meta: Meta<typeof GallerySearchBar> = {
  title: 'Components/GroupedCardGallery/GallerySearchBar',
  component: GallerySearchBar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    placeholder: { control: 'text', description: 'Placeholder shown when input is empty' },
    summary: { control: 'text', description: 'Optional summary line below the input' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 420, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof GallerySearchBar>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <GallerySearchBar
        value={value}
        onChange={setValue}
        placeholder="Rapor ara..."
        summary="12 rapor"
      />
    );
  },
};

export const WithValue: Story = {
  render: () => {
    const [value, setValue] = useState('finans');
    return (
      <GallerySearchBar
        value={value}
        onChange={setValue}
        placeholder="Rapor ara..."
        summary="3 / 12 sonuc"
      />
    );
  },
};

export const NoSummary: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return <GallerySearchBar value={value} onChange={setValue} placeholder="Sadece ara..." />;
  },
};

export const LongSummary: Story = {
  render: () => {
    const [value, setValue] = useState('rapor');
    return (
      <GallerySearchBar
        value={value}
        onChange={setValue}
        placeholder="Ara..."
        summary="12 rapor · 4 dashboard · 3 sayfa · 2 kullanıcı"
      />
    );
  },
};

export const CustomPlaceholder: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <GallerySearchBar
        value={value}
        onChange={setValue}
        placeholder="Kullanıcı ya da rapor ara..."
        summary="0 sonuç"
      />
    );
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState('');
    return (
      <GallerySearchBar
        value={value}
        onChange={setValue}
        placeholder="Test placeholder"
        summary={`${value.length} karakter`}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText('Test placeholder');
    await expect(input).toBeInTheDocument();
    await userEvent.type(input, 'finans');
    await expect(input).toHaveValue('finans');
    // After typing, the summary updates to "6 karakter" — the input renders its
    // own clear button (X) when value has length.
    const clearBtn = canvas.getByRole('button', { name: /Clear/i });
    await expect(clearBtn).toBeInTheDocument();
    await userEvent.click(clearBtn);
    await expect(input).toHaveValue('');
  },
};
