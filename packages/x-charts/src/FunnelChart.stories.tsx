/**
 * Storybook stories — FunnelChart
 *
 * Per-component story file (sibling to FunnelChart.tsx) for the M4
 * Quality Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FunnelChart } from './FunnelChart';

const conversionData = [
  { name: 'Ziyaret', value: 5000 },
  { name: 'Kayıt', value: 3000 },
  { name: 'Deneme', value: 1500 },
  { name: 'Satın Alma', value: 500 },
];

const meta: Meta<typeof FunnelChart> = {
  title: 'x-charts/FunnelChart',
  component: FunnelChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] },
    sort: { control: 'inline-radio', options: ['descending', 'ascending', 'none'] },
    funnelAlign: { control: 'inline-radio', options: ['left', 'center', 'right'] },
    animate: { control: 'boolean' },
    showLabels: { control: 'boolean' },
    showLegend: { control: 'boolean' },
    showConversion: { control: 'boolean' },
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
type Story = StoryObj<typeof FunnelChart>;

export const Default: Story = {
  args: {
    data: conversionData,
    title: 'Dönüşüm Hunisi',
    showConversion: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Horizontal: Story = {
  args: {
    data: conversionData,
    title: 'Yatay Huni',
    orientation: 'horizontal',
    showLabels: true,
    size: 'lg',
  },
};

export const Ascending: Story = {
  args: {
    data: conversionData,
    title: 'Artan Sıralama',
    sort: 'ascending',
    showLabels: true,
    size: 'lg',
  },
};

export const SingleStage: Story = {
  args: {
    data: [{ name: 'Tek Aşama', value: 100 }],
    title: 'Tek Aşama',
    showLabels: true,
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
