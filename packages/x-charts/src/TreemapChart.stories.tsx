/**
 * Storybook stories — TreemapChart
 *
 * Per-component story file (sibling to TreemapChart.tsx) for the M4
 * Quality Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TreemapChart } from './TreemapChart';

const hierarchicalData = [
  {
    name: 'Satış',
    value: 100,
    children: [
      { name: 'Online', value: 60 },
      { name: 'Mağaza', value: 40 },
    ],
  },
  {
    name: 'Pazarlama',
    value: 80,
    children: [
      { name: 'Dijital', value: 50 },
      { name: 'Basılı', value: 30 },
    ],
  },
];

const meta: Meta<typeof TreemapChart> = {
  title: 'x-charts/TreemapChart',
  component: TreemapChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    showLegend: { control: 'boolean' },
    showBreadcrumb: { control: 'boolean' },
    leafDepth: { control: { type: 'number', min: 1, max: 5 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, height: 360, background: '#ffffff' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof TreemapChart>;

export const Default: Story = {
  args: {
    data: hierarchicalData,
    title: 'Departman Bütçesi',
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const FlatTree: Story = {
  args: {
    data: [
      { name: 'A', value: 40 },
      { name: 'B', value: 30 },
      { name: 'C', value: 20 },
      { name: 'D', value: 10 },
    ],
    title: 'Düz Hiyerarşi',
    size: 'lg',
  },
};

export const DeepLeafDepth: Story = {
  args: {
    data: hierarchicalData,
    title: 'Derin Yaprak Görünümü',
    leafDepth: 3,
    showBreadcrumb: true,
    size: 'lg',
  },
};

export const SingleNode: Story = {
  args: {
    data: [{ name: 'Tek Düğüm', value: 100 }],
    title: 'Tek Veri Noktası',
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Empty Data',
  args: {
    data: [],
    title: 'Veri yok durumu',
    size: 'md',
  },
};
