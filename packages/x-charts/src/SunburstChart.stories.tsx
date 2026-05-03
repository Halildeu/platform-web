/**
 * Storybook stories — SunburstChart
 *
 * Per-component story file (sibling to SunburstChart.tsx) for the M4
 * Quality Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SunburstChart } from './SunburstChart';

const hierarchicalData = [
  {
    name: 'Türkiye',
    children: [
      {
        name: 'İstanbul',
        children: [
          { name: 'Kadıköy', value: 50 },
          { name: 'Beşiktaş', value: 30 },
        ],
      },
      {
        name: 'Ankara',
        children: [
          { name: 'Çankaya', value: 40 },
          { name: 'Keçiören', value: 20 },
        ],
      },
    ],
  },
];

const meta: Meta<typeof SunburstChart> = {
  title: 'x-charts/SunburstChart',
  component: SunburstChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    sort: { control: 'inline-radio', options: ['desc', 'asc', null] },
    highlightPolicy: {
      control: 'inline-radio',
      options: ['descendant', 'ancestor', 'self', 'none'],
    },
    animate: { control: 'boolean' },
    showLegend: { control: 'boolean' },
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
type Story = StoryObj<typeof SunburstChart>;

export const Default: Story = {
  args: {
    data: hierarchicalData,
    title: 'Hiyerarşik Dağılım',
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const FlatHierarchy: Story = {
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

export const AncestorHighlight: Story = {
  args: {
    data: hierarchicalData,
    title: 'Atayı Vurgulama',
    highlightPolicy: 'ancestor',
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
