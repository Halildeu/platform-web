import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { GroupedCardGallery } from './GroupedCardGallery';
import type { GalleryItem } from './types';

const meta: Meta<typeof GroupedCardGallery> = {
  title: 'Components/GroupedCardGallery/GroupedCardGallery',
  component: GroupedCardGallery,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    items: {
      control: false,
      description: 'Items rendered inside the gallery, grouped by `groupBy`',
    },
    groupBy: { control: 'text', description: 'Field used for grouping' },
    searchPlaceholder: { control: 'text', description: 'Placeholder text for the search input' },
    onItemClick: { action: 'itemClick', description: 'Fired when a card is clicked' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 1024, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof GroupedCardGallery>;

const sampleItems: GalleryItem[] = [
  {
    id: '1',
    title: 'Gelir Tablosu',
    group: 'Finans',
    description: 'Aylik gelir ozeti',
    icon: '📊',
    tags: ['finans', 'rapor'],
  },
  {
    id: '2',
    title: 'Bilanço',
    group: 'Finans',
    description: 'Varlık ve yükümlülükler',
    icon: '📋',
    tags: ['finans'],
  },
  {
    id: '3',
    title: 'Bordro Raporu',
    group: 'HR',
    description: 'Calisan maas detaylari',
    icon: '👤',
    tags: ['hr', 'bordro'],
  },
  {
    id: '4',
    title: 'İzin Takibi',
    group: 'HR',
    description: 'Yillik izin durumu',
    icon: '📅',
    tags: ['hr', 'izin'],
  },
  {
    id: '5',
    title: 'Stok Durumu',
    group: 'Operasyon',
    description: 'Depo stok seviyeleri',
    icon: '📦',
    tags: ['stok'],
  },
  {
    id: '6',
    title: 'Siparis Takibi',
    group: 'Operasyon',
    description: 'Acik siparisler',
    icon: '🚚',
    tags: ['siparis'],
    badge: { label: 'Yeni', tone: 'primary' },
  },
];

export const Default: Story = {
  args: {
    items: sampleItems,
    groupBy: 'group',
    searchPlaceholder: 'Rapor ara...',
    defaultExpandedGroups: ['Finans', 'HR'],
  },
};

export const CustomGroupOrder: Story = {
  args: {
    items: sampleItems,
    groupBy: 'group',
    searchPlaceholder: 'Ara...',
    groupOrder: ['Operasyon', 'Finans', 'HR'],
    defaultExpandedGroups: ['Operasyon'],
    columns: { sm: 1, md: 2, lg: 2, xl: 3 },
  },
};

export const EmptyItems: Story = {
  args: {
    items: [],
    groupBy: 'group',
    searchPlaceholder: 'Hicbir öğe yok...',
  },
};

export const AllExpanded: Story = {
  args: {
    items: sampleItems,
    groupBy: 'group',
    searchPlaceholder: 'Hızlı ara...',
    defaultExpandedGroups: ['Finans', 'HR', 'Operasyon'],
  },
};

export const SingleColumnDense: Story = {
  args: {
    items: sampleItems,
    groupBy: 'group',
    searchPlaceholder: 'Mobil görünüm...',
    defaultExpandedGroups: ['Finans'],
    columns: { sm: 1, md: 1, lg: 1, xl: 1 },
  },
};

export const Interactive: Story = {
  args: {
    items: sampleItems,
    groupBy: 'group',
    searchPlaceholder: 'Filtre yaz...',
    defaultExpandedGroups: ['Finans', 'HR', 'Operasyon'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Search input should render
    const search = canvas.getByPlaceholderText('Filtre yaz...');
    await expect(search).toBeInTheDocument();
    // Initial: all 6 items rendered (all groups expanded), inc. "Gelir Tablosu"
    // (Finans group) and "Bordro Raporu" (HR group).
    await expect(canvas.getByText('Gelir Tablosu')).toBeInTheDocument();
    await expect(canvas.getByText('Bordro Raporu')).toBeInTheDocument();
    // Type "bordro" → after the 300ms debounce, the filter narrows to HR.
    await userEvent.type(search, 'bordro');
    // Wait for the debounce to actually fire: "Gelir Tablosu" must disappear.
    // (findByText alone wouldn't do — Bordro Raporu was already in the DOM.)
    await waitFor(() => expect(canvas.queryByText('Gelir Tablosu')).not.toBeInTheDocument(), {
      timeout: 1500,
    });
    // After debounce, "Bordro Raporu" still rendered.
    await expect(canvas.getByText('Bordro Raporu')).toBeInTheDocument();
  },
};
