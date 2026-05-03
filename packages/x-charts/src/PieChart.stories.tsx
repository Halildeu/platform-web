/**
 * Storybook stories — PieChart
 *
 * Per-component story file (sibling to PieChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { PieChart } from './PieChart';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs'];
const values1 = [320, 332, 301, 334, 390];
const sampleData = categories.map((c, i) => ({ label: c, value: values1[i] }));

const meta: Meta<typeof PieChart> = {
  title: 'x-charts/PieChart',
  component: PieChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    donut: { control: 'boolean' },
    showLabels: { control: 'boolean' },
    showLegend: { control: 'boolean' },
    showPercentage: { control: 'boolean' },
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
type Story = StoryObj<typeof PieChart>;

export const Default: Story = {
  args: {
    data: sampleData,
    title: 'Oran Dağılımı',
    showLabels: true,
    showPercentage: true,
    donut: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const SolidPie: Story = {
  args: {
    data: sampleData,
    title: 'Klasik Pasta Grafik',
    donut: false,
    showLabels: true,
    showPercentage: true,
    size: 'lg',
  },
};

export const WithLegend: Story = {
  args: {
    data: sampleData,
    title: 'Gösterge ile Pasta',
    donut: true,
    showLegend: true,
    showLabels: false,
    size: 'lg',
  },
};

export const SingleSlice: Story = {
  args: {
    data: [{ label: 'Tek Dilim', value: 100 }],
    title: 'Tek Veri Noktası',
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
